const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const React=require('react'),{act}=React,{JSDOM}=require('jsdom');

test('header connects through verified wallet helper, resets on change and does not submit transactions',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://hof.test'});
 const old={window:global.window,document:global.document,IS_REACT_ACT_ENVIRONMENT:global.IS_REACT_ACT_ENVIRONMENT};
 Object.assign(global,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const listeners=new Map(),requests=[];let connections=0;
 const ethereum={request:async({method})=>{requests.push(method);if(method==='eth_accounts')return[];if(method==='eth_chainId')return'0xb626';throw Error('Unexpected wallet call')},on:(e,fn)=>listeners.set(e,fn),removeListener:e=>listeners.delete(e)};
 window.ethereum=ethereum;
 const filename=path.join(__dirname,'../src/components/BrandHeader.jsx'),mod=new Module(filename,module),local=Module.createRequire(filename);
 mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
 const mocks={'next/image':function Image(props){const p={...props};delete p.priority;return React.createElement('img',p)},'next/link':function Link(props){return React.createElement('a',props)},'next/navigation':{usePathname:()=>'/race'},'../lib/hofClient':{getEthereum:()=>window.ethereum,requestAccount:async provider=>{assert.equal(provider,ethereum);connections++;return'0x1111111111111111111111111111111111111111'}}};
 mod.require=name=>Object.hasOwn(mocks,name)?mocks[name]:local(name);
 mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
 const root=require('react-dom/client').createRoot(document.getElementById('root'));
 try{
  await act(async()=>root.render(React.createElement(mod.exports.default)));
  const button=document.querySelector('.luxWallet');assert.equal(button.textContent,'Connect Wallet');
  assert.equal(document.querySelector('.brandDesktopLinks [aria-current="page"]').textContent,'Racing');
  await act(async()=>button.click());assert.equal(connections,1);assert.match(button.textContent,/0x1111/);
  await act(async()=>listeners.get('accountsChanged')([]));assert.equal(button.textContent,'Connect Wallet');
  delete window.ethereum;await act(async()=>button.click());assert.match(document.querySelector('[role=status]').textContent,/compatible wallet/);assert.equal(connections,1);
  assert.deepEqual(requests.sort(),['eth_accounts','eth_chainId']);
 }finally{await act(async()=>root.unmount());assert.equal(listeners.size,0);Object.assign(global,old);dom.window.close();}
});
