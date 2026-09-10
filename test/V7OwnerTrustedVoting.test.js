const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time,loadFixture}=require('@nomicfoundation/hardhat-network-helpers');
const {encryptVote,contextFor,signingDomain,admissionTypes,resultTypes,voteOnce}=require('../lib/owner-voting/ballot.cjs');
const {generateRaceKey,decryptVote,admitVote,buildResult,settleRace,settleSeason,treeFor,leafFor}=require('../lib/owner-voting/backend.cjs');
const {preparePrizeScan}=require('./helpers/trusted-settlement.cjs');
const DAY=86400;
let key;
async function fixture(){
 const [owner,backend,a,b,c,team,outsider]=await ethers.getSigners();
 const genesis=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
 await genesis.ownerMint(owner.address,22);
 for(const w of [a,b,c,owner,backend,team]) await genesis.ownerMint(w.address,1);
 const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(genesis.target,owner.address,backend.address,team.address);
 const opens=(await time.latest())+100;
 const race=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(genesis.target,opens,team.address,owner.address,backend.address,key.publicKey);
 await board.registerRace(race.target);
 return {owner,backend,a,b,c,team,outsider,genesis,board,race,opens};
}
async function ballot(f,w,horse=1){const ctx=await contextFor(f.race,w.address);return encryptVote(ctx,horse,key.publicKey);}
async function submit(f,w,id,horse=1){
 return voteOnce(f.race,w,horse,[id],r=>admitVote(f.race,f.backend,key.privateKey,r));
}
async function closedFixture(){
 const f=await fixture();await time.increaseTo(f.opens);
 await submit(f,f.a,23,1);await submit(f,f.b,24,2);await submit(f,f.c,25,22);
 await time.increaseTo(f.opens+DAY);await f.race.freeze();
 const result=await buildResult(f.race,f.backend,key.privateKey);return {...f,result};
}
async function propose(f){await f.race.proposeResult(f.result.totals,f.result.root,f.result.signature);}
async function finish(f){await propose(f);await f.race.prepareScores(0,f.result.points,f.result.proofs);await f.race.finalize();}
async function seasonReady(includeThird = false){
  const f=await fixture();
  for(let i=0;i<10;i++) {
   if(i>0){ f.race=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(f.genesis.target,f.opens+i*3*DAY,f.team.address,f.owner.address,f.backend.address,key.publicKey);await f.board.registerRace(f.race.target); }
   await time.increaseTo(f.opens+i*3*DAY);await submit(f,f.a,23);await submit(f,f.b,24);if(includeThird) await submit(f,f.c,25,2);
   await time.increaseTo(f.opens+i*3*DAY+DAY);await settleRace(f.race,f.backend,key.privateKey);
   await f.board.indexParticipants(i,25);
  }
 return f;
}
async function mixedSeasonReady(){ return seasonReady(true); }
describe('V7 owner-trusted encrypted voting',function(){
 this.timeout(120000);
 before(async()=>{key=await generateRaceKey();});
 it('one Vote stores encrypted data, counts VP and exposes no reveal/claim entry point',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);
  await submit(f,f.a,23,17);
  const b=await f.race.ballotAt(0);expect(b.wallet).eq(f.a.address);expect(b.vp).eq(5n);
  expect(ethers.getBytes(b.ciphertext).length).eq(446);expect(await f.race.ballotCount()).eq(1n);
  expect(f.race.interface.getFunction('revealVote')).eq(null);expect(f.board.interface.getFunction('claimRacePoints')).eq(null);
  await expect(f.race.ranking()).revertedWith('race not finalized');
  await expect(f.race.horseVP()).revertedWith('race not finalized');
  expect(await f.board.seasonPoints(f.a.address)).eq(0n);
 });
 it('rejects early voting and accepts opensAt, closesAt-1 but rejects closesAt',async()=>{
  const f={...await loadFixture(fixture)},ba=await ballot(f,f.a);
  const ctx=await contextFor(f.race,f.a.address);
  const deadline=f.opens+DAY;
  const sig=await f.backend.signTypedData(signingDomain(ctx),admissionTypes,{voter:f.a.address,commitment:ba.commitment,ciphertextHash:ethers.keccak256(ba.ciphertext),deadline});
  await time.setNextBlockTimestamp(f.opens-1);
  await expect(f.race.connect(f.a).vote(ba.commitment,ba.ciphertext,deadline,sig,[23])).revertedWith('voting closed');
  await time.setNextBlockTimestamp(f.opens);
  await f.race.connect(f.a).vote(ba.commitment,ba.ciphertext,deadline,sig,[23]);
  const bb=await ballot(f,f.b),auth=await admitVote(f.race,f.backend,key.privateKey,{wallet:f.b.address,...bb});
  await time.setNextBlockTimestamp(f.opens+DAY-1);
  await f.race.connect(f.b).vote(bb.commitment,bb.ciphertext,auth.deadline,auth.signature,[24]);
  await time.setNextBlockTimestamp(f.opens+DAY);
  await expect(f.race.connect(f.c).vote(bb.commitment,bb.ciphertext,auth.deadline,auth.signature,[25])).revertedWith('voting closed');
  await f.race.freeze();expect(await f.race.acceptedBallotCount()).eq(2n);
  const hash=await f.race.frozenRecordsHash();await f.race.freeze();expect(await f.race.frozenRecordsHash()).eq(hash);
 });
 it('blocks owner, backend and Team even with signed admission, and blocks early freeze',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);
  await expect(f.race.freeze()).revertedWith('voting not closed');
  for(const [w,id,msg] of [[f.owner,26,'owner cannot vote'],[f.backend,27,'owner cannot vote'],[f.team,28,'Team Reserve cannot vote']]) {
   const b=await ballot(f,w),ctx=await contextFor(f.race,w.address),deadline=f.opens+DAY;
   const sig=await f.backend.signTypedData(signingDomain(ctx),admissionTypes,{voter:w.address,commitment:b.commitment,ciphertextHash:ethers.keccak256(b.ciphertext),deadline});
   await expect(f.race.connect(w).vote(b.commitment,b.ciphertext,deadline,sig,[id])).revertedWith(msg);
   await expect(f.race.connect(w).addVotingPower([id])).revertedWith(msg);
  }
 });
 it('rejects invalid encryption, domain, key, horse and modified commitment in backend',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);const b=await ballot(f,f.a);
  await expect(encryptVote(await contextFor(f.race,f.a.address),23,key.publicKey)).rejectedWith('invalid ballot');
  const bad=ethers.getBytes(b.ciphertext);bad[420]^=1;
  for(const req of [{...b,ciphertext:ethers.hexlify(bad)},{...b,commitment:ethers.ZeroHash},{...b,ciphertext:'0x01'}]) {
   await expect(admitVote(f.race,f.backend,key.privateKey,{wallet:f.a.address,...req})).rejectedWith('invalid encrypted ballot');
  }
  await expect(admitVote(f.race,f.backend,key.privateKey,{wallet:f.b.address,...b})).rejectedWith('invalid encrypted ballot');
  const wrong=await generateRaceKey();await expect(admitVote(f.race,f.backend,wrong.privateKey,{wallet:f.a.address,...b})).rejectedWith('invalid encrypted ballot');
  expect(await f.race.ballotCount()).eq(0n);
 });
 it('auth binds wallet, ciphertext, deadline and chain/race; invalid NFT lists roll back',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);const b=await ballot(f,f.a),auth=await admitVote(f.race,f.backend,key.privateKey,{wallet:f.a.address,...b});
  await expect(f.race.connect(f.b).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[24])).revertedWith('invalid admission');
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline-1,auth.signature,[23])).revertedWith('invalid admission');
  await expect(f.race.connect(f.a).vote(b.commitment,'0x01',auth.deadline,auth.signature,[23])).revertedWith('bad ciphertext');
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[23,23])).revertedWith('token already used');
  expect(await f.race.tokenUsed(23)).eq(false);expect(await f.race.totalVP()).eq(0n);
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[24])).revertedWith('not token owner');
  const ctx=await contextFor(f.race,f.a.address);
  const badSig=await f.backend.signTypedData({...signingDomain(ctx),chainId:1},admissionTypes,{voter:f.a.address,commitment:b.commitment,ciphertextHash:ethers.keccak256(b.ciphertext),deadline:auth.deadline});
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,badSig,[23])).revertedWith('invalid admission');
  await f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[23]);
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[23])).revertedWith('wallet already voted');
 });
 it('preserves same-pick topups and prohibits transferred token reuse',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);await submit(f,f.a,23,1);
  const original=await f.race.ballotAt(0),hash=await f.race.recordsHash();
  await f.genesis.connect(f.b).transferFrom(f.b.address,f.a.address,24);
  await f.race.connect(f.a).addVotingPower([24]);
  const b=await f.race.ballotAt(0);expect(b.commitment).eq(original.commitment);expect(b.ciphertext).eq(original.ciphertext);expect(b.vp).eq(10n);expect(await f.race.recordsHash()).not.eq(hash);
  await f.genesis.connect(f.a).transferFrom(f.a.address,f.c.address,23);
  await expect(submit(f,f.c,23,2)).rejectedWith('token already used');
  await time.increaseTo(f.opens+DAY);await expect(f.race.connect(f.a).addVotingPower([24])).revertedWith('voting closed');
 });
 it('never finalizes incomplete/duplicate/wrong-index or altered-score outputs',async()=>{
  const f={...await loadFixture(closedFixture)};await propose(f);
  await expect(f.race.finalize()).revertedWith('incomplete result');
  await expect(f.race.prepareScores(1,[f.result.points[0]],[f.result.proofs[0]])).revertedWith('wrong cursor');
  await expect(f.race.prepareScores(0,[3],[f.result.proofs[0]])).revertedWith('invalid points');
  await expect(f.race.prepareScores(0,[18],[f.result.proofs[0]])).revertedWith('invalid score proof');
  await f.race.prepareScores(0,[f.result.points[0]],[f.result.proofs[0]]);
  expect(await f.board.seasonPoints(f.a.address)).eq(0n);expect(await f.board.allTimePoints(f.a.address)).eq(0n);
  await expect(f.race.finalize()).revertedWith('incomplete result');
  await expect(f.race.prepareScores(0,[25],[f.result.proofs[0]])).revertedWith('wrong cursor');
  await f.race.prepareScores(1,f.result.points.slice(1),f.result.proofs.slice(1));
  expect(await f.race.pointsOf(f.a.address)).eq(0n);
  await f.race.finalize();
  expect(await f.board.seasonPoints(f.a.address)).eq(25n);expect(await f.board.allTimePoints(f.a.address)).eq(25n);
  await expect(f.race.finalize()).revertedWith('no pending result');
  await expect(f.race.prepareScores(3,[],[])).revertedWith('no pending result');
  await expect(f.race.proposeResult(f.result.totals,f.result.root,f.result.signature)).revertedWith('result already proposed');
 });
 it('uses full 22 ranking, lower horse tie, exact scoring and no VP multiplier',async()=>{
  const f={...await loadFixture(closedFixture)};await finish(f);
  expect(Array.from(await f.race.ranking()).slice(0,3)).deep.eq([1n,2n,22n]);
  expect(await f.race.pointsOf(f.c.address)).eq(15n);
  for(let i=1;i<=22;i++) expect(await f.race.pointsForPosition(i)).eq(BigInt([25,18,15,12,10,8,6,4,2,1][i-1]||0));
  expect(await f.board.horsePoints(1,1)).eq(25n);expect(await f.board.horsePoints(1,0)).eq(25n);
 });
 it('rejects an omitted leaf, wrong VP sum and unauthorized result',async()=>{
  const f={...await loadFixture(closedFixture)},ctx=await contextFor(f.race,f.a.address);
  async function sign(totals,root,who=f.backend){return who.signTypedData(signingDomain(ctx),resultTypes,{recordsHash:await f.race.frozenRecordsHash(),count:3,totalVP:await f.race.totalVP(),totalsHash:ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256[22]'],[totals])),scoresRoot:root});}
  const badTotals=Array(22).fill(0);await expect(f.race.proposeResult(badTotals,f.result.root,await sign(badTotals,f.result.root))).revertedWith('VP mismatch');
  await expect(f.race.proposeResult(f.result.totals,f.result.root,await sign(f.result.totals,f.result.root,f.outsider))).revertedWith('invalid result signer');
  const tree=treeFor([leafFor(ctx,0,f.a.address,25),leafFor(ctx,1,f.b.address,18)]);
  await f.race.proposeResult(f.result.totals,tree.root,await sign(f.result.totals,tree.root));
  await f.race.prepareScores(0,[25,18],tree.proofs);
  await expect(f.race.finalize()).revertedWith('incomplete result');
 });
 it('worker is resumable, handles empty race, and fails closed before final closure',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);
  await expect(settleRace(f.race,f.backend,key.privateKey)).rejectedWith('closure not final');
  await time.increaseTo(f.opens+DAY);
  await settleRace(f.race,f.backend,key.privateKey);await settleRace(f.race,f.backend,key.privateKey);
  expect(await f.race.finalized()).eq(true);expect(Array.from(await f.race.ranking())).deep.eq(Array.from({length:22},(_,i)=>BigInt(i+1)));
 });
 it('worker resumes a partially prepared result without a voter',async()=>{
  const f={...await loadFixture(closedFixture)};await propose(f);await f.race.prepareScores(0,[25],[f.result.proofs[0]]);
  await settleRace(f.race,f.backend,key.privateKey,{batchSize:1});expect(await f.race.finalized()).eq(true);
 });
 it('malformed owner-authorized ciphertext keeps backend reveal incomplete',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);const ctx=await contextFor(f.race,f.a.address);
  const ciphertext=ethers.hexlify(new Uint8Array(446).fill(1)),commitment=ethers.keccak256('0x1234'),deadline=f.opens+DAY;
  const signature=await f.backend.signTypedData(signingDomain(ctx),admissionTypes,{voter:f.a.address,commitment,ciphertextHash:ethers.keccak256(ciphertext),deadline});
  await f.race.connect(f.a).vote(commitment,ciphertext,deadline,signature,[23]);await time.increaseTo(deadline);await f.race.freeze();
  await expect(buildResult(f.race,f.backend,key.privateKey)).rejectedWith('undecryptable accepted ballot');
  expect(await f.race.finalized()).eq(false);expect(await f.board.allTimePoints(f.a.address)).eq(0n);
 });
 it('retains live ownership tie-break and treasury rollover integration for ten races',async()=>{
  const f={...await loadFixture(seasonReady)};
  expect(await f.board.allTimePoints(f.a.address)).eq(250n);
  await f.genesis.connect(f.a).transferFrom(f.a.address,f.owner.address,23);await f.genesis.connect(f.b).transferFrom(f.b.address,f.owner.address,24);
  await settleSeason(f.board);expect(Array.from(await f.board.getSeasonTop3(1))).deep.eq(Array(3).fill(ethers.ZeroAddress));
  expect(await f.board.allTimePoints(f.a.address)).eq(250n);expect(await f.board.seasonPoints(f.a.address)).eq(0n);expect(await f.board.seasonHistory(1,f.a.address)).eq(250n);
  const usdc=await(await ethers.getContractFactory('MockUSDC')).deploy();const rewards=await(await ethers.getContractFactory('HOFSeasonRewards')).deploy(usdc.target,f.board.target);
  await usdc.mint(rewards.target,4000_000_000n);await rewards.payCommunitySeason(1);expect(await rewards.communityRolloverToChapter2()).eq(4000_000_000n);
  const anchor=Number(await f.board.previousSeasonEnd());await time.increaseTo(anchor+DAY);
  const late=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(f.genesis.target,anchor+7*DAY+1,f.team.address,f.owner.address,f.backend.address,key.publicKey);
  await expect(f.board.registerRace(late.target)).revertedWith('season gap exceeds 7 days');
  const next=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(f.genesis.target,anchor+7*DAY,f.team.address,f.owner.address,f.backend.address,key.publicKey);
  await f.board.registerRace(next.target);
 });
 it('uses current lowest token ID and preserves a sole tied nonholder behind a holder',async()=>{
  const f={...await loadFixture(seasonReady)};
  await f.genesis.connect(f.a).transferFrom(f.a.address,f.b.address,23);
  await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1)).slice(0,2)).deep.eq([f.b.address,f.a.address]);
 });
 it('keeps lowest-ID holder first when both retain NFTs',async()=>{
  const f={...await loadFixture(seasonReady)};await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1)).slice(0,2)).deep.eq([f.a.address,f.b.address]);
 });
 it('bounds winner scan by full Genesis supply and measures finalization gas',async()=>{
  const f={...await loadFixture(seasonReady)};
  await f.genesis.setSaleContract(f.owner.address);
  for(let i=0;i<20;i++) await f.genesis.saleMint(f.owner.address,100);
  await f.genesis.setTeamWallet(f.team.address);
  await f.genesis.ownerMint(f.team.address,111);
  await f.genesis.ownerMint(f.owner.address,83);
  expect(await f.genesis.totalSupply()).eq(2222n);
  await preparePrizeScan(f.board);
  const receipt=await(await f.board.finalizeSeason()).wait();
  console.log('      GAS full-supply season finalization:',receipt.gasUsed.toString());
  expect(receipt.gasUsed).lt(16000000n);
 });
 it('serves admission over HTTP without exposing decrypted ballot data',async()=>{
  const f={...await loadFixture(fixture)};await time.increaseTo(f.opens);
  const {createAdmissionServer}=require('../lib/owner-voting/service.cjs');
  const server=createAdmissionServer({race:f.race,signer:f.backend,privateKey:key.privateKey});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
   const b=await ballot(f,f.a,17);const url=`http://127.0.0.1:${server.address().port}/vote/admission`;
   const response=await fetch(url,{method:'POST',body:JSON.stringify({wallet:f.a.address,...b})});
   expect(response.status).eq(200);const auth=await response.json();expect(Object.keys(auth).sort()).deep.eq(['deadline','signature']);
   await f.race.connect(f.a).vote(b.commitment,b.ciphertext,auth.deadline,auth.signature,[23]);
   const bad=await fetch(url,{method:'POST',body:JSON.stringify({wallet:f.b.address,ciphertext:'0x00',commitment:b.commitment})});
   expect(bad.status).eq(400);expect(await bad.json()).deep.eq({error:'vote not admitted'});
  } finally {await new Promise(resolve=>server.close(resolve));}
 });

 it('settles 101 distinct wallets in bounded batches and measures gas',async()=>{
  const f={...await loadFixture(fixture)};await f.genesis.setSaleContract(f.owner.address);
  const wallets=[];
  for(let i=0;i<101;i++) {
   const address=ethers.getAddress('0x'+(100000+i).toString(16).padStart(40,'0'));
   await ethers.provider.send('hardhat_setBalance',[address,'0x56BC75E2D63100000']);
   wallets.push(await ethers.getImpersonatedSigner(address));await f.genesis.saleMint(address,1);
  }
  const opens=(await time.latest())+20;
  f.race=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(f.genesis.target,opens,f.team.address,f.owner.address,f.backend.address,key.publicKey);
  await time.increaseTo(opens);
  for(let i=0;i<101;i++) await voteOnce(f.race,wallets[i],i%22+1,[29+i],r=>admitVote(f.race,f.backend,key.privateKey,r));
  await time.increaseTo(opens+DAY);await f.race.freeze();
  const result=await buildResult(f.race,f.backend,key.privateKey);
  await f.race.proposeResult(result.totals,result.root,result.signature);
  await expect(f.race.prepareScores(0,result.points,result.proofs)).revertedWith('bad batch');
  const receipt=await(await f.race.prepareScores(0,result.points.slice(0,25),result.proofs.slice(0,25))).wait();
  console.log('      GAS 25-wallet score batch:',receipt.gasUsed.toString());
  expect(receipt.gasUsed).lt(6000000n);
  await expect(f.race.finalize()).revertedWith('incomplete result');
  for(let i=25;i<101;i+=25) await f.race.prepareScores(i,result.points.slice(i,i+25),result.proofs.slice(i,i+25));
  const final=await(await f.race.finalize()).wait();console.log('      GAS atomic race finalization:',final.gasUsed.toString());
  expect(final.gasUsed).lt(100000n);
  for(let i=0;i<101;i++) expect(await f.race.pointsOf(wallets[i].address)).eq(BigInt(result.points[i]));
 });

 it('skips tied nonholders for the next score, while unique-score nonholder stays eligible',async()=>{
  const f={...await loadFixture(mixedSeasonReady)};
  for(const [w,id] of [[f.a,23],[f.b,24],[f.c,25]]) await f.genesis.connect(w).transferFrom(w.address,f.owner.address,id);
  await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1))).deep.eq([f.c.address,ethers.ZeroAddress,ethers.ZeroAddress]);
  expect(await f.board.seasonHistory(1,f.c.address)).eq(180n);
 });
 it('rejects owner rotation, unauthorized registration and stale admissions',async()=>{
  const f={...await loadFixture(fixture)};
  await expect(f.board.transferOwnership(f.a.address)).revertedWith('immutable owner');
  await expect(f.board.renounceOwnership()).revertedWith('immutable owner');
  await expect(f.board.connect(f.a).registerRace(f.race.target)).revertedWithCustomError(f.board,'OwnableUnauthorizedAccount');
  await time.increaseTo(f.opens);const b=await ballot(f,f.a),ctx=await contextFor(f.race,f.a.address),deadline=f.opens+5;
  const sig=await f.backend.signTypedData(signingDomain(ctx),admissionTypes,{voter:f.a.address,commitment:b.commitment,ciphertextHash:ethers.keccak256(b.ciphertext),deadline});
  await time.setNextBlockTimestamp(deadline+1);
  await expect(f.race.connect(f.a).vote(b.commitment,b.ciphertext,deadline,sig,[23])).revertedWith('admission expired');
 });

 it('website reads activate both tables atomically and match contract getters without indexing',async()=>{
  const {readRace,readLeaderboards,raceAt,BOARD_ABI}=require('../lib/owner-voting/website.cjs');
  const f={...await loadFixture(closedFixture)};
  const board=new ethers.Contract(f.board.target,BOARD_ABI,ethers.provider);
  let block=await ethers.provider.getBlock('latest');
  expect((await readRace(raceAt(f.race.target,ethers.provider),block)).rows).length(0);
  expect((await readLeaderboards(board,a=>raceAt(a,ethers.provider),block)).wallets).length(0);
  await finish(f);block=await ethers.provider.getBlock('latest');
  expect((await readRace(raceAt(f.race.target,ethers.provider),block)).rows).length(22);
  const snapshot=await readLeaderboards(board,a=>raceAt(a,ethers.provider),block);
  expect(await f.board.participantCount(1)).eq(0n);
  for(const row of snapshot.wallets){
   expect(BigInt(row.season)).eq(await f.board.seasonPoints(row.wallet));
   expect(BigInt(row.allTime)).eq(await f.board.allTimePoints(row.wallet));
  }
  for(const row of snapshot.horses){
   expect(BigInt(row.season)).eq(await f.board.horsePoints(row.horse,1));
   expect(BigInt(row.allTime)).eq(await f.board.horsePoints(row.horse,0));
  }
 });

 it('prize scan resumes with strict cursors, rejects partial results and stale ownership',async()=>{
  const f={...await loadFixture(seasonReady)};
  await f.board.beginPrizeScan();const epoch=await f.board.prizeScanEpoch();
  await expect(f.board.beginPrizeScan()).revertedWith('scan already active');
  await expect(f.board.processPrizeHolders(epoch,1,26)).revertedWith('bad batch');
  await expect(f.board.processPrizeHolders(epoch+1n,1,25)).revertedWith('wrong scan');
  await expect(f.board.processPrizeScores(epoch,0,25)).revertedWith('holders incomplete');
  await f.board.connect(f.outsider).processPrizeHolders(epoch,1,25);
  await expect(f.board.processPrizeHolders(epoch,1,25)).revertedWith('wrong cursor');
  await expect(f.board.finalizeSeason()).revertedWith('prize scan incomplete');
  await expect(f.board.getSeasonTop3(1)).revertedWith('season not finalized');
  // Lowest ID changes after its former owner has already been processed.
  await f.genesis.connect(f.a).transferFrom(f.a.address,f.b.address,23);
  await expect(f.board.processPrizeHolders(epoch,26,25)).revertedWith('ownership changed');
  await expect(f.board.finalizeSeason()).revertedWith('ownership changed');
  await f.board.beginPrizeScan();const fresh=await f.board.prizeScanEpoch();
  expect(fresh).eq(epoch+1n);expect(await f.board.prizeScanCursor()).eq(1n);
  await expect(f.board.processPrizeHolders(epoch,1,25)).revertedWith('wrong scan');
  // Worker resumes this active epoch rather than clearing or double counting it.
  await f.board.processPrizeHolders(fresh,1,25);
  await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1))).deep.eq([f.b.address,f.a.address,ethers.ZeroAddress]);
  await expect(f.board.finalizeSeason()).revertedWith('season not complete');
 });
 it('rejects transfer after the last prize batch and protects score-bucket cursors',async()=>{
  const f={...await loadFixture(seasonReady)};await preparePrizeScan(f.board);
  const epoch=await f.board.prizeScanEpoch();
  await expect(f.board.processPrizeScores(epoch,0,25)).revertedWith('wrong cursor');
  await expect(f.board.processPrizeScores(epoch,251,25)).revertedWith('scores complete');
  await f.genesis.connect(f.b).transferFrom(f.b.address,f.owner.address,24);
  await expect(f.board.finalizeSeason()).revertedWith('ownership changed');
  await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1))).deep.eq([f.a.address,f.b.address,ethers.ZeroAddress]);
 });
 it('mint and refund burn invalidate scans; failed transfers and approvals cannot change revision',async()=>{
  const f={...await loadFixture(seasonReady)};await f.genesis.setSaleContract(f.owner.address);
  const initial=await f.genesis.ownershipRevision();
  await expect(f.genesis.connect(f.outsider).transferFrom(f.a.address,f.outsider.address,23)).reverted;
  await f.genesis.connect(f.a).approve(f.outsider.address,23);
  expect(await f.genesis.ownershipRevision()).eq(initial);
  await f.board.beginPrizeScan();
  await f.genesis.saleMint(f.outsider.address,1);
  expect(await f.genesis.ownershipRevision()).eq(initial+1n);
  await expect(f.board.finalizeSeason()).revertedWith('ownership changed');
  await f.board.beginPrizeScan();
  await f.genesis.refundBurn(f.outsider.address,[29]);
  expect(await f.genesis.ownershipRevision()).eq(initial+2n);
  await expect(f.board.finalizeSeason()).revertedWith('ownership changed');
  await settleSeason(f.board);
  expect(Array.from(await f.board.getSeasonTop3(1)).slice(0,2)).deep.eq([f.a.address,f.b.address]);
 });
 it('bounds operator batch configuration before it submits any transaction',async()=>{
  const f={...await loadFixture(fixture)};
  for(const batchSize of [0,26,1.5]){
   await expect(settleRace(f.race,f.backend,key.privateKey,{batchSize})).rejectedWith('bad batch');
   await expect(settleSeason(f.board,{batchSize})).rejectedWith('bad batch');
  }
 });

});
