const {expect}=require('chai'),{ethers}=require('hardhat');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {plan,execute,dryRun}=require('../lib/testnet-ops/sold-out.cjs');
function setup(overrides={}){
 const state={chain:46630n,canonical:true,testOnly:true,decimals:6,price:30000000n,cap:2000,batchCap:25,roles:['owner'],buyer:'buyer',sold:0,now:1,deadline:100,paused:false,balance:60000000000n,allowance:60000000000n,buyerETH:10n**18n,funderETH:10n**18n,...overrides},sent=[],receipts=new Map();
 const api={read:async()=>({...state}),identity:async()=>({sender:'buyer',nonce:sent.length}),quote:async()=>({gas:100n,gasLimit:125n,feeCap:10n,costCap:1250n,sufficient:true}),send:async(kind,amount)=>{sent.push({kind,amount});if(kind==='mint'){state.sold+=amount;state.balance-=BigInt(amount)*state.price;state.allowance-=BigInt(amount)*state.price;}if(kind==='fund')state.balance+=BigInt(amount);if(kind==='approve')state.allowance=BigInt(amount);const hash='hash'+sent.length;receipts.set(hash,{status:1});return{hash};},wait:async h=>receipts.get(h),receipt:async h=>receipts.get(h),verify:async()=>{}};
 return {api,state,sent,options:{mode:'mint',file:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'hof-soldout-')),'journal'),binding:{buyer:'buyer'}}};
}
describe('TESTNET sold-out operator',function(){
 it('sold0 plans and executes exactly80 local mock batches of25',async()=>{const f=setup();expect(plan(f.state).quantities).length(80);await execute(f.api,f.options);expect(f.sent).length(80);expect(f.sent.every(x=>x.amount===25)).eq(true);expect(f.state.sold).eq(2000);});
 it('partial sold resumes from chain with small final batch',async()=>{const f=setup({sold:1963});await execute(f.api,f.options);expect(f.sent.map(x=>x.amount)).deep.eq([25,12]);});
 it('1999 requires one NFT',async()=>{const f=setup({sold:1999});await execute(f.api,f.options);expect(f.sent[0].amount).eq(1);});
 it('2000 is a no-op even after deadline',async()=>{const f=setup({sold:2000,now:101});await execute(f.api,f.options);expect(f.sent).length(0);});
 for(const [label,override]of [['sold>2000',{sold:2001}],['mainnet',{chain:4663n}],['other chain',{chain:1n}],['wrong token',{testOnly:false}],['wrong wiring',{canonical:false}],['wrong decimals',{decimals:18}],['expired',{now:100}],['operational buyer',{roles:['buyer']}],['batch cap changed',{batchCap:26}]])it('rejects '+label,()=>expect(()=>plan(setup(override).state)).throws());
 it('restart after confirmed batch follows sold, not local counter',async()=>{const f=setup({sold:1950}),wait=f.api.wait;let calls=0;f.api.read=async()=>{if(++calls===5)throw Error('RPC offline');return {...f.state};};await expect(execute(f.api,f.options)).rejected;f.api.read=async()=>({...f.state});f.api.wait=wait;await execute(f.api,f.options);expect(f.state.sold).eq(2000);expect(f.sent.filter(x=>x.kind==='mint')).length(2);});
 it('ambiguous receipt stops; restart never resends unknown transaction',async()=>{const f=setup({sold:1999});f.api.wait=async()=>null;f.api.receipt=async()=>null;await expect(execute(f.api,f.options)).rejected;await expect(execute(f.api,f.options)).rejected;expect(f.sent).length(1);});
 it('lost broadcast response without hash requires manual nonce reconciliation',async()=>{const f=setup();f.api.send=async()=>{f.sent.push({});throw Error('timeout');};await expect(execute(f.api,f.options)).rejected;await expect(execute(f.api,f.options)).rejectedWith('Unknown broadcast');expect(f.sent).length(1);});
 it('approves exact remaining cost in a separate idempotent phase, never unlimited',async()=>{
  const f=setup({sold:1999,allowance:0n});
  await expect(execute(f.api,f.options)).rejectedWith('Separate approval phase required');
  expect(f.sent).length(0);

  const approved=await execute(f.api,{...f.options,mode:'approve'});
  expect(approved.status).eq('approval complete');
  expect(f.sent).deep.eq([{kind:'approve',amount:30000000n}]);
  expect(f.state.allowance).eq(30000000n);

  const repeated=await execute(f.api,{...f.options,mode:'approve'});
  expect(repeated.status).eq('approval already sufficient; no repeat');
  expect(f.sent).length(1);

  await execute(f.api,f.options);
  expect(f.sent).deep.eq([
    {kind:'approve',amount:30000000n},
    {kind:'mint',amount:1}
  ]);
  expect(f.state.sold).eq(2000);
 });
 it('sufficient allowance does not approve',async()=>{const f=setup({sold:1999});await execute(f.api,f.options);expect(f.sent.some(x=>x.kind==='approve')).eq(false);});
 it('funding is separate and confirmed funding is never duplicated',async()=>{const f=setup({balance:0n,sold:1999});await expect(execute(f.api,f.options)).rejectedWith('Separate funding');await execute(f.api,{...f.options,mode:'fund'});await execute(f.api,{...f.options,mode:'fund'});expect(f.sent).deep.eq([{kind:'fund',amount:30000000n}]);});
 it('receipt failure, insufficient ETH and insufficient token balance fail closed',async()=>{const f=setup({sold:1999});f.api.quote=async()=>({sufficient:false});await expect(execute(f.api,f.options)).rejected;expect(f.sent).length(0);const g=setup({sold:1999});g.api.wait=async()=>({status:0});await expect(execute(g.api,g.options)).rejected;});
 it('deadline between batches stops without subsequent send',async()=>{const f=setup({sold:1950});f.api.verify=async()=>{f.state.now=100;};await expect(execute(f.api,f.options)).rejectedWith('expired');expect(f.sent).length(1);});
 it('another buyer consuming supply stops the next batch at current sold',async()=>{const f=setup({sold:1950});f.api.verify=async()=>{f.state.sold=2000;};await execute(f.api,f.options);expect(f.sent).length(1);});
 it('read-only dry-run at zero produces80 without sending or funding',async()=>{const f=setup({balance:0n,allowance:0n});const r=await dryRun(f.api);expect(r.mintTransactions).eq(80);expect(r.required).eq(60000000000n);expect(f.sent).length(0);console.log('LOCAL_DRY_RUN '+JSON.stringify({transport:'in-memory fixture; no live RPC',sold:r.sold,mintTransactions:r.mintTransactions,required:String(r.required),funding:String(r.funding),approval:String(r.approval),sends:f.sent.length}));});
 it('dry-run sends nothing and marks unavailable estimates NO-GO',async()=>{const f=setup({sold:1999});f.api.quote=async()=>{throw Error('allowance');};expect((await dryRun(f.api)).status).contains('NO-GO');expect(f.sent).length(0);});
 it('local dry-run reports exact remaining units and bounded gas budget',async()=>{const f=setup({sold:1963,allowance:0n,balance:0n});const r=await dryRun(f.api);expect(r.mintTransactions).eq(2);expect(r.required).eq(1110000000n);expect(r.funding).eq(r.required);expect(f.sent).length(0);});
});
describe('Sold-out operator local gas evidence (Hardhat only)',function(){this.timeout(120000);
 it('measures actual fund/approve/80 mint receipts and verifies first25 ownership/VP',async()=>{
 const [owner,buyer,team,audit,project,treasury]=await ethers.getSigners();const token=await(await ethers.getContractFactory('MockUSDC')).deploy(),g=await(await ethers.getContractFactory('GenesisHorses')).deploy('local test');await g.setTeamWallet(team.address);
 const head=await ethers.provider.getBlock('latest'),sale=await(await ethers.getContractFactory('HOFGenesisSale')).deploy(token.target,g.target,head.timestamp+604800,treasury.address,audit.address,project.address);await g.setSaleContract(sale.target);
 const funding=await(await token.mint(buyer.address,60000000000n)).wait(),approve=await(await token.connect(buyer).approve(sale.target,60000000000n)).wait();const gas=[];
 for(let i=0;i<80;i++){gas.push((await(await sale.connect(buyer).mint(25)).wait()).gasUsed);if(i===0){for(let n=1;n<=25;n++){expect(await g.ownerOf(n)).eq(buyer.address);expect(await g.votingPowerOf(n)).eq(n<=22?0:5);}}}
 expect(await sale.sold()).eq(2000);expect(await g.communityAllocationMinted()).eq(0);expect(await g.teamReserveMinted()).eq(0);
 console.log('LOCAL_GAS '+JSON.stringify({fund:String(funding.gasUsed),approve:String(approve.gasUsed),first25:String(gas[0]),later25:String(gas[1]),last25:String(gas[79]),maximum25:String(gas.reduce((a,b)=>a>b?a:b)),mintTotal:String(gas.reduce((a,b)=>a+b)),mintTx:80,totalTx:82}));
 });
});
