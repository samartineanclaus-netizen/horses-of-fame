// Remote entrypoint is operator-only. Local dry-run reuses deploySystem on Hardhat.
const {ethers}=require('hardhat');
const {systemConfig,validateSystem}=require('./v7-canonical-config.cjs');
async function deploySystem(config,owner){
 if(!owner)throw Error('Missing deployer signer');
 await validateSystem(ethers,config,owner); // ALL configuration checks before first write
 async function deploy(name,args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 const genesis=await deploy('GenesisHorses',[config.placeholder]);
 await(await genesis.setTeamWallet(config.team)).wait();
 const board=await deploy('HOFTrustedLeaderboards',[genesis.target,config.owner,config.admission,config.team]);
 const rewards=await deploy('HOFSeasonRewards',[config.usdc,board.target]);
 const sale=await deploy('HOFGenesisSale',[config.usdc,genesis.target,config.deadline,rewards.target,config.audit,config.treasury]);
 await(await genesis.setSaleContract(sale.target)).wait();
 const result={chainId:46630,genesis:genesis.target,sale:sale.target,leaderboards:board.target,raceFactory:await board.raceFactory(),rewards:rewards.target,usdc:config.usdc,owner:config.owner,admission:config.admission,relayer:config.relayer,trust:'owner-trusted; backend can decrypt before close'};
 return {genesis,board,rewards,sale,result};
}
async function main(){const [owner]=await ethers.getSigners();const {MINT_WINDOW_SECONDS}=require('./v7-placeholder.cjs');const head=await ethers.provider.getBlock('latest');if(!head)throw Error('Missing deployment timestamp');const config=systemConfig({...process.env,MINT_DEADLINE_UNIX:String(BigInt(head.timestamp)+MINT_WINDOW_SECONDS)});const deployed=await deploySystem(config,owner);console.log(JSON.stringify(deployed.result,null,2));}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,deploySystem};
