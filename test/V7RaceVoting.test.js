const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, voter, other, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.setTeamWallet(team.address);

  // #1-22 HOF (0 VP), #23-24 Legendary (5 VP each)
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter.address, 2);

  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const voting = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await voting.waitForDeployment();

  return { owner, voter, other, team, genesis, voting, opensAt };
}

async function openVoting(opensAt) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [opensAt]);
  await ethers.provider.send("evm_mine", []);
}

describe("V7 Race Voting Core", function () {
  it("combines all eligible NFT VP behind one wallet commitment", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    await openVoting(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("private-salt"));
    const commitment = await voting.makeCommitment(7, salt);
    await voting.connect(voter).commitVote(commitment, [23, 24]);
    expect(await voting.committedVP(voter.address)).to.equal(10n);
    expect(await voting.commitmentOf(voter.address)).to.equal(commitment);
    expect(await voting.tokenUsed(23)).to.equal(true);
    expect(await voting.tokenUsed(24)).to.equal(true);
  });

  it("allows only one secret pick per wallet", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    await openVoting(opensAt);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt-1"));
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt-2"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(1, salt1), [23]);
    await expect(voting.connect(voter).commitVote(await voting.makeCommitment(2, salt2), [24])).to.be.revertedWith("wallet already voted");
  });

  it("rejects Hall of Fame NFTs because they have 0 VP", async function () {
    const { owner, voting, opensAt } = await deployFixture();
    await openVoting(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("hof-salt"));
    await expect(voting.connect(owner).commitVote(await voting.makeCommitment(3, salt), [1])).to.be.revertedWith("token not voting eligible");
  });

  it("prevents reuse after a voted NFT is transferred to another wallet", async function () {
    const { voter, other, genesis, voting, opensAt } = await deployFixture();
    await openVoting(opensAt);
    const salt1 = ethers.keccak256(ethers.toUtf8Bytes("first"));
    await voting.connect(voter).commitVote(await voting.makeCommitment(4, salt1), [23]);
    await genesis.connect(voter).transferFrom(voter.address, other.address, 23);
    const salt2 = ethers.keccak256(ethers.toUtf8Bytes("second"));
    await expect(voting.connect(other).commitVote(await voting.makeCommitment(5, salt2), [23])).to.be.revertedWith("token already used");
  });

  it("blocks the Team Reserve wallet itself from voting", async function () {
    const { voter, team, genesis, voting, opensAt } = await deployFixture();
    await genesis.connect(voter).transferFrom(voter.address, team.address, 23);
    await openVoting(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("team"));
    await expect(voting.connect(team).commitVote(await voting.makeCommitment(6, salt), [23])).to.be.revertedWith("Team Reserve cannot vote");
  });

  it("restores normal voting eligibility after a Team Reserve NFT is transferred to an independent holder", async function () {
    const { voter, other, team, genesis, voting, opensAt } = await deployFixture();
    await genesis.connect(voter).transferFrom(voter.address, team.address, 23);
    await genesis.connect(team).transferFrom(team.address, other.address, 23);
    await openVoting(opensAt);
    const salt = ethers.keccak256(ethers.toUtf8Bytes("independent-holder"));
    const commitment = await voting.makeCommitment(8, salt);
    await voting.connect(other).commitVote(commitment, [23]);
    expect(await voting.committedVP(other.address)).to.equal(5n);
    expect(await voting.tokenUsed(23)).to.equal(true);
  });

  it("enforces the exact 24-hour voting window", async function () {
    const { voter, voting, opensAt } = await deployFixture();
    const salt = ethers.keccak256(ethers.toUtf8Bytes("window"));
    const commitment = await voting.makeCommitment(7, salt);
    await expect(voting.connect(voter).commitVote(commitment, [23])).to.be.revertedWith("voting closed");
    await ethers.provider.send("evm_setNextBlockTimestamp", [opensAt + 24 * 60 * 60]);
    await ethers.provider.send("evm_mine", []);
    await expect(voting.connect(voter).commitVote(commitment, [23])).to.be.revertedWith("voting closed");
  });
});
