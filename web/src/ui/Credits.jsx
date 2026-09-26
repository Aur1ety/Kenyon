import { REPO, repoFile } from './site.js';
import { pct, int } from './format.js';
import { HIGE_CHARGE_DROP } from '../engine/index.js';

export { REPO };

const BASE = import.meta.env.BASE_URL || '/';

const REFS = [
  ['MaleCNS v1.0 connectome', 'HHMI Janelia Research Campus and Google Research, licensed under CC BY 4.0. Every cell, position and synapse count on this page is derived from it.', 'https://male-cns.janelia.org/', { text: 'CC BY 4.0', href: 'https://creativecommons.org/licenses/by/4.0/' }],
  ['Hige et al. 2015, Neuron', `One pairing depresses the paired odour’s drive onto MBON-γ1pedc by about ${pct(HIGE_CHARGE_DROP)}: the calibration target.`, null],
  ['Aso et al. 2014, eLife', 'The MBON transmitter predicts valence (the choice’s rule of thumb); the KCg-m lesion.', null],
  ['Gkanias, McCurdy, Nitabach and Webb 2022, eLife', 'The dopamine learning rule on Kenyon-cell-to-MBON synapses.', null],
  ['Owald et al. 2015, Neuron', 'Reward also works by depression, in the PAM compartments.', null],
  ['Tully and Quinn 1985', 'The reciprocal T-maze and its performance index.', null],
  ['Lin et al. 2014, Nature Neuroscience', 'Without APL inhibition, memories lose their odour specificity.', null],
];

function provenance(m) {
  if (!m) return null;
  const order = m.cell_order_check;
  const checks = order ? Object.values(order.checks) : [];
  const release = Object.values(m.inputs || {}).filter((x) => 'matches_release_SHA256SUMS' in x);
  const ref = m.reference_engine_check;
  return [
    order && `Cell order proved: ${checks.filter(Boolean).length} of ${checks.length} wiring blocks rebuilt exactly from ${int(order.weights_rows_read)} rows of the connectome's weights table.`,
    release.length && `${release.filter((x) => x.matches_release_SHA256SUMS).length} of ${release.length} connectome files match the release checksums.`,
    ref && `An independent reference engine replayed ${ref.scenarios} scenarios with ${ref.kc_set_mismatches} Kenyon-cell-set mismatches of ${ref.kc_sets_checked}.`,
  ].filter(Boolean);
}

/** Data, sources and code. `manifest` is data/manifest.json (ui/useManifest.js), shared with "What I built". */
export default function Credits({ manifest }) {
  const prov = provenance(manifest);
  return (
    <section id="credits" className="section section--sub section--credits" aria-labelledby="credits-h">
      <div className="section__inner">
        <p className="eyebrow">Credits</p>
        <h3 id="credits-h" className="section__h">Data, sources and code</h3>
        <ul className="refs">
          {REFS.map(([t, d, href, licence]) => (
            <li key={t}>
              <strong>{href ? <a href={href} rel="noopener noreferrer" target="_blank">{t}</a> : t}</strong>
              <span>
                {licence ? (
                  <>
                    {d.split(licence.text)[0]}
                    <a href={licence.href} rel="noopener noreferrer license" target="_blank">{licence.text}</a>
                    {d.split(licence.text).slice(1).join(licence.text)}
                  </>
                ) : d}
              </span>
            </li>
          ))}
        </ul>
        <div className="links">
          <a className="btn" href={REPO} rel="noopener noreferrer" target="_blank">Code and data on GitHub</a>
          <a className="btn" href={repoFile('docs/RESULTS.md')} rel="noopener noreferrer" target="_blank">The full write-up (RESULTS.md)</a>
          <a className="btn" href={`${REPO}#readme`} rel="noopener noreferrer" target="_blank">README</a>
        </div>
        {prov && prov.length > 0 && (
          <div className="provenance">
            <h4 className="provenance__h">How the page&apos;s data was checked</h4>
            <ul className="list">
              {prov.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <p className="small muted">
              From <a href={`${BASE}data/manifest.json`}>data/manifest.json</a>, written by{' '}
              <a href={repoFile('web/scripts/export_web_data.py')} rel="noopener noreferrer" target="_blank">web/scripts/export_web_data.py</a>.
            </p>
          </div>
        )}
        <p className="small muted">
          The recurrent brain model and the data import come from the author&apos;s earlier project DOOM-x-Fly. The
          import&apos;s node and edge policy matches doomfly (nftechie/doomfly), so its row counts can be checked against
          doomfly&apos;s ledger. The page&apos;s engine re-implements the feedforward model of kenyon/model/mushroom_body.py
          in the browser and is tested against its outputs; the full list of references is in the write-up. The page
          bundles React, three.js and the IBM Plex and Space Grotesk fonts; their licences are in{' '}
          <a href={`${BASE}third-party-licenses.md`}>third-party-licenses.md</a>.
        </p>
      </div>
    </section>
  );
}
