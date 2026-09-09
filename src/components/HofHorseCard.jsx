import Image from 'next/image';
import {getHofHorse,formatHofNumber,hofHorseAlt} from '../lib/hofHorses';

export function HofHorseIdentity({number,showImage=false}) {
  const horse = getHofHorse(number);
  return <span className="hofIdentity">{showImage && <Image src={horse.image} alt={hofHorseAlt(number)} width={96} height={96} quality={90} style={{objectFit:'contain'}}/>}<span className="hofNumber">{formatHofNumber(number)}</span><strong>{horse.name}</strong><span className="hofBreed">{horse.breed}</span></span>;
}

export default function HofHorseCard({number}) {
  const horse = getHofHorse(number);
  return <>
    <span className="hofPortrait">
      {horse.image ? <Image src={horse.image} alt={hofHorseAlt(number)} fill quality={90} sizes="(max-width: 600px) 90vw, (max-width: 900px) 45vw, 280px" style={{objectFit:'contain'}}/> : <span className="hofPortraitPending">Portrait awaiting upload</span>}
    </span>
    <HofHorseIdentity number={number}/>
  </>;
}
