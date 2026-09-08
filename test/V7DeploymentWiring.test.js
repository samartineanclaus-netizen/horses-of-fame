const { expect } = require("chai");
const { ethers } = require("hardhat");

const USDC = 1_000_000n;

describe("V7 full-system deployment wiring", function () {
  async function deploySystem() {
    const [owner, buyer, teamReserve, audit, project] = await ethers.getSigners();

    const USDCFactory = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDCFactory.deploy();
    await usdc.waitForDeployment();

    const Genesis = await ethers.getContractFactory("GenesisHorses");
    const genesis = await Genesis.deploy("ipfs://placeholder/");
    await genesis.waitForDeployment();
    await genesis.setTeamWallet(teamReserve.address);

    const Community = await ethers.getContractFactory("HOFCommunitySeason");
    const community = await Community.deploy();
    await community.waitForDeployment();
    await community.setGenesisContract(await genesis.getAddress());

    const HOF = await ethers.getContractFactory("HOFSeasonLeaderboard");
    const hof = await HOF.deploy();
    await hof.waitForDeployment();

    const Rewards = await ethers.getContractFactory("HOFSeasonRewards");
    const rewards = await Rewards.deploy(await usdc.getAddress(), await community.getAddress());
    await rewards.waitForDeployment();

    const latest = await ethers.provider.getBlock("latest");
    const Sale = await ethers.getContractFactory("HOFGenesisSale");
    const sale = await Sale.deploy(
      await usdc.getAddress(),
      await genesis.getAddress(),
      latest.timestamp + 30 * 24 * 60 * 60,
      await rewards.getAddress(),
      audit.address,
      project.address,
    );
    await sale.waitForDeployment();
    await genesis.setSaleContract(await sale.getAddress());

    return { owner, buyer, teamReserve, audit, project, usdc, genesis, community, hof, rewards, sale };
  }

  it("locks the V7 constants and cross-contract references in one deployable system", async function () {
    const { teamReserve, audit, project, usdc, genesis, community, hof, rewards, sale } = await deploySystem();

    expect(await genesis.MAX_SUPPLY()).to.equal(2222n);
    expect(await genesis.HALL_OF_FAME_SUPPLY()).to.equal(22n);
    expect(await genesis.VOTING_SUPPLY()).to.equal(2200n);
    expect(await genesis.COMMON_SUPPLY()).to.equal(970n);
    expect(await genesis.UNCOMMON_SUPPLY()).to.equal(480n);
    expect(await genesis.RARE_SUPPLY()).to.equal(320n);
    expect(await genesis.EPIC_SUPPLY()).to.equal(240n);
    expect(await genesis.LEGENDARY_SUPPLY()).to.equal(190n);
    expect(await genesis.teamWallet()).to.equal(teamReserve.address);
    expect(await genesis.saleContract()).to.equal(await sale.getAddress());

    expect(await sale.PUBLIC_SUPPLY()).to.equal(2000n);
    expect(await sale.MINT_PRICE()).to.equal(30n * USDC);
    expect(await sale.PRIZE_POOL_AMOUNT()).to.equal(48_000n * USDC);
    expect(await sale.AUDIT_AMOUNT()).to.equal(2_000n * USDC);
    expect(await sale.FOUNDER_AMOUNT()).to.equal(10_000n * USDC);
    expect(await sale.paymentToken()).to.equal(await usdc.getAddress());
    expect(await sale.genesis()).to.equal(await genesis.getAddress());
    expect(await sale.prizePoolTreasury()).to.equal(await rewards.getAddress());
    expect(await sale.auditWallet()).to.equal(audit.address);
    expect(await sale.founderWallet()).to.equal(project.address);

    expect(await community.genesisContract()).to.equal(await genesis.getAddress());
    expect(await community.RACES_PER_SEASON()).to.equal(10n);
    expect(await community.CHAPTER_SEASONS()).to.equal(6n);
    expect(await community.RACE_INTERVAL()).to.equal(3n * 24n * 60n * 60n);

    expect(await hof.HOF_COMPETITORS()).to.equal(22n);
    expect(await hof.RACES_PER_SEASON()).to.equal(10n);
    expect(await hof.CHAPTER_SEASONS()).to.equal(6n);
    expect(await hof.RACE_INTERVAL()).to.equal(3n * 24n * 60n * 60n);

    expect(await rewards.usdc()).to.equal(await usdc.getAddress());
    expect(await rewards.communitySeason()).to.equal(await community.getAddress());
    expect(await rewards.COMMUNITY_FIRST()).to.equal(2_500n * USDC);
    expect(await rewards.COMMUNITY_SECOND()).to.equal(1_000n * USDC);
    expect(await rewards.COMMUNITY_THIRD()).to.equal(500n * USDC);
    expect(await rewards.COMMUNITY_PER_SEASON()).to.equal(4_000n * USDC);
    expect(await rewards.HOF_PER_SEASON()).to.equal(4_000n * USDC);
    expect(await rewards.TOTAL_PER_SEASON()).to.equal(8_000n * USDC);
    expect(await rewards.CHAPTER_PRIZE_POOL()).to.equal(48_000n * USDC);
  });

  it("routes a V7 public mint through USDC and the configured sale contract", async function () {
    const { buyer, usdc, genesis, sale } = await deploySystem();

    await usdc.mint(buyer.address, 30n * USDC);
    await usdc.connect(buyer).approve(await sale.getAddress(), 30n * USDC);
    await expect(sale.connect(buyer).mint(1))
      .to.emit(sale, "Minted")
      .withArgs(buyer.address, 1n, 30n * USDC);

    expect(await sale.sold()).to.equal(1n);
    expect(await sale.paidBy(buyer.address)).to.equal(30n * USDC);
    expect(await usdc.balanceOf(await sale.getAddress())).to.equal(30n * USDC);
    expect(await genesis.ownerOf(1)).to.equal(buyer.address);
    expect(await genesis.publicSaleToken(1)).to.equal(true);
  });
});
