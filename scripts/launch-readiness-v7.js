throw new Error("Legacy V7 path disabled. Use canonical deployment and Sponsored Voting operations; see docs/implementation/V7_PHASE1_SECURITY.md");
const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const TEN_DAYS = BigInt(10 * 24 * 60 * 60);

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

function item(name, state, detail) {
  return { name, state, detail };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing readiness check on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
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

  const sold = await sale.sold();
  const publicSupply = await sale.PUBLIC_SUPPLY();
  const successful = await sale.saleSuccessful();
  const soldOutAt = await sale.soldOutAt();
  const distributed = await sale.distributed();
  const communityMinted = await genesis.communityAllocationMinted();
  const teamMinted = await genesis.teamReserveMinted();
  const teamWallet = await genesis.teamWallet();
  const teamBalance = await genesis.balanceOf(teamWallet);
  const revealed = await genesis.revealed();
  const communitySeason = await community.currentSeason();
  const hofSeason = await hof.currentSeason();
  const communityFinalized = await community.seasonsFinalized();
  const hofFinalized = await hof.seasonsFinalized();
  const rewardCommunity = await rewards.communitySeason();

  const checks = [];
  checks.push(item(
    "Public Mint sell-out",
    successful ? "READY" : "BLOCKED",
    `${sold}/${publicSupply} Public Mint NFTs sold`,
  ));
  checks.push(item(
    "Sell-out timestamp",
    successful && soldOutAt > BigInt(0) ? "READY" : successful ? "BLOCKED" : "WAITING",
    soldOutAt > BigInt(0) ? soldOutAt.toString() : "not recorded yet",
  ));
  checks.push(item(
    "Primary-sale proceeds split",
    distributed ? "READY" : successful ? "ACTION AVAILABLE" : "WAITING",
    distributed ? "48k/2k/10k distribution executed" : "distribution not executed",
  ));
  checks.push(item(
    "Community allocation cap",
    communityMinted <= BigInt(111) ? "READY" : "BLOCKED",
    `${communityMinted}/111 minted; exact use split remains unresolved in V7`,
  ));
  checks.push(item(
    "Team Reserve allocation cap",
    teamMinted <= BigInt(111) ? "READY" : "BLOCKED",
    `${teamMinted}/111 minted; ${teamBalance} currently held by designated Team Reserve Wallet`,
  ));
  checks.push(item(
    "Leaderboard alignment",
    communitySeason === hofSeason && communityFinalized === hofFinalized ? "READY" : "BLOCKED",
    `Community season/finalized ${communitySeason}/${communityFinalized}; HOF ${hofSeason}/${hofFinalized}`,
  ));
  checks.push(item(
    "Rewards wiring",
    rewardCommunity.toLowerCase() === communityAddress.toLowerCase() ? "READY" : "BLOCKED",
    `Rewards Community reference ${rewardCommunity}`,
  ));

  if (successful && soldOutAt > BigInt(0)) {
    checks.push(item(
      "First-race timing target",
      "TARGET TRACKING",
      `V7 target date = sell-out + 10 days = ${(soldOutAt + TEN_DAYS).toString()}; audit, Team Reserve distribution and final technical checks still apply`,
    ));
  } else {
    checks.push(item("First-race timing target", "WAITING", "Starts from actual Public Mint sell-out timestamp"));
  }

  // These are intentionally reported instead of being silently converted into
  // implementation policy. They mirror V7 section 16 and the explicit
  // implementation questions file.
  checks.push(item(
    "22 HOF identities / breeds / numbering",
    "UNRESOLVED V7",
    "Exact identities, breeds and numbering remain to finalize; testnet #1-#22 numbering is not a mainnet decision",
  ));
  checks.push(item(
    "Final mint deadline",
    "UNRESOLVED V7",
    `This deployment uses explicit deadline ${await sale.deadline()}; V7 still requires the final mainnet deadline decision`,
  ));
  checks.push(item(
    "Prize Pool custody architecture",
    "UNRESOLVED V7",
    "Final non-custodial/independently controlled Prize Pool architecture remains to finalize",
  ));
  checks.push(item(
    "Community allocation use split",
    "UNRESOLVED V7",
    "The 111-NFT cap is locked, but the exact giveaway/collab/partnership split remains open",
  ));
  checks.push(item(
    "Team Reserve secondary distribution terms",
    "UNRESOLVED V7",
    "Exact operational sale/distribution window before Race 1 remains to finalize",
  ));
  checks.push(item(
    "Independent audit execution",
    "UNRESOLVED V7",
    "Provider, scope and payment mechanics for the 2,000 USDC audit allocation remain open",
  ));
  checks.push(item(
    "Delayed reveal/randomization",
    "UNRESOLVED V7",
    revealed ? "testnet collection is revealed; final mainnet reveal/randomization design remains open" : "collection unrevealed; final mainnet design remains open",
  ));
  checks.push(item(
    "HOF prize beneficiary mechanism",
    "UNRESOLVED V7",
    "24,000 USDC HOF-side allocation remains reserved; beneficiary mechanism is not implemented",
  ));
  checks.push(item(
    "Creator-fee enforcement",
    "UNRESOLVED V7",
    "Final enforceable 5% creator-fee implementation on the target marketplace/chain remains open",
  ));
  checks.push(item(
    "Legal / eligibility / geofencing",
    "UNRESOLVED V7",
    "Final legal terms, target-jurisdiction eligibility/geofencing and prize mechanics remain open",
  ));
  checks.push(item(
    "Community zero-NFT tie fallback",
    "UNRESOLVED V7",
    "If every equal-point tied wallet owns zero Genesis NFTs, no fallback tie-break is defined",
  ));
  checks.push(item(
    "Race reveal/finalization timing",
    "UNRESOLVED V7",
    "V7 fixes the 24-hour vote window but not a separate reveal deadline/finalization rule",
  ));
  checks.push(item(
    "Community points settlement mode",
    "UNRESOLVED V7",
    "Current testnet flow is wallet-claim based; V7 does not yet choose user-claim, operator or automatic settlement for mainnet",
  ));
  checks.push(item(
    "Inter-season maximum one-week anchor",
    "UNRESOLVED V7",
    "V7 fixes a maximum one-week break but not the exact event from which the interval is measured",
  ));
  checks.push(item(
    "Inter-chapter maximum one-month anchor",
    "UNRESOLVED V7",
    "V7 fixes a maximum one-month chapter transition but not the exact timing anchors",
  ));

  const hardBlocks = checks.filter((check) => check.state === "BLOCKED");
  const unresolved = checks.filter((check) => check.state === "UNRESOLVED V7");

  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    genesis: genesisAddress,
    sale: saleAddress,
    checks,
    summary: {
      hardBlockCount: hardBlocks.length,
      unresolvedV7Count: unresolved.length,
      operationallyReadyForNextDefinedStep: hardBlocks.length === 0,
      mainnetPolicyComplete: unresolved.length === 0,
      note: "UNRESOLVED V7 items are intentionally reported, not guessed or implemented by this checker.",
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
