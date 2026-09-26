import { useEffect, useMemo, useRef, useState } from 'react';
import Badge, { STATUS } from './Badge.jsx';
import TMaze from './TMaze.jsx';
import Src from './Src.jsx';
import { displayName, describeName, letter, SIMILAR_TO_A, PARTS_OF_A, BETA_TABLES, BETA_WALKTHROUGH } from './useKenyon.js';
import { int, pct, frac, dropAsChange, dropAsChangeUnder, pctUnder, pm, words, weakerText, fellText, downText } from './format.js';
import { COPY, nouns, cap, lessonsText } from './copy.js';
import { describeScene, sumMask, intersectCount } from './sceneText.js';
import { CHANNELS_PER_ODOUR, HIGE_CHARGE_DROP, sharedChannels } from '../engine/index.js';

const S = COPY.steps;
const S1 = COPY.step1;
const S2 = COPY.step2;

/**
 * The guided lab: 1 teach it, 2 test other smells, 3 the choice test. Plain words in the default view; each step
 * ends with "The science behind this step", which keeps the technical names, raw numbers and citations. Every
 * number comes from the engine (through useKenyon) or a cited results file.
 */
export default function Lab({ model, step, goToStep, stepRequest, tryIt, selected, setSelected, beta, setBeta, announce, results, reducedMotion, showShared, sceneText }) {
  const { circuit, current, history, modality, actions, nDrivable, masks, odourSet, sim, lastPair } = model;
  const [probeLog, setProbeLog] = useState([]);
  const [nudge, setNudge] = useState(false); // "Try it": the step 1 button glows for a moment
  const [reveal, setReveal] = useState(0); // a new result to bring into view
  const visual = modality === 'visual';
  const N = nouns(visual);
  const sparsity = sim.mb.sparsity;
  // one pairing multiplies each trained MBON11 synapse by (1 - lr * delta): the rule's closed form (MB 217-225)
  const keep = 1 - sim.mb.lr * sim.mb.deltaPunish[circuit.mbon11[0]];

  // a probe's numbers belong to the memory it was measured against: start the log afresh when the memory changes
  const memoryKey = `${modality}|${history.length}|${lastPair?.id ?? 0}`;
  useEffect(() => { setProbeLog([]); }, [memoryKey]);

  // a step asked for by a button or link (a new request id): bring its heading into view and move focus there, or to
  // the step's main button. Requests made before the lab mounted are ignored.
  const handled = useRef(stepRequest?.id ?? 0);
  useEffect(() => {
    if (!stepRequest || stepRequest.id === handled.current) return;
    handled.current = stepRequest.id;
    const h = document.getElementById(`step-${step}-h`);
    if (!h) return;
    const top = h.getBoundingClientRect().top;
    // where scrollIntoView would put it: the page's scroll-padding (the top bar) plus the heading's scroll-margin
    // (on narrow screens, the sticky 3D view)
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(getComputedStyle(h).scrollMarginTop) || 0;
    const main = stepRequest.focus === 'main' ? document.getElementById('step-main') : null;
    // asked for the main button and it is already fully on screen (the hero's "Try it" on a wide screen): stay put
    const mainBox = main?.getBoundingClientRect();
    const mainInView = !!mainBox && mainBox.top >= pad + margin - 1 && mainBox.bottom <= window.innerHeight;
    if (!mainInView && (top < pad + margin - 1 || top > window.innerHeight * 0.55)) {
      // from far down the page (a link under "For scientists"), jump rather than glide through all of it
      const far = Math.abs(top) > 2 * window.innerHeight;
      h.scrollIntoView({ block: 'start', behavior: reducedMotion || far ? 'auto' : 'smooth' });
    }
    (main || h).focus({ preventScroll: true });
  }, [stepRequest, step, reducedMotion]);

  const lastPunished = [...history].reverse().find((h) => h.us === 'punish')?.odour || null;
  const trained = lastPunished && odourSet.includes(lastPunished) ? lastPunished : null;
  const target = selected || odourSet[0];
  const trainedKc = useMemo(() => (trained ? actions.kcOf(trained) : null), [trained, actions]);
  const onRig = current?.odour?.name;

  // each step shows the smell it is about: step 1 the smell its button punishes, step 3 the punished smell (the
  // maze's arm). Step 2 keeps whatever was tested last. Runs when the step changes, not on every new frame.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    if (step === 1 && current && current.odour.name !== target) actions.present(target);
    if (step === 3 && current?.odour.name !== (trained || target)) actions.present(trained || target);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // a new result (after a lesson or a test): if its big number and sentence are below the fold, scroll just enough
  // to show them, never pushing the result's top under the top bar or (on narrow screens) the sticky 3D view
  useEffect(() => {
    if (!reveal) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById('step-result');
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const limit = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0)
        + (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
      const end = (el.querySelector('.result__text') || el).getBoundingClientRect().bottom;
      const dy = Math.min(end - window.innerHeight + 16, top - limit);
      if (dy > 1) window.scrollBy({ top: dy, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------- step 1 ----------------
  const pick = (name) => {
    setSelected(name);
    const f = actions.present(name);
    announce(COPY.announce.picked({ name: displayName(name), nOn: int(f.kcActive.length) }));
  };

  // "Try it" (the hero's button): light up the smell if nothing is on show yet, and make the punish button glow
  const tried = useRef(tryIt ?? 0);
  useEffect(() => {
    if (!tryIt || tryIt === tried.current) return undefined;
    tried.current = tryIt;
    if (!current) pick(target);
    setNudge(true);
    const t = setTimeout(() => setNudge(false), reducedMotion ? 4000 : 2800);
    return () => clearTimeout(t);
  }, [tryIt]); // eslint-disable-line react-hooks/exhaustive-deps

  const pairNow = () => {
    if (!current || current.odour.name !== target) actions.present(target);
    const res = actions.pair('punish', target);
    const r = res.frames[res.frames.length - 1].readout;
    announce(COPY.announce.punished({ name: displayName(target), drop: pctUnder(r.dropMBON11) }));
    setNudge(false);
    setReveal((n) => n + 1);
  };
  const undo = () => {
    actions.undo();
    announce(COPY.announce.undone);
  };
  const startOver = (toStep1) => {
    actions.reset();
    announce(COPY.announce.cleared);
    if (toStep1) goToStep(1);
  };

  const pairingsOfTarget = history.filter((h) => h.odour === target && h.us === 'punish').length;
  const onlyTarget = history.every((h) => h.odour === target && h.us === 'punish');
  const taught = pairingsOfTarget > 0 && current && current.odour.name === target;

  // ---------------- step 2 ----------------
  const probe = (name) => {
    const f = actions.present(name);
    setReveal((n) => n + 1);
    const shared = intersectCount(trainedKc, f.kcActive);
    const entry = {
      name,
      drop: f.readout.dropMBON11,
      nKc: f.kcActive.length,
      shared,
      sharedGlom: trained ? f.odour.channels.filter((c) => actions.odourObj(trained).channels.includes(c)).length : 0,
      nGlom: f.odour.channels.length,
    };
    setProbeLog((log) => [entry, ...log.filter((e) => e.name !== name)].slice(0, 16));
    announce(COPY.announce.probed({
      name: describeName(name), change: downText(entry.drop), shared: int(shared), trained: displayName(trained), nKc: int(trainedKc ? trainedKc.length : 0),
    }));
  };
  const probeFrame = current && trained && current.odour.name !== trained ? current : null;
  const trainedFrameDrop = trained ? actions.readout(trained).dropMBON11 : null;

  const others = odourSet.filter((n) => n !== trained);
  const ladderOk = !visual && trained === 'A';
  // the similar smells and the partial smells, described from the odours themselves
  const odourA = visual ? null : actions.odourObj('A');
  const nGlomA = odourA ? odourA.channels.length : 0;
  const ladder = odourA ? SIMILAR_TO_A.map((name) => ({ name, shared: sharedChannels(odourA, actions.odourObj(name)) })) : [];
  const parts = odourA ? PARTS_OF_A.map((name) => ({ name, n: actions.odourObj(name).channels.length })) : [];
  const nChannels = visual ? circuit.visualChannels.length : circuit.glomeruli.length;
  // the step 2 summary says only what the tests so far have shown
  const probedDifferent = probeLog.some((e) => others.includes(e.name));
  const probedSimilar = probeLog.some((e) => SIMILAR_TO_A.includes(e.name) || PARTS_OF_A.includes(e.name));
  let summary = null;
  if (probedDifferent && probedSimilar) summary = S2.summary({ N });
  else if (probedDifferent) summary = ladderOk ? `${S2.summaryDifferent({ N })} ${S2.trySimilar}` : S2.summaryDifferent({ N });
  else if (probedSimilar) summary = S2.summarySimilar({ N });

  const titles = S.titles({ N });
  const chip = (name, onClick, big, label, sub) => (
    <button
      key={name}
      type="button"
      className={`chip ${sub ? 'chip--letter chip--tagged' : big.length > 1 ? 'chip--wide' : 'chip--letter'}`}
      aria-pressed={onRig === name}
      onClick={() => onClick(name)}
      aria-label={label}
    >
      <span className="chip__big">{big}</span>
      {sub && <span className="chip__sub">{sub}</span>}
    </button>
  );

  return (
    <div className="lab-panel">
      <ol className="steps" aria-label={S.label}>
        {titles.map((t, i) => (
          <li key={t}>
            <button
              type="button"
              className="steps__btn"
              aria-current={step === i + 1 ? 'step' : undefined}
              onClick={() => goToStep(i + 1)}
            >
              <span className="steps__n">{i + 1}</span>{' '}
              <span className="steps__t">{t}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="step" aria-labelledby={`step-${step}-h`}>
        {step === 1 && (
          <>
            <h2 id="step-1-h" className="step__h" tabIndex={-1}>{S1.h({ N })}</h2>
            <p className="step__lede">{S1.lede({ N })}</p>
            <div className="chipgroup">
              <p id="pick-label" className="chipgroup__label">{S1.pick({ N })}</p>
              <div className="chips" role="group" aria-labelledby="pick-label">
                {odourSet.map((name) => {
                  const od = actions.odourObj(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      className="chip chip--letter"
                      aria-pressed={onRig === name}
                      onClick={() => pick(name)}
                      title={S1.chipTitle({ N, channels: od.names.join(', ') })}
                      aria-label={cap(displayName(name))}
                    >
                      <span className="chip__big">{letter(name)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {current && (
              <p className="step__fact">
                {S1.on({ name: describeName(current.odour.name), nOn: int(current.kcActive.length), nAll: int(circuit.kc.n) })}
              </p>
            )}
            <div className="btnrow">
              <button id="step-main" type="button" className={`btn btn--punish btn--big${nudge ? ' btn--nudge' : ''}`} onClick={pairNow}>
                {pairingsOfTarget ? S1.punishAgain({ name: displayName(target) }) : S1.punish({ name: displayName(target) })}
              </button>
              <button type="button" className="btn" onClick={undo} disabled={!history.length}>{S1.undo}</button>
              <button type="button" className="btn" onClick={() => startOver(false)} disabled={!history.length}>{S.startOver}</button>
            </div>
            {taught && (
              <div id="step-result" className="result">
                <p className="result__num mono">{dropAsChangeUnder(current.readout.dropMBON11)}</p>
                <p className="result__label">{S1.bigLabel({ name: displayName(target) })}</p>
                <p className="result__text">
                  {(onlyTarget ? S1.sentence : S1.sentenceMixed)({
                    name: displayName(target),
                    lessons: lessonsText(onlyTarget ? pairingsOfTarget : history.length),
                    weaker: weakerText(current.readout.dropMBON11),
                  })}
                  {current.readout.dropMBON11 > 0 && ` ${S1.soWhat({ name: displayName(target) })}`}
                </p>
                <p className="callout callout--calibration">
                  <Badge status={STATUS.CALIBRATION} />
                  <span>
                    {onlyTarget ? S1.setByMe({ target: pct(HIGE_CHARGE_DROP) }) : S1.setByMeMixed({ target: pct(HIGE_CHARGE_DROP) })}
                    {onlyTarget && pairingsOfTarget > 1
                      ? ` ${S1.setByMeRepeat({ drop: pctUnder(current.readout.dropMBON11), lessons: lessonsText(pairingsOfTarget) })}`
                      : null}
                  </span>
                </p>
                <p className="callout callout--wiring">
                  <Badge status={STATUS.WIRING} />
                  <span>{S1.wiring({ share: pct(current.readout.shareOfLostDriveMBON11) })}</span>
                </p>
              </div>
            )}
            <div className="step__nav">
              <button type="button" className="btn btn--primary" onClick={() => { if (!current) pick(target); goToStep(2); }}>
                {S1.next({ N })}
              </button>
            </div>
            <details className="stepmore">
              <summary>{S.details}</summary>
              <div className="stepmore__body">
                {current && (
                  <dl className="facts">
                    <div>
                      <dt>Memory neurons (Kenyon cells, <abbr title="Kenyon cells">KCs</abbr>) on</dt>
                      <dd>
                        <span className="big mono">{int(current.kcActive.length)}</span> of {int(nDrivable)} that {visual ? 'vision' : 'smell'} can
                        drive ({pct(current.kcActive.length / nDrivable, 1)}; {int(circuit.kc.n)} Kenyon cells in all)
                        <span className="facts__tags">
                          <Badge status="SET BY ME" technical>top {pct(sparsity)} rule: set by me</Badge>
                          <Badge status={STATUS.WIRING} technical>which cells: the wiring</Badge>
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Input</dt>
                      <dd>
                        <span className="mono">{current.pnActive.length}</span>{' '}
                        {visual
                          ? <>sight-input neurons (visual projection neurons, <abbr title="visual projection neurons">VPNs</abbr>)</>
                          : <>smell-input neurons (olfactory projection neurons, <abbr title="projection neurons">PNs</abbr>)</>}{' '}
                        on, in the {visual ? 'sight channels (visual projection-neuron types)' : 'smell channels (glomeruli)'}{' '}
                        {current.odour.names.join(', ')}.{' '}
                        {visual
                          ? `Synthetic: ${words(current.odour.channels.length)} visual projection-neuron types are switched on directly, bypassing the eye and the optic-lobe circuits upstream of them.`
                          : 'Synthetic: the antennal lobe is bypassed.'}
                      </dd>
                    </div>
                  </dl>
                )}
                <p>
                  How a lesson works: the {N.one} arrives together with the punishment signal, the dopamine neurons
                  PPL1-γ1pedc ({circuit.dan.punishIdx.length} cells). Where their dopamine meets active Kenyon cells, those
                  cells&apos; synapses onto the output neurons (mushroom-body output neurons, <abbr title="mushroom-body output neurons">MBONs</abbr>)
                  it reaches weaken, above all onto the go-toward neuron, MBON11 (MBON-γ1pedc&gt;α/β). The
                  learning rule is the published one of Gkanias et al. 2022.
                </p>
                {taught && (
                  <p>
                    MBON11&apos;s summed drive from {displayName(target)} (model units):{' '}
                    <span className="mono">
                      {int(sumMask(current.mbonUntrained, masks.MBON11))} → {int(sumMask(current.mbonDrive, masks.MBON11))}
                    </span>{' '}
                    <strong className="mono">{dropAsChange(current.readout.dropMBON11)}</strong>
                  </p>
                )}
                <p className="callout callout--calibration">
                  <Badge status={STATUS.CALIBRATION} technical />
                  <span>
                    <strong>Set to match Hige et al. 2015: a calibration.</strong> One learning rate is chosen so one pairing
                    gives the measured {pct(HIGE_CHARGE_DROP)} drop. It is not a result.
                    {pairingsOfTarget > 1 && onlyTarget && ` After ${pairingsOfTarget} pairings the drop is 1 − ${frac(keep, 1)}^${pairingsOfTarget} = ${frac(1 - keep ** pairingsOfTarget, 3)}, a closed form of the rule, so still not a result.`}
                  </span>
                </p>
                <p className="callout callout--wiring">
                  <Badge status={STATUS.WIRING} technical />
                  <span>
                    Which Kenyon cells fire is set by the projection-neuron-to-Kenyon-cell synapses; where the memory lands
                    is decided by the dopamine-to-MBON wiring. It could have landed anywhere.
                  </span>
                </p>
                <p className="small"><a href="#glossary">Plain words and their technical names</a></p>
              </div>
            </details>
          </>
        )}

        {step === 2 && (
          <>
            <h2 id="step-2-h" className="step__h" tabIndex={-1}>{S2.h({ N })}</h2>
            {!trained ? (
              <div className="empty">
                <p>{S2.empty}</p>
                <button type="button" className="btn btn--punish btn--big" onClick={pairNow}>
                  {S2.punishNow({ name: displayName(target) })}
                </button>
              </div>
            ) : (
              <>
                <p className="step__lede">{S2.lede({ N, trained: displayName(trained) })}</p>
                <p className="small step__explain">{S2.explain({ N, per: CHANNELS_PER_ODOUR, total: nChannels })}</p>
                <div className="chipgroup">
                  <h3 id="grp-different">{S2.different({ N })}</h3>
                  <div className="chips" role="group" aria-labelledby="grp-different">
                    {others.map((n) => chip(n, probe, letter(n), cap(displayName(n))))}
                    {chip(trained, probe, letter(trained), `${cap(displayName(trained))}, ${S2.punishedTag}`, S2.punishedTag)}
                  </div>
                </div>
                {ladderOk ? (
                  <>
                    <div className="chipgroup">
                      <h3 id="grp-similar">{S2.similar({ trained: displayName(trained) })}</h3>
                      <p id="grp-similar-sub" className="chipgroup__sub">{S2.similarSub({ per: nGlomA })}</p>
                      <div className="chips" role="group" aria-labelledby="grp-similar" aria-describedby="grp-similar-sub">
                        {/* each name starts with the visible label, so voice control can say "5 of 6" */}
                        {ladder.map((l) => chip(l.name, probe, `${l.shared} of ${nGlomA}`, `${l.shared} of ${nGlomA}: ${describeName(l.name)}`))}
                      </div>
                    </div>
                    <div className="chipgroup">
                      <h3 id="grp-part">{S2.part({ trained: displayName(trained) })}</h3>
                      <p id="grp-part-sub" className="chipgroup__sub">{S2.partSub({ per: nGlomA })}</p>
                      <div className="chips" role="group" aria-labelledby="grp-part" aria-describedby="grp-part-sub">
                        {parts.map((l) => chip(l.name, probe, `${l.n} of ${nGlomA}`, `${l.n} of ${nGlomA}: ${displayName(l.name)}`))}
                      </div>
                    </div>
                  </>
                ) : (
                  !visual && <p className="muted small">{S2.notA}</p>
                )}

                {probeFrame && (
                  <div id="step-result" className="result">
                    <p className="result__num mono">{dropAsChangeUnder(probeFrame.readout.dropMBON11)}</p>
                    <p className="result__label">{S2.bigLabel({ name: displayName(probeFrame.odour.name) })}</p>
                    <p className="result__text">
                      {S2.sentence({
                        name: describeName(probeFrame.odour.name),
                        change: fellText(probeFrame.readout.dropMBON11),
                        trainedDrop: pctUnder(trainedFrameDrop),
                        trained: displayName(trained),
                        shared: int(intersectCount(trainedKc, probeFrame.kcActive)),
                        nKc: int(trainedKc?.length),
                      })}
                    </p>
                    <p className="callout callout--wiring">
                      <Badge status={STATUS.WIRING} />
                      <span>{S2.wiring({ N, target: pct(HIGE_CHARGE_DROP) })}</span>
                    </p>
                    {/_part/.test(probeFrame.odour.name) && (
                      <p className="callout callout--negative">
                        <Badge status={STATUS.NEGATIVE} />
                        <span>{S2.partial}</span>
                      </p>
                    )}
                  </div>
                )}
                {summary && <p className="step__summary">{summary}</p>}
              </>
            )}
            <div className="step__nav">
              <button type="button" className="btn" onClick={() => goToStep(1)}>{S.back}</button>
              <button type="button" className="btn btn--primary" onClick={() => goToStep(3)}>{S2.next}</button>
            </div>
            <details className="stepmore">
              <summary>{S.details}</summary>
              <div className="stepmore__body">
                <p className="callout callout--wiring">
                  <Badge status={STATUS.WIRING} technical />
                  <span>
                    The memory lives on the synapses of the trained {N.one}&apos;s Kenyon cells (<abbr title="Kenyon cells">KCs</abbr>). Another{' '}
                    {N.one} loses drive onto MBON11 only through the Kenyon cells it shares with it, and which cells it
                    shares is set by the projection-neuron-to-Kenyon-cell synapses (the generalisation of the write-up).
                  </span>
                </p>
                {!visual && (
                  <p className="callout callout--negative">
                    <Badge status={STATUS.NEGATIVE} technical />
                    <span>
                      <strong>No pattern completion.</strong> Part of A (a partial cue) recalls part of the memory, in
                      proportion to the Kenyon cells it shares with A. In a feedforward circuit that is forced by
                      construction, so this could not have shown completion.
                    </span>
                  </p>
                )}
                {probeLog.length > 0 && (
                  <table className="table table--compact">
                    <caption>Tested so far, against the memory now in the model</caption>
                    <thead>
                      <tr>
                        <th scope="col">{N.One}</th>
                        <th scope="col">{visual ? 'Sight channels' : 'Smell channels (glomeruli)'} shared</th>
                        <th scope="col">Kenyon cells shared</th>
                        <th scope="col">Drop at MBON11</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...probeLog].sort((a, b) => (b.drop ?? 0) - (a.drop ?? 0)).map((e) => (
                        <tr key={e.name}>
                          <th scope="row">{displayName(e.name)}</th>
                          <td className="mono">{e.sharedGlom}/{e.nGlom}</td>
                          <td className="mono">{e.shared}/{e.nKc}</td>
                          <td className="mono">{frac(e.drop)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {results && (
                  <p className="small muted">
                    {visual
                      ? <>Objects A to H are one draw (the results&apos; seed 0).</>
                      : <>Smells A to H are one odour draw (the results&apos; seed 0); the similar smells and partial cues are one per level, drawn for this page, not the results&apos; own.</>}{' '}
                    Over {results.seeds.n} draws the unpaired{' '}
                    {visual
                      ? <>objects lose {pm(results.seeds.visual.unpaired)} on average, against {pm(results.seeds.unpaired)} for odours: vision is coarser, because only {int(circuit.kc.nDrivable.visual)} Kenyon cells take visual input.</>
                      : <>odours lose {pm(results.seeds.unpaired)} on average, and odours sharing {results.seeds.ladder.map((l) => l.shared).join(', ')} of A&apos;s glomeruli lose {results.seeds.ladder.map((l) => frac(l.mean)).join(', ')}.</>}{' '}
                    <Src path={results.seeds.src} />
                  </p>
                )}
                <p className="small"><a href="#glossary">Plain words and their technical names</a></p>
              </div>
            </details>
          </>
        )}

        {step === 3 && (
          <>
            <h2 id="step-3-h" className="step__h" tabIndex={-1}>{COPY.step3.h({ N })}</h2>
            <TMaze
              model={model}
              results={results}
              trained={trained || target}
              hasMemory={!!trained}
              beta={beta}
              setBeta={setBeta}
              betas={[BETA_TABLES, BETA_WALKTHROUGH]}
              onGoStep1={() => goToStep(1, 'main')}
            >
              <div className="step__nav">
                <button type="button" className="btn" onClick={() => goToStep(2)}>{S.back}</button>
                <button type="button" className="btn" onClick={() => startOver(true)}>{S.startOver}</button>
              </div>
            </TMaze>
          </>
        )}
      </section>

      {/* the canvas's text description (its aria-describedby). Shown only when the 3D view is not there to see;
          otherwise it is kept for screen readers, and the per-group table is under "For scientists". */}
      <section className={`panel-block${sceneText ? '' : ' sr-only'}`} aria-labelledby="view-h">
        <h2 id="view-h" className="panel-block__h">{COPY.scene.h}</h2>
        <p id="scene-summary" className="scene-summary">{describeScene(model, showShared)}</p>
        {sceneText && <p className="small"><a href="#scene-text">{COPY.scene.tableLink}</a></p>}
      </section>
    </div>
  );
}
