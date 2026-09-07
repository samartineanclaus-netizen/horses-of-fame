const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HOFVoting", function () {
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

    // Mint #1-22 Hall of Fame to owner.
    await genesis.ownerMint(owner.address, 22);

    // #23 Legendary = 5 VP -> Alice
    await genesis.ownerMint(alice.address, 1);

    // #24 Legendary = 5 VP -> Bob
    await genesis.ownerMint(bob.address, 1);

    // Short test race:
    // commit 100 sec + reveal 100 sec
    await voting.openRace(100, 100);
  });

  it("recognizes Hall of Fame as zero VP", async function () {
    expect(
      await genesis.votingPowerOf(1)
    ).to.equal(0);

    expect(
      await genesis.votingPowerOf(22)
    ).to.equal(0);
  });

  it("calculates eligible wallet VP", async function () {
    expect(
      await voting.eligibleVotingPower(
        1,
        alice.address
      )
    ).to.equal(5);
  });

  it("prevents the same wallet committing twice", async function () {
    const secret = ethers.id("alice-secret");

    const commitment = makeCommitment(
      1,
      alice.address,
      5,
      secret
    );

    await voting
      .connect(alice)
      .commitVote(1, commitment);

    await expect(
      voting
        .connect(alice)
        .commitVote(1, commitment)
    ).to.be.revertedWith(
      "Wallet already committed"
    );
  });

  it("rejects a wrong reveal secret", async function () {
    const secret = ethers.id("correct-secret");

    const commitment = makeCommitment(
      1,
      alice.address,
      5,
      secret
    );

    await voting
      .connect(alice)
      .commitVote(1, commitment);

    await advance(101);

    const wrongSecret =
      ethers.id("wrong-secret");

    await expect(
      voting
        .connect(alice)
        .revealVote(
          1,
          5,
          wrongSecret
        )
    ).to.be.revertedWith(
      "Invalid reveal"
    );
  });

  it("rejects reveal for a different horse", async function () {
    const secret = ethers.id("alice-secret");

    const commitment = makeCommitment(
      1,
      alice.address,
      5,
      secret
    );

    await voting
      .connect(alice)
      .commitVote(1, commitment);

    await advance(101);

    await expect(
      voting
        .connect(alice)
        .revealVote(
          1,
          6,
          secret
        )
    ).to.be.revertedWith(
      "Invalid reveal"
    );
  });

  it("prevents NFT reuse after transfer", async function () {
    const secretAlice =
      ethers.id("alice-secret");

    const commitmentAlice =
      makeCommitment(
        1,
        alice.address,
        5,
        secretAlice
      );

    await voting
      .connect(alice)
      .commitVote(
        1,
        commitmentAlice
      );

    // Alice transfers #23 after it has been used.
    await genesis
      .connect(alice)
      .transferFrom(
        alice.address,
        bob.address,
        23
      );

    // Bob already owns #24, so only #24
    // should remain eligible.
    expect(
      await voting.eligibleVotingPower(
        1,
        bob.address
      )
    ).to.equal(5);
  });

  it("hides horse totals before finalization", async function () {
    await expect(
      voting.horseVotingPower(1, 5)
    ).to.be.revertedWith(
      "Results still hidden"
    );
  });

  it("reveals valid commitments and records VP", async function () {
    const secret = ethers.id("alice-secret");

    const commitment = makeCommitment(
      1,
      alice.address,
      5,
      secret
    );

    await voting
      .connect(alice)
      .commitVote(1, commitment);

    await advance(101);

    await voting
      .connect(alice)
      .revealVote(
        1,
        5,
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
    const aliceSecret =
      ethers.id("alice-secret");

    const bobSecret =
      ethers.id("bob-secret");

    // Both have 5 VP.
    // Alice votes HOF #2.
    // Bob votes HOF #1.
    // Tie -> lower HOF ID (#1) wins.

    const aliceCommitment =
      makeCommitment(
        1,
        alice.address,
        2,
        aliceSecret
      );

    const bobCommitment =
      makeCommitment(
        1,
        bob.address,
        1,
        bobSecret
      );

    await voting
      .connect(alice)
      .commitVote(
        1,
        aliceCommitment
      );

    await voting
      .connect(bob)
      .commitVote(
        1,
        bobCommitment
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

    // All horses with 0 VP are subsequently
    // ordered by lower HOF ID.
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
});
