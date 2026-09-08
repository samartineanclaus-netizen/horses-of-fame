const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const COMMUNITY_PER_SEASON = BigInt(4_000) * BigInt(1_000_000);

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

function requiredSeason() {
  const raw = required("SEASON_NUMBER");
  if (!/^\d+$/.test(raw)) throw new Error("SEASON_NUMBER must be an integer from 1 to 6");
  const season = Number(raw);
  if (!Number.isInteger(season) || season < 1 || season > 6) {
    throw new Error("SEASON_NUMBER must be an integer from 1 to 6");
  }
  return season;
}

async function assertContract(address, label) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no contract bytecode at ${address}`);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing operation on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const [operator] = await ethers.getSigners();
  if (!operator) throw new Error("No operator signer. Set DEPLOYER_PRIVATE_KEY.");

  const rewardsAddress = requiredAddress("SEASON_REWARDS_ADDRESS");
  const season = requiredSeason();
  await assertContract(rewardsAddress, "SEASON_REWARDS_ADDRESS");

  const rewards = await ethers.getContractAt("HOFSeasonRewards", rewardsAddress);
  const owner = await rewards.owner();
  if (owner.toLowerCase() !== operator.address.toLowerCase()) {
    throw new Error(`Operator ${operator.address} is not HOFSeasonRewards owner ${owner}`);
  }

  if (await rewards.communitySeasonPaid(season)) {
    console.log(`Community Season ${season} is already paid. No transaction sent.`);
    return;
  }

  const communityAddress = await rewards.communitySeason();
  const usdcAddress = await rewards.usdc();
  await assertContract(communityAddress, "Configured Community Season");
  await assertContract(usdcAddress, "Configured USDC");

  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const finalized = Number(await community.seasonsFinalized());
  if (finalized < season) {
    throw new Error(`Community Season ${season} is not finalized yet. Finalized seasons: ${finalized}`);
  }

  const top3 = await community.getSeasonTop3(season);
  if (top3.some((wallet) => wallet === ethers.ZeroAddress)) {
    throw new Error(`Community Season ${season} does not have a complete non-zero Top 3`);
  }

  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  const balanceBefore = await usdc.balanceOf(rewardsAddress);
  if (balanceBefore < COMMUNITY_PER_SEASON) {
    throw new Error(`Rewards contract has insufficient USDC: ${balanceBefore} < ${COMMUNITY_PER_SEASON}`);
  }

  const tx = await rewards.payCommunitySeason(season);
  const receipt = await tx.wait();

  if (!(await rewards.communitySeasonPaid(season))) {
    throw new Error("Community payout transaction mined but paid flag is still false");
  }

  const balanceAfter = await usdc.balanceOf(rewardsAddress);
  if (balanceBefore - balanceAfter !== COMMUNITY_PER_SEASON) {
    throw new Error(`Unexpected rewards balance delta: ${balanceBefore - balanceAfter}`);
  }

  console.log(JSON.stringify({
    season,
    rewards: rewardsAddress,
    communitySeason: communityAddress,
    first: top3[0],
    second: top3[1],
    third: top3[2],
    paidUSDC: "4000",
    transactionHash: receipt.hash,
  }, null, 2));
  console.log("HOF-side payout is intentionally untouched until the V7 beneficiary mechanism is finalized.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});