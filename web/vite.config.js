import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// The circuit data is served as static files from public/data (circuit.json, manifest.json, results/) and fetched
// at run time, so it never enters the JavaScript bundle. fixtures.json is only for the parity tests: it stays in
// public/data (where the exporter writes it and the tests read it) but is removed from the built site.
function dropTestFixtures() {
  let outDir = null;
  return {
    name: 'kenyon-drop-test-fixtures',
    apply: 'build',
    configResolved(config) {
      // the output directory as Vite resolved it (against the project root, not the shell's working directory),
      // so `vite build web` from the repository root drops the file too
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (outDir) rmSync(resolve(outDir, 'data', 'fixtures.json'), { force: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), dropTestFixtures()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    // the minifier drops the bundled libraries' licence banners, so their licences ship as one file instead
    license: { fileName: 'third-party-licenses.md' },
    // three.js is most of the 3D view's lazily loaded chunk (about 580 kB before gzip); the entry stays small
    chunkSizeWarningLimit: 650,
  },
});
