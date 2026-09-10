const {expect}=require('chai'),{ethers,network}=require('hardhat');
describe('Mock mainnet constructor rejection (LOCAL ONLY)',function(){
 it('cannot deploy test mock on simulated mainnet4663',async()=>{
  expect(network.name).eq('hardhat');expect((await ethers.provider.getNetwork()).chainId).eq(4663n);
  const factory=await ethers.getContractFactory('MockUSDC');
  await expect(factory.deploy()).revertedWith('MockUSDC test networks only');
 });
});
