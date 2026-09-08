// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IGenesisHorsesSaleMint {
    function saleMint(address to, uint256 quantity) external;
    function refundBurn(address holder, uint256[] calldata tokenIds) external;
}

contract HOFGenesisSale is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PUBLIC_SUPPLY = 2000;
    uint256 public constant MINT_PRICE = 30 * 1e6;
    uint256 public constant PRIZE_POOL_AMOUNT = 48_000 * 1e6;
    uint256 public constant AUDIT_AMOUNT = 2_000 * 1e6;
    uint256 public constant FOUNDER_AMOUNT = 10_000 * 1e6;

    IERC20 public immutable paymentToken;
    IGenesisHorsesSaleMint public immutable genesis;
    uint256 public immutable deadline;
    address public immutable prizePoolTreasury;
    address public immutable auditWallet;
    address public immutable founderWallet;

    uint256 public sold;
    bool public distributed;
    mapping(address => uint256) public paidBy;

    event Minted(address indexed buyer, uint256 quantity, uint256 paid);
    event Refunded(address indexed buyer, uint256 amount, uint256 quantity);
    event ProceedsDistributed(address prizePool, address audit, address founder);

    constructor(address paymentToken_, address genesis_, uint256 deadline_, address prizePoolTreasury_, address auditWallet_, address founderWallet_) Ownable(msg.sender) {
        require(paymentToken_ != address(0) && genesis_ != address(0), "zero contract");
        require(deadline_ > block.timestamp, "bad deadline");
        require(prizePoolTreasury_ != address(0) && auditWallet_ != address(0) && founderWallet_ != address(0), "zero wallet");
        require(prizePoolTreasury_ != founderWallet_, "prize pool cannot be founder");
        paymentToken = IERC20(paymentToken_);
        genesis = IGenesisHorsesSaleMint(genesis_);
        deadline = deadline_;
        prizePoolTreasury = prizePoolTreasury_;
        auditWallet = auditWallet_;
        founderWallet = founderWallet_;
    }

    function mint(uint256 quantity) external whenNotPaused nonReentrant {
        require(block.timestamp < deadline, "sale ended");
        require(quantity > 0, "zero quantity");
        require(sold + quantity <= PUBLIC_SUPPLY, "public supply exceeded");
        uint256 cost = quantity * MINT_PRICE;
        sold += quantity;
        paidBy[msg.sender] += cost;
        paymentToken.safeTransferFrom(msg.sender, address(this), cost);
        genesis.saleMint(msg.sender, quantity);
        emit Minted(msg.sender, quantity, cost);
    }

    function saleSuccessful() public view returns (bool) { return sold == PUBLIC_SUPPLY; }
    function refundsEnabled() public view returns (bool) { return block.timestamp >= deadline && !saleSuccessful(); }

    function refund(uint256[] calldata tokenIds) external nonReentrant {
        require(refundsEnabled(), "refunds not enabled");
        require(tokenIds.length > 0, "no tokens");
        uint256 amount = tokenIds.length * MINT_PRICE;
        require(paidBy[msg.sender] >= amount, "refund exceeds paid amount");

        // Effects first. Any failure in burn or transfer reverts the whole transaction.
        paidBy[msg.sender] -= amount;
        genesis.refundBurn(msg.sender, tokenIds);
        paymentToken.safeTransfer(msg.sender, amount);

        emit Refunded(msg.sender, amount, tokenIds.length);
    }

    function distributeProceeds() external nonReentrant {
        require(saleSuccessful(), "sale not successful");
        require(!distributed, "already distributed");
        distributed = true;
        paymentToken.safeTransfer(prizePoolTreasury, PRIZE_POOL_AMOUNT);
        paymentToken.safeTransfer(auditWallet, AUDIT_AMOUNT);
        paymentToken.safeTransfer(founderWallet, FOUNDER_AMOUNT);
        emit ProceedsDistributed(prizePoolTreasury, auditWallet, founderWallet);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
