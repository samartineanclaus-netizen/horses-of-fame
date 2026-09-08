// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IHOFRaceResult {
    function horseRacePoints() external view returns (uint8[22] memory);
    function closesAt() external view returns (uint256);
}

/// @notice V7 Hall of Fame horse leaderboard across Chapter I.
/// Ten races form a season; completed season scores are archived and reset,
/// while All-Time HOF points continue across all six seasons.
contract HOFSeasonLeaderboard is Ownable {
    uint8 public constant HOF_COMPETITORS = 22;
    uint8 public constant RACES_PER_SEASON = 10;
    uint8 public constant CHAPTER_SEASONS = 6;

    uint8 public currentSeason = 1;
    uint8 public racesRecorded;
    uint8 public seasonsFinalized;

    mapping(uint8 => uint256) public seasonPoints;
    mapping(uint8 => uint256) public allTimePoints;
    mapping(uint8 => mapping(uint8 => uint256)) public seasonHistory;
    mapping(address => bool) public raceRecorded;

    event RaceRecorded(address indexed race, uint8 indexed seasonNumber, uint8 indexed raceNumber);
    event SeasonFinalized(uint8 indexed seasonNumber, uint8 champion);

    constructor() Ownable(msg.sender) {}

    function recordRace(address race) external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(race != address(0), "zero race");
        require(racesRecorded < RACES_PER_SEASON, "season complete");
        require(!raceRecorded[race], "race already recorded");
        require(block.timestamp >= IHOFRaceResult(race).closesAt(), "race not closed");

        uint8[22] memory points = IHOFRaceResult(race).horseRacePoints();
        for (uint8 horse = 1; horse <= HOF_COMPETITORS; horse++) {
            seasonPoints[horse] += points[horse - 1];
        }

        raceRecorded[race] = true;
        racesRecorded += 1;
        emit RaceRecorded(race, currentSeason, racesRecorded);
    }

    /// @notice Archives a completed 10-race season, updates All-Time standings,
    /// resets active season scores, and advances to the next Chapter I season.
    function finalizeSeason() external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(racesRecorded == RACES_PER_SEASON, "season not complete");

        uint8 seasonNumber = currentSeason;
        uint8 champion = _ranking(false)[0];
        for (uint8 horse = 1; horse <= HOF_COMPETITORS; horse++) {
            uint256 points = seasonPoints[horse];
            seasonHistory[seasonNumber][horse] = points;
            allTimePoints[horse] += points;
            seasonPoints[horse] = 0;
        }

        seasonsFinalized += 1;
        racesRecorded = 0;
        currentSeason += 1;
        emit SeasonFinalized(seasonNumber, champion);
    }

    /// @notice Active season ranking by accumulated points descending.
    /// V7 tie-break: lower HOF competitor number ranks higher.
    function ranking() external view returns (uint8[22] memory) {
        return _ranking(false);
    }

    /// @notice Chapter I All-Time HOF ranking across finalized seasons.
    function allTimeRanking() external view returns (uint8[22] memory) {
        return _ranking(true);
    }

    function _ranking(bool useAllTime) internal view returns (uint8[22] memory ranked) {
        for (uint8 i = 0; i < HOF_COMPETITORS; i++) {
            ranked[i] = i + 1;
        }

        for (uint256 i = 1; i < HOF_COMPETITORS; i++) {
            uint8 current = ranked[i];
            uint256 j = i;
            while (j > 0 && _ranksAhead(current, ranked[j - 1], useAllTime)) {
                ranked[j] = ranked[j - 1];
                j--;
            }
            ranked[j] = current;
        }
    }

    function _ranksAhead(uint8 a, uint8 b, bool useAllTime) internal view returns (bool) {
        uint256 aPoints = useAllTime ? allTimePoints[a] : seasonPoints[a];
        uint256 bPoints = useAllTime ? allTimePoints[b] : seasonPoints[b];
        if (aPoints != bPoints) return aPoints > bPoints;
        return a < b;
    }

    function seasonComplete() external view returns (bool) {
        return racesRecorded == RACES_PER_SEASON;
    }

    function chapterComplete() external view returns (bool) {
        return seasonsFinalized == CHAPTER_SEASONS;
    }

    /// @notice HOF All-Time #1 after all six seasons: CHAPTER I — GENESIS GRAND CHAMPION.
    function genesisGrandChampion() external view returns (uint8) {
        require(seasonsFinalized == CHAPTER_SEASONS, "chapter not complete");
        return _ranking(true)[0];
    }
}
