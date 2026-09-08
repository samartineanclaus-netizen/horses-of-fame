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
    throw new Error(`Refusing status read on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
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
  ]) await assertCode(address, label);

  const genesis = await ethers.getContractAt("GenesisHorses", genesisAddress);
  const sale = await ethers.getContractAt("HOFGenesisSale", saleAddress);
  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const hof = await ethers.getContractAt("HOFSeasonLeaderboard", hofAddress);
  const rewards = await ethers.getContractAt("HOFSeasonRewards", rewardsAddress);
  const usdcAddress = await rewards.usdc();
  const usdc = await ethers.getContractAt("IERC20", usdcAddress);
  const usdcMetadata = new ethers.Contract(
    usdcAddress,
    ["function decimals() view returns (uint8)"],
    ethers.provider,
  );

  const status = {
    chainId: Number(network.chainId),
    genesis: {
      address: genesisAddress,
      totalSupply: (await genesis.totalSupply()).toString(),
      nextTokenId: (await genesis.nextTokenId()).toString(),
      publicMintSupply: (await genesis.PUBLIC_MINT_SUPPLY()).toString(),
      communityAllocationSupply: (await genesis.COMMUNITY_ALLOCATION_SUPPLY()).toString(),
      teamReserveSupply: (await genesis.TEAM_RESERVE_SUPPLY()).toString(),
      communityAllocationMinted: (await genesis.communityAllocationMinted()).toString(),
      teamReserveMinted: (await genesis.teamReserveMinted()).toString(),
      nonPublicAllocationMinted: (await genesis.nonPublicAllocationMinted()).toString(),
      revealed: await genesis.revealed(),
      saleContract: await genesis.saleContract(),
      teamWallet: await genesis.teamWallet(),
    },
    sale: {
      address: saleAddress,
      sold: (await sale.sold()).toString(),
      publicSupply: (await sale.PUBLIC_SUPPLY()).toString(),
      mintPriceUSDC6: (await sale.MINT_PRICE()).toString(),
      deadlineUnix: (await sale.deadline()).toString(),
      successful: await sale.saleSuccessful(),
      refundsEnabled: await sale.refundsEnabled(),
      proceedsDistributed: await sale.distributed(),
      paymentToken: await sale.paymentToken(),
      paymentTokenDecimals: (await usdcMetadata.decimals()).toString(),
      escrowUSDC6: (await usdc.balanceOf(saleAddress)).toString(),
    },
    community: {
      address: communityAddress,
      currentSeason: (await community.currentSeason()).toString(),
      racesRegistered: (await community.racesRegistered()).toString(),
      seasonsFinalized: (await community.seasonsFinalized()).toString(),
      chapterWalletCount: (await community.chapterWalletCount()).toString(),
      seasonComplete: await community.seasonComplete(),
      chapterComplete: await community.chapterComplete(),
    },
    hof: {
      address: hofAddress,
      currentSeason: (await hof.currentSeason()).toString(),
      racesRecorded: (await hof.racesRecorded()).toString(),
      seasonsFinalized: (await hof.seasonsFinalized()).toString(),
      seasonComplete: await hof.seasonComplete(),
      chapterComplete: await hof.chapterComplete(),
    },
    rewards: {
      address: rewardsAddress,
      usdc: usdcAddress,
      balanceUSDC6: (await usdc.balanceOf(rewardsAddress)).toString(),
      communityPaidUSDC6: (await rewards.communityPaid()).toString(),
      communityRemainingUSDC6: (await rewards.communityRemaining()).toString(),
      hofReservedUSDC6: (await rewards.hofReserved()).toString(),
    },
  };

  console.log(JSON.stringify(status, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
