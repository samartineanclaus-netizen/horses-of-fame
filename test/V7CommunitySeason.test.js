const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, voter1, voter2] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  // #1-22 are HOF. #23-25 are Legendary voting NFTs (5 VP each).
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter1.address, 2);
  await genesis.ownerMint(voter2.address, 1);

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();

  return { owner, voter1, voter2, genesis, community };
}

async function deployRace(genesis) {
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt);
  await race.waitForDeployment();
  return { race, opensAt, closesAt: opensAt + 24 * 60 * 60 };
}

async function commit(race, voter, horse, tokenIds, label) {
  const salt = ethers.keccak256(ethers.toUtf8Bytes(label));
  await race.connect(voter).commitVote(await race.makeCommitment(horse, salt), tokenIds);
  return salt;
}

describe("V7 Community/Holder Season", function () {
  it("awards the wallet the points of its chosen horse's final position", async function () {
    const { voter1, voter2, genesis, community } = await deployFixture();
    const { race, opensAt, closesAt } = await deployRace(genesis);
    await setTime(opensAt);
    const s1 = await commit(race, voter1, 7, [23, 24], "winner"); // 10 VP
    const s2 = await commit(race, voter2, 3, [25], "second"); // 5 VP
    await setTime(closesAt);
    await race.connect(voter1).revealVote(7, s1);
    await race.connect(voter2).revealVote(3, s2);
    await community.registerRace(await race.getAddress());

    await community.connect(voter1).claimRacePoints(await race.getAddress());
    await community.connect(voter2).claimRacePoints(await race.getAddress());
    expect(await community.seasonPoints(voter1.address)).to.equal(25n);
    expect(await community.seasonPoints(voter2.address)).to.equal(18n);
  });

  it("allows only one Community scoring result per wallet per race", async function () {
    const { voter1, genesis, community } = await deployFixture();
    const { race, opensAt, closesAt } = await deployRace(genesis);
    await setTime(opensAt);
    const salt = await commit(race, voter1, 1, [23], "once");
    await setTime(closesAt);
    await race.connect(voter1).revealVote(1, salt);
    const raceAddress = await race.getAddress();
    await community.registerRace(raceAddress);
    await community.connect(voter1).claimRacePoints(raceAddress);
    await expect(community.connect(voter1).claimRacePoints(raceAddress)).to.be.revertedWith("already claimed");
  });

  it("does not multiply Community points when a wallet uses more NFTs", async function () {
    const { voter1, voter2, genesis, community } = await deployFixture();
    const { race, opensAt, closesAt } = await deployRace(genesis);
    await setTime(opensAt);
    const s1 = await commit(race, voter1, 5, [23, 24], "two-nfts"); // 10 VP
    const s2 = await commit(race, voter2, 5, [25], "one-nft"); // 5 VP, same pick
    await setTime(closesAt);
    await race.connect(voter1).revealVote(5, s1);
    await race.connect(voter2).revealVote(5, s2);
    const raceAddress = await race.getAddress();
    await community.registerRace(raceAddress);
    await community.connect(voter1).claimRacePoints(raceAddress);
    await community.connect(voter2).claimRacePoints(raceAddress);

    expect(await community.seasonPoints(voter1.address)).to.equal(25n);
    expect(await community.seasonPoints(voter2.address)).to.equal(25n);
  });

  it("accumulates points for the same wallet across different races", async function () {
    const { voter1, genesis, community } = await deployFixture();

    const first = await deployRace(genesis);
    await setTime(first.opensAt);
    const s1 = await commit(first.race, voter1, 1, [23], "race-1");
    await setTime(first.closesAt);
    await first.race.connect(voter1).revealVote(1, s1);
    await community.registerRace(await first.race.getAddress());
    await community.connect(voter1).claimRacePoints(await first.race.getAddress());

    const second = await deployRace(genesis);
    await setTime(second.opensAt);
    const s2 = await commit(second.race, voter1, 1, [23], "race-2");
    await setTime(second.closesAt);
    await second.race.connect(voter1).revealVote(1, s2);
    await community.registerRace(await second.race.getAddress());
    await community.connect(voter1).claimRacePoints(await second.race.getAddress());

    expect(await community.seasonPoints(voter1.address)).to.equal(50n);
  });

  it("keeps separate wallet scores", async function () {
    const { voter1, voter2, genesis, community } = await deployFixture();
    const { race, opensAt, closesAt } = await deployRace(genesis);
    await setTime(opensAt);
    const s1 = await commit(race, voter1, 2, [23], "wallet-a");
    const s2 = await commit(race, voter2, 8, [25], "wallet-b");
    await setTime(closesAt);
    await race.connect(voter1).revealVote(2, s1);
    await race.connect(voter2).revealVote(8, s2);
    const raceAddress = await race.getAddress();
    await community.registerRace(raceAddress);
    await community.connect(voter1).claimRacePoints(raceAddress);
    await community.connect(voter2).claimRacePoints(raceAddress);

    expect(await community.seasonPoints(voter1.address)).to.equal(25n);
    expect(await community.seasonPoints(voter2.address)).to.equal(18n);
  });

  it("requires a revealed vote before Community points can be claimed", async function () {
    const { voter1, genesis, community } = await deployFixture();
    const { race, closesAt } = await deployRace(genesis);
    await setTime(closesAt);
    const raceAddress = await race.getAddress();
    await community.registerRace(raceAddress);
    await expect(community.connect(voter1).claimRacePoints(raceAddress)).to.be.revertedWith("wallet did not reveal");
  });
});
