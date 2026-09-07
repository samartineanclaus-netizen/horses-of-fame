const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOFVoting - gas scalable batching", function () {
  let genesis;
  let voting;
  let owner;
  let alice;
  let bob;

  async function advance(seconds) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  function makeCommitment(raceId, wallet, horseId, secret) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "address", "uint256", "bytes32"],
        [raceId, wallet, horseId, secret]
      )
    );
  }

  async function expectRevert(promise, expectedMessage) {
    let reverted = false;

    try {
      const tx = await promise;

      if (tx && typeof tx.wait === "function") {
        await tx.wait();
      }
    } catch (error) {
      reverted = true;

      expect(
        String(error.message)
      ).to.include(expectedMessage);
    }

    if (!reverted) {
      throw new Error(
        `Expected transaction to revert with: ${expectedMessage}`
      );
    }
  }

  async function prepareAndCommit(
    signer,
    tokenIds,
    horseId,
    secret,
    raceId = 1
  ) {
    const prepareTx = await voting
      .connect(signer)
      .prepareVoteBatch(raceId, tokenIds);

    await prepareTx.wait();

    const commitment = makeCommitment(
      raceId,
      signer.address,
      horseId,
      secret
    );

    const commitTx = await voting
      .connect(signer)
      .finalizeCommit(raceId, commitment);

    await commitTx.wait();

    return commitment;
  }

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    const Genesis = await ethers.getContractFactory(
      "GenesisHorses"
    );

    genesis = await Genesis.deploy(
      "https://example.com/placeholder.json"
    );

    await genesis.waitForDeployment();

    const Voting = await ethers.getContractFactory(
      "HOFVoting"
    );

    voting = await Voting.deploy(
      await genesis.getAddress()
    );

    await voting.waitForDeployment();

    // #1-22 = Hall of Fame = 0 VP
    let tx = await genesis.ownerMint(
      owner.address,
      22
    );
    await tx.wait();

    // #23 = Legendary = 5 VP
    tx = await genesis.ownerMint(
      alice.address,
      1
    );
    await tx.wait();

    // #24 = Legendary = 5 VP
    tx = await genesis.ownerMint(
      bob.address,
      1
    );
    await tx.wait();

    // Local test race:
    // 100 sec commit + 100 sec reveal
    tx = await voting.openRace(100, 100);
    await tx.wait();
  });

  it("recognizes Hall of Fame NFTs as zero VP", async function () {
    expect(
      await genesis.votingPowerOf(1)
    ).to.equal(0n);

    expect(
      await genesis.votingPowerOf(22)
    ).to.equal(0n);
  });

  it("recognizes Legendary voting power", async function () {
    expect(
      await genesis.votingPowerOf(23)
    ).to.equal(5n);

    expect(
      await genesis.votingPowerOf(24)
    ).to.equal(5n);
  });

  it("prepares an NFT batch and records VP", async function () {
    const tx = await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await tx.wait();

    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.equal(5n);

    expect(
      await voting.tokenUsed(1, 23)
    ).to.equal(true);
  });

  it("rejects Hall of Fame NFTs with zero VP", async function () {
    await expectRevert(
      voting
        .connect(owner)
        .prepareVoteBatch(1, [1]),
      "Token has no Voting Power"
    );
  });

  it("rejects tokens not owned by caller", async function () {
    await expectRevert(
      voting
        .connect(bob)
        .prepareVoteBatch(1, [23]),
      "Wallet does not own token"
    );
  });

  it("prevents the same NFT being prepared twice", async function () {
    let tx = await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await tx.wait();

    await expectRevert(
      voting
        .connect(alice)
        .prepareVoteBatch(1, [23]),
      "Token already used"
    );
  });

  it("allows multiple batches before final commit", async function () {
    // #25 = another Legendary = 5 VP
    let tx = await genesis.ownerMint(
      alice.address,
      1
    );
    await tx.wait();

    tx = await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await tx.wait();

    tx = await voting
      .connect(alice)
      .prepareVoteBatch(1, [25]);

    await tx.wait();

    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.equal(10n);
  });

  it("finalizes commitment using prepared VP", async function () {
    const secret = ethers.id(
      "alice-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    expect(
      await voting.walletCommitted(
        1,
        alice.address
      )
    ).to.equal(true);

    expect(
      await voting.committedVotingPower(
        1,
        alice.address
      )
    ).to.equal(5n);
  });

  it("prevents adding NFTs after final commit", async function () {
    let tx = await genesis.ownerMint(
      alice.address,
      1
    );

    await tx.wait();

    const secret = ethers.id(
      "alice-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await expectRevert(
      voting
        .connect(alice)
        .prepareVoteBatch(1, [25]),
      "Wallet already committed"
    );
  });

  it("prevents the same wallet finalizing twice", async function () {
    const secret = ethers.id(
      "alice-secret"
    );

    const commitment = makeCommitment(
      1,
      alice.address,
      1,
      secret
    );

    let tx = await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await tx.wait();

    tx = await voting
      .connect(alice)
      .finalizeCommit(
        1,
        commitment
      );

    await tx.wait();

    await expectRevert(
      voting
        .connect(alice)
        .finalizeCommit(
          1,
          commitment
        ),
      "Wallet already committed"
    );
  });

  it("prevents NFT reuse after transfer", async function () {
    const secretAlice = ethers.id(
      "alice-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secretAlice
    );

    let tx = await genesis
      .connect(alice)
      .transferFrom(
        alice.address,
        bob.address,
        23
      );

    await tx.wait();

    // Bob now owns #23, but it was already
    // used during this race.
    await expectRevert(
      voting
        .connect(bob)
        .prepareVoteBatch(1, [23]),
      "Token already used"
    );

    // Bob's original #24 is still eligible.
    tx = await voting
      .connect(bob)
      .prepareVoteBatch(1, [24]);

    await tx.wait();

    expect(
      await voting.preparedVotingPower(
        1,
        bob.address
      )
    ).to.equal(5n);
  });

  it("rejects wrong reveal secret", async function () {
    const secret = ethers.id(
      "correct-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    const wrongSecret = ethers.id(
      "wrong-secret"
    );

    await expectRevert(
      voting
        .connect(alice)
        .revealVote(
          1,
          1,
          wrongSecret
        ),
      "Invalid reveal"
    );
  });

  it("rejects reveal for a different horse", async function () {
    const secret = ethers.id(
      "alice-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    await expectRevert(
      voting
        .connect(alice)
        .revealVote(
          1,
          2,
          secret
        ),
      "Invalid reveal"
    );
  });

  it("hides horse totals before finalization", async function () {
    await expectRevert(
      voting.horseVotingPower(
        1,
        1
      ),
      "Results still hidden"
    );
  });

  it("reveals valid commitment and records VP", async function () {
    const secret = ethers.id(
      "alice-secret"
    );

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    const tx = await voting
      .connect(alice)
      .revealVote(
        1,
        1,
        secret
      );

    await tx.wait();

    expect(
      await voting.walletRevealed(
        1,
        alice.address
      )
    ).to.equal(true);
  });

  it("applies ranking, tie-break and scoring correctly", async function () {
    const aliceSecret = ethers.id(
      "alice-secret"
    );

    const bobSecret = ethers.id(
      "bob-secret"
    );

    // Alice: 5 VP -> HOF #2
    await prepareAndCommit(
      alice,
      [23],
      2,
      aliceSecret
    );

    // Bob: 5 VP -> HOF #1
    await prepareAndCommit(
      bob,
      [24],
      1,
      bobSecret
    );

    await advance(101);

    let tx = await voting
      .connect(alice)
      .revealVote(
        1,
        2,
        aliceSecret
      );

    await tx.wait();

    tx = await voting
      .connect(bob)
      .revealVote(
        1,
        1,
        bobSecret
      );

    await tx.wait();

    await advance(101);

    tx = await voting.finalizeRace(1);
    await tx.wait();

    tx = await voting.calculateRaceResults(1);
    await tx.wait();

    // Both have 5 VP.
    // Lower HOF ID wins tie-break.
    expect(
      await voting.horsePosition(1, 1)
    ).to.equal(1n);

    expect(
      await voting.horsePosition(1, 2)
    ).to.equal(2n);

    expect(
      await voting.horseRacePoints(1, 1)
    ).to.equal(25n);

    expect(
      await voting.horseRacePoints(1, 2)
    ).to.equal(18n);

    // Remaining zero-VP horses follow
    // ascending HOF ID.
    expect(
      await voting.horsePosition(1, 3)
    ).to.equal(3n);

    expect(
      await voting.horseRacePoints(1, 10)
    ).to.equal(1n);

    expect(
      await voting.horseRacePoints(1, 11)
    ).to.equal(0n);

    expect(
      await voting.horseRacePoints(1, 22)
    ).to.equal(0n);
  });

  it("supports exactly 100 NFTs in one batch", async function () {
    // Mint #25 through #124.
    // All remain inside Legendary range.
    const mintTx = await genesis.ownerMint(
      alice.address,
      100
    );

    await mintTx.wait();

    const tokenIds = [];

    for (let id = 25; id <= 124; id++) {
      tokenIds.push(id);
    }

    expect(tokenIds.length).to.equal(100);

    const tx = await voting
      .connect(alice)
      .prepareVoteBatch(
        1,
        tokenIds
      );

    await tx.wait();

    // 100 Legendary NFTs x 5 VP.
    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.equal(500n);
  });

  it("rejects batches larger than 100 NFTs", async function () {
    const tokenIds = [];

    // 101 entries are enough to hit
    // MAX_BATCH_SIZE before ownership checks.
    for (let id = 25; id <= 125; id++) {
      tokenIds.push(id);
    }

    expect(tokenIds.length).to.equal(101);

    await expectRevert(
      voting
        .connect(alice)
        .prepareVoteBatch(
          1,
          tokenIds
        ),
      "Batch too large"
    );
  });
});
