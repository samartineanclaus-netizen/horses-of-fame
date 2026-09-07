// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

interface IGenesisHorses {
    function balanceOf(address owner)
        external
        view
        returns (uint256);

    function tokenOfOwnerByIndex(
        address owner,
        uint256 index
    )
        external
        view
        returns (uint256);

    function votingPowerOf(uint256 tokenId)
        external
        view
        returns (uint256);
}

contract HOFVoting is Ownable, Pausable {

    IGenesisHorses public immutable genesis;

    uint256 public constant HOF_FIRST_ID = 1;
    uint256 public constant HOF_LAST_ID = 22;

    struct Race {
        bool exists;
        bool finalized;
        uint64 commitStart;
        uint64 commitEnd;
        uint64 revealEnd;
    }

    uint256 public currentRaceId;

    mapping(uint256 => Race) public races;

    // raceId => wallet => commitment hash
    mapping(uint256 => mapping(address => bytes32))
        private _commitments;

    // raceId => wallet => committed
    mapping(uint256 => mapping(address => bool))
        public walletCommitted;

    // raceId => wallet => revealed
    mapping(uint256 => mapping(address => bool))
        public walletRevealed;

    // raceId => tokenId => already locked/used
    mapping(uint256 => mapping(uint256 => bool))
        public tokenUsed;

    // VP snapshot at commit time
    mapping(uint256 => mapping(address => uint256))
        public committedVotingPower;

    // Hidden until finalization through getter.
    mapping(uint256 => mapping(uint256 => uint256))
        private _horseVotingPower;

    mapping(uint256 => uint256)
        private _totalVotingPowerRevealed;

    event RaceOpened(
        uint256 indexed raceId,
        uint256 commitStart,
        uint256 commitEnd,
        uint256 revealEnd
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
    //                       RACE CONTROL
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
    //                         COMMIT
    // =============================================================

    /*
        Frontend calculates:

        keccak256(
            abi.encode(
                raceId,
                wallet,
                horseId,
                secret
            )
        )

        horseId and secret are NOT sent during commit.
    */

    function commitVote(
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
            commitment != bytes32(0),
            "Invalid commitment"
        );

        uint256 balance =
            genesis.balanceOf(msg.sender);

        require(
            balance > 0,
            "Wallet owns no Genesis NFTs"
        );

        uint256 totalVP = 0;

        for (uint256 i = 0; i < balance; i++) {

            uint256 tokenId =
                genesis.tokenOfOwnerByIndex(
                    msg.sender,
                    i
                );

            uint256 vp =
                genesis.votingPowerOf(tokenId);

            // Hall of Fame NFTs = 0 VP.
            if (vp == 0) {
                continue;
            }

            // NFT already contributed during this race.
            if (tokenUsed[raceId][tokenId]) {
                continue;
            }

            tokenUsed[raceId][tokenId] = true;

            totalVP += vp;
        }

        require(
            totalVP > 0,
            "No eligible Voting Power"
        );

        _commitments[raceId][msg.sender] =
            commitment;

        walletCommitted[raceId][msg.sender] =
            true;

        committedVotingPower[raceId][msg.sender] =
            totalVP;

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
            committedVotingPower
                [raceId]
                [msg.sender];

        require(
            vp > 0,
            "No committed Voting Power"
        );

        walletRevealed[raceId][msg.sender] =
            true;

        _horseVotingPower[raceId][horseId]
            += vp;

        _totalVotingPowerRevealed[raceId]
            += vp;

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
    //                         RESULTS
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

        return
            _horseVotingPower
                [raceId]
                [horseId];
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

        return
            _totalVotingPowerRevealed[raceId];
    }

    // =============================================================
    //                    ELIGIBLE WALLET VP
    // =============================================================

    function eligibleVotingPower(
        uint256 raceId,
        address wallet
    )
        external
        view
        returns (uint256)
    {
        uint256 balance =
            genesis.balanceOf(wallet);

        uint256 totalVP = 0;

        for (uint256 i = 0; i < balance; i++) {

            uint256 tokenId =
                genesis.tokenOfOwnerByIndex(
                    wallet,
                    i
                );

            uint256 vp =
                genesis.votingPowerOf(tokenId);

            if (
                vp > 0 &&
                !tokenUsed[raceId][tokenId]
            ) {
                totalVP += vp;
            }
        }

        return totalVP;
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
