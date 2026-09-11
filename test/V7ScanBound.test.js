const {expect}=require('chai'),{ethers}=require('hardhat'),{time}=require('@nomicfoundation/hardhat-network-helpers');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,packet}=require('./helpers/sponsored.cjs');
const {verifyBound,configuredBounds,lowerBound}=require('../lib/owner-voting/scan-bound.cjs');
const {reconstructBallots}=require('../lib/owner-voting/signed-backend.cjs');
const {RaceRevealService}=require('../lib/owner-voting/race-reveal-service.cjs');
describe('Canonical race scan lower bound',function(){this.timeout(120000);
 async function setup(){const f=await fixture();return {...f,factory:await ethers.getContractAt('HOFCanonicalRaceFactory',await f.board.raceFactory()),directory:fs.mkdtempSync(path.join(os.tmpdir(),'hof-scan-'))};}
 const verify=(f,n=f.race.scanFromBlock)=>verifyBound({race:f.race,factory:f.factory,board:f.board,fromBlock:n,directory:f.directory});
 function service(f,map={[f.race.target.toLowerCase()]:f.race.scanFromBlock}){return new RaceRevealService({board:f.board,signer:f.backend,relayer:f.relayer,treasuryAddress:f.treasury.address,directory:f.directory,keyFor:async()=>f.key.privateKey,raceAt:a=>ethers.getContractAt('HOFRelayedRace',a),factoryAt:a=>ethers.getContractAt('HOFCanonicalRaceFactory',a),raceDeploymentBlocks:map,ingressToken:'local-test-ingress-'.repeat(3),allowLocal:true});}
 it('reconstruction and proposal verification never request logs below verified creation block',async()=>{
  const f=await setup();await f.race.submitSigned(await packet(f));await time.increaseTo(Number(await f.race.closesAt()));const s=service(f),original=ethers.provider.getLogs,calls=[];
  ethers.provider.getLogs=async filter=>{calls.push(filter);expect(Number(filter.fromBlock)).gte(f.race.scanFromBlock);return original.call(ethers.provider,filter);};
  try{for(let i=0;i<15&&!await f.race.finalized();i++)await s.tick();expect(await f.race.finalized()).eq(true);expect(calls.length).gt(0);}finally{ethers.provider.getLogs=original;await s.close();}
 });
 it('includes the first queried block and subsequent vote blocks (inclusive boundary)',async()=>{
  const f=await setup(),first=await(await f.race.submitSigned(await packet(f,0))).wait();await f.race.submitSigned(await packet(f,1));
  // Canonical creation precedes opening. Test the reconstruction primitive at an exact vote boundary too.
  const ballots=await reconstructBallots(f.race,{fromBlock:first.blockNumber});expect(ballots.length).eq(2);
  expect((await reconstructBallots(f.race,{fromBlock:await verify(f)})).length).eq(2);
 });
 it('restart and repeated verification retain byte-identical race/block journal binding',async()=>{
  const f=await setup();let s=service(f);await s.tick();await s.close();const file=path.join(f.directory,f.race.target.toLowerCase()+'.scan.json'),before=fs.readFileSync(file,'utf8');
  s=service(f);try{await s.tick();await s.tick();expect(fs.readFileSync(file,'utf8')).eq(before);expect(JSON.parse(before).fromBlock).eq(f.race.scanFromBlock);}finally{await s.close();}
 });
 it('missing configuration fails closed for an existing race',async()=>{const f=await setup(),s=service(f,{});try{await expect(s.tick()).rejectedWith('Missing race deployment block');}finally{await s.close();}});
 it('missing lower bound on a connected race never falls back to zero',async()=>{const f=await setup(),r=await ethers.getContractAt('HOFRelayedRace',f.race.target);await expect(reconstructBallots(r)).rejectedWith('Missing or invalid');});
 it('zero, negative, fractional, unsafe, malformed and future blocks fail',async()=>{const f=await setup();for(const n of [0,-1,1.2,Number.MAX_SAFE_INTEGER+1,'oops'])await expect(lowerBound(f.race,n)).rejected;await expect(verify(f,(await ethers.provider.getBlockNumber())+1)).rejectedWith('exceeds current head');});
 it('later block cannot silently omit ballots; persisted binding stays unchanged',async()=>{const f=await setup();await verify(f);const file=path.join(f.directory,f.race.target.toLowerCase()+'.scan.json'),before=fs.readFileSync(file,'utf8');await expect(verify(f,f.race.scanFromBlock+1)).rejectedWith('provenance mismatch');expect(fs.readFileSync(file,'utf8')).eq(before);});
 it('another race address cannot reuse a configured block entry',async()=>{const f=await setup(),s=service(f,{[f.board.target.toLowerCase()]:f.race.scanFromBlock});try{await expect(s.tick()).rejectedWith('Missing race deployment block');}finally{await s.close();}});
 it('journal corruption fails rather than rebinding',async()=>{const f=await setup();await verify(f);const file=path.join(f.directory,f.race.target.toLowerCase()+'.scan.json'),data=JSON.parse(fs.readFileSync(file));data.fromBlock++;fs.writeFileSync(file,JSON.stringify(data));await expect(verify(f)).rejectedWith('Persisted scan binding mismatch');});
 it('changed creation block hash after restart fails closed',async()=>{const f=await setup();await verify(f);const original=ethers.provider.getBlock;ethers.provider.getBlock=async n=>{const block=await original.call(ethers.provider,n);return Number(n)===f.race.scanFromBlock?{...block,hash:ethers.id('changed chain')}:block;};try{await expect(verify(f)).rejectedWith('Invalid creation receipt');}finally{ethers.provider.getBlock=original;}});
 it('queue retry cannot move its persisted lower bound',async()=>{
  const f=await setup(),{SignedVoteQueue}=require('../lib/owner-voting/signed-service.cjs');
  const options={race:f.race,relayer:f.relayer,treasuryAddress:f.treasury.address,journal:path.join(f.directory,'queue'),fromBlock:f.race.scanFromBlock};
  let q=new SignedVoteQueue(options);try{await q.checkRelayer();await q.checkRelayer();}finally{q.close();}
  q=new SignedVoteQueue({...options,fromBlock:f.race.scanFromBlock+1});try{await expect(q.checkRelayer()).rejectedWith('journal deployment mismatch');}finally{q.close();}
 });
 it('configuration binds explicit addresses, rejects missing pairs/conflicts and supports multiple races',()=>{
  const a=ethers.Wallet.createRandom().address,b=ethers.Wallet.createRandom().address;
  expect(configuredBounds({HOF_RACE_ADDRESS:a,HOF_RACE_DEPLOYMENT_BLOCK:'117170000'})[a.toLowerCase()]).eq(117170000);
  expect(()=>configuredBounds({HOF_RACE_DEPLOYMENT_BLOCK:'117170000'})).throws();
  expect(()=>configuredBounds({HOF_RACE_ADDRESS:a})).throws();
  expect(()=>configuredBounds({HOF_RACE_ADDRESS:a,HOF_RACE_DEPLOYMENT_BLOCK:'5',HOF_RACE_DEPLOYMENT_BLOCKS:JSON.stringify({[a]:6})})).throws();
  expect(Object.keys(configuredBounds({HOF_RACE_DEPLOYMENT_BLOCKS:JSON.stringify({[a]:5,[b]:6})}))).length(2);
 });
 it('measures paginated request count near117M with the real reconstruction loop',async()=>{
  const creation=117170000,head=117174000;let count=0,min=Infinity;
  const provider={getBlock:async()=>({number:head,hash:ethers.id('anchor')}),getLogs:async f=>{count++;min=Math.min(min,f.fromBlock);return [];}};
  const race={target:ethers.ZeroAddress,runner:{provider},recordsHash:async()=>ethers.ZeroHash,totalVP:async()=>0n,ballotCount:async()=>0n};
  await reconstructBallots(race,{fromBlock:creation});expect(count).eq(3);expect(min).eq(creation);
  // Baseline loop exactly as previously implemented; no remote RPC calls.
  let baseline=0;for(let from=0;from<=head;from+=2000){await provider.getLogs({fromBlock:from,toBlock:Math.min(from+1999,head)});baseline++;}
  expect(baseline).eq(58588);console.log(JSON.stringify({benchmark:'synthetic RPC request count; not gas or live latency',creation,head,oldPerScan:baseline,newPerScan:3,oldTwoScans:baseline*2,newTwoScans:6,creationEvidenceLogQuery:1}));
 });
});
