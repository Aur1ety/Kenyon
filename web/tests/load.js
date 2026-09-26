// Test helpers: read the exported data from public/data (no network, no browser).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { prepareCircuit } from '../src/engine/circuit.js';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'public', 'data');

export const readJson = (name) => JSON.parse(readFileSync(join(dataDir, name), 'utf8'));

let circuitCache = null;
export function circuit() {
  if (!circuitCache) circuitCache = prepareCircuit(readJson('circuit.json'));
  return circuitCache;
}

let fixturesCache = null;
export function fixtures() {
  if (!fixturesCache) fixturesCache = readJson('fixtures.json');
  return fixturesCache;
}
