const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const ZERO = ethers.ZeroAddress;

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function requiredAddress(name) {
  const value = required(name);
  if (!ethers.isAddress(value) || value === ZERO) {
    throw new Error(`${name} must be a non-zero EVM address`);
  }
  return ethers.getAddress(value);
}

async function assertCode(address, label) {
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`${label} has no contract bytecode at ${address}`);
  }
}

function asStrings(values) {
  return values.map((value) => value.toString());
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing state export on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const genesisAddress = requiredAddress("GENESIS_ADDRESS");
  const saleAddress = requiredAddress("GENESIS_SALE_ADDRESS");
  const communityAddress = requiredAddress("COMMUNITY_SEASON_ADDRESS");
  const hofAddress = requiredAddress("HOF_LEADERBOARD_ADDRESS");
  const rewardsAddress = requiredAddress("SEASON_REWARDS_ADDRESS");

  for (const [address, label] of [
    [genesisAddress, "GENESIS_ADDRESS"],
    [saleAddress, "GENESIS_SALE_ADDRESS"],
    [communityAddress, "COMMUNITY_SEASON_ADDRESS"],
    [hofAddress, "HOF_LEADERBOARD_ADDRESS"],
    [rewardsAddress, "SEASON_REWARDS_ADDRESS"],
  ]) {
    await assertCode(address, label);
  }

  const genesis = await ethers.getContractAt("GenesisHorses", genesisAddress);
  const sale = await ethers.getContractAt("HOFGenesisSale", saleAddress);
  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const hof = await ethers.getContractAt("HOFSeasonLeaderboard", hofAddress);
  const rewards = await ethers.getContractAt("HOFSeasonRewards", rewardsAddress);
  const rewardsUsdcAddress = await rewards.usdc();
  await assertCode(rewardsUsdcAddress, "Rewards USDC");
  const rewardsUsdc = new ethers.Contract(
    rewardsUsdcAddress,
    ["function balanceOf(address owner) view returns (uint256)"],
    ethers.provider,
  );

  const [
    totalSupply,
    revealed,
    communityAllocationMinted,
    teamReserveMinted,
    teamWallet,
    sold,
    soldOutAt,
    deadline,
    saleSuccessful,
    refundsEnabled,
    proceedsDistributed,
    communityCurrentSeason,
    communitySeasonsFinalized,
    hofCurrentSeason,
    hofSeasonsFinalized,
    chapterWalletCount,
    communityPaid,
    communityRemaining,
    hofReserved,
    rewardsBalance,
  ] = await Promise.all([
    genesis.totalSupply(),
    genesis.revealed(),
    genesis.communityAllocationMinted(),
    genesis.teamReserveMinted(),
    genesis.teamWallet(),
    sale.sold(),
    sale.soldOutAt(),
    sale.deadline(),
    sale.saleSuccessful(),
    sale.refundsEnabled(),
    sale.distributed(),
    community.currentSeason(),
    community.seasonsFinalized(),
    hof.currentSeason(),
    hof.seasonsFinalized(),
    community.chapterWalletCount(),
    rewards.communityPaid(),
    rewards.communityRemaining(),
    rewards.hofReserved(),
    rewardsUsdc.balanceOf(rewardsAddress),
  ]);

  const hofAllTimePoints = [];
  for (let horse = 1; horse <= 22; horse += 1) {
    hofAllTimePoints.push(await hof.allTimePoints(horse));
  }
  const hofAllTimeRanking = await hof.allTimeRanking();

  const finalizedSeasons = Number(
    communitySeasonsFinalized < hofSeasonsFinalized ? communitySeasonsFinalized : hofSeasonsFinalized,
  );
  const seasons = [];
  for (let seasonNumber = 1; seasonNumber <= finalizedSeasons; seasonNumber += 1) {
    const communityTop3 = await community.getSeasonTop3(seasonNumber);
    const hofPoints = [];
    for (let horse = 1; horse <= 22; horse += 1) {
      hofPoints.push(await hof.seasonHistory(seasonNumber, horse));
    }
    seasons.push({
      season: seasonNumber,
      communityTop3,
      communityPaid: await rewards.communitySeasonPaid(seasonNumber),
      hofPoints: asStrings(hofPoints),
    });
  }

  const communityWallets = [];
  for (let i = BigInt(0); i < chapterWalletCount; i += BigInt(1)) {
    const wallet = await community.chapterWalletAt(i);
    communityWallets.push({
      wallet,
      allTimePoints: (await community.allTimePoints(wallet)).toString(),
    });
  }
  communityWallets.sort((a, b) => {
    const aPoints = BigInt(a.allTimePoints);
    const bPoints = BigInt(b.allTimePoints);
    if (aPoints === bPoints) return a.wallet.toLowerCase().localeCompare(b.wallet.toLowerCase());
    return aPoints > bPoints ? -1 : 1;
  });

  const output = {
    source: "HOF Tokenomics V7 implementation state",
    chainId: Number(network.chainId),
    exportedAtUnix: Math.floor(Date.now() / 1000),
    contracts: {
      genesis: genesisAddress,
      sale: saleAddress,
      communitySeason: communityAddress,
      hofLeaderboard: hofAddress,
      seasonRewards: rewardsAddress,
      rewardsUsdc: rewardsUsdcAddress,
    },
    genesis: {
      totalSupply: totalSupply.toString(),
      revealed,
      communityAllocationMinted: communityAllocationMinted.toString(),
      teamReserveMinted: teamReserveMinted.toString(),
      teamWallet,
    },
    publicSale: {
      sold: sold.toString(),
      publicSupply: "2000",
      soldOutAt: soldOutAt.toString(),
      deadline: deadline.toString(),
      successful: saleSuccessful,
      refundsEnabled,
      proceedsDistributed,
    },
    community: {
      currentSeason: communityCurrentSeason.toString(),
      seasonsFinalized: communitySeasonsFinalized.toString(),
      chapterWalletCount: chapterWalletCount.toString(),
      allTimeWallets: communityWallets,
      note: "Equal-point Community ordering is not asserted here because the final zero-NFT/zero-NFT fallback remains unresolved in V7_OPEN_QUESTIONS.md.",
    },
    hallOfFame: {
      currentSeason: hofCurrentSeason.toString(),
      seasonsFinalized: hofSeasonsFinalized.toString(),
      allTimePoints: asStrings(hofAllTimePoints),
      allTimeRanking: asStrings(hofAllTimeRanking),
      genesisGrandChampion: hofSeasonsFinalized === BigInt(6) ? (await hof.genesisGrandChampion()).toString() : null,
    },
    rewards: {
      contractBalance: rewardsBalance.toString(),
      communityPaid: communityPaid.toString(),
      communityRemaining: communityRemaining.toString(),
      hofReserved: hofReserved.toString(),
    },
    finalizedSeasons: seasons,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
