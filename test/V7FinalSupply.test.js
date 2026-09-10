const { expect } = require("chai");
const { ethers } = require("hardhat");
describe("V7 isolated supply buckets", function () {
  it("mints exactly 2000 + 111 + 111 with independent lifetime caps", async function () {
    const [owner, team, community, buyer] = await ethers.getSigners();
    const g = await (await ethers.getContractFactory("GenesisHorses")).deploy("placeholder");
    await g.setTeamWallet(team.address);
    await g.setSaleContract(owner.address); // Only this test signer simulates sale.
    await g.ownerMint(community.address, 111);
    await expect(g.ownerMint(community.address, 1)).to.be.revertedWith("Community allocation exceeded");
    for (let i = 0; i < 20; i++) await g.saleMint(buyer.address, 100);
    await expect(g.saleMint(buyer.address, 1)).to.be.revertedWith("Public allocation exceeded");
    await g.ownerMint(team.address, 111);
    await expect(g.ownerMint(team.address, 1)).to.be.revertedWith("Team Reserve allocation exceeded");
    expect(await g.totalSupply()).to.equal(2222n);
    expect(await g.publicMinted()).to.equal(2000n);
    expect(await g.communityAllocationMinted()).to.equal(111n);
    expect(await g.teamReserveMinted()).to.equal(111n);
    await g.refundBurn(buyer.address, [112]);
    await expect(g.saleMint(buyer.address, 1)).to.be.revertedWith("Public allocation exceeded");
    expect(g.interface.hasFunction("publicTestMint")).to.equal(false);
    expect(g.interface.hasFunction("withdrawTestFunds")).to.equal(false);
  });
  it("enforces access, rejects zero quantity and preserves counters on rejected recipients", async function () {
    const [owner, other] = await ethers.getSigners();
    const g = await (await ethers.getContractFactory("GenesisHorses")).deploy("placeholder");
    await expect(g.connect(other).ownerMint(other.address, 1)).to.be.revertedWithCustomError(g, "OwnableUnauthorizedAccount");
    await expect(g.connect(other).saleMint(other.address, 1)).to.be.revertedWith("Only sale contract");
    await expect(g.ownerMint(other.address, 0)).to.be.reverted;
    await expect(g.ownerMint(ethers.ZeroAddress, 1)).to.be.reverted;
    expect(await g.communityAllocationMinted()).to.equal(0n);
    await g.setSaleContract(owner.address);
    await expect(g.saleMint(ethers.ZeroAddress, 1)).to.be.reverted;
    expect(await g.publicMinted()).to.equal(0n);
  });
});
