import { glossary } from './copy.js';
import { int, pct, frac, words } from './format.js';
import { BETA_TABLES, BETA_WALKTHROUGH } from './useKenyon.js';
import { CHANNELS_PER_ODOUR, HIGE_CHARGE_DROP } from '../engine/index.js';

/** Plain words and their technical names, one row per term. Counts come from the circuit and the stored results. */
export default function Glossary({ circuit: c, results, sparsity }) {
  const q = results?.q;
  const k = {
    kc: c ? int(c.kc.n) : null,
    pn: c ? int(c.pn.n) : null,
    vpn: c ? int(c.vpn.n) : null,
    vch: c ? int(c.visualChannels.length) : null,
    glom: c ? int(c.glomeruli.length) : null,
    mbon: c ? int(c.mbon.n) : null,
    mbon11: c ? int(c.mbon11.length) : null,
    punish: c ? int(c.dan.punishIdx.length) : null,
    reward: c ? int(c.dan.rewardIdx.length) : null,
    apl: c ? int(c.apl.n) : null,
    per: CHANNELS_PER_ODOUR,
    perWord: words(CHANNELS_PER_ODOUR),
    target: pct(HIGE_CHARGE_DROP),
    sparsity: sparsity != null ? pct(sparsity) : null,
    wild: q ? `${frac(q.behaviour.wildType[0])} to ${frac(q.behaviour.wildType[1])}` : null,
    betaTables: BETA_TABLES,
    betaWalk: BETA_WALKTHROUGH,
    nodes: q ? int(q.motor.graph.nodes) : null,
    nodesV5: q ? int(q.motor.graphV5.nodes) : null,
  };
  const rows = glossary({ c, q, k });
  return (
    <section id="glossary" className="section section--sub" aria-labelledby="glossary-h">
      <div className="section__inner">
        <h3 id="glossary-h" className="section__h">Plain words and their technical names</h3>
        <p className="section__lede">
          The rest of the page uses the plain words. Here is what each one means, and the name a biologist would use.
        </p>
        <div className="tablewrap tablewrap--glossary">
          <table className="table glossary">
            <thead>
              <tr>
                <th scope="col">Plain word</th>
                <th scope="col">Technical name</th>
                <th scope="col">What it means</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([plain, tech, line]) => (
                <tr key={plain}>
                  <th scope="row">{plain}</th>
                  <td data-label="Technical name">{tech}</td>
                  <td data-label="What it means">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
