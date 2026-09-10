const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const U = 1_000_000n;
async function fixture() {
  const [owner, a, b, c, other] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("CallbackUSDC")).deploy();
  const board = await (await ethers.getContractFactory("MockCommunitySeasonTop3")).deploy();
  const rewards = await (await ethers.getContractFactory("HOFSeasonRewards")).deploy(token.target, board.target);
  await token.mint(rewards.target, 48_000n * U);
  return { owner, a, b, c, other, token, board, rewards };
}
describe("V7 Community rollover to Chapter 2", function () {
  for (const count of [0, 1, 2, 3]) {
    it(`settles ${count} winners with fixed prizes and separately backed rollover`, async function () {
      const { a, b, c, token, board, rewards } = await loadFixture(fixture);
      const wallets = [a, b, c];
      const winners = wallets.map((w, i) => i < count ? w.address : ethers.ZeroAddress);
      const amounts = [2500n, 1000n, 500n].map(x => x * U);
      const paid = amounts.slice(0, count).reduce((a, b) => a + b, 0n);
      const rollover = 4000n * U - paid;
      await board.setTop3(1, ...winners);
      await expect(rewards.payCommunitySeason(1)).to.emit(rewards, "CommunityRolloverRecorded").withArgs(1, rollover);
      for (let i = 0; i < 3; i++) expect(await token.balanceOf(wallets[i].address)).to.equal(i < count ? amounts[i] : 0n);
      expect(await rewards.communityPaid()).to.equal(paid);
      expect(await rewards.communityRolloverToChapter2()).to.equal(rollover);
      expect(await rewards.communitySeasonRollover(1)).to.equal(rollover);
      expect(await rewards.communityRemaining()).to.equal(20_000n * U);
      expect(await token.balanceOf(rewards.target)).to.equal(48_000n * U - paid);
      await expect(rewards.payCommunitySeason(1)).to.be.revertedWith("community season paid");
    });
  }
  it("preserves empty prize slots without increasing another winner's payout", async function () {
    const { a, token, board, rewards } = await loadFixture(fixture);
    await board.setTop3(1, ethers.ZeroAddress, a.address, ethers.ZeroAddress);
    await rewards.payCommunitySeason(1);
    expect(await token.balanceOf(a.address)).to.equal(1000n * U);
    expect(await rewards.communityRolloverToChapter2()).to.equal(3000n * U);
  });
  it("accounts for all six seasons independently of payment order", async function () {
    const { a, token, board, rewards } = await loadFixture(fixture);
    for (const season of [6, 2, 5, 1, 4, 3]) {
      await board.setTop3(season, a.address, ethers.ZeroAddress, ethers.ZeroAddress);
      await rewards.payCommunitySeason(season);
    }
    expect(await rewards.communityPaid()).to.equal(15_000n * U);
    expect(await rewards.communityRolloverToChapter2()).to.equal(9000n * U);
    expect(await rewards.communityRemaining()).to.equal(0n);
    expect(await rewards.hofReserved()).to.equal(24_000n * U);
    expect(await token.balanceOf(rewards.target)).to.equal(33_000n * U);
    expect(rewards.interface.hasFunction("withdraw")).to.equal(false);
  });
  it("rejects unauthorized, unfinalized and duplicate winners without consuming a season", async function () {
    const { a, other, board, rewards } = await loadFixture(fixture);
    await expect(rewards.connect(other).payCommunitySeason(1)).to.be.revertedWithCustomError(rewards, "OwnableUnauthorizedAccount");
    await expect(rewards.payCommunitySeason(1)).to.be.revertedWith("season not finalized");
    await board.setTop3(1, a.address, a.address, ethers.ZeroAddress);
    await expect(rewards.payCommunitySeason(1)).to.be.revertedWith("duplicate winner");
    expect(await rewards.communitySeasonPaid(1)).to.equal(false);
    expect(await rewards.communityPaid()).to.equal(0n);
    expect(await rewards.communityRolloverToChapter2()).to.equal(0n);
  });
  it("rolls back payment and rollover if a token transfer fails", async function () {
    const { a, token, board, rewards } = await loadFixture(fixture);
    await board.setTop3(1, a.address, ethers.ZeroAddress, ethers.ZeroAddress);
    await token.configure(ethers.ZeroAddress, "0x", true);
    await expect(rewards.payCommunitySeason(1)).to.be.reverted;
    expect(await rewards.communitySeasonPaid(1)).to.equal(false);
    expect(await rewards.communityRolloverToChapter2()).to.equal(0n);
    expect(await rewards.communityPaid()).to.equal(0n);
  });
  it("blocks reentrancy even when the rewards owner itself receives token callbacks", async function () {
    const { a, token, board, rewards } = await loadFixture(fixture);
    await board.setTop3(1, a.address, ethers.ZeroAddress, ethers.ZeroAddress);
    await board.setTop3(2, a.address, ethers.ZeroAddress, ethers.ZeroAddress);
    await rewards.transferOwnership(token.target);
    const pay = rewards.interface.encodeFunctionData("payCommunitySeason", [1]);
    await token.configure(rewards.target, rewards.interface.encodeFunctionData("payCommunitySeason", [2]), false);
    await token.execute(rewards.target, pay);
    expect(await token.callbackSucceeded()).to.equal(false);
    expect((await token.callbackResult()).slice(0, 10)).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
    expect(await rewards.communitySeasonPaid(2)).to.equal(false);
    expect(await rewards.communityPaid()).to.equal(2500n * U);
    expect(await rewards.communityRolloverToChapter2()).to.equal(1500n * U);
  });
  it("does not count an unfunded missing prize as funded rollover", async function () {
    const { a, token, board } = await loadFixture(fixture);
    const rewards = await (await ethers.getContractFactory("HOFSeasonRewards")).deploy(token.target, board.target);
    await board.setTop3(1, a.address, ethers.ZeroAddress, ethers.ZeroAddress);
    await token.mint(rewards.target, 2500n * U);
    await expect(rewards.payCommunitySeason(1)).to.be.revertedWith("insufficient rewards");
    expect(await rewards.communitySeasonRollover(1)).to.equal(0n);
    expect(await rewards.communitySeasonPaid(1)).to.equal(false);
  });
});
