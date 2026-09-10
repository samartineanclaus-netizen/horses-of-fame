'use client';

import {useEffect, useRef, useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {getEthereum, requestAccount} from '../lib/hofClient';

const links = [['/', 'Home'], ['/mint', 'Mint'], ['/race', 'Racing'], ['/standings', 'Leaderboards'], ['/rewards', 'Rewards'], ['/legendary', 'Legendary']];

export default function BrandHeader() {
  const pathname = usePathname();
  const menu = useRef(null);
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum?.request) return;
    let mounted = true;
    let changed = false;
    const reset = () => {changed = true; if(mounted) {setWallet(''); setMessage('Wallet or network changed. Connect again.');}};
    ethereum.on?.('accountsChanged', reset);
    ethereum.on?.('chainChanged', reset);
    Promise.all([ethereum.request({method:'eth_accounts'}), ethereum.request({method:'eth_chainId'})])
      .then(([accounts, chain]) => {if(mounted && !changed && chain === '0xb626' && accounts?.[0]) setWallet(accounts[0]);})
      .catch(() => {});
    return () => {mounted = false; ethereum.removeListener?.('accountsChanged', reset); ethereum.removeListener?.('chainChanged', reset);};
  }, []);

  async function connect() {
    setBusy(true); setMessage('');
    try {
      const ethereum = getEthereum();
      if (!ethereum) throw new Error('Install or open an Ethereum-compatible wallet to connect.');
      setWallet(await requestAccount(ethereum));
    }
    catch(error) {setMessage(error instanceof Error ? error.message : 'Could not connect wallet.');}
    finally {setBusy(false);}
  }
  const navigation = links.map(([href,label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} onClick={() => {if(menu.current) menu.current.open = false;}}>{label}</Link>);
  return <header className="brandHeader">
    <a href="#main-content" className="luxSkip">Skip to content</a>
    <nav className="shell brandNav" aria-label="Main navigation">
      <Link href="/" className="brandHome" aria-label="Horses of Fame home"><Image src="/brand/hof-logo.webp" alt="HOF — Horses of Fame" width={96} height={96} priority/><span>HORSES OF FAME<small>THE GENESIS CHAPTER</small></span></Link>
      <div className="brandDesktopLinks">{navigation}</div>
      <button type="button" className="luxWallet" disabled={busy} onClick={connect}>{busy ? 'Connecting…' : wallet ? `${wallet.slice(0,6)}…${wallet.slice(-4)}` : 'Connect Wallet'}</button>
      <details ref={menu} className="brandMobileMenu"><summary aria-label="Toggle navigation">Menu</summary><div>{navigation}<Link href="/hall-of-fame" onClick={() => {menu.current.open = false;}}>Hall of Fame</Link><Link href="/results" onClick={() => {menu.current.open = false;}}>Race Reveal</Link></div></details>
    </nav>
    {message && <p className="luxWalletMessage" role="status">{message}</p>}
  </header>;
}
