// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract GenesisHorses is ERC721Enumerable, Ownable, Pausable {
    using Strings for uint256;
    uint256 public constant MAX_SUPPLY = 2222;
    uint256 public constant HALL_OF_FAME_SUPPLY = 22;
    uint256 public constant VOTING_SUPPLY = 2200;
    uint256 public constant LEGENDARY_SUPPLY = 190;
    uint256 public constant EPIC_SUPPLY = 240;
    uint256 public constant RARE_SUPPLY = 320;
    uint256 public constant UNCOMMON_SUPPLY = 480;
    uint256 public constant COMMON_SUPPLY = 970;
    uint256 public nextTokenId = 1;
    uint256 public testMintPrice = 0.001 ether;
    address public saleContract;
    mapping(uint256 => bool) public publicSaleToken;
    string private _baseTokenURI;
    string public placeholderURI;
    bool public revealed;
    enum Rarity { Unassigned, Common, Uncommon, Rare, Epic, Legendary, HallOfFame }
    event TestMint(address indexed minter, uint256 quantity, uint256 value);
    event CollectionRevealed(string baseURI);
    event PlaceholderURIUpdated(string placeholderURI);
    event TestMintPriceUpdated(uint256 newPrice);
    event SaleContractSet(address indexed saleContract);

    constructor(string memory initialPlaceholderURI) ERC721("Horses of Fame - Genesis", "HOFGEN") Ownable(msg.sender) { placeholderURI = initialPlaceholderURI; }

    function ownerMint(address to, uint256 quantity) external onlyOwner whenNotPaused { _mintSequential(to, quantity, false); }

    function setSaleContract(address saleContract_) external onlyOwner {
        require(saleContract == address(0), "Sale contract already set");
        require(saleContract_ != address(0), "Zero sale contract");
        saleContract = saleContract_;
        emit SaleContractSet(saleContract_);
    }

    function saleMint(address to, uint256 quantity) external whenNotPaused {
        require(msg.sender == saleContract, "Only sale contract");
        _mintSequential(to, quantity, true);
    }

    function refundBurn(address holder, uint256[] calldata tokenIds) external {
        require(msg.sender == saleContract, "Only sale contract");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            require(publicSaleToken[tokenId], "Not public sale token");
            require(ownerOf(tokenId) == holder, "Refund holder not owner");
            publicSaleToken[tokenId] = false;
            _burn(tokenId);
        }
    }

    function _mintSequential(address to, uint256 quantity, bool markPublicSale) internal {
        require(quantity > 0, "Quantity must be greater than zero");
        require(nextTokenId + quantity - 1 <= MAX_SUPPLY, "Genesis supply exceeded");
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId++;
            if (markPublicSale) publicSaleToken[tokenId] = true;
            _safeMint(to, tokenId);
        }
    }

    function publicTestMint(uint256 quantity) external payable whenNotPaused {
        require(quantity > 0, "Quantity must be greater than zero");
        require(nextTokenId + quantity - 1 <= MAX_SUPPLY, "Genesis supply exceeded");
        require(msg.value == testMintPrice * quantity, "Incorrect test mint payment");
        for (uint256 i = 0; i < quantity; i++) { uint256 tokenId = nextTokenId++; _safeMint(msg.sender, tokenId); }
        emit TestMint(msg.sender, quantity, msg.value);
    }
    function setTestMintPrice(uint256 newPrice) external onlyOwner { testMintPrice = newPrice; emit TestMintPriceUpdated(newPrice); }
    function withdrawTestFunds() external onlyOwner { uint256 balance = address(this).balance; (bool success,) = payable(owner()).call{value: balance}(""); require(success, "Withdraw failed"); }

    function rarityOf(uint256 tokenId) public view returns (Rarity) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (tokenId <= 22) return Rarity.HallOfFame;
        if (tokenId <= 212) return Rarity.Legendary;
        if (tokenId <= 452) return Rarity.Epic;
        if (tokenId <= 772) return Rarity.Rare;
        if (tokenId <= 1252) return Rarity.Uncommon;
        return Rarity.Common;
    }
    function votingPowerOf(uint256 tokenId) public view returns (uint256) {
        Rarity r = rarityOf(tokenId);
        if (r == Rarity.Legendary) return 5;
        if (r == Rarity.Epic) return 4;
        if (r == Rarity.Rare) return 3;
        if (r == Rarity.Uncommon) return 2;
        if (r == Rarity.Common) return 1;
        return 0;
    }
    function setPlaceholderURI(string calldata newPlaceholderURI) external onlyOwner { placeholderURI = newPlaceholderURI; emit PlaceholderURIUpdated(newPlaceholderURI); }
    function reveal(string calldata newBaseURI) external onlyOwner { require(!revealed, "Already revealed"); require(bytes(newBaseURI).length > 0, "Empty base URI"); _baseTokenURI = newBaseURI; revealed = true; emit CollectionRevealed(newBaseURI); }
    function tokenURI(uint256 tokenId) public view override returns (string memory) { require(_ownerOf(tokenId) != address(0), "Token does not exist"); if (!revealed) return placeholderURI; return string(abi.encodePacked(_baseTokenURI, tokenId.toString(), ".json")); }
    function _baseURI() internal view override returns (string memory) { return _baseTokenURI; }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
