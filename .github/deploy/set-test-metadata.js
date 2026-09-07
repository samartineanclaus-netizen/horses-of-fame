const hre = require("hardhat");

async function main() {
  const contractAddress = "0xF03b86EB96bBb33b3F304b634a91368456Ee2ad6";

  const [signer] = await hre.ethers.getSigners();

  console.log("Owner wallet:", signer.address);
  console.log("Genesis contract:", contractAddress);

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    contractAddress,
    signer
  );

  const metadataURI =
    "https://hof-site.vercel.app/metadata/1.json";

  const tx = await genesis.setPlaceholderURI(metadataURI);
  console.log("Transaction:", tx.hash);

  await tx.wait();

  console.log("Placeholder metadata set to:");
  console.log(metadataURI);

  const tokenURI = await genesis.tokenURI(1);
  console.log("Token #1 URI:", tokenURI);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
