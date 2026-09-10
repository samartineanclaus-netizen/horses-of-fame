// Public reads only. Never import backend.cjs into a browser bundle.
const { Contract } = require('ethers');
const RACE_ABI = [
  'function opensAt() view returns(uint256)', 'function closesAt() view returns(uint256)',
  'function finalized() view returns(bool)', 'function frozen() view returns(bool)', 'function genesis() view returns(address)',
  'function hofOwner() view returns(address)', 'function backendSigner() view returns(address)',
  'function teamReserveWallet() view returns(address)', 'function keyId() view returns(bytes32)',
  'function encryptionPublicKey() view returns(bytes)', 'function ballotIndexPlusOne(address) view returns(uint256)',
  'function tokenUsed(uint256) view returns(bool)', 'function acceptedBallotCount() view returns(uint256)',
  'function ballotAt(uint256) view returns(tuple(address wallet,bytes32 commitment,bytes ciphertext,uint256 vp))',
  'function pointsOf(address) view returns(uint8)', 'function ranking() view returns(uint8[22])',
  'function horseVP() view returns(uint256[22])', 'function horseRacePoints() view returns(uint8[22])',
  'function vote(bytes32,bytes,uint256,bytes,uint256[])', 'function addVotingPower(uint256[])'
];
const BOARD_ABI = ['function registeredRace(address) view returns(bool)', 'function raceCount() view returns(uint256)',
  'function races(uint256) view returns(address)', 'function currentSeason() view returns(uint8)'];
const GENESIS_ABI = ['function balanceOf(address) view returns(uint256)',
  'function tokenOfOwnerByIndex(address,uint256) view returns(uint256)', 'function votingPowerOf(uint256) view returns(uint256)'];
async function mapLimited(values, fn, width = 8) {
  const result = new Array(values.length); let next = 0;
  await Promise.all(Array.from({length: Math.min(width, values.length)}, async () => {
    for (;;) { const index = next++; if (index >= values.length) break; result[index] = await fn(values[index], index); }
  })); return result;
}
function phaseAt(opens, closes, finalized, timestamp) {
  return finalized ? 'finalized' : timestamp < opens ? 'scheduled' : timestamp < closes ? 'open' : 'awaiting';
}
async function readRace(race, block) {
  const o = {blockTag:block.number};
  const [opens, closes, finalized] = await Promise.all([race.opensAt(o), race.closesAt(o), race.finalized(o)]);
  let phase = phaseAt(Number(opens), Number(closes), finalized, block.timestamp);
  if(phase==='awaiting' && await race.frozen(o))phase='preparing';
  if (phase !== 'finalized') return {phase, opens:Number(opens), closes:Number(closes), rows:[]};
  const [ranking, vp, points] = await Promise.all([race.ranking(o), race.horseVP(o), race.horseRacePoints(o)]);
  if (ranking.length !== 22 || vp.length !== 22 || points.length !== 22 || new Set(ranking.map(Number)).size !== 22 || ranking.some(h => h < 1 || h > 22)) throw Error('Incomplete race result');
  return {phase, opens:Number(opens), closes:Number(closes), rows:ranking.map(h => ({horse:Number(h),vp:String(vp[Number(h)-1]),points:Number(points[Number(h)-1])}))};
}
async function inventory(race, genesis, wallet, block) {
  const o = {blockTag:block.number};
  const [owner, backend, team, voted, count] = await Promise.all([race.hofOwner(o),race.backendSigner(o),race.teamReserveWallet(o),race.ballotIndexPlusOne(wallet,o),genesis.balanceOf(wallet,o)]);
  const excluded = [owner,backend,team].some(a => a.toLowerCase() === wallet.toLowerCase());
  if (Number(count) > 2222) throw Error('Invalid Genesis supply');
  const tokens = excluded ? [] : await mapLimited(Array.from({length:Number(count)},(_,i)=>i), async i => {
    const id = await genesis.tokenOfOwnerByIndex(wallet,i,o);
    const [used, vp] = await Promise.all([race.tokenUsed(id,o),genesis.votingPowerOf(id,o)]);
    return !used && vp > 0 ? {id:String(id),vp:Number(vp)} : null;
  });
  return {excluded,voted:voted > 0,tokens:tokens.filter(Boolean)};
}
// Whole snapshot is published only after every finalized race has been read.
// Derives exactly the same sums as the contract getters; no participant-index lag.
async function readLeaderboards(board, raceFactory, block) {
  const o = {blockTag:block.number};
  const [count, season] = await Promise.all([board.raceCount(o),board.currentSeason(o)]);
  if (Number(count) > 60) throw Error('Unsupported chapter');
  const wallets = new Map(); const horses = Array.from({length:22},(_,i)=>({horse:i+1,season:0,allTime:0}));
  for (let i=0;i<Number(count);i++) {
    const race = raceFactory(await board.races(i,o));
    if (!await race.finalized(o)) continue;
    const current = Math.floor(i/10)+1 === Number(season);
    const [accepted, scores] = await Promise.all([race.acceptedBallotCount(o),race.horseRacePoints(o)]);
    if (Number(accepted) > 2222) throw Error('Invalid ballot count');
    const entries = await mapLimited(Array.from({length:Number(accepted)},(_,j)=>j), async j => {
      const ballot = await race.ballotAt(j,o);
      return {wallet:ballot.wallet,points:Number(await race.pointsOf(ballot.wallet,o))};
    });
    if (new Set(entries.map(e=>e.wallet.toLowerCase())).size !== entries.length) throw Error('Duplicate wallet');
    for (const entry of entries) {
      const key = entry.wallet.toLowerCase();
      const row = wallets.get(key) || {wallet:entry.wallet,season:0,allTime:0};
      row.allTime += entry.points; if (current) row.season += entry.points; wallets.set(key,row);
    }
    horses.forEach((h,j)=>{ h.allTime += Number(scores[j]); if(current) h.season += Number(scores[j]); });
  }
  return {season:Number(season),wallets:[...wallets.values()],horses};
}
async function assertSnapshot(provider, block) {
  const check = await provider.getBlock(block.number);
  if (!check || check.hash !== block.hash) throw Error('Chain changed. Please refresh.');
}
const raceAt = (address, provider) => new Contract(address,RACE_ABI,provider);
module.exports = {RACE_ABI,BOARD_ABI,GENESIS_ABI,mapLimited,phaseAt,readRace,inventory,readLeaderboards,assertSnapshot,raceAt};
