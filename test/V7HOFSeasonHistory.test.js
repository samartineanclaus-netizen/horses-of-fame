const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  const Season = await ethers.getContractFactory("HOFSeasonLeaderboard");
  const season = await Season.deploy();
  await season.waitForDeployment();
  return { genesis, season, team };
}

async function recordClosedRace(genesis, season, team) {
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 1;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await race.waitForDeployment();
  await setTime(opensAt + 24 * 60 * 60);
  await season.recordRace(await race.getAddress());
}

async function completeSeason(genesis, season, team) {
  for (let i = 0; i < 10; i++) {
    await recordClosedRace(genesis, season, team);
  }
}

describe("V7 HOF season history, reset and All-Time", function () {
  it("archives season 1, resets active scores and advances to season 2", async function () {
    const { genesis, season, team } = await deployFixture();
    await completeSeason(genesis, season, team);

    expect(await season.seasonPoints(1)).to.equal(250n);
    expect(await season.racesRecorded()).to.equal(10n);
    await season.finalizeSeason();

    expect(await season.seasonHistory(1, 1)).to.equal(250n);
    expect(await season.seasonHistory(1, 2)).to.equal(180n);
    expect(await season.seasonPoints(1)).to.equal(0n);
    expect(await season.seasonPoints(2)).to.equal(0n);
    expect(await season.racesRecorded()).to.equal(0n);
    expect(await season.currentSeason()).to.equal(2n);
    expect(await season.seasonsFinalized()).to.equal(1n);
  });

  it("preserves finalized season points in All-Time standings", async function () {
    const { genesis, season, team } = await deployFixture();
    await completeSeason(genesis, season, team);
    await season.finalizeSeason();

    expect(await season.allTimePoints(1)).to.equal(250n);
    expect(await season.allTimePoints(2)).to.equal(180n);
    expect(await season.allTimePoints(10)).to.equal(10n);
    expect(await season.allTimePoints(11)).to.equal(0n);

    const ranked = await season.allTimeRanking();
    expect(ranked[0]).to.equal(1n);
    expect(ranked[1]).to.equal(2n);
  });

  it("continues accumulating All-Time points across seasons while each new season starts at zero", async function () {
    const { genesis, season, team } = await deployFixture();
    await completeSeason(genesis, season, team);
    await season.finalizeSeason();

    expect(await season.seasonPoints(1)).to.equal(0n);
    await completeSeason(genesis, season, team);
    expect(await season.seasonPoints(1)).to.equal(250n);
    expect(await season.allTimePoints(1)).to.equal(250n);

    await season.finalizeSeason();
    expect(await season.seasonHistory(2, 1)).to.equal(250n);
    expect(await season.allTimePoints(1)).to.equal(500n);
    expect(await season.seasonPoints(1)).to.equal(0n);
    expect(await season.currentSeason()).to.equal(3n);
  });

  it("cannot finalize an incomplete season", async function () {
    const { genesis, season, team } = await deployFixture();
    await recordClosedRace(genesis, season, team);
    await expect(season.finalizeSeason()).to.be.revertedWith("season not complete");
  });

  it("keeps the V7 lower-number tie-break in All-Time standings", async function () {
    const { season } = await deployFixture();
    const ranked = await season.allTimeRanking();
    for (let i = 0; i < 22; i++) {
      expect(ranked[i]).to.equal(BigInt(i + 1));
    }
  });
});
