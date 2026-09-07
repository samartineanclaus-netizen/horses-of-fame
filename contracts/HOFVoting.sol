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

    // =============================================================
    //                         GENESIS
    // =============================================================

    IGenesisHorses public immutable genesis;

    uint256 public constant HOF_FIRST_ID = 1;
    uint256 public constant HOF_LAST_ID = 22;

    // =============================================================
    //                         RACES
    // =============================================================

    struct Race {
        bool exists;
        bool open;
        uint64 openedAt;
        uint64 closesAt;
    }

    uint256 public currentRaceId;

    mapping(uint256 => Race) public races;

    // raceId => wallet => already voted
    mapping(uint256 => mapping(address => bool))
        public walletVoted;

    // raceId => tokenId => already used
    mapping(uint256 => mapping(uint256 => bool))
        public tokenUsed;

    // raceId => horseId => total VP
    mapping(uint256 => mapping(uint256 => uint256))
        private _horseVotingPower;

    // raceId => total VP cast
    mapping(uint256 => uint256)
        public totalVotingPowerCast;

    // =============================================================
    //                         EVENTS
    // =============================================================

    event RaceOpened(
        uint256 indexed raceId,
        uint256 openedAt,
        uint256 closesAt
    );

    event RaceClosed(
        uint256 indexed raceId
    );

    event VoteCast(
        uint256 indexed raceId,
        address indexed wallet,
        uint256 indexed horseId,
        uint256 votingPower
    );

    // =============================================================
    //                         CONSTRUCTOR
    // =============================================================

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

    function openRace(uint64 durationSeconds)
        external
        onlyOwner
    {
        require(
            durationSeconds > 0,
            "Invalid duration"
        );

        if (currentRaceId > 0) {
            Race storage previousRace =
                races[currentRaceId];

            require(
                !previousRace.open,
                "Previous race still open"
            );
        }

        currentRaceId++;

        uint64 openedAt =
            uint64(block.timestamp);

        uint64 closesAt =
            openedAt + durationSeconds;

        races[currentRaceId] = Race({
            exists: true,
            open: true,
            openedAt: openedAt,
            closesAt: closesAt
        });

        emit RaceOpened(
            currentRaceId,
            openedAt,
            closesAt
        );
    }

    function closeRace(uint256 raceId)
        external
        onlyOwner
    {
        Race storage race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            race.open,
            "Race already closed"
        );

        race.open = false;

        emit RaceClosed(raceId);
    }

    // =============================================================
    //                         VOTING
    // =============================================================

    function vote(
        uint256 raceId,
        uint256 horseId
    )
        external
        whenNotPaused
    {
        Race storage race = races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            race.open,
            "Race closed"
        );

        require(
            block.timestamp < race.closesAt,
            "Voting window ended"
        );

        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        require(
            !walletVoted[raceId][msg.sender],
            "Wallet already voted"
        );

        uint256 balance =
            genesis.balanceOf(msg.sender);

        require(
            balance > 0,
            "Wallet owns no Genesis NFTs"
        );

        uint256 totalVP = 0;

        // Every eligible Genesis voting NFT
        // currently held by this wallet backs
        // the same Hall of Fame horse.
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId =
                genesis.tokenOfOwnerByIndex(
                    msg.sender,
                    i
                );

            uint256 vp =
                genesis.votingPowerOf(tokenId);

            // Hall of Fame NFTs return 0 VP.
            if (vp == 0) {
                continue;
            }

            // Prevent reuse after transfer.
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

        walletVoted[raceId][msg.sender] = true;

        _horseVotingPower[raceId][horseId]
            += totalVP;

        totalVotingPowerCast[raceId]
            += totalVP;

        emit VoteCast(
            raceId,
            msg.sender,
            horseId,
            totalVP
        );
    }

    // =============================================================
    //                         READ FUNCTIONS
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

    function horseVotingPower(
        uint256 raceId,
        uint256 horseId
    )
        external
        view
        returns (uint256)
    {
        require(
            horseId >= HOF_FIRST_ID &&
            horseId <= HOF_LAST_ID,
            "Invalid Hall of Fame horse"
        );

        Race memory race =
            races[raceId];

        require(
            race.exists,
            "Race does not exist"
        );

        require(
            !race.open ||
            block.timestamp >= race.closesAt,
            "Results still hidden"
        );

        return _horseVotingPower
            [raceId]
            [horseId];
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
