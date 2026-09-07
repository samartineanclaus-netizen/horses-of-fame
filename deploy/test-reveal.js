const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS =
    "0x9137d87Fa7F7f7d78c7E7941282ec2908531083A";

  const BASE_URI =
    "https://hof-site.vercel.app/metadata/";

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    CONTRACT_ADDRESS
  );

  console.log("Contract:", CONTRACT_ADDRESS);
  console.log("Revealing with base URI:", BASE_URI);

  const tx = await genesis.reveal(BASE_URI);
  console.log("Transaction:", tx.hash);

  await tx.wait();

  const uri = await genesis.tokenURI(1);

  console.log("Token #1 URI:", uri);

  if (uri !== "https://hof-site.vercel.app/metadata/1.json") {
    throw new Error("TEST FAILED: incorrect tokenURI");
  }

  console.log("SUCCESS: Reveal works correctly.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
