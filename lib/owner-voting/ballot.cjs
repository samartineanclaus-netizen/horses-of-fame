// Browser-compatible Web Crypto. No private key or Node backend import here.
const { AbiCoder, keccak256, getBytes, hexlify, concat, getAddress } = require('ethers');
const abi = AbiCoder.defaultAbiCoder();
const CIPHER_BYTES = 446;
function domainBytes(ctx) {
  return getBytes(abi.encode(['uint256','address','address','bytes32'], [ctx.chainId,ctx.race,ctx.wallet,ctx.keyId]));
}
function commitmentOf(ctx, horse, salt) {
  if (!Number.isInteger(horse) || horse < 1 || horse > 22 || getBytes(salt).length !== 32) throw Error('invalid ballot');
  return keccak256(abi.encode(['string','uint256','address','address','bytes32','uint8','bytes32'], ['HOF_BALLOT_V1',ctx.chainId,ctx.race,ctx.wallet,ctx.keyId,horse,salt]));
}
async function encryptVote(ctx, horse, publicKey) {
  if (keccak256(publicKey) !== ctx.keyId) throw Error('wrong public key');
  const rsa = await crypto.subtle.importKey('spki', getBytes(publicKey), { name:'RSA-OAEP', hash:'SHA-256' }, false, ['encrypt']);
  if (rsa.algorithm.modulusLength !== 3072) throw Error('RSA3072 required');
  const salt = hexlify(crypto.getRandomValues(new Uint8Array(32)));
  const commitment = commitmentOf(ctx, horse, salt);
  const aes = await crypto.subtle.generateKey({name:'AES-GCM',length:256}, true, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = getBytes(concat([domainBytes(ctx), commitment]));
  const payload = getBytes(concat([new Uint8Array([horse]),salt]));
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad,tagLength:128},aes,payload);
  const raw = await crypto.subtle.exportKey('raw',aes);
  const wrapped = await crypto.subtle.encrypt({name:'RSA-OAEP',label:domainBytes(ctx)},rsa,raw);
  return {commitment,ciphertext:concat(['0x01',new Uint8Array(wrapped),iv,new Uint8Array(encrypted)])};
}
const admissionTypes = {Admission:[{name:'voter',type:'address'},{name:'commitment',type:'bytes32'},{name:'ciphertextHash',type:'bytes32'},{name:'deadline',type:'uint256'}]};
const resultTypes = {Result:[{name:'recordsHash',type:'bytes32'},{name:'count',type:'uint256'},{name:'totalVP',type:'uint256'},{name:'totalsHash',type:'bytes32'},{name:'scoresRoot',type:'bytes32'}]};
const signingDomain = ctx => ({name:'HOFTrustedRace',version:'1',chainId:ctx.chainId,verifyingContract:ctx.race});
async function contextFor(race, wallet) {
  const network = await race.runner.provider.getNetwork();
  return {chainId:network.chainId, race:race.target, wallet:getAddress(wallet),keyId:await race.keyId()};
}
// One user transaction. admit sends only encrypted data to the configured service.
async function voteOnce(race, signer, horse, tokenIds, admit, beforeSend = async () => {}) {
  const wallet = await signer.getAddress(); const ctx = await contextFor(race,wallet);
  const ballot = await encryptVote(ctx,horse,await race.encryptionPublicKey());
  const auth = await admit({wallet,...ballot});
  await beforeSend();
  return race.connect(signer).vote(ballot.commitment,ballot.ciphertext,auth.deadline,auth.signature,tokenIds);
}
module.exports = {CIPHER_BYTES,domainBytes,commitmentOf,encryptVote,admissionTypes,resultTypes,signingDomain,contextFor,voteOnce};
