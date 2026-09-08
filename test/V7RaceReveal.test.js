const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, voter, voter2, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter.address, 1);
  await genesis.ownerMint(voter2.address, 1);

  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const voting = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await voting.waitForDeployment();
  return { voter, voter2, voting, opensAt, closesAt: opensAt + 24 * 60 * 60 };
}

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

describe("V7 Race Vote Reveal", function () {
  it("cannot reveal before the 24-hour voting window closes", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    await setTime(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("secret"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(7, salt), [23]);
    await expect(voting.connect(voter).revealVote(7, salt)).to.be.revertedWith("voting not closed");
  });

  it("rejects a horse number or salt that does not match the commitment", async function () {
    const { voter, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("correct"));
    const wrongSalt = ethers.keccak256(ethers.toUtf8Bytes("wrong"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(7, salt), [23]);
    await setTime(closesAt);
    await expect(voting.connect(voter).revealVote(8, salt)).to.be.revertedWith("invalid reveal");
    await expect(voting.connect(voter).revealVote(7, wrongSalt)).to.be.revertedWith("invalid reveal");
  });

  it("reveals once and assigns the exact committed VP to the chosen horse", async function () {
    const { voter, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("horse-7"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(7, salt), [23]);
    await setTime(closesAt);
    await expect(voting.connect(voter).revealVote(7, salt)).to.emit(voting, "VoteRevealed").withArgs(voter.address, 7, 5n);
    expect(await voting.revealed(voter.address)).to.equal(true);
    expect(await voting.revealedHorse(voter.address)).to.equal(7n);
    expect(await voting.horseVP(7)).to.equal(5n);
    expect(await voting.horseVP(8)).to.equal(0n);
  });

  it("cannot reveal the same wallet twice", async function () {
    const { voter, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("once"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(3, salt), [23]);
    await setTime(closesAt);
    await voting.connect(voter).revealVote(3, salt);
    await expect(voting.connect(voter).revealVote(3, salt)).to.be.revertedWith("already revealed");
  });

  it("aggregates VP from different wallets choosing the same horse", async function () {
    const { voter, voter2, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("voter-1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("voter-2"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(11, salt1), [23]);
    await voting.connect(voter2).commitVote(await voting.makeCommitment(11, salt2), [24]);
    await setTime(closesAt);
    await voting.connect(voter).revealVote(11, salt1);
    await voting.connect(voter2).revealVote(11, salt2);
    expect(await voting.horseVP(11)).to.equal(10n);
  });
});
