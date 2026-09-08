const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Season Rewards", function () {
  async function deployFixture() {
    const [owner, first, second, third] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    const Community = await ethers.getContractFactory("MockCommunitySeasonTop3");
    const community = await Community.deploy();
    await community.waitForDeployment();
    for (let season = 1; season <= 6; season++) {
      await community.setTop3(season, first.address, second.address, third.address);
    }

    const Rewards = await ethers.getContractFactory("HOFSeasonRewards");
    const rewards = await Rewards.deploy(await usdc.getAddress(), await community.getAddress());
    await rewards.waitForDeployment();

    return { owner, first, second, third, usdc, community, rewards };
  }

  it("locks the exact V7 season and Chapter I reward constants", async function () {
    const { rewards } = await deployFixture();
    expect(await rewards.COMMUNITY_FIRST()).to.equal(2_500n * 10n ** 6n);
    expect(await rewards.COMMUNITY_SECOND()).to.equal(1_000n * 10n ** 6n);
    expect(await rewards.COMMUNITY_THIRD()).to.equal(500n * 10n ** 6n);
    expect(await rewards.COMMUNITY_PER_SEASON()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.HOF_PER_SEASON()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.TOTAL_PER_SEASON()).to.equal(8_000n * 10n ** 6n);
    expect(await rewards.COMMUNITY_CHAPTER_ALLOCATION()).to.equal(24_000n * 10n ** 6n);
    expect(await rewards.HOF_CHAPTER_ALLOCATION()).to.equal(24_000n * 10n ** 6n);
    expect(await rewards.CHAPTER_PRIZE_POOL()).to.equal(48_000n * 10n ** 6n);
  });

  it("pays only the archived Community Top 3 exactly 2500 / 1000 / 500 USDC", async function () {
    const { first, second, third, usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 4_000n * 10n ** 6n);
    await rewards.payCommunitySeason(1);
    expect(await usdc.balanceOf(first.address)).to.equal(2_500n * 10n ** 6n);
    expect(await usdc.balanceOf(second.address)).to.equal(1_000n * 10n ** 6n);
    expect(await usdc.balanceOf(third.address)).to.equal(500n * 10n ** 6n);
    expect(await rewards.communitySeasonPaid(1)).to.equal(true);
    expect(await rewards.communityPaid()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.communityRemaining()).to.equal(20_000n * 10n ** 6n);
  });

  it("cannot pay the Community allocation twice for the same season", async function () {
    const { usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 8_000n * 10n ** 6n);
    await rewards.payCommunitySeason(1);
    await expect(rewards.payCommunitySeason(1)).to.be.revertedWith("community season paid");
  });

  it("rejects invalid season numbers", async function () {
    const { usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 8_000n * 10n ** 6n);
    await expect(rewards.payCommunitySeason(0)).to.be.revertedWith("bad season");
    await expect(rewards.payCommunitySeason(7)).to.be.revertedWith("bad season");
  });

  it("after all six Community payouts exactly 24000 USDC remains reserved for HOF", async function () {
    const { usdc, rewards } = await deployFixture();
    const fullPrizePool = 48_000n * 10n ** 6n;
    const hofHalf = 24_000n * 10n ** 6n;
    await usdc.mint(await rewards.getAddress(), fullPrizePool);

    for (let season = 1; season <= 6; season++) {
      await rewards.payCommunitySeason(season);
    }

    expect(await rewards.communityPaid()).to.equal(24_000n * 10n ** 6n);
    expect(await rewards.communityRemaining()).to.equal(0n);
    expect(await rewards.hofReserved()).to.equal(hofHalf);
    expect(await usdc.balanceOf(await rewards.getAddress())).to.equal(hofHalf);
  });

  it("does not expose HOF payout or generic withdrawal before V7 beneficiary mechanics are finalized", async function () {
    const { rewards } = await deployFixture();
    expect(await rewards.hofSeasonAllocation()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.hofReserved()).to.equal(24_000n * 10n ** 6n);
    expect(rewards.interface.hasFunction("payHOFSeason")).to.equal(false);
    expect(rewards.interface.hasFunction("withdraw")).to.equal(false);
  });
});
