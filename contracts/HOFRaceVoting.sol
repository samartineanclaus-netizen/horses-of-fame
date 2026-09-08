// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IGenesisVoting {
    function ownerOf(uint256 tokenId) external view returns (address);
    function votingPowerOf(uint256 tokenId) external view returns (uint256);
}

/// @notice Minimal V7 voting core for one race.
/// One wallet submits one hidden commitment. All supplied eligible Genesis NFTs
/// combine their VP behind that one pick and cannot be reused in this race.
contract HOFRaceVoting is Ownable {
    uint256 public constant HOF_COMPETITORS = 22;
    uint256 public constant VOTING_WINDOW = 24 hours;

    IGenesisVoting public immutable genesis;
    uint256 public immutable opensAt;
    uint256 public immutable closesAt;

    mapping(address => bytes32) public commitmentOf;
    mapping(address => uint256) public committedVP;
    mapping(uint256 => bool) public tokenUsed;

    event VoteCommitted(address indexed voter, bytes32 indexed commitment, uint256 votingPower);

    constructor(address genesis_, uint256 opensAt_) Ownable(msg.sender) {
        require(genesis_ != address(0), "zero genesis");
        require(opensAt_ >= block.timestamp, "bad opening");
        genesis = IGenesisVoting(genesis_);
        opensAt = opensAt_;
        closesAt = opensAt_ + VOTING_WINDOW;
    }

    function commitVote(bytes32 commitment, uint256[] calldata tokenIds) external {
        require(block.timestamp >= opensAt && block.timestamp < closesAt, "voting closed");
        require(commitment != bytes32(0), "empty commitment");
        require(commitmentOf[msg.sender] == bytes32(0), "wallet already voted");
        require(tokenIds.length > 0, "no tokens");

        uint256 totalVP;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(!tokenUsed[tokenId], "token already used");
            require(genesis.ownerOf(tokenId) == msg.sender, "not token owner");
            uint256 vp = genesis.votingPowerOf(tokenId);
            require(vp > 0, "token not voting eligible");
            tokenUsed[tokenId] = true;
            totalVP += vp;
        }

        commitmentOf[msg.sender] = commitment;
        committedVP[msg.sender] = totalVP;
        emit VoteCommitted(msg.sender, commitment, totalVP);
    }

    /// @dev Client builds commitment from race pick + private salt.
    function makeCommitment(uint8 horseNumber, bytes32 salt) external pure returns (bytes32) {
        require(horseNumber >= 1 && horseNumber <= HOF_COMPETITORS, "invalid horse");
        return keccak256(abi.encode(horseNumber, salt));
    }

    function votingOpen() external view returns (bool) {
        return block.timestamp >= opensAt && block.timestamp < closesAt;
    }
}
