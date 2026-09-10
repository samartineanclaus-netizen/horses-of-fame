const {expect}=require('chai');
const {ethers}=require('hardhat');
const {loadFixture,time}=require('@nomicfoundation/hardhat-network-helpers');
const {fixture,packet,authorize}=require('./helpers/sponsored.cjs');
const {admitSigned,reconstructBallots,buildRelayedResult,settleRelayedRace}=require('../lib/owner-voting/signed-backend.cjs');
const {signVote}=require('../lib/owner-voting/signed-ballot.cjs');
describe('V7 sponsored signed voting',function(){
 this.timeout(120000);
 it('accepts a genuine admission, stores compact metadata and reconstructs ciphertext',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);delete p.admission;p.admission=(await admitSigned(f.race,f.backend,f.key.privateKey,p)).admission;
  await f.race.connect(f.relayer).submitBatch([p]);const b=await f.race.ballotAt(0);
  expect(b.ciphertext).eq('0x');expect(b.vp).eq(5n);expect((await reconstructBallots(f.race))[0].ciphertext).eq(p.ciphertext);
 });
 for(const field of ['voter','race','nonce','deadline','commitment','ciphertextHash','tokenIdsHash','vp','topUp'])it(`rejects modified signed ${field}`,async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);const values={voter:f.voters[1].address,race:f.board.target,nonce:'1',deadline:String(f.opens+100),commitment:ethers.id('changed'),ciphertextHash:ethers.id('changed'),tokenIdsHash:ethers.id('changed'),vp:'4',topUp:true};p.intent[field]=values[field];await expect(f.race.submitSigned(p)).reverted;expect(await f.race.ballotCount()).eq(0n);
 });
 it('rejects modified ciphertext and token arrays, including duplicates atomically',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);
  await expect(f.race.submitSigned({...p,ciphertext:'0x01'})).revertedWith('bad ciphertext');
  await expect(f.race.submitSigned({...p,tokenIds:[24]})).revertedWith('modified packet');
  p.tokenIds=[23,23];p.intent.tokenIdsHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'],[p.tokenIds]));p.intent.vp='10';
  await expect(f.race.submitSigned(await authorize(f,p))).revertedWith('token already used');expect(await f.race.tokenUsed(23)).eq(false);
 });
 it('rejects wrong chain/domain and another race',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);
  for(const d of [{chainId:1},{verifyingContract:f.board.target},{name:'other'},{version:'2'}])await expect(f.race.submitSigned(await authorize(f,p,undefined,d))).revertedWith('invalid wallet signature');
 });
 for(const who of ['owner','backend','team'])it(`${who} cannot vote`,async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);await f.genesis.connect(f.voters[0]).transferFrom(f.voters[0].address,f[who].address,23);p.intent.voter=f[who].address;
  await expect(f.race.submitSigned(await authorize(f,p,f[who]))).reverted;
 });
 it('rejects admission refusal, malformed decrypted horse, and forged backend signature',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);
  await expect(f.race.submitSigned({...p,admission:p.signature})).revertedWith('invalid admission');
  await expect(signVote(f.race,f.voters[0],23,[{id:23,vp:5}])).rejectedWith('invalid ballot');
  await expect(admitSigned(f.race,f.backend,f.key.privateKey,{...p,ciphertext:ethers.hexlify(new Uint8Array(446).fill(1))})).rejectedWith('invalid encrypted ballot');
 });
 for(const first of ['backend','direct'])it(`${first} wins fallback race without a duplicate`,async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);
  if(first==='backend')await f.race.connect(f.relayer).submitBatch([p]);else await f.race.connect(f.voters[0]).submitSigned(p);
  await expect(first==='backend'?f.race.connect(f.voters[0]).submitSigned(p):f.race.connect(f.relayer).submitBatch([p])).revertedWith('wrong nonce');
  expect(await f.race.ballotCount()).eq(1n);expect(await f.race.totalVP()).eq(5n);
 });
 it('partial batch failure and duplicate nonce revert every earlier write',async()=>{
  const f={...await loadFixture(fixture)},a=await packet(f),b=await packet(f,1);b.intent.vp='1';
  await expect(f.race.submitBatch([a,b])).reverted;await expect(f.race.submitBatch([a,a])).revertedWith('wrong nonce');expect(await f.race.nonces(a.intent.voter)).eq(0n);
 });
 it('bounds empty/oversized batches and total NFT uses',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);
  await expect(f.race.submitBatch([])).revertedWith('bad batch');await expect(f.race.submitBatch(Array(26).fill(p))).revertedWith('bad batch');
  await expect(f.race.submitBatch([{...p,tokenIds:Array(101).fill(23)}])).revertedWith('too many token uses');
 });
 it('accepts at opening, rejects before opening, and at exact 24h close',async()=>{
  const f={...await loadFixture(fixture)},opens=(await time.latest())+100;
  // Pin each boundary block; restored fixtures must not depend on wall-clock
  // drift while the full2200-voter service/benchmark tests run.
  await time.setNextBlockTimestamp(opens-2);
  f.race=await(await ethers.getContractFactory('HOFRelayedRace')).deploy(f.genesis.target,opens,f.team.address,f.owner.address,f.backend.address,f.key.publicKey);
  const p=await packet(f);await time.setNextBlockTimestamp(opens-1);await expect(f.race.submitSigned(p)).revertedWith('voting closed');
  await time.setNextBlockTimestamp(opens);await f.race.submitSigned(p);
  const b=await packet(f,1);await time.setNextBlockTimestamp(opens+86400);await expect(f.race.submitSigned(b)).revertedWith('voting closed');
 });
 it('accepts deadline-1 and personal deadline exact, rejects personal deadline+1',async()=>{
  const f={...await loadFixture(fixture)},a=await packet(f),b=await packet(f,1),c=await packet(f,2);const deadline=f.opens+100;
  for(const p of [a,b,c])p.intent.deadline=String(deadline);
  const pa=await authorize(f,a),pb=await authorize(f,b),pc=await authorize(f,c);
  await time.setNextBlockTimestamp(deadline-1);await f.race.submitSigned(pa);await time.setNextBlockTimestamp(deadline);await f.race.submitSigned(pb);await expect(f.race.submitSigned(pc)).revertedWith('intent expired');
 });
 it('signed same-pick topups preserve current ownership and NFT reuse restrictions',async()=>{
  const f={...await loadFixture(fixture)},a=await packet(f);await f.race.submitSigned(a);
  await f.genesis.connect(f.voters[1]).transferFrom(f.voters[1].address,f.voters[0].address,24);
  let top=await signVote(f.race,f.voters[0],null,[{id:24,vp:5}],{original:{commitment:a.intent.commitment,ciphertext:a.ciphertext}});top=await authorize(f,top);await f.race.submitSigned(top);
  expect(await f.race.ballotCount()).eq(1n);expect((await reconstructBallots(f.race))[0].vp).eq(10n);
  await f.genesis.connect(f.voters[0]).transferFrom(f.voters[0].address,f.voters[1].address,23);const b=await packet(f,1);b.tokenIds=[23];b.intent.tokenIdsHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'],[[23]]));await expect(f.race.submitSigned(await authorize(f,b))).revertedWith('token already used');
 });
 it('refuses stale eligibility after transfer and HOF 0VP',async()=>{
  const f={...await loadFixture(fixture)},p=await packet(f);await f.genesis.connect(f.voters[0]).transferFrom(f.voters[0].address,f.voters[1].address,23);await expect(f.race.submitSigned(p)).revertedWith('not token owner');
  await f.genesis.transferFrom(f.owner.address,f.voters[0].address,1);p.tokenIds=[1];p.intent.tokenIdsHash=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256[]'],[[1]]));p.intent.vp='0';await expect(f.race.submitSigned(await authorize(f,p))).revertedWith('token not voting eligible');
 });
 it('rejects incomplete reconstruction and incomplete reveal; scores once with exact V7 mapping',async()=>{
  const f={...await loadFixture(fixture)};await f.race.submitBatch([await packet(f,0,1),await packet(f,1,22)]);
  await expect(reconstructBallots(f.race,{fromBlock:(await ethers.provider.getBlockNumber())+1})).rejectedWith('incomplete records');
  await time.increaseTo(f.opens+86400);await f.race.freeze();const r=await buildRelayedResult(f.race,f.backend,f.key.privateKey);
  await f.race.proposeResult(r.totals,r.root,r.signature);await f.race.prepareScores(0,[r.points[0]],[r.proofs[0]]);await expect(f.race.finalize()).revertedWith('incomplete result');
  expect(await f.board.allTimePoints(f.voters[0].address)).eq(0n);await expect(f.race.prepareScores(0,[r.points[0]],[r.proofs[0]])).revertedWith('wrong cursor');
  await settleRelayedRace(f.race,f.backend,f.key.privateKey);expect(await f.board.seasonPoints(f.voters[0].address)).eq(25n);expect(await f.board.allTimePoints(f.voters[1].address)).eq(18n);
  expect(Array.from(await f.race.ranking()).map(Number).sort((a,b)=>a-b)).deep.eq(Array.from({length:22},(_,i)=>i+1));await expect(f.race.finalize()).revertedWith('no pending result');
 });
 it('supports ERC1271 signatures while refusing reentry and unauthorized wallet changes',async()=>{
  const f={...await loadFixture(fixture)},w=await(await ethers.getContractFactory('SponsoredSignatureWallet')).deploy(f.voters[0].address);
  const p=await packet(f);p.intent.voter=w.target;
  await f.genesis.connect(f.voters[0]).transferFrom(f.voters[0].address,w.target,23);
  const signed=await authorize(f,p,f.voters[0]);
  await w.connect(f.voters[0]).setCallback(f.race.target,f.race.interface.encodeFunctionData('submitSigned',[signed]));
  await expect(w.connect(f.voters[1]).setCallback(f.race.target,'0x')).revertedWith('unauthorized');
  await f.race.submitSigned(signed);expect(await f.race.ballotCount()).eq(1n);expect(await f.race.nonces(w.target)).eq(1n);
 });
 it('maps every canonical HOF ID1–22 and independently checks every V7 score end-to-end',async()=>{
  const original=await loadFixture(fixture),f={...original,voters:[...original.voters]};
  while(f.voters.length<22){const wallet=ethers.Wallet.createRandom();await f.genesis.ownerMint(wallet.address,1);f.voters.push(wallet);}
  const packets=[];for(let i=0;i<22;i++)packets.push(await packet(f,i,i+1));
  await f.race.connect(f.relayer).submitBatch(packets);await time.increaseTo(f.opens+86400);await settleRelayedRace(f.race,f.backend,f.key.privateKey);
  const {hofHorses}=require('../src/lib/hofHorses');
  expect(Array.from(await f.race.ranking()).map(Number)).deep.eq(hofHorses.map(h=>h.number));
  const expected=[25,18,15,12,10,8,6,4,2,1,0,0,0,0,0,0,0,0,0,0,0,0];
  for(let i=0;i<22;i++){expect(await f.race.pointsOf(f.voters[i].address)).eq(BigInt(expected[i]));expect(await f.board.allTimePoints(f.voters[i].address)).eq(BigInt(expected[i]));}
 });
 it('supports a genuine empty finalized race',async()=>{const f={...await loadFixture(fixture)};await time.increaseTo(f.opens+86400);await settleRelayedRace(f.race,f.backend,f.key.privateKey);expect(await f.race.finalized()).eq(true);});
});
