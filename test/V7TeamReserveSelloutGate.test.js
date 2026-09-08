const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Team Reserve sell-out transfer gate", function () {
  it("keeps Team Reserve NFTs in the designated wallet until Public Mint sell-out", async function () {
    const [owner, team, buyer] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);

    const SaleState = await ethers.getContractFactory("MockV7SaleSuccess");
    const saleState = await SaleState.deploy();
    await saleState.waitForDeployment();
    await genesis.setSaleContract(await saleState.getAddress());

    await genesis.ownerMint(team.address, 1);
    expect(await genesis.ownerOf(1)).to.equal(team.address);
    expect(await genesis.teamReserveMinted()).to.equal(1n);

    await expect(
      genesis.connect(team).transferFrom(team.address, buyer.address, 1),
    ).to.be.revertedWith("Team Reserve locked until sell-out");

    expect(await genesis.ownerOf(1)).to.equal(team.address);

    await saleState.setSaleSuccessful(true);
    await expect(
      genesis.connect(team).transferFrom(team.address, buyer.address, 1),
    ).to.not.be.reverted;

    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
  });

  it("does not lock Community allocation transfers behind Public Mint sell-out", async function () {
    const [owner, team, community, recipient] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);

    const SaleState = await ethers.getContractFactory("MockV7SaleSuccess");
    const saleState = await SaleState.deploy();
    await saleState.waitForDeployment();
    await genesis.setSaleContract(await saleState.getAddress());

    await genesis.ownerMint(community.address, 1);
    expect(await saleState.saleSuccessful()).to.equal(false);

    await expect(
      genesis.connect(community).transferFrom(community.address, recipient.address, 1),
    ).to.not.be.reverted;

    expect(await genesis.ownerOf(1)).to.equal(recipient.address);
  });

  it("locks Team Reserve even if allocation was minted before the sale contract was configured", async function () {
    const [owner, team, buyer] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(team.address);
    await genesis.ownerMint(team.address, 1);

    await expect(
      genesis.connect(team).transferFrom(team.address, buyer.address, 1),
    ).to.be.revertedWith("Team Reserve locked until sell-out");
  });
});
