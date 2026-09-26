import { useMemo, useState } from 'react';
import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { displayName } from './useKenyon.js';
import { pct, frac, pm } from './format.js';
import { choiceProbability } from '../engine/index.js';

/** The reciprocal index at any beta, from the scores the engine's T-maze returned (behaviour.py 103-128). */
function piAt(pi, beta) {
  const p = (x, y) => choiceProbability(x, y, beta);
  const a = pi.scoresAfterPunishingA;
  const b = pi.scoresAfterPunishingB;
  return 0.5 * (p(a[1], a[0]) - p(a[0], a[1])) + 0.5 * (p(b[0], b[1]) - p(b[1], b[0]));
}

/** The beta range over which this pair's index sits inside [lo, hi] (null if it never does up to beta 64). */
function betaRange(pi, [lo, hi]) {
  let first = null, last = null;
  for (let beta = 0.1; beta <= 64; beta += 0.1) {
    const v = piAt(pi, beta);
    if (v >= lo && v <= hi) {
      if (first === null) first = beta;
      last = beta;
    }
  }
  return first === null ? null : [first, last];
}

const letter = (name) => (name.startsWith('v') ? name.slice(1) : name);

/** Step 4: the modelled two-arm choice and the reciprocal T-maze index, both from the engine. */
export default function TMaze({ model, results, trained, hasMemory, beta, setBeta, betas }) {
  const { actions, odourSet, modality } = model;
  const others = odourSet.filter((n) => n !== trained);
  const [opp, setOpp] = useState(others.includes('B') ? 'B' : others[0]);
  const opponent = others.includes(opp) ? opp : others[0];
  const visual = modality === 'visual';
  const noun = visual ? 'object' : 'odour';

  const now = actions.choice(opponent, trained, beta);
  const pOpp = now ? now.P : 0.5;
  const pTrained = 1 - pOpp;
  const pOppUntrained = now ? now.PUntrained : 0.5;

  // the reciprocal index trains its own copy, so it depends only on the pair (and the modality)
  const pi = useMemo(() => actions.tmaze(trained, opponent), [trained, opponent, modality]); // eslint-disable-line react-hooks/exhaustive-deps
  const piNow = pi?.byBeta[beta];
  const wild = results?.behaviour.wildType || null;
  // beta was fitted on smell; vision reuses it, so the fitted range is only shown for odours
  const fitRange = useMemo(() => (pi && wild && !visual ? betaRange(pi, wild) : null), [pi, wild, visual]);
  // describe this pair's index by beta from the numbers themselves (visual pairs can rise and then fall)
  const piValues = Object.values(pi?.byBeta || {}).map((v) => v.PI);
  const rising = piValues.every((v, i) => i === 0 || v >= piValues[i - 1] - 1e-9);
  const oneSign = piValues.every((v) => v >= 0) || piValues.every((v) => v <= 0);
  const vis = results?.behaviourVisual || null;
  const tablesBeta = String(betas[0]);

  return (
    <div className="tmaze">
      <p className="step__lede">
        In a T-maze a fly walks up the stem and picks an arm, each {visual ? 'showing one object' : 'smelling of one odour'}.
        Here the choice is read from the output neurons: each MBON counts as approach or avoid by its transmitter (a rule
        of thumb from Aso et al. 2014), and one fitted gain β turns the difference into a probability.
      </p>

      <div className="tmaze__controls">
        <div className="chips" role="group" aria-label={`The other arm's ${noun}`}>
          <span className="chips__label">Other arm:</span>
          {others.map((n) => (
            <button key={n} type="button" className="chip chip--small" aria-pressed={opponent === n} onClick={() => setOpp(n)} aria-label={displayName(n)}>
              <span className="chip__big">{letter(n)}</span>
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Fitted motor gain beta">
          {betas.map((b) => (
            <button key={b} type="button" aria-pressed={beta === b} className="seg__opt" onClick={() => setBeta(b)}>
              β = {b} <small>{b === betas[0] ? 'tables' : 'walkthrough and video'}</small>
            </button>
          ))}
        </div>
      </div>

      <figure className="maze">
        <svg viewBox="0 0 320 200" role="img" aria-labelledby="maze-cap">
          <defs>
            <linearGradient id="armT" x1="0" x2="1">
              <stop offset="0" stopColor="var(--punish)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--punish)" stopOpacity="0.35" />
            </linearGradient>
            <linearGradient id="armO" x1="1" x2="0">
              <stop offset="0" stopColor="var(--kc)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--kc)" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          <path d="M20 40 H300 V84 H182 V186 H138 V84 H20 Z" className="maze__wall" />
          <rect x="22" y="42" width={Math.max(0, 114 * pTrained)} height="40" fill="url(#armT)" className="maze__fill" />
          <rect x={298 - Math.max(0, 114 * pOpp)} y="42" width={Math.max(0, 114 * pOpp)} height="40" fill="url(#armO)" className="maze__fill" />
          <text x="26" y="32" className="maze__label">{hasMemory ? 'punished' : 'arm 1'}: {letter(trained)}</text>
          <text x="294" y="32" textAnchor="end" className="maze__label">{letter(opponent)}</text>
          <rect x="51" y="50" width="56" height="24" rx="6" className="maze__pill" />
          <text x="79" y="68" textAnchor="middle" className="maze__pct">{pct(pTrained)}</text>
          <rect x="213" y="50" width="56" height="24" rx="6" className="maze__pill" />
          <text x="241" y="68" textAnchor="middle" className="maze__pct">{pct(pOpp)}</text>
          <circle cx="160" cy="170" r="6" className="maze__fly" />
          <text x="194" y="174" className="maze__small">start</text>
        </svg>
        <figcaption id="maze-cap">
          Modelled choice, β = {beta}: {pct(pOpp)} pick {displayName(opponent)} over {displayName(trained)}
          {' '}(untrained: {pct(pOppUntrained)}).
        </figcaption>
      </figure>

      {!hasMemory && (
        <p className="small muted">
          Nothing has been punished yet, so the modelled choice shows only the untrained circuit&apos;s innate preference
          ({pct(pOppUntrained)} for {displayName(opponent)}).
          {visual && vis && (
            <>
              {' '}Visual pairs often start far from even: over {vis.nPairs} object pairs the untrained |bias| at β {tablesBeta} is{' '}
              {pm(vis.innateBias[tablesBeta])}, against {pm(vis.innateBiasSmell[tablesBeta])} for odour pairs.
            </>
          )}{' '}
          Pair an {noun} in step 2 to move it.
        </p>
      )}

      <div className="result">
        <p className="result__head">Reciprocal T-maze index, {displayName(trained)} against {displayName(opponent)}</p>
        <p className="result__big">
          <span className="mono">{frac(piNow?.PI)}</span>
          <span className="result__vs">
            at β = {beta}
            {wild && (visual
              ? <>; the wild-type range, {frac(wild[0])} to {frac(wild[1])}, is measured with odours and is not used for vision</>
              : <>; wild-type flies {frac(wild[0])} to {frac(wild[1])}</>)}
          </span>
        </p>
        <div className="pibar" aria-hidden="true">
          {wild && !visual && <span className="pibar__band" style={{ left: `${100 * wild[0]}%`, width: `${100 * (wild[1] - wild[0])}%` }} />}
          <span className="pibar__val" style={{ width: `${Math.max(0, Math.min(1, piNow?.PI ?? 0)) * 100}%` }} />
        </div>
        <p className="small">
          Tully and Quinn&apos;s design: train {displayName(trained)} and test, train {displayName(opponent)} and test,
          average. The page runs both halves on a copy and leaves your circuit&apos;s memory as it was. Innate preference
          for this pair: {frac(piNow?.innateBiasAvsB, 3)}.
        </p>
        <div className="tablewrap tablewrap--tight">
          <table className="table table--compact">
            <caption>
              Index by β: for this pair{' '}
              {rising
                ? 'the size grows with the fitted gain'
                : 'it rises and then falls as the gain grows, because the untrained circuit already prefers one of the two'}
              ; {oneSign ? 'the sign does not change' : 'the sign changes'}
            </caption>
            <thead><tr>{Object.keys(pi?.byBeta || {}).map((b) => <th key={b} scope="col">β {b}</th>)}</tr></thead>
            <tbody><tr>{Object.values(pi?.byBeta || {}).map((v, i) => <td key={i} className="mono">{frac(v.PI)}</td>)}</tr></tbody>
          </table>
        </div>
        {results && !visual && (
          <p className="small muted">
            Over {results.behaviour.nPairs} independently drawn odour pairs the index at β {tablesBeta} is{' '}
            {pm(results.behaviour.piTenPairs[tablesBeta])}. <Src path={results.behaviour.src} />
          </p>
        )}
        {vis && visual && (
          <p className="small muted">
            Over {vis.nPairs} independently drawn object pairs the index at β {tablesBeta} is {pm(vis.piTenPairs[tablesBeta])},
            against {pm(results.behaviour.piTenPairs[tablesBeta])} for odour pairs. The untrained circuit already prefers one
            object of most visual pairs (innate |bias| {pm(vis.innateBias[tablesBeta])} against{' '}
            {pm(vis.innateBiasSmell[tablesBeta])} for odours), and the index falls as that bias grows (correlation{' '}
            {frac(vis.corrWithBias[tablesBeta])}), so at high β it can fall again. What one pairing writes is the same size on
            average (the punished object&apos;s approach score drops {pm(vis.scoreShift)}, against{' '}
            {pm(results.behaviour.scoreShift)} for odours): it is the pair&apos;s innate preference that caps the visual
            index. <Src path={[vis.src, results.behaviour.src]} section="section 2.3" />
          </p>
        )}
      </div>

      <p className="callout callout--choice">
        <Badge status={STATUS.MODELLED_CHOICE}>modelled choice</Badge>
        <span>
          <strong>The direction comes from the wiring; the size comes from one fitted number.</strong>{' '}
          {visual ? (
            <>β was fitted on smell, so that the odour index lands in the wild-type range, and is reused here unchanged; nothing was fitted for vision.</>
          ) : (
            <>
              β was fitted so the index lands in the wild-type range
              {fitRange ? <> (for this pair, β {frac(fitRange[0], 1)} to {frac(fitRange[1], 1)})</> : null}.
            </>
          )}{' '}
          This is a readout
          of the model&apos;s output neurons, not a fly&apos;s behaviour and not the simulated descending neurons (see
          &ldquo;Does it reach the body?&rdquo;).
        </span>
      </p>
    </div>
  );
}
