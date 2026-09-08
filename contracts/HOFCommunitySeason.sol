// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ICommunityRaceResult {
    function closesAt() external view returns (uint256);
    function revealed(address voter) external view returns (bool);
    function revealedHorse(address voter) external view returns (uint8);
    function ranking() external view returns (uint8[22] memory);
    function pointsForPosition(uint8 position) external pure returns (uint8);
}

/// @notice V7 Community/Holder scoring across Chapter I.
/// One wallet earns one scoring result per race. Wallet points never transfer
/// with NFTs. Season scores reset after ten races; All-Time points persist.
contract HOFCommunitySeason is Ownable {
    uint8 public constant RACES_PER_SEASON = 10;
    uint8 public constant CHAPTER_SEASONS = 6;

    uint8 public currentSeason = 1;
    uint8 public racesRegistered;
    uint8 public seasonsFinalized;
    address[10] public races;

    mapping(address => bool) public registeredRace;
    mapping(address => uint256) public seasonPoints;
    mapping(address => uint256) public allTimePoints;
    mapping(uint8 => mapping(address => uint256)) public seasonHistory;
    mapping(address => mapping(address => bool)) public raceClaimed;

    address[] private activeWallets;
    mapping(address => bool) private activeWalletSeen;

    event RaceRegistered(address indexed race, uint8 indexed seasonNumber, uint8 indexed raceNumber);
    event CommunityPointsClaimed(address indexed race, address indexed wallet, uint8 horseNumber, uint8 points);
    event SeasonFinalized(uint8 indexed seasonNumber);

    constructor() Ownable(msg.sender) {}

    function registerRace(address race) external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(race != address(0), "zero race");
        require(racesRegistered < RACES_PER_SEASON, "season complete");
        require(!registeredRace[race], "race already registered");
        require(block.timestamp >= ICommunityRaceResult(race).closesAt(), "race not closed");

        races[racesRegistered] = race;
        registeredRace[race] = true;
        racesRegistered += 1;
        emit RaceRegistered(race, currentSeason, racesRegistered);
    }

    /// @notice Claims exactly one Community scoring result for msg.sender in a race.
    /// NFT quantity/rarity affects VP only and never multiplies Community points.
    function claimRacePoints(address race) external {
        require(registeredRace[race], "race not registered");
        require(!raceClaimed[race][msg.sender], "already claimed");

        ICommunityRaceResult result = ICommunityRaceResult(race);
        require(result.revealed(msg.sender), "wallet did not reveal");
        uint8 chosenHorse = result.revealedHorse(msg.sender);
        uint8[22] memory ranked = result.ranking();

        uint8 position;
        for (uint8 i = 0; i < 22; i++) {
            if (ranked[i] == chosenHorse) {
                position = i + 1;
                break;
            }
        }
        require(position != 0, "horse not ranked");

        uint8 points = result.pointsForPosition(position);
        raceClaimed[race][msg.sender] = true;
        if (!activeWalletSeen[msg.sender]) {
            activeWalletSeen[msg.sender] = true;
            activeWallets.push(msg.sender);
        }
        seasonPoints[msg.sender] += points;
        emit CommunityPointsClaimed(race, msg.sender, chosenHorse, points);
    }

    /// @notice Archives wallet scores after exactly ten registered races,
    /// updates All-Time points and resets active Community scores.
    function finalizeSeason() external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(racesRegistered == RACES_PER_SEASON, "season not complete");

        uint8 seasonNumber = currentSeason;
        for (uint256 i = 0; i < activeWallets.length; i++) {
            address wallet = activeWallets[i];
            uint256 points = seasonPoints[wallet];
            seasonHistory[seasonNumber][wallet] = points;
            allTimePoints[wallet] += points;
            seasonPoints[wallet] = 0;
            activeWalletSeen[wallet] = false;
        }
        delete activeWallets;

        for (uint8 i = 0; i < RACES_PER_SEASON; i++) {
            races[i] = address(0);
        }
        racesRegistered = 0;
        seasonsFinalized += 1;
        currentSeason += 1;
        emit SeasonFinalized(seasonNumber);
    }

    function activeWalletCount() external view returns (uint256) {
        return activeWallets.length;
    }

    function seasonComplete() external view returns (bool) {
        return racesRegistered == RACES_PER_SEASON;
    }

    function chapterComplete() external view returns (bool) {
        return seasonsFinalized == CHAPTER_SEASONS;
    }

    /// @notice Final All-Time Community Champion after all six Chapter I seasons.
    /// Tie-break: lower wallet address sorts first, giving deterministic on-chain resolution.
    /// This function intentionally exposes the winning wallet only; Community Points
    /// remain attached to wallets and are never transferred with NFTs.
    function genesisCommunityChampion(address[] calldata candidates) external view returns (address) {
        require(seasonsFinalized == CHAPTER_SEASONS, "chapter not complete");
        require(candidates.length > 0, "no candidates");

        address champion = candidates[0];
        for (uint256 i = 1; i < candidates.length; i++) {
            address candidate = candidates[i];
            uint256 candidatePoints = allTimePoints[candidate];
            uint256 championPoints = allTimePoints[champion];
            if (candidatePoints > championPoints ||
                (candidatePoints == championPoints && uint160(candidate) < uint160(champion))) {
                champion = candidate;
            }
        }
        return champion;
    }
}
