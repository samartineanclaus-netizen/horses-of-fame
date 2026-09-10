// READ ONLY: no signer/private key and no broadcast method.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const ethers=require('ethers');
const {systemConfig,validateSystem}=require('./v7-canonical-config.cjs');
const names=['GenesisHorses','HOFGenesisSale','HOFTrustedLeaderboards','HOFCanonicalRaceFactory','HOFRelayedRace','HOFSeasonRewards','MockUSDC'];
function checkArtifacts(root=process.cwd()){
 const infos=path.join(root,'artifacts/build-info');
 if(!fs.existsSync(infos))throw Error('Compile artifacts first');

 for(const name of names){
  const file=path.join(root,'artifacts/contracts',name+'.sol',name+'.json');
  if(!fs.existsSync(file))throw Error('Missing artifact '+name);
  const artifact=JSON.parse(fs.readFileSync(file));
  if(!artifact.bytecode||artifact.bytecode==='0x')throw Error('Empty artifact '+name);
  const debug=JSON.parse(fs.readFileSync(file.replace('.json','.dbg.json')));
  const build=JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),debug.buildInfo)));
  if(build.output.contracts?.[artifact.sourceName]?.[name]?.evm.bytecode.object!==artifact.bytecode.slice(2))throw Error('Artifact bytecode mismatch '+name);
  if(!build||build.solcVersion!=='0.8.25'||build.input.settings.evmVersion!=='cancun'||!build.input.settings.optimizer.enabled||build.input.settings.optimizer.runs!==200)throw Error('Compiler settings mismatch '+name);
  for(const [source,value]of Object.entries(build.input.sources)){
   const local=path.join(root,source.startsWith('@')?'node_modules':'',source);
   if(!fs.existsSync(local)||fs.readFileSync(local,'utf8')!==value.content)throw Error('Stale artifact source '+source);
  }
 }
 const deploy=fs.readFileSync(path.join(root,'scripts/deploy-v7-system.js'),'utf8');
 if(!deploy.includes("deploy('HOFTrustedLeaderboards'")||!deploy.includes('validateSystem'))throw Error('Noncanonical deployment path');
}
async function preflight(env,provider){
 const c=systemConfig(env);checkArtifacts();
 await validateSystem({...ethers,provider},c,{getAddress:async()=>c.owner});
 const balance=await provider.getBalance(c.owner);
 if(!env.HOF_MIN_DEPLOYER_WEI||!/^\d+$/.test(env.HOF_MIN_DEPLOYER_WEI)||BigInt(env.HOF_MIN_DEPLOYER_WEI)<=0n)throw Error('Explicit positive HOF_MIN_DEPLOYER_WEI required');
 if(balance<BigInt(env.HOF_MIN_DEPLOYER_WEI))throw Error('Insufficient deployer gas balance');
 return {status:'PASS',readOnly:true,chainId:46630,tokenMode:c.tokenMode,token:c.usdc,deployer:c.owner,balanceWei:String(balance),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),note:'Balance threshold is an operator input, not a deployment cost guarantee'};
}
async function main(){require('dotenv').config();const endpoint=process.env.HOF_RPC_URL;if(!endpoint||/\{|\}|API_KEY|YOUR_|PLACEHOLDER/.test(endpoint))throw Error('Explicit real HOF_RPC_URL required');const request=new ethers.FetchRequest(endpoint);request.timeout=15000;const provider=new ethers.JsonRpcProvider(request);try{console.log(JSON.stringify(await preflight(process.env,provider),null,2));}finally{provider.destroy();}}
if(require.main===module)main().catch(()=>{console.error('Preflight FAILED: check public configuration, RPC, balance, token and compile artifacts. No transaction sent.');process.exitCode=1;});
module.exports={preflight,checkArtifacts};
