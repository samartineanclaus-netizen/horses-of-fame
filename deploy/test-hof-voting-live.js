const hre = require("hardhat");

const VOTING_ADDRESS =
  "0x22A943735EC8d0B8E4F3f16f77EEDEf91b312E44";

const GENESIS_ADDRESS =
  "0x4689053DbF9C7E63A6Ef3eeec83C59B3cB4C94fD";

const BATCH_SIZE = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const [wallet] = await hre.ethers.getSigners();

  console.log("====================================");
  console.log("HOF VOTING BATCH LIVE TEST");
  console.log("Wallet:", wallet.address);
  console.log("Genesis:", GENESIS_ADDRESS);
  console.log("Voting:", VOTING_ADDRESS);
  console.log("====================================");

  const voting = await hre.ethers.getContractAt(
    "HOFVoting",
    VOTING_ADDRESS
  );

  const genesis = await hre.ethers.getContractAt(
    "GenesisHorses",
    GENESIS_ADDRESS
  );

  const balance = await genesis.balanceOf(wallet.address);

  console.log("Genesis balance:", balance.toString());

  if (balance === 0n) {
    throw new Error("Wallet owns no Genesis NFTs");
  }

  const eligibleTokenIds = [];
  let expectedVP = 0n;

  console.log("Scanning wallet NFTs...");

  for (let i = 0n; i < balance; i++) {
    const tokenId =
      await genesis.tokenOfOwnerByIndex(wallet.address, i);

    const vp = await genesis.votingPowerOf(tokenId);

    if (vp > 0n) {
      eligibleTokenIds.push(tokenId);
      expectedVP += vp;
    }
  }

  console.log("Eligible NFTs:", eligibleTokenIds.length);
  console.log("Expected total VP:", expectedVP.toString());

  if (eligibleTokenIds.length === 0) {
    throw new Error("No eligible voting NFTs");
  }

  console.log("\nOpening test race...");

  const openTx = await voting.openRace(60, 60);
  await openTx.wait();

  const raceId = await voting.currentRaceId();

  console.log("Race ID:", raceId.toString());
  console.log("\nPreparing voting batches...");

  for (
    let start = 0;
    start < eligibleTokenIds.length;
    start += BATCH_SIZE
  ) {
    const batch =
      eligibleTokenIds.slice(start, start + BATCH_SIZE);

    console.log(
      `Batch ${Math.floor(start / BATCH_SIZE) + 1}:`,
      `${batch.length} NFTs`
    );

    const batchTx =
      await voting.prepareVoteBatch(raceId, batch);

    await batchTx.wait();
  }

  const preparedVP =
    await voting.preparedVotingPower(
      raceId,
      wallet.address
    );

  console.log("Prepared VP:", preparedVP.toString());

  if (preparedVP !== expectedVP) {
    throw new Error(
      `Prepared VP mismatch: expected ${expectedVP}, got ${preparedVP}`
    );
  }

  const horseId = 1n;

  const secret =
    hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(
        `HOF-LIVE-${Date.now()}`
      )
    );

  const commitment =
    hre.ethers.keccak256(
      hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [raceId, wallet.address, horseId, secret]
      )
    );

  console.log("\nVoting for HOF #1");

  const commitTx =
    await voting.finalizeCommit(
      raceId,
      commitment
    );

  await commitTx.wait();

  const committedVP =
    await voting.committedVotingPower(
      raceId,
      wallet.address
    );

  console.log("Committed VP:", committedVP.toString());

  if (committedVP !== expectedVP) {
    throw new Error(
      "Committed VP does not equal expected wallet VP"
    );
  }

  console.log("\nWaiting for reveal phase...");
  await sleep(65000);

  console.log("Revealing vote...");

  const revealTx =
    await voting.revealVote(
      raceId,
      horseId,
      secret
    );

  await revealTx.wait();

  console.log("Reveal successful.");

  let hidden = false;

  try {
    await voting.horseVotingPower(
      raceId,
      horseId
    );
  } catch (error) {
    hidden = true;
  }

  if (!hidden) {
    throw new Error(
      "SECURITY TEST FAILED: results visible before finalization"
    );
  }

  console.log("Privacy test: PASSED");

  console.log("\nWaiting for reveal window to close...");
  await sleep(65000);

  console.log("Finalizing race...");

  const finalizeTx =
    await voting.finalizeRace(raceId);

  await finalizeTx.wait();

  console.log("Calculating results...");

  const resultsTx =
    await voting.calculateRaceResults(raceId);

  await resultsTx.wait();

  const finalVP =
    await voting.horseVotingPower(
      raceId,
      horseId
    );

  const position =
    await voting.horsePosition(
      raceId,
      horseId
    );

  const points =
    await voting.horseRacePoints(
      raceId,
      horseId
    );

  const totalRevealed =
    await voting.totalVotingPowerRevealed(
      raceId
    );

  console.log("\n====================================");
  console.log("FINAL LIVE RESULTS");
  console.log("Race:", raceId.toString());
  console.log("HOF Horse:", horseId.toString());
  console.log("Expected VP:", expectedVP.toString());
  console.log("Final VP:", finalVP.toString());
  console.log("Total revealed VP:", totalRevealed.toString());
  console.log("Position:", position.toString());
  console.log("Points:", points.toString());
  console.log("====================================");

  if (finalVP !== expectedVP) {
    throw new Error("Final VP mismatch");
  }

  if (totalRevealed !== expectedVP) {
    throw new Error("Total revealed VP mismatch");
  }

  if (position !== 1n) {
    throw new Error("HOF #1 should finish first");
  }

  if (points !== 25n) {
    throw new Error("Winner should receive 25 points");
  }

  console.log("\nHOF VOTING LIVE TEST PASSED");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
