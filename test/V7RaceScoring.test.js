const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [owner, team] = await ethers.getSigners();
  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();

  const latest = await ethers.provider.getBlock("latest");
  const opensAt = latest.timestamp + 10;
  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const voting = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await voting.waitForDeployment();

  return { voting, closesAt: opensAt + 24 * 60 * 60 };
}

async function setTime(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

describe("V7 locked race scoring", function () {
  it("uses exactly 25/18/15/12/10/8/6/4/2/1 for positions 1-10", async function () {
    const { voting } = await deployFixture();
    const expected = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    for (let position = 1; position <= 10; position++) expect(await voting.pointsForPosition(position)).to.equal(BigInt(expected[position - 1]));
  });

  it("gives zero points to every position from 11 through 22", async function () {
    const { voting } = await deployFixture();
    for (let position = 11; position <= 22; position++) expect(await voting.pointsForPosition(position)).to.equal(0n);
  });

  it("rejects positions outside 1 through 22", async function () {
    const { voting } = await deployFixture();
    await expect(voting.pointsForPosition(0)).to.be.revertedWith("invalid position");
    await expect(voting.pointsForPosition(23)).to.be.revertedWith("invalid position");
  });

  it("maps ranking positions back to the correct HOF competitor", async function () {
    const { voting, closesAt } = await deployFixture();
    await setTime(closesAt);
    const points = await voting.horseRacePoints();
    const expected = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    for (let horse = 1; horse <= 10; horse++) expect(points[horse - 1]).to.equal(BigInt(expected[horse - 1]));
    for (let horse = 11; horse <= 22; horse++) expect(points[horse - 1]).to.equal(0n);
  });

  it("does not expose race points before voting closes", async function () {
    const { voting } = await deployFixture();
    await expect(voting.horseRacePoints()).to.be.revertedWith("voting not closed");
  });
});
