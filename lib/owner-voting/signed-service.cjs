// SERVER ONLY. A single writer owns the journal and relayer nonce stream.
const fs=require('node:fs');
const http=require('node:http');
const {getAddress}=require('ethers');
const {admitSigned,verifyIntentSignature}=require('./signed-backend.cjs');
const {digestFor,inclusionState,json}=require('./signed-ballot.cjs');
const isRevert=e=>e.code==='CALL_EXCEPTION'||(typeof e.data==='string'&&/^0x[0-9a-fA-F]{8}/.test(e.data));
function flushDelay(remaining,{flushMs=3000,urgentMs=1000,deadlineWindow=60}={}){return remaining<=deadlineWindow?urgentMs:flushMs;}
class RateLimiter {
 constructor({limit=30,windowMs=60000,maxKeys=10000,now=Date.now}={}){Object.assign(this,{limit,windowMs,maxKeys,now});this.entries=new Map();}
 allow(key){const now=this.now();for(const [k,v] of this.entries)if(v.until<=now)this.entries.delete(k);
  let entry=this.entries.get(key);if(!entry){if(this.entries.size>=this.maxKeys)return false;entry={until:now+this.windowMs,count:0};this.entries.set(key,entry);}return ++entry.count<=this.limit;}
}
class SignedVoteQueue {
 constructor({race,relayer,treasuryAddress,journal,batchSize=25,maxGas=5000000n,fromBlock=0,flushMs=3000,urgentMs=1000,deadlineWindow=60,receiptTimeoutMs=30000,maxAttempts=3}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw Error('invalid retry budget');
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>25||BigInt(maxGas)<=0n||!journal||!treasuryAddress)throw Error('invalid queue configuration');
  if(![flushMs,urgentMs,deadlineWindow,receiptTimeoutMs].every(n=>Number.isFinite(n)&&n>0))throw Error('invalid flush configuration');
  Object.assign(this,{race,relayer,treasuryAddress:getAddress(treasuryAddress),journal,batchSize,maxGas:BigInt(maxGas),fromBlock,flushMs,urgentMs,deadlineWindow,receiptTimeoutMs,maxAttempts});
  this.jobs=new Map();this.attempts=new Map();this.busy=false;this.timer=null;this.stopped=true;
  // Truncate only an unacknowledged torn trailing append; malformed full records fail closed.
  if(fs.existsSync(journal)){const bytes=fs.readFileSync(journal),end=bytes.lastIndexOf(10)+1;
   for(const line of bytes.subarray(0,end).toString().split('\n').filter(Boolean)){const row=JSON.parse(line);this.jobs.set(row.id,row);}
   if(end<bytes.length)fs.truncateSync(journal,end);
   for(const job of this.jobs.values()){const key=this.nonceKey(job.packet);this.attempts.set(key,(this.attempts.get(key)||0)+(job.attempts||0));}
  }
 }
 nonceKey(packet){return packet.intent.voter.toLowerCase()+':'+BigInt(packet.intent.nonce).toString();}
 attemptsFor(packet){return this.attempts.get(this.nonceKey(packet))||0;}
 save(job){
  const fd=fs.openSync(this.journal,'a',0o600);try{fs.writeFileSync(fd,json(job)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const key=this.nonceKey(job.packet),before=this.jobs.get(job.id)?.attempts||0;
  this.attempts.set(key,(this.attempts.get(key)||0)+(job.attempts||0)-before);this.jobs.set(job.id,job);
 }
 async checkRelayer(){
  const address=getAddress(await this.relayer.getAddress());
  const forbidden=[await this.race.hofOwner(),await this.race.backendSigner(),await this.race.teamReserveWallet(),this.treasuryAddress].map(getAddress);
  if(forbidden.includes(address))throw Error('relayer must be a separate operational wallet');
 }
 async enqueue(packet){
  await this.checkRelayer();const chain=(await this.race.runner.provider.getNetwork()).chainId,id=digestFor(packet,chain);
  const old=this.jobs.get(id);if(old&&!['Rejected','Expired'].includes(old.state))return {id,state:old.state};
  if(this.attemptsFor(packet)>=this.maxAttempts)throw Error('sponsorship retry budget exhausted');
  await this.race.submitSigned.staticCall(packet,{gasLimit:this.maxGas});
  this.save({id,packet,state:'Submitted',attempts:old?.attempts||0});
  // Never wait for 25. Admission acknowledgment immediately wakes the worker.
  if(!this.stopped)this.schedule(0);
  return {id,state:'Submitted'};
 }
 schedule(delay){if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(async()=>{
  try{await this.flush();}catch{/* RPC unavailable: retry, never manufacture inclusion */}
  if(!this.stopped){let delay=this.flushMs;try{const block=await this.race.runner.provider.getBlock('latest');delay=flushDelay(Number(await this.race.closesAt())-block.timestamp,this);}catch{}this.schedule(delay);}
 },delay);this.timer.unref?.();}
 start(){this.stopped=false;this.schedule(0);}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 async flush(){
  if(this.busy)return;this.busy=true;
  try{
   await this.checkRelayer();const provider=this.race.runner.provider;
   const close=Number(await this.race.closesAt());
   const jobs=[...this.jobs.values()].filter(j=>!['Vote confirmed','Expired','Rejected'].includes(j.state))
     .sort((a,b)=>Number(BigInt(a.packet.intent.deadline)-BigInt(b.packet.intent.deadline)));
   const reserved=new Set();
   // Validate and dispatch one bounded window before examining later queued votes.
   for(let offset=0;offset<jobs.length;offset+=this.batchSize){
   const head=await provider.getBlock('latest'),pending=[];
   for(const job of jobs.slice(offset,offset+this.batchSize)){
    if(['Vote confirmed','Expired','Rejected'].includes(job.state))continue;
    // Fresh queued packets need no history scan. Receipt/direct-fallback reconciliation
    // is needed only after a broadcast, eligibility failure or expiry.
    if(job.txHash || job.state==='Included on-chain' || head.timestamp>=close || BigInt(head.timestamp)>BigInt(job.packet.intent.deadline)){
      const state=await inclusionState(this.race,job.packet,this.fromBlock);
      if(state!=='Submitted'){if(state!==job.state)this.save({...job,state});continue;}
    }
    if(head.timestamp>=close||BigInt(head.timestamp)>BigInt(job.packet.intent.deadline)){this.save({...job,state:'Expired'});continue;}
    // Keep rechecking canonical inclusion. A transfer or direct fallback can invalidate a queued packet.
    if(job.txHash){const receipt=await provider.getTransactionReceipt(job.txHash);if(!receipt)continue;}
    try{await this.race.submitSigned.staticCall(job.packet,{gasLimit:this.maxGas});}
    catch(e){
     if(isRevert(e)){
      const state=await inclusionState(this.race,job.packet,this.fromBlock);
      this.save({...job,state:state==='Submitted'?'Rejected':state});
     }continue;
    }
    if(this.attemptsFor(job.packet)>=this.maxAttempts){this.save({...job,state:'Rejected',reason:'sponsorship retry budget; direct fallback available'});continue;}
    const nonceKey=this.nonceKey(job.packet);
    if(reserved.has(nonceKey))continue;reserved.add(nonceKey);pending.push(job);
   }
   // Earliest signed deadline first; submission never waits to fill a batch.
   pending.sort((a,b)=>Number(BigInt(a.packet.intent.deadline)-BigInt(b.packet.intent.deadline)));
   while(pending.length){
    const block=await provider.getBlock('latest');if(block.timestamp>=close)break;
    const group=[];let uses=0;
    while(pending.length&&group.length<this.batchSize){const job=pending[0],n=job.packet.tokenIds.length;if(group.length&&uses+n>100)break;group.push(pending.shift());uses+=n;if(uses>100)break;}
    const contract=this.race.connect(this.relayer);
    const send=()=>group.length===1?contract.submitSigned:contract.submitBatch;
    const args=()=>group.length===1?group[0].packet:group.map(j=>j.packet);
    let estimate;
    for(;;){
     try{estimate=await send().estimateGas(args());}catch(e){
      if(group.length>1){pending.unshift(group.pop());continue;}
      if(isRevert(e))this.save({...group[0],state:'Rejected'});break;
     }
     const padded=estimate+estimate/5n;
     if(padded<=this.maxGas){
      // Reserve attempts durably before broadcast, including ambiguous RPC failures.
      for(let i=0;i<group.length;i++){group[i]={...group[i],attempts:(group[i].attempts||0)+1};this.save(group[i]);}
      const tx=await send()(args(),{gasLimit:padded});
      for(const job of group)this.save({...job,state:'Submitted',txHash:tx.hash});
      // One nonce stream: receipt before advancing; no duplicate accepted vote can result.
      await tx.wait(1,this.receiptTimeoutMs);break;
     }
     if(group.length===1){this.save({...group[0],state:'Rejected',reason:'sponsorship gas budget; direct fallback available'});break;}
     pending.unshift(group.pop());
    }
   }
   }
  }finally{this.busy=false;}
 }
}
function createSignedServer({race,admissionSigner,privateKey,queue,maxConcurrent=4,limiter=new RateLimiter(),walletLimiter=new RateLimiter({limit:10})}){
 let active=0;
 return http.createServer(async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(json(body));};
  if(req.method!=='POST'||!['/vote/prepare','/vote/submit'].includes(req.url))return send(404,{error:'not found'});
  // Socket identity only; never trust caller-controlled X-Forwarded-For.
  if(!limiter.allow(req.socket.remoteAddress||'unknown'))return send(429,{error:'rate limited'});
  if(active>=maxConcurrent)return send(503,{error:'try later'});active++;req.setTimeout(10000,()=>req.destroy());
  try{
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>131072)return send(413,{error:'request too large'});chunks.push(chunk);}
   const packet=JSON.parse(Buffer.concat(chunks).toString());
   if(getAddress(await admissionSigner.getAddress())===queue.treasuryAddress)throw Error('unsafe treasury signer');
   await verifyIntentSignature(race,packet);
   const wallet=getAddress(packet.intent.voter);if(!walletLimiter.allow(wallet))return send(429,{error:'rate limited'});
   if(req.url==='/vote/prepare')return send(200,await admitSigned(race,admissionSigner,privateKey,packet));
   return send(200,await queue.enqueue(packet));
  }catch{if(!res.headersSent&&!res.destroyed)send(400,{error:'vote not admitted'});}finally{active--;}
 });
}
module.exports={SignedVoteQueue,RateLimiter,createSignedServer,flushDelay};
