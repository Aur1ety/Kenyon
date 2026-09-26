// What the data export checked before the page could use it (public/data/manifest.json), loaded once and shared by
// "What I built" and the credits.

import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL || '/';
let pending = null;

function loadManifest(fetchImpl = globalThis.fetch) {
  if (!pending) {
    pending = fetchImpl(`${BASE}data/manifest.json`).then((r) => (r.ok ? r.json() : null));
    pending.catch(() => { pending = null; }); // a later mount may retry
  }
  return pending;
}

/** The parsed manifest, or null while it loads (and if it cannot be read). */
export function useManifest() {
  const [m, setM] = useState(null);
  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((j) => alive && setM(j))
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return m;
}
