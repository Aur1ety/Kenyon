import { useEffect, useMemo, useRef, useState } from 'react';
import Badge, { STATUS } from './Badge.jsx';
import MbonBars from './MbonBars.jsx';
import TMaze from './TMaze.jsx';
import Experiments from './Experiments.jsx';
import Src from './Src.jsx';
import { displayName, SIMILAR_TO_A, PARTS_OF_A, BETA_TABLES, BETA_WALKTHROUGH } from './useKenyon.js';
import { int, pct, frac, dropAsChange, pm, words } from './format.js';
import { CHANNELS_PER_ODOUR, HIGE_CHARGE_DROP, sharedChannels } from '../engine/index.js';

const steps = (noun) => [
  { n: 1, title: `Pick an ${noun}` },
  { n: 2, title: 'Pair it with punishment' },
  { n: 3, title: `Test another ${noun}` },
  { n: 4, title: 'The T-maze choice' },
];

function intersectCount(a, b) {
  if (!a || !b) return 0;
  const s = new Set(a);
  let n = 0;
  for (const x of b) if (s.has(x)) n++;
  return n;
}

const letter = (name) => (name.startsWith('v') ? name.slice(1) : name);

export default function Lab({ model, step, setStep, selected, setSelected, beta, setBeta, announce, headlines, results, reducedMotion, onScrollToStage }) {
  const { circuit, current, history, modality, actions, nDrivable, masks, odourSet, sim } = model;
  const [probeLog, setProbeLog] = useState([]);
  const visual = modality === 'visual';
  const noun = visual ? 'object' : 'odour';
  const sparsity = sim.mb.sparsity;
  // one pairing multiplies each trained MBON11 synapse by (1 - lr * delta): the rule's closed form (MB 217-225)
  const keep = 1 - sim.mb.lr * sim.mb.deltaPunish[circuit.mbon11[0]];

  // a new step replaces the panel's content: bring its heading into view and give it focus
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) { firstStep.current = false; return; }
    const h = document.getElementById(`step-${step}-h`);
    if (!h) return;
    h.focus({ preventScroll: true });
    const top = h.getBoundingClientRect().top;
    // where scrollIntoView would put it: the page's scroll-padding (the top bar) plus the heading's scroll-margin
    // (on narrow screens, the sticky 3D view)
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const margin = parseFloat(getComputedStyle(h).scrollMarginTop) || 0;
    if (top < pad + margin - 1 || top > window.innerHeight * 0.55) {
      h.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastPunished = [...history].reverse().find((h) => h.us === 'punish')?.odour || null;
  const trained = lastPunished && odourSet.includes(lastPunished) ? lastPunished : null;
  const target = selected || odourSet[0];
  const trainedKc = useMemo(() => (trained ? actions.kcOf(trained) : null), [trained, actions]);

  const channelNames = (frame) => frame?.odour?.names?.join(', ');

  // ---------------- step 1 ----------------
  const pick = (name) => {
    setSelected(name);
    const f = actions.present(name);
    announce(`${displayName(name)} on the rig: ${f.kcActive.length} Kenyon cells fire, ${f.pnActive.length} projection neurons on.`);
  };

  // ---------------- step 2 ----------------
  const pairNow = (us = 'punish') => {
    if (!current || current.odour.name !== target) actions.present(target);
    const res = actions.pair(us, target);
    const after = res.frames[res.frames.length - 1];
    const r = after.readout;
    announce(
      us === 'punish'
        ? `Paired ${displayName(target)} with punishment. Its drive onto MBON11 fell by ${pct(r.dropMBON11)}. That size is a calibration to Hige et al. 2015.`
        : `Paired ${displayName(target)} with reward. Its drive onto the reward compartments fell by ${pct(r.dropRewardCompartment)}.`,
    );
  };
  const pairingsOfTarget = history.filter((h) => h.odour === target && h.us === 'punish').length;
  const onlyTarget = history.every((h) => h.odour === target && h.us === 'punish');
  const onRig = current?.odour?.name;

  // ---------------- step 3 ----------------
  const probe = (name) => {
    const f = actions.present(name);
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
    announce(`${displayName(name)}: drive onto MBON11 ${dropAsChange(entry.drop)}. Shares ${shared} of ${trainedKc ? trainedKc.length : 0} Kenyon cells with ${displayName(trained)}.`);
  };
  const probeFrame = current && trained && current.odour.name !== trained ? current : null;
  const trainedFrameDrop = trained ? actions.readout(trained).dropMBON11 : null;

  const others = odourSet.filter((n) => n !== trained);
  const ladderOk = !visual && trained === 'A';
  // the generalisation ladder and the partial cues, described from the odours themselves
  const odourA = visual ? null : actions.odourObj('A');
  const nGlomA = odourA ? odourA.channels.length : 0;
  const ladder = odourA ? SIMILAR_TO_A.map((name) => ({ name, shared: sharedChannels(odourA, actions.odourObj(name)) })) : [];
  const parts = odourA ? PARTS_OF_A.map((name) => ({ name, n: actions.odourObj(name).channels.length })) : [];

  const scene = describeScene(model, trained);

  return (
    <div className="lab-panel">
      <div className="modality" role="group" aria-label="Sense">
        {[
          ['olfactory', 'Smell', `odours: ${words(CHANNELS_PER_ODOUR)} glomeruli each`],
          ['visual', 'Vision', `objects: ${words(CHANNELS_PER_ODOUR)} visual channels each`],
        ].map(([id, label, sub]) => (
          <button
            key={id}
            type="button"
            aria-pressed={modality === id}
            className="modality__opt"
            onClick={() => {
              if (modality === id) return;
              actions.setModality(id);
              setSelected(null);
              setProbeLog([]);
              setStep(1);
              announce(`${label}: the same circuit through the ${id === 'visual' ? 'visual projection neurons' : 'olfactory projection neurons'}.`);
            }}
          >
            <span>{label}</span>
            <small>{sub}</small>
          </button>
        ))}
      </div>

      <ol className="steps" aria-label="Teach the fly, step by step">
        {steps(noun).map((s) => (
          <li key={s.n}>
            <button
              type="button"
              className="steps__btn"
              aria-current={step === s.n ? 'step' : undefined}
              onClick={() => setStep(s.n)}
            >
              <span className="steps__n">{s.n}</span>
              <span className="steps__t">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="step" aria-labelledby={`step-${step}-h`}>
        {step === 1 && (
          <>
            <h2 id="step-1-h" className="step__h" tabIndex={-1}>1 · Pick an {noun}</h2>
            <p className="step__lede">
              Each {noun} switches on the projection neurons of {words(CHANNELS_PER_ODOUR)} random {visual ? 'visual channels' : 'glomeruli'}.
              Their synapses onto the Kenyon cells decide which cells fire.
            </p>
            <div className="chips" role="group" aria-label={`${noun}s`}>
              {odourSet.map((name) => {
                const od = actions.odourObj(name);
                return (
                  <button
                    key={name}
                    type="button"
                    className="chip"
                    aria-pressed={onRig === name}
                    onClick={() => pick(name)}
                    title={od.names.join(', ')}
                    aria-label={`${displayName(name)}: ${od.names.join(', ')}`}
                  >
                    <span className="chip__big">{letter(name)}</span>
                    <span className="chip__sub">{od.names.slice(0, 3).join(' ')}…</span>
                  </button>
                );
              })}
            </div>
            {current && (
              <dl className="facts">
                <div>
                  <dt>Kenyon cells firing</dt>
                  <dd>
                    <span className="big mono">{int(current.kcActive.length)}</span> of {int(nDrivable)} that {visual ? 'vision' : 'smell'} can
                    drive ({pct(current.kcActive.length / nDrivable, 1)}; {int(circuit.kc.n)} Kenyon cells in all)
                    <span className="facts__tags">
                      <Badge status="SET BY ME">top {pct(sparsity)} rule: set by me</Badge>
                      <Badge status={STATUS.WIRING}>which cells: the wiring</Badge>
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Input</dt>
                  <dd>
                    <span className="mono">{current.pnActive.length}</span> {visual ? 'visual' : 'olfactory'} projection neurons on, in
                    the {visual ? 'channels' : 'glomeruli'} {channelNames(current)}.{' '}
                    {visual
                      ? `Synthetic: ${words(current.odour.channels.length)} visual projection-neuron types are switched on directly, bypassing the eye and the optic-lobe circuits upstream of them.`
                      : 'Synthetic: the antennal lobe is bypassed.'}
                  </dd>
                </div>
              </dl>
            )}
            <div className="step__nav">
              <button type="button" className="btn btn--primary" onClick={() => { if (!current) pick(target); setStep(2); }}>
                Next: pair {displayName(target)} with punishment
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 id="step-2-h" className="step__h" tabIndex={-1}>2 · Pair {displayName(target)} with punishment</h2>
            <p className="step__lede">
              One pairing block: the {noun} arrives together with the punishment dopamine neuron PPL1-γ1pedc. Where
              its dopamine meets active Kenyon cells, their synapses onto the output neurons it reaches weaken, above
              all onto MBON11 (the published rule of Gkanias et al. 2022).
            </p>
            <div className="btnrow">
              <button type="button" className="btn btn--punish" onClick={() => pairNow('punish')}>
                {pairingsOfTarget ? 'Pair again' : `Pair ${displayName(target)} with punishment`}
              </button>
              <button type="button" className="btn" onClick={() => actions.undo()} disabled={!history.length}>Undo last pairing</button>
              <button type="button" className="btn" onClick={() => { actions.reset(); announce('Memory reset: every synapse back to rest.'); }} disabled={!history.length}>
                Reset memory
              </button>
            </div>
            {pairingsOfTarget > 0 && current && current.odour.name === target && (
              <div className="result">
                <p className="result__head">
                  MBON11&apos;s drive from {displayName(target)}
                </p>
                <p className="result__big">
                  <span className="mono">{int(sumMask(current.mbonUntrained, masks.MBON11))}</span>
                  <span className="arrow" aria-hidden="true">→</span>
                  <span className="mono">{int(sumMask(current.mbonDrive, masks.MBON11))}</span>
                  <span className="result__chg">{dropAsChange(current.readout.dropMBON11)}</span>
                </p>
                <p className="callout callout--calibration">
                  <Badge status={STATUS.CALIBRATION} />
                  <span>
                    <strong>Set to match Hige et al. 2015: a calibration.</strong> One learning rate is chosen so one pairing
                    gives the measured {pct(HIGE_CHARGE_DROP)} drop. It is not a result.
                    {pairingsOfTarget > 1 && onlyTarget && ` After ${pairingsOfTarget} pairings the drop is 1 − ${frac(keep, 1)}^${pairingsOfTarget} = ${frac(1 - keep ** pairingsOfTarget, 3)}, a closed form of the rule, so still not a result.`}
                  </span>
                </p>
                <p className="callout callout--wiring">
                  <Badge status={STATUS.WIRING} />
                  <span>
                    <strong>{pct(current.readout.shareOfLostDriveMBON11)} of all the drive {displayName(target)} lost was lost at MBON11.</strong>{' '}
                    Where the memory lands is decided by the dopamine-to-MBON wiring; it could have landed anywhere.
                  </span>
                </p>
              </div>
            )}
            <div className="step__nav">
              <button type="button" className="btn" onClick={() => setStep(1)}>Back</button>
              <button type="button" className="btn btn--primary" onClick={() => setStep(3)}>Next: test another {noun}</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 id="step-3-h" className="step__h" tabIndex={-1}>3 · Test a similar or a different {noun}</h2>
            {!trained ? (
              <div className="empty">
                <p>No {noun} has been punished yet, so there is no memory to test.</p>
                <button type="button" className="btn btn--punish" onClick={() => { pairNow('punish'); }}>
                  Pair {displayName(target)} with punishment now
                </button>
              </div>
            ) : (
              <>
                <p className="step__lede">
                  The memory lives on the synapses of {displayName(trained)}&apos;s Kenyon cells. Another {noun} loses drive
                  only through the Kenyon cells it shares with {displayName(trained)}; shared cells glow yellow.
                </p>
                <div className="chipgroup">
                  <h3>Other {noun}s</h3>
                  <div className="chips" role="group" aria-label={`Other ${noun}s`}>
                    {others.map((n) => (
                      <button key={n} type="button" className="chip chip--small" aria-pressed={onRig === n} onClick={() => probe(n)} aria-label={displayName(n)}>
                        <span className="chip__big">{letter(n)}</span>
                      </button>
                    ))}
                    <button type="button" className="chip chip--small" aria-pressed={onRig === trained} onClick={() => probe(trained)}>
                      <span className="chip__big">{letter(trained)}</span><span className="chip__sub">trained</span>
                    </button>
                  </div>
                </div>
                {ladderOk ? (
                  <>
                    <div className="chipgroup">
                      <h3>Similar to A: sharing {ladder.map((l) => l.shared).join(', ')} of its glomeruli</h3>
                      <div className="chips" role="group" aria-label="Odours similar to A">
                        {ladder.map((l) => (
                          <button key={l.name} type="button" className="chip chip--small" aria-pressed={onRig === l.name} onClick={() => probe(l.name)} aria-label={`An odour sharing ${l.shared} of A's ${nGlomA} glomeruli`}>
                            <span className="chip__big">{l.shared}/{nGlomA}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="chipgroup">
                      <h3>Part of A only (a partial cue)</h3>
                      <div className="chips" role="group" aria-label="Partial cues of A">
                        {parts.map((l) => (
                          <button key={l.name} type="button" className="chip chip--small" aria-pressed={onRig === l.name} onClick={() => probe(l.name)} aria-label={`Only ${l.n} of A's ${nGlomA} glomeruli`}>
                            <span className="chip__big">{l.n} of {nGlomA}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  !visual && <p className="muted small">The similarity ladder and the partial cues are built around odour A. Train A to try them.</p>
                )}

                {probeFrame && (
                  <div className="result">
                    <p className="result__head">{displayName(probeFrame.odour.name)} against the memory of {displayName(trained)}</p>
                    <p className="result__big">
                      <span className="result__chg">{dropAsChange(probeFrame.readout.dropMBON11)}</span>
                      <span className="result__vs">at MBON11 (the trained {noun}: {dropAsChange(trainedFrameDrop)})</span>
                    </p>
                    <p className="small">
                      Shares <strong className="mono">{intersectCount(trainedKc, probeFrame.kcActive)}</strong> of {displayName(trained)}&apos;s{' '}
                      {trainedKc?.length} Kenyon cells ({probeFrame.kcActive.length} fire for it).
                    </p>
                    <p className="callout callout--wiring">
                      <Badge status={STATUS.WIRING} />
                      <span>
                        <strong>Decided by the wiring.</strong> How far the memory spreads depends on how many Kenyon cells the two{' '}
                        {noun}s share, which the projection-neuron-to-Kenyon-cell synapses set.
                      </span>
                    </p>
                    {/_part/.test(probeFrame.odour.name) && (
                      <p className="callout callout--negative">
                        <Badge status={STATUS.NEGATIVE} />
                        <span>
                          <strong>No pattern completion.</strong> Part of A recalls part of the memory, in proportion to the
                          Kenyon cells it shares. In a feedforward circuit that is forced by construction, so this could not
                          have shown completion.
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {probeLog.length > 0 && (
                  <table className="table table--compact">
                    <caption>Tested so far (one pairing of {displayName(trained)} unless you paired more)</caption>
                    <thead>
                      <tr><th scope="col">{noun}</th><th scope="col">{visual ? 'channels' : 'glomeruli'} shared</th><th scope="col">KCs shared</th><th scope="col">MBON11 drop</th></tr>
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
                      : <>Odours A to H are one odour draw (the results&apos; seed 0); the similar odours and partial cues are one per level, drawn for this page, not the results&apos; own.</>}{' '}
                    Over {results.seeds.n} draws the unpaired{' '}
                    {visual
                      ? <>objects lose {pm(results.seeds.visual.unpaired)} on average, against {pm(results.seeds.unpaired)} for odours: vision is coarser, because only {int(circuit.kc.nDrivable.visual)} Kenyon cells take visual input.</>
                      : <>odours lose {pm(results.seeds.unpaired)} on average, and odours sharing {results.seeds.ladder.map((l) => l.shared).join(', ')} of A&apos;s glomeruli lose {results.seeds.ladder.map((l) => frac(l.mean)).join(', ')}.</>}{' '}
                    <Src path={results.seeds.src} />
                  </p>
                )}
              </>
            )}
            <div className="step__nav">
              <button type="button" className="btn" onClick={() => setStep(2)}>Back</button>
              <button type="button" className="btn btn--primary" onClick={() => setStep(4)}>Next: the T-maze choice</button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 id="step-4-h" className="step__h" tabIndex={-1}>4 · The T-maze choice</h2>
            <TMaze
              model={model}
              results={results}
              trained={trained || target}
              hasMemory={!!trained}
              beta={beta}
              setBeta={setBeta}
              betas={[BETA_TABLES, BETA_WALKTHROUGH]}
            />
            <div className="step__nav">
              <button type="button" className="btn" onClick={() => setStep(3)}>Back</button>
              <button type="button" className="btn" onClick={() => { setStep(1); onScrollToStage?.(); }}>Start again</button>
            </div>
          </>
        )}
      </section>

      <section className="panel-block" aria-labelledby="mbon-h">
        <h2 id="mbon-h" className="panel-block__h">What the output neurons receive</h2>
        <MbonBars circuit={circuit} frame={current} masks={masks} odourLabel={current ? displayName(current.odour.name) : ''} />
      </section>

      <section className="panel-block" aria-labelledby="view-h">
        <h2 id="view-h" className="panel-block__h">What the 3D view shows</h2>
        <p id="scene-summary" className="scene-summary">{scene.summary}</p>
        <details className="textview">
          <summary>Text view of the 3D scene</summary>
          <table className="table table--compact">
            <caption>Cells drawn, at their scanned cell-body positions (MaleCNS v1.0)</caption>
            <thead><tr><th scope="col">Cells</th><th scope="col">Drawn</th><th scope="col">Lit now</th></tr></thead>
            <tbody>
              {scene.rows.map((r) => (
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
        </details>
      </section>

      <Experiments model={model} beta={beta} announce={announce} headlines={headlines} results={results} setStep={setStep} setSelected={setSelected} />
    </div>
  );
}

/** How many cells of a population have a position flag in [lo, hi] (0 scanned soma, 1 neurite point, 2+ stand-in). */
function flagged(pop, lo, hi = Infinity) {
  let n = 0;
  for (const f of pop.posFlag) if (f >= lo && f <= hi) n++;
  return n;
}

function sumMask(a, mask) {
  let s = 0;
  for (let i = 0; i < a.length; i++) if (mask[i]) s += a[i];
  return s;
}

/** A plain-text description of what the canvas shows right now (the canvas points to it). */
function describeScene(model, trained) {
  const { circuit, current, masks, modality, lastPair } = model;
  if (!circuit) return { summary: 'Loading the circuit…', rows: [] };
  const rows = [
    { label: 'Kenyon cells', n: circuit.kc.n, lit: current ? `${current.kcActive.length} firing` : 'none' },
    { label: 'Olfactory projection neurons', n: circuit.pn.n, lit: current && modality === 'olfactory' ? `${current.pnActive.length} on` : 'none' },
    { label: 'Visual projection neurons', n: circuit.vpn.n, lit: current && modality === 'visual' ? `${current.pnActive.length} on` : 'none' },
    { label: 'MBONs (output neurons)', n: circuit.mbon.n, lit: current ? 'brightness = drive now' : 'resting' },
    { label: `PPL1 dopamine neurons (PPL1-γ1pedc, ${circuit.dan.punishIdx.length} cells, is the punishment signal)`, n: circuit.dan.family.filter((f) => f === 'PPL1').length, lit: lastPair?.us === 'punish' ? 'PPL1-γ1pedc flashed at the last pairing' : 'resting' },
    { label: 'PAM dopamine neurons (the reward signal)', n: circuit.dan.family.filter((f) => f === 'PAM').length, lit: lastPair?.us === 'reward' ? 'flashed at the last pairing' : 'resting' },
    { label: 'APL', n: circuit.apl.n, lit: 'anatomy only' },
  ];
  if (!current) {
    return { summary: `${circuit.kc.n.toLocaleString('en-GB')} Kenyon cells and ${circuit.mbon.n + circuit.dan.n + circuit.pn.n + circuit.vpn.n + circuit.apl.n} other circuit cells, all resting. Nothing is on the rig.`, rows };
  }
  const m11now = sumMask(current.mbonDrive, masks.MBON11);
  const m11before = sumMask(current.mbonUntrained, masks.MBON11);
  const shared = trained && current.odour.name !== trained ? ' Kenyon cells it shares with the trained odour glow yellow.' : '';
  return {
    summary: `${displayName(current.odour.name)} on the rig: ${current.kcActive.length} Kenyon cells light up, fed by ${current.pnActive.length} projection neurons (lines). MBON11 receives ${int(m11now)}${Math.abs(m11now - m11before) > 0.5 ? ` (${int(m11before)} before learning)` : ''}.${shared}`,
    rows,
  };
}
