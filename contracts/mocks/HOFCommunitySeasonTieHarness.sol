// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../HOFCommunitySeason.sol";

/// @dev Test-only harness exposing the internal Community tie-break path.
contract HOFCommunitySeasonTieHarness is HOFCommunitySeason {
    function winsCastingTieBreak(address walletA, address walletB) external view returns (bool) {
        return _winsCastingTieBreak(walletA, walletB);
    }
}
