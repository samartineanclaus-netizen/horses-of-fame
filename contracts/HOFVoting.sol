// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IGenesisHorses {
    function ownerOf(uint256 tokenId)
        external
        view
        returns (address);

    function votingPowerOf(uint256 tokenId)
        external
        view
        returns (uint256);
}

contract HOFVoting is Ownable, Pausable {

    IGenesisHorses public immutable genesis;

    uint256 public constant HOF_FIRST_ID = 1;
    uint256 public constant HOF_LAST_ID = 22;

    // Maximum number of NFTs accepted in one batch transaction.
    uint256 public constant MAX_BATCH_SIZE = 100;

    struct Race {
        bool exists;
        bool finalized;
        bool resultsCalculated;
        uint64 commitStart;
        uint64 commitEnd;
        uint64 revealEnd;
    }

    uint256 public currentRaceId;

    mapping(uint256 => Race) public races;

    // raceId => wallet => commitment
    mapping(uint256 => mapping(address => bytes32))
        private _commitments;

    // A wallet can prepare several batches before final commit.
    mapping(uint256 => mapping(address => bool))
        public walletPreparing;

    mapping(uint256 => mapping(address => bool))
        public walletCommitted;

    mapping(uint256 => mapping(address => bool))
        public walletRevealed;

    // raceId => tokenId => used
    mapping(uint256 => mapping(uint256 => bool))
        public tokenUsed;

    // VP accumulated during batching.
    mapping(uint256 => mapping(address => uint256))
        public preparedVotingPower;

    // Final immutable VP snapshot for the vote.
    mapping(uint256 => mapping(address => uint256))
        public committedVotingPower;

    mapping(uint256 => mapping(uint256 => uint256))
        private _horseVotingPower;

    mapping(uint256 => uint256)
        private _totalVotingPowerRevealed;

    mapping(uint256 => mapping(uint256 => uint256))
        private _horsePosition;

    mapping(uint256 => mapping(uint256 => uint256))
        private _horseRacePoints;

    mapping(uint256 => uint256)
        public championshipPoints;

    uint256[10] private _pointsTable = [
        uint256(25),
        18,
        15,
        12,
        10,
        8,
        6,
        4,
        2,
        1
    ];

    event RaceOpened(
        uint256 indexed raceId,
        uint256 commitStart,
        uint256 commitEnd,
        uint256 revealEnd
    );

    event VoteBatchPrepared(
        uint256 indexed raceId,
        address indexed wallet,
        uint256 tokenCount,
        uint256 batchVotingPower,
        uint256 totalPreparedVotingPower
    );

    event VoteCommitted(
        uint256 indexed raceId,
        address indexed wallet,
        uint256 votingPower
    );

    event VoteRevealed(
        uint256 indexed raceId,
        address indexed wallet,
        uint256 votingPower
    );

    event RaceFinalized(
        uint256 indexed raceId
    );

    event RaceResultsCalculated(
        uint256 indexed raceId
    );

    constructor(address genesisAddress)
        Ownable(msg.sender)
    {
        require(
            genesisAddress != address(0),
            "Invalid Genesis address"
        );

        genesis = IGenesisHorses(genesisAddress);
    }

    // =============================================================
    //                         RACE CONTROL
    // =============================================================

    function openRace(
        uint64 commitDuration,
        uint64 revealDuration
    )
        external
        onlyOwner
    {
        require(
            commitDuration > 0,
            "Invalid commit duration"
        );

        require(
            revealDuration > 0,
            "Invalid reveal duration"
        );

        if (currentRaceId > 0) {
            require(
                races[currentRaceId].finalized,
                "Previous race not finalized"
            );
        }

        currentRaceId++;

        uint64 start = uint64(block.timestamp);
        uint64 commitEnd = start + commitDuration;
        uint64 revealEnd = commitEnd + revealDuration;

        races[currentRaceId] = Race({
            exists: true,
            finalized: false,
            resultsCalculated: false,
            commitStart: start,
            commitEnd: commitEnd,
            revealEnd: revealEnd
        });

        emit RaceOpened(
            currentRaceId,
            start,
            commitEnd,
            revealEnd
        );
    }

    // =============================================================
    //                     BATCH PREPARATION
    // =============================================================

    /*
        Large wallets process their NFTs in bounded batches.

        Example:
        prepareVoteBatch(raceId, tokenIds[0..99])
        prepareVoteBatch(raceId, tokenIds[100..199])
        ...
        finalizeCommit(raceId, commitment)

        Each token is checked on-chain for ownership and can only
        contribute once per race.
    */

    function prepareVoteBatch(
        uint256 raceId,
        uint256[] calldata tokenIds
    )
        external
        whenNotPaused
    {
        Race memory race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            block.timestamp >= race.commitStart &&
            block.timestamp < race.commitEnd,
            "Commit phase closed"
        );

        require(
            !walletCommitted[raceId][msg.sender],
            "Wallet already committed"
        );

        require(
            tokenIds.length > 0,
            "Empty batch"
        );

        require(
            tokenIds.length <= MAX_BATCH_SIZE,
            "Batch too large"
        );

        uint256 batchVP = 0;

        for (uint256 i = 0; i < tokenIds.length; i++) {

            uint256 tokenId = tokenIds[i];

            require(
                genesis.ownerOf(tokenId) == msg.sender,
                "Wallet does not own token"
            );

            require(
                !tokenUsed[raceId][tokenId],
                "Token already used"
            );

            uint256 vp =
                genesis.votingPowerOf(tokenId);

            require(
                vp > 0,
                "Token has no Voting Power"
            );

            // Mark before continuing.
            // If transaction reverts, state reverts too.
            tokenUsed[raceId][tokenId] = true;

            batchVP += vp;
        }

        require(
            batchVP > 0,
            "No eligible Voting Power"
        );

        walletPreparing[raceId][msg.sender] = true;

        preparedVotingPower[raceId][msg.sender]
            += batchVP;

        emit VoteBatchPrepared(
            raceId,
            msg.sender,
            tokenIds.length,
            batchVP,
            preparedVotingPower[raceId][msg.sender]
        );
    }

    // =============================================================
    //                         COMMIT
    // =============================================================

    /*
        Frontend commitment:

        keccak256(
            abi.encode(
                raceId,
                wallet,
                horseId,
                secret
            )
        )

        horseId and secret are not sent during commit.
    */

    function finalizeCommit(
        uint256 raceId,
        bytes32 commitment
    )
        external
        whenNotPaused
    {
        Race memory race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            block.timestamp >= race.commitStart &&
            block.timestamp < race.commitEnd,
            "Commit phase closed"
        );

        require(
            !walletCommitted[raceId][msg.sender],
            "Wallet already committed"
        );

        require(
            walletPreparing[raceId][msg.sender],
            "No prepared NFTs"
        );

        require(
            commitment != bytes32(0),
            "Invalid commitment"
        );

        uint256 totalVP =
            preparedVotingPower[raceId][msg.sender];

        require(
            totalVP > 0,
            "No prepared Voting Power"
        );

        _commitments[raceId][msg.sender] =
            commitment;

        committedVotingPower[raceId][msg.sender] =
            totalVP;

        walletCommitted[raceId][msg.sender] =
            true;

        emit VoteCommitted(
            raceId,
            msg.sender,
            totalVP
        );
    }

    // =============================================================
    //                         REVEAL
    // =============================================================

    function revealVote(
        uint256 raceId,
        uint256 horseId,
        bytes32 secret
    )
        external
        whenNotPaused
    {
        Race memory race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            block.timestamp >= race.commitEnd,
            "Reveal not started"
        );

        require(
            block.timestamp < race.revealEnd,
            "Reveal phase closed"
        );

        require(
            walletCommitted[raceId][msg.sender],
            "No commitment"
        );

        require(
            !walletRevealed[raceId][msg.sender],
            "Already revealed"
        );

        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        bytes32 expectedCommitment =
            keccak256(
                abi.encode(
                    raceId,
                    msg.sender,
                    horseId,
                    secret
                )
            );

        require(
            expectedCommitment ==
            _commitments[raceId][msg.sender],
            "Invalid reveal"
        );

        uint256 vp =
            committedVotingPower[raceId][msg.sender];

        require(
            vp > 0,
            "No committed Voting Power"
        );

        walletRevealed[raceId][msg.sender] = true;

        _horseVotingPower[raceId][horseId] += vp;

        _totalVotingPowerRevealed[raceId] += vp;

        emit VoteRevealed(
            raceId,
            msg.sender,
            vp
        );
    }

    // =============================================================
    //                         FINALIZE
    // =============================================================

    function finalizeRace(uint256 raceId)
        external
        onlyOwner
    {
        Race storage race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            !race.finalized,
            "Race already finalized"
        );

        require(
            block.timestamp >= race.revealEnd,
            "Reveal phase not finished"
        );

        race.finalized = true;

        emit RaceFinalized(raceId);
    }

    // =============================================================
    //                     RANKING / SCORING
    // =============================================================

    function calculateRaceResults(uint256 raceId)
        external
        onlyOwner
    {
        Race storage race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            race.finalized,
            "Race not finalized"
        );

        require(
            !race.resultsCalculated,
            "Results already calculated"
        );

        uint256[22] memory horseIds;

        for (uint256 i = 0; i < 22; i++) {
            horseIds[i] = i + 1;
        }

        // Higher VP first.
        // Equal VP -> lower HOF ID first.
        for (uint256 i = 0; i < 21; i++) {
            for (uint256 j = i + 1; j < 22; j++) {

                uint256 horseA = horseIds[i];
                uint256 horseB = horseIds[j];

                uint256 vpA =
                    _horseVotingPower[raceId][horseA];

                uint256 vpB =
                    _horseVotingPower[raceId][horseB];

                bool swapNeeded =
                    vpB > vpA ||
                    (
                        vpB == vpA &&
                        horseB < horseA
                    );

                if (swapNeeded) {
                    horseIds[i] = horseB;
                    horseIds[j] = horseA;
                }
            }
        }

        for (uint256 i = 0; i < 22; i++) {

            uint256 horseId = horseIds[i];
            uint256 position = i + 1;

            _horsePosition[raceId][horseId] =
                position;

            uint256 points = 0;

            if (position <= 10) {
                points =
                    _pointsTable[position - 1];
            }

            _horseRacePoints[raceId][horseId] =
                points;

            championshipPoints[horseId] +=
                points;
        }

        race.resultsCalculated = true;

        emit RaceResultsCalculated(raceId);
    }

    // =============================================================
    //                         READ FUNCTIONS
    // =============================================================

    function horseVotingPower(
        uint256 raceId,
        uint256 horseId
    )
        external
        view
        returns (uint256)
    {
        require(
            races[raceId].exists,
            "Race does not exist"
        );

        require(
            races[raceId].finalized,
            "Results still hidden"
        );

        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        return _horseVotingPower[raceId][horseId];
    }

    function totalVotingPowerRevealed(
        uint256 raceId
    )
        external
        view
        returns (uint256)
    {
        require(
            races[raceId].finalized,
            "Results still hidden"
        );

        return _totalVotingPowerRevealed[raceId];
    }

    function horsePosition(
        uint256 raceId,
        uint256 horseId
    )
        external
        view
        returns (uint256)
    {
        require(
            races[raceId].resultsCalculated,
            "Results not calculated"
        );

        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        return _horsePosition[raceId][horseId];
    }

    function horseRacePoints(
        uint256 raceId,
        uint256 horseId
    )
        external
        view
        returns (uint256)
    {
        require(
            races[raceId].resultsCalculated,
            "Results not calculated"
        );

        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        return _horseRacePoints[raceId][horseId];
    }

    // =============================================================
    //                         PAUSE
    // =============================================================

    function pause()
        external
        onlyOwner
    {
        _pause();
    }

    function unpause()
        external
        onlyOwner
    {
        _unpause();
    }
}
