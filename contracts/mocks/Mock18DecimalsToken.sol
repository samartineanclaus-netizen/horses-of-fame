// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token used to verify the V7 sale rejects non-USDC decimal accounting.
contract Mock18DecimalsToken is ERC20 {
    constructor() ERC20("Mock 18 Decimals", "M18") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
