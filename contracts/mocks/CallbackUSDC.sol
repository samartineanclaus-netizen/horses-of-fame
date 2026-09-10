// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev Adversarial payment-token fixture; never deploy as production USDC.
contract CallbackUSDC is ERC20 {
    address public target;
    bytes public payload;
    bool public failTransfer;
    bool public callbackSucceeded;
    bytes public callbackResult;
    constructor() ERC20("Test callback USDC", "TEST") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function configure(address target_, bytes calldata payload_, bool fail_) external {
        target = target_; payload = payload_; failTransfer = fail_;
    }
    function execute(address target_, bytes calldata payload_) external {
        (bool ok, bytes memory result) = target_.call(payload_);
        if (!ok) assembly { revert(add(result, 32), mload(result)) }
    }
    function transfer(address to, uint256 value) public override returns (bool) {
        if (target != address(0)) (callbackSucceeded, callbackResult) = target.call(payload);
        if (failTransfer) return false;
        return super.transfer(to, value);
    }
}
