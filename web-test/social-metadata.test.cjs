const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript');

test('social metadata always supplies public canonical images without a site URL env',()=>{
 const previous=process.env.NEXT_PUBLIC_HOF_SITE_URL;
 delete process.env.NEXT_PUBLIC_HOF_SITE_URL;
 try{
  const filename=path.join(__dirname,'../src/app/layout.tsx');
  const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
  const local=Module.createRequire(filename);
  mod.require=name=>name.endsWith('.css')?{}:name==='@/components/BrandHeader'?()=>null:local(name);
  mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText,filename);
  const {metadata}=mod.exports;
  assert.equal(metadata.metadataBase.href,'https://hof-site.vercel.app/');
  assert.equal(metadata.twitter.card,'summary_large_image');
  for(const group of [metadata.openGraph,metadata.twitter]){
   assert.equal(group.images[0].url,'https://hof-site.vercel.app/brand/hof-banner.webp');
   assert.ok(group.images[0].alt);
  }
  const image=fs.readFileSync(path.join(__dirname,'../public/brand/hof-banner.webp'));
  assert.ok(image.length<5_000_000);
  assert.equal(image.subarray(8,12).toString(),'WEBP');
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_HOF_SITE_URL;else process.env.NEXT_PUBLIC_HOF_SITE_URL=previous;}
});
