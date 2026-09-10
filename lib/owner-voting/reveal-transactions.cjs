// SERVER ONLY. One durable nonce lane for the dedicated admission/settlement signer.
const fs=require('node:fs'),path=require('node:path');
const {getAddress,keccak256}=require('ethers');
const {acquire}=require('./journal-lock.cjs');
const {json}=require('./signed-ballot.cjs');
class RevealTransactions {
 constructor({signer,file,lockDirectory,maxGas=5000000n}){
  this.signer=signer;this.provider=signer.provider;this.file=file;this.lockDirectory=lockDirectory;this.maxGas=BigInt(maxGas);this.busy=false;
  if(this.maxGas<=0n||this.maxGas>5000000n)throw Error('invalid settlement gas cap');
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});this.release=acquire(file+'.lock');
  try{this.state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,plans:{},pending:null};if(this.state.version!==1||!this.state.plans)throw Error('invalid settlement journal');}catch(e){this.release();throw e;}
 }
 persist(){const tmp=this.file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,json(this.state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,this.file);const dir=fs.openSync(path.dirname(this.file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 async bind(board){const from=getAddress(await this.signer.getAddress()),chain=String((await this.provider.getNetwork()).chainId),binding=json({board:getAddress(board),from,chain});if(this.state.binding&&this.state.binding!==binding)throw Error('settlement journal binding mismatch');if(!this.releaseWallet)this.releaseWallet=acquire(path.join(this.lockDirectory,`${chain}-${from.toLowerCase()}.lock`));this.state.binding=binding;this.persist();}
 plan(race,hash){const old=this.state.plans[race];if(old&&old!==hash)throw Error('recomputed result mismatch');if(!old){this.state.plans[race]=hash;this.persist();}}
 async reconcile(){
  const job=this.state.pending;if(!job)return true;
  let receipt=job.hash?await this.provider.getTransactionReceipt(job.hash):null;
  if(!receipt&&await this.provider.getTransactionCount(job.from,'latest')>job.nonce){
   const head=await this.provider.getBlock('latest'),start=job.scanCursor??job.startBlock;
   for(let n=start;n<=head.number&&n<start+100;n++){
    const block=await this.provider.getBlock(n,true);if(!block)throw Error('missing recovery block');
    for(const tx of block.prefetchedTransactions)if(getAddress(tx.from)===job.from&&tx.nonce===job.nonce){receipt=await this.provider.getTransactionReceipt(tx.hash);break;}
    if(receipt)break;
   }
   if(!receipt){job.scanCursor=Math.min(head.number+1,start+100);this.persist();}
  }
  if(!receipt)return false; // Never resend an unknown/dropped transaction.
  const [block,final]=await Promise.all([this.provider.getBlock(receipt.blockNumber),this.provider.getBlock('finalized')]);
  if(!block||block.hash!==receipt.blockHash||!final||final.number<block.number)return false;
  const tx=await this.provider.getTransaction(receipt.hash);
  if(!tx||getAddress(tx.from)!==job.from||tx.nonce!==job.nonce||tx.to?.toLowerCase()!==job.to.toLowerCase()||keccak256(tx.data)!==job.dataHash||tx.value!==0n||receipt.status!==1){
   job.blocked='mined transaction mismatch or revert; operator review required';this.persist();return false;
  }
  this.state.pending=null;this.persist();return true;
 }
 async send(contract,method,args){
  if(this.busy)throw Error('settlement lane busy');this.busy=true;
  try{
   if(!await this.reconcile())return false;
   const from=getAddress(await this.signer.getAddress()),nonce=await this.provider.getTransactionCount(from,'pending');
   if(nonce!==await this.provider.getTransactionCount(from,'latest'))throw Error('unresolved external settlement nonce');
   const fn=contract.connect(this.signer)[method];await fn.staticCall(...args);
   const estimate=await fn.estimateGas(...args),gasLimit=estimate+estimate/5n;if(gasLimit>this.maxGas)throw Error('settlement gas cap exceeded');
   const request=await fn.populateTransaction(...args),head=await this.provider.getBlock('latest');
   this.state.pending={from,nonce,to:request.to,data:request.data,dataHash:keccak256(request.data),gasLimit:String(gasLimit),startBlock:head.number,attempts:1};this.persist();
   // A lost response leaves the pre-broadcast intent durable for nonce reconciliation.
   const tx=await this.signer.sendTransaction({...request,gasLimit,nonce});this.state.pending.hash=tx.hash;this.persist();return true;
  }finally{this.busy=false;}
 }
 // Explicit local operator action only. Not exposed over HTTP or used by scheduler.
 async replacePending(){
  if(this.busy)throw Error('settlement lane busy');this.busy=true;
  try{
   const j=this.state.pending;if(!j?.hash||j.blocked||j.attempts>=3)throw Error('no replaceable known pending transaction');
   if(await this.provider.getTransactionReceipt(j.hash))throw Error('reconcile mined transaction first');
   const tx=await this.provider.getTransaction(j.hash);
   if(!tx||getAddress(tx.from)!==j.from||tx.nonce!==j.nonce||tx.to?.toLowerCase()!==j.to.toLowerCase()||keccak256(tx.data)!==j.dataHash||tx.value!==0n||await this.provider.getTransactionCount(j.from,'latest')>j.nonce)throw Error('unknown transaction or nonce');
   await this.provider.call({from:j.from,to:j.to,data:j.data,gasLimit:BigInt(j.gasLimit)});
   const fees=tx.type===2?{maxFeePerGas:tx.maxFeePerGas*125n/100n+1n,maxPriorityFeePerGas:tx.maxPriorityFeePerGas*125n/100n+1n}:{gasPrice:tx.gasPrice*125n/100n+1n};
   j.attempts++;this.persist();const replacement=await this.signer.sendTransaction({to:j.to,data:j.data,nonce:j.nonce,value:0,gasLimit:BigInt(j.gasLimit),...fees});j.hash=replacement.hash;this.persist();return replacement.hash;
  }finally{this.busy=false;}
 }
 close(){if(this.busy)throw Error('settlement lane busy');this.releaseWallet?.();this.release();}
}
module.exports={RevealTransactions};
