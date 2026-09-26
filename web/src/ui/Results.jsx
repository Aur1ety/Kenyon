import Badge, { STATUS } from './Badge.jsx';
import { COPY } from './copy.js';
import { int, pct, dropAsChange } from './format.js';
import { CHANNELS_PER_ODOUR } from '../engine/index.js';

const R = COPY.results;
const WAIT = '…';

/**
 * Results, in plain words: three findings, then "What it can't do". The big numbers are the stored ten-draw
 * averages (results/mb_seeds.json) and the stored partial-cue recall (results/recall.json), the README's own
 * numbers, all cited under "For scientists". If the stored files cannot be loaded, the cards fall back to the
 * engine's live headlines (one odour draw) and say so. The body card reads the stored whole-brain results.
 *
 * In each finding the heading comes first in the markup (screen readers jump by heading); CSS puts the big number
 * on top.
 */
export default function Results({ headlines, results, onGoToStep }) {
  const h = headlines ? Object.fromEntries(headlines.items.map((i) => [i.id, i])) : null;
  const q = results?.q;
  const m = q?.motor;
  const s = q?.seeds;
  const live = !s && results?.status === 'error' && !!h; // the stored averages failed: one test run on this page
  const cue = h ? h.partial_cue.cue : null; // [channels in the partial smell, smell A's channels]

  let v = null;
  if (s) {
    const near = s.ladder[0];
    v = { share: s.share.mean, paired: s.paired.mean, other: s.unpaired.mean, similar: near.mean, shared: near.shared, per: near.of, kept: s.retained.mean };
  } else if (live) {
    v = {
      share: h.share_on_MBON11.value, paired: h.paired_drop.value, other: h.unpaired_drop.value,
      similar: h.generalisation.value[0], shared: h.generalisation.shares[0], per: cue[1], kept: h.overwrite.value,
    };
  }
  const storedRecall = q && cue ? q.recall.byCue.find((c) => c.cue === `${cue[0]}/${cue[1]}`)?.recall : null;
  const recall = storedRecall ?? (live ? h.partial_cue.recallFraction : null);
  const na = results?.status === 'error' ? '–' : WAIT;

  return (
    <section id="results" className="section" aria-labelledby="results-h">
      <div className="section__inner">
        <h2 id="results-h" className="section__h">{R.h}</h2>
        <p className="section__lede">
          {R.lede} {s ? R.averages({ runs: int(s.n) }) : live ? R.oneRun : null}{' '}
          {R.labels} <a href="#glossary">{R.labelsLink}</a>.
        </p>

        <h3 className="section__sub">{R.showsH}</h3>
        <ul className="findings">
          <li className="finding">
            <h4 className="finding__h">{R.learnsH}</h4>
            <p className="finding__big">
              <span className="mono">{v ? pct(v.share) : na}</span>
              <small>{R.learnsUnit}</small>
            </p>
            <div className="finding__body">
              <p>{v ? R.learns({ drop: pct(v.paired) }) : na}</p>
              {v && (
                <p className="finding__tags">
                  {R.learnsTags({ drop: pct(v.paired) }).map((t, i) => (
                    <Badge key={t} status={i === 0 ? STATUS.WIRING : STATUS.CALIBRATION}>{t}</Badge>
                  ))}
                </p>
              )}
            </div>
          </li>
          <li className="finding">
            <h4 className="finding__h">{R.apartH}</h4>
            <p className="finding__big">
              <span className="mono">{v ? dropAsChange(v.other) : na}</span>
              <small>{R.apartUnit}</small>
            </p>
            <div className="finding__body">
              <p>
                {v ? R.apart({ other: pct(v.other), drop: pct(v.paired), shared: v.shared, per: v.per, similar: pct(v.similar) }) : na}
              </p>
              <p className="finding__tags"><Badge status={STATUS.WIRING}>{R.apartTag}</Badge></p>
            </div>
          </li>
          <li className="finding finding--negative">
            <h4 className="finding__h">{R.failsH}</h4>
            <p className="finding__big">
              <span className="mono">{v ? pct(v.kept) : na}</span>
              <small>{R.failsUnit}</small>
            </p>
            <div className="finding__body">
              <p>{R.fails}</p>
              <p className="finding__tags">
                <Badge status={STATUS.NEGATIVE} />
                <a href="#limits">{R.failsLink}</a>
              </p>
            </div>
          </li>
        </ul>

        <div id="limits" className="limits" aria-labelledby="limits-h" role="region">
          <h3 id="limits-h" className="section__sub">{R.limitsH}</h3>
          <p className="section__lede">{R.limitsLede}</p>
          <div className="grid3">
            <article className="card card--negative">
              <Badge status={STATUS.NEGATIVE} />
              <h4 className="card__h">{R.overwriteH}</h4>
              <p>{v ? R.overwrite({ kept: pct(v.kept) }) : na}</p>
              <a className="card__link" href="#fails-overwrite">{R.details}</a>
            </article>

            <article className="card card--negative">
              <Badge status={STATUS.NEGATIVE} />
              <h4 className="card__h">{R.partialH}</h4>
              <p>{cue && recall != null ? R.partial({ part: cue[0], per: cue[1], recall: pct(recall) }) : na}</p>
              <p className="card__actions">
                <button type="button" className="btn" onClick={() => onGoToStep?.(2)}>{R.partialTry}</button>
                <a href="#fails-partial">{R.details}</a>
              </p>
            </article>

            <article className="card card--negative">
              <p className="card__badges">
                <Badge status={STATUS.NEGATIVE} />
                <Badge status={STATUS.QUOTED} />
              </p>
              <h4 className="card__h">{R.bodyH}</h4>
              <p>
                {m ? R.body({ nDN: int(m.nDN), nAbove: int(m.nAbove), threshold: pct(m.threshold, 1), max: pct(m.maxFrac, 1) }) : na}
              </p>
              <a className="card__link" href="#body">{R.details}</a>
            </article>
          </div>
          <p className="small muted limits__foot">
            {R.footnote({ per: CHANNELS_PER_ODOUR })} <a href="#fails">{R.footnoteLink}</a>
          </p>
        </div>
      </div>
    </section>
  );
}
