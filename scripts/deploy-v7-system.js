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

async function assertRobinhoodTestnet() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }
}

async function assertContract(address, label) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} has no contract bytecode at ${address}`);
}

async function deploy(name, args = []) {
  const Factory = await ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

async function main() {
  await assertRobinhoodTestnet();

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer. Set DEPLOYER_PRIVATE_KEY.");

  const placeholderURI = required("GENESIS_PLACEHOLDER_URI");
  const usdc = requiredAddress("HOF_USDC_ADDRESS");
  const teamReserveWallet = requiredAddress("TEAM_RESERVE_WALLET");
  const auditWallet = requiredAddress("AUDIT_WALLET");
  const projectWallet = requiredAddress("PROJECT_WALLET");
  const deadline = requiredUnix("MINT_DEADLINE_UNIX");
  const prizePoolChoice = required("PRIZE_POOL_DESTINATION");

  await assertContract(usdc, "HOF_USDC_ADDRESS");
  const latest = await ethers.provider.getBlock("latest");
  if (!latest || deadline <= BigInt(latest.timestamp)) {
    throw new Error("MINT_DEADLINE_UNIX must be in the future");
  }

  const genesis = await deploy("GenesisHorses", [placeholderURI]);
  await (await genesis.setTeamWallet(teamReserveWallet)).wait();

  const communitySeason = await deploy("HOFCommunitySeason");
  await (await communitySeason.setGenesisContract(await genesis.getAddress())).wait();

  const hofLeaderboard = await deploy("HOFSeasonLeaderboard");
  const seasonRewards = await deploy("HOFSeasonRewards", [usdc, await communitySeason.getAddress()]);

  let prizePoolDestination;
  if (prizePoolChoice === "DEPLOYED_REWARDS") {
    prizePoolDestination = await seasonRewards.getAddress();
  } else {
    if (!ethers.isAddress(prizePoolChoice) || prizePoolChoice === ethers.ZeroAddress) {
      throw new Error("PRIZE_POOL_DESTINATION must be a non-zero address or the literal DEPLOYED_REWARDS");
    }
    prizePoolDestination = ethers.getAddress(prizePoolChoice);
  }

  if (prizePoolDestination.toLowerCase() === projectWallet.toLowerCase()) {
    throw new Error("Prize Pool destination cannot be the project wallet");
  }

  const sale = await deploy("HOFGenesisSale", [
    usdc,
    await genesis.getAddress(),
    deadline,
    prizePoolDestination,
    auditWallet,
    projectWallet,
  ]);
  await (await genesis.setSaleContract(await sale.getAddress())).wait();

  const result = {
    chainId: Number(ROBINHOOD_TESTNET_CHAIN_ID),
    deployer: deployer.address,
    genesis: await genesis.getAddress(),
    genesisSale: await sale.getAddress(),
    communitySeason: await communitySeason.getAddress(),
    hofSeasonLeaderboard: await hofLeaderboard.getAddress(),
    seasonRewards: await seasonRewards.getAddress(),
    usdc,
    teamReserveWallet,
    prizePoolDestination,
    auditWallet,
    projectWallet,
    mintDeadlineUnix: deadline.toString(),
  };

  console.log(JSON.stringify(result, null, 2));
  console.log("\nWebsite environment values:");
  console.log(`NEXT_PUBLIC_HOF_GENESIS_CONTRACT=${result.genesis}`);
  console.log(`NEXT_PUBLIC_HOF_GENESIS_SALE_CONTRACT=${result.genesisSale}`);
  console.log(`NEXT_PUBLIC_HOF_USDC_CONTRACT=${result.usdc}`);
  console.log(`NEXT_PUBLIC_HOF_COMMUNITY_SEASON_CONTRACT=${result.communitySeason}`);
  console.log(`NEXT_PUBLIC_HOF_LEADERBOARD_CONTRACT=${result.hofSeasonLeaderboard}`);
  console.log("NEXT_PUBLIC_HOF_RACE_VOTING_CONTRACT=");
  console.log("\nNo Community/Team allocation NFTs were minted and no reveal/randomization action was taken.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
