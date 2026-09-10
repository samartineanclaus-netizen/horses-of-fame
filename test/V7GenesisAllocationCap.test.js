const { mintInBatches } = require('./helpers/mint-batches.cjs');
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Genesis allocation caps", function () {
  it("locks Public 2,000 + Community 111 + Team Reserve 111 = 2,222", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    expect(await genesis.MAX_SUPPLY()).to.equal(2222n);
    expect(await genesis.PUBLIC_MINT_SUPPLY()).to.equal(2000n);
    expect(await genesis.COMMUNITY_ALLOCATION_SUPPLY()).to.equal(111n);
    expect(await genesis.TEAM_RESERVE_SUPPLY()).to.equal(111n);
    expect(await genesis.NON_PUBLIC_ALLOCATION_SUPPLY()).to.equal(222n);
    expect(
      (await genesis.PUBLIC_MINT_SUPPLY()) +
      (await genesis.COMMUNITY_ALLOCATION_SUPPLY()) +
      (await genesis.TEAM_RESERVE_SUPPLY()),
    ).to.equal(2222n);
  });

  it("enforces the Community and Team Reserve 111-NFT buckets separately", async function () {
    const [owner, communityRecipient, team] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);

    await mintInBatches(genesis, 'ownerMint', [communityRecipient.address, 111]);
    expect(await genesis.communityAllocationMinted()).to.equal(111n);
    expect(await genesis.teamReserveMinted()).to.equal(0n);

    await expect(genesis.ownerMint(owner.address, 1))
      .to.be.revertedWith("Community allocation exceeded");

    await mintInBatches(genesis, 'ownerMint', [team.address, 111]);
    expect(await genesis.teamReserveMinted()).to.equal(111n);
    expect(await genesis.nonPublicAllocationMinted()).to.equal(222n);
    expect(await genesis.totalSupply()).to.equal(222n);

    await expect(genesis.ownerMint(team.address, 1))
      .to.be.revertedWith("Team Reserve allocation exceeded");
  });

  it("classifies only the designated Team Reserve Wallet into the Team bucket", async function () {
    const [, communityA, communityB, team] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);

    await mintInBatches(genesis, 'ownerMint', [communityA.address, 60]);
    await mintInBatches(genesis, 'ownerMint', [communityB.address, 51]);
    await genesis.ownerMint(team.address, 20);

    expect(await genesis.communityAllocationMinted()).to.equal(111n);
    expect(await genesis.teamReserveMinted()).to.equal(20n);
    expect(await genesis.nonPublicAllocationMinted()).to.equal(131n);
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
    expect(await genesis.communityAllocationMinted()).to.equal(0n);
    expect(await genesis.teamReserveMinted()).to.equal(0n);
  });
});
