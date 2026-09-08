const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;
const INTERVAL = 3 * DAY;
const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1, ...Array(12).fill(0)];

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, first, second, third, team, other] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.setTeamWallet(team.address);
  await genesis.ownerMint(owner.address, 22);
  for (const holder of [first, second, third]) await genesis.ownerMint(holder.address, 1);

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();
  await community.setGenesisContract(await genesis.getAddress());
  const HOF = await ethers.getContractFactory("HOFSeasonLeaderboard");
  const hof = await HOF.deploy();
  await hof.waitForDeployment();
  return { first, second, third, team, other, genesis, community, hof };
}

async function deployRace(fixture, opensAt) {
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await fixture.genesis.getAddress(), opensAt, fixture.team.address);
  await race.waitForDeployment();
  return race;
}

async function registerBoth(fixture, race) {
  const address = await race.getAddress();
  await fixture.community.registerRace(address);
  await fixture.hof.recordRace(address);
}

async function assertCadenceRejected(fixture, race, lastOpening, count) {
  const { community, hof, first } = fixture;
  const address = await race.getAddress();
  await expect(community.registerRace(address)).to.be.revertedWith("race cadence must be 3 days");
  await expect(hof.recordRace(address)).to.be.revertedWith("race cadence must be 3 days");
  expect(await community.racesRegistered()).to.equal(BigInt(count));
  expect(await hof.racesRecorded()).to.equal(BigInt(count));
  expect(await community.lastRaceOpensAt()).to.equal(BigInt(lastOpening));
  expect(await hof.lastRaceOpensAt()).to.equal(BigInt(lastOpening));
  expect(await community.registeredRace(address)).to.equal(false);
  expect(await community.raceSeason(address)).to.equal(0n);
  expect(await hof.raceRecorded(address)).to.equal(false);
  expect(await community.races(count)).to.equal(ethers.ZeroAddress);
  await expect(community.connect(first).claimRacePoints(address)).to.be.revertedWith("race not registered");
}

describe("V7 Community cadence and parallel six-season integration", function () {
  this.timeout(60000);

  it("uses the same three-day interval in both leaderboards and keeps the 24-hour vote window", async function () {
    const fixture = await deployFixture();
    const { community, hof } = fixture;
    expect(await community.RACE_INTERVAL()).to.equal(BigInt(INTERVAL));
    expect(await hof.RACE_INTERVAL()).to.equal(BigInt(INTERVAL));
    expect(await community.RACES_PER_SEASON()).to.equal(10n);
    expect(await community.CHAPTER_SEASONS()).to.equal(6n);
    const latest = await ethers.provider.getBlock("latest");
    const race = await deployRace(fixture, latest.timestamp + 100);
    expect((await race.closesAt()) - (await race.opensAt())).to.equal(BigInt(DAY));
  });

  for (const offset of [-1, 1]) {
    it(`rejects a second race opening one second ${offset < 0 ? "early" : "late"} without changing either leaderboard`, async function () {
      const fixture = await deployFixture();
      const latest = await ethers.provider.getBlock("latest");
      const firstOpening = latest.timestamp + 100;
      const firstRace = await deployRace(fixture, firstOpening);
      const secondOpening = firstOpening + INTERVAL + offset;
      const secondRace = await deployRace(fixture, secondOpening);
      await setTime(firstOpening + DAY);
      await registerBoth(fixture, firstRace);
      await setTime(secondOpening + DAY);
      await assertCadenceRejected(fixture, secondRace, firstOpening, 1);
    });
  }

  it("rejects a different race contract using the same opening as the previous race", async function () {
    const fixture = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const opensAt = latest.timestamp + 100;
    const firstRace = await deployRace(fixture, opensAt);
    const duplicateSlot = await deployRace(fixture, opensAt);
    await setTime(opensAt + DAY);
    await registerBoth(fixture, firstRace);
    await assertCadenceRejected(fixture, duplicateSlot, opensAt, 1);
  });

  it("accepts exact scheduled openings despite delayed registration and rejects out-of-order races", async function () {
    const fixture = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const firstOpening = latest.timestamp + 100;
    const races = [];
    for (let i = 0; i < 3; i++) races.push(await deployRace(fixture, firstOpening + i * INTERVAL));

    // Registration can be delayed; cadence is measured between opensAt values.
    await setTime(firstOpening + 2 * INTERVAL + DAY + 600);
    await registerBoth(fixture, races[0]);
    await assertCadenceRejected(fixture, races[2], firstOpening, 1);
    await registerBoth(fixture, races[1]);
    await registerBoth(fixture, races[2]);
    expect(await fixture.community.racesRegistered()).to.equal(3n);
    expect(await fixture.hof.racesRecorded()).to.equal(3n);
    expect(await fixture.community.lastRaceOpensAt()).to.equal(BigInt(firstOpening + 2 * INTERVAL));
    expect(await fixture.hof.lastRaceOpensAt()).to.equal(BigInt(firstOpening + 2 * INTERVAL));
  });

  it("processes the same 60 races in both leaderboards, preserving history, Top 3, resets and Chapter I limits", async function () {
    const fixture = await deployFixture();
    const { community, hof, first, second, third, other } = fixture;
    const voters = [first, second, third];
    let previousSeasonClosesAt = 0;
    let totalRaces = 0;

    for (let season = 1; season <= 6; season++) {
      const latest = await ethers.provider.getBlock("latest");
      // A five-day inter-season gap is only test input, not a new protocol rule.
      const firstOpening = previousSeasonClosesAt === 0
        ? latest.timestamp + 100
        : previousSeasonClosesAt + 5 * DAY;

      for (let raceNumber = 1; raceNumber <= 10; raceNumber++) {
        const opensAt = firstOpening + (raceNumber - 1) * INTERVAL;
        const race = await deployRace(fixture, opensAt);
        const address = await race.getAddress();
        const salts = voters.map(voter =>
          ethers.keccak256(ethers.toUtf8Bytes(`${address}:${voter.address}`))
        );

        await setTime(opensAt);
        for (let i = 0; i < voters.length; i++) {
          await race.connect(voters[i]).commitVote(await race.makeCommitment(1, salts[i]), [23 + i]);
        }
        await setTime(opensAt + DAY);
        for (let i = 0; i < voters.length; i++) await race.connect(voters[i]).revealVote(1, salts[i]);
        await registerBoth(fixture, race);
        for (const voter of voters) await community.connect(voter).claimRacePoints(address);

        totalRaces++;
        expect(await community.raceSeason(address)).to.equal(BigInt(season));
        expect(await community.racesRegistered()).to.equal(BigInt(raceNumber));
        expect(await hof.racesRecorded()).to.equal(BigInt(raceNumber));
        expect(await community.lastRaceOpensAt()).to.equal(BigInt(opensAt));
        expect(await hof.lastRaceOpensAt()).to.equal(BigInt(opensAt));

        if (raceNumber === 9) {
          await expect(community.finalizeSeason()).to.be.revertedWith("season not complete");
          await expect(hof.finalizeSeason()).to.be.revertedWith("season not complete");
        }
      }

      await expect(community.registerRace(other.address)).to.be.revertedWith("season complete");
      await expect(hof.recordRace(other.address)).to.be.revertedWith("season complete");
      previousSeasonClosesAt = firstOpening + 9 * INTERVAL + DAY;
      await community.finalizeSeason();
      await hof.finalizeSeason();

      expect(await community.currentSeason()).to.equal(BigInt(season + 1));
      expect(await hof.currentSeason()).to.equal(BigInt(season + 1));
      expect(await community.racesRegistered()).to.equal(0n);
      expect(await hof.racesRecorded()).to.equal(0n);
      expect(await community.lastRaceOpensAt()).to.equal(0n);
      expect(await hof.lastRaceOpensAt()).to.equal(0n);
      expect(await community.activeWalletCount()).to.equal(0n);
      expect(Array.from(await community.getSeasonTop3(season))).to.deep.equal(voters.map(v => v.address));
      for (const voter of voters) {
        expect(await community.seasonHistory(season, voter.address)).to.equal(250n);
        expect(await community.allTimePoints(voter.address)).to.equal(250n * BigInt(season));
        expect(await community.seasonPoints(voter.address)).to.equal(0n);
      }
      for (let horse = 1; horse <= 22; horse++) {
        const score = BigInt(RACE_POINTS[horse - 1]) * 10n;
        expect(await hof.seasonHistory(season, horse)).to.equal(score);
        expect(await hof.allTimePoints(horse)).to.equal(score * BigInt(season));
        expect(await hof.seasonPoints(horse)).to.equal(0n);
      }
    }

    expect(totalRaces).to.equal(60);
    expect(await community.chapterComplete()).to.equal(true);
    expect(await hof.chapterComplete()).to.equal(true);
    expect(await community.seasonsFinalized()).to.equal(6n);
    expect(await hof.seasonsFinalized()).to.equal(6n);
    expect(await hof.genesisGrandChampion()).to.equal(1n);
    await expect(community.registerRace(other.address)).to.be.revertedWith("chapter complete");
    await expect(hof.recordRace(other.address)).to.be.revertedWith("chapter complete");
    await expect(community.finalizeSeason()).to.be.revertedWith("chapter complete");
    await expect(hof.finalizeSeason()).to.be.revertedWith("chapter complete");
  });
});
