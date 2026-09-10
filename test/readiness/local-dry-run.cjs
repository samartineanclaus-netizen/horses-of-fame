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
 let originalFetch;
 before(()=>{originalFetch=global.fetch;global.fetch=async(url,options)=>{
  if(url==='https://hof-fixture.example.org/genesis/unrevealed.json')return new Response(fs.readFileSync('public/genesis/unrevealed.json'));
  if(url==='https://hof-fixture.example.org/brand/hof-logo.webp')return new Response(fs.readFileSync('public/brand/hof-logo.webp'),{headers:{'content-type':'image/webp'}});
  if(new URL(url).hostname==='127.0.0.1')return originalFetch(url,options);
  throw Error('Unexpected HTTP in local dry run');
 };});
 after(()=>{global.fetch=originalFetch;});
 before(()=>{if(network.name!=='hardhat'||process.env.HOF_LOCAL_TESTNET!=='1')throw Error('Local simulated 46630 only');});
 async function setup(){const [owner,admission,relayer,team,treasury,audit,buyer,other]=await ethers.getSigners();const token=await(await ethers.getContractFactory('MockUSDC')).deploy();const env={HOF_TOKEN_MODE:'testnetMockUSDC',HOF_USDC_ADDRESS:token.target,HOF_OWNER_ADDRESS:owner.address,HOF_ADMISSION_SIGNER:admission.address,HOF_RELAYER_ADDRESS:relayer.address,TEAM_RESERVE_WALLET:team.address,PROJECT_WALLET:treasury.address,AUDIT_WALLET:audit.address,MINT_DEADLINE_UNIX:String((await time.latest())+100000),GENESIS_PLACEHOLDER_URI:'https://hof-fixture.example.org/genesis/unrevealed.json',HOF_MIN_DEPLOYER_WEI:'1'};await expect(preflight({...env,HOF_MIN_DEPLOYER_WEI:'999999999999999999999999999999'},ethers.provider)).rejectedWith('Insufficient');const check=await preflight(env,ethers.provider);expect(check.status).eq('PASS');const system=await deploySystem(systemConfig(env),owner);return {...system,token,env,owner,admission,relayer,team,treasury,audit,buyer,other};}
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
 it('automatic service E2E: canonical deploy/mint, browser signature, HTTP admission/sponsorship,24h close and both boards',async()=>{
 const f=await setup();await f.token.mint(f.buyer.address,60000000000n);await f.token.connect(f.buyer).approve(f.sale.target,60000000000n);await mintInBatches(f.sale.connect(f.buyer),'mint',[2000]);
 const key=await generateRaceKey(),opens=(await time.latest())+100;
 Object.assign(process.env,f.env,{HOF_TRUSTED_LEADERBOARDS:f.board.target,GENESIS_SALE_ADDRESS:f.sale.target,RACE_OPENS_AT_UNIX:String(opens),HOF_RACE_PUBLIC_KEY:key.publicKey});await require('../../scripts/deploy-v7-race.js').main();
 const race=await ethers.getContractAt('HOFRelayedRace',await f.board.races(0));await time.increaseTo(opens);
 const {createRuntime}=require('../../scripts/run-race-reveal-service.cjs'),ingress='local-test-ingress-'.repeat(3);
 const pem=require('node:crypto').KeyObject.from(key.privateKey).export({type:'pkcs8',format:'pem'});
 // Local JSON-RPC transport exercises the actual CLI bootstrap, ABI loading,
 // file permissions, MockUSDC and role validation with genuine local contracts.
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hof-automatic-e2e-'));
 const rpc=require('node:http').createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);const answer=async q=>{try{return{jsonrpc:'2.0',id:q.id,result:await network.provider.send(q.method,q.params)};}catch{return{jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'local RPC rejected'}};}};const output=Array.isArray(input)?await Promise.all(input.map(answer)):await answer(input);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(output));});
 await new Promise(r=>rpc.listen(0,'127.0.0.1',r));
 // Derive ONLY the public Hardhat fixture identities; never live keys.
 const admissionFile=path.join(directory,'admission.key'),relayerFile=path.join(directory,'relayer.key');
 for(const [file,index]of [[admissionFile,1],[relayerFile,2]]){const wallet=ethers.HDNodeWallet.fromPhrase(network.config.accounts.mnemonic,undefined,`m/44'/60'/0'/0/${index}`);fs.writeFileSync(file,wallet.privateKey,{mode:0o600});}
 fs.writeFileSync(path.join(directory,ethers.keccak256(key.publicKey).slice(2)+'.pem'),pem,{mode:0o600});
 let runtime;
 try{runtime=await createRuntime({...f.env,HOF_SERVICE_MODE:'testnetMockUSDC',HOF_RPC_URL:`http://127.0.0.1:${rpc.address().port}`,HOF_TRUSTED_LEADERBOARDS:f.board.target,GENESIS_SALE_ADDRESS:f.sale.target,HOF_ADMISSION_KEY_FILE:admissionFile,HOF_RELAYER_KEY_FILE:relayerFile,HOF_DECRYPTION_KEY_DIRECTORY:directory,HOF_SERVICE_DIRECTORY:path.join(directory,'journal'),HOF_SIGNED_INGRESS_TOKEN:ingress});}
 catch(e){await new Promise(r=>rpc.close(r));fs.rmSync(directory,{recursive:true,force:true});throw e;}
 const {service,provider}=runtime;
 try{
 await new Promise(r=>service.http.listen(0,'127.0.0.1',r));service.start();
 const until=async fn=>{const end=Date.now()+60000;while(!await fn()&&Date.now()<end)await new Promise(r=>setTimeout(r,20));expect(await fn()).eq(true);};
 await until(async()=>Boolean(service.queue));const signed=await signVote(race,f.buyer,8,[{id:23,vp:await f.genesis.votingPowerOf(23)}]);
 const send=async(route,body)=>{const res=await fetch(`http://127.0.0.1:${service.http.address().port}/vote/${route}`,{method:'POST',headers:{Authorization:`Bearer ${ingress}`},body:JSON.stringify(body)});expect(res.status).eq(200);return res.json();};
 const auth=await send('prepare',signed);const submitted=await send('submit',{...signed,...auth});expect(submitted.state).eq('Submitted');await until(async()=>await race.ballotCount()===1n);
 expect(await f.board.allTimePoints(f.buyer.address)).eq(0);await time.increaseTo(Number(await race.closesAt()));await until(async()=>await race.finalized());
 expect(await f.board.seasonPoints(f.buyer.address)).eq(25);expect(await f.board.allTimePoints(f.buyer.address)).eq(25);expect((await race.ranking()).length).eq(22);
 }finally{await service.close();provider.destroy();await new Promise(r=>rpc.close(r));fs.rmSync(directory,{recursive:true,force:true});}
 });

});
