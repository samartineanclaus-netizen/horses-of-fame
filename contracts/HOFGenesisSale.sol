// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title HOFGenesisSale
/// @notice V7 public-sale escrow for 2,000 Genesis reservations at 30 payment tokens each.
/// @dev Payment token is configurable at deployment (intended: verified USDC/stablecoin).
///      Funds cannot leave escrow before sell-out. If the deadline passes without
///      sell-out, buyers claim their payments back on-chain.
contract HOFGenesisSale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PUBLIC_SUPPLY = 2_000;
    uint256 public constant PRICE = 30 * 1e6; // USDC-style 6 decimals
    uint256 public constant PRIZE_POOL_AMOUNT = 48_000 * 1e6;
    uint256 public constant AUDIT_AMOUNT = 2_000 * 1e6;
    uint256 public constant FOUNDER_AMOUNT = 10_000 * 1e6;
    uint256 public constant FULL_SALE_AMOUNT = 60_000 * 1e6;

    IERC20 public immutable paymentToken;
    uint256 public immutable saleDeadline;
    address public immutable prizePoolTreasury;
    address public immutable auditWallet;
    address public immutable founderWallet;

    uint256 public sold;
    bool public proceedsDistributed;

    mapping(address => uint256) public purchased;
    mapping(address => uint256) public refundablePaid;

    event Purchased(address indexed buyer, uint256 quantity, uint256 paid);
    event Refunded(address indexed buyer, uint256 quantity, uint256 amount);
    event SaleSucceeded(uint256 sold, uint256 proceeds);
    event ProceedsDistributed(
        address indexed prizePoolTreasury,
        uint256 prizePoolAmount,
        address indexed auditWallet,
        uint256 auditAmount,
        address indexed founderWallet,
        uint256 founderAmount
    );

    constructor(
        address paymentToken_,
        uint256 saleDeadline_,
        address prizePoolTreasury_,
        address auditWallet_,
        address founderWallet_
    ) Ownable(msg.sender) {
        require(paymentToken_ != address(0), "Payment token is zero");
        require(saleDeadline_ > block.timestamp, "Deadline must be future");
        require(prizePoolTreasury_ != address(0), "Prize treasury is zero");
        require(auditWallet_ != address(0), "Audit wallet is zero");
        require(founderWallet_ != address(0), "Founder wallet is zero");
        require(prizePoolTreasury_ != founderWallet_, "Prize treasury cannot be founder");

        paymentToken = IERC20(paymentToken_);
        saleDeadline = saleDeadline_;
        prizePoolTreasury = prizePoolTreasury_;
        auditWallet = auditWallet_;
        founderWallet = founderWallet_;
    }

    function buy(uint256 quantity) external nonReentrant {
        require(block.timestamp < saleDeadline, "Sale ended");
        require(quantity > 0, "Quantity is zero");
        require(sold + quantity <= PUBLIC_SUPPLY, "Public supply exceeded");

        uint256 amount = PRICE * quantity;
        sold += quantity;
        purchased[msg.sender] += quantity;
        refundablePaid[msg.sender] += amount;

        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Purchased(msg.sender, quantity, amount);

        if (sold == PUBLIC_SUPPLY) {
            emit SaleSucceeded(sold, FULL_SALE_AMOUNT);
        }
    }

    function saleSuccessful() public view returns (bool) {
        return sold == PUBLIC_SUPPLY;
    }

    function refundsEnabled() public view returns (bool) {
        return block.timestamp >= saleDeadline && !saleSuccessful();
    }

    function claimRefund() external nonReentrant {
        require(refundsEnabled(), "Refunds not enabled");

        uint256 amount = refundablePaid[msg.sender];
        uint256 quantity = purchased[msg.sender];
        require(amount > 0, "Nothing to refund");

        refundablePaid[msg.sender] = 0;
        purchased[msg.sender] = 0;

        paymentToken.safeTransfer(msg.sender, amount);
        emit Refunded(msg.sender, quantity, amount);
    }

    /// @notice Distributes proceeds only after all 2,000 public reservations sell.
    /// @dev Anyone may trigger deterministic distribution; owner cannot redirect it.
    function distributeProceeds() external nonReentrant {
        require(saleSuccessful(), "Sale not successful");
        require(!proceedsDistributed, "Already distributed");
        require(paymentToken.balanceOf(address(this)) >= FULL_SALE_AMOUNT, "Escrow underfunded");

        proceedsDistributed = true;

        paymentToken.safeTransfer(prizePoolTreasury, PRIZE_POOL_AMOUNT);
        paymentToken.safeTransfer(auditWallet, AUDIT_AMOUNT);
        paymentToken.safeTransfer(founderWallet, FOUNDER_AMOUNT);

        emit ProceedsDistributed(
            prizePoolTreasury,
            PRIZE_POOL_AMOUNT,
            auditWallet,
            AUDIT_AMOUNT,
            founderWallet,
            FOUNDER_AMOUNT
        );
    }

    /// @notice Quantity reserved by a buyer. NFT delivery/randomization is intentionally
    ///         separated until the final delayed-reveal design is locked and audited.
    function claimableQuantity(address buyer) external view returns (uint256) {
        if (!saleSuccessful()) return 0;
        return purchased[buyer];
    }
}
