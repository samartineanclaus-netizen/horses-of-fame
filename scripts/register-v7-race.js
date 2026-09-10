throw new Error("Legacy V7 path disabled. Use canonical deployment and Sponsored Voting operations; see docs/implementation/V7_PHASE1_SECURITY.md");
const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function requiredAddress(name) {
  const value = required(name);
  if (!ethers.isAddress(value) || value === ethers.ZeroAddress) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return ethers.getAddress(value);
}

async function assertCode(address, label) {
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`${label} has no contract bytecode at ${address}`);
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing operation on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const raceAddress = requiredAddress("RACE_ADDRESS");
  const communityAddress = requiredAddress("COMMUNITY_SEASON_ADDRESS");
  const hofAddress = requiredAddress("HOF_LEADERBOARD_ADDRESS");

  await assertCode(raceAddress, "RACE_ADDRESS");
  await assertCode(communityAddress, "COMMUNITY_SEASON_ADDRESS");
  await assertCode(hofAddress, "HOF_LEADERBOARD_ADDRESS");

  const race = await ethers.getContractAt("HOFRaceVoting", raceAddress);
  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const hof = await ethers.getContractAt("HOFSeasonLeaderboard", hofAddress);

  const latest = await ethers.provider.getBlock("latest");
  const closesAt = await race.closesAt();
  if (!latest || BigInt(latest.timestamp) < closesAt) {
    throw new Error(`Race is not closed yet. closesAt=${closesAt}`);
  }

  const communitySeason = await community.currentSeason();
  const hofSeason = await hof.currentSeason();
  if (communitySeason !== hofSeason) {
    throw new Error(`Leaderboard season mismatch: Community=${communitySeason}, HOF=${hofSeason}`);
  }

  if (!(await community.registeredRace(raceAddress))) {
    const tx = await community.registerRace(raceAddress);
    await tx.wait();
  }

  if (!(await hof.raceRecorded(raceAddress))) {
    const tx = await hof.recordRace(raceAddress);
    await tx.wait();
  }

  console.log(JSON.stringify({
    race: raceAddress,
    season: communitySeason.toString(),
    communityRacesRegistered: (await community.racesRegistered()).toString(),
    hofRacesRecorded: (await hof.racesRecorded()).toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
