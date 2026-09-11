// Server-only scan evidence. No transaction submission or historical eth_getCode.
const fs=require('node:fs'),path=require('node:path');
const {getAddress}=require('ethers');
function blockNumber(value){
 if(value===undefined||value===null||value===''||!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)<1)throw Error('Missing or invalid race deployment block');
 return Number(value);
}
async function lowerBound(race,value){
 // Explicit constructor receipt is also valid for standalone local tooling.
 if(value===undefined)value=race.scanFromBlock;
 if(value===undefined){const tx=race.deploymentTransaction?.();if(tx)value=(await race.runner.provider.getTransactionReceipt(tx.hash))?.blockNumber;}
 const n=blockNumber(value),head=await race.runner.provider.getBlock('latest');
 if(!head||n>head.number)throw Error('Race deployment block exceeds current head');
 return n;
}
function configuredBounds(env){
 const values=env.HOF_RACE_DEPLOYMENT_BLOCKS?JSON.parse(env.HOF_RACE_DEPLOYMENT_BLOCKS):{};
 if(!values||Array.isArray(values)||typeof values!=='object')throw Error('Invalid race block map');
 const out={};for(const [race,block]of Object.entries(values)){const key=getAddress(race).toLowerCase();if(out[key]!==undefined)throw Error('Duplicate race block');out[key]=blockNumber(block);}
 if(env.HOF_RACE_ADDRESS||env.HOF_RACE_DEPLOYMENT_BLOCK){const key=getAddress(env.HOF_RACE_ADDRESS).toLowerCase(),n=blockNumber(env.HOF_RACE_DEPLOYMENT_BLOCK);if(out[key]!==undefined&&out[key]!==n)throw Error('Conflicting race block');out[key]=n;}
 return out;
}
async function verifyBound({race,factory,board,fromBlock,directory}){
 const provider=race.runner.provider,n=await lowerBound(race,fromBlock),address=getAddress(race.target);
 const block=await provider.getBlock(n);if(!block)throw Error('Missing creation block');
 // Query only the claimed block. An arbitrary later block cannot carry the authentic creation event.
 const logs=await factory.queryFilter(factory.filters.RaceCreated(address),n,n);
 if(logs.length!==1)throw Error('Race/block provenance mismatch');
 const log=logs[0],receipt=await provider.getTransactionReceipt(log.transactionHash),origin=await factory.provenance(address);
 if(!receipt||receipt.status!==1||receipt.blockNumber!==n||receipt.blockHash!==block.hash||log.blockHash!==block.hash||
 !receipt.logs.some(l=>l.address.toLowerCase()===factory.target.toLowerCase()&&l.index===log.index&&l.data===log.data&&JSON.stringify(l.topics)===JSON.stringify(log.topics))||
 origin.chapter!==1n||origin.season!==log.args.season||origin.number!==log.args.number||
 getAddress(await factory.board())!==getAddress(board.target)||!await board.registeredRace(address))throw Error('Invalid creation receipt/provenance');
 const binding={version:1,chain:String((await provider.getNetwork()).chainId),board:getAddress(board.target),factory:getAddress(factory.target),race:address,fromBlock:n,blockHash:block.hash,transactionHash:log.transactionHash};
 const file=path.join(directory,address.toLowerCase()+'.scan.json'),bytes=JSON.stringify(binding);
 if(fs.existsSync(file)){if(fs.readFileSync(file,'utf8')!==bytes)throw Error('Persisted scan binding mismatch');}
 else{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 return n;
}
module.exports={blockNumber,lowerBound,configuredBounds,verifyBound};
