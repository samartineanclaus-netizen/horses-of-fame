const fs=require('node:fs'),path=require('node:path');
const {acquire}=require('../owner-voting/journal-lock.cjs');
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
function plan(s){
 if(s.chain!==46630n||!s.canonical||!s.testOnly||s.decimals!==6||s.price!==30000000n||s.cap!==2000||s.batchCap!==25)throw Error('Wrong chain/token/canonical configuration');
 if(s.roles.map(x=>x.toLowerCase()).includes(s.buyer.toLowerCase()))throw Error('Operational wallet cannot be buyer');
 if(!Number.isInteger(s.sold)||s.sold<0||s.sold>2000)throw Error('Invalid sold');
 const remaining=2000-s.sold;
 if(remaining&&s.now>=s.deadline)throw Error('Mint deadline expired');
 if(remaining&&s.paused)throw Error('Mint paused');
 const quantities=[];for(let n=remaining;n>0;n-=25)quantities.push(Math.min(n,25));
 const required=BigInt(remaining)*s.price;
 return {remaining,quantities,required,funding:required>s.balance?required-s.balance:0n,approval:s.allowance<required?required:0n};
}
function journal(file,binding){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const release=acquire(file+'.lock');
 try{
 const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{version:1,binding,entries:[]};
 if(state.version!==1||json(state.binding)!==json(binding)||!Array.isArray(state.entries))throw Error('Journal binding mismatch');
 const save=()=>{const temp=file+'.tmp';const fd=fs.openSync(temp,'w',0o600);try{fs.writeFileSync(fd,json(state));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);};
 return {state,save,release};
 }catch(e){release();throw e;}
}
async function reconcile(api,j){
 for(const e of j.state.entries){if(e.status==='confirmed')continue;
 if(!e.hash)throw Error('Unknown broadcast status: manual nonce reconciliation required');
 const receipt=await api.receipt(e.hash);if(!receipt||receipt.status!==1)throw Error('Ambiguous/failed receipt: STOP for manual reconciliation');
 await api.verify(e,receipt);const s=await api.read();plan(s);e.soldAfter=s.sold;e.status='confirmed';j.save();
 }
}
async function transact(api,j,kind,amount){
 const s=await api.read(),p=plan(s);if(!p.remaining)return;
 if(kind==='fund')amount=p.funding;if(kind==='approve')amount=p.approval;if(!amount)return;
 if(kind==='mint'&&(amount<1||amount>25||amount>p.remaining))throw Error('Invalid batch');
 if(kind==='mint'&&(s.balance<BigInt(amount)*s.price||s.allowance<BigInt(amount)*s.price))throw Error('Insufficient balance/allowance');
 const quote=await api.quote(kind,amount);if(!quote.sufficient)throw Error('Insufficient ETH with gas margin');
 const e={kind,amount:String(amount),soldBefore:s.sold,status:'broadcast-unknown',hash:null,...await api.identity(kind)};
 j.state.entries.push(e);j.save(); // Persist intent BEFORE any possible network broadcast.
 const tx=await api.send(kind,amount,quote,e.nonce);e.hash=tx.hash;e.status='pending';j.save();
 const receipt=await api.wait(tx.hash);if(!receipt||receipt.status!==1)throw Error('Ambiguous/failed receipt: STOP, no automatic retry');
 await api.verify(e,receipt);const after=await api.read();plan(after);e.soldAfter=after.sold;e.status='confirmed';j.save();
 if(kind==='mint'&&after.sold<s.sold+amount)throw Error('Sold did not increase as expected');
}
async function execute(api,{mode,file,binding}){
 if(!['fund','approve','mint'].includes(mode))throw Error('Explicit phase required');
 const j=journal(file,binding);try{
 await reconcile(api,j);let s=await api.read(),p=plan(s);if(!p.remaining)return {status:'sold-out/no-op',sold:s.sold};
 if(mode==='fund'){
  if(j.state.entries.some(e=>e.kind==='fund'&&e.status==='confirmed'))return {status:'funding already confirmed; no repeat',sold:s.sold};
  if(p.funding)await transact(api,j,'fund',p.funding);return {status:'funding complete'};
 }
 if(s.balance<p.required)throw Error('Separate funding phase required');
 if(mode==='approve'){
  if(!p.approval)return {status:'approval already sufficient; no repeat',sold:s.sold};
  await transact(api,j,'approve',p.approval);
  return {status:'approval complete',sold:s.sold};
 }
 if(p.approval)throw Error('Separate approval phase required');
 while(true){s=await api.read();p=plan(s);if(!p.remaining)break;await transact(api,j,'mint',p.quantities[0]);}
 return {status:'sold-out',sold:s.sold};
 }finally{j.release();}
}
async function dryRun(api){
 const s=await api.read(),p=plan(s),estimates={};
 if(!p.remaining)return {status:'GO/no-op',sold:s.sold,mintTransactions:0,required:'0',funding:'0',estimates};
 for(const [label,kind,amount]of [['funding','fund',p.funding],['approve','approve',p.approval],['first','mint',p.quantities[0]],['representative','mint',Math.min(25,p.remaining)],['last','mint',p.quantities.at(-1)]]){
  if(!amount){estimates[label]={skipped:true};continue;}
  try{estimates[label]=await api.quote(kind,amount);}catch{estimates[label]={unavailable:true,reason:'Current state does not allow estimation (balance/allowance/supply/RPC); no state override used'};}
 }
 const mintQuotes=['first','representative','last'].map(k=>estimates[k]).filter(q=>q.gasLimit);
 const complete=mintQuotes.length===3&&!Object.values(estimates).some(q=>q.unavailable);
 let budget=null;
 if(complete){const maxGas=mintQuotes.reduce((m,q)=>q.gasLimit>m?q.gasLimit:m,0n),fee=mintQuotes.reduce((m,q)=>q.feeCap>m?q.feeCap:m,0n);
 const buyer=BigInt(p.quantities.length)*maxGas*fee+(estimates.approve.costCap||0n),funder=estimates.funding.costCap||0n;
 budget={buyerWei:buyer,funderWei:funder,buyerSufficient:s.buyerETH>=buyer,funderSufficient:s.funderETH>=funder};}
 return {status:complete&&budget.buyerSufficient&&budget.funderSufficient?'GO/estimate-only':'NO-GO/incomplete estimation or gas budget',sold:s.sold,mintTransactions:p.quantities.length,quantities:p.quantities,required:p.required,funding:p.funding,approval:p.approval,buyerETH:s.buyerETH,funderETH:s.funderETH,gasPrice:s.gasPrice,estimates,budget,note:'Representative/last estimates use current state, not a simulated future batch. Budget is a projection, not a fee guarantee; data/L1 charges may add cost.'};
}
module.exports={plan,execute,dryRun,json};
