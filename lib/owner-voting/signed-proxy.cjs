// Server-only fixed-origin bridge. No diagnostic/private data returned to browsers.
async function signedProxy(request,base,path,fetcher=fetch){
 const reply=(body,status)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(!base)return reply({error:'Voting service unavailable'},503);
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Invalid origin'},403);
 if(!request.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Invalid content type'},415);
 let reader;
 try{
  const url=new URL(path,base);if(!['http:','https:'].includes(url.protocol))throw Error('bad config');
  reader=request.body?.getReader();if(!reader)throw Error('no body');const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>131072){await reader.cancel();return reply({error:'Request too large'},413);}chunks.push(value);}
  const response=await fetcher(url,{method:'POST',body:Buffer.concat(chunks),headers:{'Content-Type':'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)return reply({error:'Vote not admitted'},response.status===429?429:400);
  const data=await response.json();
  if(path==='/vote/prepare'){if(!/^0x[0-9a-fA-F]{130}$/.test(data.admission))throw Error('bad response');return reply({admission:data.admission},200);}
  if(!/^0x[0-9a-fA-F]{64}$/.test(data.id))throw Error('bad response');
  // Backend status can never promote the UI to a confirmed vote.
  return reply({id:data.id,state:'Submitted'},200);
 }catch{return reply({error:'Voting service unavailable'},502);}finally{reader?.releaseLock();}
}
module.exports={signedProxy};
