const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS =
    "0x9137d87Fa7F7f7d78c7E7941282ec2908531083A";

  const [signer] = await hre.ethers.getSigners();

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    CONTRACT_ADDRESS,
    signer
  );

  console.log("Contract:", CONTRACT_ADDRESS);

  const supply = Number(await genesis.totalSupply());
  console.log("Current supply:", supply);

  // Ensure NFTs #1-#5 exist.
  if (supply < 5) {
    const missing = 5 - supply;

    console.log(`Minting ${missing} missing NFTs...`);

    const mintTx = await genesis.ownerMint(
      signer.address,
      missing
    );

    await mintTx.wait();
  }

  const tests = [
    { id: 1, rarity: 1, vp: 1, name: "Common" },
    { id: 2, rarity: 2, vp: 2, name: "Uncommon" },
    { id: 3, rarity: 3, vp: 3, name: "Rare" },
    { id: 4, rarity: 4, vp: 4, name: "Epic" },
    { id: 5, rarity: 5, vp: 5, name: "Legendary" },
  ];

  for (const test of tests) {
    const tx = await genesis.setRarity(
      test.id,
      test.rarity
    );

    await tx.wait();
  }

  for (const test of tests) {
    const rarity =
      Number(await genesis.rarityOf(test.id));

    const vp =
      Number(await genesis.votingPowerOf(test.id));

    console.log(
      `#${test.id} ${test.name} | rarity=${rarity} | VP=${vp}`
    );

    if (rarity !== test.rarity) {
      throw new Error(
        `Token #${test.id}: wrong rarity`
      );
    }

    if (vp !== test.vp) {
      throw new Error(
        `Token #${test.id}: wrong Voting Power`
      );
    }
  }

  console.log("SUCCESS:");
  console.log("#1 Common = 1 VP");
  console.log("#2 Uncommon = 2 VP");
  console.log("#3 Rare = 3 VP");
  console.log("#4 Epic = 4 VP");
  console.log("#5 Legendary = 5 VP");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
