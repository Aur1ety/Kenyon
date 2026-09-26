import { useMemo, useState } from 'react';
import Badge, { STATUS } from './Badge.jsx';
import Src from './Src.jsx';
import { displayName, letter } from './useKenyon.js';
import { pct, frac, pm } from './format.js';
import { COPY, nouns, cap } from './copy.js';
import { choiceProbability } from '../engine/index.js';

const S3 = COPY.step3;

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

/** The motor-gain switch (β): the tables' value and the walkthrough's. Shared by step 3's details and "For scientists". */
export function BetaSwitch({ beta, setBeta, betas, label = 'Choice-strength setting (motor gain β)' }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {betas.map((b) => (
        <button key={b} type="button" aria-pressed={beta === b} className="seg__opt" onClick={() => setBeta(b)}>
          β = {b} <small>{b === betas[0] ? 'used in the tables' : 'used in the walkthrough and video'}</small>
        </button>
      ))}
    </div>
  );
}

/**
 * Step 3: the choice test. The default view is the maze and one plain sentence; the details hold the reciprocal
 * T-maze index, the motor gain and the stored spreads. Every number is the engine's or a cited results file's.
 */
export default function TMaze({ model, results, trained, hasMemory, beta, setBeta, betas, onGoStep1, children }) {
  const { actions, odourSet, modality } = model;
  const others = odourSet.filter((n) => n !== trained);
  const [opp, setOpp] = useState(others.includes('B') ? 'B' : others[0]);
  const opponent = others.includes(opp) ? opp : others[0];
  const visual = modality === 'visual';
  const N = nouns(visual);

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

  const tName = displayName(trained);
  const oName = displayName(opponent);

  return (
    <div className="tmaze">
      <p className="step__lede">{S3.lede({ N, trained: tName })}</p>

      <div className="chips" role="group" aria-labelledby="arm-label">
        <span id="arm-label" className="chips__label">{S3.otherArm}</span>
        {others.map((n) => (
          <button key={n} type="button" className="chip chip--letter" aria-pressed={opponent === n} onClick={() => setOpp(n)} aria-label={cap(displayName(n))}>
            <span className="chip__big">{letter(n)}</span>
          </button>
        ))}
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
          <text x="22" y="32" className="maze__label">{hasMemory ? S3.armPunished({ name: tName }) : cap(tName)}</text>
          <text x="298" y="32" textAnchor="end" className="maze__label">{cap(oName)}</text>
          <rect x="51" y="50" width="56" height="24" rx="6" className="maze__pill" />
          <text x="79" y="68" textAnchor="middle" className="maze__pct">{pct(pTrained)}</text>
          <rect x="213" y="50" width="56" height="24" rx="6" className="maze__pill" />
          <text x="241" y="68" textAnchor="middle" className="maze__pct">{pct(pOpp)}</text>
          <circle cx="160" cy="170" r="6" className="maze__fly" />
          <text x="194" y="174" className="maze__small">{S3.start}</text>
        </svg>
        <figcaption id="maze-cap">{S3.figure({ other: oName, p: pct(pOpp), trained: tName, q: pct(pTrained) })}</figcaption>
      </figure>

      {hasMemory ? (
        <div className="result">
          <p className="result__num result__num--choice mono">{pct(pOpp)}</p>
          <p className="result__label">{S3.bigLabel({ other: oName, trained: tName })}</p>
          <p className="result__text">{S3.sentence({ other: oName, p: pct(pOpp), before: pct(pOppUntrained) })}</p>
        </div>
      ) : (
        <div className="empty">
          <p>{S3.none({ N, other: oName, before: pct(pOppUntrained) })}</p>
          {onGoStep1 && <button type="button" className="btn btn--primary" onClick={onGoStep1}>{S3.goStep1}</button>}
        </div>
      )}

      <p className="callout callout--choice">
        <Badge status={STATUS.MODELLED_CHOICE} />
        <span>{S3.honest} <a href="#limits">{S3.honestLink}</a>.</span>
      </p>

      {children}

      <details className="stepmore">
        <summary>{COPY.steps.details}</summary>
        <div className="stepmore__body">
          <p>
            In a T-maze (the design of Tully and Quinn 1985) a fly walks up the stem and picks an arm, each{' '}
            {visual ? 'showing one object' : 'smelling of one odour'}. Here the choice is read from the output neurons: each
            MBON counts as approach or avoid by its transmitter (a rule of thumb from Aso et al. 2014), and one fitted gain β
            (the choice-strength setting) turns the difference into a probability.
          </p>
          <BetaSwitch beta={beta} setBeta={setBeta} betas={betas} />
          <p className="small">
            Modelled choice at β = {beta}: {pct(pOpp)} pick {oName} over {tName} (untrained: {pct(pOppUntrained)}).
          </p>
          {!hasMemory && (
            <p className="small muted">
              Nothing has been punished yet, so the modelled choice shows only the untrained circuit&apos;s innate preference
              ({pct(pOppUntrained)} for {oName}).
              {visual && vis && (
                <>
                  {' '}Visual pairs often start far from even: over {vis.nPairs} object pairs the untrained |bias| at β {tablesBeta} is{' '}
                  {pm(vis.innateBias[tablesBeta])}, against {pm(vis.innateBiasSmell[tablesBeta])} for odour pairs.
                </>
              )}
            </p>
          )}

          <div className="result">
            <p className="result__head">Reciprocal T-maze index (the choice score), {tName} against {oName}</p>
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
              Tully and Quinn&apos;s design: train {tName} and test, train {oName} and test, average. The page runs both halves
              on a copy and leaves your circuit&apos;s memory as it was. Innate preference for this pair:{' '}
              {frac(piNow?.innateBiasAvsB, 3)}.
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
            <Badge status={STATUS.MODELLED_CHOICE} technical>modelled choice</Badge>
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
              This is a readout of the model&apos;s output neurons, not a fly&apos;s behaviour and not the simulated descending
              neurons (see <a href="#body">&ldquo;Does it reach the body?&rdquo;</a>).
            </span>
          </p>
          <p className="small"><a href="#glossary">Plain words and their technical names</a></p>
        </div>
      </details>
    </div>
  );
}
