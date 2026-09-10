// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only USDC mock. Uses 6 decimals to match USDC accounting.
contract MockUSDC is ERC20 {
    constructor() ERC20("TEST ONLY / NO VALUE - MockUSDC", "TEST-USDC") {
        require(block.chainid == 31337 || block.chainid == 46630, "MockUSDC test networks only");
    }

    function testOnly() external pure returns (bool) { return true; }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
