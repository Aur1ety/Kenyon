// The stored result files the page cites: the copies must be the repository's own files, the values the page
// reads from them must be the README's, and the engine's live numbers must agree with them.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESULT_FILES } from '../src/ui/resultFiles.js';
import { extractResults } from '../src/ui/extractResults.js';
import { computeHeadlines, HIGE_CHARGE_DROP } from '../src/engine/index.js';
import { circuit } from './load.js';

const here = dirname(fileURLToPath(import.meta.url));
const copies = join(here, '..', 'public', 'data', 'results');
const originals = join(here, '..', '..', 'results');
const videoCopy = join(here, '..', 'public', 'media', 'mb_memory.mp4');
const videoOriginal = join(here, '..', '..', 'media', 'mb_memory.mp4');

const raw = Object.fromEntries(
  Object.entries(RESULT_FILES).map(([k, f]) => [k, JSON.parse(readFileSync(join(copies, f), 'utf8'))]),
);
const q = extractResults(raw);

describe('stored result files', () => {
  it.skipIf(!existsSync(originals))('are byte-identical copies of results/ (run npm run sync-results)', () => {
    for (const f of Object.values(RESULT_FILES)) {
      const a = readFileSync(join(copies, f));
      const b = readFileSync(join(originals, f));
      expect(a.equals(b), f).toBe(true);
    }
  });

  it.skipIf(!existsSync(videoOriginal))('ship the video as a byte-identical copy of media/ (run npm run sync-results)', () => {
    expect(readFileSync(videoCopy).equals(readFileSync(videoOriginal))).toBe(true);
  });

  it('give the README ten-draw spreads', () => {
    const s = q.seeds;
    expect(s.n).toBe(10);
    expect(s.paired.mean).toBe(0.9);
    expect(s.unpaired.mean.toFixed(2)).toBe('0.09');
    expect(s.unpaired.sd.toFixed(2)).toBe('0.03');
    expect(s.worst.mean.toFixed(2)).toBe('0.21');
    expect(s.share.mean.toFixed(2)).toBe('0.96');
    expect(s.ladder.map((l) => l.shared)).toEqual([5, 4, 3, 1, 0]);
    expect(s.ladder.map((l) => l.mean.toFixed(2))).toEqual(['0.60', '0.41', '0.29', '0.12', '0.05']);
    expect(s.coexistA.mean.toFixed(2)).toBe('0.85');
    expect(s.coexistC.mean.toFixed(2)).toBe('0.70');
    expect(s.retained.mean.toFixed(2)).toBe('0.19');
    expect(s.retained.sd.toFixed(2)).toBe('0.06');
    expect(s.visual.unpaired.mean.toFixed(2)).toBe('0.18');
    expect(s.visual.unpaired.sd.toFixed(2)).toBe('0.12');
  });

  it('give the README negatives and the choice numbers', () => {
    expect(q.behaviour.wildType).toEqual([0.44, 0.53]);
    expect(q.behaviour.piTenPairs['8'].mean.toFixed(2)).toBe('0.34');
    expect(q.shuffled.piSeed0['8'].toFixed(2)).toBe('0.02');
    expect(q.shuffled.punishTypes).toEqual(['MBON10']);
    expect(q.recall.slope.toFixed(2)).toBe('0.83');
    expect(q.magnitude.trace.toFixed(2)).toBe('0.71');
    expect(q.magnitude.measured.toFixed(2)).toBe('0.74');
    expect(q.magnitude.sem.toFixed(2)).toBe('0.30');
    expect(q.magnitude.separates).toBe(false);
    expect(q.apl.uniformAtLeastAsDistinct).toBe(9);
    expect(q.apl.nSeeds).toBe(10);
    expect(q.sparse.activeRange.map((x) => Math.round(100 * x))).toEqual([85, 100]);
    expect(q.sparse.nAllOff).toBe(2);
    expect(q.lesion.nRows).toBe(6);
    expect(q.lesion.nIdentities).toBe(3);
    expect(q.pathway.pctModulated.toFixed(4)).toBe('0.0003');
    // RESULTS 2.3: vision's index and the innate preference that caps it
    expect(q.behaviourVisual.piTenPairs['8'].mean.toFixed(2)).toBe('0.20');
    expect(q.behaviourVisual.innateBias['8'].mean.toFixed(2)).toBe('0.31');
    expect(q.behaviourVisual.innateBiasSmell['8'].mean.toFixed(2)).toBe('0.05');
    expect(q.behaviourVisual.corrWithBias['8'].toFixed(2)).toBe('-0.92');
    expect(q.behaviourVisual.scoreShift.mean.toFixed(2)).toBe('0.10');
    expect(q.recall.byCue.find((c) => c.cue === '3/6').recall.toFixed(2)).toBe('0.50');
  });

  it('give the body effect of RESULTS 4.8: faint, two cells, nine synapses', () => {
    const m = q.motor;
    expect(m.nDN).toBe(1314);
    expect(m.nDNv5).toBe(1312);
    expect(m.nAbove).toBe(2);
    expect(m.nAboveV5).toBe(0);
    expect(m.nAbove5pct).toBe(0);
    expect(m.movers[0].key).toBe('DNp52 L');
    expect(m.movers[1].key).toBe('DNp62 R');
    expect((100 * m.maxFrac).toFixed(1)).toBe('2.8');
    expect((100 * m.movers[1].frac).toFixed(2)).toBe('0.91');
    expect(m.movers[2].key).toBe('DNg104 R'); // the third largest by share, as the per-cell file confirms (RESULTS 4.8)
    expect((100 * m.p95Max).toFixed(3)).toBe('0.063'); // "95% move by less than 0.07%" (RESULTS 4.8)
    expect(m.synapses).toBe(9);
    expect(m.contacts.map((c) => c.synapses)).toEqual([4, 4, 1]);
    expect(m.synapsesV5).toBe(0);
    expect(m.moversCut.find((x) => x.key === 'DNp52 L')).toBeUndefined();
    expect(m.crossDrawCos.toFixed(4)).toBe('0.9999');
    expect(Math.round(m.specificity)).toBe(13);
  });
});

describe('the engine agrees with the stored results', () => {
  const h = Object.fromEntries(computeHeadlines(circuit()).items.map((i) => [i.id, i]));

  it('calibration target and the one-draw numbers', () => {
    expect(HIGE_CHARGE_DROP).toBe(q.seeds.paired.mean);
    expect(h.paired_drop.value).toBeCloseTo(q.seeds.paired.mean, 6);
    // the page's draw (seed 0) is one of the ten draws
    expect(h.unpaired_drop.value).toBeGreaterThanOrEqual(q.seeds.unpaired.min - 1e-4);
    expect(h.unpaired_drop.value).toBeLessThanOrEqual(q.seeds.unpaired.max + 1e-4);
    expect(h.tmaze.value[8]).toBeCloseTo(q.behaviour.piSeed0['8'], 4);
    expect(h.shuffled_map_control.value[1]).toBeCloseTo(q.shuffled.piSeed0['8'], 4);
    expect(h.shuffled_map_control.punishLandsOn).toEqual(q.shuffled.punishTypes);
    expect(h.reward.rewardCompartments).toEqual(q.behaviour.rewardTypes);
    for (const [k, [before, after]] of Object.entries(q.behaviour.choices)) {
      expect(h.multi_memory_choices.value[k][0]).toBeCloseTo(before, 3);
      expect(h.multi_memory_choices.value[k][1]).toBeCloseTo(after, 3);
    }
    expect(h.lesion_APL.value[0]).toBeCloseTo(q.lesion.intactUnpaired, 4);
    expect(h.lesion_APL.value[1]).toBeCloseTo(q.lesion.aplUnpaired, 4);
    expect(h.lesion_KCgm.value).toBeCloseTo(q.lesion.kcgmShiftFrac, 3);
    // the engine's gains are the stored runs' gains
    expect(h.lesion_KCgm.beta).toBe(q.lesion.beta);
    expect(h.multi_memory_choices.beta).toBe(q.behaviour.choiceBeta);
    expect(h.shuffled_map_control.beta).toBe(q.behaviour.choiceBeta);
    // no pattern completion, in the stored run and on the page: recall equals the Kenyon-cell overlap
    // (the page's 3-of-6 cue is the fixtures' subset, not recall.py's, so the two values differ)
    for (const c of q.recall.byCue) expect(Math.abs(c.recall - c.overlap)).toBeLessThan(0.002);
    expect(Math.abs(h.partial_cue.recallFraction - h.partial_cue.overlap)).toBeLessThan(1e-6);
  });
});
