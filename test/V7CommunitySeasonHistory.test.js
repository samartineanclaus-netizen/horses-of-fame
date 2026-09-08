const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, voter] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter.address, 1);

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();
  return { voter, genesis, community };
}

async function makeClaimedRace(genesis, community, voter, label) {
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 1;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt);
  await race.waitForDeployment();
  await setTime(opensAt);

  const salt = ethers.keccak256(ethers.toUtf8Bytes(label));
  const commitment = await race.makeCommitment(1, salt);
  await race.connect(voter).commitVote(commitment, [23]);

  await setTime(opensAt + 24 * 60 * 60);
  await race.connect(voter).revealVote(1, salt);
  const raceAddress = await race.getAddress();
  await community.registerRace(raceAddress);
  await community.connect(voter).claimRacePoints(raceAddress);
}

async function completeSeason(genesis, community, voter, prefix) {
  for (let i = 0; i < 10; i++) {
    await makeClaimedRace(genesis, community, voter, `${prefix}-${i}`);
  }
}

describe("V7 Community season history, reset and All-Time", function () {
  it("archives wallet points, resets season score and advances to season 2", async function () {
    const { voter, genesis, community } = await deployFixture();
    await completeSeason(genesis, community, voter, "s1");
    expect(await community.seasonPoints(voter.address)).to.equal(250n);
    expect(await community.activeWalletCount()).to.equal(1n);

    await community.finalizeSeason();
    expect(await community.seasonHistory(1, voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);
    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.activeWalletCount()).to.equal(0n);
    expect(await community.racesRegistered()).to.equal(0n);
    expect(await community.currentSeason()).to.equal(2n);
    expect(await community.seasonsFinalized()).to.equal(1n);
  });

  it("keeps All-Time points while season 2 starts from zero and accumulates independently", async function () {
    const { voter, genesis, community } = await deployFixture();
    await completeSeason(genesis, community, voter, "s1");
    await community.finalizeSeason();

    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);

    await completeSeason(genesis, community, voter, "s2");
    expect(await community.seasonPoints(voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);

    await community.finalizeSeason();
    expect(await community.seasonHistory(2, voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(500n);
    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.currentSeason()).to.equal(3n);
  });

  it("cannot finalize before ten races are registered", async function () {
    const { voter, genesis, community } = await deployFixture();
    await makeClaimedRace(genesis, community, voter, "incomplete");
    await expect(community.finalizeSeason()).to.be.revertedWith("season not complete");
  });
});
