import type {Metadata} from 'next';
import LegendaryGallery from '@/components/LegendaryGallery';

export const metadata: Metadata = {
  title: 'Legendary Collection — Horses of Fame',
  description: 'Explore 15 Legendary artwork previews in a dedicated collection showcase.',
};

export default function LegendaryPage() {
  return <main className="shell legendaryPage">
    <p className="kicker">GENESIS · ARTWORK SHOWCASE</p>
    <h1>Legendary Collection</h1>
    <p className="legendaryIntro">Fifteen artwork previews. A collection showcase separate from the 22 Hall of Fame race horses.</p>
    <p className="hofMuted">Artwork numbers are gallery references, not NFT Token IDs. No individual token allocation or Voting Power is assigned by this preview.</p>
    <LegendaryGallery />
  </main>;
}
