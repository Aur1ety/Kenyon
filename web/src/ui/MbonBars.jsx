import { useMemo, useState } from 'react';
import { int, dropAsChange } from './format.js';

/**
 * Drive onto each MBON type for the odour on the rig: now (current weights) against untrained (every weight
 * at rest). Numbers are the engine's; this component only groups the 97 cells by their 37 types.
 */
export default function MbonBars({ circuit, frame, masks, odourLabel }) {
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    if (!circuit || !frame) return [];
    const m = circuit.mbon;
    const byType = new Map();
    for (let i = 0; i < m.n; i++) {
      const t = m.type[i];
      let r = byType.get(t);
      if (!r) {
        r = { type: t, comp: m.compartmentLabel[i], nt: m.nt[i], valence: m.valence[i], now: 0, before: 0, punish: false, reward: false, cells: 0 };
        byType.set(t, r);
      }
      r.now += frame.mbonDrive[i];
      r.before += frame.mbonUntrained[i];
      r.cells += 1;
      if (masks?.punish[i]) r.punish = true;
      if (masks?.reward[i]) r.reward = true;
    }
    const list = [...byType.values()];
    list.sort((a, b) => (b.type === 'MBON11') - (a.type === 'MBON11') || b.before - a.before);
    return list;
  }, [circuit, frame, masks]);

  if (!frame) {
    return <p className="muted">Pick an odour to see how strongly it drives each output neuron.</p>;
  }

  const max = Math.max(1, ...rows.map((r) => Math.max(r.before, r.now)));
  const shown = all ? rows : rows.filter((r, i) => i < 9 || r.punish || r.reward);

  return (
    <div className="mbon">
      <table className="mbon__table">
        <caption>
          Drive onto each MBON type for {odourLabel}: synapse-weighted input from the firing Kenyon cells (model
          units). The faint bar is the untrained circuit.
        </caption>
        <thead>
          <tr>
            <th scope="col">MBON type</th>
            <th scope="col">Drive now <span className="muted">(untrained)</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const d = r.before > 0 ? 1 - r.now / r.before : null;
            const lost = r.before - r.now;
            const tone = r.punish ? 'punish' : r.reward ? 'reward' : 'other';
            return (
              <tr key={r.type} className={r.type === 'MBON11' ? 'is-key' : undefined}>
                <th scope="row">
                  <span className="mbon__type">{r.type}</span>
                  <span className="mbon__meta">
                    {r.comp} · {r.valence > 0 ? 'approach' : 'avoid'}
                    {r.punish ? ' · punishment compartment' : ''}
                    {r.reward ? ' · reward compartment' : ''}
                  </span>
                </th>
                <td>
                  <div className="bar" aria-hidden="true">
                    <span className="bar__ghost" style={{ width: `${(100 * r.before) / max}%` }} />
                    <span className="bar__now" style={{ width: `${(100 * r.now) / max}%` }} />
                    {lost > 0.5 && (
                      <span
                        className={`bar__lost bar__lost--${tone}`}
                        style={{ left: `${(100 * r.now) / max}%`, width: `${(100 * lost) / max}%` }}
                      />
                    )}
                  </div>
                  <span className="mbon__num">
                    {int(r.now)} <span className="muted">({int(r.before)})</span>
                    {d != null && Math.abs(d) >= 0.005 && <strong className={`mbon__chg mbon__chg--${tone}`}> {dropAsChange(d)}</strong>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="linkbtn" onClick={() => setAll((a) => !a)} aria-expanded={all}>
        {all ? 'Show fewer types' : `Show all ${rows.length} MBON types`}
      </button>
    </div>
  );
}
