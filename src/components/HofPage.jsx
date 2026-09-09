import Link from 'next/link';
export default function HofPage({children}) {
  return <><header className="navWrap"><nav className="shell hofNav" aria-label="HOF navigation"><Link href="/">HORSES OF FAME</Link><div><Link href="/hall-of-fame">Hall of Fame</Link><Link href="/race">Vote</Link><Link href="/results">Race Reveal</Link><Link href="/standings">Leaderboards</Link></div></nav></header><main className="shell hofMain">{children}</main></>;
}
