const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 public mint entrypoint", function () {
  it("does not expose the legacy payable publicTestMint bypass", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    // ethers v6 Interface#getFunction returns null when the function is absent.
    expect(genesis.interface.getFunction("publicTestMint")).to.equal(null);
    expect(genesis.interface.getFunction("setTestMintPrice")).to.equal(null);
    expect(genesis.interface.getFunction("withdrawTestFunds")).to.equal(null);
  });

  it("rejects direct public saleMint calls from ordinary wallets", async function () {
    const [, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await expect(genesis.connect(buyer).saleMint(buyer.address, 1)).to.be.revertedWith("Only sale contract");
  });

  it("marks NFTs minted by the configured V7 sale path as refundable public-sale tokens", async function () {
    const [owner, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.setSaleContract(owner.address);
    await genesis.saleMint(buyer.address, 1);

    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
    expect(await genesis.publicSaleToken(1)).to.equal(true);
  });
});
