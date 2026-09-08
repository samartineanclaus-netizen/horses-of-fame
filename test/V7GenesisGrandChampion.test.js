const { expect } = require("chai");
const { ethers } = require("hardhat");

const THREE_DAYS = 3 * 24 * 60 * 60;
const DAY = 24 * 60 * 60;

async function setTime(timestamp) {
  const latest = await ethers.provider.getBlock("latest");
  const target = Math.max(timestamp, latest.timestamp + 1);
  await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  const Leaderboard = await ethers.getContractFactory("HOFSeasonLeaderboard");
  const leaderboard = await Leaderboard.deploy();
  await leaderboard.waitForDeployment();

  return { genesis, leaderboard, team };
}

async function recordSeason(genesis, leaderboard, team) {
  let firstOpensAt;
  for (let raceNumber = 0; raceNumber < 10; raceNumber++) {
    const latest = await ethers.provider.getBlock("latest");
    const opensAt = raceNumber === 0
      ? latest.timestamp + 1
      : firstOpensAt + raceNumber * THREE_DAYS;
    if (raceNumber === 0) firstOpensAt = opensAt;

    const Voting = await ethers.getContractFactory("HOFRaceVoting");
    const race = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
    await race.waitForDeployment();
    await setTime(opensAt + DAY);
    await leaderboard.recordRace(await race.getAddress());
  }
  await leaderboard.finalizeSeason();
}

describe("V7 Chapter I Genesis Grand Champion", function () {
  it("does not expose the Chapter I title before all six seasons are complete", async function () {
    const { leaderboard } = await deployFixture();
    await expect(leaderboard.genesisGrandChampion()).to.be.revertedWith("chapter not complete");
  });

  it("names HOF All-Time #1 as Genesis Grand Champion after all 60 races", async function () {
    const { genesis, leaderboard, team } = await deployFixture();

    for (let season = 0; season < 6; season++) {
      await recordSeason(genesis, leaderboard, team);
    }

    expect(await leaderboard.seasonsFinalized()).to.equal(6n);
    expect(await leaderboard.chapterComplete()).to.equal(true);
    expect(await leaderboard.allTimePoints(1)).to.equal(1500n);
    expect(await leaderboard.genesisGrandChampion()).to.equal(1n);

    const ranked = await leaderboard.allTimeRanking();
    expect(ranked[0]).to.equal(1n);
  });
});
