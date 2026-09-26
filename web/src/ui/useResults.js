// Loads the stored result files the page cites (public/data/results, verbatim copies of results/*.json) once,
// on first use, and hands every component the same extracted values. See extractResults.js.

import { useEffect, useState } from 'react';
import { RESULT_FILES } from './resultFiles.js';
import { extractResults } from './extractResults.js';

const BASE = import.meta.env.BASE_URL || '/';
let pending = null;

export function loadResults(fetchImpl = globalThis.fetch) {
  if (!pending) {
    pending = Promise.all(
      Object.entries(RESULT_FILES).map(([key, file]) =>
        fetchImpl(`${BASE}data/results/${file}`).then((r) => {
          if (!r.ok) throw new Error(`${file}: ${r.status}`);
          return r.json().then((j) => [key, j]);
        }),
      ),
    ).then((pairs) => {
      const raw = Object.fromEntries(pairs);
      return { raw, q: extractResults(raw) };
    });
    pending.catch(() => { pending = null; }); // a later mount may retry
  }
  return pending;
}

/** {status: 'loading' | 'ready' | 'error', q, raw, error} */
export function useResults() {
  const [state, setState] = useState({ status: 'loading', q: null, raw: null, error: null });
  useEffect(() => {
    let alive = true;
    loadResults()
      .then(({ raw, q }) => alive && setState({ status: 'ready', q, raw, error: null }))
      .catch((error) => alive && setState({ status: 'error', q: null, raw: null, error }));
    return () => { alive = false; };
  }, []);
  return state;
}
