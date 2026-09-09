const {test}=require('node:test');
const assert=require('node:assert/strict');
const {phaseAt,readRace,inventory,readLeaderboards,assertSnapshot,mapLimited}=require('../lib/owner-voting/website.cjs');
const {admissionProxy}=require('../lib/owner-voting/proxy.cjs');
const block={number:100,timestamp:200,hash:'0xabc'};
const pinned=v=>async (...args)=>{assert.deepEqual(args.at(-1),{blockTag:100});return v;};
const address='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20);
test('deadline: open inclusive, close exclusive, unfinished stays awaiting',()=>{
 assert.equal(phaseAt(100,200,false,99),'scheduled');assert.equal(phaseAt(100,200,false,100),'open');
 assert.equal(phaseAt(100,200,false,199),'open');assert.equal(phaseAt(100,200,false,200),'awaiting');
 assert.equal(phaseAt(100,200,false,300),'awaiting');assert.equal(phaseAt(100,200,true,300),'finalized');
});
test('no partial results read while awaiting finalization',async()=>{
 const race={opensAt:pinned(100),closesAt:pinned(200),finalized:pinned(false),ranking:()=>assert.fail('must not read')};
 assert.deepEqual((await readRace(race,block)).rows,[]);
});
test('complete 22-horse result, same block, reject incomplete result',async()=>{
 const race={opensAt:pinned(100),closesAt:pinned(200),finalized:pinned(true),ranking:pinned(Array.from({length:22},(_,i)=>i+1)),horseVP:pinned(Array(22).fill(1n)),horseRacePoints:pinned(Array(22).fill(0n))};
 assert.equal((await readRace(race,block)).rows.length,22);
 race.ranking=pinned([1,2]);await assert.rejects(readRace(race,block),/Incomplete/);
});
test('duplicate horse identities and missing totals reject the entire Race Reveal',async()=>{
 const race={opensAt:pinned(100),closesAt:pinned(200),finalized:pinned(true),ranking:pinned(Array(22).fill(1)),horseVP:pinned(Array(22).fill(1n)),horseRacePoints:pinned(Array(22).fill(0n))};
 await assert.rejects(readRace(race,block),/Incomplete/);
 race.ranking=pinned(Array.from({length:22},(_,i)=>i+1));race.horseVP=pinned([1n]);
 await assert.rejects(readRace(race,block),/Incomplete/);
 race.horseVP=pinned(Array(22).fill(1n));race.horseRacePoints=pinned([0n]);
 await assert.rejects(readRace(race,block),/Incomplete/);
});
test('owner excluded; used NFTs and nonvoting NFTs filtered',async()=>{
 const race={hofOwner:pinned(other),backendSigner:pinned(other),teamReserveWallet:pinned(other),ballotIndexPlusOne:pinned(0n),tokenUsed:async id=>id===2n};
 const genesis={balanceOf:pinned(3n),tokenOfOwnerByIndex:async(_,i)=>BigInt(i+1),votingPowerOf:async id=>id===3n?0n:1n};
 assert.deepEqual((await inventory(race,genesis,address,block)).tokens,[{id:'1',vp:1}]);
 assert.equal((await inventory(race,genesis,other,block)).excluded,true);
});
test('both leaderboards include finalized votes without participant indexing or claims',async()=>{
 const board={raceCount:pinned(2n),currentSeason:pinned(1n),races:async i=>'race'+i};
 const finalized={finalized:pinned(true),acceptedBallotCount:pinned(1n),horseRacePoints:pinned([25,...Array(21).fill(0)]),ballotAt:pinned({wallet:address}),pointsOf:pinned(25n)};
 const pending={finalized:pinned(false),ballotAt:()=>assert.fail('no partial race')};
 const result=await readLeaderboards(board,a=>a==='race0'?finalized:pending,block);
 assert.deepEqual(result.wallets,[{wallet:address,season:25,allTime:25}]);assert.equal(result.horses[0].season,25);assert.equal(result.horses[0].allTime,25);
});
test('season rollover does not duplicate all-time or leak prior-season points',async()=>{
 const board={raceCount:pinned(11n),currentSeason:pinned(2n),races:async i=>i};
 const race={finalized:pinned(true),acceptedBallotCount:pinned(1n),horseRacePoints:pinned(Array(22).fill(0)),ballotAt:pinned({wallet:address}),pointsOf:pinned(25n)};
 const result=await readLeaderboards(board,()=>race,block);
 assert.equal(result.wallets[0].season,25);assert.equal(result.wallets[0].allTime,275);
});
test('incomplete RPC snapshot rejects entire leaderboard',async()=>{
 const board={raceCount:pinned(1n),currentSeason:pinned(1n),races:pinned('race')};
 await assert.rejects(readLeaderboards(board,()=>({finalized:pinned(true),acceptedBallotCount:pinned(2n),horseRacePoints:pinned(Array(22).fill(0)),ballotAt:async()=>{throw Error('RPC failure');}}),block),/RPC failure/);
 await assert.rejects(assertSnapshot({getBlock:async()=>({hash:'changed'})},block),/Chain changed/);
});
test('RPC fanout bounded and original order preserved',async()=>{
 let concurrent=0,peak=0;
 const values=await mapLimited(Array.from({length:25},(_,i)=>i),async i=>{concurrent++;peak=Math.max(peak,concurrent);await new Promise(r=>setTimeout(r,1));concurrent--;return i;},4);
 assert.equal(peak,4);assert.equal(values[24],24);
});
const ballot={wallet:address,commitment:'0x'+'ab'.repeat(32),ciphertext:'0x01'+'cd'.repeat(445)};
const req=(body=ballot,origin='https://hof.test')=>new Request('https://hof.test/api/vote/admission',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)});
test('admission proxy forwards ciphertext only and strips extra backend fields',async()=>{
 const res=await admissionProxy(req(),'http://localhost:9000/vote/admission',async(url,opts)=>{
 assert.deepEqual(JSON.parse(opts.body),ballot);assert.equal(opts.redirect,'error');
 return Response.json({deadline:'200',signature:'0x'+'aa'.repeat(65),horse:7,salt:'private'});
 });
 assert.equal(res.status,200);assert.deepEqual(Object.keys(await res.json()).sort(),['deadline','signature']);assert.equal(res.headers.get('cache-control'),'no-store');
});
test('admission rejects plaintext, oversized input, foreign origin, missing backend',async()=>{
 const never=()=>assert.fail('must not forward');
 assert.equal((await admissionProxy(req({...ballot,horse:7}),'http://localhost',never)).status,400);
 assert.equal((await admissionProxy(req({...ballot,ciphertext:'x'.repeat(5000)}),'http://localhost',never)).status,413);
 assert.equal((await admissionProxy(req(ballot,'https://evil.test'),'http://localhost',never)).status,403);
 assert.equal((await admissionProxy(req(),undefined,never)).status,503);
});
test('admission errors fail closed without exposing private diagnostics',async()=>{
 const res=await admissionProxy(req(),'http://localhost',async()=>Response.json({error:'secret'}, {status:500}));
 assert.equal(res.status,400);assert.equal(JSON.stringify(await res.json()).includes('secret'),false);
});

test('wallet session rechecks accounts and chain without prompting a signature',async()=>{
 const {assertWalletSession}=require('../lib/owner-voting/wallet-session.cjs');
 const calls=[];
 const ethereum={request:async({method})=>{calls.push(method);return method==='eth_accounts'?[address]:'0x1';}};
 await assertWalletSession(ethereum,address,1,()=>true);
 assert.deepEqual(calls.sort(),['eth_accounts','eth_chainId']);
 await assert.rejects(assertWalletSession(ethereum,other,1,()=>true),/changed/);
 await assert.rejects(assertWalletSession(ethereum,address,2,()=>true),/changed/);
 await assert.rejects(assertWalletSession(ethereum,address,1,()=>false),/changed/);
});
test('wallet change during asynchronous session check blocks sending',async()=>{
 const {assertWalletSession}=require('../lib/owner-voting/wallet-session.cjs');
 let current=true;
 const ethereum={request:async({method})=>{current=false;return method==='eth_accounts'?[address]:'0x1';}};
 await assert.rejects(assertWalletSession(ethereum,address,1,()=>current),/changed/);
});
