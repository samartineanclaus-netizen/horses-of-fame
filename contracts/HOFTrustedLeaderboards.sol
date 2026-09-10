// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "@openzeppelin/contracts/access/Ownable.sol";
import "./HOFTrustedRace.sol";
import "./HOFCanonicalRaceFactory.sol";
import "./HOFCommunitySeason.sol";

interface ITrustedGenesisEnumeration is IGenesisEnumerable {
    function ownershipRevision() external view returns (uint256);
    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Bounded reads over at most 60 races; a race's final flag atomically
/// activates both Community and horse Season/All-Time scores. No wallet claims.
contract HOFTrustedLeaderboards is Ownable {
    HOFCanonicalRaceFactory public immutable raceFactory;
    uint256 public constant MAX_BATCH = 25;
    uint256 public constant CHAPTER_GAP = 30 days;
    uint256 public chapter2StartedAt;
    address public immutable genesisContract;
    address public immutable hofOwner;
    address public immutable backendSigner;
    address public immutable teamReserveWallet;
    uint8 public currentSeason = 1;
    uint8 public seasonsFinalized;
    uint256 public previousSeasonEnd;
    HOFTrustedRace[] public races;
    mapping(address => bool) public registeredRace;
    mapping(uint8 => address[3]) private seasonTop3;
    mapping(uint8 => address[]) private participants;
    mapping(address => uint256) public indexedCount;
    // Zero means absent; points + 1 represents a participant, including zero scores.
    mapping(uint8 => mapping(address => uint256)) private indexedPointsPlusOne;
    mapping(uint8 => mapping(uint256 => uint256)) private walletCountAtScore;
    mapping(uint8 => mapping(uint256 => uint160)) private walletXorAtScore;
    // A scan is valid only while Genesis ownership has not changed. Epochs
    // avoid clearing unbounded wallet mappings when restarting a stale scan.
    uint256 public prizeScanEpoch;
    uint8 public prizeScanSeason;
    uint256 public prizeScanRevision;
    uint256 public prizeScanCursor;
    uint256 public prizeScanEnd;
    uint256 public prizeScoreCursor;
    address[3] private scanTop;
    uint256[3] private scanScores;
    uint256[3] private scanIds;
    mapping(address => uint256) private seenInScan;
    struct HolderBucket { uint256 epoch; uint256 count; uint160 wallets; }
    mapping(uint256 => HolderBucket) private scanHolders;
    event PrizeScanStarted(uint256 indexed epoch, uint8 indexed season, uint256 ownershipRevision);
    event PrizeHoldersProcessed(uint256 indexed epoch, uint256 cursor);
    event PrizeScoresProcessed(uint256 indexed epoch, uint256 cursor);
    event Chapter2Activated(uint256 chapter1FinalRaceRevealedAt, uint256 startedAt);
    event RaceRegistered(address indexed race, uint256 indexed number);
    event ParticipantsIndexed(address indexed race, uint256 count);
    event CommunityTop3Finalized(uint8 indexed season, address first, address second, address third);
    constructor(address genesis_, address owner_, address signer_, address team_) Ownable(owner_) {
        require(genesis_ != address(0) && signer_ != address(0) && team_ != address(0), "zero address");
        raceFactory = new HOFCanonicalRaceFactory(address(this), genesis_, owner_, signer_, team_);
        genesisContract = genesis_; hofOwner = owner_; backendSigner = signer_; teamReserveWallet = team_;
    }
    // Roles are pinned for this deployment so governance cannot silently change
    // who is excluded from voting in already configured races.
    function transferOwnership(address) public view override onlyOwner { revert("immutable owner"); }
    function renounceOwnership() public view override onlyOwner { revert("immutable owner"); }
    function registerRace(address race) external onlyOwner {
        require(currentSeason <= 6 && races.length < uint256(currentSeason) * 10, "season complete");
        require(!registeredRace[race] && race != address(0), "invalid race");
        _requireCanonicalRace(race);
        HOFTrustedRace r = HOFTrustedRace(race);
        require(address(r.genesis()) == genesisContract && r.hofOwner() == hofOwner && r.backendSigner() == backendSigner && r.teamReserveWallet() == teamReserveWallet, "race configuration mismatch");
        require(block.timestamp < r.opensAt(), "register before opening");
        if (races.length % 10 != 0) require(r.opensAt() == races[races.length - 1].opensAt() + 3 days, "race cadence must be 3 days");
        else if (races.length != 0) require(r.opensAt() >= previousSeasonEnd && r.opensAt() <= previousSeasonEnd + 7 days, "season gap exceeds 7 days");
        registeredRace[race] = true; races.push(r); emit RaceRegistered(race, races.length);
    }
    function _requireCanonicalRace(address race) internal view virtual {
        (uint8 chapter, uint8 season, uint8 number) = raceFactory.provenance(race);
        require(chapter == 1 && season == currentSeason && number == races.length % 10 + 1, "noncanonical race");
    }
    function raceCount() external view returns (uint256) { return races.length; }
    function seasonHistory(uint8 season, address wallet) public view returns (uint256 points) {
        require(season >= 1 && season <= 6, "bad season");
        uint256 start = uint256(season - 1) * 10;
        uint256 end = start + 10; if (end > races.length) end = races.length;
        for (uint256 i = start; i < end; ++i) points += races[i].pointsOf(wallet);
    }
    function seasonPoints(address wallet) public view returns (uint256) { return currentSeason <= 6 ? seasonHistory(currentSeason, wallet) : 0; }
    function allTimePoints(address wallet) external view returns (uint256 points) {
        for (uint256 i; i < races.length; ++i) points += races[i].pointsOf(wallet);
    }
    function horsePoints(uint8 horse, uint8 season) public view returns (uint256 points) {
        require(horse >= 1 && horse <= 22 && season <= 6, "bad horse/season");
        uint256 start = season == 0 ? 0 : uint256(season - 1) * 10;
        uint256 end = season == 0 ? races.length : start + 10; if (end > races.length) end = races.length;
        for (uint256 i = start; i < end; ++i) if (races[i].finalized()) {
            uint8[22] memory p = races[i].horseRacePoints(); points += p[horse - 1];
        }
    }
    /// @notice Index at most 25 wallets per transaction for subsequent prize determination.
    function indexParticipants(uint256 raceIndex, uint256 limit) external {
        require(limit > 0 && limit <= MAX_BATCH, "bad batch");
        HOFTrustedRace r = races[raceIndex]; require(r.finalized(), "race not finalized");
        uint8 season = uint8(raceIndex / 10 + 1); require(season == currentSeason, "wrong season");
        uint256 cursor = indexedCount[address(r)]; uint256 end = cursor + limit;
        if (end > r.acceptedBallotCount()) end = r.acceptedBallotCount();
        for (; cursor < end; ++cursor) {
            address wallet = r.ballotWalletAt(cursor);
            uint256 previous = indexedPointsPlusOne[season][wallet];
            uint256 oldPoints = previous == 0 ? 0 : previous - 1;
            if (previous == 0) { participants[season].push(wallet); }
            else { walletCountAtScore[season][oldPoints]--; walletXorAtScore[season][oldPoints] ^= uint160(wallet); }
            uint256 points = oldPoints + r.pointsOf(wallet);
            indexedPointsPlusOne[season][wallet] = points + 1;
            walletCountAtScore[season][points]++; walletXorAtScore[season][points] ^= uint160(wallet);
        }
        indexedCount[address(r)] = end; emit ParticipantsIndexed(address(r), end);
    }
    function participantCount(uint8 season) external view returns (uint256) { return participants[season].length; }
    function participantAt(uint8 season, uint256 index) external view returns (address) { return participants[season][index]; }
    function _requireSeasonReady() private view {
        require(currentSeason <= 6 && races.length == uint256(currentSeason) * 10, "season not complete");
        for (uint256 i = uint256(currentSeason - 1) * 10; i < races.length; ++i) {
            require(races[i].finalized(), "race not finalized");
            require(indexedCount[address(races[i])] == races[i].acceptedBallotCount(), "participants not indexed");
        }
    }
    /// @notice Anyone can start/resume work. A valid scan cannot be reset by
    /// another caller. A changed ownership revision permits a fresh epoch.
    function beginPrizeScan() external {
        _requireSeasonReady();
        ITrustedGenesisEnumeration g = ITrustedGenesisEnumeration(genesisContract);
        uint256 revision = g.ownershipRevision();
        require(prizeScanSeason != currentSeason || prizeScanRevision != revision, "scan already active");
        uint256 end = g.nextTokenId(); require(end <= 2223, "invalid Genesis supply");
        ++prizeScanEpoch; prizeScanSeason = currentSeason; prizeScanRevision = revision;
        prizeScanCursor = 1; prizeScanEnd = end; prizeScoreCursor = 0;
        delete scanTop; delete scanScores; delete scanIds;
        emit PrizeScanStarted(prizeScanEpoch, currentSeason, revision);
    }
    function _requireLiveScan(uint256 epoch) private view {
        require(prizeScanSeason == currentSeason && epoch == prizeScanEpoch && epoch != 0, "wrong scan");
        require(ITrustedGenesisEnumeration(genesisContract).ownershipRevision() == prizeScanRevision, "ownership changed");
    }
    /// @notice At most 25 token IDs, checked in ascending order. No early
    /// ownership snapshot can survive a transfer, mint or refund burn.
    function processPrizeHolders(uint256 epoch, uint256 start, uint256 limit) external {
        _requireLiveScan(epoch);
        require(start == prizeScanCursor, "wrong cursor");
        require(limit > 0 && limit <= MAX_BATCH, "bad batch");
        require(start < prizeScanEnd, "holders complete");
        uint256 end = start + limit; if (end > prizeScanEnd) end = prizeScanEnd;
        address[3] memory top = scanTop; uint256[3] memory scores = scanScores; uint256[3] memory ids = scanIds;
        ITrustedGenesisEnumeration g = ITrustedGenesisEnumeration(genesisContract);
        for (uint256 token = start; token < end; ++token) {
            address wallet;
            try g.ownerOf(token) returns (address holder) { wallet = holder; } catch { continue; }
            uint256 storedPoints = indexedPointsPlusOne[currentSeason][wallet];
            if (storedPoints == 0 || seenInScan[wallet] == epoch) continue;
            seenInScan[wallet] = epoch;
            uint256 points = storedPoints - 1;
            HolderBucket storage bucket = scanHolders[points];
            if (bucket.epoch != epoch) { bucket.epoch = epoch; bucket.count = 0; bucket.wallets = 0; }
            ++bucket.count; bucket.wallets ^= uint160(wallet);
            if (top[2] == address(0) || points > scores[2]) _insert(top, scores, ids, wallet, points, token);
        }
        scanTop = top; scanScores = scores; scanIds = ids; prizeScanCursor = end;
        emit PrizeHoldersProcessed(epoch, end);
    }
    /// @notice At most 25 of the 251 possible V7 season scores per transaction.
    /// A sole nonholder at a score remains eligible; tied nonholders are skipped.
    function processPrizeScores(uint256 epoch, uint256 start, uint256 limit) external {
        _requireLiveScan(epoch);
        require(prizeScanCursor == prizeScanEnd, "holders incomplete");
        require(start == prizeScoreCursor, "wrong cursor");
        require(limit > 0 && limit <= MAX_BATCH, "bad batch");
        require(start < 251, "scores complete");
        uint256 end = start + limit; if (end > 251) end = 251;
        address[3] memory top = scanTop; uint256[3] memory scores = scanScores; uint256[3] memory ids = scanIds;
        for (uint256 p = start; p < end; ++p) {
            HolderBucket storage bucket = scanHolders[p];
            uint256 holders = bucket.epoch == epoch ? bucket.count : 0;
            if (walletCountAtScore[currentSeason][p] - holders == 1) {
                uint160 holderXor = bucket.epoch == epoch ? bucket.wallets : 0;
                address wallet = address(walletXorAtScore[currentSeason][p] ^ holderXor);
                _insert(top, scores, ids, wallet, p, type(uint256).max);
            }
        }
        scanTop = top; scanScores = scores; scanIds = ids; prizeScoreCursor = end;
        emit PrizeScoresProcessed(epoch, end);
    }
    function finalizeSeason() external onlyOwner {
        _requireSeasonReady(); _requireLiveScan(prizeScanEpoch);
        require(prizeScanCursor == prizeScanEnd && prizeScoreCursor == 251, "prize scan incomplete");
        address[3] memory top = scanTop; seasonTop3[currentSeason] = top;
        previousSeasonEnd = races[races.length - 1].revealedAt();
        emit CommunityTop3Finalized(currentSeason, top[0], top[1], top[2]);
        seasonsFinalized = currentSeason; ++currentSeason;
    }
    function getSeasonTop3(uint8 season) external view returns (address[3] memory) {
        require(season >= 1 && season <= seasonsFinalized, "season not finalized"); return seasonTop3[season];
    }
    /// @notice Activation gate only: no Chapter 2 mint, rewards or race economics.
    /// The anchor is immutable Race #60 reveal, never auxiliary admin bookkeeping.
    function activateChapter2() external onlyOwner {
        require(chapter2StartedAt == 0, "Chapter 2 already active");
        require(races.length == 60, "Chapter 1 incomplete");
        for (uint256 i; i < 60; ++i) require(races[i].finalized(), "race not finalized");
        uint256 endedAt = races[59].revealedAt();
        require(endedAt != 0 && block.timestamp >= endedAt + CHAPTER_GAP, "Chapter gap below 30 days");
        chapter2StartedAt = block.timestamp;
        emit Chapter2Activated(endedAt, block.timestamp);
    }
    function _insert(address[3] memory top, uint256[3] memory scores, uint256[3] memory ids, address wallet, uint256 points, uint256 lowest) private pure {
        for (uint256 pos; pos < 3; ++pos) {
            if (top[pos] == address(0) || points > scores[pos] || (points == scores[pos] && lowest < ids[pos])) {
                for (uint256 j = 2; j > pos; --j) { top[j] = top[j-1]; scores[j] = scores[j-1]; ids[j] = ids[j-1]; }
                top[pos] = wallet; scores[pos] = points; ids[pos] = lowest; break;
            }
        }
    }
}
