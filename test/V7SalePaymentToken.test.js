const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 sale payment-token decimals", function () {
  async function deployGenesis() {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    return genesis;
  }

  it("accepts the 6-decimal USDC accounting used by V7", async function () {
    const [prizePool, audit, project] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();
    const genesis = await deployGenesis();
    const latest = await ethers.provider.getBlock("latest");

    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    const sale = await Sale.deploy(
      await usdc.getAddress(),
      await genesis.getAddress(),
      latest.timestamp + 86400,
      prizePool.address,
      audit.address,
      project.address,
    );
    await sale.waitForDeployment();

    expect(await sale.MINT_PRICE()).to.equal(30_000_000n);
    expect(await usdc.decimals()).to.equal(6n);
  });

  it("rejects an 18-decimal payment token so 30 * 1e6 cannot be mispriced", async function () {
    const [prizePool, audit, project] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("Mock18DecimalsToken");
    const token = await Token.deploy();
    await token.waitForDeployment();
    const genesis = await deployGenesis();
    const latest = await ethers.provider.getBlock("latest");

    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    await expect(
      Sale.deploy(
        await token.getAddress(),
        await genesis.getAddress(),
        latest.timestamp + 86400,
        prizePool.address,
        audit.address,
        project.address,
      ),
    ).to.be.revertedWith("payment token must use 6 decimals");
  });
});
