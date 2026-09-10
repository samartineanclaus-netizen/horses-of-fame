// SERVER ONLY. Mount behind HTTPS and an external rate limiter; never expose keys.
const http = require('node:http');
const {admitVote} = require('./backend.cjs');
function createAdmissionServer({race,signer,privateKey,maxConcurrent=4}) {
  let active=0;
  return http.createServer(async(req,res)=>{
    const send=(status,obj)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
    if(req.method!=='POST'||req.url!=='/vote/admission') return send(404,{error:'not found'});
    if(active>=maxConcurrent) return send(503,{error:'try later'});
    active++;
    req.setTimeout(10000,()=>req.destroy());
    try {
      let size=0;const chunks=[];
      for await (const chunk of req){size+=chunk.length;if(size>4096){send(413,{error:'request too large'});return;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!body||typeof body.wallet!=='string'||typeof body.commitment!=='string'||typeof body.ciphertext!=='string') throw Error('bad request');
      const auth=await admitVote(race,signer,privateKey,body);send(200,auth);
    } catch { if(!res.headersSent&&!res.destroyed) send(400,{error:'vote not admitted'}); }
    finally {active--;}
  });
}
module.exports={createAdmissionServer};
