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

/// @notice V7 Community/Holder season scoring.
/// One wallet earns one scoring result per race. NFT quantity/rarity affects VP,
/// but never multiplies the wallet's Community points.
contract HOFCommunitySeason is Ownable {
    uint8 public constant RACES_PER_SEASON = 10;

    uint8 public racesRegistered;
    address[10] public races;
    mapping(address => bool) public registeredRace;
    mapping(address => uint256) public seasonPoints;
    mapping(address => mapping(address => bool)) public raceClaimed;

    event RaceRegistered(address indexed race, uint8 indexed raceNumber);
    event CommunityPointsClaimed(address indexed race, address indexed wallet, uint8 horseNumber, uint8 points);

    constructor() Ownable(msg.sender) {}

    function registerRace(address race) external onlyOwner {
        require(race != address(0), "zero race");
        require(racesRegistered < RACES_PER_SEASON, "season complete");
        require(!registeredRace[race], "race already registered");
        require(block.timestamp >= ICommunityRaceResult(race).closesAt(), "race not closed");

        races[racesRegistered] = race;
        registeredRace[race] = true;
        racesRegistered += 1;
        emit RaceRegistered(race, racesRegistered);
    }

    /// @notice Claims exactly one Community scoring result for msg.sender in a race.
    /// The wallet receives the F1 points corresponding to the final position of
    /// the HOF horse it revealed: 25/18/15/12/10/8/6/4/2/1, then zero.
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
        seasonPoints[msg.sender] += points;
        emit CommunityPointsClaimed(race, msg.sender, chosenHorse, points);
    }

    function seasonComplete() external view returns (bool) {
        return racesRegistered == RACES_PER_SEASON;
    }
}
