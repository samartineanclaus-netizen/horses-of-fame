// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MockCommunitySeasonTop3 {
    mapping(uint8 => address[3]) private top3;
    mapping(uint8 => bool) private finalized;

    function setTop3(uint8 season, address first, address second, address third) external {
        top3[season] = [first, second, third];
        finalized[season] = true;
    }

    function getSeasonTop3(uint8 season) external view returns (address[3] memory) {
        require(finalized[season], "season not finalized");
        return top3[season];
    }
}
