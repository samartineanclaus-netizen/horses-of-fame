const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');

test('approved brand originals preserve their exact bytes and derived assets exist',()=>{
 const manifest=require('../src/data/brandAssets.json');
 assert.deepEqual(manifest.map(a=>a.name),['hof-logo','hof-banner']);
 for(const asset of manifest){
  const original=fs.readFileSync(path.join(root,asset.original));
  assert.equal(crypto.createHash('sha256').update(original).digest('hex'),asset.sha256);
  const web=fs.readFileSync(path.join(root,'public',asset.web));
  assert.equal(web.subarray(8,12).toString(),'WEBP');
 }
});
test('canonical TESTNET placeholder uses only generic approved branding',()=>{
 const metadata=require('../public/genesis/unrevealed.json');
 assert.deepEqual(Object.keys(metadata).sort(),['description','image','name']);
 assert.equal(metadata.image,'https://hof-site.vercel.app/brand/hof-logo.webp');
 for(const marker of ['TESTNET','TEST ONLY','NO VALUE'])assert.ok(metadata.description.includes(marker));
});
test('public frontend does not reference retired collection artwork or legacy voting actions',()=>{
 const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const file of [...walk(path.join(root,'src/app')),...walk(path.join(root,'src/components'))].filter(f=>/\.(tsx|jsx)$/.test(f))){
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/hero-hof\.png|collection-banner\.png|Reveal Pick|Claim Community Points|hidden among/i,file);
 }
});
test('legacy public dashboard routes redirect to canonical race and leaderboards',()=>{
 for(const [route,target] of [['wallet','/race'],['history','/standings']]){
  assert.match(fs.readFileSync(path.join(root,'src/app',route,'page.tsx'),'utf8'),new RegExp('redirect\\(["\']'+target+'["\']\\)'));
 }
});
