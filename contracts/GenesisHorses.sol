// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface IV7PublicSaleState {
    function saleSuccessful() external view returns (bool);
}

contract GenesisHorses is ERC721Enumerable, Ownable, Pausable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 2222;
    uint256 public constant HALL_OF_FAME_SUPPLY = 22;
    uint256 public constant VOTING_SUPPLY = 2200;
    uint256 public constant PUBLIC_MINT_SUPPLY = 2000;
    uint256 public constant COMMUNITY_ALLOCATION_SUPPLY = 111;
    uint256 public constant TEAM_RESERVE_SUPPLY = 111;
    uint256 public constant NON_PUBLIC_ALLOCATION_SUPPLY = 222;
    uint256 public constant LEGENDARY_SUPPLY = 190;
    uint256 public constant EPIC_SUPPLY = 240;
    uint256 public constant RARE_SUPPLY = 320;
    uint256 public constant UNCOMMON_SUPPLY = 480;
    uint256 public constant COMMON_SUPPLY = 970;

    uint256 public nextTokenId = 1;
    /// @notice Invalidates batched prize scans on every actual ownership change.
    uint256 public ownershipRevision;
    uint256 public publicMinted;
    uint256 public communityAllocationMinted;
    uint256 public teamReserveMinted;
    uint256 public nonPublicAllocationMinted;
    address public saleContract;
    address public teamWallet;
    mapping(uint256 => bool) public publicSaleToken;

    string private _baseTokenURI;
    string public placeholderURI;
    bool public revealed;

    enum Rarity { Unassigned, Common, Uncommon, Rare, Epic, Legendary, HallOfFame }

    event AllocationMint(address indexed recipient, uint256 quantity, bool indexed teamReserve);
    event CollectionRevealed(string baseURI);
    event PlaceholderURIUpdated(string placeholderURI);
    event SaleContractSet(address indexed saleContract);
    event TeamWalletSet(address indexed teamWallet);

    constructor(string memory initialPlaceholderURI)
        ERC721("Horses of Fame - Genesis", "HOFGEN")
        Ownable(msg.sender)
    {
        placeholderURI = initialPlaceholderURI;
    }

    /// @notice Owner-only mint for V7's fixed non-public allocation.
    /// Mints to the designated Team Reserve Wallet count against the locked
    /// 111 Team Reserve bucket. Mints to every other address count against the
    /// locked 111 Community bucket. The paid Public Mint remains isolated in
    /// the configured sale contract.
    function ownerMint(address to, uint256 quantity) external onlyOwner whenNotPaused {
        require(quantity > 0, "Quantity must be greater than zero");

        bool isTeamReserve = teamWallet != address(0) && to == teamWallet;
        if (isTeamReserve) {
            require(
                teamReserveMinted + quantity <= TEAM_RESERVE_SUPPLY,
                "Team Reserve allocation exceeded"
            );
            teamReserveMinted += quantity;
        } else {
            require(
                communityAllocationMinted + quantity <= COMMUNITY_ALLOCATION_SUPPLY,
                "Community allocation exceeded"
            );
            communityAllocationMinted += quantity;
        }

        nonPublicAllocationMinted += quantity;
        require(nonPublicAllocationMinted <= NON_PUBLIC_ALLOCATION_SUPPLY, "Non-public allocation exceeded");

        _mintSequential(to, quantity, false);
        emit AllocationMint(to, quantity, isTeamReserve);
    }

    function setSaleContract(address saleContract_) external onlyOwner {
        require(saleContract == address(0), "Sale contract already set");
        require(saleContract_ != address(0), "Zero sale contract");
        saleContract = saleContract_;
        emit SaleContractSet(saleContract_);
    }

    function setTeamWallet(address teamWallet_) external onlyOwner {
        require(teamWallet == address(0), "Team wallet already set");
        require(teamWallet_ != address(0), "Zero team wallet");
        teamWallet = teamWallet_;
        emit TeamWalletSet(teamWallet_);
    }

    function saleMint(address to, uint256 quantity) external whenNotPaused {
        require(msg.sender == saleContract, "Only sale contract");
        require(publicMinted + quantity <= PUBLIC_MINT_SUPPLY, "Public allocation exceeded");
        publicMinted += quantity;
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

    /// @dev V7 launch cadence is Public Mint sold out -> Team Reserve secondary
    /// distribution -> Race 1. The Team Reserve allocation may be minted into
    /// the designated wallet beforehand, but it cannot leave that wallet until
    /// the configured Public Mint sale reports full sell-out. This does not
    /// affect Community allocation transfers or tokens after they have left the
    /// Team Reserve wallet.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (to != address(0) && from != address(0) && from == teamWallet) {
            require(saleContract != address(0), "Team Reserve locked until sell-out");
            require(
                IV7PublicSaleState(saleContract).saleSuccessful(),
                "Team Reserve locked until sell-out"
            );
        }
        address previous = super._update(to, tokenId, auth);
        if (previous != to) ++ownershipRevision;
        return previous;
    }

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
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (teamWallet != address(0) && ownerOf(tokenId) == teamWallet) return 0;

        Rarity rarity_ = rarityOf(tokenId);
        if (rarity_ == Rarity.Legendary) return 5;
        if (rarity_ == Rarity.Epic) return 4;
        if (rarity_ == Rarity.Rare) return 3;
        if (rarity_ == Rarity.Uncommon) return 2;
        if (rarity_ == Rarity.Common) return 1;
        return 0;
    }

    function setPlaceholderURI(string calldata newPlaceholderURI) external onlyOwner {
        placeholderURI = newPlaceholderURI;
        emit PlaceholderURIUpdated(newPlaceholderURI);
    }

    function reveal(string calldata newBaseURI) external onlyOwner {
        require(!revealed, "Already revealed");
        require(bytes(newBaseURI).length > 0, "Empty base URI");
        _baseTokenURI = newBaseURI;
        revealed = true;
        emit CollectionRevealed(newBaseURI);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        if (!revealed) return placeholderURI;
        return string(abi.encodePacked(_baseTokenURI, tokenId.toString(), ".json"));
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
