const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {hofHorses,getHofHorse,formatHofNumber,hofHorseAlt}=require('../src/lib/hofHorses');

test('canonical dataset matches the approved 22 identities exactly',()=>{
 const expected=[['IMPERIUM','Thoroughbred'],['SULTAN','Arabian'],['OUTLAW','Quarter Horse'],['MIDAS','Akhal-Teke'],['VALOR','Friesian'],['BRAVER','Clydesdale'],['SPIRIT','American Paint'],['SOBERANO','Andalusian'],['VELOCITY','Standardbred'],['MONARCH','French Trotter'],['VOSTOK','Orlov Trotter'],['PHANTOM','Shagya Arabian'],['VALIANT','Anglo-Arabian'],['WARPAINT','Appaloosa'],['EMPIRE','Cleveland Bay'],['PATRIOT','Morgan'],['MAHARAJA','Marwari'],['THUNDER','Australian Stock Horse'],['FUEGO','Paso Fino'],['EL DORADO','Peruvian Paso'],['MEMPHIS','Tennessee Walker'],['IMPERATOR','Lipizzaner']];
 assert.equal(hofHorses.length,22);
 assert.deepEqual(hofHorses.map(h=>h.id),Array.from({length:22},(_,i)=>i+1));
 assert.deepEqual(hofHorses.map(h=>h.number),Array.from({length:22},(_,i)=>i+1));
 expected.forEach(([name,breed],i)=>{const h=getHofHorse(i+1);assert.equal(h.id,i+1);assert.equal(h.number,i+1);assert.equal(h.name,name);assert.equal(h.breed,breed);assert.ok(Object.hasOwn(h,'image'));});
 assert.equal(new Set(hofHorses.map(h=>h.number)).size,22);
});
test('lookup uses canonical number for arbitrary race ranking order',()=>{
 assert.deepEqual([22n,3n,1n,20n].map(n=>getHofHorse(n).name),['IMPERATOR','OUTLAW','IMPERIUM','EL DORADO']);
 assert.equal(formatHofNumber(1),'#0001');assert.equal(formatHofNumber(22),'#0022');
 assert.equal(hofHorseAlt(20),'EL DORADO — Peruvian Paso, HOF #0020');
 for(const invalid of [0,23,-1,1.5,'OUTLAW',null,true,undefined])assert.throws(()=>getHofHorse(invalid),/Unknown/);
});
test('catalog records are immutable and images cannot be assigned by upload order',()=>{
 assert.ok(Object.isFrozen(hofHorses));
 for(const h of hofHorses){
  assert.ok(Object.isFrozen(h));
  assert.equal(typeof h.image,'string','Every official horse must have its supplied portrait');
  assert.match(h.image,new RegExp('^/images/hof/'+String(h.number).padStart(4,'0')+'\\.(webp|png|jpg|jpeg|avif)$'));
  assert.ok(fs.existsSync(path.join(__dirname,'../public',h.image)));
 }
});

test('all 22 supplied portraits retain their original bytes and identity',()=>{
 const crypto=require('node:crypto');
 const manifest=require('../src/data/hofPortraitIntegrity.json');
 assert.equal(manifest.length,22);
 assert.equal(new Set(manifest.map(m=>m.number)).size,22);
 for(const entry of manifest){
  const horse=getHofHorse(entry.number);
  assert.equal(entry.image,horse.image);
  // Source filenames were mislabeled. The text on the portrait, not its
  // upload filename, is the audited identity used by this manifest.
  assert.deepEqual(entry.portraitIdentity,{number:horse.number,name:horse.name,breed:horse.breed});
  const bytes=fs.readFileSync(path.join(__dirname,'../public',horse.image));
  assert.equal(bytes.length,entry.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);
 }
});

test('five mislabeled uploads map to their actual portrait identities',()=>{
 const manifest=require('../src/data/hofPortraitIntegrity.json');
 const expected={8:'0021_MEMPHIS.png',13:'0008_SOBERANO.png',15:'0013_VALIANT.png',16:'0015_EMPIRE.png',21:'0016_PATRIOT.png'};
 for(const [number,source] of Object.entries(expected))assert.equal(manifest.find(m=>m.number===Number(number)).originalFilename,source);
 assert.equal(new Set(manifest.map(m=>m.sha256)).size,22,'No portrait may be duplicated');
});
