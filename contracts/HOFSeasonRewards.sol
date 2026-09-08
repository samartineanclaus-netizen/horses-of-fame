// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Chapter I V7 season-reward treasury.
/// V7 fixes $8,000 USDC per season: $4,000 Community + $4,000 HOF.
/// Community rewards are 2,500 / 1,000 / 500 USDC.
/// HOF beneficiary mechanics are intentionally NOT implemented here because
/// V7 explicitly leaves the final HOF beneficiary/ownership mechanism to finalize.
contract HOFSeasonRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant CHAPTER_SEASONS = 6;
    uint256 public constant COMMUNITY_FIRST = 2_500 * 1e6;
    uint256 public constant COMMUNITY_SECOND = 1_000 * 1e6;
    uint256 public constant COMMUNITY_THIRD = 500 * 1e6;
    uint256 public constant COMMUNITY_PER_SEASON = 4_000 * 1e6;
    uint256 public constant HOF_PER_SEASON = 4_000 * 1e6;
    uint256 public constant TOTAL_PER_SEASON = 8_000 * 1e6;
    uint256 public constant CHAPTER_PRIZE_POOL = 48_000 * 1e6;

    IERC20 public immutable usdc;

    mapping(uint8 => bool) public communitySeasonPaid;

    event CommunitySeasonRewardsPaid(
        uint8 indexed season,
        address indexed first,
        address indexed second,
        address third
    );

    constructor(address usdc_) Ownable(msg.sender) {
        require(usdc_ != address(0), "zero USDC");
        usdc = IERC20(usdc_);
    }

    /// @notice Pays only the V7-locked Community Top 3 amounts.
    /// Ranking validation remains external until the Community leaderboard
    /// exposes a finalized deterministic Top 3 compatible with the V7 tie-break.
    function payCommunitySeason(
        uint8 season,
        address first,
        address second,
        address third
    ) external onlyOwner nonReentrant {
        require(season >= 1 && season <= CHAPTER_SEASONS, "bad season");
        require(!communitySeasonPaid[season], "community season paid");
        require(first != address(0) && second != address(0) && third != address(0), "zero winner");
        require(first != second && first != third && second != third, "duplicate winner");
        require(usdc.balanceOf(address(this)) >= COMMUNITY_PER_SEASON, "insufficient rewards");

        communitySeasonPaid[season] = true;
        usdc.safeTransfer(first, COMMUNITY_FIRST);
        usdc.safeTransfer(second, COMMUNITY_SECOND);
        usdc.safeTransfer(third, COMMUNITY_THIRD);

        emit CommunitySeasonRewardsPaid(season, first, second, third);
    }

    /// @notice V7 reserves a second $4,000 prize set for the HOF side.
    /// No payout function is provided until the V7 HOF beneficiary mechanism
    /// is finalized; this prevents inventing a beneficiary rule.
    function hofSeasonAllocation() external pure returns (uint256) {
        return HOF_PER_SEASON;
    }
}
