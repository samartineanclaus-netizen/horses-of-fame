// Explicit operator action only. Never invoked by preflight/build.
const {ethers}=require('hardhat');
const {validateNetwork,roles,required}=require('./v7-canonical-config.cjs');
async function main(){
 await validateNetwork(ethers.provider);
 if(process.env.HOF_TOKEN_MODE!=='testnetMockUSDC')throw Error('Explicit testnetMockUSDC mode required');
 const r=roles(process.env),[deployer]=await ethers.getSigners();
 if(!deployer||await deployer.getAddress()!==r.owner)throw Error('Configured owner deployer required');
 if(process.env.HOF_USDC_ADDRESS)throw Error('Existing token configured; refusing duplicate deployment');
 await require('./v7-placeholder.cjs').validatePlaceholder(required(process.env,'GENESIS_PLACEHOLDER_URI'),46630n);
 const factory=await ethers.getContractFactory('MockUSDC'),tx=await factory.getDeployTransaction();
 const gas=await ethers.provider.estimateGas({...tx,from:r.owner});
 const token=await factory.deploy({gasLimit:gas+gas/5n});await token.waitForDeployment();
 console.log(JSON.stringify({chainId:46630,tokenMode:'testnetMockUSDC',label:'TEST ONLY / NO VALUE',address:token.target,decimals:6}));
}
if(require.main===module)main().catch(()=>{console.error('MockUSDC deployment rejected or failed; reconcile receipts before retry.');process.exitCode=1;});
module.exports={main};
