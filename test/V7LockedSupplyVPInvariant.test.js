const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("V7 locked Genesis supply and VP invariants", function () {
  it("keeps 22 HOF + 2,200 voting NFTs = 2,222 Genesis", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    const hof = await genesis.HALL_OF_FAME_SUPPLY();
    const voting = await genesis.VOTING_SUPPLY();
    const total = await genesis.MAX_SUPPLY();

    expect(hof).to.equal(22n);
    expect(voting).to.equal(2200n);
    expect(hof + voting).to.equal(total);
    expect(total).to.equal(2222n);
  });

  it("keeps the V7 rarity distribution at exactly 2,200 voting NFTs and 4,800 nominal VP", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    const common = await genesis.COMMON_SUPPLY();
    const uncommon = await genesis.UNCOMMON_SUPPLY();
    const rare = await genesis.RARE_SUPPLY();
    const epic = await genesis.EPIC_SUPPLY();
    const legendary = await genesis.LEGENDARY_SUPPLY();

    const votingSupply = common + uncommon + rare + epic + legendary;
    const nominalVP = common + uncommon * 2n + rare * 3n + epic * 4n + legendary * 5n;

    expect(common).to.equal(970n);
    expect(uncommon).to.equal(480n);
    expect(rare).to.equal(320n);
    expect(epic).to.equal(240n);
    expect(legendary).to.equal(190n);
    expect(votingSupply).to.equal(2200n);
    expect(nominalVP).to.equal(4800n);
  });

  it("keeps the locked 2,000 Public + 111 Community + 111 Team Reserve allocation", async function () {
    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("placeholder");
    await genesis.waitForDeployment();

    const publicMint = await genesis.PUBLIC_MINT_SUPPLY();
    const community = await genesis.COMMUNITY_ALLOCATION_SUPPLY();
    const team = await genesis.TEAM_RESERVE_SUPPLY();
    const total = await genesis.MAX_SUPPLY();

    expect(publicMint).to.equal(2000n);
    expect(community).to.equal(111n);
    expect(team).to.equal(111n);
    expect(publicMint + community + team).to.equal(total);
  });
});
