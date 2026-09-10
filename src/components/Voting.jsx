'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {hofHorses} from '../lib/hofHorses';
import HofHorseCard, {HofHorseIdentity} from './HofHorseCard';
import {remainingSeconds,formatCountdown} from '../../lib/owner-voting/countdown.cjs';
import {BrowserProvider,Contract,JsonRpcProvider,isAddress} from 'ethers';
import {assertWalletSession} from '../../lib/owner-voting/wallet-session.cjs';
import {signedRaceAt,signVote,inclusionState,json} from '../../lib/owner-voting/signed-ballot.cjs';
import {voteOnce} from '../../lib/owner-voting/ballot.cjs';
import {BOARD_ABI,GENESIS_ABI,raceAt as legacyRaceAt,readRace,inventory,readLeaderboards,assertSnapshot} from '../../lib/owner-voting/website.cjs';

const config = {rpc:process.env.NEXT_PUBLIC_HOF_RPC_URL,chain:process.env.NEXT_PUBLIC_HOF_CHAIN_ID,
  race:process.env.NEXT_PUBLIC_HOF_TRUSTED_RACE,board:process.env.NEXT_PUBLIC_HOF_TRUSTED_LEADERBOARDS};
const sponsored=process.env.NEXT_PUBLIC_HOF_SIGNED_VOTING==='enabled';
const raceAt=sponsored?signedRaceAt:legacyRaceAt;
const deploymentBlock=Number(process.env.NEXT_PUBLIC_HOF_RACE_DEPLOYMENT_BLOCK || 0);
const packetKey=wallet=>`hof-signed:${config.chain}:${config.race}:${wallet.toLowerCase()}`;
const configured = Boolean(config.rpc && /^\d+$/.test(config.chain || '') && isAddress(config.race || '') && isAddress(config.board || ''));
const phases = {scheduled:'Voting has not opened',open:'Voting Open',awaiting:'Voting Closed',preparing:'Preparing Race Reveal',finalized:'Race Revealed'};

export default function Voting({mode}) {
  const [snapshot,setSnapshot] = useState(null), [wallet,setWallet] = useState(''), [horse,setHorse] = useState(null);
  const [excludedTokens,setExcludedTokens] = useState([]), [busy,setBusy] = useState(false), [loading,setLoading] = useState(false);
  const [clock,setClock]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>setClock(performance.now()),1000);return()=>clearInterval(timer);},[]);
  const [error,setError] = useState(''), [message,setMessage] = useState(''), [tab,setTab] = useState('season');
  const [packet,setPacket]=useState(null);
  const packetRef=useRef(null);
  function retainPacket(value){packetRef.current=value;setPacket(value);try{localStorage.setItem(packetKey(value.intent.voter),json(value));}catch{/* queue remains authoritative */}}
  const epoch = useRef(0), inFlight = useRef(null), sending = useRef(false);
  const refresh = useCallback(async () => {
    const generation = epoch.current;
    if (!configured || inFlight.current === generation) return;
    inFlight.current = generation; setLoading(true);
    const provider = new JsonRpcProvider(config.rpc);
    try {
      if (String((await provider.getNetwork()).chainId) !== config.chain) throw Error('The race connection is on the wrong network.');
      const block = await provider.getBlock('latest'); if (!block) throw Error('Race connection unavailable.');
      const race = raceAt(config.race,provider), board = new Contract(config.board,BOARD_ABI,provider);
      if (!await board.registeredRace(config.race,{blockTag:block.number})) throw Error('This race is not registered.');
      const data = await readRace(race,block);
      // eslint-disable-next-line react-hooks/purity -- refresh samples time after RPC in an effect/event, never during render.
      data.chainTimestamp=block.timestamp;data.observedAt=performance.now();
      if (wallet && mode === 'vote') data.inventory = await inventory(race,new Contract(await race.genesis({blockTag:block.number}),GENESIS_ABI,provider),wallet,block);
      if (mode === 'standings') data.boards = await readLeaderboards(board,a=>raceAt(a,provider),block);
      if(sponsored && packetRef.current && wallet && mode==='vote') {
        const state=await inclusionState(race,packetRef.current,deploymentBlock);
        if(generation===epoch.current)setMessage(state==='Submitted'&&!packetRef.current.submitted?'Signed':state);
      }
      await assertSnapshot(provider,block);
      if (generation === epoch.current) {setSnapshot(data);setError('');}
    } catch { if (generation === epoch.current) {setSnapshot(null);setError('Unable to load a complete, consistent race snapshot. Please refresh.');} }
    finally {provider.destroy();if(inFlight.current===generation)inFlight.current=null;if(generation===epoch.current)setLoading(false);}
  },[wallet,mode]);
  useEffect(()=>{epoch.current++;setSnapshot(null);void refresh();const id=setInterval(refresh,15000);return()=>{epoch.current++;clearInterval(id);};},[refresh]);
  useEffect(()=>{
    const ethereum=window.ethereum; if (!ethereum?.on) return;
    const reset=()=>{epoch.current++;setWallet('');setPacket(null);packetRef.current=null;setSnapshot(null);setExcludedTokens([]);setHorse(null);setMessage('Wallet changed. Connect again to vote.');};
    ethereum.on('accountsChanged',reset);ethereum.on('chainChanged',reset);
    return()=>{ethereum.removeListener?.('accountsChanged',reset);ethereum.removeListener?.('chainChanged',reset);};
  },[]);
  async function connect() {
    setError('');
    try {
      if (!window.ethereum) throw Error('Open this website in a browser with an Ethereum wallet.');
      const provider=new BrowserProvider(window.ethereum);
      if (String((await provider.getNetwork()).chainId)!==config.chain) throw Error(`Select network ${config.chain} in your wallet, then connect again.`);
      const signer=await provider.getSigner();const address=await signer.getAddress();setWallet(address);setExcludedTokens([]);setMessage('');
      if(sponsored){try{const saved=JSON.parse(localStorage.getItem(packetKey(address)));if(saved?.intent?.voter.toLowerCase()===address.toLowerCase() && saved.intent.race.toLowerCase()===config.race.toLowerCase()){retainPacket(saved);setMessage(saved.submitted?'Submitted':'Signed');}}catch{/* no recoverable packet */}}
    } catch(e) {setError(e.code===4001?'Connection cancelled.':e.message);}
  }
  async function submit() {
    if (!canVote || sending.current) return; sending.current=true;setBusy(true);setError('');setMessage('');
    const generation=epoch.current;
    try {
      const provider=new BrowserProvider(window.ethereum);
      if (String((await provider.getNetwork()).chainId)!==config.chain) throw Error('Wallet network changed. Reconnect.');
      const signer=await provider.getSigner();if ((await signer.getAddress()).toLowerCase()!==wallet.toLowerCase()) throw Error('Wallet changed. Reconnect.');
      const race=raceAt(config.race,provider);
      const guard=()=>assertWalletSession(window.ethereum,wallet,config.chain,()=>generation===epoch.current);
      await guard();
      if(sponsored){
        let original;
        if(snapshot.inventory.voted){
          const entry=await race.ballotIndexPlusOne(wallet);
          const logs=await race.queryFilter(race.filters.EncryptedVote(entry-1n,wallet),deploymentBlock);
          if(logs.length!==1)throw Error('Original encrypted vote unavailable.');
          original={commitment:(await race.ballotAt(entry-1n)).commitment,ciphertext:logs[0].args.ciphertext};
        }
        const signed=await signVote(race,signer,horse,eligible.filter(t=>selected.includes(t.id)),{original,beforeSign:guard});
        if(generation!==epoch.current)throw Error('Wallet changed. Reconnect.');
        retainPacket(signed);setMessage('Signed');await queuePacket(signed,generation);return;
      }
      const tx=snapshot.inventory.voted ? await race.connect(signer).addVotingPower(selected) : await voteOnce(race,signer,horse,selected,async ballot=>{
        const res=await fetch('/api/vote/admission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ballot),cache:'no-store'});
        if (!res.ok) throw Error('Vote admission unavailable. No vote was sent. Try again before voting closes.');
        if (generation!==epoch.current) throw Error('Wallet changed. Reconnect.');
        return res.json();
      },guard);
      if (generation===epoch.current) {setHorse(null);setMessage('Transaction sent. Waiting for confirmation…');}
      const receipt=await tx.wait();if (!receipt || receipt.status!==1) throw Error('Transaction failed.');
      if (generation===epoch.current) {setExcludedTokens([]);setMessage('Vote recorded. Your points will update after the complete Race Reveal.');await refresh();}
    } catch(e) {if(generation===epoch.current)setError(e.code==='ACTION_REJECTED'?'Transaction cancelled.':e.shortMessage || e.message || 'Vote failed.');}
    finally {sending.current=false;setBusy(false);}
  }
  async function queuePacket(value,generation=epoch.current){
    let admitted=value;
    if(!value.admission){
      const res=await fetch('/api/vote/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:json(value),cache:'no-store'});
      if(!res.ok)throw Error('Admission unavailable. Signed is not an included vote.');
      admitted={...value,...await res.json()};
      if(generation!==epoch.current)throw Error('Wallet changed. Reconnect.');retainPacket(admitted);
    }
    const res=await fetch('/api/vote/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:json(admitted),cache:'no-store'});
    if(!res.ok)throw Error('Submission unavailable. Retry or send directly before the deadline.');
    if(generation===epoch.current){retainPacket({...admitted,submitted:true});setMessage('Submitted');}
  }
  async function retryOrFallback(direct){
    if(!packet||sending.current)return;sending.current=true;setBusy(true);setError('');const generation=epoch.current;
    try{
      await assertWalletSession(window.ethereum,wallet,config.chain,()=>generation===epoch.current);
      if(direct){
        const provider=new BrowserProvider(window.ethereum),signer=await provider.getSigner();
        const tx=await raceAt(config.race,provider).connect(signer).submitSigned(packet);
        if(generation===epoch.current){retainPacket({...packet,submitted:true});setMessage('Submitted');}await tx.wait();await refresh();
      }else await queuePacket(packet,generation);
    }catch(e){if(generation===epoch.current)setError(e.shortMessage||e.message);}
    finally{sending.current=false;setBusy(false);}
  }
  const inv=snapshot?.inventory;
  const eligible=inv?.tokens || [];
  const selected=eligible.filter(t=>!excludedTokens.includes(t.id)).map(t=>t.id);
  const remaining=snapshot?remainingSeconds(snapshot.closes,snapshot.chainTimestamp,snapshot.observedAt,clock):null;
  const phase=snapshot?.phase==='open' && remaining===0 ? 'awaiting' : snapshot?.phase;
  const validSelected=selected.length>0 && selected.every(id=>eligible.some(t=>t.id===id));
  const pending=sponsored&&packet&& !['Included on-chain','Vote confirmed'].includes(message);
  const canVote=!pending && phase==='open' && inv && !inv.excluded && validSelected && (inv.voted || horse) && !busy;
  const title=mode==='vote'?'Choose your horse.':mode==='results'?'Race Reveal':'Leaderboards';
  return <><p className="kicker">CHAPTER I · GENESIS</p><h1>{title}</h1>
    <div className="hofRaceHeader"><div><span className="hofStatus">{snapshot ? phases[phase] : configured ? 'Connecting to race…' : 'Awaiting race configuration'}</span><p className="hofMuted">24-hour secret voting · no public interim results</p></div><div className="hofClock"><span>{phase==='scheduled'?'Voting opens':'Voting closes'}</span><strong role="timer" aria-label="Voting countdown">{remaining===null?'--:--:--':phase==='scheduled'?formatCountdown(remainingSeconds(snapshot.opens,snapshot.chainTimestamp,snapshot.observedAt,clock)):formatCountdown(remaining)}</strong></div></div>
    {!configured && <p className="hofIntegrationNote">The owner-trusted race is not connected yet. You can browse the official horses; voting and results will become available once the protocol connection is configured.</p>}
    {configured && <button className="secondary" onClick={refresh} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button>}
    {mode==='vote' && <>
      <section className="hofVoteBar"><div>{wallet?<span className="hofWallet">{wallet}</span>:<button className="primary" onClick={connect} disabled={!configured || busy}>Connect Wallet</button>}<p>{horse ? <HofHorseIdentity number={horse}/> : 'Select one of the 22 horses below.'}</p></div><div>{inv && <p>{selected.length} NFTs · {eligible.filter(t=>selected.includes(t.id)).reduce((n,t)=>n+t.vp,0)} VP</p>}<button className="primary" disabled={!canVote} onClick={submit}>{busy?'Confirming…':inv?.voted?'Add voting power':'Vote'}</button></div></section>
      {sponsored && packet && pending && phase==='open' && <div className="hofActions"><button className="secondary" disabled={busy} onClick={()=>retryOrFallback(false)}>Retry signed vote</button><button className="secondary" disabled={busy||!packet.admission} onClick={()=>retryOrFallback(true)}>Send directly · pay gas</button></div>}
      {inv?.excluded && <p>This wallet is excluded from voting.</p>}
      {inv?.voted && <p>Your vote is recorded. No reveal or claim action is needed.</p>}
      {inv && !inv.excluded && phase==='open' && <details><summary>Voting NFTs — eligible NFTs selected automatically</summary><div className="hofTokens">{eligible.map(t=><label key={t.id}><input type="checkbox" disabled={busy} checked={selected.includes(t.id)} onChange={e=>setExcludedTokens(v=>e.target.checked?v.filter(id=>id!==t.id):[...v,t.id])}/> #{t.id} · {t.vp} VP</label>)}</div>{!eligible.length && <p>No unused voting NFTs in this wallet.</p>}</details>}
      <div className="hofGrid" aria-label="Choose one HOF horse">{hofHorses.map(candidate=><button key={candidate.number} className="hofHorse" aria-label={candidate.name+' · '+candidate.breed+' · #'+String(candidate.number).padStart(4,'0')} aria-pressed={horse===candidate.number} disabled={busy || pending || inv?.voted || inv?.excluded || (!!snapshot && phase!=='open')} onClick={()=>setHorse(candidate.number)}><HofHorseCard number={candidate.number}/></button>)}</div>
      <p className="hofMuted">Your choice is encrypted before sending. The HOF owner operates the service and can read votes early. Individual choices are not published; public points may allow others to infer a choice.</p>
    </>}
    {mode==='results' && (phase==='finalized' ? <div className="hofTableWrap"><table><thead><tr><th>Position</th><th>HOF Horse</th><th>Voting power</th><th>Points</th></tr></thead><tbody>{snapshot.rows.map((r,i)=><tr key={r.horse}><td>{i+1}</td><td><HofHorseIdentity number={r.horse} showImage/></td><td>{r.vp}</td><td>{r.points}</td></tr>)}</tbody></table></div> : <section className="hofPanel"><h2>{phase==='preparing'?'Preparing Race Reveal':'Waiting for Race Reveal'}</h2><p>Voting Closed → Complete Race Reveal → Final ranking</p><p className="hofMuted">All 22 horses appear in the final ranking together. No partial result is final.</p></section>)}
    {mode==='standings' && <>{snapshot?.boards ? <>{phase==='finalized' && <p role="status">Leaderboards Updated</p>}<div className="hofActions"><button className="secondary" aria-pressed={tab==='season'} onClick={()=>setTab('season')}>Season {Math.min(snapshot.boards.season,6)}</button><button className="secondary" aria-pressed={tab==='allTime'} onClick={()=>setTab('allTime')}>All-Time</button></div>{snapshot.boards.season>6 && tab==='season'?<p>Chapter I is complete. See All-Time points.</p>:<><h2>Community</h2><p className="hofMuted">Equal scores share a position. Prize tie-breaks use NFT ownership when winners are determined.</p><ScoreTable rows={snapshot.boards.wallets} field={tab}/><h2>HOF Horses</h2><ScoreTable rows={snapshot.boards.horses} field={tab}/></>}</>:<section className="hofPanel"><h2>Season &amp; All-Time</h2><p>Points will appear here after complete Race Reveal.</p></section>}<p className="hofMuted">Only finalized races count. Both leaderboards update without a Claim Points transaction.</p></>}
    {error && <p role="alert" className="hofError">{error}</p>}<p role="status">{message}</p>
  </>;
}
function ScoreTable({rows,field}) {
  const ordered=[...rows].sort((a,b)=>b[field]-a[field] || (a.horse && b.horse ? a.horse-b.horse : (a.wallet||'').localeCompare(b.wallet||'')));
  if (!ordered.length) return <p>No finalized votes yet.</p>;
  return <div className="hofTableWrap"><table><thead><tr><th>Position</th><th>{ordered[0].wallet?'Wallet':'Horse'}</th><th>Points</th></tr></thead><tbody>{ordered.map((r,i)=><tr key={r.wallet||r.horse}><td>{r.wallet?ordered.findIndex(v=>v[field]===r[field])+1:i+1}</td><td className="hofWallet">{r.wallet||<HofHorseIdentity number={r.horse}/>}</td><td>{r[field]}</td></tr>)}</tbody></table></div>;
}
