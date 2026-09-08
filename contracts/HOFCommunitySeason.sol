// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ICommunityRaceResult {
    function opensAt() external view returns (uint256);
    function closesAt() external view returns (uint256);
    function revealed(address voter) external view returns (bool);
    function revealedHorse(address voter) external view returns (uint8);
    function ranking() external view returns (uint8[22] memory);
    function pointsForPosition(uint8 position) external pure returns (uint8);
}

interface IGenesisEnumerable {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
}

/// @notice V7 Community/Holder scoring across Chapter I.
/// One wallet earns one scoring result per race. Wallet points never transfer
/// with NFTs. Season scores reset after ten races; All-Time points persist.
contract HOFCommunitySeason is Ownable {
    uint8 public constant RACES_PER_SEASON = 10;
    uint8 public constant CHAPTER_SEASONS = 6;
    uint256 public constant RACE_INTERVAL = 3 days;

    uint8 public currentSeason = 1;
    uint8 public racesRegistered;
    uint8 public seasonsFinalized;
    uint256 public lastRaceOpensAt;
    address[10] public races;
    address public genesisContract;

    mapping(address => bool) public registeredRace;
    mapping(address => uint8) public raceSeason;
    mapping(address => uint256) public seasonPoints;
    mapping(address => uint256) public allTimePoints;
    mapping(uint8 => mapping(address => uint256)) public seasonHistory;
    mapping(address => mapping(address => bool)) public raceClaimed;
    mapping(uint8 => address[3]) private seasonTop3;

    address[] private activeWallets;
    mapping(address => bool) private activeWalletSeen;

    event RaceRegistered(address indexed race, uint8 indexed seasonNumber, uint8 indexed raceNumber);
    event CommunityPointsClaimed(address indexed race, address indexed wallet, uint8 horseNumber, uint8 points);
    event SeasonFinalized(uint8 indexed seasonNumber);
    event CommunityTop3Finalized(uint8 indexed seasonNumber, address first, address second, address third);
    event GenesisContractSet(address indexed genesisContract);

    constructor() Ownable(msg.sender) {}

    function setGenesisContract(address genesisContract_) external onlyOwner {
        require(genesisContract == address(0), "Genesis contract already set");
        require(genesisContract_ != address(0), "Zero genesis contract");
        genesisContract = genesisContract_;
        emit GenesisContractSet(genesisContract_);
    }

    function registerRace(address race) external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(race != address(0), "zero race");
        require(racesRegistered < RACES_PER_SEASON, "season complete");
        require(!registeredRace[race], "race already registered");

        ICommunityRaceResult result = ICommunityRaceResult(race);
        require(block.timestamp >= result.closesAt(), "race not closed");
        uint256 raceOpensAt = result.opensAt();
        if (racesRegistered > 0) {
            require(raceOpensAt == lastRaceOpensAt + RACE_INTERVAL, "race cadence must be 3 days");
        }

        races[racesRegistered] = race;
        registeredRace[race] = true;
        raceSeason[race] = currentSeason;
        lastRaceOpensAt = raceOpensAt;
        racesRegistered += 1;
        emit RaceRegistered(race, currentSeason, racesRegistered);
    }

    function claimRacePoints(address race) external {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(registeredRace[race], "race not registered");
        require(raceSeason[race] == currentSeason, "race not in current season");
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

    function finalizeSeason() external onlyOwner {
        require(currentSeason <= CHAPTER_SEASONS, "chapter complete");
        require(racesRegistered == RACES_PER_SEASON, "season not complete");
        require(genesisContract != address(0), "Genesis contract not set");

        uint8 seasonNumber = currentSeason;
        address[3] memory top3 = _calculateTop3();
        seasonTop3[seasonNumber] = top3;

        for (uint256 i = 0; i < activeWallets.length; i++) {
            address wallet = activeWallets[i];
            uint256 points = seasonPoints[wallet];
            seasonHistory[seasonNumber][wallet] = points;
            allTimePoints[wallet] += points;
            seasonPoints[wallet] = 0;
            activeWalletSeen[wallet] = false;
        }
        delete activeWallets;

        for (uint8 i = 0; i < RACES_PER_SEASON; i++) races[i] = address(0);
        racesRegistered = 0;
        lastRaceOpensAt = 0;
        seasonsFinalized += 1;
        currentSeason += 1;
        emit CommunityTop3Finalized(seasonNumber, top3[0], top3[1], top3[2]);
        emit SeasonFinalized(seasonNumber);
    }

    function _calculateTop3() internal view returns (address[3] memory top3) {
        for (uint256 i = 0; i < activeWallets.length; i++) {
            address candidate = activeWallets[i];
            if (top3[0] == address(0) || _ranksAhead(candidate, top3[0])) {
                top3[2] = top3[1]; top3[1] = top3[0]; top3[0] = candidate;
            } else if (top3[1] == address(0) || _ranksAhead(candidate, top3[1])) {
                top3[2] = top3[1]; top3[1] = candidate;
            } else if (top3[2] == address(0) || _ranksAhead(candidate, top3[2])) {
                top3[2] = candidate;
            }
        }
    }

    function _ranksAhead(address a, address b) internal view returns (bool) {
        uint256 aPoints = seasonPoints[a];
        uint256 bPoints = seasonPoints[b];
        if (aPoints != bPoints) return aPoints > bPoints;
        return _winsCastingTieBreak(a, b);
    }

    function _winsCastingTieBreak(address a, address b) internal view returns (bool) {
        IGenesisEnumerable genesis = IGenesisEnumerable(genesisContract);
        uint256 aBalance = genesis.balanceOf(a);
        uint256 bBalance = genesis.balanceOf(b);

        // Approved rule: only on equal points, a wallet with no NFT loses the
        // tie-break against a wallet that still holds at least one Genesis NFT.
        if (aBalance == 0 || bBalance == 0) {
            if (aBalance == 0 && bBalance == 0) return false;
            return aBalance > 0;
        }

        return _lowestOwnedTokenId(a, aBalance) < _lowestOwnedTokenId(b, bBalance);
    }

    function getSeasonTop3(uint8 seasonNumber) external view returns (address[3] memory) {
        require(seasonNumber >= 1 && seasonNumber <= seasonsFinalized, "season not finalized");
        return seasonTop3[seasonNumber];
    }

    function lowestOwnedTokenId(address wallet) public view returns (uint256) {
        require(genesisContract != address(0), "Genesis contract not set");
        uint256 balance = IGenesisEnumerable(genesisContract).balanceOf(wallet);
        require(balance > 0, "wallet owns no NFT");
        return _lowestOwnedTokenId(wallet, balance);
    }

    function _lowestOwnedTokenId(address wallet, uint256 balance) internal view returns (uint256) {
        IGenesisEnumerable genesis = IGenesisEnumerable(genesisContract);
        uint256 lowest = type(uint256).max;
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = genesis.tokenOfOwnerByIndex(wallet, i);
            if (tokenId < lowest) lowest = tokenId;
        }
        return lowest;
    }

    function castingTieBreak(address walletA, address walletB) public view returns (address) {
        require(walletA != walletB, "same wallet");
        IGenesisEnumerable genesis = IGenesisEnumerable(genesisContract);
        uint256 aBalance = genesis.balanceOf(walletA);
        uint256 bBalance = genesis.balanceOf(walletB);
        require(aBalance > 0 || bBalance > 0, "no NFT tie-break winner");

        if (aBalance == 0) return walletB;
        if (bBalance == 0) return walletA;

        uint256 a = _lowestOwnedTokenId(walletA, aBalance);
        uint256 b = _lowestOwnedTokenId(walletB, bBalance);
        return a < b ? walletA : walletB;
    }

    function activeWalletCount() external view returns (uint256) { return activeWallets.length; }
    function seasonComplete() external view returns (bool) { return racesRegistered == RACES_PER_SEASON; }
    function chapterComplete() external view returns (bool) { return seasonsFinalized == CHAPTER_SEASONS; }
}
