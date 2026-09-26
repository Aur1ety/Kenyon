// The default view's words (src/ui/copy.js) are for a reader with no biology: no bare abbreviations or jargon, the
// model never passed off as a live fly, and a reading ease a general adult reads easily (Flesch 60 or higher).
// The technical names are allowed only under "For scientists", which does not read from COPY.
import { describe, it, expect } from 'vitest';
import { COPY, PLAIN_STATUS, PLAIN_MEANING, nouns } from '../src/ui/copy.js';

// Realistic values for every placeholder the copy uses; a missing one shows up as "undefined" and fails below.
const sample = (visual) => ({
  N: nouns(visual),
  name: visual ? 'object A' : 'smell A',
  trained: visual ? 'object A' : 'smell A',
  other: visual ? 'object B' : 'smell B',
  target: '90%', drop: '90%', share: '97%', weaker: '90% weaker', change: 'fell by 6%', trainedDrop: '90%',
  lessons: 'one lesson', nOn: '188', nAll: '4,064', nKc: '188', nIn: '28', nOther: '903', shared: '10',
  per: '6', total: '50', channels: 'DA2, DL2v, DL5, V, VA4, VL1', p: '74%', q: '26%', before: '50%',
  kept: '17%', keptMean: '19%', runs: '10', part: '3', recall: '42%', nDN: '1,314', nAbove: '2',
  threshold: '0.5%', max: '2.8%', contacts: '9', similar: '67%', nodes: '144,981', edges: '19.5 million',
  nCircuit: '4,967', cases: '21', sets: '124', rows: '151.9 million', error: 'network error',
});

/** Every string in COPY, with each function called on the sample values (smell and sight). */
function collect(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (typeof node === 'function') {
    for (const visual of [false, true]) collect(node(sample(visual)), out);
  } else if (Array.isArray(node)) node.forEach((x) => collect(x, out));
  else if (node && typeof node === 'object') Object.values(node).forEach((x) => collect(x, out));
  return out;
}

const texts = [...collect(COPY), ...Object.values(PLAIN_STATUS), ...Object.values(PLAIN_MEANING)];
const all = texts.join('\n');

function syllables(token) {
  if (/\d/.test(token)) return 3; // a number read aloud ("ninety percent")
  return token.split('-').reduce((n, part) => {
    let w = part.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return n;
    if (w.length <= 3) return n + 1;
    w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return n + Math.max(1, m ? m.length : 0);
  }, 0);
}

/** Flesch reading ease. A string with no end punctuation (a heading, a label, a button) counts as one sentence. */
function readingEase(strings) {
  let sentences = 0, words = 0, syl = 0;
  for (const s of strings) {
    const parts = s.split(/(?<=[.!?])\s+/).filter((x) => /[A-Za-z0-9]/.test(x));
    sentences += parts.length;
    for (const tok of s.match(/[A-Za-z0-9][A-Za-z0-9'’%,.-]*[A-Za-z0-9%]|[A-Za-z0-9]/g) || []) {
      words += 1;
      syl += syllables(tok);
    }
  }
  return 206.835 - 1.015 * (words / sentences) - 84.6 * (syl / words);
}

describe('the default view speaks plainly', () => {
  it('fills every placeholder', () => {
    expect(all).not.toMatch(/undefined|null|NaN|\[object/);
  });

  it('uses no bare abbreviations or Greek letters', () => {
    const bare = /\b(MBONs?|MBON11|KCs?|PNs?|VPNs?|PPL1|PPL101|PAM|APL|DNs?)\b|β|\bbeta\b/;
    for (const t of texts) expect(t, t).not.toMatch(bare);
  });

  it('uses no biology jargon (it lives under "For scientists")', () => {
    const jargon = /glomerul|Kenyon cell|\bodou?rs?\b|T-maze|connectome|mushroom|calibrat|synap|dopamine|descending|projection neuron|valence|feedforward|recurrent|compartment|pairing|pattern completion|generali[sz]/i;
    for (const t of texts) expect(t, t).not.toMatch(jargon);
  });

  it('never passes the model off as a live fly', () => {
    const fly = /\bthe fly(?:'s)? (?:learns|learned|learnt|avoids|walks|remembers|chooses|picks|decides|prefers|knows|forgets|turns)\b/i;
    for (const t of texts) expect(t, t).not.toMatch(fly);
  });

  it('reads easily (Flesch reading ease 60 or higher)', () => {
    const score = readingEase(texts);
    expect(score).toBeGreaterThanOrEqual(60);
  });
});
