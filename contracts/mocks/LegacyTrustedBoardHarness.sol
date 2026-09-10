// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "../HOFTrustedLeaderboards.sol";
/// @dev TEST ONLY: preserves legacy race/scoring regression fixtures, never a deployment artifact.
contract LegacyTrustedBoardHarness is HOFTrustedLeaderboards {
    constructor(address g,address o,address s,address t) HOFTrustedLeaderboards(g,o,s,t) {}
    function _requireCanonicalRace(address) internal pure override {}
}
