// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
interface IMintSale { function mint(uint256 quantity) external; }
/// @dev Test-only adversarial recipient; not part of deployment.
contract MintReceiver is IERC721Receiver {
    IMintSale public sale;
    uint256 public received;
    uint256 public rejectAt;
    bool public tryReenter;
    bool public reentered;
    function buy(address sale_, address token, uint256 quantity, uint256 rejectAt_, bool attack) external {
        sale = IMintSale(sale_); rejectAt = rejectAt_; tryReenter = attack;
        IERC20(token).approve(sale_, type(uint256).max);
        sale.mint(quantity);
    }
    function onERC721Received(address,address,uint256,bytes calldata) external returns(bytes4) {
        ++received;
        require(received != rejectAt, "recipient rejected");
        if (tryReenter) { (reentered,) = address(sale).call(abi.encodeCall(IMintSale.mint,(1))); }
        return IERC721Receiver.onERC721Received.selector;
    }
}
