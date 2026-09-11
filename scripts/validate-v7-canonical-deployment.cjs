// READ ONLY: provider-only eth_call/code/block/balance/nonce reads. Never loads a signer.
const fs = require('node:fs');
const path = require('node:path');
const ethers = require('ethers');
const {checkArtifacts} = require('./preflight-v7-readiness.cjs');
const {validatePlaceholder} = require('./v7-placeholder.cjs');
const defaults = {
 HOF_USDC_ADDRESS:'0xCF50ca4225AC58F7e28a247962FDe86A1Fd90073',
 GENESIS_ADDRESS:'0xf3Bdb258574a4Baa73B7614b8C9f42A22EC13682',
 GENESIS_SALE_ADDRESS:'0xE5217C3157726d997565aB88b82237AeB346Ee9a',
 HOF_TRUSTED_LEADERBOARDS:'0xB6e79e2C560607De510b8cd2D72e0c93BEB4e2B9',
 HOF_RACE_FACTORY:'0xEE652f98885d09d814dd8D6C0E08ea63eAD7258B',
 SEASON_REWARDS_ADDRESS:'0x9108a8C77046bb50A25efACA9e9dEE5B1E960175',
 HOF_OWNER_ADDRESS:'0xd9697952A62cd292267d9e3B5a95a313812a3eD2',
 HOF_ADMISSION_SIGNER:'0xabFaF977477b5CF0a7DF0003245b39D177Aa7eCa',
 HOF_RELAYER_ADDRESS:'0x0C2C625D60f208662cCE0730064FBf97754D3A65',
 TEAM_RESERVE_WALLET:'0x35eA023871f5390edEc6004A89c91c27b94CA479',
 AUDIT_WALLET:'0x2F1e35b36FaCC93885FE61AAb90ab3Aa20699F42',
 GENESIS_PLACEHOLDER_URI:'https://hof-site.vercel.app/genesis/unrevealed.json',
 HOF_TOKEN_MODE:'testnetMockUSDC'
};
const contracts = {MockUSDC:'HOF_USDC_ADDRESS',GenesisHorses:'GENESIS_ADDRESS',HOFGenesisSale:'GENESIS_SALE_ADDRESS',HOFTrustedLeaderboards:'HOF_TRUSTED_LEADERBOARDS',HOFCanonicalRaceFactory:'HOF_RACE_FACTORY',HOFSeasonRewards:'SEASON_REWARDS_ADDRESS'};
function artifact(name, root) {
 const file=path.join(root,'artifacts/contracts',name+'.sol',name+'.json');
 const a=JSON.parse(fs.readFileSync(file));
 const dbg=JSON.parse(fs.readFileSync(file.replace('.json','.dbg.json')));
 const build=JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),dbg.buildInfo)));
 return {a,refs:build.output.contracts[a.sourceName][name].evm.deployedBytecode.immutableReferences};
}
function runtimeMatches(actual, expected, refs={}) {
 if(actual.length!==expected.length || actual==='0x') return false;
 const mask=value=>{const b=Buffer.from(value.slice(2),'hex'); for(const ranges of Object.values(refs)) for(const {start,length} of ranges)b.fill(0,start,start+length); return b.toString('hex');};
 return mask(actual)===mask(expected);
}
async function validate(env,provider,{root=process.cwd(),placeholder=validatePlaceholder}={}) {
 const c={...defaults,...Object.fromEntries(Object.entries(env).filter(([,v])=>v!==undefined&&v!==''))};
 const checks=[];
 const record=(name,ok,actual)=>checks.push({name,status:ok?'PASS':'FAIL',...(actual!==undefined?{actual:String(actual)}:{})});
 const attempt=async(name,fn)=>{try{await fn();}catch{record(name,false,'Read/configuration failed (details suppressed to avoid leaking RPC credentials)');}};
 const chain=await provider.getNetwork();
 if(chain.chainId!==46630n) return {status:'NO-GO',readOnly:true,checks:[{name:'chainId',status:'FAIL',actual:String(chain.chainId)}]};
 checkArtifacts(root);
 const block=await provider.getBlock('latest');
 const tag=block.number;
 record('chainId',true,46630);
 for(const key of ['COMMUNITY_SEASON_ADDRESS','HOF_LEADERBOARD_ADDRESS','HOF_SEASON_LEADERBOARD','HOF_COMMUNITY_SEASON','NEXT_PUBLIC_HOF_COMMUNITY_SEASON_CONTRACT','NEXT_PUBLIC_HOF_LEADERBOARD_CONTRACT','NEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT'])record('legacy env absent: '+key,!env[key]);
 for(const [publicKey,key] of Object.entries({NEXT_PUBLIC_HOF_GENESIS_CONTRACT:'GENESIS_ADDRESS',NEXT_PUBLIC_HOF_GENESIS_SALE_CONTRACT:'GENESIS_SALE_ADDRESS',NEXT_PUBLIC_HOF_USDC_CONTRACT:'HOF_USDC_ADDRESS',NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS:'HOF_TRUSTED_LEADERBOARDS',NEXT_PUBLIC_HOF_SEASON_REWARDS_CONTRACT:'SEASON_REWARDS_ADDRESS'})) if(env[publicKey]) record('public config '+publicKey,env[publicKey].toLowerCase()===c[key].toLowerCase());
 if(env.NEXT_PUBLIC_HOF_CHAIN_ID)record('public chain',env.NEXT_PUBLIC_HOF_CHAIN_ID==='46630');
 if(env.NEXT_PUBLIC_HOF_TOKEN_MODE)record('public token mode',env.NEXT_PUBLIC_HOF_TOKEN_MODE==='testnetMockUSDC');
 record('token mode',c.HOF_TOKEN_MODE==='testnetMockUSDC',c.HOF_TOKEN_MODE);
 const instances={};
 for(const [name,key]of Object.entries(contracts))await attempt(name+' bytecode',async()=>{
  const address=ethers.getAddress(c[key]); const {a,refs}=artifact(name,root);
  record(name+' canonical runtime (immutable values checked below)',runtimeMatches(await provider.getCode(address,tag),a.deployedBytecode,refs));
  instances[name]=new ethers.Contract(address,a.abi,provider);
 });
 const owner=c.HOF_OWNER_ADDRESS,team=c.TEAM_RESERVE_WALLET,admission=c.HOF_ADMISSION_SIGNER;
 const board=c.HOF_TRUSTED_LEADERBOARDS,genesis=c.GENESIS_ADDRESS,token=c.HOF_USDC_ADDRESS;
 const expectations={
 MockUSDC:{testOnly:true,decimals:6,name:'TEST ONLY / NO VALUE - MockUSDC',symbol:'TEST-USDC'},
 GenesisHorses:{owner,teamWallet:team,saleContract:c.GENESIS_SALE_ADDRESS,placeholderURI:c.GENESIS_PLACEHOLDER_URI,MAX_MINT_PER_TX:25,MAX_SUPPLY:2222,PUBLIC_MINT_SUPPLY:2000,COMMUNITY_ALLOCATION_SUPPLY:111,TEAM_RESERVE_SUPPLY:111,NON_PUBLIC_ALLOCATION_SUPPLY:222,HALL_OF_FAME_SUPPLY:22,VOTING_SUPPLY:2200,totalSupply:0,nextTokenId:1,publicMinted:0,communityAllocationMinted:0,teamReserveMinted:0,nonPublicAllocationMinted:0,ownershipRevision:0,revealed:false,paused:false},
 HOFGenesisSale:{owner,paymentToken:token,genesis,prizePoolTreasury:c.SEASON_REWARDS_ADDRESS,auditWallet:c.AUDIT_WALLET,founderWallet:c.PROJECT_WALLET,MAX_MINT_PER_TX:25,PUBLIC_SUPPLY:2000,MINT_PRICE:30000000,PRIZE_POOL_AMOUNT:48000000000,AUDIT_AMOUNT:2000000000,FOUNDER_AMOUNT:10000000000,sold:0,soldOutAt:0,distributed:false,totalRefunded:0,paused:false},
 HOFTrustedLeaderboards:{owner,hofOwner:owner,genesisContract:genesis,backendSigner:admission,teamReserveWallet:team,raceFactory:c.HOF_RACE_FACTORY,MAX_BATCH:25,CHAPTER_GAP:2592000,currentSeason:1,seasonsFinalized:0,raceCount:0,previousSeasonEnd:0,chapter2StartedAt:0,prizeScanEpoch:0},
 HOFCanonicalRaceFactory:{board,genesis,hofOwner:owner,backendSigner:admission,team},
 HOFSeasonRewards:{owner,usdc:token,communitySeason:board,CHAPTER_SEASONS:6,COMMUNITY_FIRST:2500000000,COMMUNITY_SECOND:1000000000,COMMUNITY_THIRD:500000000,COMMUNITY_PER_SEASON:4000000000,HOF_PER_SEASON:4000000000,TOTAL_PER_SEASON:8000000000,COMMUNITY_CHAPTER_ALLOCATION:24000000000,HOF_CHAPTER_ALLOCATION:24000000000,CHAPTER_PRIZE_POOL:48000000000,communityPaid:0,communityRolloverToChapter2:0}
 };
 for(const [name,values]of Object.entries(expectations)) for(const [getter,expected]of Object.entries(values))await attempt(name+'.'+getter,async()=>{
  const actual=await instances[name][getter]({blockTag:tag});
  record(name+'.'+getter,expected!==undefined&&String(actual).toLowerCase()===String(expected).toLowerCase(),actual);
 });
 await attempt('roles',async()=>{
  const addresses=[owner,admission,c.HOF_RELAYER_ADDRESS,team,c.PROJECT_WALLET].map(ethers.getAddress);
  record('owner/admission/relayer/team/project distinct and nonzero',new Set(addresses).size===5&&!addresses.includes(ethers.ZeroAddress));
 });
 for(const [role,address]of Object.entries({owner,admission,relayer:c.HOF_RELAYER_ADDRESS}))await attempt(role+' gas',async()=>{
  const balance=await provider.getBalance(address,tag);record(role+' funded',balance>0n,balance);
 });
 await attempt('factory provenance',async()=>{
  record('factory created by canonical board',ethers.getCreateAddress({from:board,nonce:1}).toLowerCase()===c.HOF_RACE_FACTORY.toLowerCase());
  record('factory has created no races',await provider.getTransactionCount(c.HOF_RACE_FACTORY,tag)===1);
  const p=await instances.HOFCanonicalRaceFactory.provenance(ethers.ZeroAddress,{blockTag:tag});record('empty provenance',p.every(v=>v===0n));
 });
 for(let s=1;s<=6;s++)await attempt('rewards season '+s,async()=>{
  record('season '+s+' unpaid',!(await instances.HOFSeasonRewards.communitySeasonPaid(s,{blockTag:tag})));
  record('season '+s+' rollover zero',(await instances.HOFSeasonRewards.communitySeasonRollover(s,{blockTag:tag}))===0n);
 });
 await attempt('deadline anchor',async()=>{
  if(!/^\d+$/.test(c.HOF_DEPLOYMENT_ANCHOR_BLOCK||''))throw Error('Required deployment anchor block');
  const anchor=await provider.getBlock(Number(c.HOF_DEPLOYMENT_ANCHOR_BLOCK));
  const deadline=await instances.HOFGenesisSale.deadline({blockTag:tag});
  record('deadline = deployment anchor timestamp + 604800',anchor.number<=tag&&deadline===BigInt(anchor.timestamp)+604800n,deadline);
  record('mint window still open',BigInt(block.timestamp)<deadline,deadline-BigInt(block.timestamp));
  record('sale not deployed at anchor',await provider.getCode(c.GENESIS_SALE_ADDRESS,anchor.number)==='0x');
 });
 await attempt('public placeholder',async()=>{await placeholder(c.GENESIS_PLACEHOLDER_URI,46630n);record('public placeholder JSON and image',true);});
 const endBlock=await provider.getBlock(tag);record('validation block unchanged',endBlock.hash===block.hash);
 return {status:checks.every(x=>x.status==='PASS')?'GO':'NO-GO',readOnly:true,chainId:46630,blockNumber:tag,blockHash:block.hash,checks,notes:['GO applies only to the initial deployment wiring, not end-to-end readiness.','Factory embeds HOFRelayedRace creation code; no proxy implementation() exists.','Relayer is an off-chain operational role, not a factory role. Runtime service configuration still requires separate validation.','No transaction was signed or sent. Balance checks are not gas-budget guarantees.']};
}
async function main(){
 require('dotenv').config({quiet:true});
 const request=new ethers.FetchRequest(process.env.HOF_RPC_URL||'https://rpc.testnet.chain.robinhood.com');request.timeout=15000;
 const provider=new ethers.JsonRpcProvider(request,undefined,{batchMaxCount:1});
 try{const result=await validate(process.env,provider);console.log(JSON.stringify(result,null,2));if(result.status!=='GO')process.exitCode=1;}finally{provider.destroy();}
}
if(require.main===module)main().catch(()=>{console.error('NO-GO: RPC/config/artifact verification failed. No transactions sent. RPC details suppressed.');process.exitCode=1;});
module.exports={validate,runtimeMatches,defaults};
