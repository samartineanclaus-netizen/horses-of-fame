// DOM/component tests only. This file is never imported by the application.
// Mount the actual Voting and portrait components; replace only external I/O
// and Next's image transport. No wallet, RPC or network transaction is sent.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const ts=require('typescript');
const {JSDOM}=require('jsdom');
const React=require('react');
const {act}=React;
const {hofHorses}=require('../src/lib/hofHorses');
const adapter=require('../lib/owner-voting/website.cjs');
const ethers=require('ethers');

function loadComponent(filename, mocks, cache=new Map()) {
 if(cache.has(filename))return cache.get(filename).exports;
 const local=Module.createRequire(filename),mod=new Module(filename,module);
 cache.set(filename,mod);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod.require=request=>{
  if(Object.hasOwn(mocks,request))return mocks[request];
  const jsx=path.resolve(path.dirname(filename),request+'.jsx');
  const resolved=request.startsWith('.')&&fs.existsSync(jsx)?jsx:local.resolve(request);
  return resolved.endsWith('.jsx')?loadComponent(resolved,mocks,cache):local(request);
 };
 const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 mod._compile(code,filename);return mod.exports;
}

test('actual Voting component: canonical selection, transaction boundary, privacy and lifecycle',async t=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://hof.test'});
 const previous={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT,fetch:global.fetch};
 global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client');
 const keys=['NEXT_PUBLIC_HOF_RPC_URL','NEXT_PUBLIC_HOF_CHAIN_ID','NEXT_PUBLIC_HOF_TRUSTED_RACE','NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS'];
 const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const wallet='0x'+'11'.repeat(20),raceAddress='0x'+'22'.repeat(20),boardAddress='0x'+'33'.repeat(20),genesisAddress='0x'+'44'.repeat(20),owner='0x'+'55'.repeat(20);
 [process.env.NEXT_PUBLIC_HOF_RPC_URL,process.env.NEXT_PUBLIC_HOF_CHAIN_ID,process.env.NEXT_PUBLIC_HOF_TRUSTED_RACE,process.env.NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS]=['https://rpc.invalid','1',raceAddress,boardAddress];
 const listeners=new Map(),calls=[],privateReads=[];
 let opens=100,closes=86500,now=200,account=wallet,root;
 const ethereum={on:(name,fn)=>listeners.set(name,fn),removeListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);},request:async({method})=>method==='eth_accounts'?[account]:method==='eth_chainId'?'0x1':assert.fail('Unexpected wallet request: '+method)};
 window.ethereum=ethereum;
 const signer={getAddress:async()=>account};
 class Provider {async getNetwork(){return{chainId:1n};}async getBlock(){return{number:10,hash:'0xabc',timestamp:now};}async getSigner(){return signer;}destroy(){}}
 const race={opensAt:async()=>opens,closesAt:async()=>closes,finalized:async()=>false,frozen:async()=>false,genesis:async()=>genesisAddress,hofOwner:async()=>owner,backendSigner:async()=>owner,teamReserveWallet:async()=>owner,ballotIndexPlusOne:async()=>0n,tokenUsed:async()=>false};
 for(const method of ['ranking','horseVP','horseRacePoints','acceptedBallotCount'])race[method]=async()=>{privateReads.push(method);throw Error('Partial results must not be read');};
 const board={registeredRace:async()=>true};
 const genesis={balanceOf:async()=>1n,tokenOfOwnerByIndex:async()=>500n,votingPowerOf:async()=>1n};
 const mocks={
  ethers:{...ethers,JsonRpcProvider:Provider,BrowserProvider:Provider,Contract:class{constructor(address){return address===boardAddress?board:genesis;}}},
  '../../lib/owner-voting/website.cjs':{...adapter,raceAt:()=>race},
  '../../lib/owner-voting/ballot.cjs':{voteOnce:async(_race,_signer,horse,tokens,admit,guard)=>{calls.push({horse,tokens});await admit({wallet,commitment:'encrypted-commitment',ciphertext:'encrypted-ballot'});await guard();return{wait:async()=>({status:1})};}},
  'next/image':function Image({src,alt,width,height,style}){return React.createElement('img',{src,alt,width,height,style});}
 };
 global.fetch=async(url,options)=>{assert.equal(url,'/api/vote/admission');const body=JSON.parse(options.body);assert.equal(body.ciphertext,'encrypted-ballot');assert.equal(Object.hasOwn(body,'horse'),false);return{ok:true,json:async()=>({deadline:closes,signature:'test-only'})};};
 const Voting=loadComponent(path.join(__dirname,'../src/components/Voting.jsx'),mocks).default;
 const container=document.getElementById('root');
 const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent===name);
 const cards=()=>[...container.querySelectorAll('.hofGrid button')];
 const selected=()=>cards().filter(b=>b.getAttribute('aria-pressed')==='true');
 const click=async element=>{assert.ok(element);await act(async()=>{element.click();});};
 async function mount(mode='vote') {root=createRoot(container);await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(Voting,{mode})));});}
 async function unmount(){if(root){await act(async()=>root.unmount());root=null;}}
 try {
  await mount();
  await t.test('renders exactly22 official horses in canonical order with accessible names',()=>{
   assert.equal(cards().length,22);
   assert.deepEqual(cards().map(b=>b.querySelector('.hofNumber').textContent),hofHorses.map(h=>'#'+String(h.number).padStart(4,'0')));
   cards().forEach((b,i)=>{assert.equal(b.getAttribute('aria-label'),`${hofHorses[i].name} · ${hofHorses[i].breed} · #${String(i+1).padStart(4,'0')}`);assert.ok(b.querySelector('img').alt);});
  });
  await t.test('connected eligible wallet cannot Vote without a selection',async()=>{
   await click(button('Connect Wallet'));assert.equal(button('Vote').disabled,true);await click(button('Vote'));assert.equal(calls.length,0);
  });
  await t.test('click selects one horse; changing selection deselects the previous one',async()=>{
   await click(cards()[7]);assert.equal(selected().length,1);assert.match(selected()[0].textContent,/#0008SOBERANO/);assert.equal(button('Vote').disabled,false);
   await click(cards()[12]);assert.equal(selected().length,1);assert.match(selected()[0].textContent,/#0013VALIANT/);assert.equal(cards()[7].getAttribute('aria-pressed'),'false');
  });
  await t.test('Vote passes the canonical number13 to the real UI submission boundary',async()=>{
   await click(button('Vote'));assert.deepEqual(calls,[{horse:13,tokens:['500']}]);assert.match(container.textContent,/Vote recorded/);
  });
  await t.test('open voting exposes no interim ranking, totals, result table or reveal/claim controls',()=>{
   assert.deepEqual(privateReads,[]);assert.equal(container.querySelectorAll('table').length,0);
   assert.equal([...container.querySelectorAll('button')].some(b=>/reveal|claim/i.test(b.textContent)),false);
   assert.equal(cards().some(b=>/votes|points|VP|position/i.test(b.textContent)),false);
  });
  await t.test('account changes clear selection and invalidate voting eligibility',async()=>{
   await click(cards()[20]);await act(async()=>{account=owner;listeners.get('accountsChanged')([owner]);});
   assert.equal(selected().length,0);assert.equal(button('Vote').disabled,true);
   await click(button('Connect Wallet'));assert.match(container.textContent,/excluded from voting/);assert.equal(button('Vote').disabled,true);
  });
  await t.test('exact closing timestamp disables selection and Vote',async()=>{
   await unmount();account=wallet;now=closes;await mount();await click(button('Connect Wallet'));
   assert.equal(button('Vote').disabled,true);assert.ok(cards().every(b=>b.disabled));assert.equal(container.querySelector('[role="timer"]').textContent,'00:00:00');
  });
  await t.test('Race Reveal page also hides interim totals while voting is open',async()=>{
   await unmount();now=200;await mount('results');assert.equal(container.querySelectorAll('table').length,0);assert.match(container.textContent,/Waiting for Race Reveal/);assert.deepEqual(privateReads,[]);
  });
  await t.test('closed and frozen phases show real waiting/preparation with no results',async()=>{
   await unmount();now=closes;await mount('results');assert.match(container.textContent,/Voting Closed/);assert.equal(container.querySelectorAll('tbody tr').length,0);
   await unmount();race.frozen=async()=>true;await mount('results');assert.match(container.textContent,/Preparing Race Reveal/);assert.equal(container.querySelectorAll('tbody tr').length,0);assert.doesNotMatch(container.textContent,/Leaderboards Updated/);
  });
  await t.test('complete finalized race exposes exactly22 rows and both board activation',async()=>{
   await unmount();race.finalized=async()=>true;race.ranking=async()=>Array.from({length:22},(_,i)=>i+1);race.horseVP=async()=>Array(22).fill(0n);race.horseRacePoints=async()=>Array(22).fill(0n);race.acceptedBallotCount=async()=>0n;
   board.raceCount=async()=>1n;board.currentSeason=async()=>1n;board.races=async()=>raceAddress;
   await mount('results');assert.match(container.textContent,/Race Revealed/);assert.equal(container.querySelectorAll('tbody tr').length,22);
   await unmount();await mount('standings');assert.match(container.textContent,/Leaderboards Updated/);
  });
  await t.test('StrictMode cleanup removes wallet subscriptions',async()=>{await unmount();assert.equal(listeners.size,0);});
 } finally {
  await unmount();dom.window.close();Object.assign(global,previous);
  for(const k of keys){if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k];}
 }
});
