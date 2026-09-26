import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Lab from './ui/Lab.jsx';
import RealVsMine from './ui/RealVsMine.jsx';
import Negatives from './ui/Negatives.jsx';
import BodySection from './ui/BodySection.jsx';
import VideoSection from './ui/VideoSection.jsx';
import Credits from './ui/Credits.jsx';
import { REPO } from './ui/site.js';
import { useKenyon, displayName, BETA_WALKTHROUGH } from './ui/useKenyon.js';
import { useReducedMotion } from './ui/useReducedMotion.js';
import { useResults } from './ui/useResults.js';
import { int } from './ui/format.js';
import { computeHeadlines, MODEL_DISCLAIMER } from './engine/index.js';

// three.js is most of the page's JavaScript, so the 3D view loads as its own chunk while the text renders. The
// download starts at once, alongside circuit.json, rather than after it.
const scenePromise = import('./scene/Scene3D.jsx');
const Scene3D = lazy(() => scenePromise);
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

const NAV = [
  ['#lab', 'Teach the fly'],
  ['#real', 'Real vs set by me'],
  ['#fails', 'Where it fails'],
  ['#body', 'Does it reach the body?'],
  ['#video', 'Video'],
  ['#credits', 'Credits'],
];

export default function App() {
  const model = useKenyon();
  const results = useResults();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(null);
  const [beta, setBeta] = useState(BETA_WALKTHROUGH);
  const [message, setMessage] = useState('');
  const [sceneStatus, setSceneStatus] = useState('ok');
  const stageRef = useRef(null);

  const announce = useCallback((text) => {
    // re-announce identical messages too
    setMessage('');
    requestAnimationFrame(() => setMessage(text));
  }, []);

  // the headline numbers, computed once by the engine when the circuit arrives
  const headlines = useMemo(() => {
    if (!model.circuit) return null;
    try {
      return computeHeadlines(model.circuit);
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      return null;
    }
  }, [model.circuit]);

  // what the 3D view should show, straight from the engine's current frame
  const { current, modality, history, actions } = model;
  const lastPunished = [...history].reverse().find((h) => h.us === 'punish')?.odour || null;
  const activity = useMemo(() => {
    if (!current) return { modality, channels: null, kc: null, kcTrained: null, mbonLevel: null };
    let max = 0;
    for (const v of current.mbonUntrained) if (v > max) max = v;
    const mbonLevel = Array.from(current.mbonDrive, (v) => (max > 0 ? v / max : 0));
    const showOverlap = step >= 3 && lastPunished && lastPunished !== current.odour.name;
    return {
      modality: current.odour.modality,
      channels: current.odour.channels,
      kc: current.kcActive,
      kcTrained: showOverlap ? actions.kcOf(lastPunished) : null,
      mbonLevel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, step, lastPunished, modality]);

  const caption = current
    ? `${displayName(current.odour.name)}: ${current.kcActive.length} Kenyon cells firing${history.length ? ` · ${history.length} pairing${history.length > 1 ? 's' : ''} in memory` : ''}`
    : null;

  useEffect(() => {
    if (model.status === 'ready') announce('The circuit has loaded. Pick an odour to begin.');
  }, [model.status, announce]);

  const loadingStage = (
    <div className="stage stage--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>Loading the circuit from the MaleCNS connectome…</p>
    </div>
  );

  const scrollToStage = () => stageRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });

  return (
    <>
      <a className="skip" href="#lab">Skip to the simulation</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Kenyon, back to the top">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Kenyon</span>
        </a>
        <nav className="topnav" aria-label="Sections">
          <ul>
            {NAV.map(([href, label]) => (
              <li key={href}>
                {/* the browser leaves a half-visible link where it is on focus; scroll the nav so all of it shows */}
                <a href={href} onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="topbar__gh" href={REPO} rel="noopener noreferrer" target="_blank">GitHub</a>
      </header>

      <main id="top">
        <section id="lab" className="lab" aria-labelledby="hero-h">
          <div className="lab__panel">
            <header className="intro">
              <p className="eyebrow">A fruit-fly memory circuit, built from its own connectome</p>
              <h1 id="hero-h" className="intro__h">Teach a fly&apos;s memory circuit, wired from its own brain scan.</h1>
              <p className="intro__lede">
                {model.circuit ? (
                  <>
                    {int(model.circuit.kc.n)} Kenyon cells, {int(model.circuit.mbon.n)} output neurons and{' '}
                    {int(model.circuit.dan.n)} dopamine neurons,
                  </>
                ) : (
                  "The Kenyon cells, output neurons and dopamine neurons of the fly’s learning centre,"
                )}{' '}
                wired exactly as the MaleCNS brain scan says, with the published dopamine learning rule. Pick an odour, pair
                it with punishment, and watch where the memory lands and how far it spreads. The failures are reported next
                to the successes.
              </p>
              <p className="intro__note">{MODEL_DISCLAIMER}</p>
            </header>
            {model.status === 'ready' ? (
              <Lab
                model={model}
                step={step}
                setStep={setStep}
                selected={selected}
                setSelected={setSelected}
                beta={beta}
                setBeta={setBeta}
                announce={announce}
                headlines={headlines}
                results={results.q}
                reducedMotion={reducedMotion}
                onScrollToStage={scrollToStage}
              />
            ) : (
              <p className="muted lab-wait">{model.status === 'error' ? 'The simulation needs the circuit data.' : 'Preparing the simulation…'}</p>
            )}
          </div>
          <div className={`lab__stage${sceneStatus === 'failed' ? ' lab__stage--nogl' : ''}`} ref={stageRef}>
            {model.status === 'error' ? (
              <div className="stage stage--error" role="alert">
                <p>The circuit data could not be loaded ({String(model.error?.message || model.error)}).</p>
              </div>
            ) : model.status === 'loading' ? (
              loadingStage
            ) : (
              <Suspense fallback={loadingStage}>
                <Scene3D
                  circuit={model.circuit}
                  activity={activity}
                  pulse={model.lastPair}
                  reducedMotion={reducedMotion}
                  caption={caption}
                  describedBy="scene-summary"
                  modality={model.modality}
                  onStatus={setSceneStatus}
                />
              </Suspense>
            )}
          </div>
        </section>

        <RealVsMine headlines={headlines} results={results} circuit={model.circuit} sparsity={model.sim?.mb.sparsity} />
        <Negatives headlines={headlines} results={results} circuit={model.circuit} sparsity={model.sim?.mb.sparsity} />
        <BodySection results={results} />
        <VideoSection headlines={headlines} results={results} />
        <Credits />
      </main>

      <footer className="footer">
        <p>
          Kenyon · a model of the wiring, not a recording of a fly · connectome data MaleCNS v1.0 (Janelia and Google),{' '}
          <a href={CC_BY} rel="noopener noreferrer license" target="_blank">CC BY 4.0</a> ·{' '}
          <a href={REPO} rel="noopener noreferrer" target="_blank">source</a> ·{' '}
          <a href={`${import.meta.env.BASE_URL || '/'}third-party-licenses.md`}>third-party licences</a>
        </p>
      </footer>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
    </>
  );
}
