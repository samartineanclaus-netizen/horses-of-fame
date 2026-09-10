const MAX_MINT_PER_TX=25n, PRICE=30_000_000n;
function planQuantity(value){if(!/^\d+$/.test(String(value)))throw Error('Enter a positive whole quantity.');const n=BigInt(value);if(n<1n||n>2000n)throw Error('Quantity must be 1–2000.');return n;}
function summary(j){return `${j.confirmed} NFT minted; ${BigInt(j.total)-BigInt(j.confirmed)} NFT not purchased. Confirmed batches remain valid.`;}
// Persist before requesting a signature/broadcast. An ambiguous send is never automatically retried.
async function runMint({quantity,journal,read,approve,mint,wait,save,progress}){
 const j=journal||{total:String(planQuantity(quantity)),confirmed:'0',pending:null};
 const persist=()=>save({...j,pending:j.pending?{...j.pending}:null});
 async function settle(){const p=j.pending;if(!p)return;
  if(!p.hash)throw Error('Transaction submission status is unknown. Check wallet activity and nonce before any retry.');
  const label=p.kind==='mint'?`Mint ${Math.floor(Number(j.confirmed)/25)+1}/${Math.ceil(Number(j.total)/25)}`:'Approval';
  progress(`${label} pending — checking transaction ${p.hash}. ${summary(j)} Pending transactions may still confirm.`);
  const receipt=await wait(p.hash,p);
  if(receipt.status!=='success'){j.pending=null;persist();throw Error('Transaction reverted.');}
  if(p.kind==='mint')j.confirmed=String(BigInt(j.confirmed)+BigInt(p.quantity));
  j.pending=null;persist();
 }
 async function send(kind,n,fn){j.pending={kind,quantity:String(n),hash:null};persist();
  try{const hash=await fn();if(typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw Error('Invalid transaction hash.');j.pending.hash=hash;persist();}
  catch(e){if(e.notBroadcast||e.code===4001||e.cause?.code===4001){j.pending=null;persist();}throw e;}
  await settle();
 }
 try{
  persist();await settle();
  if(BigInt(j.confirmed)===BigInt(j.total)){progress(`Complete. ${summary(j)}`);return j;}
  let state=await read();const remaining=BigInt(j.total)-BigInt(j.confirmed);
  if(state.timestamp>=state.deadline)throw Error('Mint deadline reached.');
  if(state.remaining<remaining)throw Error(`Only ${state.remaining} Public NFT remain; requested remainder is unavailable.`);
  if(state.balance<remaining*PRICE)throw Error('Insufficient USDC balance.');
  if(state.allowance<remaining*PRICE){
   if(BigInt(j.confirmed)>0n)throw Error('Insufficient USDC allowance for remaining batches.');
   progress(`Approve ${remaining*PRICE/1_000_000n} USDC; then ${Math.ceil(Number(j.total)/25)} separate mint transactions.`);
   await send('approval',0n,()=>approve(remaining*PRICE));
  }
  while(BigInt(j.confirmed)<BigInt(j.total)){
   const left=BigInt(j.total)-BigInt(j.confirmed),n=left>MAX_MINT_PER_TX?MAX_MINT_PER_TX:left;
   state=await read();
   if(state.timestamp>=state.deadline)throw Error('Mint deadline reached between batches.');
   if(state.remaining<n)throw Error(`Only ${state.remaining} Public NFT remain; next batch needs ${n}.`);
   if(state.balance<n*PRICE)throw Error('Insufficient USDC balance for next batch.');
   if(state.allowance<n*PRICE)throw Error('Insufficient USDC allowance for next batch.');
   progress(`Mint ${Math.floor(Number(j.confirmed)/25)+1}/${Math.ceil(Number(j.total)/25)} — ${n} NFT. ${summary(j)}`);
   // mint performs gas estimation and wallet/chain verification before broadcasting.
   await send('mint',n,()=>mint(n));
  }
  progress(`Complete. ${summary(j)}`);return j;
 }catch(e){progress(`${e.message} ${summary(j)}`);throw e;}
}
module.exports={MAX_MINT_PER_TX,PRICE,planQuantity,runMint,summary};
