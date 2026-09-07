const hre = require("hardhat");

async function main() {
  const GENESIS_ADDRESS =
    "0x4689053DbF9C7E63A6Ef3eeec83C59B3cB4C94fD";

  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying HOFVoting...");
  console.log("Deployer:", deployer.address);
  console.log("Genesis:", GENESIS_ADDRESS);

  const HOFVoting = await hre.ethers.getContractFactory(
    "HOFVoting"
  );

  const voting = await HOFVoting.deploy(
    GENESIS_ADDRESS
  );

  await voting.waitForDeployment();

  const votingAddress =
    await voting.getAddress();

  console.log("");
  console.log("================================");
  console.log("HOFVoting deployed successfully");
  console.log("Address:", votingAddress);
  console.log("Genesis:", GENESIS_ADDRESS);
  console.log("================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
