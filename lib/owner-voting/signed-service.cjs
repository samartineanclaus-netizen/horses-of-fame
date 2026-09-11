// SERVER ONLY. A single writer owns the journal and relayer nonce stream.
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path'),os=require('node:os');
const {acquire}=require('./journal-lock.cjs');
const {timingSafeEqual}=require('node:crypto');
const {getAddress,Contract,keccak256}=require('ethers');
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
 constructor({race,relayer,treasuryAddress,journal,batchSize=25,maxGas=5000000n,fromBlock,flushMs=3000,urgentMs=1000,deadlineWindow=60,receiptTimeoutMs=30000,maxAttempts=3,lockDirectory=path.join(os.tmpdir(),'hof-relayer-locks')}){
  if(!Number.isInteger(maxAttempts)||maxAttempts<1)throw Error('invalid retry budget');
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>25||BigInt(maxGas)<=0n||!journal||!treasuryAddress)throw Error('invalid queue configuration');
  if(![flushMs,urgentMs,deadlineWindow,receiptTimeoutMs].every(n=>Number.isFinite(n)&&n>0))throw Error('invalid flush configuration');
  Object.assign(this,{race,relayer,treasuryAddress:getAddress(treasuryAddress),journal,batchSize,maxGas:BigInt(maxGas),fromBlock,flushMs,urgentMs,deadlineWindow,receiptTimeoutMs,maxAttempts});
  this.lockDirectory=lockDirectory;this.releaseJournal=acquire(path.resolve(journal)+'.lock');this.closed=false;
  this.jobs=new Map();this.attempts=new Map();this.busy=false;this.timer=null;this.stopped=true;
  // Truncate only an unacknowledged torn trailing append; malformed full records fail closed.
  try{if(fs.existsSync(journal)){const bytes=fs.readFileSync(journal),end=bytes.lastIndexOf(10)+1;
   for(const line of bytes.subarray(0,end).toString().split('\n').filter(Boolean)){const row=JSON.parse(line);this.jobs.set(row.id,row);}
   if(end<bytes.length)fs.truncateSync(journal,end);
   for(const job of this.jobs.values()){const key=this.nonceKey(job.packet);this.attempts.set(key,(this.attempts.get(key)||0)+(job.attempts||0));}
  }}catch(error){this.releaseJournal();throw error;}
 }
 nonceKey(packet){return packet.intent.voter.toLowerCase()+':'+BigInt(packet.intent.nonce).toString();}
 attemptsFor(packet){return this.attempts.get(this.nonceKey(packet))||0;}
 save(job){
  if(this.closed)throw Error('queue closed');
  const previous=this.jobs.get(job.id);
  if(previous){
   if((job.revision||0)!==(previous.revision||0))throw Error('stale journal transition');
   if((job.attempts||0)<(previous.attempts||0))throw Error('retry counter regression');
   if(previous.txHash&&!job.txHash)throw Error('transaction history regression');
   const terminal=['Vote confirmed','Expired','Rejected'];
   if(terminal.includes(previous.state)&&job.state!==previous.state)throw Error('terminal job transition');
   const allowed={Submitted:['Submitted','Broadcasting','Rejected','Expired','Included on-chain','Vote confirmed'],Broadcasting:['Broadcasting','Pending','RecoveryRequired','Rejected','Included on-chain','Vote confirmed'],Pending:['Pending','Broadcasting','RecoveryRequired','Rejected','Included on-chain','Vote confirmed'],RecoveryRequired:['RecoveryRequired','Broadcasting','Pending','Rejected','Included on-chain','Vote confirmed'],'Included on-chain':['Included on-chain','Vote confirmed','RecoveryRequired']};
   if(!terminal.includes(previous.state)&&!allowed[previous.state]?.includes(job.state))throw Error('invalid job transition');
  }
  job={...job,revision:(previous?.revision||0)+1};
  const fd=fs.openSync(this.journal,'a',0o600);try{fs.writeFileSync(fd,json(job)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  const key=this.nonceKey(job.packet),before=this.jobs.get(job.id)?.attempts||0;
  this.attempts.set(key,(this.attempts.get(key)||0)+(job.attempts||0)-before);this.jobs.set(job.id,job);
 }
 close(){if(this.busy||this.enqueuing)throw Error('worker busy');this.stop();if(!this.closed){this.closed=true;this.releaseWallet?.();this.releaseJournal();}}
 async checkRelayer(){
  if(this.closed)throw Error('queue closed');
  const address=getAddress(await this.relayer.getAddress());
  const forbidden=[await this.race.hofOwner(),await this.race.backendSigner(),await this.race.teamReserveWallet(),this.treasuryAddress].map(getAddress);
  if(forbidden.includes(address))throw Error('relayer must be a separate operational wallet');
  const chain=(await this.race.runner.provider.getNetwork()).chainId;
  if(!this.releaseWallet)this.releaseWallet=acquire(path.join(this.lockDirectory,`${chain}-${address.toLowerCase()}.lock`));
  this.fromBlock=await require('./scan-bound.cjs').lowerBound(this.race,this.fromBlock);
  const binding=json({fromBlock:this.fromBlock,chain:String(chain),race:getAddress(this.race.target),relayer:address,treasury:this.treasuryAddress});
  const file=this.journal+'.binding';
  if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==binding)throw Error('journal deployment mismatch');}
  else{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,binding);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  for(const job of this.jobs.values())if(job.txHash&&!job.broadcast)throw Error('legacy pending journal requires manual reconciliation');
 }
 async enqueue(packet){
  this.enqueuing=(this.enqueuing||0)+1;try{
  await this.checkRelayer();const chain=(await this.race.runner.provider.getNetwork()).chainId,id=digestFor(packet,chain);
  const old=this.jobs.get(id);if(old)return {id,state:old.state};
  if(this.attemptsFor(packet)>=this.maxAttempts)throw Error('sponsorship retry budget exhausted');
  await this.race.submitSigned.staticCall(packet,{gasLimit:this.maxGas});
  // Re-read after every asynchronous validation: another enqueue/worker may have advanced it.
  const current=this.jobs.get(id);if(current)return {id,state:current.state};
  this.save({id,packet,state:'Submitted',attempts:0});
  // Never wait for 25. Admission acknowledgment immediately wakes the worker.
  if(!this.stopped)this.schedule(0);
  return {id,state:'Submitted'};
  }finally{this.enqueuing--;}
 }
 schedule(delay){if(this.stopped)return;clearTimeout(this.timer);this.timer=setTimeout(async()=>{
  try{await this.flush();}catch{/* RPC unavailable: retry, never manufacture inclusion */}
  if(!this.stopped){let delay=this.flushMs;try{const block=await this.race.runner.provider.getBlock('latest');delay=flushDelay(Number(await this.race.closesAt())-block.timestamp,this);}catch{}this.schedule(delay);}
 },delay);this.timer.unref?.();}
 start(){this.stopped=false;this.schedule(0);}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 async reconcileTransactions(){
  const provider=this.race.runner.provider,from=getAddress(await this.relayer.getAddress());let safe=true;
  const groups=new Map();
  for(const j of this.jobs.values())if(j.broadcast&&!j.broadcastResolved){const key=j.broadcast.nonce;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(j.id);}
  for(const ids of groups.values()){
   let job=this.jobs.get(ids[0]),hash=job.txHash,receipt=hash?await provider.getTransactionReceipt(hash):null;
   if(!receipt){
    const latest=await provider.getTransactionCount(from,'latest');
    // A mined replacement (or lost broadcast response) is located by sender/nonce,
    // never guessed from pending count. Bound each recovery pass to 100 blocks.
    if(latest>job.broadcast.nonce){
     const head=await provider.getBlock('latest'),start=job.scanCursor??job.broadcast.startBlock;
     for(let n=start;n<=head.number&&n<start+100;n++){
      const block=await provider.getBlock(n,true);
      for(const tx of block.prefetchedTransactions)if(getAddress(tx.from)===from&&tx.nonce===job.broadcast.nonce){hash=tx.hash;receipt=await provider.getTransactionReceipt(hash);break;}
      if(receipt)break;
     }
     if(!receipt)for(const id of ids)this.save({...this.jobs.get(id),scanCursor:Math.min(head.number+1,start+100)});
    }
   }
   if(!receipt){
    for(const id of ids){const j=this.jobs.get(id);if(j.state==='Broadcasting')this.save({...j,state:'RecoveryRequired'});}
    safe=false;continue;
   }
   const block=await provider.getBlock(receipt.blockNumber);
   if(!block||block.hash!==receipt.blockHash){safe=false;continue;}
   for(const id of ids){
    const j=this.jobs.get(id),state=await inclusionState(this.race,j.packet,this.fromBlock);
    this.save({...j,txHash:hash,broadcastResolved:true,state:state==='Submitted'?'Rejected':state,reason:state==='Submitted'?'relayer nonce mined without vote; direct fallback available':undefined});
   }
  }
  return safe;
 }
 // Explicit operator action only, never an HTTP endpoint or automatic timer retry.
 // Replace only a known pending transaction with exactly the same nonce and calldata.
 async replacePending(id){
  if(this.busy)throw Error('worker busy');this.busy=true;
  try{
   await this.checkRelayer();const job=this.jobs.get(id),provider=this.race.runner.provider;
   if(!job?.txHash||job.broadcastResolved)throw Error('no known pending transaction');
   if(await provider.getTransactionReceipt(job.txHash))throw Error('reconcile mined transaction first');
   const tx=await provider.getTransaction(job.txHash),from=getAddress(await this.relayer.getAddress());
   if(!tx||getAddress(tx.from)!==from||tx.nonce!==job.broadcast.nonce||tx.to!==job.broadcast.to||keccak256(tx.data)!==job.broadcast.dataHash||tx.value!==0n)throw Error('transaction status/nonce unknown');
   if(await provider.getTransactionCount(from,'latest')>tx.nonce)throw Error('nonce already mined');
   const head=await provider.getBlock('latest');if(BigInt(head.timestamp)>=await this.race.closesAt())throw Error('voting closed');
   const fees=tx.type===2?{maxFeePerGas:tx.maxFeePerGas*125n/100n+1n,maxPriorityFeePerGas:tx.maxPriorityFeePerGas*125n/100n+1n}:{gasPrice:tx.gasPrice*125n/100n+1n};
   const members=[...this.jobs.values()].filter(j=>j.broadcast?.nonce===tx.nonce&&!j.broadcastResolved);
   if(members.some(j=>BigInt(head.timestamp)>BigInt(j.packet.intent.deadline)))throw Error('intent deadline expired');
   const contract=this.race.connect(this.relayer);
   if(members.length===1)await contract.submitSigned.staticCall(members[0].packet,{gasLimit:tx.gasLimit});
   else await contract.submitBatch.staticCall(members.map(j=>j.packet),{gasLimit:tx.gasLimit});
   if(members.some(j=>this.attemptsFor(j.packet)>=this.maxAttempts))throw Error('retry budget exhausted');
   for(const j of members)this.save({...j,state:'Broadcasting',attempts:j.attempts+1});
   const replacement=await this.relayer.sendTransaction({to:tx.to,data:tx.data,value:0,nonce:tx.nonce,gasLimit:tx.gasLimit,...fees});
   for(const j of members)this.save({...this.jobs.get(j.id),state:'Pending',txHash:replacement.hash,previousTxHash:tx.hash});
   return replacement.hash;
  }finally{this.busy=false;}
 }

 async flush(){
  if(this.busy)return;this.busy=true;
  try{
   await this.checkRelayer();const provider=this.race.runner.provider;
   if(!await this.reconcileTransactions())return;
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
      const nonce=await provider.getTransactionCount(await this.relayer.getAddress(),'pending');
      if(nonce!==await provider.getTransactionCount(await this.relayer.getAddress(),'latest'))throw Error('operational wallet has unresolved external nonce');
      const request=await send().populateTransaction(args(),{gasLimit:padded,nonce});
      const broadcast={nonce,to:request.to,dataHash:keccak256(request.data),value:'0',gasLimit:String(padded),startBlock:block.number};
      for(let i=0;i<group.length;i++){this.save({...this.jobs.get(group[i].id),state:'Broadcasting',broadcast,attempts:(this.jobs.get(group[i].id).attempts||0)+1});group[i]=this.jobs.get(group[i].id);}
      const tx=await send()(args(),{gasLimit:padded,nonce});
      for(const job of group)this.save({...this.jobs.get(job.id),state:'Pending',txHash:tx.hash});
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
function createSignedServer({race,admissionSigner,privateKey,queue,maxConcurrent=4,limiter=new RateLimiter(),walletLimiter=new RateLimiter({limit:10}),ingressToken=process.env.HOF_SIGNED_INGRESS_TOKEN}){
 if(typeof ingressToken!=='string'||ingressToken.length<32)throw Error('Private ingress token required');
 let active=0;
 return http.createServer(async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(json(body));};
  if(req.method!=='POST'||!['/vote/prepare','/vote/submit'].includes(req.url))return send(404,{error:'not found'});
  const supplied=Buffer.from(req.headers.authorization||''),expected=Buffer.from(`Bearer ${ingressToken}`);
  if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return send(401,{error:'unauthorized ingress'});
  // No quota shared by anonymous requests behind a proxy. Forwarded headers are ignored.
  if(active>=maxConcurrent)return send(503,{error:'try later'});active++;req.setTimeout(10000,()=>req.destroy());
  try{
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>131072)return send(413,{error:'request too large'});chunks.push(chunk);}
   const packet=JSON.parse(Buffer.concat(chunks).toString());
   if(getAddress(await admissionSigner.getAddress())===queue.treasuryAddress)throw Error('unsafe treasury signer');
   await verifyIntentSignature(race,packet);
   const wallet=getAddress(packet.intent.voter),provider=race.runner.provider;
   const genesis=new Contract(await race.genesis(),['function balanceOf(address) view returns(uint256)'],provider);
   // Anonymous key generation cannot fill the quota map: current NFT possession
   // and current nonce are checked before allocating a wallet quota entry.
   if(await genesis.balanceOf(wallet)===0n||await race.nonces(wallet)!==BigInt(packet.intent.nonce))throw Error('not currently eligible');
   const key=`${(await provider.getNetwork()).chainId}:${race.target.toLowerCase()}:${wallet}`;
   if(!limiter.allow(key)||!walletLimiter.allow(key))return send(429,{error:'rate limited'});
   if(req.url==='/vote/prepare')return send(200,await admitSigned(race,admissionSigner,privateKey,packet));
   return send(200,await queue.enqueue(packet));
  }catch{if(!res.headersSent&&!res.destroyed)send(400,{error:'vote not admitted'});}finally{active--;}
 });
}
module.exports={SignedVoteQueue,RateLimiter,createSignedServer,flushDelay};
