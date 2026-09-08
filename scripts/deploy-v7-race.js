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

function requiredUnix(name) {
  const value = required(name);
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a Unix timestamp in seconds`);
  return BigInt(value);
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer. Set DEPLOYER_PRIVATE_KEY.");

  const genesisAddress = requiredAddress("GENESIS_ADDRESS");
  const teamReserveWallet = requiredAddress("TEAM_RESERVE_WALLET");
  const opensAt = requiredUnix("RACE_OPENS_AT_UNIX");

  const code = await ethers.provider.getCode(genesisAddress);
  if (code === "0x") throw new Error(`GENESIS_ADDRESS has no contract bytecode at ${genesisAddress}`);

  const latest = await ethers.provider.getBlock("latest");
  if (!latest || opensAt < BigInt(latest.timestamp)) {
    throw new Error("RACE_OPENS_AT_UNIX cannot be in the past");
  }

  const genesis = await ethers.getContractAt("GenesisHorses", genesisAddress);
  const configuredTeamWallet = await genesis.teamWallet();
  if (configuredTeamWallet.toLowerCase() !== teamReserveWallet.toLowerCase()) {
    throw new Error(
      `TEAM_RESERVE_WALLET does not match Genesis configuration (${configuredTeamWallet})`,
    );
  }

  const Voting = await ethers.getContractFactory("HOFRaceVoting");
  const race = await Voting.deploy(genesisAddress, opensAt, teamReserveWallet);
  await race.waitForDeployment();

  const address = await race.getAddress();
  const closesAt = await race.closesAt();

  console.log(JSON.stringify({
    chainId: Number(ROBINHOOD_TESTNET_CHAIN_ID),
    deployer: deployer.address,
    raceVoting: address,
    genesis: genesisAddress,
    teamReserveWallet,
    opensAt: opensAt.toString(),
    closesAt: closesAt.toString(),
  }, null, 2));
  console.log(`\nNEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT=${address}`);
  console.log("Race registration in the Community/HOF leaderboards must occur only after this race closes.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
