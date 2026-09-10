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

async function assertCode(address, label) {
  if ((await ethers.provider.getCode(address)) === "0x") {
    throw new Error(`${label} has no contract bytecode at ${address}`);
  }
}

async function lowestOwnedTokenId(genesis, wallet, balance) {
  let lowest = null;
  for (let i = BigInt(0); i < balance; i += BigInt(1)) {
    const tokenId = await genesis.tokenOfOwnerByIndex(wallet, i);
    if (lowest === null || tokenId < lowest) lowest = tokenId;
  }
  return lowest;
}

async function main() {
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error(`Refusing Community Champion read on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const communityAddress = requiredAddress("COMMUNITY_SEASON_ADDRESS");
  const genesisAddress = requiredAddress("GENESIS_ADDRESS");
  await assertCode(communityAddress, "COMMUNITY_SEASON_ADDRESS");
  await assertCode(genesisAddress, "GENESIS_ADDRESS");

  const community = await ethers.getContractAt("HOFCommunitySeason", communityAddress);
  const genesis = await ethers.getContractAt("GenesisHorses", genesisAddress);

  if (!(await community.chapterComplete())) {
    throw new Error("Chapter I is not complete. V7 Community Champion is defined only after all six seasons.");
  }

  const count = await community.chapterWalletCount();
  if (count === BigInt(0)) throw new Error("No Community wallets were recorded in Chapter I");

  let maxPoints = null;
  const leaders = [];

  for (let i = BigInt(0); i < count; i += BigInt(1)) {
    const wallet = await community.chapterWalletAt(i);
    const points = await community.allTimePoints(wallet);

    if (maxPoints === null || points > maxPoints) {
      maxPoints = points;
      leaders.length = 0;
      leaders.push(wallet);
    } else if (points === maxPoints) {
      leaders.push(wallet);
    }
  }

  if (leaders.length === 1) {
    console.log(JSON.stringify({
      title: "CHAPTER I — GENESIS COMMUNITY CHAMPION",
      wallet: leaders[0],
      allTimePoints: maxPoints.toString(),
      tieBreakUsed: false,
    }, null, 2));
    return;
  }

  let winner = null;
  let winningTokenId = null;
  for (const wallet of leaders) {
    const balance = await genesis.balanceOf(wallet);
    if (balance === BigInt(0)) continue;

    const tokenId = await lowestOwnedTokenId(genesis, wallet, balance);
    if (winner === null || tokenId < winningTokenId) {
      winner = wallet;
      winningTokenId = tokenId;
    }
  }

  if (winner === null) {
    throw new Error(
      "Unresolved V7 Community tie: all top-point wallets own zero Genesis NFTs. See docs/implementation/V7_OPEN_QUESTIONS.md; no fallback tie-break is invented.",
    );
  }

  console.log(JSON.stringify({
    title: "CHAPTER I — GENESIS COMMUNITY CHAMPION",
    wallet: winner,
    allTimePoints: maxPoints.toString(),
    tieBreakUsed: true,
    tiedWallets: leaders.length,
    lowestOwnedTokenId: winningTokenId.toString(),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
