const {expect}=require('chai');
const {ethers}=require('hardhat');
const {loadFixture,time}=require('@nomicfoundation/hardhat-network-helpers');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {fixture,packet}=require('./helpers/sponsored.cjs');
const {SignedVoteQueue,RateLimiter,createSignedServer,flushDelay}=require('../lib/owner-voting/signed-service.cjs');
const ingressToken=require('node:crypto').randomBytes(32).toString('hex');
const queues=[];
function queue(f,options={}){const q=new SignedVoteQueue({race:f.race,relayer:f.relayer,treasuryAddress:f.treasury.address,journal:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'hof-queue-')),'journal'),...options});queues.push(q);return q;}
describe('V7 sponsored queue/adaptive deadline flush',function(){
 this.timeout(120000);
 afterEach(async()=>{for(const q of queues.splice(0)){q.stop();while(q.busy)await new Promise(r=>setTimeout(r,10));q.close();}});
 it('defaults to25 and flushes one vote without waiting for a full batch',async()=>{const f=await loadFixture(fixture),q=queue(f);expect(q.batchSize).eq(25);await q.enqueue(await packet(f));await q.flush();expect(await f.race.ballotCount()).eq(1n);});
 it('wakes automatically on enqueue and drains a partial batch',async()=>{
  const f=await loadFixture(fixture),q=queue(f,{flushMs:5000});q.start();try{await q.enqueue(await packet(f));const end=Date.now()+5000;while(await f.race.ballotCount()===0n&&Date.now()<end)await new Promise(r=>setTimeout(r,20));expect(await f.race.ballotCount()).eq(1n);}finally{q.stop();}
 });
 it('flushes before the exact race deadline rather than waiting for25',async()=>{
  const f=await loadFixture(fixture),q=queue(f);await q.enqueue(await packet(f));await time.increaseTo(f.opens+86400-2);await q.flush();expect(await f.race.ballotCount()).eq(1n);
 });
 it('expires at deadline; Signed/Submitted alone never become valid votes',async()=>{
  const f=await loadFixture(fixture),q=queue(f),job=await q.enqueue(await packet(f));await time.increaseTo(f.opens+86400);await q.flush();expect(q.jobs.get(job.id).state).eq('Expired');expect(await f.race.ballotCount()).eq(0n);
 });
 it('splits by gas budget and resumes every deferred vote',async()=>{
  const f=await loadFixture(fixture),q=queue(f,{maxGas:400000n});for(let i=0;i<5;i++)await q.enqueue(await packet(f,i));
  await q.flush();expect(await f.race.ballotCount()).eq(5n);const hashes=new Set([...q.jobs.values()].map(j=>j.txHash));expect(hashes.size).gt(1);
  for(const h of hashes)expect((await ethers.provider.getTransactionReceipt(h)).gasUsed).lt(400000n);
 });
 it('restarts from durable queue, deduplicates enqueue and processing',async()=>{
  const f=await loadFixture(fixture),q=queue(f),p=await packet(f);await q.enqueue(p);await q.enqueue(p);expect(q.jobs.size).eq(1);
  q.close();const restored=queue(f,{journal:q.journal});await restored.flush();await restored.flush();expect(await f.race.ballotCount()).eq(1n);
 });
 it('direct fallback before worker causes no second vote or paid backend retry',async()=>{
  const f=await loadFixture(fixture),q=queue(f),p=await packet(f);await q.enqueue(p);await f.race.connect(f.voters[0]).submitSigned(p);const before=await ethers.provider.getTransactionCount(f.relayer.address);await q.flush();expect(await ethers.provider.getTransactionCount(f.relayer.address)).eq(before);expect(await f.race.ballotCount()).eq(1n);
 });
 it('backend before fallback rejects reused nonce',async()=>{const f=await loadFixture(fixture),q=queue(f),p=await packet(f);await q.enqueue(p);await q.flush();await expect(f.race.connect(f.voters[0]).submitSigned(p)).revertedWith('wrong nonce');});
 it('rejects an ineligible packet before sponsorship and handles eligibility loss in queue',async()=>{
  const f=await loadFixture(fixture),q=queue(f),p=await packet(f);await expect(q.enqueue({...p,tokenIds:[24]})).rejected;
  const job=await q.enqueue(p);await f.genesis.connect(f.voters[0]).transferFrom(f.voters[0].address,f.voters[1].address,23);await q.flush();expect(q.jobs.get(job.id).state).eq('Rejected');expect(await f.race.ballotCount()).eq(0n);
 });
 for(const role of ['owner','backend','team','treasury'])it(`rejects ${role} as operational relayer`,async()=>{const f=await loadFixture(fixture),q=queue(f,{relayer:f[role]});await expect(q.enqueue(await packet(f))).rejectedWith('separate operational wallet');});
 it('serializes concurrent flush and protects competing wallet nonce intents',async()=>{
  const f=await loadFixture(fixture),q=queue(f);await q.enqueue(await packet(f,0,1));await q.enqueue(await packet(f,0,2));await Promise.all([q.flush(),q.flush()]);await q.flush();expect(await f.race.ballotCount()).eq(1n);
 });
 it('truncates torn unacknowledged journal append, preserving acknowledged votes',async()=>{
  const f=await loadFixture(fixture),q=queue(f);await q.enqueue(await packet(f));fs.appendFileSync(q.journal,'{"torn":');q.close();const restored=queue(f,{journal:q.journal});expect(restored.jobs.size).eq(1);await restored.flush();expect(await f.race.ballotCount()).eq(1n);
 });
 it('rate limits before expensive admission and never returns plaintext/private keys',async()=>{
  const f=await loadFixture(fixture),q=queue(f),server=createSignedServer({ingressToken,race:f.race,admissionSigner:f.backend,privateKey:f.key.privateKey,queue:q,limiter:new RateLimiter({limit:2})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
   const p=await packet(f);delete p.admission;const base=`http://127.0.0.1:${server.address().port}`;
   const res=await fetch(base+'/vote/prepare',{method:'POST',headers:{Authorization:`Bearer ${ingressToken}`},body:JSON.stringify(p)});expect(res.status).eq(200);const auth=await res.json();expect(Object.keys(auth)).deep.eq(['admission']);
   const submit=await fetch(base+'/vote/submit',{method:'POST',headers:{Authorization:`Bearer ${ingressToken}`},body:JSON.stringify({...p,...auth})});expect(submit.status).eq(200);expect((await submit.json()).state).eq('Submitted');
   const limited=await fetch(base+'/vote/prepare',{method:'POST',headers:{Authorization:`Bearer ${ingressToken}`},body:JSON.stringify(p)});expect(limited.status).eq(429);expect(await f.race.ballotCount()).eq(0n);await q.flush();expect(await f.race.ballotCount()).eq(1n);
  }finally{await new Promise(r=>server.close(r));}
 });
 it('unauthenticated requests cannot exhaust another wallet admission quota',async()=>{
  const f=await loadFixture(fixture),q=queue(f),server=createSignedServer({ingressToken,race:f.race,admissionSigner:f.backend,privateKey:f.key.privateKey,queue:q,walletLimiter:new RateLimiter({limit:1})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));try{
   const p=await packet(f),url=`http://127.0.0.1:${server.address().port}/vote/prepare`;
   const bad=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${ingressToken}`},body:JSON.stringify({...p,signature:'0x00'})});expect(bad.status).eq(400);
   const good=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${ingressToken}`},body:JSON.stringify(p)});expect(good.status).eq(200);
  }finally{await new Promise(r=>server.close(r));}
 });
 it('dispatches a bounded window before validating the rest of a backlog',async()=>{
  const f=await loadFixture(fixture);let checked=0,firstDispatch;
  const wrapped=new Proxy(f.race,{get(t,k){
   if(k==='submitSigned')return {staticCall:async(...a)=>{checked++;return t.submitSigned.staticCall(...a);}};
   if(k==='connect')return signer=>{const connected=t.connect(signer);return new Proxy(connected,{get(c,key){const fn=Reflect.get(c,key,c);if(key==='submitBatch')return new Proxy(fn,{apply(target,self,args){firstDispatch??=checked;return Reflect.apply(target,self,args);}});return fn;}});};
   return Reflect.get(t,k,t);
  }});
  const q=queue(f,{race:wrapped,batchSize:2});for(let i=0;i<5;i++)await q.enqueue(await packet(f,i));checked=0;await q.flush();expect(firstDispatch).eq(2);expect(await f.race.ballotCount()).eq(5n);
 });
 it('bounds receipt waiting and reconciles an ambiguous broadcast without duplicate inclusion',async()=>{
  const f=await loadFixture(fixture);let timeout;
  const wrapped=new Proxy(f.race,{get(t,k){
   if(k==='connect')return signer=>{const c=t.connect(signer);return new Proxy(c,{get(target,key){
    const fn=Reflect.get(target,key,target);if(key==='submitSigned')return new Proxy(fn,{async apply(method,self,args){const tx=await Reflect.apply(method,self,args);return {hash:tx.hash,wait:async(_confirmations,ms)=>{timeout=ms;throw Object.assign(Error('RPC wait timeout'),{code:'TIMEOUT'});}};}});return fn;
   }});};return Reflect.get(t,k,t);
  }});
  const q=queue(f,{race:wrapped,receiptTimeoutMs:1000});await q.enqueue(await packet(f));await expect(q.flush()).rejectedWith('RPC wait timeout');expect(timeout).eq(1000);await q.flush();expect(await f.race.ballotCount()).eq(1n);
 });
 it('caps sponsored broadcast failures persistently per wallet/nonce, even after re-signing',async()=>{
  const f=await loadFixture(fixture);
  const wrapped=new Proxy(f.race,{get(t,k){if(k==='connect')return signer=>{const c=t.connect(signer);return new Proxy(c,{get(target,key){const fn=Reflect.get(target,key,target);if(key==='submitSigned')return new Proxy(fn,{async apply(){throw Error('ambiguous broadcast failure');}});return fn;}});};return Reflect.get(t,k,t);}});
  const q=queue(f,{race:wrapped,maxAttempts:2}),p=await packet(f);await q.enqueue(p);
  await expect(q.flush()).rejectedWith('ambiguous broadcast failure');await q.flush();await q.flush();
  expect(q.attemptsFor(p)).eq(1);q.close();const restored=queue(f,{journal:q.journal,maxAttempts:2});
  await restored.enqueue(await packet(f,0,2));await restored.flush();expect(await f.race.ballotCount()).eq(0n);
  // Sponsorship exhaustion never changes the contract's valid direct fallback.
  await f.race.connect(f.voters[0]).submitSigned(p);expect(await f.race.ballotCount()).eq(1n);
 });
 it('uses an urgent timer during the final60 seconds, including the boundary',()=>{expect(flushDelay(61)).eq(3000);expect(flushDelay(60)).eq(1000);expect(flushDelay(1)).eq(1000);});
 it('rate limit windows reset and key cardinality is bounded',()=>{
  let now=0;const l=new RateLimiter({limit:1,maxKeys:1,windowMs:100,now:()=>now});expect(l.allow('a')).eq(true);expect(l.allow('a')).eq(false);expect(l.allow('b')).eq(false);now=100;expect(l.allow('b')).eq(true);
 });
});
