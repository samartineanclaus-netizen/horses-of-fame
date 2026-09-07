const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS = "0xF03b86EB96bBb33b3F304b634a91368456Ee2ad6";

  const PLACEHOLDER_URI =
    "https://hof-site.vercel.app/metadata/1.json";

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    CONTRACT_ADDRESS
  );

  console.log("GenesisHorses:", CONTRACT_ADDRESS);
  console.log("Setting placeholder URI to:", PLACEHOLDER_URI);

  const tx = await genesis.setPlaceholderURI(PLACEHOLDER_URI);

  console.log("Transaction:", tx.hash);

  await tx.wait();

  console.log("SUCCESS: placeholder URI updated.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
