import { COPY } from './copy.js';
import { REPO, repoFile } from './site.js';
import { int, millions } from './format.js';

const B = COPY.built;
const DOOM = 'https://github.com/Aur1ety/DOOM-x-Fly';
const WAIT = '…';

/**
 * What I built, in engineering terms. The whole-brain size is read from results/motor2_full.json, the circuit size
 * from the circuit the page runs, and the testing numbers from data/manifest.json (written by the export script).
 */
export default function Built({ circuit, results, manifest }) {
  const g = results?.q?.motor.graph;
  const nCircuit = circuit ? [circuit.pn, circuit.vpn, circuit.kc, circuit.mbon, circuit.dan, circuit.apl].reduce((s, p) => s + p.n, 0) : null;
  const ref = manifest?.reference_engine_check;
  const rows = manifest?.cell_order_check?.weights_rows_read;
  const I = B.items;
  const items = [
    [I.scan.h, I.scan.text({ nodes: g ? int(g.nodes) : WAIT, edges: g ? millions(g.edges) : WAIT, nCircuit: nCircuit ? int(nCircuit) : WAIT })],
    [I.parity.h, I.parity.text({ cases: ref ? int(ref.scenarios) : WAIT, sets: ref ? int(ref.kc_sets_checked) : WAIT, rows: rows ? millions(rows) : WAIT })],
    [I.view.h, I.view.text],
    [I.honest.h, I.honest.text],
  ];
  return (
    <section id="built" className="section section--built" aria-labelledby="built-h">
      <div className="section__inner">
        <h2 id="built-h" className="section__h">{B.h}</h2>
        <p className="section__lede">
          {B.introBefore}
          <a href={DOOM} rel="noopener noreferrer" target="_blank">{B.introLink}</a>
          {B.introAfter}
        </p>
        <div className="built">
          {items.map(([h, t], i) => (
            <article key={h} className="built__item">
              <span className="built__n mono" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="built__h">{h}</h3>
              <p>{t}</p>
            </article>
          ))}
        </div>
        <p className="built__stack">{B.stack}</p>
        <div className="links">
          <a className="btn btn--primary" href={REPO} rel="noopener noreferrer" target="_blank">{B.code}</a>
          <a className="btn" href={repoFile('docs/RESULTS.md')} rel="noopener noreferrer" target="_blank">{B.writeup}</a>
        </div>
      </div>
    </section>
  );
}
