const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployGenesis() {
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  return genesis;
}

async function deployClosedRace(genesis) {
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 1;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt);
  await race.waitForDeployment();
  await ethers.provider.send("evm_setNextBlockTimestamp", [opensAt + 24 * 60 * 60]);
  await ethers.provider.send("evm_mine", []);
  return race;
}

async function deployFixture() {
  const [owner, other] = await ethers.getSigners();
  const genesis = await deployGenesis();
  const Season = await ethers.getContractFactory("HOFSeasonLeaderboard");
  const season = await Season.deploy();
  await season.waitForDeployment();
  return { owner, other, genesis, season };
}

describe("V7 HOF Season Leaderboard", function () {
  it("accumulates HOF points across multiple races", async function () {
    const { genesis, season } = await deployFixture();
    const race1 = await deployClosedRace(genesis);
    await season.recordRace(await race1.getAddress());
    const race2 = await deployClosedRace(genesis);
    await season.recordRace(await race2.getAddress());

    // Zero-VP race ranking is #1..#22, so #1 earns 25 each race,
    // #2 earns 18 each race and #11 earns zero.
    expect(await season.seasonPoints(1)).to.equal(50n);
    expect(await season.seasonPoints(2)).to.equal(36n);
    expect(await season.seasonPoints(10)).to.equal(2n);
    expect(await season.seasonPoints(11)).to.equal(0n);
    expect(await season.racesRecorded()).to.equal(2n);
  });

  it("cannot record the same race twice", async function () {
    const { genesis, season } = await deployFixture();
    const race = await deployClosedRace(genesis);
    const address = await race.getAddress();
    await season.recordRace(address);
    await expect(season.recordRace(address)).to.be.revertedWith("race already recorded");
  });

  it("only the season owner can record race results", async function () {
    const { other, genesis, season } = await deployFixture();
    const race = await deployClosedRace(genesis);
    await expect(season.connect(other).recordRace(await race.getAddress()))
      .to.be.revertedWithCustomError(season, "OwnableUnauthorizedAccount")
      .withArgs(other.address);
  });

  it("enforces exactly ten races per season", async function () {
    const { genesis, season } = await deployFixture();
    for (let i = 0; i < 10; i++) {
      const race = await deployClosedRace(genesis);
      await season.recordRace(await race.getAddress());
    }
    expect(await season.racesRecorded()).to.equal(10n);
    expect(await season.seasonComplete()).to.equal(true);

    const race11 = await deployClosedRace(genesis);
    await expect(season.recordRace(await race11.getAddress())).to.be.revertedWith("season complete");
  });

  it("uses lower HOF number as season tie-break", async function () {
    const { season } = await deployFixture();
    // Before any races all 22 have equal season points (zero).
    const ranked = await season.ranking();
    for (let i = 0; i < 22; i++) {
      expect(ranked[i]).to.equal(BigInt(i + 1));
    }
  });

  it("rejects a race that has not closed", async function () {
    const { genesis, season } = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const opensAt = latest.timestamp + 100;
    const Voting = await ethers.getContractFactory("HOFRaceVoting");
    const race = await Voting.deploy(await genesis.getAddress(), opensAt);
    await race.waitForDeployment();
    await expect(season.recordRace(await race.getAddress())).to.be.revertedWith("race not closed");
  });
});
