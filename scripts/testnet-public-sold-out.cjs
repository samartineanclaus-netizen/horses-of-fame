// TESTNET ONLY. Default is read-only. Never imported by a worker or deployment script.
const fs=require('node:fs'),path=require('node:path');
const ethers=require('ethers');
const {defaults,runtimeMatches}=require('./validate-v7-canonical-deployment.cjs');
const {checkArtifacts}=require('./preflight-v7-readiness.cjs');
const {plan,execute,dryRun,json}=require('../lib/testnet-ops/sold-out.cjs');
const ADDRESSES={token:defaults.HOF_USDC_ADDRESS,genesis:defaults.GENESIS_ADDRESS,sale:defaults.GENESIS_SALE_ADDRESS};
const artifact=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../artifacts/contracts',n+'.sol',n+'.json')));
function privateWallet(file,provider,expected){
 if(!file||!path.isAbsolute(file)||fs.realpathSync(file).startsWith(path.resolve(__dirname,'..')+path.sep))throw Error('Absolute key file outside repository required');const st=fs.statSync(file);if(!st.isFile()||(st.mode&0o077))throw Error('Key file must be0600');
 const w=new ethers.Wallet(fs.readFileSync(file,'utf8').trim(),provider);if(w.address!==ethers.getAddress(expected))throw Error('Key/address mismatch');return w;
}
async function makeAPI(provider,env,mode='dry-run'){
 for(const [key,value]of Object.entries({HOF_USDC_ADDRESS:ADDRESSES.token,GENESIS_ADDRESS:ADDRESSES.genesis,GENESIS_SALE_ADDRESS:ADDRESSES.sale}))if(env[key]&&ethers.getAddress(env[key])!==ethers.getAddress(value))throw Error('Configured address differs from approved deployment');
 const buyer=ethers.getAddress(env.HOF_TEST_BUYER_ADDRESS);if(buyer===ethers.ZeroAddress)throw Error('Zero buyer');
 const funder=ethers.getAddress(env.HOF_TEST_FUNDER_ADDRESS||defaults.HOF_OWNER_ADDRESS);
 const token=new ethers.Contract(ADDRESSES.token,artifact('MockUSDC').abi,provider),genesis=new ethers.Contract(ADDRESSES.genesis,artifact('GenesisHorses').abi,provider),sale=new ethers.Contract(ADDRESSES.sale,artifact('HOFGenesisSale').abi,provider);
 const runtime=async(name,address,tag)=>{const a=artifact(name),file=path.join(__dirname,'../artifacts/contracts',name+'.sol',name+'.dbg.json'),dbg=JSON.parse(fs.readFileSync(file)),build=JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),dbg.buildInfo))),refs=build.output.contracts[a.sourceName][name].evm.deployedBytecode.immutableReferences;
 return runtimeMatches(await provider.getCode(address,tag),a.deployedBytecode,refs);};
 const board=new ethers.Contract(defaults.HOF_TRUSTED_LEADERBOARDS,artifact('HOFTrustedLeaderboards').abi,provider);
 const api={async read(){
  const chain=(await provider.getNetwork()).chainId;if(chain!==46630n)throw Error('Only testnet46630');
  const head=await provider.getBlock('latest'),o={blockTag:head.number};
  let canonical=await runtime('MockUSDC',token.target,head.number)&&await runtime('GenesisHorses',genesis.target,head.number)&&await runtime('HOFGenesisSale',sale.target,head.number);
  canonical&&=await sale.genesis(o)===genesis.target&&await sale.paymentToken(o)===token.target&&await genesis.saleContract(o)===sale.target&&await sale.prizePoolTreasury(o)===defaults.SEASON_REWARDS_ADDRESS;
  canonical&&=await genesis.MAX_SUPPLY(o)===2222n&&await genesis.PUBLIC_MINT_SUPPLY(o)===2000n&&await genesis.COMMUNITY_ALLOCATION_SUPPLY(o)===111n&&await genesis.TEAM_RESERVE_SUPPLY(o)===111n&&await genesis.MAX_MINT_PER_TX(o)===25n;
  canonical&&=await board.genesisContract(o)===genesis.target&&await board.backendSigner(o)===defaults.HOF_ADMISSION_SIGNER&&await board.hofOwner(o)===defaults.HOF_OWNER_ADDRESS;
  const sold=Number(await sale.sold(o));canonical&&=await genesis.publicMinted(o)===BigInt(sold);
  const roles=[await sale.owner(o),await genesis.owner(o),await genesis.teamWallet(o),await sale.auditWallet(o),await sale.founderWallet(o),await board.backendSigner(o),defaults.HOF_RELAYER_ADDRESS,await sale.prizePoolTreasury(o)];
  return {chain,canonical,testOnly:await token.testOnly(o)&&await token.name(o)==='TEST ONLY / NO VALUE - MockUSDC',decimals:Number(await token.decimals(o)),price:await sale.MINT_PRICE(o),cap:Number(await sale.PUBLIC_SUPPLY(o)),batchCap:Number(await sale.MAX_MINT_PER_TX(o)),roles,buyer,sold,now:head.timestamp,deadline:Number(await sale.deadline(o)),paused:await sale.paused(o)||await genesis.paused(o),balance:await token.balanceOf(buyer,o),allowance:await token.allowance(buyer,sale.target,o),buyerETH:await provider.getBalance(buyer,head.number),funderETH:await provider.getBalance(funder,head.number),gasPrice:(await provider.getFeeData()).gasPrice};
 },payload(kind,amount){return kind==='fund'?{to:token.target,data:token.interface.encodeFunctionData('mint',[buyer,amount])}:kind==='approve'?{to:token.target,data:token.interface.encodeFunctionData('approve',[sale.target,amount])}:{to:sale.target,data:sale.interface.encodeFunctionData('mint',[amount])};},
 async quote(kind,amount){const from=kind==='fund'?funder:buyer,tx={...api.payload(kind,amount),from},gas=await provider.estimateGas(tx),fees=await provider.getFeeData(),feeCap=fees.maxFeePerGas??fees.gasPrice;if(!feeCap)throw Error('No fee quote');const gasLimit=(gas*125n+99n)/100n,head=await provider.getBlock('latest');if(gasLimit>head.gasLimit/2n)throw Error('Gas exceeds conservative half-block ceiling');const costCap=gasLimit*feeCap;return {gas,gasLimit,gasPrice:fees.gasPrice,feeCap,costCap,sufficient:await provider.getBalance(from)>=costCap};},
 async identity(kind){const sender=kind==='fund'?funder:buyer,latest=await provider.getTransactionCount(sender,'latest'),pending=await provider.getTransactionCount(sender,'pending');if(latest!==pending)throw Error('Pending nonce requires reconciliation');return {sender,nonce:pending};},
 async send(kind,amount,quote,nonce){if((kind==='fund'&&mode!=='fund')||(kind!=='fund'&&mode!=='mint'))throw Error('Write phase not enabled');const w=kind==='fund'?privateWallet(env.HOF_TEST_FUNDER_KEY_FILE,provider,funder):privateWallet(env.HOF_TEST_BUYER_KEY_FILE,provider,buyer);return w.sendTransaction({...api.payload(kind,amount),nonce,gasLimit:quote.gasLimit,gasPrice:quote.feeCap});},
 receipt:hash=>provider.getTransactionReceipt(hash),wait:hash=>provider.waitForTransaction(hash,1,120000),
 async verify(e,receipt){
  const tx=await provider.getTransaction(e.hash),block=await provider.getBlock(receipt.blockNumber),expected=api.payload(e.kind,BigInt(e.amount));
  if(!tx||receipt.status!==1||receipt.blockHash!==block?.hash||tx.from!==e.sender||tx.nonce!==e.nonce||tx.to!==expected.to||tx.data!==expected.data)throw Error('Receipt/transaction mismatch');
  if(e.kind==='mint'){
   const minted=receipt.logs.filter(l=>l.address.toLowerCase()===genesis.target.toLowerCase()).map(l=>{try{return genesis.interface.parseLog(l);}catch{return null;}}).filter(l=>l?.name==='Transfer'&&l.args.from===ethers.ZeroAddress&&l.args.to===buyer).map(l=>l.args.tokenId);
   if(minted.length!==Number(e.amount)||new Set(minted.map(String)).size!==minted.length)throw Error('Mint receipt token IDs mismatch');
   let positive=false;for(const id of minted){if(await genesis.ownerOf(id)!==buyer)throw Error('NFT ownership changed');const vp=await genesis.votingPowerOf(id);if(id<=22n&&vp!==0n)throw Error('HOF must have0VP');if(vp>0n)positive=true;}
   if(!positive)throw Error('Batch has no positive VP token; stop for E2E review');
   e.tokenIds=minted.map(String);e.positiveVP=true;
  }
 }};
 // Validate before loading either secret; read-only never loads a key.
 plan(await api.read());
 return {api,binding:{chain:46630,...ADDRESSES,buyer,funder}};
}
async function main(){
 require('dotenv').config({quiet:true});const args=process.argv.slice(2);if(args.length>1||args.some(x=>!['--dry-run','--fund','--mint'].includes(x)))throw Error('Use --dry-run, --fund or --mint');
 const mode=args[0]==='--fund'?'fund':args[0]==='--mint'?'mint':'dry-run';
 if(mode!=='dry-run'&&process.env.HOF_TESTNET_SOLD_OUT_CONFIRM!==`AUTHORIZE_TESTNET_${mode.toUpperCase()}`)throw Error('Explicit phase authorization required');
 checkArtifacts();const req=new ethers.FetchRequest(process.env.HOF_RPC_URL||'https://rpc.testnet.chain.robinhood.com');req.timeout=15000;const provider=new ethers.JsonRpcProvider(req,undefined,{batchMaxCount:1});
 try{const {api,binding}=await makeAPI(provider,process.env,mode);if(mode==='dry-run'){const report=await dryRun(api);const file=process.env.HOF_TESTNET_SOLD_OUT_JOURNAL;if(file&&fs.existsSync(file)){const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(JSON.stringify(saved.binding)!==JSON.stringify(binding)||saved.entries?.some(e=>e.status!=='confirmed')){report.status='NO-GO/journal requires reconciliation';}}console.log(json(report));if(!report.status.startsWith('GO'))process.exitCode=1;}else{if(!process.env.HOF_TESTNET_SOLD_OUT_JOURNAL||!path.isAbsolute(process.env.HOF_TESTNET_SOLD_OUT_JOURNAL))throw Error('Absolute persistent journal path required');console.log(json(await execute(api,{mode,file:process.env.HOF_TESTNET_SOLD_OUT_JOURNAL,binding})));}}finally{provider.destroy();}
}
if(require.main===module)main().catch(()=>{console.error('NO-GO: configuration/RPC/state/receipt failed. Stop; inspect the protected journal and reconcile manually. No automatic retry.');process.exitCode=1;});
module.exports={makeAPI,ADDRESSES};
