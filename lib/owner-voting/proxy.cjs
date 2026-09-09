// Server-side same-origin bridge to one operator-configured admission service.
async function admissionProxy(request, endpoint, fetcher = fetch) {
  const reply = (body,status) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if (!endpoint) return reply({error:'Voting service unavailable'},503);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({error:'Invalid origin'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({error:'Invalid content type'},415);
  let reader;
  try {
    const url = new URL(endpoint);
    if (!['http:','https:'].includes(url.protocol)) return reply({error:'Voting service unavailable'},503);
    reader = request.body?.getReader(); if (!reader) return reply({error:'Invalid ballot'},400);
    const chunks=[];let size=0;
    for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply({error:'Ballot too large'},413);}chunks.push(value);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!input || typeof input!=='object' || Object.keys(input).sort().join(',')!=='ciphertext,commitment,wallet' ||
      !/^0x[0-9a-fA-F]{40}$/.test(input.wallet) || !/^0x[0-9a-fA-F]{64}$/.test(input.commitment) || !/^0x01[0-9a-fA-F]{890}$/.test(input.ciphertext)) return reply({error:'Invalid ballot'},400);
    const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) return reply({error:'Vote not admitted'},response.status===429?429:400);
    const data=await response.json();
    if (!/^\d+$/.test(String(data.deadline)) || !/^0x[0-9a-fA-F]{130}$/.test(data.signature)) return reply({error:'Voting service unavailable'},502);
    // Explicit allowlist: never relay backend diagnostics, plaintext or keys.
    return reply({deadline:String(data.deadline),signature:data.signature},200);
  } catch {return reply({error:'Voting service unavailable'},502);}
  finally {reader?.releaseLock();}
}
module.exports={admissionProxy};
