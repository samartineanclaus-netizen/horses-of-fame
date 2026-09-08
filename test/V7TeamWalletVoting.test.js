const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 Team Wallet voting rule", function () {
  it("gives 0 VP in Team Wallet and restores rarity VP after transfer", async function () {
    const [owner, team, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.setTeamWallet(team.address);

    // Mint through the Hall of Fame range (1-22) so token #23 is Legendary (5 VP).
    await genesis.ownerMint(owner.address, 22);
    await genesis.ownerMint(team.address, 1);

    expect(await genesis.ownerOf(23)).to.equal(team.address);
    expect(await genesis.rarityOf(23)).to.equal(5n); // Legendary enum value
    expect(await genesis.votingPowerOf(23)).to.equal(0n);

    await genesis.connect(team).transferFrom(team.address, buyer.address, 23);

    expect(await genesis.ownerOf(23)).to.equal(buyer.address);
    expect(await genesis.votingPowerOf(23)).to.equal(5n);
  });

  it("does not suppress voting power for the same rarity outside Team Wallet", async function () {
    const [owner, team, buyer] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.setTeamWallet(team.address);
    await genesis.ownerMint(owner.address, 22);
    await genesis.ownerMint(buyer.address, 1);

    expect(await genesis.votingPowerOf(23)).to.equal(5n);
  });

  it("locks Team Wallet after initial configuration", async function () {
    const [owner, team, other] = await ethers.getSigners();
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    await genesis.setTeamWallet(team.address);
    await expect(genesis.setTeamWallet(other.address))
      .to.be.revertedWith("Team wallet already set");
  });
});
