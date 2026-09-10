// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
contract SponsoredSignatureWallet {
    address public immutable signer;
    address public callback;
    bytes public callbackData;
    constructor(address signer_) { signer=signer_; }
    function setCallback(address target,bytes calldata data) external {require(msg.sender==signer,"unauthorized");callback=target;callbackData=data;}
    function isValidSignature(bytes32 digest,bytes calldata signature) external view returns(bytes4) {
        if(callback!=address(0)) { (bool ok,)=callback.staticcall(callbackData);require(!ok,"unexpected successful reentry"); }
        return ECDSA.recover(digest,signature)==signer?bytes4(0x1626ba7e):bytes4(0xffffffff);
    }
}
