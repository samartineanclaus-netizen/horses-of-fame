// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MockV7SaleSuccess {
    bool public saleSuccessful;

    function setSaleSuccessful(bool successful) external {
        saleSuccessful = successful;
    }
}
