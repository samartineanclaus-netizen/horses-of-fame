const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, voter, other, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.setTeamWallet(team.address);

  // #1-22 HOF; #23-24 start with voter; #25 starts with other.
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter.address, 2);
  await genesis.ownerMint(other.address, 1);

  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const voting = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await voting.waitForDeployment();
  return { voter, other, genesis, voting, opensAt, closesAt: opensAt + 24 * 60 * 60 };
}

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

describe("V7 same-pick VP top-up for newly acquired NFTs", function () {
  it("adds a newly acquired unused NFT to the wallet's existing secret pick", async function () {
    const { voter, other, genesis, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);

    const salt = ethers.keccak256(ethers.toUtf8Bytes("same-pick"));
    const commitment = await voting.makeCommitment(7, salt);
    await voting.connect(voter).commitVote(commitment, [23]);
    expect(await voting.committedVP(voter.address)).to.equal(5n);

    await genesis.connect(other).transferFrom(other.address, voter.address, 25);
    await expect(voting.connect(voter).addVotingPower([25]))
      .to.emit(voting, "VotingPowerAdded")
      .withArgs(voter.address, 5n, 10n);

    expect(await voting.committedVP(voter.address)).to.equal(10n);
    expect(await voting.commitmentOf(voter.address)).to.equal(commitment);
    expect(await voting.tokenUsed(25)).to.equal(true);

    await setTime(closesAt);
    await voting.connect(voter).revealVote(7, salt);
    expect(await voting.horseVP(7)).to.equal(10n);
  });

  it("cannot add VP before the wallet has fixed its secret pick", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    await setTime(opensAt);
    await expect(voting.connect(voter).addVotingPower([23])).to.be.revertedWith("no wallet pick");
  });

  it("cannot change or split the wallet pick while adding more VP", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    await setTime(opensAt);

    const firstSalt = ethers.keccak256(ethers.toUtf8Bytes("horse-4"));
    const secondSalt = ethers.keccak256(ethers.toUtf8Bytes("horse-9"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(4, firstSalt), [23]);
    await voting.connect(voter).addVotingPower([24]);

    await expect(
      voting.connect(voter).commitVote(await voting.makeCommitment(9, secondSalt), [24])
    ).to.be.revertedWith("wallet already voted");

    expect(await voting.committedVP(voter.address)).to.equal(10n);
    expect(await voting.commitmentOf(voter.address)).to.equal(await voting.makeCommitment(4, firstSalt));
  });

  it("cannot reuse an NFT that already contributed, even after transfer", async function () {
    const { voter, other, genesis, voting, opensAt } = await deployFixture();
    await setTime(opensAt);

    const voterSalt = ethers.keccak256(ethers.toUtf8Bytes("voter"));
    const otherSalt = ethers.keccak256(ethers.toUtf8Bytes("other"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(2, voterSalt), [23]);
    await voting.connect(other).commitVote(await voting.makeCommitment(3, otherSalt), [25]);

    await genesis.connect(voter).transferFrom(voter.address, other.address, 23);
    await expect(voting.connect(other).addVotingPower([23])).to.be.revertedWith("token already used");
  });

  it("cannot add VP after the 24-hour voting window closes", async function () {
    const { voter, voting, opensAt, closesAt } = await deployFixture();
    await setTime(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("closed"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(1, salt), [23]);
    await setTime(closesAt);
    await expect(voting.connect(voter).addVotingPower([24])).to.be.revertedWith("voting closed");
  });
});
