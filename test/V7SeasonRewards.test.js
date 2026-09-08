const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Season Rewards", function () {
  async function deployFixture() {
    const [owner, first, second, third, other] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    const Rewards = await ethers.getContractFactory("HOFSeasonRewards");
    const rewards = await Rewards.deploy(await usdc.getAddress());
    await rewards.waitForDeployment();

    return { owner, first, second, third, other, usdc, rewards };
  }

  it("locks the exact V7 season and Chapter I reward constants", async function () {
    const { rewards } = await deployFixture();
    expect(await rewards.COMMUNITY_FIRST()).to.equal(2_500n * 10n ** 6n);
    expect(await rewards.COMMUNITY_SECOND()).to.equal(1_000n * 10n ** 6n);
    expect(await rewards.COMMUNITY_THIRD()).to.equal(500n * 10n ** 6n);
    expect(await rewards.COMMUNITY_PER_SEASON()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.HOF_PER_SEASON()).to.equal(4_000n * 10n ** 6n);
    expect(await rewards.TOTAL_PER_SEASON()).to.equal(8_000n * 10n ** 6n);
    expect(await rewards.CHAPTER_PRIZE_POOL()).to.equal(48_000n * 10n ** 6n);
  });

  it("pays Community Top 3 exactly 2500 / 1000 / 500 USDC", async function () {
    const { first, second, third, usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 4_000n * 10n ** 6n);

    await rewards.payCommunitySeason(1, first.address, second.address, third.address);

    expect(await usdc.balanceOf(first.address)).to.equal(2_500n * 10n ** 6n);
    expect(await usdc.balanceOf(second.address)).to.equal(1_000n * 10n ** 6n);
    expect(await usdc.balanceOf(third.address)).to.equal(500n * 10n ** 6n);
    expect(await rewards.communitySeasonPaid(1)).to.equal(true);
  });

  it("cannot pay the Community allocation twice for the same season", async function () {
    const { first, second, third, usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 8_000n * 10n ** 6n);
    await rewards.payCommunitySeason(1, first.address, second.address, third.address);
    await expect(
      rewards.payCommunitySeason(1, first.address, second.address, third.address)
    ).to.be.revertedWith("community season paid");
  });

  it("rejects invalid season numbers and duplicate winners", async function () {
    const { first, second, third, usdc, rewards } = await deployFixture();
    await usdc.mint(await rewards.getAddress(), 8_000n * 10n ** 6n);

    await expect(
      rewards.payCommunitySeason(0, first.address, second.address, third.address)
    ).to.be.revertedWith("bad season");
    await expect(
      rewards.payCommunitySeason(7, first.address, second.address, third.address)
    ).to.be.revertedWith("bad season");
    await expect(
      rewards.payCommunitySeason(1, first.address, first.address, third.address)
    ).to.be.revertedWith("duplicate winner");
  });

  it("does not expose a HOF payout path before V7 beneficiary mechanics are finalized", async function () {
    const { rewards } = await deployFixture();
    expect(await rewards.hofSeasonAllocation()).to.equal(4_000n * 10n ** 6n);
    expect(rewards.interface.hasFunction("payHOFSeason")).to.equal(false);
  });
});
