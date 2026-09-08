const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, buyer, other, prize, audit, founder] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const latest = await ethers.provider.getBlock("latest");
  const deadline = latest.timestamp + 3600;
  const Sale = await ethers.getContractFactory("HOFGenesisSale");
  const sale = await Sale.deploy(await usdc.getAddress(), await genesis.getAddress(), deadline, prize.address, audit.address, founder.address);
  await sale.waitForDeployment();
  await genesis.setSaleContract(await sale.getAddress());
  await usdc.mint(buyer.address, 60_000_000n);
  await usdc.connect(buyer).approve(await sale.getAddress(), 60_000_000n);
  return { buyer, other, genesis, usdc, sale, deadline };
}

async function afterDeadline(deadline) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [deadline + 1]);
  await ethers.provider.send("evm_mine", []);
}

describe("V7 atomic refunds", function () {
  it("burns public-sale NFTs and returns exactly 30 USDC per NFT", async function () {
    const { buyer, genesis, usdc, sale, deadline } = await deployFixture();
    await sale.connect(buyer).mint(2);
    expect(await usdc.balanceOf(buyer.address)).to.equal(0n);
    await afterDeadline(deadline);
    await expect(sale.connect(buyer).refund([1, 2]))
      .to.emit(sale, "Refunded")
      .withArgs(buyer.address, 60_000_000n, 2n);
    expect(await usdc.balanceOf(buyer.address)).to.equal(60_000_000n);
    expect(await sale.paidBy(buyer.address)).to.equal(0n);
    await expect(genesis.ownerOf(1)).to.be.reverted;
    await expect(genesis.ownerOf(2)).to.be.reverted;
  });

  it("cannot refund before the failed-sale deadline", async function () {
    const { buyer, sale } = await deployFixture();
    await sale.connect(buyer).mint(1);
    await expect(sale.connect(buyer).refund([1])).to.be.revertedWith("refunds not enabled");
  });

  it("cannot refund an NFT after transferring it away", async function () {
    const { buyer, other, genesis, usdc, sale, deadline } = await deployFixture();
    await sale.connect(buyer).mint(1);
    await genesis.connect(buyer).transferFrom(buyer.address, other.address, 1);
    await afterDeadline(deadline);
    await expect(sale.connect(buyer).refund([1])).to.be.revertedWith("Refund holder not owner");
    expect(await usdc.balanceOf(buyer.address)).to.equal(30_000_000n);
    expect(await sale.paidBy(buyer.address)).to.equal(30_000_000n);
    expect(await genesis.ownerOf(1)).to.equal(other.address);
  });

  it("cannot use owner/giveaway NFTs to claim public-sale refunds", async function () {
    const { buyer, genesis, sale, deadline } = await deployFixture();
    await genesis.ownerMint(buyer.address, 1); // token 1 is not a public-sale token
    await sale.connect(buyer).mint(1);         // token 2 is public-sale token
    await afterDeadline(deadline);
    await expect(sale.connect(buyer).refund([1])).to.be.revertedWith("Not public sale token");
  });
});
