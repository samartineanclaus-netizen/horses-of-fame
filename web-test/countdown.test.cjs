const {test}=require('node:test');
const assert=require('node:assert/strict');
const {remainingSeconds,formatCountdown}=require('../lib/owner-voting/countdown.cjs');
test('24h countdown reaches zero exactly at deadline and never goes negative',()=>{
 assert.equal(formatCountdown(remainingSeconds(86400,0,1000,1000)),'24:00:00');
 assert.equal(formatCountdown(remainingSeconds(86400,0,1000,86400000)),'00:00:01');
 assert.equal(remainingSeconds(86400,0,1000,86401000),0);
 assert.equal(remainingSeconds(86400,0,1000,90000000),0);
});
test('countdown uses chain anchor rather than local wall clock as chain time',()=>{
 assert.equal(remainingSeconds(200,100,999999000,999999000),100);
 assert.equal(remainingSeconds(200,100,999999000,1000000000),99);
});
test('a backwards client clock cannot extend beyond the last observed chain remainder',()=>{
 assert.equal(remainingSeconds(200,100,5000,4000),100);
});
