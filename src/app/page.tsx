import Image from 'next/image';
import Link from 'next/link';
import LegendaryGallery from '@/components/LegendaryGallery';
import HofHorseCard from '@/components/HofHorseCard';

const scoring = [['1st',25],['2nd',18],['3rd',15],['4th',12],['5th',10],['6th',8],['7th',6],['8th',4],['9th',2],['10th',1]];
const tiers = [['Common',970,1,970],['Uncommon',480,2,960],['Rare',320,3,960],['Epic',240,4,960],['Legendary',190,5,950]];

export default function Home() {
  return <main className="luxHome">
    <section className="luxHero" aria-labelledby="hero-title">
      <div className="luxEdition"><span>HORSES OF FAME</span><span>CHAPTER I / GENESIS</span></div>
      <h1 id="hero-title" className="luxSrOnly">22 HORSES RACE. THE COMMUNITY DECIDES.</h1>
      <div className="luxBanner"><Image src="/brand/hof-banner.webp" alt="Two horses flank the gold HOF emblem. 22 horses race. The community decides." fill priority quality={90} sizes="100vw"/></div>
      <div className="shell luxHeroBottom">
        <p>A collection to own.<br/><em>A legacy to build.</em></p>
        <div className="luxHeroActions"><Link className="luxButton luxButtonGold" href="/mint">MINT <span aria-hidden="true">↗</span></Link><Link className="luxButton" href="/hall-of-fame">EXPLORE THE 22 <span aria-hidden="true">↗</span></Link><span className="luxMintNote">GENESIS PUBLIC MINT · 30 USDC / NFT</span></div>
      </div>
    </section>

    <section className="shell luxConcept" aria-label="The concept">
      <p className="luxEyebrow">THE COLLECTION IS ONLY THE BEGINNING</p>
      <p className="luxMotto">COLLECT <b>•</b> VOTE <b>•</b> RACE <b>•</b> REWARD <b>•</b> BUILD LEGACY</p>
      <p>22 Hall of Fame horses compete through community votes.<br/>2,200 voting Genesis NFTs give their holders a voice.</p>
    </section>

    <section className="shell luxSection" aria-labelledby="hall-title">
      <div className="luxSectionHead"><div><span className="luxEyebrow">01 / THE HALL OF FAME</span><h2 id="hall-title">Meet the <em>contenders.</em></h2></div><p>Twenty-two identities.<br/>One community decides their place in history.</p></div>
      <ul className="luxHofPreview">{[1,2,5,8].map(number => <li key={number}><Link href="/hall-of-fame"><HofHorseCard number={number}/></Link></li>)}</ul>
      <div className="luxSectionFoot"><p>The canonical 22 race horses · HOF = 0 VP</p><Link className="luxTextLink" href="/hall-of-fame">ENTER THE HALL OF FAME <span aria-hidden="true">↗</span></Link></div>
    </section>

    <section className="luxLegendaryBand" aria-labelledby="legendary-title"><div className="shell luxSection">
      <div className="luxSectionHead"><div><span className="luxEyebrow">02 / THE ART OF GENESIS</span><h2 id="legendary-title">The Legendary<br/><em>Collection.</em></h2></div><p>A separate artwork showcase.<br/>Discover the details. Explore the collection.</p></div>
      <LegendaryGallery preview/>
      <div className="luxSectionFoot"><p>Artwork previews, separate from the 22 Hall of Fame race horses.</p><Link href="/legendary" className="luxTextLink">EXPLORE LEGENDARY COLLECTION <span aria-hidden="true">↗</span></Link></div>
    </div></section>

    <section className="shell luxSection" id="racing" aria-labelledby="racing-title">
      <div className="luxSectionHead"><div><span className="luxEyebrow">03 / THE COMMUNITY DECIDES</span><h2 id="racing-title">Your voice.<br/><em>Their legacy.</em></h2></div><p>No external race results.<br/>The 22 horses compete through your votes.</p></div>
      <ol className="luxRaceSteps">
        <li><span>01</span><h3>Choose your horse.</h3><p>Connect your wallet. Select one of the 22 Hall of Fame horses.</p></li>
        <li><span>02</span><h3>Sign your vote.</h3><p>Your browser encrypts your choice. HOF sponsors on-chain inclusion. A signature alone is not a confirmed vote.</p></li>
        <li><span>03</span><h3>Let the race unfold.</h3><p>Voting stays open for 24 hours. Individual votes and intermediate rankings are hidden from the public.</p></li>
        <li><span>04</span><h3>Witness the reveal.</h3><p>The complete Race Reveal is followed by automatic scoring. Season and All-Time update after settlement completes.</p></li>
      </ol>
      <div className="luxSectionFoot"><p>TESTNET MVP: owner-trusted encryption. The backend can technically decrypt early.</p><Link href="/race" className="luxTextLink">ENTER RACING <span aria-hidden="true">↗</span></Link></div>
      <div className="luxUtilityLinks"><Link href="/results">Race Reveal</Link><Link href="/standings">Season & All-Time Leaderboards</Link></div>
    </section>

    <section className="luxRewardsBand" aria-labelledby="rewards-title"><div className="shell luxSection luxRewardsLayout">
      <div><span className="luxEyebrow">04 / THE CHAPTER I PRIZE PROGRAM</span><h2 id="rewards-title">A season of racing.<br/><em>A place in the story.</em></h2><p className="luxBody">After successful public sell-out, 48,000 USDC is allocated across six seasons: Community rewards and a reserved HOF allocation.</p><Link href="/rewards" className="luxTextLink">EXPLORE REWARDS <span aria-hidden="true">↗</span></Link></div>
      <div className="luxRewardNumbers"><div><strong>6</strong><span>SEASONS</span></div><div><strong>60</strong><span>RACES</span></div><p>Unawarded Community prizes stay in the Chapter 2 Prize Pool. HOF beneficiary payouts await the final V7 mechanism.</p><small>TESTNET / TEST ONLY / NO VALUE — MockUSDC has no monetary value.</small></div>
    </div></section>

    <section className="shell luxSection luxDetails" aria-labelledby="genesis-title">
      <div className="luxSectionHead"><div><span className="luxEyebrow">THE GENESIS EDITION</span><h2 id="genesis-title">Know the <em>collection.</em></h2></div><p>2,000 Public + 111 Community + 111 Team Reserve.<br/>2,222 Genesis NFTs in total.</p></div>
      <details><summary>Voting Power & rarity</summary><div className="tableWrap"><table><thead><tr><th>Rarity</th><th>Supply</th><th>VP / NFT</th><th>Total VP</th></tr></thead><tbody>{tiers.map(row=><tr key={row[0]}>{row.map((cell,i)=><td key={i}>{cell}</td>)}</tr>)}</tbody></table></div><p>4,800 total VP across 2,200 voting Genesis NFTs. The 22 HOF have 0 VP. Owner and designated Team wallet voting exclusions remain in effect. Rarity does not multiply Community points.</p></details>
      <details><summary>Race scoring</summary><div className="luxScoreLine">{scoring.map(([place,points])=><div key={place}><span>{place}</span><strong>{points}</strong></div>)}</div><p>Positions 11–22 receive 0 points. Each eligible wallet earns one scoring result for its chosen horse. No points claim is required.</p></details>
      <details><summary>One wallet. One horse.</summary><p>Voting Power cannot be split between horses. An eligible unused NFT acquired during voting may add VP only to the same pick. Your vote is valid only when included on-chain before the deadline. Direct fallback uses your own gas and requires an admission signature.</p></details>
      <details><summary>Public Mint & refund</summary><p>Public Mint is 30 USDC per NFT, with a maximum of 25 per transaction. All 2,000 Public NFTs must sell before the final deadline for the public sale to succeed. Eligible refunds follow current NFT ownership and burn the refunded NFT.</p><Link className="luxTextLink" href="/refund">REFUND STATUS ↗</Link></details>
      <details><summary>Beyond the first season</summary><p>Chapter I spans six seasons of ten races. After 60 races, the leading Hall of Fame horse is the Genesis Grand Champion and the leading Community wallet is the Genesis Community Champion. Chapters II–IV remain undisclosed.</p></details>
    </section>

    <section className="luxClosing"><div className="shell"><span className="luxEyebrow">CHAPTER I / GENESIS</span><h2>Every legacy<br/>has a <em>beginning.</em></h2><Link href="/mint" className="luxButton luxButtonGold">MINT GENESIS <span aria-hidden="true">↗</span></Link></div></section>
    <footer className="luxFooter shell"><Link href="/">HORSES OF FAME</Link><span>22 HORSES. THE COMMUNITY DECIDES.</span><nav aria-label="More information"><Link href="/status">Status</Link><Link href="/refund">Refund</Link><Link href="/hall-of-fame">Hall of Fame</Link></nav></footer>
  </main>;
}
