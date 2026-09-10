const {expect}=require('chai'),{ethers,network}=require('hardhat'),{time}=require('@nomicfoundation/hardhat-network-helpers');
const {deploySystem}=require('../../scripts/deploy-v7-system.js');
const {systemConfig}=require('../../scripts/v7-canonical-config.cjs');
const {preflight}=require('../../scripts/preflight-v7-readiness.cjs');
const {mintInBatches}=require('../helpers/mint-batches.cjs');
const {preparePrizeScan}=require('../helpers/trusted-settlement.cjs');
const {generateRaceKey}=require('../../lib/owner-voting/backend.cjs');
const {signVote}=require('../../lib/owner-voting/signed-ballot.cjs');
const {admitSigned,settleRelayedRace}=require('../../lib/owner-voting/signed-backend.cjs');
const {SignedVoteQueue}=require('../../lib/owner-voting/signed-service.cjs');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
// Explicit local invocation only; never a remote --network.
describe('Readiness canonical local dry run',function(){this.timeout(180000);
 before(()=>{if(network.name!=='hardhat'||process.env.HOF_LOCAL_TESTNET!=='1')throw Error('Local simulated 46630 only');});
 async function setup(){const [owner,admission,relayer,team,treasury,audit,buyer,other]=await ethers.getSigners();const token=await(await ethers.getContractFactory('MockUSDC')).deploy();const env={HOF_TOKEN_MODE:'testnetMockUSDC',HOF_USDC_ADDRESS:token.target,HOF_OWNER_ADDRESS:owner.address,HOF_ADMISSION_SIGNER:admission.address,HOF_RELAYER_ADDRESS:relayer.address,TEAM_RESERVE_WALLET:team.address,PROJECT_WALLET:treasury.address,AUDIT_WALLET:audit.address,MINT_DEADLINE_UNIX:String((await time.latest())+100000),GENESIS_PLACEHOLDER_URI:'ipfs://test-only-placeholder',HOF_MIN_DEPLOYER_WEI:'1'};await expect(preflight({...env,HOF_MIN_DEPLOYER_WEI:'999999999999999999999999999999'},ethers.provider)).rejectedWith('Insufficient');const check=await preflight(env,ethers.provider);expect(check.status).eq('PASS');const system=await deploySystem(systemConfig(env),owner);return {...system,token,env,owner,admission,relayer,team,treasury,audit,buyer,other};}
 it('canonical deployment and failed-sale path: 4x25, transfer, refund, burn',async()=>{const f=await setup();expect(await f.token.decimals()).eq(6);expect(await f.token.name()).includes('TEST ONLY / NO VALUE');expect(await f.sale.MINT_PRICE()).eq(30000000);await f.token.mint(f.buyer.address,3000000000n);await expect(f.sale.connect(f.buyer).mint(25)).reverted;await f.token.connect(f.buyer).approve(f.sale.target,3000000000n);for(let i=0;i<4;i++)await f.sale.connect(f.buyer).mint(25);await expect(f.sale.connect(f.buyer).mint(26)).revertedWith('Mint batch exceeds 25');await f.genesis.connect(f.buyer).transferFrom(f.buyer.address,f.other.address,23);await time.increaseTo(Number(f.env.MINT_DEADLINE_UNIX));await f.sale.connect(f.other).refund([23]);expect(await f.token.balanceOf(f.other.address)).eq(30000000);await expect(f.genesis.ownerOf(23)).reverted;expect(await f.genesis.publicMinted()).eq(100);await expect(f.sale.connect(f.other).refund([23])).reverted;});
 it('sold-out canonical system -> sponsored voting -> 10 full race reveals -> Season/All-Time -> Community payout',async()=>{const f=await setup();await f.token.mint(f.buyer.address,60000000000n);await f.token.connect(f.buyer).approve(f.sale.target,60000000000n);await mintInBatches(f.sale.connect(f.buyer),'mint',[2000]);await mintInBatches(f.genesis,'ownerMint',[f.other.address,111]);await mintInBatches(f.genesis,'ownerMint',[f.team.address,111]);expect(await f.genesis.totalSupply()).eq(2222);await expect(f.sale.connect(f.buyer).mint(1)).reverted;await f.sale.distributeProceeds();expect(await f.token.balanceOf(f.rewards.target)).eq(48000000000n);await expect(f.sale.connect(f.buyer).refund([23])).reverted;
 const key=await generateRaceKey(),start=(await time.latest())+100;let last;
 for(let n=1;n<=10;n++){
  // Run the actual race operator script with local env, including sell-out checks.
  Object.assign(process.env,f.env,{HOF_TRUSTED_LEADERBOARDS:f.board.target,GENESIS_SALE_ADDRESS:f.sale.target,RACE_OPENS_AT_UNIX:String(start+(n-1)*259200),HOF_RACE_PUBLIC_KEY:key.publicKey});
  await require('../../scripts/deploy-v7-race.js').main();
  const race=await ethers.getContractAt('HOFRelayedRace',await f.board.races(n-1));last=race;await time.increaseTo(Number(await race.opensAt()));
  const packet=await signVote(race,f.buyer,1,[{id:23,vp:await f.genesis.votingPowerOf(23)}]);Object.assign(packet,await admitSigned(race,f.admission,key.privateKey,packet));
  const queue=new SignedVoteQueue({race,relayer:f.relayer,treasuryAddress:f.treasury.address,journal:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'hof-readiness-')),'queue.journal')});
  try{await queue.enqueue(packet);await queue.flush();expect(await race.ballotCount()).eq(1);}finally{queue.stop();queue.close();}
  await expect(race.connect(f.buyer).submitSigned(packet)).reverted;
  await time.increaseTo(Number(await race.closesAt()));await settleRelayedRace(race,f.admission,key.privateKey);expect(await race.finalized()).eq(true);expect(await f.board.allTimePoints(f.buyer.address)).eq(n*25);await f.board.indexParticipants(n-1,25);
 }
 expect(await f.board.seasonPoints(f.buyer.address)).eq(250);await preparePrizeScan(f.board);await f.board.finalizeSeason();await f.rewards.payCommunitySeason(1);expect(await f.token.balanceOf(f.buyer.address)).eq(2500000000n);expect(await f.rewards.communityRolloverToChapter2()).eq(1500000000n);await expect(f.rewards.payCommunitySeason(1)).revertedWith('community season paid');expect(await f.board.previousSeasonEnd()).eq(await last.revealedAt());
 });
});
