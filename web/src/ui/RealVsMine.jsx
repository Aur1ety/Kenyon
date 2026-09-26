import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { STATUS_MEANING, CHANNELS_PER_ODOUR, HIGE_CHARGE_DROP } from '../engine/index.js';
import { frac, pct, pm, int, words } from './format.js';

/** What the scan gives, counted from the circuit the page runs on. */
function fromScan(c) {
  if (!c) return null;
  const mbonTypes = new Set(c.mbon.type).size;
  const standIns = [c.pn, c.vpn, c.kc, c.mbon, c.dan, c.apl].reduce((n, g) => n + g.posFlag.filter((f) => f >= 2).length, 0);
  return [
    `Which neurons exist: the ${int(c.pn.n)} excitatory uniglomerular olfactory projection neurons the model uses, the ${int(c.vpn.n)} visual projection neurons that reach Kenyon cells (a small subset of the scan's visual projection neurons; RESULTS 2.1), ${int(c.kc.n)} Kenyon cells, ${int(c.mbon.n)} output neurons (MBONs) of ${int(mbonTypes)} types, ${int(c.dan.n)} dopamine neurons, ${int(c.apl.n)} APL cells.`,
    `Every synapse count between them: olfactory and visual projection neurons → Kenyon cells, Kenyon cells → MBONs (${int(c.nEdges)} plastic connections), dopamine neurons → MBONs.`,
    `Where each cell body sits (the positions in the 3D view), except ${words(standIns)} cells with no scanned cell body, drawn at the mean of their type.`,
    "Each MBON's transmitter, from the scan's consensus call.",
  ];
}

function setByMe(sparsity) {
  return [
    ['One learning rate', `set once so one pairing gives the ${pct(HIGE_CHARGE_DROP)} drop Hige et al. 2015 measured. A calibration.`],
    [`A top-${pct(sparsity)} rule on the Kenyon cells`, `a stand-in for APL inhibition. Which ${pct(sparsity)} fire is the wiring; how many is my choice.`],
    ['A binary Kenyon code', 'a cell fires or it does not.'],
    ['Synthetic odours', `${words(CHANNELS_PER_ODOUR)} random glomeruli each, with the antennal lobe bypassed (visual objects: ${words(CHANNELS_PER_ODOUR)} random visual projection-neuron types, switched on directly).`],
    ['One motor gain β for the choice', 'fitted on smell so the T-maze index lands in the wild-type range, and reused for vision.'],
    ['The valence rule of thumb', 'GABA or acetylcholine MBONs mean approach, glutamate means avoid (Aso et al. 2014).'],
    ['For “Does it reach the body?”', "the recurrent runs use DOOM-x-Fly's uniform rate model with one global gain, with the Kenyon code injected rather than computed."],
  ];
}

/** How to print each headline's live value. */
function show(item) {
  const v = item.value;
  switch (item.id) {
    case 'unpaired_drop':
      return `${frac(v)} (worst ${frac(item.worst)})`;
    case 'generalisation':
      return v.map((x) => frac(x)).join(' / ');
    case 'partial_cue':
      return `${frac(v)} (${pct(item.recallFraction)} of the full memory)`;
    case 'overwrite':
      return `keeps ${frac(v)}`;
    case 'reward':
    case 'coexistence':
      return `${frac(v[0])} / ${frac(v[1])}`;
    case 'multi_memory_choices':
      return Object.entries(v).map(([k, [a, b]]) => `${k} ${frac(a)} → ${frac(b)}`).join('; ');
    case 'tmaze':
      return item.betas.map((b) => `${frac(v[b])} at β ${b}`).join(', ');
    case 'shuffled_map_control':
    case 'lesion_APL':
      return `${frac(v[0])} → ${frac(v[1])}`;
    case 'lesion_KCgm':
      return pct(v);
    default:
      return typeof v === 'number' ? frac(v) : '';
  }
}

/** The same quantity in the stored results: the spread over ten odour draws where the write-up has one, else the
 * stored seed-0 run. Returns [text, file] or null. */
function stored(item, q) {
  if (!q) return null;
  const s = q.seeds;
  const n = `${s.n} draws`;
  const b = String(item.beta ?? item.betas?.[0] ?? '');
  switch (item.id) {
    case 'paired_drop':
      return [`${frac(s.paired.mean)} in all ${n}`, s.src];
    case 'unpaired_drop':
      return [`${pm(s.unpaired)} (worst ${pm(s.worst)}), ${n}`, s.src];
    case 'share_on_MBON11':
      return [`${pm(s.share)}, ${n}`, s.src];
    case 'generalisation':
      return [`${s.ladder.map((l) => frac(l.mean)).join(' / ')}, ${n}`, s.src];
    case 'partial_cue': {
      const same = q.recall.byCue.find((c) => c.cue === `${item.cue[0]}/${item.cue[1]}`);
      return [
        `${same ? `${pct(same.recall)} of the full memory for ${same.cue} glomeruli (mean over recall.py's own cues); ` : ''}graded, slope ${frac(q.recall.slope)}; recall equals overlap`,
        q.recall.src,
      ];
    }
    case 'overwrite':
      return [`keeps ${pm(s.retained)}, ${n}`, s.src];
    case 'reward':
      return [`${pm(s.rewardCompartments)} / ${frac(s.rewardAtMBON11.mean)}, ${n}`, s.src];
    case 'coexistence':
      return [`${frac(s.coexistA.mean)} / ${frac(s.coexistC.mean)}, ${n}`, s.src];
    case 'multi_memory_choices':
      return [Object.entries(q.behaviour.choices).map(([k, [a, b]]) => `${k} ${frac(a)} → ${frac(b)}`).join('; '), q.behaviour.src];
    case 'tmaze':
      return [`${pm(q.behaviour.piTenPairs[b])} at β ${b}, ${q.behaviour.nPairs} odour pairs`, q.behaviour.src];
    case 'shuffled_map_control':
      return [`${frac(q.behaviour.piSeed0[b])} → ${frac(q.shuffled.piSeed0[b])}`, [q.behaviour.src, q.shuffled.src]];
    case 'lesion_APL':
      return [`${frac(q.lesion.intactUnpaired)} → ${frac(q.lesion.aplUnpaired)}`, q.lesion.src];
    case 'lesion_KCgm':
      return [pct(q.lesion.kcgmShiftFrac), q.lesion.src];
    default:
      return null;
  }
}

export default function RealVsMine({ headlines, results, circuit, sparsity }) {
  const items = headlines ? headlines.items : [];
  const q = results?.q;
  const scan = fromScan(circuit);
  return (
    <section id="real" className="section" aria-labelledby="real-h">
      <div className="section__inner">
        <p className="eyebrow">Honesty is the point</p>
        <h2 id="real-h" className="section__h">What is real, and what is set by me</h2>
        <p className="section__lede">
          The size of the memory is a calibration, and I don&apos;t count it as a result. What the wiring decides is where
          the memory lands, how specific it is, how it spreads to similar odours, and which way the choice goes. Those
          could have come out wrong.
        </p>

        <div className="twocol">
          <div className="card">
            <h3 className="card__h"><Badge status="FROM THE SCAN">from the scan</Badge> MaleCNS v1.0 connectome</h3>
            {scan ? (
              <ul className="list">
                {scan.map((t) => <li key={t}>{t}</li>)}
              </ul>
            ) : (
              <p className="muted">Counting once the circuit has loaded…</p>
            )}
          </div>
          <div className="card">
            <h3 className="card__h"><Badge status="SET BY ME">set by me</Badge> chosen or fitted</h3>
            {sparsity != null ? (
              <ul className="list">
                {setByMe(sparsity).map(([a, b]) => <li key={a}><strong>{a}</strong>: {b}</li>)}
              </ul>
            ) : (
              <p className="muted">Reading the model&apos;s settings once the circuit has loaded…</p>
            )}
          </div>
        </div>

        <div className="tablewrap">
          <table className="table table--headlines">
            <caption>
              Every number in the &ldquo;This page&rdquo; column is computed live by this page&apos;s engine: on odours A to H
              of the results (one odour draw, seed 0), except the similarity ladder and the partial cue, which use one
              odour or cue per level drawn for this page, not the results&apos; own. Next to it is the same quantity in the
              Python model&apos;s stored output, over independent odour draws where the write-up has them, with the file it
              comes from.
            </caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">This page</th>
                <th scope="col">Stored result</th>
                <th scope="col">What decides it</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="muted">Computing once the circuit has loaded…</td></tr>
              )}
              {items.map((it) => {
                const st = stored(it, q);
                return (
                  <tr key={it.id}>
                    <th scope="row">{it.label}</th>
                    <td className="mono">{show(it)}</td>
                    <td>
                      {st ? (
                        <>
                          <span className="mono">{st[0]}</span>
                          <Src path={st[1]} />
                        </>
                      ) : results?.status === 'error' ? '–' : '…'}
                    </td>
                    <td>
                      <Badge status={it.status} />
                      <span className="table__note">{it.note}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {results?.status === 'error' && (
          <p className="error">The stored results could not be loaded ({String(results.error?.message || results.error)}).</p>
        )}

        <details className="more">
          <summary>What each label means</summary>
          <dl className="kv kv--wide">
            {[STATUS.CALIBRATION, STATUS.WIRING, STATUS.NEGATIVE, STATUS.FITTED, STATUS.MODELLED_CHOICE, STATUS.CONTROL, STATUS.RULE_CHANGE, STATUS.QUOTED].map((s) => (
              <div key={s}><dt><Badge status={s} /></dt><dd>{STATUS_MEANING[s]}</dd></div>
            ))}
          </dl>
        </details>
      </div>
    </section>
  );
}
