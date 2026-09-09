import {notFound} from 'next/navigation';
// Local visual QA only; this route is unavailable in production.
export default function Review() {
  if(process.env.NODE_ENV!=='development')notFound();
  return <main style={{padding:24}}><h1 style={{fontSize:28}}>Local mobile review</h1><p>Real pages at a 390px viewport. No simulated protocol data.</p><div style={{display:'flex',gap:20,flexWrap:'wrap'}}>{['hall-of-fame','race','results'].map(route=><section key={route}><h2>{route}</h2><iframe title={route} src={'/'+route} style={{width:390,height:844,maxWidth:'100%',border:'1px solid #d6b06a'}}/></section>)}</div></main>;
}
