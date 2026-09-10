throw new Error("Legacy V7 path disabled. Use canonical deployment and Sponsored Voting operations; see docs/implementation/V7_PHASE1_SECURITY.md");
const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const VOTING_WINDOW = BigInt(24 * 60 * 60);
const RACE_INTERVAL = BigInt(3 * 24 * 60 * 60);
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

function check(name, state, detail) {
  return { name, state, detail };
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing preflight on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const genesisAddress = requiredAddress("GENESIS_ADDRESS");
  const saleAddress = requiredAddress("GENESIS_SALE_ADDRESS");
  const raceAddress = requiredAddress("RACE_ADDRESS");
  const communityAddress = requiredAddress("COMMUNITY_SEASON_ADDRESS");
  const hofAddress = requiredAddress("HOF_LEADERBOARD_ADDRESS");

  for (const [address, label] of [
    [genesisAddress, "GENESIS_ADDRESS"],
    [saleAddress, "GENESIS_SALE_ADDRESS"],
    [raceAddress, "RACE_ADDRESS"],
    [communityAddress, "COMMUNITY_SEASON_ADDRESS"],
    [hofAddress, "HOF_LEADERBOARD_ADDRESS"],
  ]) await assertCode(address, label);

  const genesis = await ethers.getContractAt("GenesisHorses", genesisAddress);
  const sale = await ethers.getContractAt("HOFGenesisSale", saleAddress);
  const race = await ethers.getContractAt("HOFRaceVoting", raceAddress);
  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const hof = await ethers.getContractAt("HOFSeasonLeaderboard", hofAddress);

  const raceGenesis = await race.genesis();
  const saleGenesis = await sale.genesis();
  const teamWallet = await genesis.teamWallet();
  const raceTeamWallet = await race.teamReserveWallet();
  const successful = await sale.saleSuccessful();
  const soldOutAt = await sale.soldOutAt();
  const opensAt = await race.opensAt();
  const closesAt = await race.closesAt();
  const communitySeason = await community.currentSeason();
  const hofSeason = await hof.currentSeason();
  const communityRaces = await community.racesRegistered();
  const hofRaces = await hof.racesRecorded();
  const communityLastOpen = await community.lastRaceOpensAt();
  const hofLastOpen = await hof.lastRaceOpensAt();

  const checks = [];
  checks.push(check(
    "Sale/Genesis reference",
    saleGenesis.toLowerCase() === genesisAddress.toLowerCase() ? "READY" : "BLOCKED",
    `Sale Genesis = ${saleGenesis}`,
  ));
  checks.push(check(
    "Race/Genesis reference",
    raceGenesis.toLowerCase() === genesisAddress.toLowerCase() ? "READY" : "BLOCKED",
    `Race Genesis = ${raceGenesis}`,
  ));
  checks.push(check(
    "Team Reserve wallet reference",
    raceTeamWallet.toLowerCase() === teamWallet.toLowerCase() ? "READY" : "BLOCKED",
    `Genesis Team Reserve = ${teamWallet}; race Team Reserve = ${raceTeamWallet}`,
  ));
  checks.push(check(
    "Public Mint sold out before race",
    successful && soldOutAt > BigInt(0) && opensAt >= soldOutAt ? "READY" : "BLOCKED",
    `saleSuccessful=${successful}; soldOutAt=${soldOutAt}; raceOpensAt=${opensAt}`,
  ));
  checks.push(check(
    "24-hour voting window",
    closesAt - opensAt === VOTING_WINDOW ? "READY" : "BLOCKED",
    `opensAt=${opensAt}; closesAt=${closesAt}; duration=${closesAt - opensAt}`,
  ));
  checks.push(check(
    "Leaderboard season alignment",
    communitySeason === hofSeason ? "READY" : "BLOCKED",
    `Community season=${communitySeason}; HOF season=${hofSeason}`,
  ));
  checks.push(check(
    "Leaderboard race-count alignment",
    communityRaces === hofRaces ? "READY" : "BLOCKED",
    `Community races=${communityRaces}; HOF races=${hofRaces}`,
  ));

  if (communityRaces > BigInt(0) || hofRaces > BigInt(0)) {
    const communityExpected = communityLastOpen + RACE_INTERVAL;
    const hofExpected = hofLastOpen + RACE_INTERVAL;
    checks.push(check(
      "Three-day cadence — Community",
      opensAt === communityExpected ? "READY" : "BLOCKED",
      `expected=${communityExpected}; raceOpensAt=${opensAt}`,
    ));
    checks.push(check(
      "Three-day cadence — HOF",
      opensAt === hofExpected ? "READY" : "BLOCKED",
      `expected=${hofExpected}; raceOpensAt=${opensAt}`,
    ));
  } else {
    checks.push(check(
      "Three-day cadence",
      "NO PRIOR RACE",
      "This is the first race of the active season, so there is no previous in-season opening to compare",
    ));
  }

  if (successful && soldOutAt > BigInt(0)) {
    const target = soldOutAt + TEN_DAYS;
    checks.push(check(
      "First-race sell-out + 10-day target",
      opensAt <= target ? "ON TARGET" : "TARGET MISSED",
      `target=${target}; raceOpensAt=${opensAt}; V7 states this as a target subject to audit, Team Reserve distribution and final technical checks`,
    ));
  }

  checks.push(check(
    "Team Reserve distribution terms",
    "UNRESOLVED V7",
    "Preflight does not invent how much of the 111 Team Reserve must be distributed before Race 1",
  ));
  checks.push(check(
    "Reveal/finalization rule",
    "UNRESOLVED V7",
    "Preflight does not invent a reveal deadline or race-finalization rule beyond the locked 24-hour voting window",
  ));

  const blocked = checks.filter((entry) => entry.state === "BLOCKED");

  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    race: raceAddress,
    currentSeason: communitySeason.toString(),
    checks,
    summary: {
      blockedCount: blocked.length,
      passesDefinedV7Preflight: blocked.length === 0,
      note: "TARGET MISSED and UNRESOLVED V7 are reported, not converted into new hard rules.",
    },
  }, null, 2));

  if (blocked.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
