// SERVER ONLY. Polling wakes reconciliation; chain + journals are authoritative.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {getAddress,keccak256,AbiCoder}=require('ethers');
const {createPublicKey,createPrivateKey,KeyObject}=require('node:crypto');
const {acquire}=require('./journal-lock.cjs');
const {RevealTransactions}=require('./reveal-transactions.cjs');
const {SignedVoteQueue,createSignedServer}=require('./signed-service.cjs');
const {buildRelayedResult}=require('./signed-backend.cjs');
class RaceRevealService {
 constructor({board,signer,relayer,treasuryAddress,directory,keyFor,raceAt,factoryAt,ingressToken,allowLocal=false,raceDeploymentBlocks={},pollMs=1000,scoreBatch=25,buildResult=buildRelayedResult,lockDirectory=path.join(os.tmpdir(),'hof-relayer-locks')}){
  if(!Number.isInteger(scoreBatch)||scoreBatch<1||scoreBatch>25||!Number.isInteger(pollMs)||pollMs<10||pollMs>1000)throw Error('invalid scheduler limits');
  if(typeof ingressToken!=='string'||ingressToken.length<32)throw Error('private ingress token required');
  Object.assign(this,{board,signer,relayer,treasuryAddress,directory,keyFor,raceAt,factoryAt,ingressToken,allowLocal,pollMs,scoreBatch,buildResult,lockDirectory});
  this.raceDeploymentBlocks=raceDeploymentBlocks;this.scanBounds=new Map();
  this.provider=board.runner.provider;this.cache=new Map();this.cleaned=new Set();this.verifiedProposals=new Set();this.busy=false;this.stopped=true;this.status='Starting';
  fs.mkdirSync(directory,{recursive:true,mode:0o700});this.release=acquire(path.join(directory,'service.lock'));
  try{this.transactions=new RevealTransactions({signer,file:path.join(directory,'settlement.json'),lockDirectory});}catch(e){this.release();throw e;}
  // Fixed handlers preserve authenticated ingress/rate limits of Phase1.
  this.http=http.createServer((req,res)=>{if(!this.admissionServer){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"no active canonical voting race"}');return;}this.admissionServer.emit('request',req,res);});
 }
 async validate(){
  const chain=(await this.provider.getNetwork()).chainId;if(chain!==46630n&&!(this.allowLocal&&chain===31337n))throw Error('testnet service only');
  const owner=getAddress(await this.board.hofOwner()),admission=getAddress(await this.board.backendSigner()),team=getAddress(await this.board.teamReserveWallet()),relay=getAddress(await this.relayer.getAddress()),treasury=getAddress(this.treasuryAddress);
  if(admission!==getAddress(await this.signer.getAddress())||new Set([owner,admission,team,relay,treasury]).size!==5)throw Error('unsafe service roles');
  await this.transactions.bind(this.board.target);
  const factory=await this.factoryAt(await this.board.raceFactory());
  if(getAddress(await factory.board())!==getAddress(this.board.target)||getAddress(await factory.genesis())!==getAddress(await this.board.genesisContract()))throw Error('wrong canonical factory');return factory;
 }
 async key(race){const key=await this.keyFor(await race.keyId());const object=typeof key==='string'||Buffer.isBuffer(key)?createPrivateKey(key):KeyObject.from(key);const pub=createPublicKey(object).export({type:'spki',format:'der'});if(keccak256(pub)!==await race.keyId())throw Error('decryption key mismatch');return crypto.subtle.importKey('pkcs8',object.export({type:'pkcs8',format:'der'}),{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);}
 async canonical(factory,index){const address=await this.board.races(index),race=await this.raceAt(address),origin=await factory.provenance(address);
  if(!await this.board.registeredRace(address)||Number(origin.chapter)!==1||Number(origin.season)!==Math.floor(index/10)+1||Number(origin.number)!==index%10+1||getAddress(await race.genesis())!==getAddress(await this.board.genesisContract())||await race.hofOwner()!==await this.board.hofOwner()||await race.backendSigner()!==await this.board.backendSigner()||await race.teamReserveWallet()!==await this.board.teamReserveWallet())throw Error('noncanonical race');
  const configured=this.raceDeploymentBlocks[getAddress(address).toLowerCase()];
  if(configured===undefined)throw Error('Missing race deployment block configuration');
  const bound=await require('./scan-bound.cjs').verifyBound({race,factory,board:this.board,fromBlock:configured,directory:this.directory});
  this.scanBounds.set(address.toLowerCase(),bound);return race;
 }
 queueFor(race){return new SignedVoteQueue({race,relayer:this.relayer,treasuryAddress:this.treasuryAddress,fromBlock:this.scanBounds.get(race.target.toLowerCase()),journal:path.join(this.directory,race.target.toLowerCase()+'.journal'),lockDirectory:this.lockDirectory});}
 async verifyProposal(race,result){
  if(this.verifiedProposals.has(race.target))return true;
  const head=await this.provider.getBlock('latest'),logs=[];
  for(let from=require('./scan-bound.cjs').blockNumber(this.scanBounds.get(race.target.toLowerCase()));from<=head.number;from+=2000)logs.push(...await race.queryFilter(race.filters.ResultProposed(),from,Math.min(from+1999,head.number)));
  if(logs.length!==1)throw Error('missing or duplicate result proposal');
  const log=logs[0],[receipt,tx,block,final]=await Promise.all([this.provider.getTransactionReceipt(log.transactionHash),this.provider.getTransaction(log.transactionHash),this.provider.getBlock(log.blockNumber),this.provider.getBlock('finalized')]);
  if(!receipt||receipt.status!==1||!block||receipt.blockHash!==block.hash||log.blockHash!==block.hash||!final||final.number<block.number)return false;
  // The supported service path submits directly to the race. A foreign/nested
  // proposal cannot silently substitute aggregate totals while retaining a root.
  if(!tx||tx.to?.toLowerCase()!==race.target.toLowerCase())throw Error('unsupported proposal transaction');
  const call=race.interface.parseTransaction({data:tx.data,value:tx.value});
  if(!call||call.name!=='proposeResult'||call.args[1]!==result.root||call.args[0].some((v,i)=>v!==result.totals[i]))throw Error('on-chain proposal totals mismatch');
  this.verifiedProposals.add(race.target);return true;
 }
 async tick(){
  if(this.busy)return;this.busy=true;
  try{
   const factory=await this.validate();if(!await this.transactions.reconcile()){this.status='Settlement transaction recovery required';return;}
   const count=Number(await this.board.raceCount());if(count>60)throw Error('unsupported chapter');
   for(let i=0;i<count;i++){
    const race=await this.canonical(factory,i),head=await this.provider.getBlock('latest'),close=Number(await race.closesAt()),open=Number(await race.opensAt());
    if(head.timestamp<open)continue;
    if(head.timestamp<close){
     if(this.queue&&this.queue.race.target!==race.target)throw Error('previous voting nonce unresolved');
     if(!this.queue){const key=await this.key(race);this.queue=this.queueFor(race);this.admissionServer=createSignedServer({race,admissionSigner:this.signer,privateKey:key,queue:this.queue,ingressToken:this.ingressToken});}
     await this.queue.flush();this.status='Voting Open';continue;
    }
    // Reconcile pre-restart queues, even for an already finalized race.
    const journal=path.join(this.directory,race.target.toLowerCase()+'.journal');
    if(!this.cleaned.has(race.target)&&(fs.existsSync(journal)||this.queue?.race.target===race.target)){
     const q=this.queue?.race.target===race.target?this.queue:this.queueFor(race);
     try{await q.flush();if(!await q.reconcileTransactions()){this.status='Voting transaction recovery required';return;}}finally{if(q!==this.queue)q.close();}
     if(q===this.queue){this.admissionServer=null;q.close();this.queue=null;}this.cleaned.add(race.target);
    }
    if(await race.finalized()){this.cache.delete(race.target);continue;}
    this.status='Voting Closed';const final=await this.provider.getBlock('finalized');if(!final||final.timestamp<close)continue;
    if(!await race.frozen()){await this.transactions.send(race,'freeze',[]);return;}
    this.status='Preparing Race Reveal';
    let result=this.cache.get(race.target);
    if(!result){result=await this.buildResult(race,this.signer,await this.key(race),{fromBlock:this.scanBounds.get(race.target.toLowerCase())});const hash=keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','uint256[22]','bytes32'],[await race.frozenRecordsHash(),result.totals,result.root]));this.transactions.plan(race.target,hash);this.cache.set(race.target,result);}
    if(!await race.proposed()){await this.transactions.send(race,'proposeResult',[result.totals,result.root,result.signature]);return;}
    if(await race.scoresRoot()!==result.root)throw Error('on-chain result mismatch');
    if(!await this.verifyProposal(race,result))return;
    const cursor=Number(await race.processedCount());if(cursor>result.points.length)throw Error('invalid scoring cursor');
    if(cursor<result.points.length){const end=cursor+this.scoreBatch;await this.transactions.send(race,'prepareScores',[cursor,result.points.slice(cursor,end),result.proofs.slice(cursor,end)]);return;}
    await this.transactions.send(race,'finalize',[]);return;
   }
   if(!this.queue)this.status='Idle / finalized races reconciled';
  }finally{this.busy=false;}
 }
 start(){if(!this.stopped)return;this.stopped=false;const run=async()=>{try{await this.tick();}catch{this.status='Blocked: chain, journal or ballot verification failed';}if(!this.stopped)this.timer=setTimeout(run,this.pollMs);};this.timer=setTimeout(run,0);}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 async close(){this.stop();while(this.busy||this.queue?.enqueuing)await new Promise(r=>setTimeout(r,10));this.admissionServer=null;if(this.http.listening){this.http.closeIdleConnections?.();await new Promise(r=>this.http.close(r));}this.queue?.close();this.transactions.close();this.release();}
}
function artifact(name){return JSON.parse(fs.readFileSync(path.join(__dirname,'../../artifacts/contracts',name+'.sol',name+'.json'))).abi;}
module.exports={RaceRevealService,artifact};
