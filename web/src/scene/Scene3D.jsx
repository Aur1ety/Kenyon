import { useEffect, useMemo, useRef, useState } from 'react';
import { ConnectomeScene } from './ConnectomeScene.js';
import { buildLayout, describePoint, classText, CLASSES } from './layout.js';
import './scene.css';

const cells = (n) => n.toLocaleString('en-GB');

const VIEWS = [
  { id: 'default', label: 'Reset view' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
];

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
  const [scienceNames, setScienceNames] = useState(false); // everyday names by default; technical names on request
  const [visible, setVisible] = useState(() => Object.fromEntries(CLASSES.map((c) => [c.id, true])));
  // the key starts closed everywhere: the labels in the view already name the story's cells
  const [legendOpen, setLegendOpen] = useState(false);
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

  // the page shows the view's text description while the 3D view can't be seen (never started, or lost)
  useEffect(() => { onStatus?.(failed ? 'failed' : lost ? 'lost' : 'ok'); }, [failed, lost]); // eslint-disable-line react-hooks/exhaustive-deps

  // vision's input neurons sit out in the optic lobes: frame everything for vision, the core for smell
  useEffect(() => { sceneRef.current?.setFit(modality === 'visual' ? 'all' : 'core'); }, [modality, layout]);
  useEffect(() => { sceneRef.current?.setAutoRotate(autoRotate); }, [autoRotate, layout]);
  useEffect(() => { sceneRef.current?.setLinesVisible(linesOn); }, [linesOn, layout]);
  useEffect(() => { sceneRef.current?.setLabelsVisible(labelsOn); }, [labelsOn, layout]);
  useEffect(() => { sceneRef.current?.setScienceNames(scienceNames); }, [scienceNames, layout]);
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

  const hoverInfo = hover && layout ? describePoint(circuit, layout, hover.index, scienceNames) : null;
  // the sense in use names the thing on the rig (the Smell / Sight switch lives under "For scientists")
  const thing = modality === 'visual' ? 'object' : 'smell';
  const counts = layout ? layout.counts : null;

  if (failed) {
    // WebGL never started: show only the note (no canvas, controls or legend to tab into)
    return (
      <div className="stage stage--nogl">
        <div className="stage__fallback" role="note">
          <p><strong>The 3D view could not start.</strong> This browser or device doesn&apos;t support the 3D graphics it needs.</p>
          <p>Everything it would show is in the text beside it.</p>
        </div>
      </div>
    );
  }

  const dopamineText = flash ? (flash.us === 'punish' ? 'Punishment signal (dopamine)' : 'Reward signal (dopamine)') : null;
  const ringKc = layout ? layout.standIns.kc : 0;
  const ringMbon = layout ? layout.standIns.mbon : 0;

  return (
    <div className={`stage${flash ? ` stage--flash-${flash.us}` : ''}${legendOpen ? ' stage--legend-open' : ''}`}>
      <canvas
        ref={canvasRef}
        className="stage__canvas"
        tabIndex={0}
        role="application"
        aria-roledescription="interactive 3D view"
        aria-label={`3D view of the model's memory circuit: ${layout ? cells(layout.count) : ''} neurons, almost all placed where the brain scan found them. ${caption || ''}`.trim()}
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
          <span className="stage__caption-main">{caption || `Pick ${modality === 'visual' ? 'an object' : 'a smell'} to light up its memory neurons`}</span>
          <span className="stage__caption-sub">Each dot is one neuron from the scan · front view: the brain&apos;s left is on your right</span>
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
            Spin
          </button>
          <button type="button" className="tool" aria-pressed={linesOn} onClick={() => setLinesOn((v) => !v)}>
            Connections
          </button>
          <button type="button" className="tool" aria-pressed={labelsOn} onClick={() => setLabelsOn((v) => !v)}>
            Labels
          </button>
        </div>
      </div>

      <div className="stage__bottom">
        <details className="legend key-box" open={legendOpen} onToggle={(e) => setLegendOpen(e.currentTarget.open)}>
          <summary>Key</summary>
          <div className="key">
            <ul className="key__list" aria-label="Neuron groups: press one to show or hide it">
              {/* everyday names: only the sense in use (the other sense's input neurons are not part of the story) */}
              {CLASSES.filter((c) => scienceNames || c.id !== (modality === 'visual' ? 'pn' : 'vpn')).map((c) => {
                const label = classText(c, layout, 'label');
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="key__row"
                      aria-pressed={visible[c.id]}
                      title={label}
                      onClick={() => setVisible((v) => ({ ...v, [c.id]: !v[c.id] }))}
                      onMouseEnter={() => sceneRef.current?.setFocus(c.id)}
                      onMouseLeave={() => sceneRef.current?.setFocus(null)}
                      onFocus={() => sceneRef.current?.setFocus(c.id)}
                      onBlur={() => sceneRef.current?.setFocus(null)}
                    >
                      <span className="swatch" style={{ '--c': c.color }} aria-hidden="true" />
                      <span className="key__name">{scienceNames ? c.tech : c.short}</span>
                      <span className="key__count">
                        {counts ? cells(counts[c.id]) : ''}
                        <span className="sr-only"> cells. </span>
                      </span>
                      <span className="key__line">{classText(c, layout, 'line')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <ul className="key__notes">
              <li>
                <span className="swatch swatch--shared" aria-hidden="true" />
                <span>Yellow: memory neurons shared with the punished {thing}.</span>
              </li>
              {scienceNames && (
                <li>
                  <span className="swatch swatch--ring" aria-hidden="true" />
                  <span>
                    Hollow ring: no cell body in the scan, so placed at the average spot for its kind ({ringKc}{'\u00a0'}memory
                    neuron{ringKc === 1 ? '' : 's'}, {ringMbon}{'\u00a0'}output{'\u00a0'}neuron{ringMbon === 1 ? '' : 's'}).
                  </span>
                </li>
              )}
              <li>
                <span className="key__stroke" aria-hidden="true" />
                <span>Lines and moving dots: a sketch of which neurons connect, not the real paths.</span>
              </li>
            </ul>
          </div>
          {/* after the key in reading order; drawn on the "Key" line so the open key stays short */}
          <button
            type="button"
            className="key__names"
            aria-pressed={scienceNames}
            title="Swap in the technical names, and label both sides of the brain"
            onClick={() => setScienceNames((v) => !v)}
          >
            Scientific names
          </button>
        </details>
      </div>

      {hoverInfo && (
        <div className="hovercard" style={{ transform: `translate(${hover.x + 14}px, ${hover.y + 14}px)` }} aria-hidden="true">
          <strong>{hoverInfo.kind}</strong>
          <span>{hoverInfo.type}{hoverInfo.side ? ` · ${hoverInfo.side}` : ''}</span>
          {hoverInfo.extra && <span>{hoverInfo.extra}</span>}
          <span className="hovercard__meta">scan ID {hoverInfo.body} · position: {hoverInfo.where}</span>
        </div>
      )}

      {lost && (
        <div className="stage__lost" role="status">
          The 3D view lost its graphics and is blank for now. It comes back if the browser restores it. Everything it
          shows is also in the text beside it.
        </div>
      )}

      <p id="scene-keys" className="sr-only">
        Keyboard: arrow keys turn the view (hold Shift for bigger steps), plus and minus zoom, 0 resets, and F, S and T
        show the front, side and top. A text description of the view is in the panel beside it.
      </p>
    </div>
  );
}
