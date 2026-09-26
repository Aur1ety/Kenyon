// The 3D view: every circuit cell as a glowing point at its scanned soma position, drawn with three.js.
// It only DISPLAYS what the engine returns (which Kenyon cells fire, how strongly each MBON is driven);
// it computes nothing about the model. The lines and the dopamine pulses join cell bodies and are
// schematic: the real synapses sit in the mushroom-body calyx and lobes, which this view does not draw.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CLASSES, CLASS_INDEX } from './layout.js';
import {
  pointVertex, pointFragment, lineVertex, lineFragment, pulseVertex, pulseFragment,
} from './shaders.js';

const IDLE = { kc: 0.3, pn: 0.34, vpn: 0.3, mbon: 0.42, ppl1: 0.36, pam: 0.22, apl: 0.45 };
const ACTIVE = { kc: 1.35, pn: 1.25, vpn: 1.25 };
const SHARED_KC_COLOR = [1.0, 0.88, 0.4]; // yellow: KCs active for both the probe and the trained odour
const PUNISH_RGB = [1.0, 0.42, 0.42];
const REWARD_RGB = [0.41, 0.86, 0.49];
const MAX_LINES = 4000;
const PULSE_TRAIL = 5;
const MAX_PULSES = 64;

function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class ConnectomeScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} labelLayer absolutely positioned layer for the 3D labels (aria-hidden)
   * @param {ReturnType<import('./layout.js').buildLayout>} layout
   * @param {object} circuit the engine's prepared circuit (for the schematic PN->KC lines)
   * @param {{reducedMotion?: boolean, onHover?: (hit: null | {index:number, x:number, y:number}) => void}} opts
   */
  constructor(canvas, labelLayer, layout, circuit, opts = {}) {
    this.canvas = canvas;
    this.labelLayer = labelLayer;
    this.layout = layout;
    this.circuit = circuit;
    this.reducedMotion = !!opts.reducedMotion;
    this.onHover = opts.onHover || null;
    this.onContextLost = opts.onContextLost || null;
    this.onContextRestored = opts.onContextRestored || null;
    this.disposed = false;
    this.contextLost = false;
    this.running = false;
    this.pendingMbon = null;
    this.pulses = [];
    this.flashes = [];

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x03050a, 1);
    this.renderer = renderer;

    // if the browser drops the WebGL context the canvas goes black: say so, and redraw when it comes back
    this._onContextLost = (e) => {
      e.preventDefault(); // allows the browser to restore the context
      this.contextLost = true;
      this.labelLayer.style.visibility = 'hidden';
      if (this.onContextLost) this.onContextLost();
    };
    this._onContextRestored = () => {
      this.contextLost = false;
      this.labelLayer.style.visibility = '';
      if (this.onContextRestored) this.onContextRestored();
      this.requestRender();
    };
    canvas.addEventListener('webglcontextlost', this._onContextLost);
    canvas.addEventListener('webglcontextrestored', this._onContextRestored);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 200);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.9;
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 30;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => {
      if (this.controls.autoRotate && this.onUserInteract) this.onUserInteract();
    });

    this.#buildPoints();
    this.#buildLines();
    this.#buildPulses();
    this.#buildLabels();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 0.05;
    this.pointer = new THREE.Vector2();
    this._onPointerMove = (e) => this.#hover(e);
    this._onPointerLeave = () => this.onHover && this.onHover(null);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerleave', this._onPointerLeave);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    // stop drawing while the stage is scrolled out of view (auto-rotate would otherwise spin in the background)
    this.onScreen = true;
    this.intersection = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      if (this.onScreen) this.requestRender();
    });
    this.intersection.observe(canvas);
    this.resize();
    this.setView('default', true);
    this.clock = performance.now();
    this.requestRender();
  }

  // ---------- construction ----------

  #buildPoints() {
    const L = this.layout;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(L.positions, 3));
    this.baseColors = L.colors.slice();
    this.colorAttr = new THREE.BufferAttribute(L.colors.slice(), 3);
    this.colorAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aColor', this.colorAttr);
    g.setAttribute('aSize', new THREE.BufferAttribute(L.sizes, 1));
    g.setAttribute('aShape', new THREE.BufferAttribute(Float32Array.from(L.shape), 1));
    g.setAttribute('aClass', new THREE.BufferAttribute(Float32Array.from(L.cls), 1));
    this.level = new Float32Array(L.count);
    this.target = new Float32Array(L.count);
    for (let i = 0; i < L.count; i++) {
      const id = CLASSES[L.cls[i]].id;
      this.level[i] = this.target[i] = IDLE[id];
    }
    this.levelAttr = new THREE.BufferAttribute(this.level, 1);
    this.levelAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aLevel', this.levelAttr);
    g.computeBoundingSphere();

    this.pointUniforms = {
      uPixelRatio: { value: this.renderer.getPixelRatio() },
      uSizeScale: { value: 3 },
      uVisible: { value: new Array(7).fill(1) },
      uFocus: { value: -1 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.pointUniforms,
      vertexShader: pointVertex,
      fragmentShader: pointFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  #buildLines() {
    const g = new THREE.BufferGeometry();
    this.linePos = new Float32Array(MAX_LINES * 2 * 3);
    this.lineCol = new Float32Array(MAX_LINES * 2 * 3);
    this.lineAlpha = new Float32Array(MAX_LINES * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.lineAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.lineUniforms = { uOpacity: { value: 0 } };
    this.lineOpacityTarget = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      vertexShader: lineVertex,
      fragmentShader: lineFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(g, m);
    this.lines.frustumCulled = false;
    this.scene.add(this.lines);
    this.showLines = true;
  }

  #buildPulses() {
    const n = MAX_PULSES * PULSE_TRAIL;
    const g = new THREE.BufferGeometry();
    this.pulsePos = new Float32Array(n * 3);
    this.pulseCol = new Float32Array(n * 3);
    this.pulseSize = new Float32Array(n);
    this.pulseLevel = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pulsePos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.pulseCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pulseSize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLevel', new THREE.BufferAttribute(this.pulseLevel, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    const m = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: this.pointUniforms.uPixelRatio, uSizeScale: this.pointUniforms.uSizeScale },
      vertexShader: pulseVertex,
      fragmentShader: pulseFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    this.pulsePoints = new THREE.Points(g, m);
    this.pulsePoints.frustumCulled = false;
    this.scene.add(this.pulsePoints);
  }

  #buildLabels() {
    const A = this.layout.anchors;
    const right = (o) => (o.R ? o.R : o);
    const defs = [
      { cls: 'kc', text: 'Kenyon cells', p: A.kc.L, key: 'kc' },
      { cls: 'pn', text: 'Projection neurons (smell)', p: right(A.pn), key: 'pn' },
      { cls: 'vpn', text: 'Visual projection neurons', p: A.vpn.L, key: 'vpn' },
      { cls: 'pam', text: 'PAM (reward)', p: A.pam.L, key: 'pam' },
      ...A.mbon11.map((m) => ({ cls: 'mbon', text: `MBON11 (${m.side})`, p: m.p, key: 'mbon', strong: true })),
      ...A.ppl101.map((d) => ({ cls: 'ppl1', text: `PPL1-γ1pedc (${d.side})`, p: d.p, key: 'ppl1' })),
    ];
    this.labels = defs.map((d) => {
      const el = document.createElement('div');
      el.className = `scene-label scene-label--${d.cls}${d.strong ? ' scene-label--strong' : ''}`;
      el.textContent = d.text;
      this.labelLayer.appendChild(el);
      return { ...d, el, v: new THREE.Vector3(...d.p) };
    });
    this.labelsOn = true;
  }

  // ---------- public API ----------

  /** Size and camera follow the parent element. */
  resize() {
    const parent = this.canvas.parentElement;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pointUniforms.uSizeScale.value = Math.max(h, 420) / 215;
    for (const l of this.labels) l.w = l.el.offsetWidth;
    this.width = w;
    this.height = h;
    this.requestRender();
  }

  /** Camera distance that fits the mushroom-body core ('core') or every cell, optic lobes included ('all'). */
  fitDistance(fit = this.fit || 'core') {
    const e = fit === 'all' ? this.layout.extentAll : this.layout.extentCore;
    const halfW = Math.max(e[0], e[2]), halfH = Math.max(e[1], e[2] * 0.6);
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    return Math.max(halfH / t, halfW / (t * this.camera.aspect)) * (fit === 'all' ? 1.02 : 1.12) + Math.max(e[0], e[2]) * 0.35;
  }

  setFit(fit) {
    this.fit = fit;
    this.setView('default');
  }

  /** 'default' | 'front' | 'side' | 'top' */
  setView(name, instant = false) {
    const d = this.fitDistance();
    const dirs = {
      default: new THREE.Vector3(0.36, 0.22, 1).normalize(),
      front: new THREE.Vector3(0, 0, 1),
      side: new THREE.Vector3(1, 0, 0.0001).normalize(),
      top: new THREE.Vector3(0, 1, 0.0001).normalize(),
    };
    const to = (dirs[name] || dirs.default).clone().multiplyScalar(d);
    this.#moveCamera(to, new THREE.Vector3(0, 0, 0), instant || this.reducedMotion);
  }

  #moveCamera(pos, target, instant) {
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.camTween = null;
    } else {
      this.camTween = {
        t0: performance.now(), dur: 650,
        fromP: this.camera.position.clone(), toP: pos,
        fromT: this.controls.target.clone(), toT: target,
      };
    }
    this.requestRender();
  }

  orbit(dAzimuth, dPolar) {
    // keyboard orbit, in radians
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta += dAzimuth;
    s.phi = THREE.MathUtils.clamp(s.phi + dPolar, 0.05, Math.PI - 0.05);
    off.setFromSpherical(s);
    this.camera.position.copy(this.controls.target).add(off);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    this.requestRender();
  }

  zoom(factor) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    off.setLength(len);
    this.camera.position.copy(this.controls.target).add(off);
    this.controls.update();
    this.requestRender();
  }

  setAutoRotate(on) {
    this.controls.autoRotate = !!on && !this.reducedMotion;
    this.requestRender();
  }

  setReducedMotion(on) {
    this.reducedMotion = !!on;
    this.controls.enableDamping = !on;
    if (on) this.controls.autoRotate = false;
    this.requestRender();
  }

  setVisible(classId, on) {
    const i = CLASS_INDEX[classId];
    const v = this.pointUniforms.uVisible.value.slice();
    v[i] = on ? 1 : 0;
    this.pointUniforms.uVisible.value = v;
    for (const l of this.labels) if (l.cls === classId) l.hidden = !on;
    this.#updateLineTarget(); // a wiring line needs both of its ends on screen
    this.requestRender();
  }

  /** Lines join the input neurons of the sense in use to the Kenyon cells: shown only if both classes are. */
  #updateLineTarget() {
    const vis = this.pointUniforms.uVisible.value;
    const input = this.modality === 'visual' ? 'vpn' : 'pn';
    const ends = vis[CLASS_INDEX.kc] > 0 && vis[CLASS_INDEX[input]] > 0;
    this.lineOpacityTarget = this.showLines && ends && this.lineCount > 0 ? 1 : 0;
    if (this.reducedMotion) this.lineUniforms.uOpacity.value = this.lineOpacityTarget;
  }

  setFocus(classId) {
    this.pointUniforms.uFocus.value = classId == null ? -1 : CLASS_INDEX[classId];
    this.requestRender();
  }

  setLabelsVisible(on) {
    this.labelsOn = !!on;
    this.labelLayer.style.display = on ? '' : 'none';
    this.requestRender();
  }

  setLinesVisible(on) {
    this.showLines = !!on;
    this.#updateLineTarget();
    this.requestRender();
  }

  /**
   * What the circuit is doing right now, as returned by the engine.
   * @param {{
   *   modality?: 'olfactory'|'visual',
   *   channels?: number[] | null,     // the odour's glomeruli (or visual channels); null = nothing presented
   *   kc?: ArrayLike<number> | null,  // indices of the Kenyon cells that fire
   *   kcTrained?: ArrayLike<number> | null, // KCs of the trained odour, to show the overlap
   *   mbonLevel?: ArrayLike<number> | null, // 97 values in 0..1 (display brightness of each MBON)
   * }} s
   */
  setActivity(s) {
    const L = this.layout;
    const off = L.offset;
    const modality = s.modality || 'olfactory';
    this.modality = modality;
    const channels = s.channels ? new Set(s.channels) : null;

    // Kenyon cells
    const kcOn = new Uint8Array(this.circuit.kc.n);
    if (s.kc) for (const i of s.kc) kcOn[i] = 1;
    const kcTr = new Uint8Array(this.circuit.kc.n);
    if (s.kcTrained) for (const i of s.kcTrained) kcTr[i] = 1;
    const col = this.colorAttr.array;
    for (let i = 0; i < this.circuit.kc.n; i++) {
      const p = off.kc + i;
      this.target[p] = kcOn[i] ? ACTIVE.kc : IDLE.kc;
      const shared = kcOn[i] && kcTr[i];
      const src = shared ? SHARED_KC_COLOR : this.baseColors.subarray(3 * p, 3 * p + 3);
      col[3 * p] = src[0]; col[3 * p + 1] = src[1]; col[3 * p + 2] = src[2];
    }
    this.colorAttr.needsUpdate = true;

    // input neurons of the presented odour or object
    const pn = this.circuit.pn, vpn = this.circuit.vpn;
    const pnOn = new Uint8Array(pn.n), vpnOn = new Uint8Array(vpn.n);
    for (let j = 0; j < pn.n; j++) {
      pnOn[j] = channels && modality === 'olfactory' && channels.has(pn.channel[j]) ? 1 : 0;
      this.target[off.pn + j] = pnOn[j] ? ACTIVE.pn : IDLE.pn;
    }
    for (let j = 0; j < vpn.n; j++) {
      vpnOn[j] = channels && modality === 'visual' && channels.has(vpn.channel[j]) ? 1 : 0;
      this.target[off.vpn + j] = vpnOn[j] ? ACTIVE.vpn : IDLE.vpn;
    }

    // MBONs: brightness from the engine's drives; held back while a dopamine pulse is travelling
    if (s.mbonLevel !== undefined) {
      if (this.pulseArrive && performance.now() < this.pulseArrive) this.pendingMbon = s.mbonLevel;
      else this.#applyMbon(s.mbonLevel);
    }

    this.#rebuildLines(modality, kcOn, pnOn, vpnOn);
    if (this.reducedMotion) this.level.set(this.target);
    this.levelAttr.needsUpdate = true;
    this.requestRender();
  }

  #applyMbon(levels) {
    const off = this.layout.offset.mbon;
    for (let m = 0; m < this.circuit.mbon.n; m++) {
      const v = levels ? levels[m] : null;
      this.target[off + m] = v == null ? IDLE.mbon : 0.12 + 1.15 * Math.sqrt(Math.max(0, Math.min(1, v)));
    }
    if (this.reducedMotion) this.level.set(this.target);
  }

  #rebuildLines(modality, kcOn, pnOn, vpnOn) {
    const W = modality === 'visual' ? this.circuit.weights.vpnKc : this.circuit.weights.pnKc;
    const inOn = modality === 'visual' ? vpnOn : pnOn;
    const inOff = modality === 'visual' ? this.layout.offset.vpn : this.layout.offset.pn;
    const inRgb = hexRgb(modality === 'visual' ? '#b197fc' : '#ffa94d');
    const kcRgb = hexRgb('#5fd4f0');
    const P = this.layout.positions;
    let n = 0;
    for (let i = 0; i < kcOn.length && n < MAX_LINES; i++) {
      if (!kcOn[i]) continue;
      for (let e = W.indptr[i]; e < W.indptr[i + 1] && n < MAX_LINES; e++) {
        const j = W.cols[e];
        if (!inOn[j]) continue;
        const a = (inOff + j) * 3, b = (this.layout.offset.kc + i) * 3;
        this.linePos.set([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2]], n * 6);
        this.lineCol.set([...inRgb, ...kcRgb], n * 6);
        const w = 0.05 + 0.2 * Math.min(1, W.counts[e] / 30);
        this.lineAlpha[2 * n] = w;
        this.lineAlpha[2 * n + 1] = w * 0.8;
        n++;
      }
    }
    this.lineCount = n;
    const g = this.lines.geometry;
    g.setDrawRange(0, n * 2);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    this.#updateLineTarget();
    if (!this.reducedMotion && n > 0) this.lineUniforms.uOpacity.value = 0; // fade the new fan in
  }

  /**
   * Dopamine pairing: the dopamine neurons flash and pulses travel from their cell bodies to the cell
   * bodies of the MBONs in their compartment (schematic). Returns the travel time in ms.
   * @param {'punish'|'reward'} kind
   */
  pulse(kind) {
    const L = this.layout, off = L.offset, circ = this.circuit;
    const rgb = kind === 'reward' ? REWARD_RGB : PUNISH_RGB;
    const targets = (kind === 'reward' ? L.rewardComp : L.punishComp.length ? L.punishComp : L.mbon11);
    let sources = kind === 'reward' ? L.pam : L.ppl101;
    if (kind === 'reward') {
      // a spread sample of PAM cells, so the burst reads without drawing 316 comets
      const step = Math.max(1, Math.floor(sources.length / 28));
      sources = sources.filter((_, k) => k % step === 0);
    }
    const now = performance.now();
    const dur = this.reducedMotion ? 0 : 1150;
    const tPos = (m) => L.at(off.mbon + m);
    this.pulses = [];
    for (const d of sources) {
      const side = circ.dan.side[d];
      const same = targets.filter((m) => circ.mbon.side[m] === side);
      const pool = same.length ? same : targets;
      const m = pool[d % pool.length];
      const a = new THREE.Vector3(...L.at(off.dan + d));
      const b = new THREE.Vector3(...tPos(m));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 0.6 + a.distanceTo(b) * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const burst = kind === 'reward' ? 1 : 3; // a few comets per punishment cell, one per sampled PAM cell
      for (let k = 0; k < burst && this.pulses.length < MAX_PULSES; k++) {
        this.pulses.push({ curve, delay: kind === 'reward' ? (d % 7) * 40 : k * 120 });
      }
      if (this.pulses.length >= MAX_PULSES) break;
    }
    // flash the dopamine population of this kind
    const flashSet = kind === 'reward' ? L.pam : L.ppl101;
    for (const d of flashSet) {
      this.level[off.dan + d] = kind === 'reward' ? 1.0 : 1.6;
    }
    this.flashes = [{ kind, until: now + dur + 500, set: flashSet }];
    this.pulseRgb = rgb;
    this.pulseStart = now;
    this.pulseDur = dur;
    this.pulseArrive = now + dur;
    this.pulseTargets = targets;
    this.levelAttr.needsUpdate = true;
    if (this.reducedMotion) {
      this.#arrive();
    }
    this.requestRender();
    return dur;
  }

  #arrive() {
    const off = this.layout.offset.mbon;
    for (const m of this.pulseTargets || []) this.level[off + m] = 1.6; // brief hit, then the new level
    if (this.pendingMbon !== null) {
      this.#applyMbon(this.pendingMbon);
      this.pendingMbon = null;
    }
    this.pulseArrive = 0;
    if (this.reducedMotion) {
      for (const f of this.flashes) for (const d of f.set) this.level[this.layout.offset.dan + d] = this.target[this.layout.offset.dan + d];
      this.flashes = [];
      this.level.set(this.target);
    }
    this.levelAttr.needsUpdate = true;
  }

  // ---------- frame loop ----------

  requestRender() {
    if (this.disposed || this.running || !this.onScreen || this.contextLost) return;
    this.running = true;
    this.clock = performance.now();
    requestAnimationFrame(() => this.#tick());
  }

  #tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.clock) / 1000);
    this.clock = now;
    let busy = false;

    if (this.camTween) {
      const k = Math.min(1, (now - this.camTween.t0) / this.camTween.dur);
      const e = easeInOut(k);
      this.camera.position.lerpVectors(this.camTween.fromP, this.camTween.toP, e);
      this.controls.target.lerpVectors(this.camTween.fromT, this.camTween.toT, e);
      if (k >= 1) this.camTween = null;
      busy = true;
    }
    const moved = this.controls.update();
    busy = busy || moved || this.controls.autoRotate;

    // brightness transitions
    if (!this.reducedMotion) {
      const rate = 1 - Math.exp(-dt * 7);
      let changed = false;
      for (let i = 0; i < this.level.length; i++) {
        const d = this.target[i] - this.level[i];
        if (Math.abs(d) > 0.002) { this.level[i] += d * rate; changed = true; }
        else if (d !== 0) { this.level[i] = this.target[i]; changed = true; }
      }
      if (changed) { this.levelAttr.needsUpdate = true; busy = true; }
      const lo = this.lineUniforms.uOpacity;
      const dl = this.lineOpacityTarget - lo.value;
      if (Math.abs(dl) > 0.003) { lo.value += dl * (1 - Math.exp(-dt * 3)); busy = true; }
      else lo.value = this.lineOpacityTarget;
    }

    // dopamine pulses
    if (this.pulseArrive && now >= this.pulseArrive) this.#arrive();
    busy = this.#updatePulses(now) || busy;
    if (this.flashes.length) {
      this.flashes = this.flashes.filter((f) => now < f.until);
      busy = true;
    }

    this.renderer.render(this.scene, this.camera);
    this.#updateLabels();

    if (busy && this.onScreen) requestAnimationFrame(() => this.#tick());
    else this.running = false;
  }

  #updatePulses(now) {
    const g = this.pulsePoints.geometry;
    if (!this.pulses.length || this.reducedMotion) {
      if (g.drawRange.count) { g.setDrawRange(0, 0); }
      return false;
    }
    const t = (now - this.pulseStart);
    let n = 0, alive = false;
    const p = new THREE.Vector3();
    for (const pl of this.pulses) {
      for (let k = 0; k < PULSE_TRAIL; k++) {
        const u = (t - pl.delay - k * 45) / this.pulseDur;
        if (u < 0 || u > 1) continue;
        pl.curve.getPoint(easeInOut(u), p);
        this.pulsePos.set([p.x, p.y, p.z], n * 3);
        this.pulseCol.set(this.pulseRgb, n * 3);
        this.pulseSize[n] = k === 0 ? 44 : 32 - k * 4;
        this.pulseLevel[n] = k === 0 ? 1.2 : 0.7 - k * 0.12;
        n++;
        alive = true;
      }
    }
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    g.attributes.aLevel.needsUpdate = true;
    if (!alive && t > this.pulseDur + 400) this.pulses = [];
    return alive || this.pulses.length > 0;
  }

  #updateLabels() {
    if (!this.labelsOn) return;
    const w = this.width, h = this.height;
    const v = new THREE.Vector3();
    // on a narrow stage there is no room for the input neurons of the sense not in use
    const idle = w < 700 ? (this.modality === 'visual' ? 'pn' : 'vpn') : null;
    const placed = [];
    for (const l of this.labels) {
      v.copy(l.v).project(this.camera);
      const off = l.hidden || l.cls === idle || v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05;
      if (off) { l.el.style.opacity = '0'; continue; }
      // keep every label inside the stage
      const lw = l.w || 120;
      const x = Math.min((v.x * 0.5 + 0.5) * w, w - lw - 18);
      placed.push({ l, x, y: Math.max(12, (-v.y * 0.5 + 0.5) * h), w: lw });
    }
    // simple collision nudging: a label that would overlap one already placed moves down below it
    const LINE = 20;
    placed.sort((a, b) => a.y - b.y);
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      for (let pass = 0; pass < placed.length; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const b = placed[j];
          if (a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && Math.abs(a.y - b.y) < LINE) {
            a.y = b.y + LINE;
            moved = true;
          }
        }
        if (!moved) break;
      }
    }
    for (const p of placed) {
      p.l.el.style.opacity = '';
      p.l.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
  }

  #hover(e) {
    if (!this.onHover || e.pointerType === 'touch') return;
    if (this._hoverRaf) return;
    this._hoverRaf = requestAnimationFrame(() => {
      this._hoverRaf = 0;
      const r = this.canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const dist = this.camera.position.distanceTo(this.controls.target);
      this.raycaster.params.Points.threshold = 0.012 * dist;
      const vis = this.pointUniforms.uVisible.value;
      const hits = this.raycaster.intersectObject(this.points).filter((h) => vis[this.layout.cls[h.index]] > 0);
      let hit = null;
      for (const h of hits) if (!hit || h.distanceToRay < hit.distanceToRay) hit = h;
      this.onHover(hit ? { index: hit.index, x: e.clientX - r.left, y: e.clientY - r.top } : null);
    });
  }

  dispose() {
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.intersection.disconnect();
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.controls.dispose();
    for (const o of [this.points, this.lines, this.pulsePoints]) {
      o.geometry.dispose();
      o.material.dispose();
    }
    for (const l of this.labels) l.el.remove();
    this.renderer.dispose();
  }
}
