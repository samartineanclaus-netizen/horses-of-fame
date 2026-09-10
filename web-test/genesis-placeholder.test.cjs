const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {validatePlaceholder,publicURL,MINT_WINDOW_SECONDS}=require('../scripts/v7-placeholder.cjs');
const metadata=require('../public/genesis/unrevealed.json');
const uri='https://hof-fixture.example.org/genesis/unrevealed.json'; // Test fixture only; no network requests.
const logo=fs.readFileSync('public/assets/hof-logo.webp');
function fetcher(data=metadata,options={}) {return async url=> url.endsWith('.json') ? new Response(typeof data==='string'?data:JSON.stringify(data),{status:options.jsonStatus||200}) : new Response(options.image||logo,{status:options.imageStatus||200,headers:{'content-type':options.type||'image/webp'}});}
test('canonical metadata only has name, description and root-relative original logo',async()=>{
 assert.deepEqual(Object.keys(metadata).sort(),['description','image','name']);assert.match(metadata.description,/TESTNET \/ TEST ONLY \/ NO VALUE/);assert.equal(metadata.image,'/assets/hof-logo.webp');
 const calls=[];const mock=fetcher();await validatePlaceholder(uri,46630,async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');return mock(url);});assert.deepEqual(calls,[uri,'https://hof-fixture.example.org/assets/hof-logo.webp']);
});
test('mint window is exactly seven days',()=>assert.equal(MINT_WINDOW_SECONDS,604800n));
for(const chain of [1,466,42161]) test(`testnet metadata rejected on chain ${chain} before HTTP`,async()=>assert.rejects(validatePlaceholder(uri,chain,()=>{throw Error('unexpected HTTP');}),/TESTNET/));
for(const url of ['https://<domain>/genesis/unrevealed.json','https://%3Cdomain%3E/genesis/unrevealed.json','https://your_domain.com/genesis/unrevealed.json','http://real.org/genesis/unrevealed.json','https://example.com/genesis/unrevealed.json','https://real.org/metadata/1.json','https://real.org/genesis/','https://real.org/genesis/unrevealed.json?token=secret']) test(`reject invalid URI ${url}`,()=>assert.throws(()=>publicURL(url)));
for(const field of ['rarity','VP','horseId','attributes']) test(`reject ${field}`,async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher({...metadata,[field]:1})),/canonical/));
test('reject modified name and token-specific metadata',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher({...metadata,name:'Genesis #1'})),/canonical/));
test('reject invalid JSON',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher('<html>')),/JSON/));
test('reject JSON HTTP 404',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher(metadata,{jsonStatus:404})),/200/));
test('reject image HTTP 404',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher(metadata,{imageStatus:404})),/200/));
test('reject HTML masquerading as image',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher(metadata,{image:'not an image'})),/WebP/));
test('reject invalid image MIME',async()=>assert.rejects(validatePlaceholder(uri,46630,fetcher(metadata,{type:'text/html'})),/WebP/));
test('HTTP timeout or redirect failure blocks deployment',async()=>assert.rejects(validatePlaceholder(uri,46630,async()=>{throw Error('timeout/redirect');}),/timeout/));
test('canonical deployment validates before writes and has no legacy metadata path',()=>{
 const deploy=fs.readFileSync('scripts/deploy-v7-system.js','utf8');const config=fs.readFileSync('scripts/v7-canonical-config.cjs','utf8');const preflight=fs.readFileSync('scripts/preflight-v7-readiness.cjs','utf8');
 assert.ok(deploy.indexOf('await validateSystem')<deploy.indexOf("await deploy('GenesisHorses'"));assert.match(config,/await validatePlaceholder/);assert.match(preflight,/await validateSystem/);
 for(const source of [deploy,config,preflight]) assert.doesNotMatch(source,/set-test-metadata|metadata\/1\.json/);
});

test('MockUSDC entrypoint checks placeholder before deploying token',()=>{const source=fs.readFileSync('scripts/deploy-testnet-mock-usdc.cjs','utf8');assert.ok(source.indexOf('validatePlaceholder(')<source.indexOf('factory.deploy('));});
