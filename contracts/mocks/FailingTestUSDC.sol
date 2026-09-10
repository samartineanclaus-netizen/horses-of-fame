// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "../MockUSDC.sol";
/// @dev Fault injection only; never a deployment candidate.
contract FailingTestUSDC is MockUSDC {
    bool public failTransfers;
    function setFailure(bool value) external { failTransfers = value; }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (failTransfers) return false;
        return super.transfer(to, value);
    }
    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        if (failTransfers) return false;
        return super.transferFrom(from, to, value);
    }
}
