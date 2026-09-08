const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 public mint entrypoint integrity", function () {
  it("does not expose the legacy payable publicTestMint bypass", async function () {
    const [, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    const selector = ethers.id("publicTestMint(uint256)").slice(0, 10);
    const encodedQuantity = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [1n]).slice(2);

    await expect(
      buyer.sendTransaction({
        to: await genesis.getAddress(),
        data: `${selector}${encodedQuantity}`,
        value: ethers.parseEther("0.001"),
      }),
    ).to.be.reverted;

    expect(await genesis.totalSupply()).to.equal(0n);
    expect(await ethers.provider.getBalance(await genesis.getAddress())).to.equal(0n);
  });

  it("keeps public-sale minting restricted to the configured V7 sale contract", async function () {
    const [owner, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await expect(genesis.connect(buyer).saleMint(buyer.address, 1)).to.be.revertedWith("Only sale contract");

    await genesis.connect(owner).setSaleContract(owner.address);
    await genesis.connect(owner).saleMint(buyer.address, 1);

    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
    expect(await genesis.publicSaleToken(1)).to.equal(true);
  });
});
