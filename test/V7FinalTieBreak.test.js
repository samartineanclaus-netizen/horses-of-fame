const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const DAY = 86400;
async function fixture(allTied = false) {
  const [owner, a, b, c, d, e, team] = await ethers.getSigners();
  const genesis = await (await ethers.getContractFactory("GenesisHorses")).deploy("placeholder");
  await genesis.ownerMint(owner.address, 22);
  const voters = [a, b, c, d, e];
  for (const w of voters) await genesis.ownerMint(w.address, 1);
  const board = await (await ethers.getContractFactory("HOFCommunitySeason")).deploy();
  await board.setGenesisContract(genesis.target);
  const start = (await time.latest()) + 100;
  const picks = allTied ? [1, 1, 1, 1, 1] : [1, 1, 2, 3, 4];
  for (let n = 0; n < 10; n++) {
    const opens = start + n * 3 * DAY;
    const race = await (await ethers.getContractFactory("HOFRaceVoting")).deploy(genesis.target, opens, team.address);
    await time.increaseTo(opens);
    const salts = voters.map(w => ethers.keccak256(ethers.toUtf8Bytes(`${race.target}:${w.address}`)));
    for (let i = 0; i < voters.length; i++) await race.connect(voters[i]).commitVote(await race.makeCommitment(picks[i], salts[i]), [23 + i]);
    await time.increaseTo(opens + DAY);
    for (let i = 0; i < voters.length; i++) await race.connect(voters[i]).revealVote(picks[i], salts[i]);
    await board.registerRace(race.target);
    for (const w of voters) await board.connect(w).claimRacePoints(race.target);
  }
  return { owner, a, b, c, d, e, genesis, board };
}
async function allTiedFixture() { return fixture(true); }
describe("V7 final Community tie decisions", function () {
  this.timeout(60000);
  it("skips both tied nonholders and fills prizes from the next scores", async function () {
    const { owner, a, b, c, d, e, genesis, board } = await loadFixture(fixture);
    await genesis.connect(a).transferFrom(a.address, owner.address, 23);
    await genesis.connect(b).transferFrom(b.address, owner.address, 24);
    expect(await board.castingTieBreak(a.address, b.address)).to.equal(ethers.ZeroAddress);
    await board.finalizeSeason();
    expect(Array.from(await board.getSeasonTop3(1))).to.deep.equal([c.address, d.address, e.address]);
    expect(await board.seasonHistory(1, a.address)).to.equal(250n);
    expect(await board.allTimePoints(a.address)).to.equal(250n); // Points stay; only prize eligibility changes.
  });
  it("passes an empty eligible podium into real rewards and reserves all 4000 USDC", async function () {
    const { owner, a, b, c, d, e, genesis, board } = await loadFixture(allTiedFixture);
    for (const [i, w] of [a, b, c, d, e].entries()) await genesis.connect(w).transferFrom(w.address, owner.address, 23 + i);
    await board.finalizeSeason();
    expect(Array.from(await board.getSeasonTop3(1))).to.deep.equal(Array(3).fill(ethers.ZeroAddress));
    const token = await (await ethers.getContractFactory("MockUSDC")).deploy();
    const rewards = await (await ethers.getContractFactory("HOFSeasonRewards")).deploy(token.target, board.target);
    await token.mint(rewards.target, 4000_000_000n);
    await rewards.payCommunitySeason(1);
    expect(await rewards.communityRolloverToChapter2()).to.equal(4000_000_000n);
    expect(await token.balanceOf(rewards.target)).to.equal(4000_000_000n);
    expect(await rewards.communityPaid()).to.equal(0n);
  });
  it("uses ownership at winner determination, not at voting or claiming", async function () {
    const { a, b, genesis, board } = await loadFixture(fixture);
    await genesis.connect(a).transferFrom(a.address, b.address, 23);
    await board.finalizeSeason();
    const top = await board.getSeasonTop3(1);
    expect(top[0]).to.equal(b.address);
    // This decision is only a tie-break, not a general NFT holding requirement.
    expect(top[1]).to.equal(a.address);
  });
  it("uses the lowest current Token ID when both tied wallets retain NFTs", async function () {
    const { a, b, board } = await loadFixture(fixture);
    await board.finalizeSeason();
    const top = await board.getSeasonTop3(1);
    expect(top[0]).to.equal(a.address);
    expect(top[1]).to.equal(b.address);
    await expect(board.finalizeSeason()).to.be.revertedWith("season not complete");
  });
});
