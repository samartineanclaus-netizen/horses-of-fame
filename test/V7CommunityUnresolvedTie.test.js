const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 unresolved Community tie protection", function () {
  it("does not award a casting win when both tied wallets own zero Genesis NFTs", async function () {
    const [, walletA, walletB] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    const Harness = await ethers.getContractFactory("HOFCommunitySeasonTieHarness");
    const community = await Harness.deploy();
    await community.waitForDeployment();
    await community.setGenesisContract(await genesis.getAddress());

    expect(await genesis.balanceOf(walletA.address)).to.equal(0n);
    expect(await genesis.balanceOf(walletB.address)).to.equal(0n);

    expect(await community.winsCastingTieBreak(walletA.address, walletB.address)).to.equal(false);
  });
});
