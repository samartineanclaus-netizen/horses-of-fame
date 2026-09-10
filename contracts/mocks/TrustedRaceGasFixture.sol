// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "../HOFTrustedRace.sol";

/// @dev GAS TEST ONLY: synthetic finalized scores, not a voting implementation.
/// Never register this fixture outside a local test chain.
contract TrustedRaceGasFixture {
    address public immutable genesis;
    address public immutable hofOwner;
    address public immutable backendSigner;
    address public immutable teamReserveWallet;
    uint256 public immutable opensAt;
    uint256 public immutable acceptedBallotCount;
    constructor(address g,address o,address b,address t,uint256 start,uint256 count) {
        genesis=g;hofOwner=o;backendSigner=b;teamReserveWallet=t;
        opensAt=start;acceptedBallotCount=count;
    }
    function finalized() external view returns(bool) { return block.timestamp >= opensAt + 1 days; }
    function revealedAt() external view returns(uint256) { return opensAt + 1 days; }
    function ballotWalletAt(uint256 index) external view returns(address) {
        require(index < acceptedBallotCount); return address(uint160(100000+index));
    }
    function ballotAt(uint256 index) external view returns(HOFTrustedRace.Ballot memory) {
        require(index < acceptedBallotCount);
        return HOFTrustedRace.Ballot(address(uint160(100000+index)),bytes32(0),hex"",1);
    }
    function pointsOf(address wallet) external view virtual returns(uint8) {
        uint256 value = uint160(wallet);
        return value >= 100000 && value < 100000 + acceptedBallotCount ? 25 : 0;
    }
}

/// @dev TEST ONLY: creates different reachable season score buckets for gas testing.
contract TrustedVariedScoreGasFixture is TrustedRaceGasFixture {
    uint8[25] private scores;
    constructor(address g,address o,address b,address t,uint256 start,uint8[25] memory values)
        TrustedRaceGasFixture(g,o,b,t,start,25) { scores=values; }
    function pointsOf(address wallet) external view override returns(uint8) {
        uint256 value=uint160(wallet);
        return value>=100000 && value<100025 ? scores[value-100000] : 0;
    }
}
