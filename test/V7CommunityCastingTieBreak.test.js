const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Community casting tie-break", function () {
  async function deployFixture() {
    const [owner, walletA, walletB] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(owner.address);

    // Token IDs are sequential. Give A #34 and B #121, matching the V7 example.
    await genesis.ownerMint(owner.address, 33);
    await genesis.ownerMint(walletA.address, 1); // #34
    await genesis.ownerMint(owner.address, 78);
    await genesis.ownerMint((await ethers.getSigners())[3].address, 8); // #35-#120
    await genesis.ownerMint(walletB.address, 1); // #121

    const Community = await ethers.getContractFactory("HOFCommunitySeason");
    const community = await Community.deploy();
    await community.waitForDeployment();
    await community.setGenesisContract(await genesis.getAddress());
    return { owner, walletA, walletB, genesis, community };
  }

  it("selects the wallet holding the lower-numbered NFT", async function () {
    const { walletA, walletB, community } = await deployFixture();
    expect(await community.lowestOwnedTokenId(walletA.address)).to.equal(34n);
    expect(await community.lowestOwnedTokenId(walletB.address)).to.equal(121n);
    expect(await community.castingTieBreak(walletA.address, walletB.address)).to.equal(walletA.address);
    expect(await community.castingTieBreak(walletB.address, walletA.address)).to.equal(walletA.address);
  });

  it("uses the lowest NFT held when a wallet owns multiple NFTs", async function () {
    const [owner, walletA, walletB] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(owner.address);
    await genesis.ownerMint(walletA.address, 2); // #1, #2
    await genesis.ownerMint(owner.address, 111);
    await genesis.ownerMint(walletA.address, 7); // #3-#120
    await genesis.ownerMint(walletB.address, 2); // #121, #122

    const Community = await ethers.getContractFactory("HOFCommunitySeason");
    const community = await Community.deploy();
    await community.waitForDeployment();
    await community.setGenesisContract(await genesis.getAddress());

    expect(await community.lowestOwnedTokenId(walletA.address)).to.equal(1n);
    expect(await community.lowestOwnedTokenId(walletB.address)).to.equal(121n);
    expect(await community.castingTieBreak(walletA.address, walletB.address)).to.equal(walletA.address);
  });

  it("does not use wallet address ordering as the tie-break", async function () {
    const [owner, walletA, walletB] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(owner.address);

    await genesis.ownerMint(owner.address, 33);
    await genesis.ownerMint(walletB.address, 1); // #34
    await genesis.ownerMint(owner.address, 78);
    await genesis.ownerMint((await ethers.getSigners())[3].address, 8);
    await genesis.ownerMint(walletA.address, 1); // #121

    const Community = await ethers.getContractFactory("HOFCommunitySeason");
    const community = await Community.deploy();
    await community.waitForDeployment();
    await community.setGenesisContract(await genesis.getAddress());

    expect(await community.lowestOwnedTokenId(walletB.address)).to.equal(34n);
    expect(await community.lowestOwnedTokenId(walletA.address)).to.equal(121n);
    expect(await community.castingTieBreak(walletA.address, walletB.address)).to.equal(walletB.address);
  });

  it("makes a wallet with no NFT lose the tie-break against a wallet that still holds an NFT", async function () {
    const { owner, walletA, walletB, genesis, community } = await deployFixture();

    await genesis.connect(walletA).transferFrom(walletA.address, owner.address, 34);
    expect(await genesis.balanceOf(walletA.address)).to.equal(0n);
    expect(await genesis.balanceOf(walletB.address)).to.equal(1n);

    await expect(community.lowestOwnedTokenId(walletA.address)).to.be.revertedWith("wallet owns no NFT");
    expect(await community.castingTieBreak(walletA.address, walletB.address)).to.equal(walletB.address);
    expect(await community.castingTieBreak(walletB.address, walletA.address)).to.equal(walletB.address);
  });
});
