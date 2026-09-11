const {expect}=require('chai');
const {ethers}=require('hardhat');
const {loadFixture}=require('@nomicfoundation/hardhat-network-helpers');
const {validate,runtimeMatches}=require('../scripts/validate-v7-canonical-deployment.cjs');
describe('Canonical read-only deployment validator',function(){
 this.timeout(120000);
 async function fixture(){
  const [owner,admission,relayer,team,project,audit]=await ethers.getSigners();
  const deploy=async(n,...args)=>{const c=await(await ethers.getContractFactory(n)).deploy(...args);await c.waitForDeployment();return c;};
  const token=await deploy('MockUSDC');
  const anchor=await ethers.provider.getBlock('latest');
  const uri='https://hof-site.vercel.app/genesis/unrevealed.json';
  const genesis=await deploy('GenesisHorses',uri);await genesis.setTeamWallet(team.address);
  const board=await deploy('HOFTrustedLeaderboards',genesis.target,owner.address,admission.address,team.address);
  const rewards=await deploy('HOFSeasonRewards',token.target,board.target);
  const sale=await deploy('HOFGenesisSale',token.target,genesis.target,anchor.timestamp+604800,rewards.target,audit.address,project.address);
  await genesis.setSaleContract(sale.target);
  const env={HOF_USDC_ADDRESS:token.target,GENESIS_ADDRESS:genesis.target,GENESIS_SALE_ADDRESS:sale.target,HOF_TRUSTED_LEADERBOARDS:board.target,HOF_RACE_FACTORY:await board.raceFactory(),SEASON_REWARDS_ADDRESS:rewards.target,HOF_OWNER_ADDRESS:owner.address,HOF_ADMISSION_SIGNER:admission.address,HOF_RELAYER_ADDRESS:relayer.address,TEAM_RESERVE_WALLET:team.address,PROJECT_WALLET:project.address,AUDIT_WALLET:audit.address,HOF_DEPLOYMENT_ANCHOR_BLOCK:String(anchor.number)};
  // Local test adapter only; live validator always checks the actual RPC network.
  const provider=new Proxy(ethers.provider,{get(t,k){if(k==='getNetwork')return async()=>({chainId:46630n});const v=t[k];return typeof v==='function'?v.bind(t):v;}});
  return {env,provider,genesis,owner};
 }
 const run=(f,env=f.env,options={})=>validate(env,f.provider,{placeholder:async()=>{},...options});
 it('accepts actual canonical deployment, embedded factory and initial state without sending transactions',async()=>{
  const f=await loadFixture(fixture);const before=await ethers.provider.getBlockNumber();const r=await run(f);
  expect(r.checks.filter(c=>c.status==='FAIL')).to.deep.equal([]);expect(r.status).to.equal('GO');expect(await ethers.provider.getBlockNumber()).to.equal(before);
 });
 it('rejects wrong chain before reading any contracts',async()=>{expect((await validate({}, {getNetwork:async()=>({chainId:1n})})).status).to.equal('NO-GO');});
 it('rejects legacy configuration',async()=>{const f=await loadFixture(fixture);expect((await run(f,{...f.env,COMMUNITY_SEASON_ADDRESS:f.env.HOF_TRUSTED_LEADERBOARDS})).status).to.equal('NO-GO');});
 it('rejects wrong runtime / EOA instead of canonical factory',async()=>{const f=await loadFixture(fixture);expect((await run(f,{...f.env,HOF_RACE_FACTORY:f.owner.address})).status).to.equal('NO-GO');});
 it('rejects missing project approval and deployment anchor',async()=>{const f=await loadFixture(fixture);const e={...f.env};delete e.PROJECT_WALLET;delete e.HOF_DEPLOYMENT_ANCHOR_BLOCK;expect((await run(f,e)).status).to.equal('NO-GO');});
 it('rejects wrong admission, token mode, and deadline anchor',async()=>{const f=await loadFixture(fixture);const r=await run(f,{...f.env,HOF_ADMISSION_SIGNER:f.owner.address,HOF_TOKEN_MODE:'productionUSDC',HOF_DEPLOYMENT_ANCHOR_BLOCK:'0'});expect(r.checks.filter(c=>c.status==='FAIL').length).to.be.greaterThan(2);});
 it('rejects already minted state',async()=>{const f=await loadFixture(fixture);await f.genesis.ownerMint(f.owner.address,1);expect((await run(f)).status).to.equal('NO-GO');});
 it('fails closed on unavailable placeholder',async()=>{const f=await loadFixture(fixture);expect((await run(f,f.env,{placeholder:async()=>{throw Error('offline');}})).status).to.equal('NO-GO');});
 it('runtime comparison masks only compiler-declared immutable slots',()=>{expect(runtimeMatches('0x112233','0x110033',{1:[{start:1,length:1}]})).to.equal(true);expect(runtimeMatches('0xff2233','0x110033',{1:[{start:1,length:1}]})).to.equal(false);expect(runtimeMatches('0x','0x')).to.equal(false);});
});
