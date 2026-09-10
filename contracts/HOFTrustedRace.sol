// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./HOFRaceVoting.sol";

/// @notice Owner-trusted tally, NOT a proof of correct decryption/counting.
/// No plaintext choices, salts or decryption keys are submitted to this contract.
contract HOFTrustedRace is EIP712 {
    uint256 public constant MAX_BATCH = 25;
    uint256 public constant CIPHERTEXT_LENGTH = 446; // v1 + RSA3072(384) + IV(12) + encrypted payload(49)
    bytes32 public constant ADMISSION_TYPEHASH = keccak256("Admission(address voter,bytes32 commitment,bytes32 ciphertextHash,uint256 deadline)");
    bytes32 public constant RESULT_TYPEHASH = keccak256("Result(bytes32 recordsHash,uint256 count,uint256 totalVP,bytes32 totalsHash,bytes32 scoresRoot)");
    IGenesisVoting public immutable genesis;
    address public immutable hofOwner;
    address public immutable backendSigner;
    address public immutable teamReserveWallet;
    uint256 public immutable opensAt;
    uint256 public immutable closesAt;
    bytes public encryptionPublicKey; // SPKI; pinned before opening
    bytes32 public immutable keyId;
    struct Ballot { address wallet; bytes32 commitment; bytes ciphertext; uint256 vp; }
    Ballot[] private ballots;
    mapping(address => uint256) public ballotIndexPlusOne;
    mapping(uint256 => bool) public tokenUsed;
    bytes32 public recordsHash;
    uint256 public totalVP;
    bool public frozen;
    bytes32 public frozenRecordsHash;
    uint256 public acceptedBallotCount;
    bool public proposed;
    bytes32 public scoresRoot;
    uint256 public processedCount;
    bool public finalized;
    uint256 public revealedAt;
    uint256[22] private totals;
    uint8[22] private ranked;
    mapping(address => uint8) private preparedPoints;
    event BallotAccepted(uint256 indexed index, address indexed wallet, bytes32 commitment, bytes32 ciphertextHash, uint256 vp);
    event VotingPowerAdded(uint256 indexed index, uint256 vp);
    event VotingClosed(bytes32 recordsHash, uint256 count, uint256 totalVP);
    event ResultProposed(bytes32 indexed scoresRoot);
    event ScoresPrepared(uint256 fromIndex, uint256 toIndex);
    event RaceFinalized(uint256 revealedAt);

    constructor(address genesis_, uint256 opensAt_, address team_, address owner_, address signer_, bytes memory publicKey_)
        EIP712("HOFTrustedRace", "1") {
        require(genesis_ != address(0) && team_ != address(0) && owner_ != address(0) && signer_ != address(0), "zero address");
        require(opensAt_ >= block.timestamp, "bad opening");
        require(publicKey_.length > 0 && publicKey_.length <= 1024, "bad public key");
        genesis = IGenesisVoting(genesis_); opensAt = opensAt_; closesAt = opensAt_ + 24 hours;
        teamReserveWallet = team_; hofOwner = owner_; backendSigner = signer_;
        encryptionPublicKey = publicKey_; keyId = keccak256(publicKey_);
    }
    modifier voting() {
        require(block.timestamp >= opensAt && block.timestamp < closesAt, "voting closed");
        require(msg.sender != hofOwner && msg.sender != backendSigner, "owner cannot vote");
        require(msg.sender != teamReserveWallet, "Team Reserve cannot vote"); _;
    }
    function vote(bytes32 commitment, bytes calldata ciphertext, uint256 deadline, bytes calldata authorization, uint256[] calldata tokenIds) external voting {
        require(ballotIndexPlusOne[msg.sender] == 0, "wallet already voted");
        require(commitment != bytes32(0), "empty commitment");
        require(ciphertext.length == CIPHERTEXT_LENGTH && ciphertext[0] == 0x01, "bad ciphertext");
        require(block.timestamp <= deadline && deadline <= closesAt, "admission expired");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(ADMISSION_TYPEHASH, msg.sender, commitment, keccak256(ciphertext), deadline)));
        require(ECDSA.recover(digest, authorization) == backendSigner, "invalid admission");
        uint256 vp = _consume(tokenIds);
        uint256 index = ballots.length;
        ballots.push(Ballot(msg.sender, commitment, ciphertext, vp));
        ballotIndexPlusOne[msg.sender] = index + 1;
        recordsHash = keccak256(abi.encode(recordsHash, uint8(1), index, msg.sender, commitment, keccak256(ciphertext), vp));
        emit BallotAccepted(index, msg.sender, commitment, keccak256(ciphertext), vp);
    }
    function addVotingPower(uint256[] calldata tokenIds) external voting {
        uint256 entry = ballotIndexPlusOne[msg.sender]; require(entry != 0, "no wallet pick");
        uint256 vp = _consume(tokenIds); ballots[entry - 1].vp += vp;
        recordsHash = keccak256(abi.encode(recordsHash, uint8(2), entry - 1, vp, ballots[entry - 1].vp));
        emit VotingPowerAdded(entry - 1, vp);
    }
    function _consume(uint256[] calldata ids) private returns (uint256 vp) {
        require(ids.length > 0, "no tokens");
        for (uint256 i; i < ids.length; ++i) {
            require(!tokenUsed[ids[i]], "token already used");
            require(genesis.ownerOf(ids[i]) == msg.sender, "not token owner");
            uint256 power = genesis.votingPowerOf(ids[i]); require(power > 0, "token not voting eligible");
            tokenUsed[ids[i]] = true; vp += power;
        }
        totalVP += vp;
    }
    function ballotCount() external view returns (uint256) { return ballots.length; }
    function ballotWalletAt(uint256 index) external view returns (address) { return ballots[index].wallet; }
    function ballotAt(uint256 index) external view returns (Ballot memory) { return ballots[index]; }
    function freeze() public {
        require(block.timestamp >= closesAt, "voting not closed");
        if (frozen) return;
        frozen = true; frozenRecordsHash = recordsHash; acceptedBallotCount = ballots.length;
        emit VotingClosed(recordsHash, ballots.length, totalVP);
    }
    function proposeResult(uint256[22] calldata horseTotals, bytes32 root, bytes calldata signature) external {
        freeze(); require(!proposed, "result already proposed");
        require(root != bytes32(0), "empty score root");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH, frozenRecordsHash, acceptedBallotCount, totalVP, keccak256(abi.encode(horseTotals)), root)));
        require(ECDSA.recover(digest, signature) == backendSigner, "invalid result signer");
        uint256 sum;
        for (uint8 i; i < 22; ++i) { sum += horseTotals[i]; ranked[i] = i + 1; }
        require(sum == totalVP, "VP mismatch");
        totals = horseTotals;
        for (uint256 i = 1; i < 22; ++i) {
            uint8 h = ranked[i]; uint256 j = i;
            while (j > 0 && (totals[h - 1] > totals[ranked[j - 1] - 1] || (totals[h - 1] == totals[ranked[j - 1] - 1] && h < ranked[j - 1]))) {
                ranked[j] = ranked[j - 1]; --j;
            }
            ranked[j] = h;
        }
        scoresRoot = root; proposed = true; emit ResultProposed(root);
    }
    function scoreLeaf(uint256 index, address wallet, uint8 points) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(block.chainid, address(this), index, wallet, points))));
    }
    function prepareScores(uint256 start, uint8[] calldata points, bytes32[][] calldata proofs) external {
        require(proposed && !finalized, "no pending result");
        require(start == processedCount, "wrong cursor");
        require(points.length > 0 && points.length <= MAX_BATCH && points.length == proofs.length, "bad batch");
        require(start + points.length <= acceptedBallotCount, "too many scores");
        for (uint256 i; i < points.length; ++i) {
            uint8 p = points[i]; require(p == 0 || p == 1 || p == 2 || p == 4 || p == 6 || p == 8 || p == 10 || p == 12 || p == 15 || p == 18 || p == 25, "invalid points");
            address wallet = ballots[start + i].wallet;
            require(MerkleProof.verifyCalldata(proofs[i], scoresRoot, scoreLeaf(start + i, wallet, p)), "invalid score proof");
            preparedPoints[wallet] = p;
        }
        processedCount += points.length; emit ScoresPrepared(start, processedCount);
    }
    function finalize() external {
        require(proposed && !finalized, "no pending result");
        require(processedCount == acceptedBallotCount, "incomplete result");
        finalized = true; revealedAt = block.timestamp; emit RaceFinalized(block.timestamp);
    }
    function pointsOf(address wallet) external view returns (uint8) { return finalized ? preparedPoints[wallet] : 0; }
    function ranking() external view returns (uint8[22] memory) { require(finalized, "race not finalized"); return ranked; }
    function horseVP() external view returns (uint256[22] memory) { require(finalized, "race not finalized"); return totals; }
    function pointsForPosition(uint8 position) public pure returns (uint8) {
        require(position >= 1 && position <= 22, "invalid position");
        uint8[10] memory scores = [25,18,15,12,10,8,6,4,2,1]; return position <= 10 ? scores[position - 1] : 0;
    }
    function horseRacePoints() external view returns (uint8[22] memory points) {
        require(finalized, "race not finalized");
        for (uint8 i; i < 22; ++i) points[ranked[i] - 1] = pointsForPosition(i + 1);
    }
}
