import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import Lab from './ui/Lab.jsx';
import Results from './ui/Results.jsx';
import Built from './ui/Built.jsx';
import ForScientists from './ui/ForScientists.jsx';
import Glossary from './ui/Glossary.jsx';
import LabDetail from './ui/LabDetail.jsx';
import RealVsMine from './ui/RealVsMine.jsx';
import Negatives from './ui/Negatives.jsx';
import BodySection from './ui/BodySection.jsx';
import VideoSection from './ui/VideoSection.jsx';
import Credits from './ui/Credits.jsx';
import { REPO } from './ui/site.js';
import { COPY, lessonsLearned } from './ui/copy.js';
import { useKenyon, displayName, BETA_WALKTHROUGH } from './ui/useKenyon.js';
import { useReducedMotion } from './ui/useReducedMotion.js';
import { useResults } from './ui/useResults.js';
import { useManifest } from './ui/useManifest.js';
import { int } from './ui/format.js';
import { computeHeadlines } from './engine/index.js';

// three.js is most of the page's JavaScript, so the 3D view loads as its own chunk while the text renders. The
// download starts at once, alongside circuit.json, rather than after it.
const scenePromise = import('./scene/Scene3D.jsx');
const Scene3D = lazy(() => scenePromise);
const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
const H = COPY.hero;

export default function App() {
  const model = useKenyon();
  const results = useResults();
  const manifest = useManifest();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(1);
  // a step asked for by a button or link: Lab brings it into view and moves focus there (or to its main button)
  const [stepRequest, setStepRequest] = useState(null);
  const [selected, setSelected] = useState(null);
  const [beta, setBeta] = useState(BETA_WALKTHROUGH);
  const [message, setMessage] = useState('');
  const [sceneStatus, setSceneStatus] = useState('ok'); // 'ok', 'failed' (no WebGL) or 'lost' (context dropped)
  const [tryItId, setTryItId] = useState(0); // a new value each time the hero's "Try it" is pressed

  const announce = useCallback((text) => {
    // re-announce identical messages too
    setMessage('');
    requestAnimationFrame(() => setMessage(text));
  }, []);

  const goToStep = useCallback((n, focus = 'heading') => {
    setStep(n);
    setStepRequest((r) => ({ n, focus, id: (r?.id || 0) + 1 }));
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
  // step 2 (testing other smells) marks the memory neurons each smell shares with the punished one in yellow
  const showShared = !!(current && step >= 2 && lastPunished && lastPunished !== current.odour.name);
  const activity = useMemo(() => {
    if (!current) return { modality, channels: null, kc: null, kcTrained: null, mbonLevel: null };
    let max = 0;
    for (const v of current.mbonUntrained) if (v > max) max = v;
    const mbonLevel = Array.from(current.mbonDrive, (v) => (max > 0 ? v / max : 0));
    return {
      modality: current.odour.modality,
      channels: current.odour.channels,
      kc: current.kcActive,
      kcTrained: showShared ? actions.kcOf(lastPunished) : null,
      mbonLevel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, showShared, lastPunished, modality]);

  const caption = current
    ? COPY.caption({ name: displayName(current.odour.name), nOn: int(current.kcActive.length), lessons: history.length ? lessonsLearned(history.length) : '' })
    : null;

  useEffect(() => {
    if (model.status === 'ready') announce(COPY.announce.loaded);
  }, [model.status, announce]);

  const loadingStage = (
    <div className="stage stage--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{COPY.loading}</p>
    </div>
  );

  const tryIt = () => {
    if (model.status === 'ready') {
      // the lab lights up the smell and makes the punish button glow, so the press shows even when nothing scrolls
      setTryItId((n) => n + 1);
      goToStep(1, 'main');
    } else {
      document.getElementById('lab')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    }
  };

  const ready = model.status === 'ready';

  return (
    <>
      <a className="skip" href="#lab">{COPY.skip}</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label={COPY.brandLabel}>
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">Kenyon</span>
        </a>
        <nav className="topnav" aria-label={COPY.navLabel}>
          <ul>
            {COPY.nav.map(([href, label]) => (
              <li key={href}>
                {/* the browser leaves a half-visible link where it is on focus; scroll the nav so all of it shows */}
                <a href={href} onFocus={(e) => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}>{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <a className="topbar__gh" href={REPO} rel="noopener noreferrer" target="_blank">{COPY.github}</a>
      </header>

      <main id="top">
        <section id="lab" className="lab" aria-labelledby="hero-h">
          <div className="lab__panel">
            <header className="intro">
              <p className="eyebrow">{H.eyebrow}</p>
              <h1 id="hero-h" className="intro__h">{H.h1}</h1>
              <p className="intro__lede">{H.lede}</p>
              <div className="intro__cta">
                <button type="button" className="btn btn--primary btn--big" onClick={tryIt}>{H.button}</button>
              </div>
              <p className="intro__note">{H.note}</p>
            </header>
            {ready ? (
              <Lab
                model={model}
                step={step}
                goToStep={goToStep}
                stepRequest={stepRequest}
                tryIt={tryItId}
                selected={selected}
                setSelected={setSelected}
                beta={beta}
                setBeta={setBeta}
                announce={announce}
                results={results.q}
                reducedMotion={reducedMotion}
                showShared={showShared}
                sceneText={sceneStatus !== 'ok'}
              />
            ) : (
              <p className="muted lab-wait">{model.status === 'error' ? COPY.needsData : COPY.preparing}</p>
            )}
          </div>
          <div className={`lab__stage${sceneStatus === 'failed' ? ' lab__stage--nogl' : ''}`}>
            {model.status === 'error' ? (
              <div className="stage stage--error" role="alert">
                <p>{COPY.loadError({ error: String(model.error?.message || model.error) })}</p>
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

        <Results headlines={headlines} results={results} onGoToStep={goToStep} />
        <Built circuit={model.circuit} results={results} manifest={manifest} />

        <ForScientists reducedMotion={reducedMotion} refresh={`${model.status}|${results.status}`}>
          <Glossary circuit={model.circuit} results={results} sparsity={model.sim?.mb.sparsity} />
          {ready && (
            <LabDetail
              model={model}
              beta={beta}
              setBeta={setBeta}
              announce={announce}
              headlines={headlines}
              results={results.q}
              goToStep={goToStep}
              setSelected={setSelected}
            />
          )}
          <RealVsMine headlines={headlines} results={results} circuit={model.circuit} sparsity={model.sim?.mb.sparsity} />
          <Negatives headlines={headlines} results={results} circuit={model.circuit} sparsity={model.sim?.mb.sparsity} onGoToStep={goToStep} />
          <BodySection results={results} />
          <VideoSection headlines={headlines} results={results} />
          <Credits manifest={manifest} />
        </ForScientists>
      </main>

      <footer className="footer">
        <p>
          {COPY.footer.what} · {COPY.footer.scan}{' '}
          <a href={CC_BY} rel="noopener noreferrer license" target="_blank">{COPY.footer.licence}</a> ·{' '}
          <a href={REPO} rel="noopener noreferrer" target="_blank">{COPY.footer.source}</a> ·{' '}
          <a href={`${import.meta.env.BASE_URL || '/'}third-party-licenses.md`}>{COPY.footer.licences}</a>
        </p>
      </footer>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
    </>
  );
}
