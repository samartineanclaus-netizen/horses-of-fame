const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Genesis non-public allocation cap", function () {
  it("locks Public Mint 2,000 and non-public allocation 222 at contract level", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    expect(await genesis.MAX_SUPPLY()).to.equal(2222n);
    expect(await genesis.PUBLIC_MINT_SUPPLY()).to.equal(2000n);
    expect(await genesis.NON_PUBLIC_ALLOCATION_SUPPLY()).to.equal(222n);
    expect((await genesis.PUBLIC_MINT_SUPPLY()) + (await genesis.NON_PUBLIC_ALLOCATION_SUPPLY())).to.equal(2222n);
  });

  it("cannot owner-mint more than the fixed 222 Community + Team allocation", async function () {
    const [owner, recipient] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.ownerMint(recipient.address, 111);
    await genesis.ownerMint(owner.address, 111);
    expect(await genesis.nonPublicAllocationMinted()).to.equal(222n);
    expect(await genesis.totalSupply()).to.equal(222n);

    await expect(genesis.ownerMint(recipient.address, 1))
      .to.be.revertedWith("Non-public allocation exceeded");
  });

  it("keeps the paid Public Mint isolated behind the configured sale contract", async function () {
    const [owner, buyer, team, audit, project] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);

    const latest = await ethers.provider.getBlock("latest");
    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    const sale = await Sale.deploy(
      await usdc.getAddress(),
      await genesis.getAddress(),
      latest.timestamp + 86400,
      owner.address,
      audit.address,
      project.address,
    );
    await sale.waitForDeployment();
    await genesis.setSaleContract(await sale.getAddress());

    await expect(genesis.connect(buyer).saleMint(buyer.address, 1))
      .to.be.revertedWith("Only sale contract");

    await usdc.mint(buyer.address, 30_000_000n);
    await usdc.connect(buyer).approve(await sale.getAddress(), 30_000_000n);
    await sale.connect(buyer).mint(1);

    expect(await sale.sold()).to.equal(1n);
    expect(await genesis.publicSaleToken(1)).to.equal(true);
    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
  });
});
