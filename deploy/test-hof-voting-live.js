const hre = require("hardhat");

const VOTING_ADDRESS =
  "0x409B73DE70b122e67eE90763EF2Dd2647E2ad192";

const GENESIS_ADDRESS =
  "0x4689053DbF9C7E63A6Ef3eeec83C59B3cB4C94fD";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const [wallet] = await hre.ethers.getSigners();

  console.log("====================================");
  console.log("HOF VOTING LIVE TEST");
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

  // -------------------------------------------------
  // 1. Check wallet
  // -------------------------------------------------

  const balance = await genesis.balanceOf(wallet.address);

  console.log("Genesis balance:", balance.toString());

  if (balance === 0n) {
    throw new Error("Test wallet owns no Genesis NFTs");
  }

  // -------------------------------------------------
  // 2. Open a short test race
  // -------------------------------------------------

  console.log("\nOpening test race...");

  // 60 sec commit + 60 sec reveal.
  const openTx = await voting.openRace(60, 60);
  await openTx.wait();

  const raceId = await voting.currentRaceId();

  console.log("Race ID:", raceId.toString());

  // -------------------------------------------------
  // 3. Check eligible VP
  // -------------------------------------------------

  const eligibleVP =
    await voting.eligibleVotingPower(
      raceId,
      wallet.address
    );

  console.log(
    "Eligible VP:",
    eligibleVP.toString()
  );

  if (eligibleVP === 0n) {
    throw new Error(
      "Wallet has no eligible Voting Power"
    );
  }

  // -------------------------------------------------
  // 4. Create commitment
  // -------------------------------------------------

  const horseId = 1n;

  const secret =
    hre.ethers.keccak256(
      hre.ethers.toUtf8Bytes(
        "HOF-LIVE-TEST-SECRET"
      )
    );

  const commitment =
    hre.ethers.keccak256(
      hre.ethers.AbiCoder
        .defaultAbiCoder()
        .encode(
          [
            "uint256",
            "address",
            "uint256",
            "bytes32"
          ],
          [
            raceId,
            wallet.address,
            horseId,
            secret
          ]
        )
    );

  console.log("Voting for HOF #1");
  console.log("Commitment:", commitment);

  // -------------------------------------------------
  // 5. Commit
  // -------------------------------------------------

  console.log("\nSubmitting commitment...");

  const commitTx =
    await voting.commitVote(
      raceId,
      commitment
    );

  await commitTx.wait();

  console.log("Commit successful.");

  const committedVP =
    await voting.committedVotingPower(
      raceId,
      wallet.address
    );

  console.log(
    "Committed VP:",
    committedVP.toString()
  );

  // -------------------------------------------------
  // 6. Wait for reveal phase
  // -------------------------------------------------

  console.log(
    "\nWaiting for reveal phase..."
  );

  await sleep(65000);

  // -------------------------------------------------
  // 7. Reveal
  // -------------------------------------------------

  console.log("Revealing vote...");

  const revealTx =
    await voting.revealVote(
      raceId,
      horseId,
      secret
    );

  await revealTx.wait();

  console.log("Reveal successful.");

  // -------------------------------------------------
  // 8. Verify results are still hidden
  // -------------------------------------------------

  try {
    await voting.horseVotingPower(
      raceId,
      horseId
    );

    throw new Error(
      "SECURITY TEST FAILED: results visible before finalization"
    );
  } catch (error) {
    if (
      error.message.includes(
        "SECURITY TEST FAILED"
      )
    ) {
      throw error;
    }

    console.log(
      "Privacy getter test: PASSED"
    );
  }

  // -------------------------------------------------
  // 9. Wait for reveal end
  // -------------------------------------------------

  console.log(
    "\nWaiting for reveal window to close..."
  );

  await sleep(65000);

  // -------------------------------------------------
  // 10. Finalize
  // -------------------------------------------------

  console.log("Finalizing race...");

  const finalizeTx =
    await voting.finalizeRace(raceId);

  await finalizeTx.wait();

  console.log("Race finalized.");

  // -------------------------------------------------
  // 11. Calculate results
  // -------------------------------------------------

  console.log(
    "Calculating ranking and scoring..."
  );

  const resultsTx =
    await voting.calculateRaceResults(
      raceId
    );

  await resultsTx.wait();

  console.log("Results calculated.");

  // -------------------------------------------------
  // 12. Read final results
  // -------------------------------------------------

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

  console.log("\n====================================");
  console.log("FINAL TEST RESULTS");
  console.log("Race:", raceId.toString());
  console.log("HOF Horse:", horseId.toString());
  console.log("VP:", finalVP.toString());
  console.log("Position:", position.toString());
  console.log("Points:", points.toString());
  console.log("====================================");

  if (finalVP !== committedVP) {
    throw new Error(
      "VP mismatch after reveal"
    );
  }

  if (position !== 1n) {
    throw new Error(
      "Expected HOF #1 to finish first"
    );
  }

  if (points !== 25n) {
    throw new Error(
      "Expected winner to receive 25 points"
    );
  }

  console.log(
    "\nHOF VOTING LIVE TEST PASSED"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
