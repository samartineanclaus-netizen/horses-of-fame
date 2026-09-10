// SERVER ONLY. Never return/log decrypted choices, salts, keys or partial tallies.
const { AbiCoder, keccak256, getBytes, hexlify, concat, getAddress } = require('ethers');
const {CIPHER_BYTES,domainBytes,commitmentOf,admissionTypes,resultTypes,signingDomain,contextFor} = require('./ballot.cjs');
const abi = AbiCoder.defaultAbiCoder();
const SCORE = [25,18,15,12,10,8,6,4,2,1];
async function generateRaceKey() {
  const pair = await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const publicKey = hexlify(new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey)));
  return {publicKey,privateKey:pair.privateKey};
}
async function decryptVote(ctx, ballot, privateKey) {
  const b = getBytes(ballot.ciphertext);
  if (b.length !== CIPHER_BYTES || b[0] !== 1) throw Error('invalid encrypted ballot');
  const raw = await crypto.subtle.decrypt({name:'RSA-OAEP',label:domainBytes(ctx)},privateKey,b.slice(1,385));
  const aes = await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b.slice(385,397),additionalData:getBytes(concat([domainBytes(ctx),ballot.commitment])),tagLength:128},aes,b.slice(397)));
  if (plain.length !== 33) throw Error('invalid encrypted ballot');
  const horse = plain[0], salt = hexlify(plain.slice(1));
  if (commitmentOf(ctx,horse,salt) !== ballot.commitment) throw Error('commitment mismatch');
  return {horse,salt};
}
async function admitVote(race, signer, privateKey, request) {
  // race and key are configured by the service, never supplied by the requester.
  const ctx = await contextFor(race,request.wallet);
  const caller = getAddress(request.wallet);
  if ([await race.hofOwner(),await race.backendSigner(),await race.teamReserveWallet()].includes(caller)) throw Error('excluded wallet');
  if (getAddress(await signer.getAddress()) !== await race.backendSigner()) throw Error('wrong signer');
  const now = (await race.runner.provider.getBlock('latest')).timestamp;
  const close = Number(await race.closesAt());
  if (now < Number(await race.opensAt()) || now >= close) throw Error('voting closed');
  if (await race.ballotIndexPlusOne(caller) !== 0n) throw Error('wallet already voted');
  try { await decryptVote(ctx,request,privateKey); } catch { throw Error('invalid encrypted ballot'); }
  const deadline = close;
  const signature = await signer.signTypedData(signingDomain(ctx),admissionTypes,{voter:caller,commitment:request.commitment,ciphertextHash:keccak256(request.ciphertext),deadline});
  return {deadline,signature};
}
function leafFor(ctx,index,wallet,points) {
  return keccak256(keccak256(abi.encode(['uint256','address','uint256','address','uint8'],[ctx.chainId,ctx.race,index,wallet,points])));
}
function treeFor(leaves) {
  if (!leaves.length) return {root:keccak256('0x'),proofs:[]};
  const levels = [leaves];
  while (levels.at(-1).length > 1) {
    const prev = levels.at(-1), next = [];
    for (let i=0;i<prev.length;i+=2) next.push(i+1===prev.length ? prev[i] : keccak256(concat([prev[i],prev[i+1]].sort())));
    levels.push(next);
  }
  return {root:levels.at(-1)[0],proofs:leaves.map((_,index)=>{
    const proof=[]; let i=index;
    for (let n=0;n<levels.length-1;n++) { const sibling=i^1; if(sibling<levels[n].length) proof.push(levels[n][sibling]); i=Math.floor(i/2); }
    return proof;
  })};
}
async function buildResult(race, signer, privateKey) {
  if (!await race.frozen()) throw Error('race not frozen');
  if (await race.finalized()) throw Error('race already finalized');
  if (getAddress(await signer.getAddress()) !== await race.backendSigner()) throw Error('wrong signer');
  const count = Number(await race.acceptedBallotCount());
  const totals = Array(22).fill(0n), ballots=[], picks=[];
  let vp=0n;
  for(let i=0;i<count;i++) {
    const ballot = await race.ballotAt(i), ctx=await contextFor(race,ballot.wallet);
    let pick; try { pick = await decryptVote(ctx,ballot,privateKey); } catch { throw Error(`undecryptable accepted ballot at index ${i}`); }
    totals[pick.horse-1]+=ballot.vp; vp+=ballot.vp; ballots.push(ballot); picks.push(pick.horse);
  }
  if (vp !== await race.totalVP()) throw Error('VP mismatch');
  const ranking=Array.from({length:22},(_,i)=>i+1).sort((a,b)=>totals[a-1]===totals[b-1]?a-b:totals[a-1]>totals[b-1]?-1:1);
  const points=picks.map(h=>SCORE[ranking.indexOf(h)] || 0);
  const ctx=await contextFor(race,await signer.getAddress());
  const tree=treeFor(points.map((p,i)=>leafFor(ctx,i,ballots[i].wallet,p)));
  const signature=await signer.signTypedData(signingDomain(ctx),resultTypes,{recordsHash:await race.frozenRecordsHash(),count,totalVP:vp,totalsHash:keccak256(abi.encode(['uint256[22]'],[totals])),scoresRoot:tree.root});
  // Output contains only public post-close result data, never picks/salts/keys.
  return {totals,points,root:tree.root,proofs:tree.proofs,signature};
}
async function settleRace(race, signer, privateKey, {batchSize=25,finalityTag='finalized'}={}) {
  if(!Number.isInteger(batchSize)||batchSize<1||batchSize>25) throw Error('bad batch');
  // Fail closed if the RPC does not support the configured finality tag.
  const block=await race.runner.provider.getBlock(finalityTag);
  if(!block || BigInt(block.timestamp)<await race.closesAt()) throw Error('closure not final');
  if(await race.finalized()) return;
  if(!await race.frozen()) await (await race.freeze()).wait();
  const result=await buildResult(race,signer,privateKey);
  if(!await race.proposed()) await (await race.proposeResult(result.totals,result.root,result.signature)).wait();
  else if(await race.scoresRoot()!==result.root) throw Error('existing result mismatch');
  for(let i=Number(await race.processedCount());i<result.points.length;i+=batchSize) {
    await (await race.prepareScores(i,result.points.slice(i,i+batchSize),result.proofs.slice(i,i+batchSize))).wait();
  }
  await (await race.finalize()).wait();
}
// Operator-only season orchestration. Cursors live on-chain; failed transactions
// do not advance them. Ownership changes fail closed; rerun to start a fresh scan.
async function settleSeason(board, {batchSize=25}={}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw Error('bad batch');
  const season = Number(await board.currentSeason());
  if (season > 6) return;
  const end = season * 10;
  if (Number(await board.raceCount()) !== end) throw Error('season not complete');
  const { Contract } = require('ethers');
  const raceAbi = ['function finalized() view returns(bool)', 'function acceptedBallotCount() view returns(uint256)'];
  for (let i = end - 10; i < end; ++i) {
    const address = await board.races(i), race = new Contract(address, raceAbi, board.runner);
    if (!await race.finalized()) throw Error('race not finalized');
    const count = await race.acceptedBallotCount();
    while (await board.indexedCount(address) < count) await (await board.indexParticipants(i, batchSize)).wait();
  }
  const genesis = new Contract(await board.genesisContract(), ['function ownershipRevision() view returns(uint256)'], board.runner);
  if (Number(await board.prizeScanSeason()) !== season || await board.prizeScanRevision() !== await genesis.ownershipRevision())
    await (await board.beginPrizeScan()).wait();
  const epoch = await board.prizeScanEpoch();
  while (await board.prizeScanCursor() < await board.prizeScanEnd())
    await (await board.processPrizeHolders(epoch, await board.prizeScanCursor(), batchSize)).wait();
  while (await board.prizeScoreCursor() < 251n)
    await (await board.processPrizeScores(epoch, await board.prizeScoreCursor(), batchSize)).wait();
  await (await board.finalizeSeason()).wait();
}
module.exports={settleSeason,generateRaceKey,decryptVote,admitVote,buildResult,settleRace,treeFor,leafFor,SCORE};
