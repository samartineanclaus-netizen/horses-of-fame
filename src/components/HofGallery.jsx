import {hofHorses} from '../lib/hofHorses';
import HofHorseCard from './HofHorseCard';

export default function HofGallery({heading='h1'}) {
  const Heading=heading;
  return <section aria-labelledby="hof-title"><p className="kicker">THE OFFICIAL 22</p><Heading id="hof-title">Hall of Fame</Heading><p className="hofMuted">22 horses race. The community decides.</p><ul className="hofCatalog">{hofHorses.map(horse=><li key={horse.number} className="hofCatalogCard"><HofHorseCard number={horse.number}/></li>)}</ul></section>;
}
