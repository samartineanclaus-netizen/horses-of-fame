"use client";

import Image from "next/image";
import { useState } from "react";
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

const gallery = [
  ["/assets/hof-rasta.png", "Music · Culture · Legacy"],
  ["/assets/hof-boxer.png", "Sport · Culture · Legacy"],
  ["/assets/hof-football.jpg", "Sports · Culture · Legacy"],
  ["/assets/hof-singer.png", "Film · Culture · Legacy"],
  ["/assets/hof-science.png", "Music · Culture · Legacy"],
];
type EthereumProvider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

function WalletButton() {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function connectWallet() {
    const ethereum = (
      window as Window & { ethereum?: EthereumProvider }
    ).ethereum;

    if (!ethereum) {
      alert("Please install an EVM wallet such as MetaMask.");
      return;
    }

    try {
      setConnecting(true);

      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0xb626" }],
        });
      } catch {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xb626",
              chainName: "Robinhood Chain Testnet",
              nativeCurrency: {
                name: "Ether",
                symbol: "ETH",
                decimals: 18,
              },
              rpcUrls: ["https://rpc.testnet.chain.robinhood.com"],
              blockExplorerUrls: [
                "https://explorer.testnet.chain.robinhood.com",
              ],
            },
          ],
        });
      }

      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      if (
        Array.isArray(accounts) &&
        typeof accounts[0] === "string"
      ) {
        setAddress(accounts[0]);
      }
    } catch (error) {
      console.error("Wallet connection failed:", error);
    } finally {
      setConnecting(false);
    }
  }

  const label = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : connecting
      ? "CONNECTING..."
      : "CONNECT WALLET";

  return (
    <button className="wallet" type="button" onClick={connectWallet}>
      {label}
    </button>
  );
}
function Header() {
  return (
    <header className="navWrap">
      <nav className="nav shell">
        <a className="brandLogo" href="#top" aria-label="Horses of Fame home">
          <Image src="/assets/hof-logo.webp" alt="Horses of Fame" width={390} height={61} priority />
        </a>
        <div className="navLinks">
          <a href="#collection">Collection</a>
          <a href="#racing">Racing</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#tokenomics">Tokenomics</a>
          <a href="#faq">FAQ</a>
        </div>
       <WalletButton />
      </nav>
    </header>
  );
}

function SectionTitle({ kicker, title, copy }: { kicker: string; title: string; copy?: string }) {
  return (
    <div className="sectionHead">
      <span className="kicker">{kicker}</span>
      <h2>{title}</h2>
      {copy && <p>{copy}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <main id="top">
      <Header />

      <section className="hero">
        <div className="heroGlow" />
        <div className="shell heroGrid">
          <div className="heroCopy">
            <span className="eyebrow">CHAPTER I — GENESIS</span>
            <h1>2,222 GENESIS HORSES.<br /><em>22 HORSES RACE.</em><br />THE COMMUNITY DECIDES.</h1>
            <p className="lead">A community-powered NFT racing game on Robinhood Chain.</p>
            <div className="heroStats">
              <div><strong>6</strong><span>Seasons</span></div>
              <div><strong>60</strong><span>Races</span></div>
              <div><strong>$48K</strong><span>Rewards</span></div>
            </div>
            <div className="actions">
              <button className="primary" type="button">Mint Genesis — $30</button>
              <a className="secondary" href="#racing">How it works</a>
            </div>
          </div>

          <div className="heroArtwork">
            <div className="heroImageWrap">
              <Image src="/assets/hero-hof.png" alt="Horses of Fame Hall of Fame Genesis artwork" fill sizes="(max-width: 900px) 100vw, 42vw" priority />
            </div>
            <div className="heroArtMeta">
              <span>22 HALL OF FAME HORSES</span>
              <strong>1% OF GENESIS</strong>
              <small>Who receives them remains hidden until reveal.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="galleryBand" aria-label="Horses of Fame collection preview">
        <div className="galleryTrack shell">
          {gallery.map(([src, label], i) => (
            <article className="galleryCard" key={src}>
              <div className="galleryImage">
                <Image src={src} alt={`Horses of Fame collection preview ${i + 1}`} fill sizes="(max-width: 700px) 64vw, 20vw" />
              </div>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </section>

      <section id="racing" className="section darkBand">
        <div className="shell">
          <SectionTitle kicker="THE GAME LOOP" title="OWN. PICK. VOTE. COMPETE." copy="No random race result. The community determines who wins." />
          <div className="steps">
            {[["01","OWN","Hold one or more HOF Genesis NFTs."],["02","PICK","One wallet makes one secret pick per race."],["03","VOTE","All eligible Genesis VP in that wallet backs the same Hall of Fame horse."],["04","COMPETE","Your pick earns Community Championship points."]].map(([n,t,c]) => (
              <article className="step" key={n}><span>{n}</span><h3>{t}</h3><p>{c}</p></article>
            ))}
          </div>
          <div className="manifesto">NO RNG. NO BETTING. NO RACE-ENTRY FEES.</div>
        </div>
      </section>

      <section id="collection" className="section collectionSection">
        <div className="shell">
          <SectionTitle kicker="THE COLLECTION" title="22 ENTER THE HALL OF FAME" copy="Hidden among the 2,222 Genesis NFTs are 22 Hall of Fame horses. They race. The other 2,200 Genesis horses decide their fate." />
          <div className="bannerWrap">
            <Image src="/assets/collection-banner.png" alt="Horses of Fame collection" width={1500} height={561} />
          </div>
          <div className="splitCallout">
            <div><span>22</span><p>Hall of Fame racers<br />0 Voting Power</p></div>
            <div><span>2,200</span><p>Voting Genesis horses<br />4,800 total VP</p></div>
          </div>
          <div className="bigLine">22 HORSES RACE. 2,200 DECIDE.</div>
        </div>
      </section>

      <section id="tokenomics" className="section muted">
        <div className="shell">
          <SectionTitle kicker="VOTING POWER" title="BALANCED BY DESIGN" copy="Each rarity tier controls approximately one-fifth of total ecosystem Voting Power." />
          <div className="tableWrap">
            <table>
              <thead><tr><th>Rarity</th><th>Supply</th><th>VP / NFT</th><th>Total VP</th></tr></thead>
              <tbody>{tiers.map((r) => <tr key={r[0]}>{r.map((v) => <td key={v}>{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="note">Rarity increases Voting Power. It does not multiply Community Championship points.</p>
        </div>
      </section>

      <section className="section scoringSection">
        <div className="shell">
          <SectionTitle kicker="SCORING" title="ONE RACE. ONE SCORING SYSTEM." />
          <div className="scoreGrid">{scoring.map(([place, pts]) => <div key={place}><span>{place}</span><strong>{pts}</strong><small>PTS</small></div>)}</div>
          <div className="champGrid">
            <article><span>01</span><h3>Community Championship</h3><p>Every eligible wallet gets one score per race based on the finishing position of its selected Hall of Fame horse.</p></article>
            <article><span>02</span><h3>Hall of Fame Championship</h3><p>The 22 Hall of Fame horses accumulate the same points across each 10-race season.</p></article>
          </div>
        </div>
      </section>

      <section className="section rewards">
        <div className="rewardArt rewardArtLeft" aria-hidden="true">
          <img src="/assets/reward-left.webp" alt="" />
        </div>
        <div className="rewardArt rewardArtRight" aria-hidden="true">
          <img src="/assets/reward-right.webp" alt="" />
        </div>
        <div className="shell rewardContent">
          <SectionTitle kicker="REWARDS" title="$8,000 USDC EVERY SEASON" copy="Two championships. Two podiums. Six seasons." />
          <div className="rewardGrid">
            {["Community Championship","Hall of Fame Championship"].map((name) => (
              <article key={name}><h3>{name}</h3><div><span>1st</span><strong>$2,500</strong></div><div><span>2nd</span><strong>$1,000</strong></div><div><span>3rd</span><strong>$500</strong></div></article>
            ))}
          </div>
          <div className="bigLine">6 SEASONS · 60 RACES · $48,000 TOTAL REWARDS</div>
        </div>
      </section>

      <section id="roadmap" className="section roadmap">
        <div className="shell">
          <SectionTitle kicker="ROADMAP" title="CHAPTER I — GENESIS" copy="Only Chapter I is revealed. What follows stays locked." />
          <div className="roadCards">
            {[["I","GENESIS","UNLOCKED"],["II","???","LOCKED"],["III","???","LOCKED"],["IV","???","LOCKED"]].map((x, i) => (
              <article className={i===0 ? "activeRoad" : ""} key={x[0]}><span>CHAPTER {x[0]}</span><h3>{x[1]}</h3><small>{x[2]}</small></article>
            ))}
          </div>
          <div className="legacy">
            <div><strong>GENESIS GRAND CHAMPION</strong><span>#1 Hall of Fame horse after 60 races.</span></div>
            <div><strong>GENESIS COMMUNITY CHAMPION</strong><span>#1 Community wallet after 60 races.</span></div>
          </div>
        </div>
      </section>

      <section id="faq" className="section muted">
        <div className="shell narrow">
          <SectionTitle kicker="FAQ" title="THE ESSENTIALS" />
          {[
            ["How much is the Genesis mint?","$30 per NFT. All 2,222 Genesis NFTs must sell before the game activates."],
            ["How does a wallet vote?","One wallet makes one secret pick per race. All eligible Voting Power available in that wallet at submission backs that single Hall of Fame horse."],
            ["Can Voting Power be split?","No. A wallet cannot split its VP across multiple horses in the same race."],
            ["Does rarity increase Championship points?","No. Rarity affects Voting Power only. Every wallet receives one Community score per race."],
            ["How long is voting open?","24 hours. Once submitted, the pick and committed Voting Power are final for that race."],
            ["What happens after Season 6?","The #1 Hall of Fame horse becomes the Genesis Grand Champion and the #1 Community wallet becomes the Genesis Community Champion. Chapters II–IV remain undisclosed."],
          ].map(([q,a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="cta">
        <div className="shell ctaInner">
          <span>CHAPTER I</span>
          <h2>ENTER THE GENESIS.</h2>
          <p>2,222 NFTs · $30 mint · 22 Hall of Fame horses</p>
          <button className="primary" type="button">Mint Genesis</button>
        </div>
      </section>

      <footer><div className="shell footer"><strong>HORSES OF FAME</strong><span>8,888 HORSES · 4 CHAPTERS · 2,222 GENESIS · ONE HALL OF FAME</span></div></footer>
    </main>
  );
}
