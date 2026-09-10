"use client";

import Image from "next/image";
import LegendaryGallery from "@/components/LegendaryGallery";
import HofGallery from "@/components/HofGallery";

const scoring = [
  ["1st", 25], ["2nd", 18], ["3rd", 15], ["4th", 12], ["5th", 10],
  ["6th", 8], ["7th", 6], ["8th", 4], ["9th", 2], ["10th", 1],
];

const tiers = [
  ["Common", "970", "1", "970"],
  ["Uncommon", "480", "2", "960"],
  ["Rare", "320", "3", "960"],
  ["Epic", "240", "4", "960"],
  ["Legendary", "190", "5", "950"],
];



function MintButton() {
  return <a className="primary" href="/mint">MINT GENESIS — 30 USDC</a>;
}

function SectionTitle({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) {
  return <div className="sectionHead"><span className="kicker">{kicker}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>;
}

export default function Home() {
  return (
    <main id="top">


      <section className="brandHero" aria-label="Horses of Fame Genesis">
        <div className="brandBanner"><Image src="/brand/hof-banner.webp" alt="Horses of Fame — 22 horses race. The community decides." fill priority quality={90} sizes="100vw" /></div>
        <div className="shell brandHeroCopy"><p className="kicker">CHAPTER I — GENESIS</p><h1>The Genesis Collection</h1><p className="lead">22 Hall of Fame race horses. 2,200 voting Genesis NFTs. Community-powered racing.</p>
          <div className="heroStats"><div><strong>2,222</strong><span>Genesis NFTs</span></div><div><strong>6</strong><span>Seasons</span></div><div><strong>60</strong><span>Races</span></div></div>
          <div className="actions"><MintButton/><a className="secondary" href="/hall-of-fame">Meet the 22</a></div>
          <p className="note">Public Mint: 2,000 × 30 USDC. Community: 111. Team Reserve: 111.</p>
        </div>
      </section>

      <section className="section legendaryPreview" aria-labelledby="legendary-preview-title">
        <div className="shell">
          <p className="kicker">GENESIS · ARTWORK SHOWCASE</p>
          <h2 id="legendary-preview-title">Legendary Collection</h2>
          <p className="legendaryIntro">Discover the artwork. A separate showcase from the 22 Hall of Fame horses that compete in community races.</p>
          <LegendaryGallery preview />
          <a className="secondary" href="/legendary">Explore Legendary Collection</a>
        </div>
      </section>

      <section id="racing" className="section darkBand">
        <div className="shell">
          <SectionTitle kicker="THE GAME LOOP" title="OWN. PICK. VOTE. COMPETE." copy="No random race result. The community determines who wins." />
          <div className="steps">
            {[
              ["01", "OWN", "Hold one or more HOF Genesis NFTs."],
              ["02", "PICK", "One wallet makes one secret pick per race."],
              ["03", "VOTE", "Eligible Genesis VP used by that wallet backs the same Hall of Fame horse. An eligible unused NFT acquired during voting may add VP only to that same pick."],
              ["04", "COMPETE", "Your pick earns Community Championship points."],
            ].map(([n, t, c]) => <article className="step" key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>)}
          </div>
          <div className="manifesto">NO RNG. NO BETTING. NO RACE-ENTRY FEES.</div>
        </div>
      </section>

      <section id="collection" className="section collectionSection">
        <div className="shell">
          <SectionTitle kicker="THE COLLECTION" title="22 ENTER THE HALL OF FAME" copy="Genesis contains 22 Hall of Fame race horses with 0 VP and 2,200 voting Genesis NFTs. Eligible holders power the races." />
          <div className="hofMain"><HofGallery heading="h2"/></div>
          <p className="note">Allocation: 2,000 Public + 111 Community + 111 Team Reserve = 2,222. Team Reserve cannot vote while held in the designated wallet.</p><div className="splitCallout"><div><span>22</span><p>Hall of Fame racers<br />0 Voting Power</p></div><div><span>2,200</span><p>Voting Genesis horses<br />4,800 total VP</p></div></div>
          <div className="bigLine">22 HOF + 2,200 VOTING GENESIS = 2,222</div>
        </div>
      </section>

      <section id="tokenomics" className="section muted">
        <div className="shell">
          <SectionTitle kicker="VOTING POWER" title="BALANCED BY DESIGN" copy="Each rarity tier controls approximately one-fifth of total ecosystem Voting Power." />
          <div className="tableWrap"><table><thead><tr><th>Rarity</th><th>Supply</th><th>VP / NFT</th><th>Total VP</th></tr></thead><tbody>{tiers.map((r) => <tr key={r[0]}>{r.map((v) => <td key={v}>{v}</td>)}</tr>)}</tbody></table></div>
          <p className="note">Rarity increases Voting Power. It does not multiply Community Championship points.</p>
        </div>
      </section>

      <section className="section scoringSection">
        <div className="shell">
          <SectionTitle kicker="SCORING" title="ONE RACE. ONE SCORING SYSTEM." />
          <div className="scoreGrid">{scoring.map(([place, pts]) => <div key={place}><span>{place}</span><strong>{pts}</strong><small>PTS</small></div>)}</div>
          <p className="note">Positions 11–22 receive 0 points. VP determines the race ranking; each eligible wallet earns one scoring result.</p><div className="champGrid">
            <article><span>01</span><h3>Community Championship</h3><p>Every eligible wallet gets one score per race based on the finishing position of its selected Hall of Fame horse.</p></article>
            <article><span>02</span><h3>Hall of Fame Championship</h3><p>The 22 Hall of Fame horses accumulate the same points across each 10-race season.</p></article>
          </div>
        </div>
      </section>

      <section className="section rewards">
        <div className="rewardArt rewardArtLeft" aria-hidden="true"><img src="/assets/reward-left.webp" alt="" /></div>
        <div className="rewardArt rewardArtRight" aria-hidden="true"><img src="/assets/reward-right.webp" alt="" /></div>
        <div className="shell rewardContent">
          <SectionTitle kicker="REWARDS" title="THE CHAPTER I PRIZE PROGRAM" copy="After successful public sell-out: 48,000 USDC allocated across six seasons. Community rewards and a reserved HOF allocation." />
          <div className="rewardGrid">{["Community Championship", "Hall of Fame Championship"].map((name) => <article key={name}><h3>{name}</h3><div><span>1st</span><strong>$2,500</strong></div><div><span>2nd</span><strong>$1,000</strong></div><div><span>3rd</span><strong>$500</strong></div></article>)}</div>
          <p className="note">HOF beneficiary payouts remain pending the final V7 mechanism. Unawarded Community prizes remain reserved for the Chapter 2 Prize Pool. Testnet uses MockUSDC with no monetary value.</p><a className="secondary" href="/rewards">View reward accounting</a>
        </div>
      </section>

      <section id="roadmap" className="section roadmap">
        <div className="shell">
          <SectionTitle kicker="ROADMAP" title="CHAPTER I — GENESIS" copy="Chapter I is Genesis. Chapters II–IV remain undisclosed." />
          <div className="roadCards">{[["I", "GENESIS", "UNLOCKED"], ["II", "???", "LOCKED"], ["III", "???", "LOCKED"], ["IV", "???", "LOCKED"]].map((x, i) => <article className={i === 0 ? "activeRoad" : ""} key={x[0]}><span>CHAPTER {x[0]}</span><h3>{x[1]}</h3><small>{x[2]}</small></article>)}</div>
          <div className="legacy"><div><strong>GENESIS GRAND CHAMPION</strong><span>#1 Hall of Fame horse after 60 races.</span></div><div><strong>GENESIS COMMUNITY CHAMPION</strong><span>#1 Community wallet after 60 races.</span></div></div>
        </div>
      </section>

      <section id="faq" className="section muted">
        <div className="shell narrow">
          <SectionTitle kicker="FAQ" title="THE ESSENTIALS" />
          {[
            ["Who can read votes during voting?", "Testnet uses owner-trusted encryption: the HOF backend can decrypt early. Public votes and intermediate rankings are hidden. HOF sponsors signed vote inclusion; direct fallback uses your own gas."],
            ["How much is the Genesis mint?", "$30 per Public Mint NFT. All 2,000 Public Mint NFTs must sell by the final mint deadline for the public sale to succeed."],
            ["How does a wallet vote?", "One wallet makes one secret pick per race. Eligible Genesis VP used by that wallet backs that single Hall of Fame horse; an eligible unused NFT acquired during voting may add VP only to the same pick."],
            ["Can Voting Power be split?", "No. A wallet cannot split its VP across multiple horses in the same race."],
            ["Does rarity increase Championship points?", "No. Rarity affects Voting Power only. Every wallet receives one Community score per race."],
            ["How long is voting open?", "24 hours. The wallet's horse pick is fixed; a newly acquired eligible NFT that has not already been used that race may add VP to the same pick during the open window."],
            ["What happens after Season 6?", "The #1 Hall of Fame horse becomes the Genesis Grand Champion and the #1 Community wallet becomes the Genesis Community Champion. Chapters II–IV remain undisclosed."],
          ].map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="cta"><div className="shell ctaInner"><span>CHAPTER I</span><h2>ENTER THE GENESIS.</h2><p>2,222 NFTs · $30 Public Mint · 22 Hall of Fame horses</p><MintButton /></div></section>

      <footer><div className="shell footer"><strong>HORSES OF FAME</strong><span>8,888 HORSES · 4 CHAPTERS · 2,222 GENESIS · ONE HALL OF FAME</span></div></footer>
    </main>
  );
}
