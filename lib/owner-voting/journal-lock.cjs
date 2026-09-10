// Local-disk, single-host deployment only. All processes sharing a relayer must
// share this lock directory. Never deploy replicas with independent disks.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function namespace(){return process.platform==='linux'?fs.readlinkSync('/proc/self/ns/pid'):'host';}
function acquire(file){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 for(let attempt=0;attempt<2;attempt++){
  try{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname(),namespace:namespace()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return ()=>fs.unlinkSync(file);}
  catch(e){if(e.code!=='EEXIST')throw e;
   const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.host!==os.hostname()||old.namespace!==namespace())throw Error('worker lock belongs to another host/PID namespace; manual recovery required');
   try{process.kill(old.pid,0);throw Error('worker already owns lock');}catch(err){if(err.code!=='ESRCH')throw err;}
   // Reclamation is serialized by a separate exclusive file, preventing two
   // recovering processes from unlinking a newly acquired live lock.
   const recovery=file+'.recover';let fd;
   try{fd=fs.openSync(recovery,'wx',0o600);const current=fs.readFileSync(file,'utf8');if(current===JSON.stringify(old))fs.unlinkSync(file);}
   finally{if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(recovery);}}
  }
 }
 throw Error('cannot acquire worker lock');
}
module.exports={acquire,namespace};
