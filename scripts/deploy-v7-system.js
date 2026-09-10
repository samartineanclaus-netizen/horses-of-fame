// Explicit operator command only. Never run as part of tests/build.
const {ethers}=require('hardhat');
const {systemConfig,validateSystem}=require('./v7-canonical-config.cjs');
async function main(){
 const config=systemConfig(process.env),[owner]=await ethers.getSigners();
 if(!owner)throw Error('Missing deployer signer');
 await validateSystem(ethers,config,owner); // ALL configuration checks before first write
 async function deploy(name,args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
 const genesis=await deploy('GenesisHorses',[config.placeholder]);
 await(await genesis.setTeamWallet(config.team)).wait();
 const board=await deploy('HOFTrustedLeaderboards',[genesis.target,config.owner,config.admission,config.team]);
 const rewards=await deploy('HOFSeasonRewards',[config.usdc,board.target]);
 const sale=await deploy('HOFGenesisSale',[config.usdc,genesis.target,config.deadline,rewards.target,config.audit,config.treasury]);
 await(await genesis.setSaleContract(sale.target)).wait();
 console.log(JSON.stringify({chainId:46630,genesis:genesis.target,sale:sale.target,leaderboards:board.target,raceFactory:await board.raceFactory(),rewards:rewards.target,usdc:config.usdc,owner:config.owner,admission:config.admission,relayer:config.relayer,trust:'owner-trusted; backend can decrypt before close'},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
