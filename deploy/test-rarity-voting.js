const hre = require("hardhat");

async function main() {
  const CONTRACT_ADDRESS =
    "0x4689053DbF9C7E63A6Ef3eeec83C59B3cB4C94fD";

  const [signer] = await hre.ethers.getSigners();

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    CONTRACT_ADDRESS,
    signer
  );

  console.log("Contract:", CONTRACT_ADDRESS);

  let supply = Number(await genesis.totalSupply());
  console.log("Current supply:", supply);

  // Mint in safe batches to avoid block gas limit.
  const BATCH_SIZE = 100;

  while (supply < 2222) {
    const remaining = 2222 - supply;
    const quantity = Math.min(BATCH_SIZE, remaining);

    console.log(
      `Minting #${supply + 1} - #${supply + quantity}...`
    );

    const tx = await genesis.ownerMint(
      signer.address,
      quantity
    );

    await tx.wait();

    supply = Number(await genesis.totalSupply());

    console.log(`Supply: ${supply}/2222`);
  }

  console.log("Mint complete.");
  console.log("Testing rarity boundaries...");

  const tests = [
    [1, 6, 0, "HallOfFame"],
    [22, 6, 0, "HallOfFame"],

    [23, 5, 5, "Legendary"],
    [212, 5, 5, "Legendary"],

    [213, 4, 4, "Epic"],
    [452, 4, 4, "Epic"],

    [453, 3, 3, "Rare"],
    [772, 3, 3, "Rare"],

    [773, 2, 2, "Uncommon"],
    [1252, 2, 2, "Uncommon"],

    [1253, 1, 1, "Common"],
    [2222, 1, 1, "Common"],
  ];

  for (const [id, expectedRarity, expectedVP, name] of tests) {
    const rarity = Number(await genesis.rarityOf(id));
    const vp = Number(await genesis.votingPowerOf(id));

    console.log(
      `#${id} ${name} | rarity=${rarity} | VP=${vp}`
    );

    if (rarity !== expectedRarity) {
      throw new Error(
        `#${id}: expected rarity ${expectedRarity}, got ${rarity}`
      );
    }

    if (vp !== expectedVP) {
      throw new Error(
        `#${id}: expected VP ${expectedVP}, got ${vp}`
      );
    }
  }

  console.log("");
  console.log("SUCCESS - ALL GENESIS BOUNDARIES VERIFIED");
  console.log("#1-22       Hall of Fame = 0 VP");
  console.log("#23-212     Legendary    = 5 VP");
  console.log("#213-452    Epic         = 4 VP");
  console.log("#453-772    Rare         = 3 VP");
  console.log("#773-1252   Uncommon     = 2 VP");
  console.log("#1253-2222  Common       = 1 VP");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
