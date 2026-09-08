const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 sale -> Genesis integration", function () {
  it("allows only the configured sale contract to mint public NFTs", async function () {
    const [owner, buyer, prize, audit, founder] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("https://example.com/placeholder.json");
    await genesis.waitForDeployment();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await MockUSDC.deploy();
    await usdc.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    const sale = await Sale.deploy(
      await usdc.getAddress(),
      await genesis.getAddress(),
      latest.timestamp + 3600,
      prize.address,
      audit.address,
      founder.address
    );
    await sale.waitForDeployment();

    await expect(genesis.connect(buyer).saleMint(buyer.address, 1))
      .to.be.revertedWith("Only sale contract");

    await genesis.setSaleContract(await sale.getAddress());

    await usdc.mint(buyer.address, 30_000_000n);
    await usdc.connect(buyer).approve(await sale.getAddress(), 30_000_000n);

    await expect(sale.connect(buyer).mint(1))
      .to.emit(sale, "Minted")
      .withArgs(buyer.address, 1, 30_000_000n);

    expect(await genesis.balanceOf(buyer.address)).to.equal(1n);
    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
    expect(await sale.sold()).to.equal(1n);
    expect(await sale.paidBy(buyer.address)).to.equal(30_000_000n);
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(30_000_000n);
  });

  it("locks the sale contract configuration after the first valid setup", async function () {
    const [owner, other] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.setSaleContract(other.address);
    await expect(genesis.setSaleContract(owner.address))
      .to.be.revertedWith("Sale contract already set");
  });
});
