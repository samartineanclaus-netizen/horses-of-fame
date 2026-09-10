// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "./HOFRaceVoting.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @notice Owner-trusted tally, NOT a proof of correct decryption/counting.
/// No plaintext choices, salts or decryption keys are submitted to this contract.
contract HOFRelayedRace is EIP712, ReentrancyGuard {
    uint256 public constant MAX_BATCH = 25;
    uint256 public constant CIPHERTEXT_LENGTH = 446; // v1 + RSA3072(384) + IV(12) + encrypted payload(49)
    bytes32 public constant RESULT_TYPEHASH = keccak256("Result(bytes32 recordsHash,uint256 count,uint256 totalVP,bytes32 totalsHash,bytes32 scoresRoot)");
    IGenesisVoting public immutable genesis;
    address public immutable hofOwner;
    address public immutable backendSigner;
    address public immutable teamReserveWallet;
    uint256 public immutable opensAt;
    uint256 public immutable closesAt;
    bytes public encryptionPublicKey; // SPKI; pinned before opening
    bytes32 public immutable keyId;
    struct Ballot { address wallet; uint96 vp; bytes32 commitment; }
    struct PublicBallot { address wallet; bytes32 commitment; bytes ciphertext; uint256 vp; }
    Ballot[] private ballots;
    mapping(address => uint256) public ballotIndexPlusOne;
    mapping(uint256 => uint256) private usedWords;
    mapping(address => uint256) public nonces;
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
    struct Intent {
        address voter; address race; uint256 nonce; uint256 deadline;
        bytes32 commitment; bytes32 ciphertextHash; bytes32 tokenIdsHash;
        uint256 vp; bool topUp;
    }
    struct Packet { Intent intent; uint256[] tokenIds; bytes ciphertext; bytes signature; bytes admission; }
    bytes32 public constant INTENT_TYPEHASH = keccak256("VoteIntent(address voter,address race,uint256 nonce,uint256 deadline,bytes32 commitment,bytes32 ciphertextHash,bytes32 tokenIdsHash,uint256 vp,bool topUp)");
    event EncryptedVote(uint256 indexed index, address indexed wallet, bytes ciphertext);
    event IntentIncluded(address indexed wallet, uint256 indexed nonce, bytes32 indexed digest, uint256 index);
    function intentDigest(Intent calldata v) public view returns(bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(INTENT_TYPEHASH, v)));
    }
    function tokenUsed(uint256 id) public view returns(bool) { return usedWords[id >> 8] & (uint256(1) << (id & 255)) != 0; }
    function submitSigned(Packet calldata packet) external nonReentrant { _submit(packet); }
    function submitBatch(Packet[] calldata packets) external nonReentrant {
        require(packets.length > 0 && packets.length <= MAX_BATCH, "bad batch");
        uint256 uses;
        for(uint256 i; i < packets.length; ++i) uses += packets[i].tokenIds.length;
        require(uses <= 100, "too many token uses");
        for(uint256 i; i < packets.length; ++i) _submit(packets[i]);
    }
    function _submit(Packet calldata packet) private {
        Intent calldata v = packet.intent;
        require(block.timestamp >= opensAt && block.timestamp < closesAt, "voting closed");
        require(v.voter != hofOwner && v.voter != backendSigner, "owner cannot vote");
        require(v.voter != teamReserveWallet, "Team Reserve cannot vote");
        require(v.voter != address(0) && v.race == address(this), "wrong race or wallet");
        require(block.timestamp <= v.deadline && v.deadline <= closesAt, "intent expired");
        require(v.nonce == nonces[v.voter], "wrong nonce");
        require(v.commitment != bytes32(0), "empty commitment");
        require(packet.ciphertext.length == CIPHERTEXT_LENGTH && packet.ciphertext[0] == 0x01, "bad ciphertext");
        require(keccak256(packet.ciphertext) == v.ciphertextHash && keccak256(abi.encode(packet.tokenIds)) == v.tokenIdsHash, "modified packet");
        bytes32 digest = intentDigest(v);
        require(SignatureChecker.isValidSignatureNow(v.voter, digest, packet.signature), "invalid wallet signature");
        require(ECDSA.recover(digest, packet.admission) == backendSigner, "invalid admission");
        uint256 entry = ballotIndexPlusOne[v.voter];
        if(v.topUp) require(entry != 0 && ballots[entry-1].commitment == v.commitment, "wrong topup");
        else require(entry == 0, "wallet already voted");
        nonces[v.voter]++;
        uint256 vp = _consume(v.voter, packet.tokenIds);
        require(vp == v.vp && vp <= type(uint96).max, "VP mismatch");
        uint256 index;
        if(v.topUp) {
            index = entry-1; ballots[index].vp += uint96(vp);
            recordsHash = keccak256(abi.encode(recordsHash, uint8(2), index, vp, uint256(ballots[index].vp)));
            emit VotingPowerAdded(index, vp);
        } else {
            index = ballots.length; ballots.push(Ballot(v.voter, uint96(vp), v.commitment));
            ballotIndexPlusOne[v.voter] = index+1;
            recordsHash = keccak256(abi.encode(recordsHash, uint8(1), index, v.voter, v.commitment, v.ciphertextHash, vp));
            emit BallotAccepted(index, v.voter, v.commitment, v.ciphertextHash, vp);
            emit EncryptedVote(index, v.voter, packet.ciphertext);
        }
        emit IntentIncluded(v.voter, v.nonce, digest, index);
    }
    function _consume(address voter, uint256[] calldata ids) private returns(uint256 vp) {
        require(ids.length > 0, "no tokens");
        for(uint256 i; i < ids.length; ++i) {
            uint256 id = ids[i];
            require(!tokenUsed(id), "token already used");
            require(genesis.ownerOf(id) == voter, "not token owner");
            uint256 power = genesis.votingPowerOf(id); require(power > 0, "token not voting eligible");
            usedWords[id >> 8] |= uint256(1) << (id & 255); vp += power;
        }
        totalVP += vp;
    }
    function ballotCount() external view returns (uint256) { return ballots.length; }
    function ballotWalletAt(uint256 index) external view returns (address) { return ballots[index].wallet; }
    function ballotAt(uint256 index) external view returns (PublicBallot memory) { Ballot memory b = ballots[index]; return PublicBallot(b.wallet,b.commitment,"",b.vp); }
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
