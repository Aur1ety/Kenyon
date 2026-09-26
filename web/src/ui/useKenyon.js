// The one seam between the UI and the engine (src/engine). The UI never computes the model itself: every
// number it shows comes from the engine's Simulation (present, pair, reset, readout, choice, tmaze) or from
// the stored result files. If the engine's interface changes, this is the only file that needs to follow.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadCircuit, Simulation, PRESET_GROUPS, PRESET_ODOURS, presetOdour, DEFAULT_BETA, TABLES_BETA } from '../engine/index.js';

const BASE = import.meta.env.BASE_URL || '/';

/** The odour sets each modality offers; the eight-odour set is the tables' set (N is taken over it). */
export const ODOUR_SETS = {
  olfactory: PRESET_GROUPS.eight,
  visual: PRESET_GROUPS.visual,
};
export const SIMILAR_TO_A = PRESET_GROUPS.similarToA;
export const PARTS_OF_A = PRESET_GROUPS.partsOfA;
export const BETA_TABLES = TABLES_BETA;
export const BETA_WALKTHROUGH = DEFAULT_BETA;
const N_GLOM_A = PRESET_ODOURS.A.channels.length;

/** Short human names for the preset odours. */
export function displayName(name) {
  if (!name) return '';
  const share = /^A_share(\d)$/.exec(name);
  if (share) return `shares ${share[1]} of A's ${N_GLOM_A}`;
  const part = /^A_part(\d)$/.exec(name);
  if (part) return `${part[1]} of A's ${N_GLOM_A} only`;
  if (/^v[A-H]$/.test(name)) return `object ${name.slice(1)}`;
  return `odour ${name}`;
}

export function useKenyon() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [circuit, setCircuit] = useState(null);
  const [modality, setModalityState] = useState('olfactory');
  const [version, setVersion] = useState(0);
  const sims = useRef({});
  const view = useRef({ current: null, lastPair: null, pairCount: 0 });

  useEffect(() => {
    let alive = true;
    loadCircuit(`${BASE}data/circuit.json`)
      .then((c) => {
        if (!alive) return;
        setCircuit(c);
        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
        setStatus('error');
      });
    return () => { alive = false; };
  }, []);

  const bump = () => setVersion((v) => v + 1);

  /** A session per modality and condition, created on first use. */
  const session = useCallback((mod = modality, condition = 'intact') => {
    if (!circuit) return null;
    const key = `${mod}|${condition}`;
    if (!sims.current[key]) {
      sims.current[key] = new Simulation(circuit, {
        modality: mod,
        condition,
        odours: ODOUR_SETS[mod],
        beta: BETA_WALKTHROUGH,
      });
    }
    return sims.current[key];
  }, [circuit, modality]);

  const sim = circuit ? session(modality) : null;

  const odourObj = useCallback((name) => {
    if (!circuit || !name) return null;
    return typeof name === 'string' ? presetOdour(circuit, name) : name;
  }, [circuit]);

  // ---------------- actions ----------------

  const present = useCallback((name) => {
    const s = session();
    if (!s) return null;
    const frame = name ? s.present(odourObj(name)) : null;
    view.current.current = frame;
    bump();
    return frame;
  }, [session, odourObj]);

  /** Pair the odour on the rig (or `name`) with punishment or reward: one pairing block. */
  const pair = useCallback((us, name) => {
    const s = session();
    if (!s) return null;
    const od = odourObj(name || view.current.current?.odour?.name || 'A');
    const res = s.pair(od, us);
    const after = res.frames[res.frames.length - 1];
    view.current.current = after && after.kind === 'after' ? after : s.present(od);
    view.current.pairCount += 1;
    view.current.lastPair = { us, id: view.current.pairCount, odour: od.name };
    bump();
    return res;
  }, [session, odourObj]);

  /** Reset the memory (every KC->MBON weight back to 1) and re-present what is on the rig. */
  const reset = useCallback(() => {
    const s = session();
    if (!s) return;
    s.reset();
    const cur = view.current.current;
    view.current.current = cur ? s.present(cur.odour) : null;
    view.current.lastPair = null;
    bump();
  }, [session]);

  const undo = useCallback(() => {
    const s = session();
    if (!s || !s.history.length) return;
    s.undo();
    const cur = view.current.current;
    view.current.current = cur ? s.present(cur.odour) : null;
    bump();
  }, [session]);

  /**
   * Reset, then apply pairings in order ([{odour, us}]) and present `show` afterwards. Used by the
   * ready-made experiments (reward, two memories, same compartment). `onStep` lets the caller animate.
   */
  const runSequence = useCallback(async (steps, show, { onStep, gapMs = 0, condition } = {}) => {
    const s = session(modality, condition || 'intact');
    if (!s) return null;
    s.reset();
    if (condition && condition !== 'intact') {
      // other conditions run in their own session; mirror the result on the rig
      for (const st of steps) s.pair(odourObj(st.odour), st.us);
      return s;
    }
    view.current.current = null;
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      view.current.current = s.present(odourObj(st.odour));
      bump();
      pair(st.us, st.odour);
      if (onStep) onStep(i);
      if (gapMs && i < steps.length - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
    if (show) present(show);
    return s;
  }, [session, modality, odourObj, pair, present]);

  const setModality = useCallback((m) => {
    if (m === modality) return;
    view.current.current = null;
    view.current.lastPair = null;
    setModalityState(m);
    bump();
  }, [modality]);

  // ---------------- readouts (all from the engine) ----------------

  const readout = useCallback((name, condition) => {
    const s = session(modality, condition || 'intact');
    return s ? s.readout(odourObj(name)) : null;
  }, [session, modality, odourObj]);

  const kcOf = useCallback((name) => {
    const s = session();
    return s && name ? s.encode(odourObj(name)).active : null;
  }, [session, odourObj]);

  const choice = useCallback((x, y, beta) => {
    const s = session();
    return s ? s.choice(x, y, beta) : null;
  }, [session]);

  const tmaze = useCallback((a, b, condition) => {
    const s = session(modality, condition || 'intact');
    return s ? s.tmaze(a, b, { betas: [1, 2, 4, BETA_TABLES, BETA_WALKTHROUGH, 16, 32] }) : null;
  }, [session, modality]);

  const history = sim ? sim.history.slice() : [];

  return useMemo(() => ({
    status, error, circuit, modality, sim,
    current: view.current.current,
    lastPair: view.current.lastPair,
    history,
    odourSet: ODOUR_SETS[modality],
    k: sim ? sim.mb.k : null,
    nDrivable: sim ? sim.mb.nDrivable : null,
    masks: sim ? sim.masks : null,
    actions: { present, pair, reset, undo, runSequence, setModality, readout, kcOf, choice, tmaze, odourObj, session },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [status, error, circuit, modality, version]);
}
