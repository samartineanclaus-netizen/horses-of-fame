const hre = require("hardhat");

const { ethers } = hre;
const ROBINHOOD_TESTNET_CHAIN_ID = BigInt(46630);
const TOTAL_PRIMARY_REVENUE = BigInt(60_000) * BigInt(1_000_000);

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
    throw new Error(`Refusing operation on chain ${network.chainId}. Expected Robinhood Chain Testnet 46630.`);
  }

  const saleAddress = requiredAddress("GENESIS_SALE_ADDRESS");
  await assertCode(saleAddress, "GENESIS_SALE_ADDRESS");

  const sale = await ethers.getContractAt("HOFGenesisSale", saleAddress);
  const successful = await sale.saleSuccessful();
  const distributed = await sale.distributed();
  const sold = await sale.sold();

  if (!successful || sold !== BigInt(2000)) {
    throw new Error(`Public Mint is not sold out: ${sold}/2000`);
  }
  if (distributed) {
    console.log(JSON.stringify({
      sale: saleAddress,
      sold: sold.toString(),
      alreadyDistributed: true,
    }, null, 2));
    return;
  }

  const paymentToken = await sale.paymentToken();
  const prizePoolTreasury = await sale.prizePoolTreasury();
  const auditWallet = await sale.auditWallet();
  const founderWallet = await sale.founderWallet();
  await assertCode(paymentToken, "sale payment token");

  const erc20 = new ethers.Contract(
    paymentToken,
    ["function balanceOf(address) view returns (uint256)"],
    ethers.provider,
  );
  const escrowBalance = await erc20.balanceOf(saleAddress);
  if (escrowBalance < TOTAL_PRIMARY_REVENUE) {
    throw new Error(`Sale escrow has ${escrowBalance} units; expected at least ${TOTAL_PRIMARY_REVENUE}`);
  }

  console.log(JSON.stringify({
    sale: saleAddress,
    sold: sold.toString(),
    escrowBalance: escrowBalance.toString(),
    prizePoolTreasury,
    prizePoolAmountUSDC: "48000",
    auditWallet,
    auditAmountUSDC: "2000",
    projectWallet: founderWallet,
    projectAmountUSDC: "10000",
  }, null, 2));

  const tx = await sale.distributeProceeds();
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error("Proceeds distribution reverted");

  console.log(`V7 proceeds distribution confirmed: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
