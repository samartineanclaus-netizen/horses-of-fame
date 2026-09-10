// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;
import "./HOFRelayedRace.sol";
interface ICanonicalBoard { function currentSeason() external view returns(uint8); }
/// @notice Fixed implementation and roles. No arbitrary-address authorization or implementation setter.
contract HOFCanonicalRaceFactory {
    address public immutable board;
    address public immutable genesis;
    address public immutable hofOwner;
    address public immutable backendSigner;
    address public immutable team;
    struct Origin { uint8 chapter; uint8 season; uint8 number; }
    mapping(address => Origin) public provenance;
    event RaceCreated(address indexed race, uint8 season, uint8 number);
    constructor(address board_, address genesis_, address owner_, address signer_, address team_) {
        board=board_; genesis=genesis_; hofOwner=owner_; backendSigner=signer_; team=team_;
    }
    function createRace(uint8 chapter, uint8 season, uint8 number, uint256 opens, bytes calldata key) external returns(address race) {
        require(msg.sender == hofOwner, "only HOF owner");
        require(chapter == 1 && season >= 1 && season <= 6 && season == ICanonicalBoard(board).currentSeason(), "wrong chapter/season");
        require(number >= 1 && number <= 10, "wrong race number");
        race=address(new HOFRelayedRace(genesis, opens, team, hofOwner, backendSigner, key));
        provenance[race]=Origin(chapter,season,number);
        emit RaceCreated(race,season,number);
    }
}
