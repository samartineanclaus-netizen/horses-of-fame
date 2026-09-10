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
const signed=require('../lib/owner-voting/signed-ballot.cjs');
test('sponsored Voting: canonical selection, one signature, admission retry and paid fallback states',async()=>{
 const env={...process.env};Object.assign(process.env,{NEXT_PUBLIC_HOF_RPC_URL:'http://test',NEXT_PUBLIC_HOF_CHAIN_ID:'1',NEXT_PUBLIC_HOF_TRUSTED_RACE:'0x0000000000000000000000000000000000000100',NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS:'0x0000000000000000000000000000000000000200',NEXT_PUBLIC_HOF_SIGNED_VOTING:'enabled'});
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hof.test'});
 const old={window:global.window,document:global.document,localStorage:global.localStorage,fetch:global.fetch};
 global.window=dom.window;global.document=dom.window.document;global.localStorage=dom.window.localStorage;global.IS_REACT_ACT_ENVIRONMENT=true;
 const wallet='0x0000000000000000000000000000000000000300',other='0x0000000000000000000000000000000000000400',genesisAddress='0x0000000000000000000000000000000000000500';
 const calls=[],fallbacks=[];let state='Submitted',release,submissions=0;
 const pending=new Promise(r=>{release=r;});
 window.ethereum={on(){},removeListener(){},request:async({method})=>method==='eth_accounts'?[wallet]:'0x1'};
 const signer={getAddress:async()=>wallet};
 class Provider{async getNetwork(){return{chainId:1n};}async getBlock(){return{number:10,hash:'hash',timestamp:100};}async getSigner(){return signer;}destroy(){}}
 const race={genesis:async()=>genesisAddress,opensAt:async()=>0n,closesAt:async()=>86500n,finalized:async()=>false,frozen:async()=>false,hofOwner:async()=>other,backendSigner:async()=>other,teamReserveWallet:async()=>other,ballotIndexPlusOne:async()=>0n,tokenUsed:async()=>false,connect(){return this;},submitSigned:async p=>{fallbacks.push(p);state='Included on-chain';return{wait:async()=>({status:1})};}};
 const genesis={balanceOf:async()=>1n,tokenOfOwnerByIndex:async()=>500n,votingPowerOf:async()=>1n};
 const mocks={ethers:{...ethers,JsonRpcProvider:Provider,BrowserProvider:Provider,Contract:class{constructor(address){return address===process.env.NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS?{registeredRace:async()=>true}:genesis;}}},
 '../../lib/owner-voting/signed-ballot.cjs':{...signed,signedRaceAt:()=>race,inclusionState:async()=>state,signVote:async(_r,_s,horse,tokens)=>{calls.push({horse,tokens});return{intent:{voter:wallet,race:process.env.NEXT_PUBLIC_HOF_TRUSTED_RACE,nonce:'0'},ciphertext:'encrypted',signature:'signature',tokenIds:['500']};}},
 'next/image':({src,alt,width,height,style})=>React.createElement('img',{src,alt,width,height,style})};
 global.fetch=async(url)=>{if(url==='/api/vote/prepare'){await pending;return{ok:true,json:async()=>({admission:'admitted'})};}assert.equal(url,'/api/vote/submit');return{ok:++submissions>1,json:async()=>({state:'Vote confirmed'})};};
 const {createRoot}=require('react-dom/client'),Voting=loadComponent(path.join(__dirname,'../src/components/Voting.jsx'),mocks).default,container=document.getElementById('root'),root=createRoot(container);
 const button=name=>[...container.querySelectorAll('button')].find(b=>b.textContent===name),click=async b=>{assert.ok(b);await act(async()=>{b.click();});};
 try{
  await act(async()=>root.render(React.createElement(Voting,{mode:'vote'})));await click(button('Connect Wallet'));
  assert.equal(button('Vote').disabled,true);const cards=[...container.querySelectorAll('.hofGrid button')];assert.equal(cards.length,22);
  await click(cards[12]);await click(cards[7]);assert.equal(cards.filter(b=>b.getAttribute('aria-pressed')==='true').length,1);
  await click(button('Vote'));assert.match(container.textContent,/Signed/);assert.equal(calls.length,1);assert.equal(calls[0].horse,8);assert.deepEqual(calls[0].tokens,[{id:'500',vp:1}]);
  await act(async()=>{release();await new Promise(r=>setImmediate(r));});assert.equal(container.querySelector('[role="status"]').textContent,'Signed');
  await click(button('Refresh'));assert.equal(container.querySelector('[role="status"]').textContent,'Signed');
  assert.equal(container.querySelectorAll('table').length,0);assert.equal(cards.some(b=>/VP|votes|points/.test(b.textContent)),false);
  await click(button('Retry signed vote'));assert.equal(calls.length,1);assert.equal(container.querySelector('[role="status"]').textContent,'Submitted');
  await click(button('Send directly · pay gas'));assert.equal(fallbacks.length,1);assert.equal(fallbacks[0].signature,'signature');assert.equal(fallbacks[0].admission,'admitted');assert.equal(container.querySelector('[role="status"]').textContent,'Included on-chain');
  state='Vote confirmed';await click(button('Refresh'));assert.equal(container.querySelector('[role="status"]').textContent,'Vote confirmed');
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(global,old);process.env=env;}
});
