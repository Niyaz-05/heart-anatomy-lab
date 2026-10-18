import { useId, useMemo, useState } from 'react';
import { useLab } from '../app/LabContext';
import { isVisible } from '../app/state';
import { searchStructures } from '../app/search';

/** Search, layer toggles and the grouped structure list. Every entry selects on the model. */
export function StructurePanel() {
  const { def, state, dispatch } = useLab();
  const [query, setQuery] = useState('');
  const id = useId();
  const hits = useMemo(() => searchStructures(def.structures, query), [def, query]);
  const searching = query.trim().length > 0;

  const select = (sid: string) => dispatch({ type: 'select', id: sid });

  return (
    <section className="panel structure-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="panel-title">Structures</h2>

      <div className="search">
        <label htmlFor={`${id}-q`} className="sr-only">Search structures</label>
        <input
          id={`${id}-q`}
          type="search"
          placeholder="Search, e.g. mitral, LAD, SVC"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits[0]) select(hits[0].structure.id);
            if (e.key === 'Escape') setQuery('');
          }}
          autoComplete="off"
        />
      </div>

      {searching ? (
        <div className="search-results" aria-live="polite">
          {hits.length === 0 ? (
            <p className="muted small">No structure matches “{query.trim()}”.</p>
          ) : (
            <ul className="struct-list">
              {hits.map((h) => (
                <li key={h.structure.id}>
                  <button type="button" aria-pressed={state.selected === h.structure.id} onClick={() => select(h.structure.id)}>
                    <span>{h.structure.label}</span>
                    {h.matched !== h.structure.label && <span className="muted small"> · {h.matched}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <>
          <fieldset className="layers">
            <legend>Layers</legend>
            {def.layers.map((l) => (
              <label key={l.id} className="check" title={l.description}>
                <input type="checkbox" checked={state.visibleLayers.has(l.id)} onChange={() => dispatch({ type: 'toggle-layer', layer: l.id })} />
                {l.label}
              </label>
            ))}
          </fieldset>

          {def.layers.map((l) => {
            const items = def.structures.filter((s) => s.layer === l.id);
            if (!items.length) return null;
            return (
              <div key={l.id} className="group">
                <h3 className="group-title">{l.label}</h3>
                <ul className="struct-list">
                  {items.map((s) => {
                    const shown = s.kind === 'zone' || isVisible(def, state, s.id);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          aria-pressed={state.selected === s.id}
                          className={shown ? undefined : 'is-hidden'}
                          onClick={() => select(s.id)}
                          onMouseEnter={() => dispatch({ type: 'hover', id: s.kind === 'mesh' ? s.id : null })}
                          onMouseLeave={() => dispatch({ type: 'hover', id: null })}
                        >
                          {s.label}
                          {!shown && <span className="tag">hidden</span>}
                          {s.kind === 'zone' && <span className="tag">no mesh</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
