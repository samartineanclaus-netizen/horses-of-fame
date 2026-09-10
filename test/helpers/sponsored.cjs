const {ethers}=require('hardhat');
const {time}=require('@nomicfoundation/hardhat-network-helpers');
const {generateRaceKey}=require('../../lib/owner-voting/backend.cjs');
const {signVote,intentTypes}=require('../../lib/owner-voting/signed-ballot.cjs');
const {signingDomain}=require('../../lib/owner-voting/ballot.cjs');
let key;
async function fixture(){
 const [owner,backend,team,relayer,treasury,...voters]=await ethers.getSigners();
 const genesis=await(await ethers.getContractFactory('GenesisHorses')).deploy('placeholder');
 await genesis.ownerMint(owner.address,22);
 for(const w of voters)await genesis.ownerMint(w.address,1);
 key ||= await generateRaceKey();const opens=(await time.latest())+100;
 const race=await(await ethers.getContractFactory('HOFRelayedRace')).deploy(genesis.target,opens,team.address,owner.address,backend.address,key.publicKey);
 const board=await(await ethers.getContractFactory('HOFTrustedLeaderboards')).deploy(genesis.target,owner.address,backend.address,team.address);
 await board.registerRace(race.target);await time.increaseTo(opens);
 return {owner,backend,team,relayer,treasury,voters,genesis,race,board,key,opens};
}
async function packet(f,i=0,horse=8){const token=23+i,p=await signVote(f.race,f.voters[i],horse,[{id:token,vp:await f.genesis.votingPowerOf(token)}]);return authorize(f,p);}
async function authorize(f,p,signer=f.voters.find(w=>w.address===p.intent.voter),domain={}){
 const d={...signingDomain({race:f.race.target,chainId:(await ethers.provider.getNetwork()).chainId}),...domain};
 return {...p,signature:await signer.signTypedData(d,intentTypes,p.intent),admission:await f.backend.signTypedData(d,intentTypes,p.intent)};
}
module.exports={fixture,packet,authorize};
