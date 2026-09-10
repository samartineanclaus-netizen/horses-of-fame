const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

async function fixture(tokenName = "MockUSDC") {
  const [owner, a, b, prize, audit, project] = await ethers.getSigners();
  const genesis = await (await ethers.getContractFactory("GenesisHorses")).deploy("placeholder");
  const token = await (await ethers.getContractFactory(tokenName)).deploy();
  const deadline = (await time.latest()) + 1000;
  const sale = await (await ethers.getContractFactory("HOFGenesisSale")).deploy(
    token.target, genesis.target, deadline, prize.address, audit.address, project.address);
  await genesis.setSaleContract(sale.target);
  await token.mint(a.address, 60_000_000n);
  await token.connect(a).approve(sale.target, 60_000_000n);
  await sale.connect(a).mint(2);
  return { owner, a, b, genesis, token, sale, deadline };
}

describe("V7 final refund entitlement", function () {
  it("refunds a secondary holder at the exact deadline and never the former owner", async function () {
    const { a, b, genesis, token, sale, deadline } = await fixture();
    await genesis.connect(a).transferFrom(a.address, b.address, 1);
    await time.increaseTo(deadline - 1);
    await expect(sale.connect(b).refund.staticCall([1])).to.be.revertedWith("refunds not enabled");
    await time.setNextBlockTimestamp(deadline);
    await sale.connect(b).refund([1]);
    expect(await token.balanceOf(b.address)).to.equal(30_000_000n);
    expect(await sale.paidBy(b.address)).to.equal(0n);
    expect(await sale.refundedTo(b.address)).to.equal(30_000_000n);
    expect(await genesis.totalSupply()).to.equal(1n);
    for (const caller of [a, b]) await expect(sale.connect(caller).refund([1])).to.be.revertedWith("Not public sale token");
    await expect(genesis.ownerOf(1)).to.be.reverted;
    await expect(genesis.connect(b).transferFrom(b.address, a.address, 1)).to.be.reverted;
    expect(await sale.totalRefunded()).to.equal(30_000_000n);
  });
  it("rolls back duplicate IDs and mixed ownership/allocation requests atomically", async function () {
    const { a, b, genesis, token, sale, deadline } = await fixture();
    await genesis.ownerMint(a.address, 1);
    await genesis.connect(a).transferFrom(a.address, b.address, 2);
    await time.increaseTo(deadline);
    for (const [ids, error] of [[[1, 1], "Not public sale token"], [[1, 2], "Refund holder not owner"], [[1, 3], "Not public sale token"]]) {
      await expect(sale.connect(a).refund(ids)).to.be.revertedWith(error);
      expect(await genesis.ownerOf(1)).to.equal(a.address);
      expect(await genesis.publicSaleToken(1)).to.equal(true);
      expect(await sale.totalRefunded()).to.equal(0n);
      expect(await token.balanceOf(sale.target)).to.equal(60_000_000n);
    }
    await expect(genesis.connect(a).refundBurn(a.address, [1])).to.be.revertedWith("Only sale contract");
    await expect(sale.connect(a).refund([])).to.be.revertedWith("no tokens");
  });
  it("rolls back burns on a failed USDC transfer and blocks callback reentrancy", async function () {
    const { a, genesis, token, sale, deadline } = await fixture("CallbackUSDC");
    await time.increaseTo(deadline);
    await token.configure(ethers.ZeroAddress, "0x", true);
    await expect(sale.connect(a).refund([1])).to.be.reverted;
    expect(await genesis.ownerOf(1)).to.equal(a.address);
    expect(await sale.totalRefunded()).to.equal(0n);
    await token.configure(sale.target, sale.interface.encodeFunctionData("refund", [[2]]), false);
    await sale.connect(a).refund([1]);
    expect(await token.callbackSucceeded()).to.equal(false);
    expect((await token.callbackResult()).slice(0, 10)).to.equal(ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10));
    expect(await genesis.ownerOf(2)).to.equal(a.address);
    expect(await sale.totalRefunded()).to.equal(30_000_000n);
  });
  it("rejects a new mint exactly at the deadline", async function () {
    const { a, sale, deadline } = await fixture();
    await time.setNextBlockTimestamp(deadline);
    await expect(sale.connect(a).mint(1)).to.be.revertedWith("sale ended");
  });
  it("never enables refunds after full sell-out, including after the deadline", async function () {
    const { a, token, sale, deadline } = await fixture();
    await token.mint(a.address, 59_940_000_000n);
    await token.connect(a).approve(sale.target, 59_940_000_000n);
    for (let i = 0; i < 19; i++) await sale.connect(a).mint(100);
    await sale.connect(a).mint(98);
    await time.increaseTo(deadline);
    expect(await sale.refundsEnabled()).to.equal(false);
    await expect(sale.connect(a).refund([1])).to.be.revertedWith("refunds not enabled");
  });
  it("allows the designated Team wallet to refund its purchased token", async function () {
    const { a, genesis, sale, deadline } = await fixture();
    await genesis.setTeamWallet(a.address);
    await time.increaseTo(deadline);
    await sale.connect(a).refund([1]);
    await expect(genesis.ownerOf(1)).to.be.reverted;
  });
});
