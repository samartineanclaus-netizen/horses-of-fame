const {expect}=require('chai');
const {ethers,artifacts}=require('hardhat');
const {time,setBalance}=require('@nomicfoundation/hardhat-network-helpers');
const {hofHorses,getHofHorse}=require('../src/lib/hofHorses');
const {voteOnce}=require('../lib/owner-voting/ballot.cjs');
const {generateRaceKey,decryptVote,settleRace}=require('../lib/owner-voting/backend.cjs');
const {contextFor}=require('../lib/owner-voting/ballot.cjs');
const {createAdmissionServer}=require('../lib/owner-voting/service.cjs');
const {admissionProxy}=require('../lib/owner-voting/proxy.cjs');
const {RACE_ABI,BOARD_ABI,GENESIS_ABI,readRace,readLeaderboards}=require('../lib/owner-voting/website.cjs');

describe('V7 canonical frontend / admission / actual protocol integration',function(){
 this.timeout(120000);
 it('frontend ABI fragments match compiled contract inputs and outputs',async()=>{
  for(const [name,fragments] of [['HOFTrustedRace',RACE_ABI],['HOFTrustedLeaderboards',BOARD_ABI],['GenesisHorses',GENESIS_ABI]]){
   const actual=new ethers.Interface((await artifacts.readArtifact(name)).abi);
   for(const fragment of new ethers.Interface(fragments).fragments){
    const fn=actual.getFunction(fragment.format('sighash'));
    expect(fn,fragment.format()).not.eq(null);
    expect(fn.outputs.map(o=>o.format('sighash'))).deep.eq(fragment.outputs.map(o=>o.format('sighash')));
   }
  }
 });
 it('all22 canonical IDs survive browser encryption, HTTP admission, chain settlement and both boards',async()=>{
  const [owner,backend,team]=await ethers.getSigners();
  const key=await generateRaceKey();
  const genesis=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
  await genesis.setTeamWallet(team.address);await genesis.ownerMint(owner.address,22);
  const voters=[];
  for(const horse of hofHorses){
   const address=ethers.getAddress('0x'+(10000+horse.id).toString(16).padStart(40,'0'));
   await setBalance(address,10n**18n);const voter=await ethers.getImpersonatedSigner(address);
   await genesis.ownerMint(address,1);voters.push(voter);
  }
  const opens=(await time.latest())+100;
  const race=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(genesis.target,opens,team.address,owner.address,backend.address,key.publicKey);
  const board=await(await ethers.getContractFactory('LegacyTrustedBoardHarness')).deploy(genesis.target,owner.address,backend.address,team.address);
  await board.registerRace(race.target);
  const server=createAdmissionServer({race,signer:backend,privateKey:key.privateKey});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${server.address().port}/vote/admission`;
  const admit=async ballot=>{
   expect(Object.keys(ballot).sort()).deep.eq(['ciphertext','commitment','wallet']);
   const response=await admissionProxy(new Request('https://hof.test/api/vote/admission',{method:'POST',headers:{origin:'https://hof.test','content-type':'application/json'},body:JSON.stringify(ballot)}),endpoint);
   expect(response.status).eq(200);const body=await response.json();
   expect(Object.keys(body).sort()).deep.eq(['deadline','signature']);return body;
  };
  try {
   await time.increaseTo(opens);
   expect(hofHorses.map(h=>h.id)).deep.eq(Array.from({length:22},(_,i)=>i+1));
   for(const horse of hofHorses){
    expect(horse.number).eq(horse.id);
    const voter=voters[horse.id-1];
    await(await voteOnce(race,voter,horse.number,[22+horse.id],admit)).wait();
    const accepted=await race.ballotAt(horse.id-1);
    const decrypted=await decryptVote(await contextFor(race,await voter.getAddress()),accepted,key.privateKey);
    expect(decrypted.horse).eq(horse.id);
    expect(getHofHorse(decrypted.horse).name).eq(horse.name);
   }
   let block=await ethers.provider.getBlock('latest');
   expect((await readRace(race,block)).rows).deep.eq([]);
   expect(await board.allTimePoints(await voters[0].getAddress())).eq(0n);
   await time.increaseTo(opens+86400);
   await settleRace(race.connect(backend),backend,key.privateKey,{batchSize:5});
   block=await ethers.provider.getBlock('latest');
   const result=await readRace(race,block),boards=await readLeaderboards(board,()=>race,block);
   expect(result.rows.map(r=>r.horse)).deep.eq(hofHorses.map(h=>h.id));
   const scoring=[25,18,15,12,10,8,6,4,2,1,...Array(12).fill(0)];
   for(let i=0;i<22;i++){
    const wallet=await voters[i].getAddress(),row=boards.wallets.find(r=>r.wallet.toLowerCase()===wallet.toLowerCase());
    expect(result.rows[i].points).eq(scoring[i]);expect(result.rows[i].vp).eq('5');
    expect(row.season).eq(scoring[i]);expect(row.allTime).eq(scoring[i]);
    expect(await board.seasonPoints(wallet)).eq(BigInt(row.season));expect(await board.allTimePoints(wallet)).eq(BigInt(row.allTime));
    expect(boards.horses[i].horse).eq(hofHorses[i].number);expect(boards.horses[i].season).eq(scoring[i]);
   }
   expect(await board.participantCount(1)).eq(0n); // Display never waits for prize indexing.
   const hash=await race.frozenRecordsHash();
   await settleRace(race.connect(backend),backend,key.privateKey,{batchSize:5});
   expect(await race.frozenRecordsHash()).eq(hash);expect(await race.processedCount()).eq(22n);
   await expect(race.finalize()).revertedWith('no pending result');
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 });
});
