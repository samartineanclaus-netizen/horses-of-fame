const {expect}=require('chai'),{ethers}=require('hardhat'),{time}=require('@nomicfoundation/hardhat-network-helpers');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {RaceRevealService}=require('../lib/owner-voting/race-reveal-service.cjs');
const {generateRaceKey,SCORE}=require('../lib/owner-voting/backend.cjs');
const {encryptVote,signingDomain}=require('../lib/owner-voting/ballot.cjs');
const {intentTypes}=require('../lib/owner-voting/signed-ballot.cjs');
describe('V7 automatic service full race',function(){this.timeout(600000);
 it('settles all 2200 voters/4800 VP, resumes at25, hides partial boards and obeys gas cap',async()=>{
  const [owner,backend,team,relayer,treasury]=await ethers.getSigners();
  const genesis=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
  const token=await(await ethers.getContractFactory('MockUSDC')).deploy();
  const sale=await(await ethers.getContractFactory('HOFGenesisSale')).deploy(token.target,genesis.target,(await time.latest())+86400,backend.address,owner.address,team.address);
  await genesis.setSaleContract(sale.target);await genesis.setTeamWallet(team.address);await token.mint(owner.address,60000_000000n);await token.approve(sale.target,60000_000000n);
  for(const n of [25,25,25,25,11])await genesis.ownerMint(owner.address,n);
  for(let i=0;i<80;i++)await sale.mint(25);
  for(const n of [25,25,25,25,11])await genesis.ownerMint(team.address,n);
  const wallets=[],powers=[];
  for(let i=0;i<2200;i++){const w=new ethers.Wallet(ethers.id(`HOF local service stress ${i}`));wallets.push(w);const from=i+23<=2111?owner:team;await genesis.connect(from).transferFrom(from.address,w.address,i+23);powers.push(await genesis.votingPowerOf(i+23));}
  expect(powers.reduce((a,b)=>a+b,0n)).eq(4800n);
  const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(genesis.target,owner.address,backend.address,team.address),factory=await ethers.getContractAt('HOFCanonicalRaceFactory',await board.raceFactory()),key=await generateRaceKey(),opens=(await time.latest())+100;
  const receipt=await(await factory.createRace(1,1,1,opens,key.publicKey)).wait(),address=receipt.logs.map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='RaceCreated').args.race,race=await ethers.getContractAt('HOFRelayedRace',address);
  await board.registerRace(race.target);await time.increaseTo(opens);
  const chainId=(await ethers.provider.getNetwork()).chainId,abi=ethers.AbiCoder.defaultAbiCoder(),totals=Array(22).fill(0n),packets=[];
  for(let i=0;i<2200;i++){
   const ctx={chainId,race:race.target,keyId:ethers.keccak256(key.publicKey),wallet:wallets[i].address},horse=i%22+1,ballot=await encryptVote(ctx,horse,key.publicKey);totals[horse-1]+=powers[i];
   const intent={voter:wallets[i].address,race:race.target,nonce:0,deadline:opens+86400,commitment:ballot.commitment,ciphertextHash:ethers.keccak256(ballot.ciphertext),tokenIdsHash:ethers.keccak256(abi.encode(['uint256[]'],[[i+23]])),vp:powers[i],topUp:false};
   packets.push({intent,tokenIds:[i+23],ciphertext:ballot.ciphertext,signature:await wallets[i].signTypedData(signingDomain(ctx),intentTypes,intent),admission:await backend.signTypedData(signingDomain(ctx),intentTypes,intent)});
   if(packets.length===25){await race.connect(relayer).submitBatch(packets);packets.length=0;}
  }
  expect(await race.ballotCount()).eq(2200);expect(await race.totalVP()).eq(4800);
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hof-reveal-stress-')),options={raceDeploymentBlocks:{[race.target.toLowerCase()]:receipt.blockNumber},board,signer:backend,relayer,treasuryAddress:treasury.address,directory,keyFor:async()=>key.privateKey,raceAt:a=>ethers.getContractAt('HOFRelayedRace',a),factoryAt:a=>ethers.getContractAt('HOFCanonicalRaceFactory',a),ingressToken:'local-stress-ingress-'.repeat(3),allowLocal:true,lockDirectory:fs.mkdtempSync(path.join(os.tmpdir(),'hof-stress-locks-'))};
  let service=new RaceRevealService(options),restarted=false,gas=0n,max=0n,txCount=0;await time.increaseTo(opens+86400);
  try{
   for(let step=0;step<100&&!await race.finalized();step++){
    await service.tick();const pending=service.transactions.state.pending;
    if(pending?.hash){const r=await ethers.provider.getTransactionReceipt(pending.hash);gas+=r.gasUsed;max=max>r.gasUsed?max:r.gasUsed;txCount++;expect(BigInt(pending.gasLimit)).lte(5000000n);}
    if(!restarted&&await race.processedCount()===25n){expect(await board.seasonPoints(wallets[0].address)).eq(0);expect(await board.allTimePoints(wallets[0].address)).eq(0);await service.close();service=new RaceRevealService(options);restarted=true;}
   }
   expect(await race.finalized()).eq(true);expect(await race.processedCount()).eq(2200);expect(restarted).eq(true);expect(txCount).eq(91);
   const ranking=Array.from({length:22},(_,i)=>i+1).sort((a,b)=>totals[a-1]===totals[b-1]?a-b:totals[a-1]>totals[b-1]?-1:1);expect(Array.from(await race.ranking(),Number)).deep.eq(ranking);
   for(let i=0;i<2200;i++){const expected=SCORE[ranking.indexOf(i%22+1)]||0;expect(await board.seasonPoints(wallets[i].address)).eq(expected);expect(await board.allTimePoints(wallets[i].address)).eq(expected);}
   await service.tick();const nonce=await ethers.provider.getTransactionCount(backend.address);await service.tick();expect(await ethers.provider.getTransactionCount(backend.address)).eq(nonce);
   console.log(`SERVICE_STRESS voters=2200 VP=4800 settlementTransactions=${txCount} gas=${gas} maxTransactionGas=${max}`);
  }finally{await service.close();}
 });
});
