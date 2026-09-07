// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract GenesisHorses is ERC721Enumerable, Ownable, Pausable {
    uint256 public constant MAX_SUPPLY = 2222;
    uint256 public constant HALL_OF_FAME_SUPPLY = 22;
    uint256 public constant VOTING_SUPPLY = 2200;

    uint256 public constant COMMON_SUPPLY = 970;
    uint256 public constant UNCOMMON_SUPPLY = 480;
    uint256 public constant RARE_SUPPLY = 320;
    uint256 public constant EPIC_SUPPLY = 240;
    uint256 public constant LEGENDARY_SUPPLY = 190;

    uint256 public nextTokenId = 1;

    string private _baseTokenURI;
    string public placeholderURI;

    bool public revealed;

    enum Rarity {
        Unassigned,
        Common,
        Uncommon,
        Rare,
        Epic,
        Legendary,
        HallOfFame
    }

    mapping(uint256 => Rarity) private _rarity;

    constructor(
        string memory initialPlaceholderURI
    )
        ERC721("Horses of Fame - Genesis", "HOFGEN")
        Ownable(msg.sender)
    {
        placeholderURI = initialPlaceholderURI;
    }

    function ownerMint(address to, uint256 quantity)
        external
        onlyOwner
        whenNotPaused
    {
        require(quantity > 0, "Quantity must be greater than zero");
        require(
            totalSupply() + quantity <= MAX_SUPPLY,
            "Genesis supply exceeded"
        );

        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = nextTokenId;
            nextTokenId++;

            _safeMint(to, tokenId);
        }
    }

    function setRarity(
        uint256 tokenId,
        Rarity rarity_
    )
        external
        onlyOwner
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        require(rarity_ != Rarity.Unassigned, "Invalid rarity");

        _rarity[tokenId] = rarity_;
    }

    function rarityOf(uint256 tokenId)
        external
        view
        returns (Rarity)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return _rarity[tokenId];
    }

    function votingPowerOf(uint256 tokenId)
        public
        view
        returns (uint256)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        Rarity rarity_ = _rarity[tokenId];

        if (rarity_ == Rarity.Common) return 1;
        if (rarity_ == Rarity.Uncommon) return 2;
        if (rarity_ == Rarity.Rare) return 3;
        if (rarity_ == Rarity.Epic) return 4;
        if (rarity_ == Rarity.Legendary) return 5;

        // Hall of Fame horses have 0 VP.
        return 0;
    }

    function setPlaceholderURI(string calldata newPlaceholderURI)
        external
        onlyOwner
    {
        placeholderURI = newPlaceholderURI;
    }

    function reveal(string calldata newBaseURI)
        external
        onlyOwner
    {
        require(!revealed, "Already revealed");
        require(bytes(newBaseURI).length > 0, "Empty base URI");

        _baseTokenURI = newBaseURI;
        revealed = true;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override
        returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");

        if (!revealed) {
            return placeholderURI;
        }

        return super.tokenURI(tokenId);
    }

    function _baseURI()
        internal
        view
        override
        returns (string memory)
    {
        return _baseTokenURI;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
