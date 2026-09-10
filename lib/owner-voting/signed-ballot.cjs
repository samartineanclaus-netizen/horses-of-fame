// Browser only: no admission/decryption secrets.
const {AbiCoder,Contract,keccak256,TypedDataEncoder} = require('ethers');
const {contextFor,encryptVote,signingDomain} = require('./ballot.cjs');
const {RACE_ABI} = require('./website.cjs');
const intentTypes={VoteIntent:[['voter','address'],['race','address'],['nonce','uint256'],['deadline','uint256'],['commitment','bytes32'],['ciphertextHash','bytes32'],['tokenIdsHash','bytes32'],['vp','uint256'],['topUp','bool']].map(([name,type])=>({name,type}))};
const INTENT='tuple(address voter,address race,uint256 nonce,uint256 deadline,bytes32 commitment,bytes32 ciphertextHash,bytes32 tokenIdsHash,uint256 vp,bool topUp)';
const PACKET=`tuple(${INTENT} intent,uint256[] tokenIds,bytes ciphertext,bytes signature,bytes admission)`;
const SIGNED_ABI=[...RACE_ABI.filter(x=>!x.startsWith('function vote(')&&!x.startsWith('function addVotingPower(')),
 `function submitSigned(${PACKET})`, `function submitBatch(${PACKET}[])`, 'function nonces(address) view returns(uint256)',
 'event IntentIncluded(address indexed wallet,uint256 indexed nonce,bytes32 indexed digest,uint256 index)',
 'event EncryptedVote(uint256 indexed index,address indexed wallet,bytes ciphertext)'];
const signedRaceAt=(address,provider)=>new Contract(address,SIGNED_ABI,provider);
const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v);
async function signVote(race,signer,horse,tokens,{original,beforeSign=async()=>{}}={}) {
 const voter=await signer.getAddress(),ctx=await contextFor(race,voter);
 const ballot=original || await encryptVote(ctx,horse,await race.encryptionPublicKey());
 const tokenIds=tokens.map(t=>String(t.id));
 const intent={voter,race:race.target,nonce:String(await race.nonces(voter)),deadline:String(await race.closesAt()),
 commitment:ballot.commitment,ciphertextHash:keccak256(ballot.ciphertext),tokenIdsHash:keccak256(AbiCoder.defaultAbiCoder().encode(['uint256[]'],[tokenIds])),vp:tokens.reduce((n,t)=>n+BigInt(t.vp),0n).toString(),topUp:Boolean(original)};
 await beforeSign();
 const signature=await signer.signTypedData(signingDomain(ctx),intentTypes,intent);
 return {intent,tokenIds,ciphertext:ballot.ciphertext,signature};
}
function digestFor(packet,chainId){return TypedDataEncoder.hash(signingDomain({chainId,race:packet.intent.race}),intentTypes,packet.intent);}
async function inclusionState(race,packet,fromBlock=0) {
 const provider=race.runner.provider,chainId=(await provider.getNetwork()).chainId,digest=digestFor(packet,chainId);
 const head=await provider.getBlock('latest'); if(!head) return 'Submitted';
 const logs=[];
 for(let start=Number(fromBlock);start<=head.number;start+=2000) logs.push(...await race.queryFilter(race.filters.IntentIncluded(packet.intent.voter,packet.intent.nonce,digest),start,Math.min(head.number,start+1999)));
 if(logs.length===0)return 'Submitted'; if(logs.length!==1)throw Error('Duplicate inclusion');
 const log=logs[0],receipt=await provider.getTransactionReceipt(log.transactionHash),block=await provider.getBlock(log.blockNumber);
 if(!receipt||receipt.status!==1||receipt.blockNumber!==log.blockNumber||receipt.blockHash!==log.blockHash||block?.hash!==log.blockHash)return 'Submitted';
 if(BigInt(block.timestamp)>=await race.closesAt())throw Error('Invalid late inclusion');
 let finalized;try{finalized=await provider.getBlock('finalized');}catch{/* fail closed on confirmation */}
 return finalized && finalized.number>=log.blockNumber ? 'Vote confirmed':'Included on-chain';
}
module.exports={intentTypes,SIGNED_ABI,signedRaceAt,signVote,digestFor,inclusionState,json};
