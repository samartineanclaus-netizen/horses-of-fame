const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, voter1, voter2, voter3, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  // #1-22 HOF (0 VP); #23-25 Legendary (5 VP each).
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter1.address, 1);
  await genesis.ownerMint(voter2.address, 1);
  await genesis.ownerMint(voter3.address, 1);

  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const voting = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await voting.waitForDeployment();

  return { voter1, voter2, voter3, voting, opensAt, closesAt: opensAt + 24 * 60 * 60 };
}

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

async function commit(voting, voter, horse, tokenId, saltText) {
  const salt = ethers.keccak256(ethers.toUtf8Bytes(saltText));
  const commitment = await voting.makeCommitment(horse, salt);
  await voting.connect(voter).commitVote(commitment, [tokenId]);
  return salt;
}

describe("V7 deterministic race ranking", function () {
  it("does not expose final ranking before voting closes", async function () {
    const { voting, opensAt } = await deployFixture();
    await setTime(opensAt);
    await expect(voting.ranking()).to.be.revertedWith("voting not closed");
  });

  it("ranks higher revealed VP ahead of lower VP", async function () {
    const { voter1, voter2, voter3, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const s1 = await commit(voting, voter1, 7, 23, "a");
    const s2 = await commit(voting, voter2, 7, 24, "b");
    const s3 = await commit(voting, voter3, 3, 25, "c");
    await setTime(closesAt);
    await voting.connect(voter1).revealVote(7, s1);
    await voting.connect(voter2).revealVote(7, s2);
    await voting.connect(voter3).revealVote(3, s3);

    const ranked = await voting.ranking();
    expect(ranked[0]).to.equal(7n);
    expect(ranked[1]).to.equal(3n);
  });

  it("uses lower HOF competitor number as the tie-break", async function () {
    const { voter1, voter2, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const s1 = await commit(voting, voter1, 12, 23, "tie-12");
    const s2 = await commit(voting, voter2, 4, 24, "tie-4");
    await setTime(closesAt);
    await voting.connect(voter1).revealVote(12, s1);
    await voting.connect(voter2).revealVote(4, s2);
    const ranked = await voting.ranking();
    expect(ranked[0]).to.equal(4n);
    expect(ranked[1]).to.equal(12n);
  });

  it("orders all zero-VP competitors by lower number", async function () {
    const { voting, closesAt } = await deployFixture();
    await setTime(closesAt);
    const ranked = await voting.ranking();
    for (let i = 0; i < 22; i++) expect(ranked[i]).to.equal(BigInt(i + 1));
  });

  it("produces a complete unique ranking of competitors 1 through 22", async function () {
    const { voter1, voter2, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const s1 = await commit(voting, voter1, 22, 23, "last");
    const s2 = await commit(voting, voter2, 1, 24, "first");
    await setTime(closesAt);
    await voting.connect(voter1).revealVote(22, s1);
    await voting.connect(voter2).revealVote(1, s2);
    const ranked = await voting.ranking();
    expect(ranked.length).to.equal(22);
    const numbers = ranked.map(Number);
    expect(new Set(numbers).size).to.equal(22);
    expect([...numbers].sort((a, b) => a - b)).to.deep.equal(Array.from({ length: 22 }, (_, i) => i + 1));
  });
});
