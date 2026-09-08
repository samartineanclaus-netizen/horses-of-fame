const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const CHAPTER_SEASONS = BigInt(6);

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

  const communityAddress = requiredAddress("COMMUNITY_SEASON_ADDRESS");
  const hofAddress = requiredAddress("HOF_LEADERBOARD_ADDRESS");
  await assertCode(communityAddress, "COMMUNITY_SEASON_ADDRESS");
  await assertCode(hofAddress, "HOF_LEADERBOARD_ADDRESS");

  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const hof = await ethers.getContractAt("HOFSeasonLeaderboard", hofAddress);

  const communitySeason = await community.currentSeason();
  const hofSeason = await hof.currentSeason();
  if (communitySeason !== hofSeason) {
    throw new Error(`Leaderboard season mismatch: Community=${communitySeason}, HOF=${hofSeason}`);
  }
  if (communitySeason < BigInt(1) || communitySeason > CHAPTER_SEASONS) {
    throw new Error(`No active Chapter I season to finalize: ${communitySeason}`);
  }
  if (!(await community.seasonComplete()) || !(await hof.seasonComplete())) {
    throw new Error("Both V7 leaderboards must contain exactly 10 races before finalization");
  }

  const season = communitySeason;
  const hofTx = await hof.finalizeSeason();
  await hofTx.wait();

  const communityTx = await community.finalizeSeason();
  await communityTx.wait();

  console.log(JSON.stringify({
    finalizedSeason: season.toString(),
    nextCommunitySeason: (await community.currentSeason()).toString(),
    nextHofSeason: (await hof.currentSeason()).toString(),
    communitySeasonsFinalized: (await community.seasonsFinalized()).toString(),
    hofSeasonsFinalized: (await hof.seasonsFinalized()).toString(),
  }, null, 2));
  console.log("Community/HOF payout execution is intentionally separate from this operation.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
