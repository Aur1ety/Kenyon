import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectomeScene } from './ConnectomeScene.js';
import { buildLayout, describePoint, CLASSES } from './layout.js';

const VIEWS = [
  { id: 'default', label: 'Reset view' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
];

function wide() {
  // the legend starts open only where the stage has its own column (app.css: the two-column lab from 1000 px)
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 1000px)').matches;
}

/**
 * The 3D view. Props:
 *   circuit   the engine's prepared circuit
 *   activity  {modality, channels, kc, kcTrained, mbonLevel} from the engine's present() frame
 *   pulse     {us, id} of the last pairing (a new id fires the dopamine animation)
 *   reducedMotion, caption, describedBy (id of the visible text description of the view)
 */
export default function Scene3D({ circuit, activity, pulse, reducedMotion, caption, describedBy, modality, onStatus }) {
  const canvasRef = useRef(null);
  const labelRef = useRef(null);
  const sceneRef = useRef(null);
  const [failed, setFailed] = useState(null);
  const [lost, setLost] = useState(false); // the browser dropped the WebGL context mid-session
  const [hover, setHover] = useState(null);
  const [autoRotate, setAutoRotate] = useState(!reducedMotion);
  const [linesOn, setLinesOn] = useState(true);
  const [labelsOn, setLabelsOn] = useState(true);
  const [visible, setVisible] = useState(() => Object.fromEntries(CLASSES.map((c) => [c.id, true])));
  const [legendOpen, setLegendOpen] = useState(wide);
  const [flash, setFlash] = useState(null);

  const layout = useMemo(() => (circuit ? buildLayout(circuit) : null), [circuit]);

  // create the three.js scene once the circuit is here
  useEffect(() => {
    if (!layout || !canvasRef.current) return undefined;
    let scene;
    try {
      scene = new ConnectomeScene(canvasRef.current, labelRef.current, layout, circuit, {
        reducedMotion,
        onHover: (h) => setHover(h),
        onContextLost: () => { setLost(true); setHover(null); },
        onContextRestored: () => setLost(false),
      });
    } catch (e) {
      setFailed(e);
      return undefined;
    }
    scene.onUserInteract = () => setAutoRotate(false);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
    // the scene is rebuilt only when the circuit changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.setReducedMotion(reducedMotion);
    if (reducedMotion) setAutoRotate(false);
  }, [reducedMotion]);

  useEffect(() => { onStatus?.(failed ? 'failed' : 'ok'); }, [failed]); // eslint-disable-line react-hooks/exhaustive-deps

  // vision's input neurons sit out in the optic lobes: frame everything for vision, the core for smell
  useEffect(() => { sceneRef.current?.setFit(modality === 'visual' ? 'all' : 'core'); }, [modality, layout]);
  useEffect(() => { sceneRef.current?.setAutoRotate(autoRotate); }, [autoRotate, layout]);
  useEffect(() => { sceneRef.current?.setLinesVisible(linesOn); }, [linesOn, layout]);
  useEffect(() => { sceneRef.current?.setLabelsVisible(labelsOn); }, [labelsOn, layout]);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    for (const c of CLASSES) s.setVisible(c.id, visible[c.id]);
  }, [visible, layout]);

  // the pulse must be registered before the new activity, so the MBONs dim when the dopamine arrives
  useEffect(() => {
    if (!pulse || !sceneRef.current) return undefined;
    sceneRef.current.pulse(pulse.us);
    setFlash(pulse);
    const t = setTimeout(() => setFlash(null), reducedMotion ? 2500 : 1700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.id]);

  useEffect(() => {
    if (sceneRef.current && activity) sceneRef.current.setActivity(activity);
  }, [activity, layout]);

  const onKeyDown = (e) => {
    const s = sceneRef.current;
    if (!s) return;
    const step = e.shiftKey ? 0.3 : 0.1;
    const map = {
      ArrowLeft: () => s.orbit(-step, 0),
      ArrowRight: () => s.orbit(step, 0),
      ArrowUp: () => s.orbit(0, -step),
      ArrowDown: () => s.orbit(0, step),
      '+': () => s.zoom(0.88),
      '=': () => s.zoom(0.88),
      '-': () => s.zoom(1.14),
      _: () => s.zoom(1.14),
      0: () => s.setView('default'),
      Home: () => s.setView('default'),
      f: () => s.setView('front'),
      s: () => s.setView('side'),
      t: () => s.setView('top'),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      setAutoRotate(false);
      fn();
    }
  };

  const hoverInfo = hover && layout ? describePoint(circuit, layout, hover.index) : null;
  const counts = layout ? layout.counts : null;

  if (failed) {
    // WebGL never started: show only the note (no canvas, controls or legend to tab into)
    return (
      <div className="stage stage--nogl">
        <div className="stage__fallback" role="note">
          <p><strong>The 3D view could not start</strong> (this browser or device did not give it WebGL).</p>
          <p>Everything it would show is in the text and numbers beside it: see &ldquo;What the 3D view shows&rdquo;.</p>
        </div>
      </div>
    );
  }

  const dopamineText = flash ? (flash.us === 'punish' ? 'Dopamine: PPL1-γ1pedc (punishment)' : 'Dopamine: PAM (reward)') : null;

  return (
    <div className={`stage${flash ? ` stage--flash-${flash.us}` : ''}${legendOpen ? ' stage--legend-open' : ''}`}>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="interactive 3D view"
        aria-label={`The fly's mushroom-body circuit in 3D: ${layout ? layout.count.toLocaleString('en-GB') : ''} cells drawn at their scanned cell-body positions from the MaleCNS connectome. ${caption || ''}`}
        aria-describedby={`scene-keys ${describedBy || ''}`.trim()}
        onKeyDown={onKeyDown}
      />
      <div className="stage__vignette" aria-hidden="true" />
      <div className="stage__labels" ref={labelRef} aria-hidden="true" />

      {flash && (
        <div className={`stage__dopamine stage__dopamine--${flash.us}`} aria-hidden="true">
          {dopamineText}
        </div>
      )}

      <div className="stage__top">
        <p className="stage__caption">
          <span className="stage__caption-main">{caption || 'Pick an odour to light up its Kenyon cells'}</span>
          <span className="stage__caption-sub">Cell bodies at scanned positions · front view has the fly&apos;s left on your right</span>
        </p>
        {flash && (
          // narrow stages: the same label, under the caption instead of in the (busy) bottom corner
          <div className={`stage__dopamine stage__dopamine--inline stage__dopamine--${flash.us}`} aria-hidden="true">
            {dopamineText}
          </div>
        )}
        <div className="toolbar" role="group" aria-label="3D view controls">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className="tool" onClick={() => { setAutoRotate(false); sceneRef.current?.setView(v.id); }}>
              {v.label}
            </button>
          ))}
          <button
            type="button"
            className="tool"
            aria-pressed={autoRotate}
            disabled={reducedMotion}
            title={reducedMotion ? 'Off because your system asks for reduced motion' : undefined}
            onClick={() => setAutoRotate((a) => !a)}
          >
            Auto-rotate
          </button>
          <button type="button" className="tool" aria-pressed={linesOn} onClick={() => setLinesOn((v) => !v)}>
            Wiring lines
          </button>
          <button type="button" className="tool" aria-pressed={labelsOn} onClick={() => setLabelsOn((v) => !v)}>
            Labels
          </button>
        </div>
      </div>

      <div className="stage__bottom">
        <details className="legend" open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)}>
          <summary>Legend</summary>
          <ul className="legend__list" aria-label="Cell classes: press one to show or hide it">
            {CLASSES.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="legend__item"
                  aria-pressed={visible[c.id]}
                  aria-label={`${c.label}, ${counts ? counts[c.id].toLocaleString('en-GB') : ''} cells`}
                  title={c.label}
                  onClick={() => setVisible((v) => ({ ...v, [c.id]: !v[c.id] }))}
                  onMouseEnter={() => sceneRef.current?.setFocus(c.id)}
                  onMouseLeave={() => sceneRef.current?.setFocus(null)}
                  onFocus={() => sceneRef.current?.setFocus(c.id)}
                  onBlur={() => sceneRef.current?.setFocus(null)}
                >
                  <span className="swatch" style={{ '--c': c.color }} aria-hidden="true" />
                  <span className="legend__label">{c.short}</span>
                  <span className="legend__count">{counts ? counts[c.id].toLocaleString('en-GB') : ''}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="legend__note">
            Points are cell bodies at their scanned positions. <span className="swatch swatch--ring" aria-hidden="true" /> Hollow
            ring: no scanned cell body ({layout ? layout.standIns.kc : '–'} Kenyon cells, {layout ? layout.standIns.mbon : '–'} MBON),
            drawn at the mean of its type. <span className="swatch swatch--shared" aria-hidden="true" /> Yellow: Kenyon cells
            shared with the trained odour. Lines and pulses join cell bodies and are schematic.
          </p>
        </details>
      </div>

      {hoverInfo && (
        <div className="hovercard" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }} aria-hidden="true">
          <strong>{hoverInfo.kind}</strong>
          <span>{hoverInfo.type}{hoverInfo.side ? ` · ${hoverInfo.side}` : ''}</span>
          {hoverInfo.extra && <span>{hoverInfo.extra}</span>}
          <span className="hovercard__meta">body {hoverInfo.body} · {hoverInfo.where}</span>
        </div>
      )}

      {lost && (
        <div className="stage__lost" role="status">
          The 3D view lost its graphics context and is blank for now; it comes back if the browser restores it.
          Everything it shows is also in the text beside it.
        </div>
      )}

      <p id="scene-keys" className="sr-only">
        Keyboard: arrow keys rotate the view (hold Shift for bigger steps), plus and minus zoom, 0 resets, F, S and T
        show the front, side and top. The text description of the view follows the controls panel.
      </p>
    </div>
  );
}
