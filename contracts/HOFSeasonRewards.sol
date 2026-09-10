// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICommunitySeasonTop3 {
    function getSeasonTop3(uint8 seasonNumber) external view returns (address[3] memory);
}

/// @notice Chapter I V7 prize-pool treasury.
/// Exactly $48,000 USDC funds six seasons: $4,000 Community + $4,000 HOF each.
/// Community rewards are 2,500 / 1,000 / 500 USDC.
/// HOF beneficiary mechanics are intentionally NOT implemented because V7
/// leaves the final HOF beneficiary/ownership mechanism to finalize.
contract HOFSeasonRewards is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant CHAPTER_SEASONS = 6;
    uint256 public constant COMMUNITY_FIRST = 2_500 * 1e6;
    uint256 public constant COMMUNITY_SECOND = 1_000 * 1e6;
    uint256 public constant COMMUNITY_THIRD = 500 * 1e6;
    uint256 public constant COMMUNITY_PER_SEASON = 4_000 * 1e6;
    uint256 public constant HOF_PER_SEASON = 4_000 * 1e6;
    uint256 public constant TOTAL_PER_SEASON = 8_000 * 1e6;
    uint256 public constant COMMUNITY_CHAPTER_ALLOCATION = 24_000 * 1e6;
    uint256 public constant HOF_CHAPTER_ALLOCATION = 24_000 * 1e6;
    uint256 public constant CHAPTER_PRIZE_POOL = 48_000 * 1e6;

    IERC20 public immutable usdc;
    ICommunitySeasonTop3 public immutable communitySeason;

    // True after processing a season, including a zero-winner rollover.
    mapping(uint8 => bool) public communitySeasonPaid;
    uint256 public communityPaid;
    uint256 public communityRolloverToChapter2;
    mapping(uint8 => uint256) public communitySeasonRollover;

    event CommunityRolloverRecorded(uint8 indexed season, uint256 amount);

    event CommunitySeasonRewardsPaid(
        uint8 indexed season,
        address indexed first,
        address indexed second,
        address third
    );

    constructor(address usdc_, address communitySeason_) Ownable(msg.sender) {
        require(usdc_ != address(0), "zero USDC");
        require(communitySeason_ != address(0), "zero Community season");
        usdc = IERC20(usdc_);
        communitySeason = ICommunitySeasonTop3(communitySeason_);
    }

    /// @notice Pays only V7 Community allocation. The cumulative cap ensures
    /// Community can never consume the $24,000 Chapter I HOF allocation.
    function payCommunitySeason(uint8 season) external onlyOwner nonReentrant {
        require(season >= 1 && season <= CHAPTER_SEASONS, "bad season");
        require(!communitySeasonPaid[season], "community season paid");
        require(communityPaid + communityRolloverToChapter2 + COMMUNITY_PER_SEASON <= COMMUNITY_CHAPTER_ALLOCATION, "Community allocation exhausted");

        address[3] memory winners = communitySeason.getSeasonTop3(season);
        uint256[3] memory amounts = [COMMUNITY_FIRST, COMMUNITY_SECOND, COMMUNITY_THIRD];
        uint256 payout;
        for (uint256 i = 0; i < 3; i++) {
            if (winners[i] == address(0)) continue;
            for (uint256 j = 0; j < i; j++) require(winners[i] != winners[j], "duplicate winner");
            payout += amounts[i];
        }
        // Previously recorded rollover stays backed and cannot fund later payouts.
        require(usdc.balanceOf(address(this)) >= communityRolloverToChapter2 + COMMUNITY_PER_SEASON, "insufficient rewards");
        uint256 rollover = COMMUNITY_PER_SEASON - payout;
        communitySeasonPaid[season] = true;
        communityPaid += payout;
        communitySeasonRollover[season] = rollover;
        communityRolloverToChapter2 += rollover;
        for (uint256 i = 0; i < 3; i++) {
            if (winners[i] != address(0)) usdc.safeTransfer(winners[i], amounts[i]);
        }
        emit CommunityRolloverRecorded(season, rollover);

        emit CommunitySeasonRewardsPaid(season, winners[0], winners[1], winners[2]);
    }

    /// @notice Unprocessed Chapter I budget, excluding paid and rolled amounts.
    function communityRemaining() external view returns (uint256) {
        return COMMUNITY_CHAPTER_ALLOCATION - communityPaid - communityRolloverToChapter2;
    }

    /// @notice Accounting reservation for the HOF half of the V7 prize pool.
    /// There is deliberately no HOF transfer function and no generic withdrawal.
    function hofReserved() public pure returns (uint256) {
        return HOF_CHAPTER_ALLOCATION;
    }

    function hofSeasonAllocation() external pure returns (uint256) {
        return HOF_PER_SEASON;
    }
}
