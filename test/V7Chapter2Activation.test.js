const {expect}=require('chai');
const {ethers}=require('hardhat');
const {time,loadFixture}=require('@nomicfoundation/hardhat-network-helpers');
const {preparePrizeScan}=require('./helpers/trusted-settlement.cjs');
const {generateRaceKey,settleRace}=require('../lib/owner-voting/backend.cjs');
const DAY=86400;
async function chapterReady(){
 const [owner,backend,team,other]=await ethers.getSigners();
 const genesis=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
 const board=await(await ethers.getContractFactory('LegacyTrustedBoardHarness')).deploy(genesis.target,owner.address,backend.address,team.address);
 const key=await generateRaceKey();let last;
 for(let season=1;season<=6;season++){
  const start=(await time.latest())+100;
  for(let i=0;i<10;i++){
   const opens=start+i*3*DAY;
   if(season===6&&i===9) last=await(await ethers.getContractFactory('HOFTrustedRace')).deploy(genesis.target,opens,team.address,owner.address,backend.address,key.publicKey);
   else last=await(await ethers.getContractFactory('TrustedRaceGasFixture')).deploy(genesis.target,owner.address,backend.address,team.address,opens,0);
   await board.registerRace(last.target);
  }
  await time.increaseTo(start+28*DAY);
  if(season<6){await preparePrizeScan(board);await board.finalizeSeason();}
 }
 return {owner,backend,other,genesis,board,last,key};
}
async function chapterRevealed(){
 const f=await chapterReady();
 // Deliberately late Race Reveal, so a closesAt-based gate would be wrong.
 await time.increase(2*DAY);
 await settleRace(f.last,f.backend,f.key.privateKey);
 return {...f,anchor:Number(await f.last.revealedAt())};
}
describe('V7 Chapter 2 activation gate',function(){
 this.timeout(120000);
 it('rejects missing races, unfinished Race #60, and unauthorized activation',async()=>{
  const f=await loadFixture(chapterReady);
  await expect(f.board.activateChapter2()).revertedWith('race not finalized');
  await expect(f.board.connect(f.other).activateChapter2()).revertedWithCustomError(f.board,'OwnableUnauthorizedAccount');
  const empty=await(await ethers.getContractFactory('LegacyTrustedBoardHarness')).deploy(f.genesis.target,f.owner.address,f.backend.address,f.other.address);
  await expect(empty.activateChapter2()).revertedWith('Chapter 1 incomplete');
 });
 it('rejects 30 days minus one second from actual final Race Reveal',async()=>{
  const f=await loadFixture(chapterRevealed);
  await time.setNextBlockTimestamp(f.anchor+30*DAY-1);
  await expect(f.board.activateChapter2()).revertedWith('Chapter gap below 30 days');
  expect(await f.board.chapter2StartedAt()).eq(0n);
 });
 it('accepts exactly 30 days, before auxiliary season bookkeeping, and only once',async()=>{
  const f=await loadFixture(chapterRevealed);
  expect(await f.board.seasonsFinalized()).eq(5n);
  await time.setNextBlockTimestamp(f.anchor+30*DAY);
  await expect(f.board.activateChapter2()).emit(f.board,'Chapter2Activated').withArgs(f.anchor,f.anchor+30*DAY);
  expect(await f.board.chapter2StartedAt()).eq(BigInt(f.anchor+30*DAY));
  await expect(f.board.activateChapter2()).revertedWith('Chapter 2 already active');
 });
 it('accepts 30 days plus one second after delayed administrative season finalization',async()=>{
  const f=await loadFixture(chapterRevealed);
  await time.increaseTo(f.anchor+20*DAY);
  await preparePrizeScan(f.board);await f.board.finalizeSeason();
  expect(await f.board.previousSeasonEnd()).eq(BigInt(f.anchor));
  await time.setNextBlockTimestamp(f.anchor+30*DAY+1);
  await f.board.activateChapter2();
  expect(await f.board.chapter2StartedAt()).eq(BigInt(f.anchor+30*DAY+1));
 });
});
