// SERVER ONLY. Admission identity is a dedicated operator signer, not the HOF admin.
const {Contract,AbiCoder,keccak256,ZeroHash,verifyTypedData,getAddress}=require('ethers');
const {contextFor,signingDomain,resultTypes}=require('./ballot.cjs');
const {decryptVote,treeFor,leafFor,SCORE}=require('./backend.cjs');
const {intentTypes,digestFor}=require('./signed-ballot.cjs');
const abi=AbiCoder.defaultAbiCoder();
async function verifyIntentSignature(race,packet){
 const v=packet.intent,ctx=await contextFor(race,v.voter),provider=race.runner.provider;
 if(getAddress(v.race)!==getAddress(race.target))throw Error('wrong race');
 const digest=digestFor(packet,ctx.chainId);
 let valid=false;
 if(await provider.getCode(v.voter)==='0x') {try{valid=getAddress(verifyTypedData(signingDomain(ctx),intentTypes,v,packet.signature))===getAddress(v.voter);}catch{}}
 else {try{valid=await new Contract(v.voter,['function isValidSignature(bytes32,bytes) view returns(bytes4)'],provider).isValidSignature(digest,packet.signature,{gasLimit:200000})==='0x1626ba7e';}catch{}}
 if(!valid)throw Error('invalid wallet signature');
 return ctx;
}
async function admitSigned(race,signer,privateKey,packet) {
 const v=packet.intent,ctx=await verifyIntentSignature(race,packet);
 const actual=getAddress(await signer.getAddress());
 if(actual!==await race.backendSigner()||[await race.hofOwner(),await race.teamReserveWallet()].includes(actual))throw Error('unsafe admission signer');
 try{await decryptVote(ctx,{commitment:v.commitment,ciphertext:packet.ciphertext},privateKey);}catch{throw Error('invalid encrypted ballot');}
 const admission=await signer.signTypedData(signingDomain(ctx),intentTypes,v);
 // All eligibility/nonce/VP/deadline/hash checks run against current chain state.
 await race.submitSigned.staticCall({...packet,admission},{gasLimit:5000000});
 return {admission};
}
async function reconstructBallots(race,{fromBlock,toBlock}={}) {
 fromBlock=await require('./scan-bound.cjs').lowerBound(race,fromBlock);
 const provider=race.runner.provider,anchor=await provider.getBlock(toBlock??'latest');
 if(!anchor)throw Error('missing block');
 if(anchor.number<fromBlock)throw Error('Scan end precedes race deployment block');
 const events=[];
 for(let from=Number(fromBlock);from<=anchor.number;from+=2000) {
  const raw=await provider.getLogs({address:race.target,fromBlock:from,toBlock:Math.min(from+1999,anchor.number)});
  for(const log of raw){let e;try{e=race.interface.parseLog(log);}catch{continue;}if(e)events.push({...e,index:log.index,blockNumber:log.blockNumber});}
 }
 events.sort((a,b)=>a.blockNumber-b.blockNumber||a.index-b.index);
 const ballots=[];let hash=ZeroHash,vp=0n;
 for(const e of events){const a=e.args;
  if(e.name==='BallotAccepted'){
   const i=Number(a.index);if(i!==ballots.length)throw Error('missing or duplicate ballot');
   ballots.push({wallet:a.wallet,commitment:a.commitment,ciphertextHash:a.ciphertextHash,vp:a.vp});vp+=a.vp;
   hash=keccak256(abi.encode(['bytes32','uint8','uint256','address','bytes32','bytes32','uint256'],[hash,1,i,a.wallet,a.commitment,a.ciphertextHash,a.vp]));
  }else if(e.name==='EncryptedVote'){
   const b=ballots[Number(a.index)];if(!b||b.ciphertext||b.wallet!==a.wallet||keccak256(a.ciphertext)!==b.ciphertextHash)throw Error('invalid ciphertext log');b.ciphertext=a.ciphertext;
  }else if(e.name==='VotingPowerAdded'){
   const b=ballots[Number(a.index)];if(!b)throw Error('missing ballot');b.vp+=a.vp;vp+=a.vp;
   hash=keccak256(abi.encode(['bytes32','uint8','uint256','uint256','uint256'],[hash,2,a.index,a.vp,b.vp]));
  }
 }
 const o={blockTag:anchor.number};
 if(hash!==await race.recordsHash(o)||vp!==await race.totalVP(o)||BigInt(ballots.length)!==await race.ballotCount(o))throw Error('incomplete records');
 for(let i=0;i<ballots.length;i++){
  const b=ballots[i],stored=await race.ballotAt(i,o);
  if(!b.ciphertext||b.wallet!==stored.wallet||b.commitment!==stored.commitment||b.vp!==stored.vp)throw Error('incomplete ballot');
 }
 if((await provider.getBlock(anchor.number))?.hash!==anchor.hash)throw Error('reorg');
 return ballots;
}
async function buildRelayedResult(race,signer,privateKey,options={}){
 if(!await race.frozen()||await race.finalized())throw Error('no pending frozen race');
 if(getAddress(await signer.getAddress())!==await race.backendSigner())throw Error('wrong signer');
 const ballots=await reconstructBallots(race,options),ctx=await contextFor(race,await signer.getAddress());
 const totals=Array(22).fill(0n),picks=[];
 for(const b of ballots){const pick=await decryptVote({...ctx,wallet:b.wallet},b,privateKey);picks.push(pick.horse);totals[pick.horse-1]+=b.vp;}
 const ranking=Array.from({length:22},(_,i)=>i+1).sort((a,b)=>totals[a-1]===totals[b-1]?a-b:totals[a-1]>totals[b-1]?-1:1);
 const points=picks.map(h=>SCORE[ranking.indexOf(h)]||0),tree=treeFor(points.map((p,i)=>leafFor(ctx,i,ballots[i].wallet,p)));
 if(BigInt(ballots.length)!==await race.acceptedBallotCount())throw Error('incomplete accepted set');
 const signature=await signer.signTypedData(signingDomain(ctx),resultTypes,{recordsHash:await race.frozenRecordsHash(),count:ballots.length,totalVP:await race.totalVP(),totalsHash:keccak256(abi.encode(['uint256[22]'],[totals])),scoresRoot:tree.root});
 return {totals,points,root:tree.root,proofs:tree.proofs,signature};
}
async function settleRelayedRace(race,signer,privateKey,{batchSize=25,...options}={}){
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>25)throw Error('bad batch');
 const block=await race.runner.provider.getBlock('finalized');
 if(!block||BigInt(block.timestamp)<await race.closesAt())throw Error('closure not final');
 if(await race.finalized())return;
 if(!await race.frozen())await(await race.freeze()).wait();
 const result=await buildRelayedResult(race,signer,privateKey,options);
 if(!await race.proposed())await(await race.proposeResult(result.totals,result.root,result.signature)).wait();
 else if(await race.scoresRoot()!==result.root)throw Error('result mismatch');
 for(let i=Number(await race.processedCount());i<result.points.length;i+=batchSize)await(await race.prepareScores(i,result.points.slice(i,i+batchSize),result.proofs.slice(i,i+batchSize))).wait();
 await(await race.finalize()).wait();
}
module.exports={verifyIntentSignature,admitSigned,reconstructBallots,buildRelayedResult,settleRelayedRace};
