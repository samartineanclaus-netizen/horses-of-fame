const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying GenesisHorses with account:");
  console.log(deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", hre.ethers.formatEther(balance), "ETH");

  const GenesisHorses = await hre.ethers.getContractFactory("GenesisHorses");

  const placeholderURI =
    process.env.PLACEHOLDER_URI || "ipfs://placeholder/";

  const contract = await GenesisHorses.deploy(placeholderURI);

  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log("GenesisHorses deployed to:");
  console.log(address);

  console.log("Network:", hre.network.name);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
