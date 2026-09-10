// Simulated MAINNET CHAIN ID on ephemeral Hardhat, NEVER an external RPC.
const path=require('node:path');
const config=require('../../hardhat.config.js');
module.exports={...config,paths:{root:path.resolve(__dirname,'../..')},networks:{hardhat:{chainId:4663}}};
