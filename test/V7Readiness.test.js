const {expect}=require('chai'),{ethers}=require('hardhat');
const {validateSystem,validateNetwork,systemConfig}=require('../scripts/v7-canonical-config.cjs');
const {checkArtifacts}=require('../scripts/preflight-v7-readiness.cjs');
describe('Testnet readiness guards',function(){
 it('false-return payment/refund failures revert NFT and accounting atomically',async()=>{
 const [o,buyer,prize,audit]=await ethers.getSigners(),{time}=require('@nomicfoundation/hardhat-network-helpers');
 const token=await(await ethers.getContractFactory('FailingTestUSDC')).deploy(),g=await(await ethers.getContractFactory('GenesisHorses')).deploy('test');
 const deadline=(await time.latest())+100;
 const sale=await(await ethers.getContractFactory('HOFGenesisSale')).deploy(token.target,g.target,deadline,prize.address,audit.address,o.address);await g.setSaleContract(sale.target);
 await token.mint(buyer.address,30000000);await token.connect(buyer).approve(sale.target,30000000);await token.setFailure(true);
 await expect(sale.connect(buyer).mint(1)).reverted;expect(await sale.sold()).eq(0);expect(await g.nextTokenId()).eq(1);
 await token.setFailure(false);await sale.connect(buyer).mint(1);await time.increaseTo(deadline);await token.setFailure(true);
 await expect(sale.connect(buyer).refund([1])).reverted;expect(await g.ownerOf(1)).eq(buyer.address);expect(await token.balanceOf(sale.target)).eq(30000000);
 await token.setFailure(false);await sale.connect(buyer).refund([1]);await expect(g.ownerOf(1)).reverted;
 });
 it('mock is labelled, six-decimal and has explicit test marker',async()=>{const t=await(await ethers.getContractFactory('MockUSDC')).deploy();expect(await t.name()).eq('TEST ONLY / NO VALUE - MockUSDC');expect(await t.symbol()).eq('TEST-USDC');expect(await t.decimals()).eq(6);expect(await t.testOnly()).eq(true);});
 it('mainnet deployment path rejects MockUSDC before signing',async()=>{await expect(validateNetwork({getNetwork:async()=>({chainId:4663n})})).rejectedWith('Only Robinhood Testnet');});
 it('missing mode is not implicitly interpreted as a production token',()=>{expect(()=>systemConfig({})).throws('Missing');});
 it('existing artifacts match current source and compiler settings',()=>{checkArtifacts();});
 it('productionUSDC mode is rejected even for a 6-decimal token on testnet',async()=>{const [o]=await ethers.getSigners(),t=await(await ethers.getContractFactory('MockUSDC')).deploy();const provider=new Proxy(ethers.provider,{get(target,k){if(k==='getNetwork')return async()=>({chainId:46630n});const value=Reflect.get(target,k,target);return typeof value==='function'?value.bind(target):value;}});await expect(validateSystem({...ethers,provider},{owner:o.address,usdc:t.target,tokenMode:'productionUSDC',deadline:9999999999n},o)).rejectedWith('Only explicit testnetMockUSDC');});
});
