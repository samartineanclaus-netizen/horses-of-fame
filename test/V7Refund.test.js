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
  it("refunds Public Mint purchases held by the Team Reserve wallet without unlocking its allocation", async function () {
    const { buyer, other, genesis, usdc, sale, deadline } = await deployFixture();
    await genesis.setTeamWallet(buyer.address);
    await genesis.ownerMint(buyer.address, 1); // Unpaid Team Reserve allocation.
    await sale.connect(buyer).mint(2); // Paid public tokens 2 and 3.
    await afterDeadline(deadline);

    await expect(genesis.connect(buyer).transferFrom(buyer.address, other.address, 2))
      .to.be.revertedWith("Team Reserve locked until sell-out");
    await expect(sale.connect(buyer).refund([2, 1]))
      .to.be.revertedWith("Not public sale token");
    expect(await genesis.ownerOf(2)).to.equal(buyer.address);
    expect(await sale.paidBy(buyer.address)).to.equal(60_000_000n);

    await expect(sale.connect(buyer).refund([2, 3]))
      .to.emit(sale, "Refunded").withArgs(buyer.address, 60_000_000n, 2n);
    expect(await usdc.balanceOf(buyer.address)).to.equal(60_000_000n);
    expect(await sale.paidBy(buyer.address)).to.equal(0n);
    expect(await genesis.totalSupply()).to.equal(1n);
    expect(await genesis.publicSaleToken(2)).to.equal(false);
    expect(await genesis.publicSaleToken(3)).to.equal(false);
    await expect(genesis.ownerOf(2)).to.be.reverted;
    await expect(genesis.ownerOf(3)).to.be.reverted;
    await expect(sale.connect(buyer).refund([2]))
      .to.be.revertedWith("refund exceeds paid amount");
    await expect(genesis.connect(buyer).transferFrom(buyer.address, other.address, 1))
      .to.be.revertedWith("Team Reserve locked until sell-out");
  });

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
