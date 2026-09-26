import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { int, sci, frac, words, onePartIn } from './format.js';

const pctOfRate = (x, d = 2) => (x == null ? '–' : `${(100 * x).toFixed(d)}%`);
/** Rounded up, for an upper bound ("less than ..."): 0.000626 -> "0.07%". */
const pctOfRateUp = (x, d = 2) => (x == null ? '–' : `${(Math.ceil(100 * x * 10 ** d - 1e-9) / 10 ** d).toFixed(d)}%`);
const RESULTS_48 = 'docs/RESULTS.md';
// Each recurrent run stores only its eight largest movers by ABSOLUTE change, so re-sorting them by share of rate is
// a ranking only at the top. The per-cell file behind RESULTS 4.8 (results/motor2_full.npz, not read by the page)
// confirms that the three largest by share are the first three here (2.8%, 0.91% and 0.24%, the third largest
// mover); below them the stored list is not a ranking by share, so it is not shown.
const ROWS_VOUCHED = 3;

/**
 * "Does it reach the body?" Read from the stored outputs of the recurrent whole-brain model (results/motor*.json
 * and pathway.json, verbatim copies in public/data/results). Nothing here is computed by the page's engine: the
 * feedforward model has no descending neurons.
 */
export default function BodySection({ results }) {
  const q = results?.q;
  let body = null;
  if (q) {
    const m = q.motor;
    const movers = m.movers.slice(0, ROWS_VOUCHED);
    const cutOf = (key) => m.moversCut.find((x) => x.key === key);
    const scale = Math.max(0.03, movers[0]?.frac || 0.03);
    const contactText = m.contactsByCell.map((c) => `${c.cell} with ${words(c.synapses)} synapse${c.synapses === 1 ? '' : 's'}`).join(' and ');
    const conn = m.contacts.map((c) => c.synapses);
    const connText = conn.length > 1 ? `${conn.slice(0, -1).join(', ')} and ${conn[conn.length - 1]}` : String(conn[0] ?? '');
    const top = movers[0];
    const leftRight = m.contactsByCell.length ? m.contactsByCell[0] : null;
    const other = leftRight ? `${leftRight.cell.split(' ')[0]} ${leftRight.cell.endsWith('L') ? 'R' : 'L'}` : null;
    const otherHas = other ? m.contactsByCell.some((c) => c.cell === other) : false;

    body = (
      <>
        <div className="stats">
          <div className="stat">
            <span className="stat__big mono">{m.nAbove} <small>of</small> {int(m.nDN)}</span>
            <span className="stat__label">
              descending neurons move by more than {pctOfRate(m.threshold, 1)} of their own rate after one pairing;{' '}
              {m.nAbove5pct === 0 ? 'none' : m.nAbove5pct} by 5%
            </span>
          </div>
          <div className="stat">
            <span className="stat__big mono">{pctOfRate(m.maxFrac, 1)} <small>and</small> {pctOfRate(movers[1]?.frac, 2)}</span>
            <span className="stat__label">of their own rates: {movers[0]?.key} and {movers[1]?.key}, the {words(m.nAbove)} cells that move (means over {m.nDraws} odour draws)</span>
          </div>
          <div className="stat">
            <span className="stat__big mono">{m.synapses}</span>
            <span className="stat__label">synapses carry it: direct MBON11 contacts, in connections of {connText}</span>
          </div>
        </div>
        <p className="small muted stats__note">
          The count is taken from the {words(m.nStored)} largest movers each run stores, in every one of the {m.nDraws} draws; the
          per-cell file behind them (<Src path="results/motor2_full.npz" />) confirms that no other cell passes the line
          (RESULTS 4.8).
        </p>

        <div className="tablewrap">
          <table className="table dnchart">
            <caption>
              The {words(movers.length)} largest movers of the {int(m.nDN)} descending neurons, as a share of each cell&apos;s own
              rate: the intact unpruned graph, and the same run with those {m.synapses} synapses silenced. Each run stores only
              its {words(m.nStored)} largest absolute changes; the per-cell file behind RESULTS 4.8 confirms these{' '}
              {words(movers.length)} are also the largest by share. Below them the stored list is not a ranking by share, so it
              is not shown.
            </caption>
            <thead>
              <tr><th scope="col">Cell</th><th scope="col">Intact</th><th scope="col">{m.synapses} synapses silenced (one draw)</th></tr>
            </thead>
            <tbody>
              {movers.map((x) => {
                const c = cutOf(x.key);
                return (
                  <tr key={x.key}>
                    <th scope="row" className="mono">{x.key}</th>
                    <td>
                      <span className="hbar" aria-hidden="true"><span className="hbar__fill" style={{ width: `${(100 * x.frac) / scale}%` }} /></span>
                      <span className="mono">{pctOfRate(x.frac)}</span>
                    </td>
                    <td>
                      {c ? (
                        <>
                          <span className="hbar" aria-hidden="true"><span className="hbar__fill hbar__fill--cut" style={{ width: `${(100 * c.frac) / scale}%` }} /></span>
                          <span className="mono">{pctOfRate(c.frac)}</span>
                        </>
                      ) : (
                        <span className="muted">under {pctOfRate(m.cutAbsFloor / x.baseRate)} (no longer among the {words(m.nStored)} largest)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted"><Src path={[m.src.full, m.src.cut, m.src.anatomyFull]} /></p>

        <div className="twocol">
          <div className="card">
            <h3 className="card__h">What it is</h3>
            <ul className="list">
              <li>
                <strong>Faint.</strong> Across all {int(m.nDN)} descending neurons the pooled change is {sci(m.pooled)},{' '}
                {onePartIn(m.pooled)}; 95% of them move by less than {pctOfRateUp(m.p95Max)} of their rate in every odour draw;{' '}
                {m.nAbove5pct === 0 ? 'none' : m.nAbove5pct} moves by 5%.
              </li>
              <li>
                <strong>Through a side door.</strong> MBON11 contacts {contactText} directly. Silence those {m.synapses} synapses
                and both cells collapse; the largest change left is {pctOfRate(m.moversCut[0]?.frac)}, in {m.moversCut[0]?.key}.
              </li>
              <li>
                <strong>Real and specific.</strong> The trained odour moves the descending neurons {Math.round(m.specificity)} times more
                than untouched odours, and dosing MBON11 alone reproduces the pattern (cosine {frac(m.mbon11OnlyCos, 3)}).
              </li>
              <li>
                <strong>No memory-specific route to steering.</strong> The anatomy gives MBON11 no dedicated path to the steering
                neurons {q.pathway.steering.join(' and ')} ({q.pathway.pctModulated.toFixed(4)}% of their input).{' '}
                <Src path={q.pathway.src} section="section 4.4" />
              </li>
            </ul>
          </div>
          <div className="card">
            <h3 className="card__h">Pruned against unpruned</h3>
            <table className="table table--compact">
              <caption className="sr-only">The Doom graph against the unpruned graph</caption>
              <thead><tr><th scope="col" /><th scope="col">Doom graph (small connections dropped)</th><th scope="col">Unpruned</th></tr></thead>
              <tbody>
                <tr><th scope="row">Descending neurons</th><td className="mono">{int(m.nDNv5)}</td><td className="mono">{int(m.nDN)}</td></tr>
                <tr><th scope="row">Cells above {pctOfRate(m.threshold, 1)} of their rate</th><td className="mono">{m.nAboveV5}</td><td className="mono">{m.nAbove}</td></tr>
                <tr><th scope="row">Largest single cell</th><td className="mono">{pctOfRate(m.maxFracV5)}</td><td className="mono">{pctOfRate(m.maxFrac)}</td></tr>
                <tr><th scope="row">Pooled change</th><td className="mono nowrap">{sci(m.pooledV5)}</td><td className="mono nowrap">{sci(m.pooled)}</td></tr>
                <tr><th scope="row">Direct MBON11 → DN synapses</th><td className="mono">{m.synapsesV5}</td><td className="mono">{m.synapses}</td></tr>
                <tr><th scope="row">Memory, as a share of the odour&apos;s own effect</th><td className="mono">{frac(m.overOdourV5)}</td><td className="mono">{frac(m.overOdour)}</td></tr>
              </tbody>
            </table>
            <p className="small muted"><Src path={[m.src.v5, m.src.full, m.src.anatomyV5, m.src.anatomyFull]} /></p>
          </div>
        </div>

        <div className="card card--negative caveats">
          <h3 className="card__h"><Badge status={STATUS.NEGATIVE}>caveats</Badge> Read it narrowly (worst first)</h3>
          <ol className="list">
            <li>
              It rests on {words(m.synapses)} synapses in one reconstruction, in connections of {connText}, every one below the
              Doom graph&apos;s five-synapse threshold (RESULTS 4.8). It should not be read as a pathway in the animal.
            </li>
            {leftRight && (
              <li>
                The left-right split ({words(leftRight.synapses)} synapses onto {leftRight.cell}, {otherHas ? 'some' : 'none'} onto{' '}
                {other}) is at the scale where proofreading decisions matter.
              </li>
            )}
            <li>
              The recurrent runs use DOOM-x-Fly&apos;s uniform rate model with one global gain (set by me), and the Kenyon code
              is injected rather than computed, so the odour enters at the Kenyon cells and the antennal-lobe route to the
              lateral horn is not driven.
            </li>
            <li>
              The {words(m.nDraws)} odour draws re-measure one fixed pattern (cosine {frac(m.crossDrawCos, 4)} across draws), so
              their spread is not an uncertainty.
            </li>
            <li>
              In absolute rate it is tiny. Against the odour&apos;s own effect it is not: at {top?.key} the memory cancels
              and reverses the odour&apos;s response (RESULTS 4.8, from the per-cell file).
            </li>
          </ol>
          <p className="small muted"><Src path={RESULTS_48} section="section 4.8" /></p>
        </div>
      </>
    );
  }

  return (
    <section id="body" className="section" aria-labelledby="body-h">
      <div className="section__inner">
        <p className="eyebrow">Does it reach the body?</p>
        <h2 id="body-h" className="section__h">
          Barely. The {q ? `${words(q.motor.nAbove)} ` : ''}cells that move are reached through a side door.
        </h2>
        <p className="section__lede">
          The choice in step 4 is read through a rule of thumb. The stricter test is the descending neurons, the cells that
          carry commands from the brain to the body. For that the memory goes back inside the full recurrent brain model
          that DOOM-x-Fly runs, and is read at every descending neuron.
        </p>
        <p className="callout callout--quoted">
          <Badge status={STATUS.QUOTED}>quoted</Badge>
          <span>
            Computed by the recurrent whole-brain model, not by this page. Every number below is read from its stored
            outputs, cited under each block; the few that need the per-cell file say so.
          </span>
        </p>

        {results?.status === 'error' && <p className="error">Could not load the stored results ({String(results.error?.message || results.error)}).</p>}
        {!q && results?.status !== 'error' && <p className="muted">Loading the stored results…</p>}
        {body}
      </div>
    </section>
  );
}
