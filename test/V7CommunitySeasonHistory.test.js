const { expect } = require("chai");
const { ethers } = require("hardhat");

async function setTime(timestamp) {
  const latest = await ethers.provider.getBlock("latest");
  const target = Math.max(timestamp, latest.timestamp + 1);
  await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, voter, voter2, voter3] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.ownerMint(owner.address, 22); // #1-#22
  await genesis.ownerMint(voter.address, 1);  // #23
  await genesis.ownerMint(voter2.address, 1); // #24
  await genesis.ownerMint(voter3.address, 1); // #25

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();
  await community.setGenesisContract(await genesis.getAddress());
  return { voter, voter2, voter3, genesis, community };
}

async function makeClaimedRace(genesis, community, voters, label) {
  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 1;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt);
  await race.waitForDeployment();
  await setTime(opensAt);

  for (let i = 0; i < voters.length; i++) {
    const { signer, tokenId, horse } = voters[i];
    const salt = ethers.keccak256(ethers.toUtf8Bytes(`${label}-${i}`));
    const commitment = await race.makeCommitment(horse, salt);
    await race.connect(signer).commitVote(commitment, [tokenId]);
  }

  await setTime(opensAt + 24 * 60 * 60);
  for (let i = 0; i < voters.length; i++) {
    const { signer, horse } = voters[i];
    const salt = ethers.keccak256(ethers.toUtf8Bytes(`${label}-${i}`));
    await race.connect(signer).revealVote(horse, salt);
  }

  const raceAddress = await race.getAddress();
  await community.registerRace(raceAddress);
  for (const { signer } of voters) await community.connect(signer).claimRacePoints(raceAddress);
}

async function completeSeason(genesis, community, voter, voter2, voter3, prefix) {
  const voters = [
    { signer: voter, tokenId: 23, horse: 1 },
    { signer: voter2, tokenId: 24, horse: 2 },
    { signer: voter3, tokenId: 25, horse: 3 },
  ];
  for (let i = 0; i < 10; i++) await makeClaimedRace(genesis, community, voters, `${prefix}-${i}`);
}

describe("V7 Community season history, reset and All-Time", function () {
  it("archives wallet points, Top 3, resets season score and advances to season 2", async function () {
    const { voter, voter2, voter3, genesis, community } = await deployFixture();
    await completeSeason(genesis, community, voter, voter2, voter3, "s1");
    expect(await community.seasonPoints(voter.address)).to.equal(250n);
    expect(await community.activeWalletCount()).to.equal(3n);

    await community.finalizeSeason();
    expect(await community.seasonHistory(1, voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);
    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.activeWalletCount()).to.equal(0n);
    expect(await community.racesRegistered()).to.equal(0n);
    expect(await community.currentSeason()).to.equal(2n);
    expect(await community.seasonsFinalized()).to.equal(1n);

    const top3 = await community.getSeasonTop3(1);
    expect(top3[0]).to.equal(voter.address);
    expect(top3[1]).to.equal(voter2.address);
    expect(top3[2]).to.equal(voter3.address);
  });

  it("keeps All-Time points while season 2 starts from zero and accumulates independently", async function () {
    const { voter, voter2, voter3, genesis, community } = await deployFixture();
    await completeSeason(genesis, community, voter, voter2, voter3, "s1");
    await community.finalizeSeason();

    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);

    await completeSeason(genesis, community, voter, voter2, voter3, "s2");
    expect(await community.seasonPoints(voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(250n);

    await community.finalizeSeason();
    expect(await community.seasonHistory(2, voter.address)).to.equal(250n);
    expect(await community.allTimePoints(voter.address)).to.equal(500n);
    expect(await community.seasonPoints(voter.address)).to.equal(0n);
    expect(await community.currentSeason()).to.equal(3n);
  });

  it("cannot finalize before ten races are registered", async function () {
    const { voter, voter2, voter3, genesis, community } = await deployFixture();
    await makeClaimedRace(genesis, community, [
      { signer: voter, tokenId: 23, horse: 1 },
      { signer: voter2, tokenId: 24, horse: 2 },
      { signer: voter3, tokenId: 25, horse: 3 },
    ], "incomplete");
    await expect(community.finalizeSeason()).to.be.revertedWith("season not complete");
  });
});
