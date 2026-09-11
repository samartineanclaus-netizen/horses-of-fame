// SERVER ONLY. Explicit opt-in; never imported by frontend or started by build.
const fs=require('node:fs'),path=require('node:path');
const {JsonRpcProvider,FetchRequest,Wallet,Contract,getAddress}=require('ethers');
const {RaceRevealService,artifact}=require('../lib/owner-voting/race-reveal-service.cjs');
const {required,address,validateNetwork}=require('./v7-canonical-config.cjs');
function privateFile(file){const st=fs.statSync(file);if(!st.isFile()||(process.platform!=='win32'&&(st.mode&0o077)))throw Error('secret file permissions must be0600');return fs.readFileSync(file,'utf8').trim();}
async function createRuntime(env){
 if(required(env,'HOF_SERVICE_MODE')!=='testnetMockUSDC')throw Error('testnet mode required');
 const request=new FetchRequest(required(env,'HOF_RPC_URL'));request.timeout=15000;const provider=new JsonRpcProvider(request);
 let service;
 try{
  await validateNetwork(provider);
  const signer=new Wallet(privateFile(required(env,'HOF_ADMISSION_KEY_FILE')),provider),relayer=new Wallet(privateFile(required(env,'HOF_RELAYER_KEY_FILE')),provider),board=new Contract(address(env,'HOF_TRUSTED_LEADERBOARDS'),artifact('HOFTrustedLeaderboards'),provider);
  const sale=new Contract(address(env,'GENESIS_SALE_ADDRESS'),artifact('HOFGenesisSale'),provider),genesis=new Contract(await board.genesisContract(),artifact('GenesisHorses'),provider);
  if(await sale.genesis()!==genesis.target||await genesis.saleContract()!==sale.target)throw Error('deployment wiring mismatch');
  const token=new Contract(await sale.paymentToken(),artifact('MockUSDC'),provider);
  if(await token.decimals()!==6n||!await token.testOnly()||await token.name()!=='TEST ONLY / NO VALUE - MockUSDC')throw Error('wrong test token');
  const treasury=address(env,'PROJECT_WALLET');if(getAddress(await sale.founderWallet())!==treasury)throw Error('project wallet mismatch');
  const keyDirectory=path.resolve(required(env,'HOF_DECRYPTION_KEY_DIRECTORY')),directory=path.resolve(required(env,'HOF_SERVICE_DIRECTORY'));
  service=new RaceRevealService({raceDeploymentBlocks:require('../lib/owner-voting/scan-bound.cjs').configuredBounds(env),board,signer,relayer,treasuryAddress:treasury,directory,ingressToken:required(env,'HOF_SIGNED_INGRESS_TOKEN'),
   keyFor:async id=>{if(!/^0x[0-9a-fA-F]{64}$/.test(id))throw Error('bad key ID');return privateFile(path.join(keyDirectory,id.slice(2)+'.pem'));},
   raceAt:a=>new Contract(a,artifact('HOFRelayedRace'),provider),factoryAt:a=>new Contract(a,artifact('HOFCanonicalRaceFactory'),provider)});
  const factory=await service.validate();for(let i=0;i<Number(await board.raceCount());i++)await service.canonical(factory,i);return {service,provider};
 }catch(e){if(service)await service.close();provider.destroy();throw e;}
}
async function main(){require('dotenv').config();if(process.env.HOF_ENABLE_SERVICE!=='YES')throw Error('explicit service enable required');const {service,provider}=await createRuntime(process.env);
 const port=Number(process.env.HOF_SERVICE_PORT||9000);if(!Number.isInteger(port)||port<1024||port>65535){await service.close();provider.destroy();throw Error('invalid port');}
 try{await new Promise((resolve,reject)=>{service.http.once('error',reject);service.http.listen(port,'127.0.0.1',resolve);});service.start();console.log('TESTNET MVP: owner-trusted encryption; service running on loopback');}
 catch(e){await service.close();provider.destroy();throw e;}
 let shuttingDown=false;const shutdown=async()=>{if(shuttingDown)return;shuttingDown=true;await service.close();provider.destroy();};process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
if(require.main===module)main().catch(()=>{console.error('Race service failed closed. Check configuration, RPC, role wiring, key permissions and journals.');process.exitCode=1;});
module.exports={main,createRuntime,privateFile};
