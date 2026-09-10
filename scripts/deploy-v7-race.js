const {ethers}=require('hardhat');
const {raceConfig,validateNetwork,code}=require('./v7-canonical-config.cjs');
async function main(){
 const c=raceConfig(process.env);await validateNetwork(ethers.provider);
 const [owner]=await ethers.getSigners();if(!owner||owner.address!==c.owner)throw Error('Configured owner signer required');
 await code(ethers.provider,c.board,'leaderboards');await code(ethers.provider,c.sale,'sale');
 const board=await ethers.getContractAt('HOFTrustedLeaderboards',c.board),sale=await ethers.getContractAt('HOFGenesisSale',c.sale);
 if(await board.hofOwner()!==c.owner||await board.backendSigner()!==c.admission||await board.teamReserveWallet()!==c.team)throw Error('Canonical role mismatch');
 const genesis=await ethers.getContractAt('GenesisHorses',await board.genesisContract());
 if(await sale.genesis()!==genesis.target||await genesis.saleContract()!==c.sale||await genesis.teamWallet()!==c.team)throw Error('Sale/Genesis mismatch');
 if(!await sale.saleSuccessful()||await sale.soldOutAt()===0n)throw Error('Public mint must be sold out');
 const head=await ethers.provider.getBlock('latest');if(c.opens<=BigInt(head.timestamp))throw Error('Race opening must be future');
 const season=await board.currentSeason(),count=await board.raceCount();if(season>6n||count>=season*10n)throw Error('Season complete');
 if(count%10n){const previous=await ethers.getContractAt('HOFRelayedRace',await board.races(count-1n));if(c.opens!==await previous.opensAt()+259200n)throw Error('Race cadence mismatch');}
 else if(count){const end=await board.previousSeasonEnd();if(c.opens<end||c.opens>end+604800n)throw Error('Season gap mismatch');}
 const factory=await ethers.getContractAt('HOFCanonicalRaceFactory',await board.raceFactory());
 if(await factory.board()!==board.target||await factory.genesis()!==genesis.target)throw Error('Factory mismatch');
 const receipt=await(await factory.createRace(1,season,count%10n+1n,c.opens,c.key)).wait();
 const event=receipt.logs.map(l=>{try{return factory.interface.parseLog(l);}catch{return null;}}).find(l=>l?.name==='RaceCreated');
 if(!event)throw Error('Missing canonical creation event');
 await(await board.registerRace(event.args.race)).wait();
 console.log(JSON.stringify({race:event.args.race,board:board.target,registered:true,chainId:46630}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
