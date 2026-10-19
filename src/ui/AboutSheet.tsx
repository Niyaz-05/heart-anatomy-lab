import { useEffect, useRef } from 'react';
import { useLab } from '../app/LabContext';
import { BLOOD } from '../viewer/palette';

/**
 * Source, scope and credits, kept off the main screen. The BodyParts3D attribution required by
 * CC BY 4.0 lives here and is reachable from the ⓘ button and the "Source & credits" link.
 */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const { def } = useLab();
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    title.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="about-sheet glass"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ghost sheet-close" onClick={onClose} aria-label="Close">✕</button>
        <p className="eyebrow">Source &amp; scope</p>
        <h2 id="about-title" className="sheet-title" tabIndex={-1} ref={title}>About this lab</h2>
        <p>{def.summary}</p>

        <h3 className="group-title">You will learn to</h3>
        <ul className="objectives">
          {def.learningObjectives.map((o) => <li key={o.id}>{o.text}</li>)}
        </ul>

        <h3 className="group-title">Colours</h3>
        <p className="legend-row">
          <span><span className="dot" style={{ background: BLOOD['oxygen-poor'] }} aria-hidden="true" /> Oxygen-poor blood</span>
          <span><span className="dot" style={{ background: BLOOD['oxygen-rich'] }} aria-hidden="true" /> Oxygen-rich blood</span>
        </p>
        <p className="small muted">
          The heart is shown in its real colours: red-brown muscle with yellow fat along the coronary vessels, pale valves
          and artery walls, dark veins, and blood that is bright red when rich in oxygen and dark red when poor in oxygen
          (never blue). In the blood-flow animation the dark red is drawn slightly purple so the two are easy to tell
          apart. "Artery" and "vein" only describe direction: arteries carry blood away from the heart, veins towards it.
          So the pulmonary arteries carry oxygen-poor blood and the pulmonary veins carry oxygen-rich blood.
        </p>

        <h3 className="group-title">Please note</h3>
        <ul className="small disclaimers">
          {def.disclaimers.map((d) => <li key={d}>{d}</li>)}
        </ul>

        <h3 className="group-title">Source</h3>
        <p className="small">BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International.</p>
        <div className="link-list small">
          <a href={`${import.meta.env.BASE_URL}ATTRIBUTION.md`} target="_blank" rel="noopener">Attribution and changes made ↗</a>
          <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noopener noreferrer">Dataset licence ↗</a>
          <a href="https://doi.org/10.1093/nar/gkn613" target="_blank" rel="noopener noreferrer">Source publication ↗</a>
        </div>
      </section>
    </div>
  );
}
