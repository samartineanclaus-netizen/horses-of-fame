const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOFGenesisSale - V7 escrow/refund", function () {
  const UNIT = 10n ** 6n;
  const PRICE = 30n * UNIT;

  let usdc, sale;
  let owner, alice, bob, prize, audit, founder;

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  beforeEach(async function () {
    [owner, alice, bob, prize, audit, founder] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    sale = await Sale.deploy(
      await usdc.getAddress(),
      now + 3600,
      prize.address,
      audit.address,
      founder.address
    );
    await sale.waitForDeployment();

    for (const buyer of [alice, bob]) {
      await (await usdc.mint(buyer.address, 100000n * UNIT)).wait();
      await (await usdc.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256)).wait();
    }
  });

  it("charges exactly 30 USDC per public reservation", async function () {
    await (await sale.connect(alice).buy(2)).wait();
    expect(await sale.sold()).to.equal(2n);
    expect(await sale.purchased(alice.address)).to.equal(2n);
    expect(await sale.refundablePaid(alice.address)).to.equal(60n * UNIT);
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(60n * UNIT);
  });

  it("caps the public sale at exactly 2,000", async function () {
    await (await sale.connect(alice).buy(1999)).wait();
    await expect(sale.connect(bob).buy(2)).to.be.revertedWith("Public supply exceeded");
    await (await sale.connect(bob).buy(1)).wait();
    expect(await sale.sold()).to.equal(2000n);
    expect(await sale.saleSuccessful()).to.equal(true);
  });

  it("does not enable refunds before deadline", async function () {
    await (await sale.connect(alice).buy(1)).wait();
    await expect(sale.connect(alice).claimRefund()).to.be.revertedWith("Refunds not enabled");
  });

  it("refunds buyers after deadline if sale did not sell out", async function () {
    const before = await usdc.balanceOf(alice.address);
    await (await sale.connect(alice).buy(3)).wait();
    expect(await usdc.balanceOf(alice.address)).to.equal(before - 90n * UNIT);

    await advance(3601);
    await (await sale.connect(alice).claimRefund()).wait();

    expect(await usdc.balanceOf(alice.address)).to.equal(before);
    expect(await sale.refundablePaid(alice.address)).to.equal(0n);
    expect(await sale.purchased(alice.address)).to.equal(0n);
  });

  it("prevents double refunds", async function () {
    await (await sale.connect(alice).buy(1)).wait();
    await advance(3601);
    await (await sale.connect(alice).claimRefund()).wait();
    await expect(sale.connect(alice).claimRefund()).to.be.revertedWith("Nothing to refund");
  });

  it("cannot distribute proceeds before full sell-out", async function () {
    await (await sale.connect(alice).buy(1)).wait();
    await expect(sale.distributeProceeds()).to.be.revertedWith("Sale not successful");
  });

  it("distributes 48k / 2k / 10k exactly after sell-out", async function () {
    await (await sale.connect(alice).buy(2000)).wait();

    await (await sale.connect(bob).distributeProceeds()).wait();

    expect(await usdc.balanceOf(prize.address)).to.equal(48000n * UNIT);
    expect(await usdc.balanceOf(audit.address)).to.equal(2000n * UNIT);
    expect(await usdc.balanceOf(founder.address)).to.equal(10000n * UNIT);
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(0n);
    expect(await sale.proceedsDistributed()).to.equal(true);
  });

  it("prevents a second proceeds distribution", async function () {
    await (await sale.connect(alice).buy(2000)).wait();
    await (await sale.distributeProceeds()).wait();
    await expect(sale.distributeProceeds()).to.be.revertedWith("Already distributed");
  });

  it("rejects founder wallet as prize-pool treasury", async function () {
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const Sale = await ethers.getContractFactory("HOFGenesisSale");

    await expect(
      Sale.deploy(
        await usdc.getAddress(),
        now + 3600,
        founder.address,
        audit.address,
        founder.address
      )
    ).to.be.revertedWith("Prize treasury cannot be founder");
  });
});
