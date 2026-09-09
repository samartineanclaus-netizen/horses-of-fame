const { expect } = require("chai");
const { ethers } = require("hardhat");

const THREE_DAYS = 3 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;

async function setTime(timestamp) {
  const latest = await ethers.provider.getBlock("latest");
  const target = Math.max(timestamp, latest.timestamp + 1);
  await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
  await ethers.provider.send("evm_mine", []);
}

async function deployFixture() {
  const [owner, voter1, voter2, voter3, team] = await ethers.getSigners();

  const Genesis = await ethers.getContractFactory("GenesisHorses");
  const genesis = await Genesis.deploy("placeholder");
  await genesis.waitForDeployment();
  await genesis.setTeamWallet(team.address);

  // Testnet-only deterministic fixture: first 22 are HOF, next three are
  // voting Genesis NFTs. This test does not make a mainnet numbering decision.
  await genesis.ownerMint(owner.address, 22);
  await genesis.ownerMint(voter1.address, 1);
  await genesis.ownerMint(voter2.address, 1);
  await genesis.ownerMint(voter3.address, 1);

  const Community = await ethers.getContractFactory("HOFCommunitySeason");
  const community = await Community.deploy();
  await community.waitForDeployment();
  await community.setGenesisContract(await genesis.getAddress());

  const HOF = await ethers.getContractFactory("HOFSeasonLeaderboard");
  const hof = await HOF.deploy();
  await hof.waitForDeployment();

  return { voter1, voter2, voter3, team, genesis, community, hof };
}

async function runRace({ genesis, community, hof, team, voters, label }) {
  const latest = await ethers.provider.getBlock("latest");
  const racesRegistered = await community.racesRegistered();
  const opensAt = racesRegistered === 0n
    ? latest.timestamp + 5
    : Number(await community.lastRaceOpensAt()) + THREE_DAYS;

  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(await genesis.getAddress(), opensAt, team.address);
  await race.waitForDeployment();

  await setTime(opensAt);
  for (let i = 0; i < voters.length; i += 1) {
    const { signer, tokenId, horse } = voters[i];
    const salt = ethers.keccak256(ethers.toUtf8Bytes(`${label}-${i}`));
    const commitment = await race.makeCommitment(horse, salt);
    await race.connect(signer).commitVote(commitment, [tokenId]);
  }

  await setTime(opensAt + ONE_DAY);
  for (let i = 0; i < voters.length; i += 1) {
    const { signer, horse } = voters[i];
    const salt = ethers.keccak256(ethers.toUtf8Bytes(`${label}-${i}`));
    await race.connect(signer).revealVote(horse, salt);
  }

  const raceAddress = await race.getAddress();
  await community.registerRace(raceAddress);
  await hof.recordRace(raceAddress);
  for (const { signer } of voters) {
    await community.connect(signer).claimRacePoints(raceAddress);
  }
}

describe("V7 full Chapter I lifecycle", function () {
  this.timeout(180000);

  it("runs six seasons / sixty races and preserves locked Chapter I lifecycle invariants", async function () {
    const { voter1, voter2, voter3, team, genesis, community, hof } = await deployFixture();

    const voters = [
      { signer: voter1, tokenId: 23, horse: 1 },
      { signer: voter2, tokenId: 24, horse: 2 },
      { signer: voter3, tokenId: 25, horse: 3 },
    ];

    for (let season = 1; season <= 6; season += 1) {
      expect(await community.currentSeason()).to.equal(BigInt(season));
      expect(await hof.currentSeason()).to.equal(BigInt(season));

      for (let raceNumber = 1; raceNumber <= 10; raceNumber += 1) {
        await runRace({
          genesis,
          community,
          hof,
          team,
          voters,
          label: `s${season}-r${raceNumber}`,
        });
      }

      expect(await community.racesRegistered()).to.equal(10n);
      expect(await hof.racesRecorded()).to.equal(10n);
      expect(await community.seasonComplete()).to.equal(true);
      expect(await hof.seasonComplete()).to.equal(true);

      // Horse #1 is always first in this deterministic fixture and voter1
      // therefore earns 25 points per race: 250 per completed season.
      expect(await community.seasonPoints(voter1.address)).to.equal(250n);
      expect(await hof.seasonPoints(1)).to.equal(250n);

      await community.finalizeSeason();
      await hof.finalizeSeason();

      expect(await community.seasonHistory(season, voter1.address)).to.equal(250n);
      expect(await hof.seasonHistory(season, 1)).to.equal(250n);
      expect(await community.allTimePoints(voter1.address)).to.equal(BigInt(250 * season));
      expect(await hof.allTimePoints(1)).to.equal(BigInt(250 * season));
      expect(await community.seasonsFinalized()).to.equal(BigInt(season));
      expect(await hof.seasonsFinalized()).to.equal(BigInt(season));
    }

    expect(await community.chapterComplete()).to.equal(true);
    expect(await hof.chapterComplete()).to.equal(true);
    expect(await community.seasonsFinalized()).to.equal(6n);
    expect(await hof.seasonsFinalized()).to.equal(6n);
    expect(await community.currentSeason()).to.equal(7n);
    expect(await hof.currentSeason()).to.equal(7n);

    expect(await community.allTimePoints(voter1.address)).to.equal(1500n);
    expect(await community.allTimePoints(voter2.address)).to.equal(1080n);
    expect(await community.allTimePoints(voter3.address)).to.equal(900n);
    expect(await community.chapterWalletCount()).to.equal(3n);

    const hofRanking = await hof.allTimeRanking();
    expect(hofRanking[0]).to.equal(1n);
    expect(hofRanking[1]).to.equal(2n);
    expect(hofRanking[2]).to.equal(3n);
    expect(await hof.genesisGrandChampion()).to.equal(1n);

    const finalTop3 = await community.getSeasonTop3(6);
    expect(finalTop3[0]).to.equal(voter1.address);
    expect(finalTop3[1]).to.equal(voter2.address);
    expect(finalTop3[2]).to.equal(voter3.address);
  });
});
