const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const USDC = BigInt(1_000_000);

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

function equalAddress(actual, expected, label) {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

function equalValue(actual, expected, label) {
  if (BigInt(actual) !== BigInt(expected)) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing validation on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
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

  equalValue(await genesis.MAX_SUPPLY(), 2222, "Genesis MAX_SUPPLY");
  equalValue(await genesis.HALL_OF_FAME_SUPPLY(), 22, "Genesis HALL_OF_FAME_SUPPLY");
  equalValue(await genesis.VOTING_SUPPLY(), 2200, "Genesis VOTING_SUPPLY");
  equalValue(await genesis.PUBLIC_MINT_SUPPLY(), 2000, "Genesis PUBLIC_MINT_SUPPLY");
  equalValue(await genesis.COMMUNITY_ALLOCATION_SUPPLY(), 111, "Genesis COMMUNITY_ALLOCATION_SUPPLY");
  equalValue(await genesis.TEAM_RESERVE_SUPPLY(), 111, "Genesis TEAM_RESERVE_SUPPLY");
  equalValue(await genesis.NON_PUBLIC_ALLOCATION_SUPPLY(), 222, "Genesis NON_PUBLIC_ALLOCATION_SUPPLY");
  equalValue(
    (await genesis.COMMUNITY_ALLOCATION_SUPPLY()) + (await genesis.TEAM_RESERVE_SUPPLY()),
    await genesis.NON_PUBLIC_ALLOCATION_SUPPLY(),
    "Genesis non-public allocation split",
  );
  equalValue(await genesis.COMMON_SUPPLY(), 970, "Genesis COMMON_SUPPLY");
  equalValue(await genesis.UNCOMMON_SUPPLY(), 480, "Genesis UNCOMMON_SUPPLY");
  equalValue(await genesis.RARE_SUPPLY(), 320, "Genesis RARE_SUPPLY");
  equalValue(await genesis.EPIC_SUPPLY(), 240, "Genesis EPIC_SUPPLY");
  equalValue(await genesis.LEGENDARY_SUPPLY(), 190, "Genesis LEGENDARY_SUPPLY");
  equalAddress(await genesis.saleContract(), saleAddress, "Genesis sale contract");

  const teamWallet = await genesis.teamWallet();
  if (teamWallet === ethers.ZeroAddress) throw new Error("Genesis Team Reserve Wallet is not configured");

  const communityMinted = await genesis.communityAllocationMinted();
  const teamMinted = await genesis.teamReserveMinted();
  const nonPublicMinted = await genesis.nonPublicAllocationMinted();
  equalValue(communityMinted + teamMinted, nonPublicMinted, "Genesis non-public minted accounting");
  if (communityMinted > BigInt(111)) throw new Error("Community allocation exceeds locked V7 111-NFT cap");
  if (teamMinted > BigInt(111)) throw new Error("Team Reserve exceeds locked V7 111-NFT cap");

  equalValue(await sale.PUBLIC_SUPPLY(), 2000, "Public Mint supply");
  equalValue(await sale.MINT_PRICE(), BigInt(30) * USDC, "Public Mint price");
  equalValue(await sale.PRIZE_POOL_AMOUNT(), BigInt(48_000) * USDC, "Prize Pool split");
  equalValue(await sale.AUDIT_AMOUNT(), BigInt(2_000) * USDC, "Audit split");
  equalValue(await sale.FOUNDER_AMOUNT(), BigInt(10_000) * USDC, "Development split");
  equalAddress(await sale.genesis(), genesisAddress, "Sale Genesis reference");

  const paymentToken = await sale.paymentToken();
  await assertCode(paymentToken, "Sale payment token");
  const paymentMetadata = new ethers.Contract(
    paymentToken,
    ["function decimals() view returns (uint8)"],
    ethers.provider,
  );
  equalValue(await paymentMetadata.decimals(), 6, "Sale payment token decimals");

  equalAddress(await rewards.usdc(), paymentToken, "Rewards/Sale USDC reference");
  equalAddress(await rewards.communitySeason(), communityAddress, "Rewards Community reference");

  equalValue(await community.RACES_PER_SEASON(), 10, "Community races per season");
  equalValue(await community.CHAPTER_SEASONS(), 6, "Community Chapter I seasons");
  equalValue(await community.RACE_INTERVAL(), BigInt(3 * 24 * 60 * 60), "Community race cadence");
  equalAddress(await community.genesisContract(), genesisAddress, "Community Genesis reference");

  equalValue(await hof.HOF_COMPETITORS(), 22, "HOF competitors");
  equalValue(await hof.RACES_PER_SEASON(), 10, "HOF races per season");
  equalValue(await hof.CHAPTER_SEASONS(), 6, "HOF Chapter I seasons");
  equalValue(await hof.RACE_INTERVAL(), BigInt(3 * 24 * 60 * 60), "HOF race cadence");

  equalValue(await rewards.CHAPTER_SEASONS(), 6, "Rewards Chapter I seasons");
  equalValue(await rewards.COMMUNITY_FIRST(), BigInt(2_500) * USDC, "Community first prize");
  equalValue(await rewards.COMMUNITY_SECOND(), BigInt(1_000) * USDC, "Community second prize");
  equalValue(await rewards.COMMUNITY_THIRD(), BigInt(500) * USDC, "Community third prize");
  equalValue(await rewards.COMMUNITY_PER_SEASON(), BigInt(4_000) * USDC, "Community season allocation");
  equalValue(await rewards.HOF_PER_SEASON(), BigInt(4_000) * USDC, "HOF season allocation");
  equalValue(await rewards.TOTAL_PER_SEASON(), BigInt(8_000) * USDC, "Total season allocation");
  equalValue(await rewards.CHAPTER_PRIZE_POOL(), BigInt(48_000) * USDC, "Chapter I Prize Pool");

  const communitySeason = await community.currentSeason();
  const hofSeason = await hof.currentSeason();
  const communityFinalized = await community.seasonsFinalized();
  const hofFinalized = await hof.seasonsFinalized();
  if (communitySeason !== hofSeason || communityFinalized !== hofFinalized) {
    throw new Error(
      `Leaderboard state mismatch: Community season/finalized=${communitySeason}/${communityFinalized}, HOF=${hofSeason}/${hofFinalized}`,
    );
  }

  const prizePoolDestination = await sale.prizePoolTreasury();
  const projectWallet = await sale.founderWallet();
  if (prizePoolDestination.toLowerCase() === projectWallet.toLowerCase()) {
    throw new Error("Prize Pool destination equals development/project wallet");
  }

  console.log(JSON.stringify({
    valid: true,
    chainId: Number(network.chainId),
    genesis: genesisAddress,
    sale: saleAddress,
    communitySeason: communityAddress,
    hofLeaderboard: hofAddress,
    seasonRewards: rewardsAddress,
    paymentToken,
    paymentTokenDecimals: 6,
    teamReserveWallet: teamWallet,
    communityAllocationMinted: communityMinted.toString(),
    teamReserveMinted: teamMinted.toString(),
    nonPublicAllocationMinted: nonPublicMinted.toString(),
    prizePoolDestination,
    auditWallet: await sale.auditWallet(),
    projectWallet,
    currentSeason: communitySeason.toString(),
    seasonsFinalized: communityFinalized.toString(),
    note: "Locked V7 constants, allocation caps and deployed cross-contract references match. Exact HOF numbering/ownership and delayed reveal remain outside this validator until finalized in V7.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
