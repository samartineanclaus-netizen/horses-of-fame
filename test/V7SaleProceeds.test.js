const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture({ prizeEqualsFounder = false } = {}) {
  const [owner, buyer, prize, audit, founder] = await ethers.getSigners();

  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();

  const latest = await ethers.provider.getBlock("latest");
  const deadline = latest.timestamp + 24 * 60 * 60;
  const Sale = await ethers.getContractFactory("HOFGenesisSale");
  const prizeAddress = prizeEqualsFounder ? founder.address : prize.address;

  if (prizeEqualsFounder) {
    return { Sale, usdc, genesis, deadline, prizeAddress, audit, founder };
  }

  const sale = await Sale.deploy(
    await usdc.getAddress(),
    await genesis.getAddress(),
    deadline,
    prizeAddress,
    audit.address,
    founder.address
  );
  await sale.waitForDeployment();
  await genesis.setSaleContract(await sale.getAddress());

  return { owner, buyer, prize, audit, founder, genesis, usdc, sale, deadline };
}

async function sellOut(sale, usdc, buyer) {
  const fullRevenue = 60_000n * 10n ** 6n;
  await usdc.mint(buyer.address, fullRevenue);
  await usdc.connect(buyer).approve(await sale.getAddress(), fullRevenue);

  // Chunk the 2,000 NFT public mint to keep each test transaction comfortably
  // below block gas limits while reaching the exact V7 success condition.
  for (let i = 0; i < 20; i++) {
    await sale.connect(buyer).mint(100);
  }
}

describe("V7 primary-sale proceeds and Prize Pool custody invariants", function () {
  it("rejects deployment when the Prize Pool destination is the founder wallet", async function () {
    const { Sale, usdc, genesis, deadline, prizeAddress, audit, founder } = await deployFixture({ prizeEqualsFounder: true });
    await expect(
      Sale.deploy(
        await usdc.getAddress(),
        await genesis.getAddress(),
        deadline,
        prizeAddress,
        audit.address,
        founder.address
      )
    ).to.be.revertedWith("prize pool cannot be founder");
  });

  it("cannot distribute any primary-sale proceeds before all 2,000 Public Mint NFTs sell", async function () {
    const { buyer, usdc, sale } = await deployFixture();
    await usdc.mint(buyer.address, 30n * 10n ** 6n);
    await usdc.connect(buyer).approve(await sale.getAddress(), 30n * 10n ** 6n);
    await sale.connect(buyer).mint(1);

    expect(await sale.sold()).to.equal(1n);
    expect(await sale.saleSuccessful()).to.equal(false);
    expect(await sale.soldOutAt()).to.equal(0n);
    await expect(sale.distributeProceeds()).to.be.revertedWith("sale not successful");
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(30n * 10n ** 6n);
  });

  it("at sell-out records the sell-out time and distributes exactly 48,000 / 2,000 / 10,000 USDC only once", async function () {
    const { buyer, prize, audit, founder, usdc, sale } = await deployFixture();
    await sellOut(sale, usdc, buyer);

    const fullRevenue = 60_000n * 10n ** 6n;
    expect(await sale.sold()).to.equal(2000n);
    expect(await sale.saleSuccessful()).to.equal(true);
    const latest = await ethers.provider.getBlock("latest");
    expect(await sale.soldOutAt()).to.equal(BigInt(latest.timestamp));
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(fullRevenue);

    await sale.distributeProceeds();

    expect(await usdc.balanceOf(prize.address)).to.equal(48_000n * 10n ** 6n);
    expect(await usdc.balanceOf(audit.address)).to.equal(2_000n * 10n ** 6n);
    expect(await usdc.balanceOf(founder.address)).to.equal(10_000n * 10n ** 6n);
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(0n);
    expect(await sale.distributed()).to.equal(true);

    await expect(sale.distributeProceeds()).to.be.revertedWith("already distributed");
  });
});
