const {getAddress,isAddress,ZeroAddress}=require('ethers');
const {createPublicKey}=require('node:crypto');
const CHAIN_ID=46630n;
const {validatePlaceholder}=require('./v7-placeholder.cjs');
function required(env,key){const v=env[key]?.trim();if(!v)throw Error(`Missing ${key}`);return v;}
function address(env,key){const v=required(env,key);if(!isAddress(v)||getAddress(v)===ZeroAddress||/^0x0{32}/i.test(v))throw Error(`Invalid ${key}`);return getAddress(v);}
function timestamp(env,key){const v=required(env,key);if(!/^\d+$/.test(v))throw Error(`Invalid ${key}`);return BigInt(v);}
function roles(env){
 const r={owner:address(env,'HOF_OWNER_ADDRESS'),admission:address(env,'HOF_ADMISSION_SIGNER'),relayer:address(env,'HOF_RELAYER_ADDRESS'),team:address(env,'TEAM_RESERVE_WALLET'),treasury:address(env,'PROJECT_WALLET')};
 if(new Set(Object.values(r)).size!==5)throw Error('Owner, admission, relayer, team and treasury must be separate');return r;
}
function systemConfig(env){return {...roles(env),tokenMode:required(env,'HOF_TOKEN_MODE'),usdc:address(env,'HOF_USDC_ADDRESS'),audit:address(env,'AUDIT_WALLET'),deadline:timestamp(env,'MINT_DEADLINE_UNIX'),placeholder:required(env,'GENESIS_PLACEHOLDER_URI')};}
function raceConfig(env){
 const key=required(env,'HOF_RACE_PUBLIC_KEY');if(!/^0x[0-9a-fA-F]+$/.test(key))throw Error('Invalid public key');
 const parsed=createPublicKey({key:Buffer.from(key.slice(2),'hex'),format:'der',type:'spki'});
 if(parsed.asymmetricKeyType!=='rsa'||parsed.asymmetricKeyDetails?.modulusLength!==3072)throw Error('Expected RSA3072 public key');
 return {...roles(env),board:address(env,'HOF_TRUSTED_LEADERBOARDS'),sale:address(env,'GENESIS_SALE_ADDRESS'),opens:timestamp(env,'RACE_OPENS_AT_UNIX'),key};
}
async function validateNetwork(provider){if((await provider.getNetwork()).chainId!==CHAIN_ID)throw Error('Only Robinhood Testnet 46630 is allowed');}
async function code(provider,addr,label){if(await provider.getCode(addr)==='0x')throw Error(`Missing bytecode: ${label}`);}
async function validateSystem(ethers,c,signer){
 await validateNetwork(ethers.provider);if(getAddress(await signer.getAddress())!==c.owner)throw Error('Deployer must be configured owner');
 await code(ethers.provider,c.usdc,'USDC');
 const token=new ethers.Contract(c.usdc,['function decimals() view returns(uint8)'],ethers.provider);
 if(await token.decimals()!==6n)throw Error('USDC must use 6 decimals');
 if(c.tokenMode!=='testnetMockUSDC')throw Error('Only explicit testnetMockUSDC mode is enabled; production USDC is not configured');
 const mock=new ethers.Contract(c.usdc,['function testOnly() view returns(bool)','function name() view returns(string)'],ethers.provider);
 if(!await mock.testOnly()||await mock.name()!=='TEST ONLY / NO VALUE - MockUSDC')throw Error('Expected labelled test-only MockUSDC');
 const head=await ethers.provider.getBlock('latest');if(!head||c.deadline<=BigInt(head.timestamp))throw Error('Mint deadline must be future');
 await validatePlaceholder(c.placeholder,CHAIN_ID);
}
module.exports={CHAIN_ID,required,address,timestamp,roles,systemConfig,raceConfig,validateNetwork,validateSystem,code};
