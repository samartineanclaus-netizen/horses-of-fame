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

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing HOF Champion read on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const leaderboardAddress = requiredAddress("HOF_LEADERBOARD_ADDRESS");
  if ((await ethers.provider.getCode(leaderboardAddress)) === "0x") {
    throw new Error(`HOF_LEADERBOARD_ADDRESS has no contract bytecode at ${leaderboardAddress}`);
  }

  const leaderboard = await ethers.getContractAt("HOFSeasonLeaderboard", leaderboardAddress);
  if (!(await leaderboard.chapterComplete())) {
    throw new Error("Chapter I is not complete. V7 Genesis Grand Champion is defined only after all six seasons.");
  }

  const horseNumber = await leaderboard.genesisGrandChampion();
  const allTimePoints = await leaderboard.allTimePoints(horseNumber);
  const ranking = await leaderboard.allTimeRanking();

  console.log(JSON.stringify({
    title: "CHAPTER I — GENESIS GRAND CHAMPION",
    hofCompetitorNumber: horseNumber.toString(),
    allTimePoints: allTimePoints.toString(),
    allTimeTop3: ranking.slice(0, 3).map((value) => value.toString()),
    tieBreak: "Lower HOF competitor number ranks higher when points are equal, as locked in V7.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
