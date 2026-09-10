// Real transactions; no Variant C, storage injection or synthetic empty races.
const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');
const fs=require('node:fs');
const {generateRaceKey,decryptVote}=require('../lib/owner-voting/backend.cjs');
const {encryptVote,signingDomain}=require('../lib/owner-voting/ballot.cjs');
const {intentTypes}=require('../lib/owner-voting/signed-ballot.cjs');
const {buildRelayedResult}=require('../lib/owner-voting/signed-backend.cjs');
const DAY=86400;
describe('V7 sponsored full-season benchmark',function(){
 this.timeout(3600000);
 for(const size of [5,10,20,25])it(`measures 10 full races x2200 voters x4800 VP, batch ${size}`,async()=>{
  const [owner,backend,team,relayer]=await ethers.getSigners(),stages={},races=[];
  async function record(stage,promise){const r=await(await promise).wait();const s=stages[stage]||={gas:0n,tx:0,max:0n,min:null};s.gas+=r.gasUsed;s.tx++;s.max=s.max>r.gasUsed?s.max:r.gasUsed;s.min=s.min===null||s.min>r.gasUsed?r.gasUsed:s.min;return r;}
  const g=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
  const usdc=await(await ethers.getContractFactory('MockUSDC')).deploy();
  const sale=await(await ethers.getContractFactory('HOFGenesisSale')).deploy(usdc.target,g.target,(await time.latest())+DAY,backend.address,owner.address,team.address);
  await g.setSaleContract(sale.target);await g.setTeamWallet(team.address);await usdc.mint(owner.address,60000_000000n);
  await record('initial approval',usdc.approve(sale.target,60000_000000n));
  await record('mint',g.ownerMint(owner.address,111));for(let i=0;i<20;i++)await record('mint',sale.mint(100));await record('mint',g.ownerMint(team.address,111));
  const wallets=[],powers=[];
  for(let i=0;i<2200;i++){
   // Test-only deterministic signing identities, never live funds or secret env.
   const w=new ethers.Wallet(ethers.id(`HOF local benchmark signer ${i}`));wallets.push(w);
   const from=i+23<=2111?owner:team;await record('distribution',g.connect(from).transferFrom(from.address,w.address,i+23));powers.push(await g.votingPowerOf(i+23));
  }
  expect(powers.reduce((a,b)=>a+b,0n)).eq(4800n);
  const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(g.target,owner.address,backend.address,team.address);
  const rewards=await(await ethers.getContractFactory('HOFSeasonRewards')).deploy(usdc.target,board.target);await usdc.mint(rewards.target,4000_000000n);
  const key=await generateRaceKey(),start=(await time.latest())+100,chainId=(await ethers.provider.getNetwork()).chainId,abi=ethers.AbiCoder.defaultAbiCoder();
  const seasonScores=Array(2200).fill(0);
  for(let r=0;r<10;r++){
   const opening=start+r*3*DAY,race=await(await ethers.getContractFactory('HOFRelayedRace')).deploy(g.target,opening,team.address,owner.address,backend.address,key.publicKey);
   await record('race deployment',race.deploymentTransaction());await record('race registration',board.registerRace(race.target));await time.increaseTo(opening);
   const ctxBase={chainId,race:race.target,keyId:ethers.keccak256(key.publicKey)},packets=[];
   const before=stages.vote?.gas||0n;
   for(let i=0;i<2200;i++){
    const ctx={...ctxBase,wallet:wallets[i].address},horse=(i+r)%22+1,ballot=await encryptVote(ctx,horse,key.publicKey);
    // Genuine admission decryption; fixed benchmark inventory permits cached context.
    expect((await decryptVote(ctx,ballot,key.privateKey)).horse).eq(horse);
    const intent={voter:wallets[i].address,race:race.target,nonce:0,deadline:opening+DAY,commitment:ballot.commitment,ciphertextHash:ethers.keccak256(ballot.ciphertext),tokenIdsHash:ethers.keccak256(abi.encode(['uint256[]'],[[i+23]])),vp:powers[i],topUp:false};
    packets.push({intent,tokenIds:[i+23],ciphertext:ballot.ciphertext,signature:await wallets[i].signTypedData(signingDomain(ctx),intentTypes,intent),admission:await backend.signTypedData(signingDomain(ctx),intentTypes,intent)});
    if(packets.length===size){await record('vote',race.connect(relayer).submitBatch(packets));packets.length=0;}
   }
   expect(packets.length).eq(0);expect(await race.ballotCount()).eq(2200n);expect(await race.totalVP()).eq(4800n);
   await time.increaseTo(opening+DAY);await record('freeze',race.freeze());const result=await buildRelayedResult(race,backend,key.privateKey);
   await record('propose',race.proposeResult(result.totals,result.root,result.signature));
   for(let i=0;i<2200;i+=25)await record('scoring',race.prepareScores(i,result.points.slice(i,i+25),result.proofs.slice(i,i+25)));
   await record('race finalization',race.finalize());for(let i=0;i<2200;i++)seasonScores[i]+=result.points[i];
   for(let i=0;i<2200;i+=25)await record('Community indexing',board.indexParticipants(r,25));
   races.push({race:r+1,voters:2200,vp:4800,voteGas:String(stages.vote.gas-before)});
   console.log(`      MEASURED batch=${size} race=${r+1}/10 voteGas=${stages.vote.gas-before}`);
  }
  await record('Community scan begin',board.beginPrizeScan());const epoch=await board.prizeScanEpoch();
  while(await board.prizeScanCursor()<await board.prizeScanEnd())await record('Community holders',board.processPrizeHolders(epoch,await board.prizeScanCursor(),25));
  while(await board.prizeScoreCursor()<251n)await record('Community scores',board.processPrizeScores(epoch,await board.prizeScoreCursor(),25));
  await record('season finalization',board.finalizeSeason());
  const reference=wallets.map((w,i)=>({wallet:w.address,score:seasonScores[i],lowest:i+23})).sort((a,b)=>b.score-a.score||a.lowest-b.lowest).slice(0,3).map(x=>x.wallet);
  expect(Array.from(await board.getSeasonTop3(1))).deep.eq(reference);
  expect(await board.allTimePoints(wallets[0].address)).eq(BigInt(seasonScores[0]));
  await record('Community payout',rewards.payCommunitySeason(1));await expect(rewards.payCommunitySeason(1)).revertedWith('community season paid');
  const totalGas=Object.values(stages).reduce((n,s)=>n+s.gas,0n),transactions=Object.values(stages).reduce((n,s)=>n+s.tx,0);
  const initial=['initial approval','mint','distribution'];
  const report={batchSize:size,scenario:'10 populated races x 2200 signed encrypted voters, 4800 VP/race; stable Community',stages,races,totalGas,transactions,recurringGas:totalGas-initial.reduce((n,k)=>n+stages[k].gas,0n),recurringTransactions:transactions-initial.reduce((n,k)=>n+stages[k].tx,0),gasPerVote:Number(stages.vote.gas)/22000,winners:reference};
  const serialized=JSON.stringify(report,(_,v)=>typeof v==='bigint'?v.toString():v,2);
  fs.mkdirSync('docs/implementation/benchmarks',{recursive:true});fs.writeFileSync(`docs/implementation/benchmarks/sponsored-batch-${size}.json`,serialized);
  console.log('      SEASON_RESULT',serialized.replace(/\n/g,''));
  expect(stages.vote.max).lt(5000000n);expect(stages.scoring.max).lt(3000000n);
 });
});
