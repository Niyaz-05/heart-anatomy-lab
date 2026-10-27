import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabProvider, useLab } from './app/LabContext';
import type { Mode } from './app/state';
import { validateDefinition } from './contract/validate';
import { heartDefinition } from './heart/definition';
import { HeartViewer } from './viewer/HeartViewer';
import { StructurePanel } from './ui/StructurePanel';
import { DetailPanel } from './ui/DetailPanel';
import { FlowPanel } from './ui/FlowPanel';
import { TourPanel } from './ui/TourPanel';
import { AboutSheet } from './ui/AboutSheet';
import { Sheet } from './ui/Sheet';
import { isTouch, panelInsets, useChrome, useLayout, type SheetState } from './app/layout';

const MODES: { id: Mode; label: string }[] = [
  { id: 'explore', label: 'Anatomy' },
  { id: 'flow', label: 'Blood flow' },
  { id: 'tour', label: 'Guided tour' },
];

function Toolbar({ structuresOpen, onStructures }: { structuresOpen: boolean; onStructures: () => void }) {
  const { def, state, dispatch } = useLab();
  return (
    <div className="dock glass" role="toolbar" aria-label="View controls">
      <button type="button" className="mobile-only dock-structures" aria-pressed={structuresOpen} onClick={onStructures}>
        Structures
      </button>
      <div className="seg" role="group" aria-label="Camera views">
        {def.cameraPresets.map((c) => (
          <button key={c.id} type="button" aria-pressed={state.camera.preset === c.id} onClick={() => dispatch({ type: 'camera', preset: c.id })}>
            {c.label}
          </button>
        ))}
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <label className="check toolbar-check">
        <input type="checkbox" checked={state.labels} onChange={(e) => dispatch({ type: 'set-labels', value: e.target.checked })} />
        Labels
      </label>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'camera', preset: state.camera.preset })} title="Fit the heart in view">Fit</button>
      <button type="button" className="secondary" onClick={() => dispatch({ type: 'reset' })} title="Reset camera, layers, selection and mode">Reset</button>
    </div>
  );
}

/** Right-hand sheet: shown only when there is something to show. */
function SidePanel() {
  const { state } = useLab();
  if (state.mode === 'tour') return <TourPanel />;
  if (state.mode === 'flow' && !state.selected) return <FlowPanel />;
  return <DetailPanel />;
}

function Lab() {
  const { def, state, dispatch } = useLab();
  const [about, setAbout] = useState(false);
  // Phones and tablets: the structure panel opens over the model from the dock.
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [sheet, setSheet] = useState<SheetState>('half');
  const root = useRef<HTMLDivElement>(null);
  const closeAbout = useCallback(() => setAbout(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (typing || about) return;
      if (e.key === 'Escape') dispatch({ type: 'select', id: null });
      if (e.key === '0' || e.key === 'Home') dispatch({ type: 'camera', preset: def.defaultCamera });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [def, dispatch, about]);

  // Picking a structure from the panel on a phone closes the panel so the details can show.
  useEffect(() => {
    if (state.selected) setStructuresOpen(false);
  }, [state.selected]);
  // Something new to read opens the sheet halfway.
  useEffect(() => { setSheet('half'); }, [state.selected, state.mode]);
  const toggleStructures = () => { if (!structuresOpen) setSheet('peek'); setStructuresOpen(!structuresOpen); };

  const hasSheet = state.mode !== 'explore' || state.selected !== null;
  const { w, h, layout } = useLayout();
  const chrome = useChrome(root);
  const insets = useMemo(() => panelInsets(layout, w, h, { hasSheet, sheet, ...chrome }), [layout, w, h, hasSheet, sheet, chrome]);
  const touch = useMemo(isTouch, []);
  const meshCount = def.structures.filter((s) => s.kind === 'mesh').length;

  return (
    <div className="app" ref={root} data-mode={state.mode} data-layout={layout} data-sheet={hasSheet ? sheet : 'none'}>
      <main className="stage">
        <HeartViewer insets={insets} />
      </main>

      <header className="identity">
        <p className="eyebrow"><span className="status-dot" aria-hidden="true" /> Interactive anatomy</p>
        <h1>Human Heart</h1>
        <p className="identity-meta">{meshCount} structures · BodyParts3D</p>
      </header>

      <nav className="top-actions" aria-label="Mode">
        <div className="modes glass">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={state.mode === m.id} onClick={() => dispatch({ type: 'set-mode', mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-button glass" aria-label="About this lab, sources and credits" onClick={() => setAbout(true)}>
          <span aria-hidden="true">i</span>
        </button>
      </nav>

      <aside className={`left glass ${structuresOpen ? 'mobile-open' : ''}`}>
        <StructurePanel />
      </aside>

      {hasSheet && (
        <Sheet layout={layout} state={sheet} onState={setSheet}>
          <SidePanel />
        </Sheet>
      )}

      <Toolbar structuresOpen={structuresOpen} onStructures={toggleStructures} />

      <footer className="studio-footer">
        <span className="hint">{touch ? 'Drag to rotate · Pinch to zoom · Tap to inspect' : 'Drag to rotate · Scroll to zoom · Click to inspect'}</span>
        <button type="button" className="link" onClick={() => setAbout(true)}>Source &amp; credits</button>
      </footer>

      {about && <AboutSheet onClose={closeAbout} />}
    </div>
  );
}

export default function App() {
  const result = validateDefinition(heartDefinition);
  if (!result.ok) {
    // A broken definition must be visible, not silently half-rendered.
    return (
      <div className="fatal" role="alert">
        <h1>This simulation definition is invalid</h1>
        <ul>{result.issues.map((i) => <li key={`${i.path}-${i.code}`}><code>{i.path}</code>: {i.message}</li>)}</ul>
      </div>
    );
  }
  return (
    <LabProvider def={result.definition}>
      <Lab />
    </LabProvider>
  );
}
