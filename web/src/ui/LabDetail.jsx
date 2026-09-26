import MbonBars from './MbonBars.jsx';
import Experiments from './Experiments.jsx';
import { BetaSwitch } from './TMaze.jsx';
import { displayName, BETA_TABLES, BETA_WALKTHROUGH } from './useKenyon.js';
import { int, words } from './format.js';
import { sceneRows, flagged } from './sceneText.js';
import { CHANNELS_PER_ODOUR } from '../engine/index.js';

/**
 * "The lab in detail" (For scientists): the sense switch, the motor gain, what every output neuron receives, the
 * text view of the 3D scene and the ready-made experiments. All of it runs on the same model state as the steps.
 */
export default function LabDetail({ model, beta, setBeta, announce, headlines, results, goToStep, setSelected }) {
  const { circuit, current, masks, modality, actions } = model;
  const rows = sceneRows(model);
  return (
    <section id="lab-detail" className="section section--sub" aria-labelledby="lab-detail-h">
      <div className="section__inner">
        <h3 id="lab-detail-h" className="section__h">The lab in detail</h3>
        <p className="section__lede">
          The same model as the steps above: what you change here changes the lab, and the other way round.
        </p>

        <div className="detail-controls">
          <div>
            <h4 className="detail-controls__h" id="sense-h">Sense</h4>
            <div className="modality" role="group" aria-labelledby="sense-h">
              {[
                ['olfactory', 'Smell', `odours: ${words(CHANNELS_PER_ODOUR)} glomeruli (smell channels) each`, 'olfactory projection neurons'],
                ['visual', 'Sight', `objects: ${words(CHANNELS_PER_ODOUR)} visual channels (sight channels) each`, 'visual projection neurons'],
              ].map(([id, label, sub, via]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={modality === id}
                  className="modality__opt"
                  onClick={() => {
                    if (modality === id) return;
                    actions.setModality(id);
                    setSelected(null);
                    announce(`${label}: the same circuit through the ${via}.`);
                  }}
                >
                  <span>{label}</span>
                  <small>{sub}</small>
                </button>
              ))}
            </div>
          </div>
          <div>
            <h4 className="detail-controls__h" id="beta-h">Choice-strength setting (motor gain β)</h4>
            <BetaSwitch beta={beta} setBeta={setBeta} betas={[BETA_TABLES, BETA_WALKTHROUGH]} />
            <p className="small muted">It sets the size of the modelled choice in step 3; its direction comes from the wiring.</p>
          </div>
        </div>

        <div className="detail-block">
          <h4 id="mbon-h" className="panel-block__h">What the output neurons receive</h4>
          <MbonBars circuit={circuit} frame={current} masks={masks} odourLabel={current ? displayName(current.odour.name) : ''} />
        </div>

        <div className="detail-block">
          <h4 id="scene-text" className="panel-block__h">Text view of the 3D scene</h4>
          <table className="table table--compact">
            <caption>Cells drawn, at their scanned cell-body positions (MaleCNS v1.0)</caption>
            <thead><tr><th scope="col">Cells</th><th scope="col">Drawn</th><th scope="col">Lit now</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}><th scope="row">{r.label}</th><td className="mono">{int(r.n)}</td><td>{r.lit}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">
            Positions are raw MaleCNS voxel coordinates (x toward the fly&apos;s left, y ventral, z posterior).{' '}
            {int(flagged(circuit.kc, 2))} Kenyon cells and {int(flagged(circuit.mbon, 2))} MBON have no scanned cell body and sit at the
            mean of their type; {int(flagged(circuit.kc, 1, 1))} Kenyon cells and {int(flagged(circuit.pn, 1, 1))} projection neurons
            sit at a scanned point on the neurite.
          </p>
          <p className="small muted">
            Single cells: with a mouse, hovering a point shows that cell&apos;s type, side, body ID and position source.
            There is no keyboard or touch equivalent for single cells; this table gives the counts per class, and
            &ldquo;What the output neurons receive&rdquo; above lists every MBON type.
          </p>
        </div>

        <Experiments
          model={model}
          beta={beta}
          announce={announce}
          headlines={headlines}
          results={results}
          goToStep={goToStep}
          setSelected={setSelected}
        />
      </div>
    </section>
  );
}
