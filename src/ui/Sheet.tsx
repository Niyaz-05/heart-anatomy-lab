import { useRef, type PointerEvent, type ReactNode } from 'react';
import { HALF, PEEK_PX, type Layout, type SheetState } from '../app/layout';

const NEXT: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' };

/** The full sheet reaches up to just below the top bar (styles.css uses the same --top-space). */
function fullPx(el: HTMLElement) {
  const top = parseFloat(getComputedStyle(el).getPropertyValue('--top-space')) || 130;
  return window.innerHeight - top - 10;
}

/**
 * The details panel. On desktops it floats on the right; on phones and portrait tablets it is a bottom
 * sheet with a handle: tap to step peek → half → full, or drag it and it snaps to the nearest height.
 * Phones on their side get a side sheet that the handle folds to one line.
 */
export function Sheet({ layout, state, onState, children }: { layout: Layout; state: SheetState; onState: (s: SheetState) => void; children: ReactNode }) {
  const aside = useRef<HTMLElement>(null);
  const drag = useRef<{ y: number; h: number; to: number; moved: boolean } | null>(null);
  const compact = layout !== 'desktop';
  const step = () => onState(layout === 'landscape' ? (state === 'peek' ? 'half' : 'peek') : NEXT[state]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!compact || !aside.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = aside.current.getBoundingClientRect().height;
    drag.current = { y: e.clientY, h, to: h, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || !aside.current || layout !== 'sheet') return;
    const dy = d.y - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (!d.moved) return;
    d.to = Math.min(Math.max(d.h + dy, PEEK_PX), fullPx(aside.current));
    // Follow the finger without the height animation.
    aside.current.style.transition = 'none';
    aside.current.style.blockSize = `${d.to}px`;
  };
  const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !aside.current) return;
    const h = d.to;
    aside.current.style.blockSize = '';
    aside.current.style.transition = '';
    if (!d.moved) { step(); return; }
    const vh = window.innerHeight;
    const snaps: [SheetState, number][] = [['peek', PEEK_PX], ['half', vh * HALF], ['full', fullPx(aside.current)]];
    const nearest = snaps.reduce((a, b) => (Math.abs(b[1] - h) < Math.abs(a[1] - h) ? b : a));
    onState(nearest[0]);
    e.preventDefault();
  };

  return (
    <aside ref={aside} className="right glass" aria-label="Details" data-sheet={compact ? state : undefined}>
      {compact && (
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={state !== 'peek'}
          aria-label={state === 'peek' ? 'Show the details' : state === 'half' && layout === 'sheet' ? 'Expand the details' : 'Fold the details away'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; if (aside.current) { aside.current.style.blockSize = ''; aside.current.style.transition = ''; } }}
          // Keyboard and assistive tech: Enter or Space steps through the heights.
          onClick={(e) => { if (e.detail === 0) step(); }}
        >
          <span aria-hidden="true" />
        </button>
      )}
      {children}
    </aside>
  );
}
