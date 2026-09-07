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

  async function prepareAndCommit(
    signer,
    tokenIds,
    horseId,
    secret,
    raceId = 1
  ) {
    await voting
      .connect(signer)
      .prepareVoteBatch(raceId, tokenIds);

    const commitment = makeCommitment(
      raceId,
      signer.address,
      horseId,
      secret
    );

    await voting
      .connect(signer)
      .finalizeCommit(raceId, commitment);

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
    await genesis.ownerMint(owner.address, 22);

    // #23 = Legendary = 5 VP
    await genesis.ownerMint(alice.address, 1);

    // #24 = Legendary = 5 VP
    await genesis.ownerMint(bob.address, 1);

    await voting.openRace(100, 100);
  });

  it("recognizes Hall of Fame NFTs as zero VP", async function () {
    expect(await genesis.votingPowerOf(1)).to.equal(0);
    expect(await genesis.votingPowerOf(22)).to.equal(0);
  });

  it("prepares an NFT batch and records VP", async function () {
    await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.equal(5);

    expect(
      await voting.tokenUsed(1, 23)
    ).to.equal(true);
  });

  it("rejects Hall of Fame NFTs because they have zero VP", async function () {
    await expect(
      voting
        .connect(owner)
        .prepareVoteBatch(1, [1])
    ).to.be.revertedWith(
      "Token has no Voting Power"
    );
  });

  it("rejects tokens not owned by the caller", async function () {
    await expect(
      voting
        .connect(bob)
        .prepareVoteBatch(1, [23])
    ).to.be.revertedWith(
      "Wallet does not own token"
    );
  });

  it("prevents the same NFT being prepared twice", async function () {
    await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await expect(
      voting
        .connect(alice)
        .prepareVoteBatch(1, [23])
    ).to.be.revertedWith(
      "Token already used"
    );
  });

  it("allows multiple batches before final commit", async function () {
    // Give Alice another Legendary.
    await genesis.ownerMint(alice.address, 1); // #25

    await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await voting
      .connect(alice)
      .prepareVoteBatch(1, [25]);

    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.equal(10);
  });

  it("finalizes commitment using prepared VP", async function () {
    const secret = ethers.id("alice-secret");

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
    ).to.equal(5);
  });

  it("prevents adding NFTs after final commit", async function () {
    await genesis.ownerMint(alice.address, 1); // #25

    const secret = ethers.id("alice-secret");

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await expect(
      voting
        .connect(alice)
        .prepareVoteBatch(1, [25])
    ).to.be.revertedWith(
      "Wallet already committed"
    );
  });

  it("prevents the same wallet finalizing twice", async function () {
    const secret = ethers.id("alice-secret");

    const commitment = makeCommitment(
      1,
      alice.address,
      1,
      secret
    );

    await voting
      .connect(alice)
      .prepareVoteBatch(1, [23]);

    await voting
      .connect(alice)
      .finalizeCommit(1, commitment);

    await expect(
      voting
        .connect(alice)
        .finalizeCommit(1, commitment)
    ).to.be.revertedWith(
      "Wallet already committed"
    );
  });

  it("prevents NFT reuse after transfer", async function () {
    const secretAlice = ethers.id("alice-secret");

    await prepareAndCommit(
      alice,
      [23],
      1,
      secretAlice
    );

    await genesis
      .connect(alice)
      .transferFrom(
        alice.address,
        bob.address,
        23
      );

    // Bob owns #24 and transferred #23.
    // #23 was already used, so attempting it again fails.
    await expect(
      voting
        .connect(bob)
        .prepareVoteBatch(1, [23])
    ).to.be.revertedWith(
      "Token already used"
    );

    // Bob's original #24 remains valid.
    await voting
      .connect(bob)
      .prepareVoteBatch(1, [24]);

    expect(
      await voting.preparedVotingPower(
        1,
        bob.address
      )
    ).to.equal(5);
  });

  it("rejects a wrong reveal secret", async function () {
    const secret = ethers.id("correct-secret");

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    const wrongSecret = ethers.id("wrong-secret");

    await expect(
      voting
        .connect(alice)
        .revealVote(
          1,
          1,
          wrongSecret
        )
    ).to.be.revertedWith(
      "Invalid reveal"
    );
  });

  it("rejects reveal for a different horse", async function () {
    const secret = ethers.id("alice-secret");

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    await expect(
      voting
        .connect(alice)
        .revealVote(
          1,
          2,
          secret
        )
    ).to.be.revertedWith(
      "Invalid reveal"
    );
  });

  it("hides horse totals before finalization", async function () {
    await expect(
      voting.horseVotingPower(1, 1)
    ).to.be.revertedWith(
      "Results still hidden"
    );
  });

  it("reveals a valid commitment and records VP", async function () {
    const secret = ethers.id("alice-secret");

    await prepareAndCommit(
      alice,
      [23],
      1,
      secret
    );

    await advance(101);

    await voting
      .connect(alice)
      .revealVote(
        1,
        1,
        secret
      );

    expect(
      await voting.walletRevealed(
        1,
        alice.address
      )
    ).to.equal(true);
  });

  it("applies ranking, tie-break and scoring correctly", async function () {
    const aliceSecret = ethers.id("alice-secret");
    const bobSecret = ethers.id("bob-secret");

    // Alice: #23 = 5 VP -> votes HOF #2
    await prepareAndCommit(
      alice,
      [23],
      2,
      aliceSecret
    );

    // Bob: #24 = 5 VP -> votes HOF #1
    await prepareAndCommit(
      bob,
      [24],
      1,
      bobSecret
    );

    await advance(101);

    await voting
      .connect(alice)
      .revealVote(
        1,
        2,
        aliceSecret
      );

    await voting
      .connect(bob)
      .revealVote(
        1,
        1,
        bobSecret
      );

    await advance(101);

    await voting.finalizeRace(1);
    await voting.calculateRaceResults(1);

    // Same VP.
    // Lower HOF ID wins tie.
    expect(
      await voting.horsePosition(1, 1)
    ).to.equal(1);

    expect(
      await voting.horsePosition(1, 2)
    ).to.equal(2);

    expect(
      await voting.horseRacePoints(1, 1)
    ).to.equal(25);

    expect(
      await voting.horseRacePoints(1, 2)
    ).to.equal(18);

    expect(
      await voting.horsePosition(1, 3)
    ).to.equal(3);

    expect(
      await voting.horseRacePoints(1, 10)
    ).to.equal(1);

    expect(
      await voting.horseRacePoints(1, 11)
    ).to.equal(0);

    expect(
      await voting.horseRacePoints(1, 22)
    ).to.equal(0);
  });

  it("supports a 100 NFT batch without wallet-wide enumeration", async function () {
    // Mint #25 through #124 to Alice.
    await genesis.ownerMint(alice.address, 100);

    const tokenIds = [];

    for (let id = 25; id <= 124; id++) {
      tokenIds.push(id);
    }

    await voting
      .connect(alice)
      .prepareVoteBatch(1, tokenIds);

    expect(
      await voting.preparedVotingPower(
        1,
        alice.address
      )
    ).to.be.greaterThan(0);
  });

  it("rejects batches larger than 100 NFTs", async function () {
    await genesis.ownerMint(alice.address, 101);

    const tokenIds = [];

    for (let id = 25; id <= 125; id++) {
      tokenIds.push(id);
    }

    await expect(
      voting
        .connect(alice)
        .prepareVoteBatch(1, tokenIds)
    ).to.be.revertedWith(
      "Batch too large"
    );
  });
});
