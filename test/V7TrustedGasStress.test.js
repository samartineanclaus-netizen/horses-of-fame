const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');
const {voteOnce}=require('../lib/owner-voting/ballot.cjs');
const {generateRaceKey,admitVote,buildResult}=require('../lib/owner-voting/backend.cjs');
const fs=require('node:fs');
const DAY=86400;

describe('V7 trusted full-supply settlement gas stress',function(){
 this.timeout(600000);
 it('settles 2200 real encrypted votes and all Community prizes in resumable capped batches',async()=>{
  const [owner,backend,team]=await ethers.getSigners();
  const g=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
  const usdc=await(await ethers.getContractFactory('MockUSDC')).deploy();
  const sale=await(await ethers.getContractFactory('HOFGenesisSale')).deploy(usdc.target,g.target,(await time.latest())+DAY,backend.address,owner.address,team.address);
  await g.setSaleContract(sale.target);await g.setTeamWallet(team.address);
  await usdc.mint(owner.address,60000n*1000000n);await usdc.approve(sale.target,60000n*1000000n);
  await g.ownerMint(owner.address,111);
  for(let i=0;i<20;i++)await sale.mint(100);
  await g.ownerMint(team.address,111);
  const wallets=[];
  for(let id=23;id<=2222;id++){
   const holder=ethers.getAddress('0x'+(100000+id-23).toString(16).padStart(40,'0'));
   const from=id<=2111?owner:team;
   await g.connect(from).transferFrom(from.address,holder,id);
   await ethers.provider.send('hardhat_setBalance',[holder,'0x56BC75E2D63100000']);
   wallets.push(await ethers.getImpersonatedSigner(holder));
  }
  expect(await g.totalSupply()).eq(2222n);
  const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(g.target,owner.address,backend.address,team.address);
  const key=await generateRaceKey(),start=(await time.latest())+100;
  const race=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(g.target,start,team.address,owner.address,backend.address,key.publicKey);
  await board.registerRace(race.target);
  for(let i=1;i<10;i++){
   const later=await(await ethers.getContractFactory('TrustedRaceGasFixture')).deploy(g.target,owner.address,backend.address,team.address,start+i*3*DAY,0);
   await board.registerRace(later.target);
  }
  await time.increaseTo(start);
  // All choose #22: every wallet gets nonzero points, forcing cold SSTOREs.
  // Exact rarity VP distribution and full ciphertext/admission path, no storage injection.
  for(let i=0;i<2200;i++) await voteOnce(race,wallets[i],22,[23+i],r=>admitVote(race,backend,key.privateKey,r));
  expect(await race.ballotCount()).eq(2200n);expect(await race.totalVP()).eq(4800n);
  await time.increaseTo(start+DAY);
  const gas=[];
  async function measure(stage,tx){const receipt=await(await tx).wait();gas.push({stage,gas:receipt.gasUsed.toString()});expect(receipt.gasUsed,stage).lt(3000000n);return receipt;}
  await measure('freeze',race.freeze());
  const result=await buildResult(race,backend,key.privateKey);
  await measure('propose',race.proposeResult(result.totals,result.root,result.signature));
  await expect(race.prepareScores(0,result.points.slice(0,26),result.proofs.slice(0,26))).revertedWith('bad batch');
  await expect(board.indexParticipants(0,25)).revertedWith('race not finalized');
  for(let i=0;i<2200;i+=25){
   await measure('score batch',race.prepareScores(i,result.points.slice(i,i+25),result.proofs.slice(i,i+25)));
   if(i===0){
    await expect(race.prepareScores(0,result.points.slice(0,25),result.proofs.slice(0,25))).revertedWith('wrong cursor');
    await expect(race.finalize()).revertedWith('incomplete result');
    await expect(race.ranking()).revertedWith('race not finalized');
    expect(await board.seasonPoints(wallets[0].address)).eq(0n);expect(await board.allTimePoints(wallets[0].address)).eq(0n);
   }
  }
  await measure('race finalization',race.finalize());
  await expect(race.finalize()).revertedWith('no pending result');
  expect(await board.seasonPoints(wallets[2199].address)).eq(25n);
  expect(await board.allTimePoints(wallets[2199].address)).eq(25n);
  expect(Array.from(await race.ranking())).length(22);
  await time.increaseTo(start+28*DAY);
  await expect(board.indexParticipants(0,26)).revertedWith('bad batch');
  for(let i=0;i<2200;i+=25) await measure('index batch',board.indexParticipants(0,25));
  await board.indexParticipants(0,25); // exhausted cursor must not add scores twice
  expect(await board.participantCount(1)).eq(2200n);
  await measure('begin prize scan',board.beginPrizeScan());
  const epoch=await board.prizeScanEpoch();
  while(await board.prizeScanCursor()<await board.prizeScanEnd())
   await measure('holder batch',board.processPrizeHolders(epoch,await board.prizeScanCursor(),25));
  while(await board.prizeScoreCursor()<251n)
   await measure('score bucket batch',board.processPrizeScores(epoch,await board.prizeScoreCursor(),25));
  await measure('season finalization',board.finalizeSeason());
  expect(Array.from(await board.getSeasonTop3(1))).deep.eq(wallets.slice(0,3).map(w=>w.address));
  const stages=[...new Set(gas.map(x=>x.stage))].map(stage=>{
   const values=gas.filter(x=>x.stage===stage).map(x=>BigInt(x.gas));
   return {stage,transactions:values.length,min:values.reduce((a,b)=>a<b?a:b).toString(),max:values.reduce((a,b)=>a>b?a:b).toString(),total:values.reduce((a,b)=>a+b,0n).toString()};
  });
  console.log('      GAS_REPORT',JSON.stringify(stages));
  fs.writeFileSync('/tmp/hof-hardening-gas.json',JSON.stringify({scenario:'2200 real encrypted voters, full 2222 Genesis, all nonzero scores',stages,transactions:gas},null,2));
 });
 it('measures a cold prize batch with 25 distinct reachable V7 season-score buckets',async()=>{
  const [owner,backend,team]=await ethers.getSigners();
  const g=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
  await g.ownerMint(owner.address,22);
  for(let i=0;i<25;i++) await g.ownerMint(ethers.getAddress('0x'+(100000+i).toString(16).padStart(40,'0')),1);
  const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(g.target,owner.address,backend.address,team.address);
  const pairs=[],sums=new Set(),valid=[25,18,15,12,10,8,6,4,2,1,0];
  for(const a of valid)for(const b of valid)if(!sums.has(a+b)){sums.add(a+b);pairs.push([a,b]);}
  expect(pairs.length).gte(25);
  const start=(await time.latest())+100;
  for(let i=0;i<10;i++){
   const race=await(await ethers.getContractFactory('TrustedVariedScoreGasFixture')).deploy(g.target,owner.address,backend.address,team.address,start+i*3*DAY,pairs.slice(0,25).map(pair=>i<2?pair[i]:0));
   await board.registerRace(race.target);
  }
  await time.increaseTo(start+28*DAY);
  let indexMax=0n;
  for(let i=0;i<10;i++){
   const r=await(await board.indexParticipants(i,25)).wait();if(r.gasUsed>indexMax)indexMax=r.gasUsed;
   expect(r.gasUsed).lt(3000000n);
  }
  await board.beginPrizeScan();const epoch=await board.prizeScanEpoch();
  await board.processPrizeHolders(epoch,1,22);
  const receipt=await(await board.processPrizeHolders(epoch,23,25)).wait();
  expect(receipt.gasUsed).lt(3000000n);
  console.log('      GAS 25 cold distinct score buckets:',receipt.gasUsed.toString(),'index max:',indexMax.toString());
  while(await board.prizeScoreCursor()<251n)await board.processPrizeScores(epoch,await board.prizeScoreCursor(),25);
  await board.finalizeSeason();
  const ranked=pairs.slice(0,25).map((p,i)=>({i,score:p[0]+p[1]})).sort((a,b)=>b.score-a.score||a.i-b.i);
  expect(Array.from(await board.getSeasonTop3(1))).deep.eq(ranked.slice(0,3).map(x=>ethers.getAddress('0x'+(100000+x.i).toString(16).padStart(40,'0'))));
  fs.writeFileSync('/tmp/hof-hardening-gas-varied.json',JSON.stringify({scenario:'25 distinct reachable season scores, cold holder buckets',holderBatch:receipt.gasUsed.toString(),indexBatchMax:indexMax.toString()},null,2));
 });

});
