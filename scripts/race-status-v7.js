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
    throw new Error(`Refusing race status read on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const raceAddress = requiredAddress("RACE_ADDRESS");
  if ((await ethers.provider.getCode(raceAddress)) === "0x") {
    throw new Error(`RACE_ADDRESS has no contract bytecode at ${raceAddress}`);
  }

  const race = await ethers.getContractAt("HOFRaceVoting", raceAddress);
  const latest = await ethers.provider.getBlock("latest");
  if (!latest) throw new Error("Could not read latest block");

  const opensAt = await race.opensAt();
  const closesAt = await race.closesAt();
  const now = BigInt(latest.timestamp);
  const phase = now < opensAt ? "scheduled" : now < closesAt ? "voting-open" : "voting-closed";

  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    race: raceAddress,
    genesis: await race.genesis(),
    teamReserveWallet: await race.teamReserveWallet(),
    opensAt: opensAt.toString(),
    closesAt: closesAt.toString(),
    currentBlockTimestamp: now.toString(),
    phase,
    votingOpen: await race.votingOpen(),
    note: "Read-only status intentionally does not expose live horse VP totals or wallet choices during voting.",
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
