const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 24 * 60 * 60;

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, first, second, third, team, late] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.setTeamWallet(team.address);
  await genesis.ownerMint(owner.address, 22);
  for (const holder of [first, second, third, late]) {
    await genesis.ownerMint(holder.address, 1);
  }

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();
  await community.setGenesisContract(await genesis.getAddress());
  return { first, second, third, team, late, genesis, community };
}

// Use real Genesis and race contracts. All voters choose horse #1, so every
// revealed voter earns 25 points and the existing NFT-number tie-break applies.
async function createRace(fixture, { includeLate = false, claimLate = false } = {}) {
  const { first, second, third, team, late, genesis, community } = fixture;
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await race.waitForDeployment();
  const raceAddress = await race.getAddress();
  const voters = [
    { signer: first, tokenId: 23, claim: true },
    { signer: second, tokenId: 24, claim: true },
    { signer: third, tokenId: 25, claim: true },
  ];
  if (includeLate) voters.push({ signer: late, tokenId: 26, claim: claimLate });

  await setTime(opensAt);
  for (const voter of voters) {
    voter.salt = ethers.keccak256(ethers.toUtf8Bytes(`${raceAddress}:${voter.signer.address}`));
    const commitment = await race.makeCommitment(1, voter.salt);
    await race.connect(voter.signer).commitVote(commitment, [voter.tokenId]);
  }
  await setTime(opensAt + DAY);
  for (const voter of voters) await race.connect(voter.signer).revealVote(1, voter.salt);
  await community.registerRace(raceAddress);
  for (const voter of voters) {
    if (voter.claim) await community.connect(voter.signer).claimRacePoints(raceAddress);
  }
  return { race, raceAddress };
}

async function finishSeason(fixture) {
  const registered = Number(await fixture.community.racesRegistered());
  for (let i = registered; i < 10; i++) await createRace(fixture);
  await fixture.community.finalizeSeason();
}

// Snapshot both active and archived state to detect effects beyond the caller's
// score, including accidental reactivation of a wallet after season reset.
async function scoringState(fixture) {
  const { first, second, third, late, community } = fixture;
  const holders = [first, second, third, late];
  const finalized = Number(await community.seasonsFinalized());
  const history = [];
  const top3 = [];
  for (let season = 1; season <= finalized; season++) {
    history.push(await Promise.all(holders.map(holder => community.seasonHistory(season, holder.address))));
    top3.push(Array.from(await community.getSeasonTop3(season)));
  }
  return {
    currentSeason: await community.currentSeason(),
    racesRegistered: await community.racesRegistered(),
    activeWalletCount: await community.activeWalletCount(),
    seasonPoints: await Promise.all(holders.map(holder => community.seasonPoints(holder.address))),
    allTimePoints: await Promise.all(holders.map(holder => community.allTimePoints(holder.address))),
    history,
    top3,
  };
}

describe("V7 Community race/season isolation", function () {
  this.timeout(60000);

  it("retains each race's original season after reset and assigns new races to season 2", async function () {
    const fixture = await deployFixture();
    const { community, late } = fixture;
    expect(await community.raceSeason(late.address)).to.equal(0n);
    const firstRace = await createRace(fixture);
    expect(await community.raceSeason(firstRace.raceAddress)).to.equal(1n);
    await finishSeason(fixture);
    expect(await community.registeredRace(firstRace.raceAddress)).to.equal(true);
    expect(await community.raceSeason(firstRace.raceAddress)).to.equal(1n);
    const secondRace = await createRace(fixture);
    expect(await community.raceSeason(secondRace.raceAddress)).to.equal(2n);
    expect(await community.racesRegistered()).to.equal(1n);
  });

  it("rejects an unclaimed season-1 result after finalization without changing scores or archives", async function () {
    const fixture = await deployFixture();
    const { community, late } = fixture;
    const { race, raceAddress } = await createRace(fixture, { includeLate: true });
    expect(await race.revealed(late.address)).to.equal(true);
    expect(await community.raceClaimed(raceAddress, late.address)).to.equal(false);
    await finishSeason(fixture);
    const before = await scoringState(fixture);
    expect(before.currentSeason).to.equal(2n);
    expect(before.activeWalletCount).to.equal(0n);
    expect(before.seasonPoints).to.deep.equal([0n, 0n, 0n, 0n]);
    expect(before.allTimePoints).to.deep.equal([250n, 250n, 250n, 0n]);

    await expect(community.connect(late).claimRacePoints(raceAddress))
      .to.be.revertedWith("race not in current season");
    expect(await scoringState(fixture)).to.deep.equal(before);
    expect(await community.raceClaimed(raceAddress, late.address)).to.equal(false);
  });

  it("cannot add old-race points to a wallet that already scored in the new season", async function () {
    const fixture = await deployFixture();
    const { community, late } = fixture;
    const oldRace = await createRace(fixture, { includeLate: true });
    await finishSeason(fixture);
    const newRace = await createRace(fixture, { includeLate: true, claimLate: true });
    expect(await community.raceClaimed(newRace.raceAddress, late.address)).to.equal(true);
    expect(await community.seasonPoints(late.address)).to.equal(25n);
    const before = await scoringState(fixture);

    await expect(community.connect(late).claimRacePoints(oldRace.raceAddress))
      .to.be.revertedWith("race not in current season");
    expect(await scoringState(fixture)).to.deep.equal(before);
    await finishSeason(fixture);
    expect(await community.seasonHistory(1, late.address)).to.equal(0n);
    expect(await community.seasonHistory(2, late.address)).to.equal(25n);
    expect(await community.allTimePoints(late.address)).to.equal(25n);
  });

  it("still accepts a delayed claim within the same active season, exactly once", async function () {
    const fixture = await deployFixture();
    const { community, late } = fixture;
    const { raceAddress } = await createRace(fixture, { includeLate: true });
    await createRace(fixture);
    await expect(community.connect(late).claimRacePoints(raceAddress))
      .to.emit(community, "CommunityPointsClaimed")
      .withArgs(raceAddress, late.address, 1, 25);
    expect(await community.seasonPoints(late.address)).to.equal(25n);
    await expect(community.connect(late).claimRacePoints(raceAddress)).to.be.revertedWith("already claimed");
    await finishSeason(fixture);
    expect(await community.seasonHistory(1, late.address)).to.equal(25n);
    expect(await community.allTimePoints(late.address)).to.equal(25n);
  });

  it("cannot re-register a previous-season race as a new-season race", async function () {
    const fixture = await deployFixture();
    const { community } = fixture;
    const { raceAddress } = await createRace(fixture);
    await finishSeason(fixture);
    await expect(community.registerRace(raceAddress)).to.be.revertedWith("race already registered");
    expect(await community.raceSeason(raceAddress)).to.equal(1n);
    expect(await community.racesRegistered()).to.equal(0n);
  });

  it("blocks claims after all six seasons and preserves every season's history and All-Time", async function () {
    const fixture = await deployFixture();
    const { community, late } = fixture;
    const { raceAddress } = await createRace(fixture, { includeLate: true });
    for (let season = 1; season <= 6; season++) await finishSeason(fixture);
    expect(await community.chapterComplete()).to.equal(true);
    const before = await scoringState(fixture);
    expect(before.currentSeason).to.equal(7n);
    expect(before.history).to.have.lengthOf(6);
    for (const scores of before.history) expect(scores).to.deep.equal([250n, 250n, 250n, 0n]);
    expect(before.allTimePoints).to.deep.equal([1500n, 1500n, 1500n, 0n]);

    await expect(community.connect(late).claimRacePoints(raceAddress)).to.be.revertedWith("chapter complete");
    expect(await scoringState(fixture)).to.deep.equal(before);
    expect(await community.raceClaimed(raceAddress, late.address)).to.equal(false);
  });
});
