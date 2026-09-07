const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "0xF03b86EB96bBb33b3F304b634a91368456Ee2ad6";

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    CONTRACT_ADDRESS
  );

  console.log("Contract:", CONTRACT_ADDRESS);

  // Enum:
  // 0 Unassigned
  // 1 Common
  // 2 Uncommon
  // 3 Rare
  // 4 Epic
  // 5 Legendary
  // 6 HallOfFame

  console.log("Setting Token #1 rarity to Rare...");

  const tx = await genesis.setRarity(1, 3);
  console.log("Transaction:", tx.hash);

  await tx.wait();

  const rarity = await genesis.rarityOf(1);
  const votingPower = await genesis.votingPowerOf(1);

  console.log("Token #1 rarity enum:", rarity.toString());
  console.log("Token #1 voting power:", votingPower.toString());

  if (rarity.toString() !== "3") {
    throw new Error("TEST FAILED: rarity is not Rare");
  }

  if (votingPower.toString() !== "3") {
    throw new Error("TEST FAILED: voting power is not 3");
  }

  console.log("SUCCESS: Token #1 = Rare, Voting Power = 3");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
