// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IHOFRaceResult {
    function horseRacePoints() external view returns (uint8[22] memory);
    function closesAt() external view returns (uint256);
}

/// @notice V7 Hall of Fame horse leaderboard for one 10-race season.
/// Community/Holder scoring is intentionally handled separately.
contract HOFSeasonLeaderboard is Ownable {
    uint8 public constant HOF_COMPETITORS = 22;
    uint8 public constant RACES_PER_SEASON = 10;

    uint8 public racesRecorded;
    mapping(uint8 => uint256) public seasonPoints;
    mapping(address => bool) public raceRecorded;

    event RaceRecorded(address indexed race, uint8 indexed raceNumber);

    constructor() Ownable(msg.sender) {}

    function recordRace(address race) external onlyOwner {
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
        emit RaceRecorded(race, racesRecorded);
    }

    /// @notice Season ranking by accumulated points descending.
    /// V7 tie-break: lower HOF competitor number ranks higher.
    function ranking() external view returns (uint8[22] memory ranked) {
        for (uint8 i = 0; i < HOF_COMPETITORS; i++) {
            ranked[i] = i + 1;
        }

        for (uint256 i = 1; i < HOF_COMPETITORS; i++) {
            uint8 current = ranked[i];
            uint256 j = i;
            while (j > 0 && _ranksAhead(current, ranked[j - 1])) {
                ranked[j] = ranked[j - 1];
                j--;
            }
            ranked[j] = current;
        }
    }

    function _ranksAhead(uint8 a, uint8 b) internal view returns (bool) {
        uint256 aPoints = seasonPoints[a];
        uint256 bPoints = seasonPoints[b];
        if (aPoints != bPoints) return aPoints > bPoints;
        return a < b;
    }

    function seasonComplete() external view returns (bool) {
        return racesRecorded == RACES_PER_SEASON;
    }
}
