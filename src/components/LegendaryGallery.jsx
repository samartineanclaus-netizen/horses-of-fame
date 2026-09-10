'use client';

import {useRef, useState} from 'react';
import Image from 'next/image';
import artworks from '../data/legendaryArtwork.json';

export default function LegendaryGallery({preview = false}) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const [active, setActive] = useState(null);
  const visible = preview ? artworks.slice(0, 4) : artworks;

  function open(artwork, button) {
    trigger.current = button;
    setActive(artwork);
    dialog.current.showModal();
  }

  return <>
    <ul className="legendaryGrid">
      {visible.map(artwork => <li key={artwork.assetKey}>
        <button className="legendaryCard" type="button"
          aria-label={`Enlarge ${artwork.label}`}
          aria-haspopup="dialog" onClick={event => open(artwork, event.currentTarget)}>
          <Image src={artwork.image} alt={artwork.alt}
            width={artwork.width} height={artwork.height} loading="lazy" quality={90}
            sizes="(max-width: 479px) calc(100vw - 40px), (max-width: 767px) 45vw, (max-width: 1100px) 30vw, 280px" />
          <span>{artwork.label}</span>
        </button>
      </li>)}
    </ul>
    <dialog ref={dialog} className="legendaryDialog" aria-labelledby="legendary-dialog-title"
      onClose={() => {setActive(null); trigger.current?.focus();}}>
      <div className="legendaryDialogBar">
        <h2 id="legendary-dialog-title">{active?.label}</h2>
        <button type="button" onClick={() => dialog.current.close()} aria-label="Close artwork">Close ×</button>
      </div>
      {active && <Image src={active.image} alt={active.alt} width={active.width}
        height={active.height} quality={90} sizes="(max-width: 900px) 90vw, 850px" />}
    </dialog>
  </>;
}
