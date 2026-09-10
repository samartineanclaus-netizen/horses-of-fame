const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const artworks=require('../src/data/legendaryArtwork.json');

test('15 Legendary originals are intact, distinct and separate from canonical HOF',()=>{
 const manifest=require('../src/data/legendaryOriginalIntegrity.json');
 const {hofHorses}=require('../src/lib/hofHorses');
 assert.equal(artworks.length,15);assert.equal(manifest.length,15);
 assert.equal(new Set(manifest.map(a=>a.sha256)).size,15);
 assert.deepEqual(hofHorses.map(h=>h.id),Array.from({length:22},(_,i)=>i+1));
 for(const a of artworks){
  assert.deepEqual(Object.keys(a).sort(),['alt','assetKey','height','image','label','width']);
  assert.ok(!hofHorses.some(h=>h.image===a.image));
  const m=manifest.find(m=>m.assetKey===a.assetKey);
  const data=fs.readFileSync(path.join(root,m.original));
  assert.equal(data.length,m.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),m.sha256);
  assert.ok(fs.existsSync(path.join(root,'public',a.image)));
 }
 for(const file of ['src/components/Voting.jsx','src/lib/hofHorses.js'])assert.doesNotMatch(fs.readFileSync(path.join(root,file),'utf8'),/legendaryArtwork|LegendaryGallery/);
});

test('Legendary gallery renders15, preview4, lazy derivatives and accessible enlargement',async()=>{
 const React=require('react'),{act}=React,{JSDOM}=require('jsdom'),Module=require('node:module'),ts=require('typescript');
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 const old={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 // jsdom has no native modal implementation. Test adapter only; production uses native dialog.
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.window.Event('close'))};
 const filename=path.join(root,'src/components/LegendaryGallery.jsx'),mod=new Module(filename,module),local=Module.createRequire(filename);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 mod.require=name=>name==='next/image'?function Image(props){const imgProps={...props};delete imgProps.quality;return React.createElement('img',imgProps)}:local(name);
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
 const Gallery=mod.exports.default,container=document.getElementById('root'),mounted=require('react-dom/client').createRoot(container);
 try{
  await act(async()=>mounted.render(React.createElement(Gallery,{preview:true})));
  assert.equal(container.querySelectorAll('.legendaryCard').length,4);
  assert.equal(container.querySelectorAll('img').length,4,'no hidden full gallery/downloads in preview');
  for(const img of container.querySelectorAll('img')){assert.equal(img.getAttribute('loading'),'lazy');assert.ok(img.alt);assert.ok(img.src.includes('/web/'));}
  await act(async()=>mounted.render(React.createElement(Gallery)));
  assert.equal(container.querySelectorAll('.legendaryCard').length,15);
  const button=container.querySelectorAll('.legendaryCard')[7];button.focus();
  assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  await act(async()=>button.click());
  const dialog=container.querySelector('dialog');assert.ok(dialog.open);
  assert.equal(dialog.querySelector('h2').textContent,'Legendary Artwork 08');
  assert.ok(dialog.querySelector('img').src.endsWith(artworks[7].image));
  await act(async()=>dialog.querySelector('button').click());
  assert.equal(dialog.open,false);assert.equal(document.activeElement,button);
  assert.equal(dialog.querySelector('img'),null);
 }finally{await act(async()=>mounted.unmount());Object.assign(global,old);dom.window.close();}
});
