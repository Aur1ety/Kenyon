import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { frac, pct, pm, int, words } from './format.js';

const WAIT = '…';

/** The honest negatives, reported next to the successes. The page's own numbers come from its engine; the rest
 * are read from the stored result files, each cited. */
export default function Negatives({ headlines, results, circuit, sparsity }) {
  const h = headlines ? Object.fromEntries(headlines.items.map((i) => [i.id, i])) : {};
  const q = results?.q;
  const overwrite = h.overwrite;
  const partial = h.partial_cue;

  return (
    <section id="fails" className="section" aria-labelledby="fails-h">
      <div className="section__inner">
        <p className="eyebrow">Where it fails</p>
        <h2 id="fails-h" className="section__h">The honest negatives</h2>
        <p className="section__lede">
          A model that only succeeds tells you little. These are the places Kenyon fails, or cannot test the claim at all.
        </p>

        <div className="grid3">
          <article className="card card--negative">
            <Badge status={STATUS.NEGATIVE} />
            <h3 className="card__h">Two memories in the same compartment overwrite each other</h3>
            <p>
              Train odour B after A, both punished, and A keeps only{' '}
              <strong className="mono">{overwrite ? frac(overwrite.value) : WAIT}</strong> of its memory on this page
              {q ? <> ({pm(q.seeds.retained)} over {q.seeds.n} draws)</> : null}. Real flies hold several. It is the
              published rule&apos;s recovery term; turning that term down fixes it, but that is a rule change.
            </p>
            {q && <Src path={q.seeds.src} />}
            <a className="card__link" href="#exp-h">Try it in the lab</a>
          </article>

          <article className="card card--negative">
            <Badge status={STATUS.NEGATIVE} />
            <h3 className="card__h">No pattern completion</h3>
            <p>
              Give it part of a trained odour and it recalls part of the memory
              {(() => {
                const cue = partial ? `${partial.cue[0]}/${partial.cue[1]}` : null;
                const same = q && cue ? q.recall.byCue.find((c) => c.cue === cue) : null;
                return (
                  <>
                    {same ? <> ({pct(same.recall)} for {partial.cue[0]} of {partial.cue[1]} glomeruli in the stored run</> : null}
                    {partial ? <>{same ? '; ' : ' ('}{pct(partial.recallFraction)} for the one {partial.cue[0]}-of-{partial.cue[1]} cue drawn for this page)</> : null}
                  </>
                );
              })()}
              : graded{q ? <>, slope {frac(q.recall.slope)} in the stored run</> : null}, never complete. Recall equals the
              Kenyon-cell overlap exactly. For this feedforward circuit that is forced by construction, so it measures the
              overlap; it is not a test that could have shown completion.
            </p>
            {q && <Src path={q.recall.src} section="section 4.3" />}
            <a className="card__link" href="#lab">Try a partial cue in step 3</a>
          </article>

          <article className="card card--negative">
            <Badge status={STATUS.NEGATIVE} />
            <h3 className="card__h">The size of the memory can&apos;t be made a prediction</h3>
            {q ? (
              <p>
                {words(q.magnitude.nCandidates)[0].toUpperCase() + words(q.magnitude.nCandidates).slice(1)} ways the dopamine
                pulses of a pairing could combine were scored against Hige&apos;s one-pulse and four-pulse arms. The
                eligibility-trace rule fits best (ratio {frac(q.magnitude.trace)} against a measured {frac(q.magnitude.measured)} ±{' '}
                {frac(q.magnitude.sem)}), but {q.magnitude.separates ? 'the measurement separates them' : 'the measurement separates none of them'}.
                It is under-powered.
              </p>
            ) : <p className="muted">{WAIT}</p>}
            {q && <Src path={q.magnitude.src} section="section 4.6" />}
          </article>

          <article className="card card--negative">
            <Badge status={STATUS.NEGATIVE} />
            <h3 className="card__h">The APL loop doesn&apos;t make the odour code</h3>
            {q ? (
              <p>
                Computing the Kenyon code from the real APL feedback wiring sets how many cells fire, but a uniform
                threshold gives codes at least as distinct as the real per-cell weights (in {words(q.apl.uniformAtLeastAsDistinct)} of{' '}
                {words(q.apl.nSeeds)} draws). The odour identity comes from the projection-neuron-to-Kenyon-cell wiring.
              </p>
            ) : <p className="muted">{WAIT}</p>}
            {q && <Src path={q.apl.src} section="section 4.5" />}
          </article>

          <article className="card card--negative">
            <Badge status={STATUS.NEGATIVE} />
            <h3 className="card__h">The recurrent brain model can&apos;t make a sparse code</h3>
            {q ? (
              <p>
                Inside the full recurrent network, at each of the {words(q.sparse.nThresholds)} Kenyon-cell thresholds tried,
                either {q.sparse.activeRange ? `${pct(q.sparse.activeRange[0])} to ${pct(q.sparse.activeRange[1])}` : 'none'} of
                Kenyon cells are on or all are off ({words(q.sparse.nAllOff)} thresholds), for every odour; never a sparse code
                like the {sparsity != null ? pct(sparsity) : WAIT} this page&apos;s rule keeps. So the code on this page is
                computed feedforward, and that is disclosed.
              </p>
            ) : <p className="muted">{WAIT}</p>}
            {q && <Src path={q.sparse.src} section="section 3.1" />}
          </article>

          <article className="card">
            <Badge status={STATUS.WIRING}>limit</Badge>
            <h3 className="card__h">Vision is coarser than smell</h3>
            {q ? (
              <p>
                The same circuit learns visual objects, but less specifically: over {q.seeds.n} draws unpaired objects lose{' '}
                {pm(q.seeds.visual.unpaired)} against {pm(q.seeds.unpaired)} for odours, because the visual pool is{' '}
                {circuit ? int(circuit.kc.nDrivable.visual) : int(q.seeds.visual.nDrivable)} Kenyon cells instead of{' '}
                {circuit ? int(circuit.kc.nDrivable.olfactory) : int(q.seeds.nDrivable)}.
              </p>
            ) : <p className="muted">{WAIT}</p>}
            {q && <Src path={q.seeds.src} />}
          </article>
        </div>

        <details className="more">
          <summary>Other limits worth knowing</summary>
          <ul className="list">
            <li>Odours are synthetic sets of glomeruli; the antennal lobe is bypassed.</li>
            <li>
              The Kenyon code is binary and fixed at the top {sparsity != null ? pct(sparsity) : WAIT} of the cells an odour can
              drive; the circuit runs feedforward, with no time axis.
            </li>
            <li>
              This page&apos;s odours A to H are one odour draw (the results&apos; seed 0); its similar odours and partial cues are
              one per level, drawn for the page. The spreads come from the stored runs over {q ? words(q.seeds.n) : 'several'} draws.
            </li>
            {q && (
              <li>
                Of the {words(q.lesion.nRows)} lesion rows in the write-up, {words(q.lesion.nIdentities)} cannot fail by
                construction; only the APL and KCg-m rows test the wiring. <Src path={q.lesion.src} section="section 4.2" />
              </li>
            )}
            <li>Cell bodies are drawn where the scan puts them; the synapses themselves sit in the calyx and lobes, which are not drawn.</li>
          </ul>
        </details>
      </div>
    </section>
  );
}
