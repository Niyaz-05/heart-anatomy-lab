import { useLab } from '../app/LabContext';
import { BLOOD } from '../viewer/palette';

/** Blood-flow mode: play/pause, the ordered sequence (clickable), and the oxygen colour key. */
export function FlowPanel() {
  const { def, state, dispatch } = useLab();
  const path = def.flowPaths[0];
  if (!path) return null;
  return (
    <section className="sheet flow-panel" aria-labelledby="flow-title">
      <div className="detail-head">
        <h2 id="flow-title" className="panel-title">{path.label}</h2>
        <button type="button" className="secondary" onClick={() => dispatch({ type: 'set-playing', value: !state.playing })} aria-pressed={!state.playing}>
          {state.playing ? 'Pause' : 'Play'}
        </button>
      </div>
      <ol className="flow-steps">
        {path.steps.map((st, i) => (
          <li key={i} className={st.blood}>
            <span className="dot" aria-hidden="true" style={{ background: st.blood === 'not-applicable' ? '#888' : BLOOD[st.blood] }} />
            {st.structure ? (
              <button type="button" className="link" aria-pressed={state.selected === st.structure} onClick={() => dispatch({ type: 'select', id: st.structure! })}>{st.label}</button>
            ) : (
              <span className="offmodel">{st.label} <span className="tag">not on model</span></span>
            )}
            {st.note && <span className="muted small block">{st.note}</span>}
          </li>
        ))}
      </ol>
      <Legend />
    </section>
  );
}

export function Legend() {
  return (
    <div className="legend small" aria-label="Colour key">
      <span><span className="dot" style={{ background: BLOOD['oxygen-poor'] }} aria-hidden="true" /> Oxygen-poor blood</span>
      <span><span className="dot" style={{ background: BLOOD['oxygen-rich'] }} aria-hidden="true" /> Oxygen-rich blood</span>
    </div>
  );
}
