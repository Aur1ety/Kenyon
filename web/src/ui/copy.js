// The words of the default view: everything a visitor reads without opening "For scientists". Plain words come
// first; the technical names live in the glossary (glossary() below) and in the "For scientists" part of the page.
//
// No number is typed here. Every function takes its numbers already formatted, from the engine, the circuit or a
// stored results file. tests/copy.test.js checks this file: no bare abbreviations, none of the banned phrases, and a
// reading ease a general adult reads easily (Flesch 60 or higher).

import { STATUS, STATUS_MEANING } from '../engine/status.js';

/** Nouns for the sense in use. The Smell / Sight switch lives under "For scientists"; smell is the default. */
export function nouns(visual) {
  return visual
    ? { one: 'object', One: 'Object', a: 'an object', many: 'objects', Many: 'Objects', channels: 'sight channels', input: 'sight-input neurons' }
    : { one: 'smell', One: 'Smell', a: 'a smell', many: 'smells', Many: 'Smells', channels: 'smell channels', input: 'smell-input neurons' };
}

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** 1 -> "one lesson", 3 -> "3 lessons". */
export const lessonsText = (n) => (n === 1 ? 'one lesson' : `${n} lessons`);
/** 1 -> "1 lesson learned", 3 -> "3 lessons learned" (the 3D caption). */
export const lessonsLearned = (n) => `${n} lesson${n === 1 ? '' : 's'} learned`;

/** The honesty labels in plain words. The technical label stays in the tooltip and under "For scientists". */
export const PLAIN_STATUS = {
  [STATUS.CALIBRATION]: 'set by me',
  [STATUS.WIRING]: 'decided by the wiring',
  [STATUS.NEGATIVE]: 'where it fails',
  [STATUS.FITTED]: 'tuned by me',
  [STATUS.MODELLED_CHOICE]: "the model's choice",
  [STATUS.CONTROL]: 'a check that could fail',
  [STATUS.RULE_CHANGE]: 'changed rule',
  [STATUS.QUOTED]: 'from the whole-brain model',
  'SET BY ME': 'set by me',
  'FROM THE SCAN': 'from the scan',
};

/** What each plain label means, in plain words (the badge's tooltip). */
export const PLAIN_MEANING = {
  [STATUS.CALIBRATION]: "A number I chose to match a real fly experiment. I don't count it as a result.",
  [STATUS.WIRING]: "Decided by the brain's wiring and a published learning rule. It could have come out wrong.",
  [STATUS.NEGATIVE]: "A place where the model fails, or can't test the idea. It sits next to the successes.",
  [STATUS.FITTED]: 'Its size comes from one setting I tuned to match real flies.',
  [STATUS.MODELLED_CHOICE]: "The model's choice, read from its output neurons. It is not a fly walking.",
  [STATUS.CONTROL]: 'Scramble part of the wiring and see if the result goes away. It does.',
  [STATUS.RULE_CHANGE]: 'A tweak to the published learning rule, shown only to explain a failure.',
  [STATUS.QUOTED]: 'From the saved results of the whole-brain model, not worked out on this page.',
  'SET BY ME': 'Chosen or tuned by me.',
  'FROM THE SCAN': 'Read straight from the brain scan.',
};

/** A badge's tooltip: the plain meaning, then the technical label and its meaning. */
export function badgeTitle(status, technical = false) {
  const tech = STATUS_MEANING[status];
  if (technical) return tech || PLAIN_MEANING[status];
  const plain = PLAIN_MEANING[status];
  if (!plain) return tech;
  return tech ? `${plain} Technical label: ${status}. ${tech}` : plain;
}

export const COPY = {
  skip: 'Skip to the model',
  navLabel: 'Sections',
  nav: [
    ['#lab', 'Try it'],
    ['#results', 'Results'],
    ['#built', 'What I built'],
    ['#science', 'For scientists'],
  ],
  brandLabel: 'Kenyon, back to the top',
  github: 'GitHub',

  hero: {
    eyebrow: 'Kenyon · interactive 3D brain model',
    h1: "Teach a model of a fly's memory circuit",
    lede: "This is a working model of how a fruit fly's brain learns, built from a real scan of its wiring. Teach it that a smell is bad, and watch it learn.",
    button: 'Try it',
    note: "It's a computer model built from one fly's scanned wiring, not a live fly.",
  },

  loading: 'Loading the brain wiring…',
  preparing: 'Getting the model ready…',
  needsData: 'The model needs the brain wiring, and it could not be loaded.',
  loadError: ({ error }) => `The brain wiring could not be loaded (${error}).`,

  caption: ({ name, nOn, lessons }) => `${cap(name)}: ${nOn} memory neurons on${lessons ? ` · ${lessons}` : ''}`,

  steps: {
    label: 'Teach the model, step by step',
    titles: ({ N }) => ['Teach it', `Test other ${N.many}`, 'Choice test'],
    details: 'The science behind this step',
    back: 'Back',
    startOver: 'Start over',
  },

  step1: {
    h: ({ N }) => `1 · Teach it that ${N.a} is bad`,
    lede: ({ N }) => `Pick ${N.a}, then punish it. The dots that light up in the 3D view are the memory neurons this ${N.one} switches on.`,
    pick: ({ N }) => `Pick ${N.a}`,
    chipTitle: ({ N, channels }) => `${cap(N.channels)}: ${channels}`,
    on: ({ name, nOn, nAll }) => `${cap(name)} switches on ${nOn} of the ${nAll} memory neurons.`,
    punish: ({ name }) => `Punish ${name}`,
    punishAgain: ({ name }) => `Punish ${name} again`,
    undo: 'Undo last lesson',
    bigLabel: ({ name }) => `${cap(name)}: change in its signal to the go-toward neuron`,
    sentence: ({ name, lessons, weaker }) => `After ${lessons}, ${name}'s signal to the go-toward neuron is ${weaker}.`,
    sentenceMixed: ({ name, lessons, weaker }) => `With ${lessons} learned so far, ${name}'s signal to the go-toward neuron is ${weaker}.`,
    soWhat: ({ name }) => `That neuron's signal counts as ‘go toward’. Weaker means the model now leans away from ${name}.`,
    setByMe: ({ target }) => `I tuned the learning speed so one lesson gives the same ${target} drop measured in a real fly experiment. So I don't count this number as a result.`,
    setByMeRepeat: ({ drop, lessons }) => `Extra lessons follow a fixed formula, so the ${drop} after ${lessons} is set by me too.`,
    setByMeMixed: ({ target }) => `I tuned the learning speed so one lesson on its own gives the ${target} drop measured in a real fly experiment. The other lessons since then changed it.`,
    wiring: ({ share }) => `${share} of all the change landed on the go-toward neuron. Where it lands is decided by the brain's wiring. It could have landed anywhere.`,
    next: ({ N }) => `Next: test other ${N.many}`,
  },

  step2: {
    h: ({ N }) => `2 · Test other ${N.many}`,
    empty: "Nothing has been punished yet, so there's no memory to test.",
    punishNow: ({ name }) => `Punish ${name} now`,
    lede: ({ N, trained }) => `Does the memory stick to ${trained}, or spread to other ${N.many}? Try a few. Memory neurons shared with ${trained} glow yellow.`,
    explain: ({ N, per, total }) => `Each ${N.one} in the model is a mix of ${per} ${N.channels}, out of ${total}, like ingredients in a recipe.`,
    different: ({ N }) => `Different ${N.many}`,
    similar: ({ trained }) => `Similar to ${trained}`,
    similarSub: ({ per }) => `Some of its channels are swapped for other ones. The number is how many of its ${per} it still shares.`,
    part: ({ trained }) => `Only part of ${trained}`,
    partSub: ({ per }) => `Some of its channels are missing, like catching only a whiff. The number is how many of its ${per} are left.`,
    punishedTag: 'punished',
    notA: 'The similar and partial smells are built around smell A. Punish smell A to try them.',
    bigLabel: ({ name }) => `${cap(name)}: change in its signal to the go-toward neuron`,
    sentence: ({ name, change, trained, trainedDrop, shared, nKc }) => `The signal from ${name} ${change}, against ${trainedDrop} for ${trained}. It shares ${shared} of ${trained}'s ${nKc} memory neurons.`,
    wiring: ({ N, target }) => `The more memory neurons two ${N.many} share, the more the memory spreads. Which ones they share is decided by the brain's wiring. How far it spreads also depends on the ${target} I set, and on how many memory neurons I let switch on.`,
    partial: "Part of a smell brings back only part of the memory. Signals flow one way through this circuit, so it can't fill in the rest. It was never a test it could pass.",
    summary: ({ N }) => `So it tells different ${N.many} apart well, and similar ones only partly.`,
    summaryDifferent: ({ N }) => `So far: it tells different ${N.many} apart well.`,
    trySimilar: 'Now try a similar smell below.',
    summarySimilar: ({ N }) => `So far: similar ${N.many} pick up part of the memory. Now try a different ${N.one} above.`,
    next: 'Next: the choice test',
  },

  step3: {
    h: ({ N }) => `3 · Choice test: toward the ${N.one}, or away?`,
    lede: ({ N, trained }) => `${cap(trained)} sits at the end of one arm of a T-shaped maze, and another ${N.one} at the other. Which one does the model pick?`,
    otherArm: 'Other arm:',
    armPunished: ({ name }) => `${cap(name)} (punished)`,
    start: 'start',
    figure: ({ other, p, trained, q }) => `The model picks ${other} ${p} of the time, and ${trained} ${q}.`,
    bigLabel: ({ other, trained }) => `picked ${other} over ${trained}`,
    sentence: ({ other, p, before }) => `Now the model picks ${other} ${p} of the time. Before any lesson it was ${before}.`,
    none: ({ N, other, before }) => `Nothing has been punished yet, so this is the model's natural preference: ${before} for ${other}. Punish ${N.a} in step 1 to change it.`,
    goStep1: 'Go to step 1',
    honest: "Which way it turns is decided by the wiring. How strongly it turns is one setting I tuned to match real flies. This is the model's choice, read from its output neurons. It is not a fly walking, and not the brain's movement neurons.",
    honestLink: "See what it can't do",
  },

  scene: {
    h: 'What the 3D view shows',
    resting: ({ N, nKc, nOther }) => `${nKc} memory neurons and ${nOther} other neurons, all at rest. Pick ${N.a} to start.`,
    active: ({ N, name, nOn, nIn }) => `${cap(name)} is on: ${nOn} memory neurons light up, fed by ${nIn} ${N.input} (the lines).`,
    change: ({ weaker }) => `Its signal to the go-toward neuron is ${weaker} than before any lesson.`,
    shared: ({ N }) => `Memory neurons shared with the punished ${N.one} glow yellow.`,
    tableLink: 'Every neuron group, as a table',
  },

  announce: {
    loaded: 'The brain model has loaded. Pick a smell to begin.',
    picked: ({ name, nOn }) => `${cap(name)}: ${nOn} memory neurons switch on.`,
    punished: ({ name, drop }) => `${cap(name)} punished. Its signal to the go-toward neuron fell by ${drop}, so the model now leans away from it. That size is set by me to match a real fly experiment.`,
    probed: ({ name, change, shared, trained, nKc }) => `${cap(name)}: signal ${change}. It shares ${shared} of ${trained}'s ${nKc} memory neurons.`,
    undone: 'Last lesson undone.',
    cleared: 'Memory cleared.',
  },

  results: {
    h: 'Results',
    lede: 'What the model shows, and where it falls short.',
    averages: ({ runs }) => `The big numbers are averages over ${runs} test runs of the model.`,
    oneRun: 'The saved averages could not be loaded, so these numbers come from one test run on this page.',
    labels: 'Each number carries a label, such as ‘set by me’ or ‘decided by the wiring’.',
    labelsLink: 'What the labels mean',
    showsH: 'What it shows',
    learnsH: 'It learns.',
    learnsUnit: 'of the change lands on the go-toward neuron',
    learns: ({ drop }) => `One lesson makes smell A's signal to the go-toward neuron ${drop} weaker. That neuron's signal counts as ‘go toward’, so the model now turns away from smell A.`,
    learnsTags: ({ drop }) => ['where it lands: decided by the wiring', `the ${drop}: set by me to match a real fly experiment`],
    apartH: 'It tells different smells apart, and similar ones only partly.',
    apartUnit: 'signal lost by other smells',
    apart: ({ other, drop, shared, per, similar }) => `Other smells lose only ${other} of their signal, against ${drop} for smell A. A smell that shares ${shared} of smell A's ${per} channels (its ingredients) loses ${similar}.`,
    apartTag: 'which neurons they share: decided by the wiring',
    failsH: 'It fails in places.',
    failsUnit: 'of the first memory kept',
    fails: 'A second bad memory wipes out most of the first, and part of a smell brings back only part of the memory.',
    failsLink: "See what it can't do",

    limitsH: "What it can't do",
    limitsLede: 'A model that only succeeds tells you little. Here is where this one falls short.',
    overwriteH: 'It forgets the first memory when a second lands in the same place.',
    overwrite: ({ kept }) => `Teach it that smell A is bad, then smell B. Smell A keeps only ${kept} of its memory. Real flies can hold several. The published learning rule I used causes this.`,
    partialH: "It can't fill in a partial smell.",
    partial: ({ part, per, recall }) => `Give it part of smell A (${part} of its ${per} channels), and only ${recall} of the memory comes back. Signals flow one way here, so it can't fill in the rest.`,
    partialTry: 'Try it in step 2',
    bodyH: 'It barely moves the body.',
    body: ({ nDN, nAbove, threshold, max }) => `I ran the memory through a model of the whole brain. Only ${nAbove} of its ${nDN} movement-command neurons change by more than ${threshold}, the larger by ${max}. That is too faint to count as moving the body.`,
    details: 'Details for scientists',
    footnote: ({ per }) => `Also: the smells are made up (random mixes of ${per} channels), the model on this page has no sense of time, and the size of the memory is set by me.`,
    footnoteLink: 'The full list is under For scientists.',
  },

  built: {
    h: 'What I built',
    introBefore: 'Kenyon grew out of my earlier project, ',
    introLink: 'DOOM-x-Fly',
    introAfter: ', where the same brain scan, run as a network, plays the first level of Doom. This half is about memory.',
    items: {
      scan: {
        h: 'Brain scan to working model',
        text: ({ nodes, edges, nCircuit }) => `I turned a public scan of a fruit fly's whole brain (the MaleCNS dataset, from the Janelia Research Campus and Google) into a working simulation: ${nodes} neurons and ${edges} connections. This page draws ${nCircuit} of those neurons, wired exactly as the scan shows, and runs the memory circuit among them live.`,
      },
      parity: {
        h: 'Exact-match testing, Python to browser',
        text: ({ cases, sets, rows }) => `The research model is written in Python. I rebuilt it in JavaScript so it runs live in your browser, and I test that the two agree: ${cases} saved test cases from the Python model replay here, and all ${sets} sets of active neurons match exactly. A second, independent engine checks the same cases. The wiring is checked again against all ${rows} rows of the scan's connection table, and a deploy fails if any test fails.`,
      },
      view: {
        h: '3D visualisation',
        text: 'Almost every neuron is drawn at its own spot in the scan, with three.js and custom WebGL shaders. Signals animate as you teach it. It works with a keyboard, respects reduced-motion settings, and has a text version for screen readers.',
      },
      honest: {
        h: 'Honest reporting',
        text: 'Each finding is labelled: set by me, or decided by the wiring. Failures sit next to successes. Two rounds of code review aimed at breaking it found real bugs, and each fix is written up in the report.',
      },
    },
    stack: 'Built with Python, PyTorch, JavaScript, React, three.js (WebGL), Vite, Vitest and pytest. Deployed on Vercel.',
    code: 'Code on GitHub',
    writeup: 'Read the full write-up',
  },

  science: {
    h: 'For scientists',
    lede: 'The technical names, every number with its source file, the full list of limits, and the whole-brain test.',
    show: 'Show the science',
    hide: 'Hide the science',
  },

  footer: {
    what: "Kenyon · a computer model built from a fly's scanned wiring, not a recording of a fly",
    scan: 'brain scan: MaleCNS v1.0, a fruit-fly brain map from the Janelia Research Campus and Google,',
    licence: 'CC BY 4.0',
    source: 'source code',
    licences: 'third-party licences',
  },
};

/**
 * The glossary: plain word, technical name, one line. Shown under "For scientists" as a table. Numbers come from
 * the circuit (c), the stored results (q) and the engine's constants (k); '…' until they load.
 */
export function glossary({ c, q, k }) {
  const W = '…';
  const n = (x) => (x == null ? W : x);
  const mbonTypes = c ? new Set(c.mbon.type).size : null;
  const ppl1 = c ? c.dan.family.filter((f) => f === 'PPL1').length : null;
  return [
    ['brain scan (wiring map)', 'connectome: MaleCNS v1.0 (HHMI Janelia Research Campus and Google Research, CC BY 4.0)', "A map of one fly's neurons and every connection between them. The model is wired exactly as it says."],
    ['memory circuit', 'mushroom body', 'The part of the fly brain where smell memories are stored. This page runs it live.'],
    ['memory neurons', 'Kenyon cells (KCs)', `${n(k.kc)} neurons. Each smell switches on a small set of them, and the memory is written on their connections.`],
    ['smell-input neurons', 'olfactory projection neurons (uniglomerular, excitatory PNs)', `The ${n(k.pn)} neurons that carry a smell to the memory neurons.`],
    ['smell channels', 'glomeruli', `The fly sorts smells into channels. Each made-up smell here uses ${n(k.per)} of the model's ${n(k.glom)}.`],
    ['sight-input neurons / sight channels', 'visual projection neurons (VPNs) / visual projection-neuron types', `The same idea for vision: ${n(k.vpn)} neurons that reach the memory neurons, in ${n(k.vch)} channel types.`],
    ['output neurons', `mushroom-body output neurons (MBONs), ${n(k.mbon)} cells of ${n(mbonTypes)} types`, 'They read the memory neurons and pass the result on to the rest of the brain.'],
    ['the go-toward neuron', `MBON11 (MBON-γ1pedc>α/β), ${n(k.mbon11)} cells, one per side; GABA, so it counts as approach`, `An output neuron whose signal counts as ‘go toward’ (by the transmitter rule of thumb below). One punishment lesson weakens the punished smell's signal to it by ${n(k.target)}, and that is how the model learns to stay away. In this model, punishment is the PPL1-γ1pedc signal only, which lands here.`],
    ['punishment signal', `PPL1-γ1pedc dopamine neurons (PPL101), ${n(k.punish)} cells; part of the ${n(ppl1)}-cell PPL1 group`, 'Dopamine neurons that fire with the punishment. They weaken the connections of whichever memory neurons are on.'],
    ['reward signal', `PAM dopamine neurons, ${n(k.reward)} cells`, 'Dopamine neurons that fire with the reward. They act on other output neurons.'],
    ['brake neuron', `APL (anterior paired lateral) neuron, ${n(k.apl)} cells`, `It quiets the memory neurons so only a few stay on. It is drawn in 3D; in the model a top-${n(k.sparsity)} rule stands in for it.`],
    ['only the top few switch on', 'k-winners-take-all on the drivable Kenyon cells (a binary, sparse code)', `A setting chosen by me: the ${n(k.sparsity)} most-driven memory neurons are on, the rest off.`],
    ['lesson', 'one pairing block (odour plus dopamine; conditioning)', 'A smell given together with the punishment or the reward signal.'],
    ['learning speed', `learning rate (lr), set so one pairing gives the ${n(k.target)} of Hige et al. 2015`, "How much one lesson changes the connections. I chose it, so I don't count the size of a memory as a result."],
    ['published learning rule', 'Gkanias, McCurdy, Nitabach and Webb 2022 (eLife): the dopamine rule on Kenyon-cell-to-MBON synapses', 'The rule, taken from the literature, that decides how a lesson changes connections.'],
    ['the same place (memory zone)', 'compartment', 'A patch where one dopamine group meets one set of output neurons. Two memories in the same patch interfere.'],
    ['spread to similar smells', 'generalisation (glomerulus and Kenyon-cell overlap)', 'A smell that shares memory neurons with the punished one picks up part of its memory.'],
    ['filling in a partial smell', 'pattern completion', "Recalling the whole memory from part of the smell. This one-way circuit can't."],
    ['signals flow one way', 'feedforward circuit', 'Smell input to memory neurons to output neurons, with no loops back.'],
    ['choice test', 'T-maze (Tully and Quinn 1985)', 'Which arm does the model pick? Two arms, one smell each.'],
    ['choice score', `reciprocal T-maze performance index (wild type ${n(k.wild)})`, 'Zero means no preference. Higher means it avoids the punished smell more often.'],
    ['choice-strength setting', `motor gain β (${n(k.betaTables)} in the tables, ${n(k.betaWalk)} in the walkthrough and video)`, 'One number I tuned so the choice score lands in the range measured in normal flies.'],
    ["'go toward' / 'stay away'", 'valence, by transmitter (Aso et al. 2014): GABA or acetylcholine means approach, glutamate means avoid', 'A rule of thumb from the literature that turns output neurons into a choice.'],
    ['set by me', `CALIBRATION (learning rate set so one pairing gives the ${n(k.target)} of Hige et al. 2015)`, "A number I chose. I don't count it as a result."],
    ['decided by the wiring', 'WIRING (the scanned wiring plus the published rule)', 'It could have come out wrong. This is what the model actually predicts.'],
    ["tuned by me / the model's choice", 'FITTED / MODELLED CHOICE', "Direction from the wiring, size from one tuned number. A readout of the model, not a fly's behaviour."],
    ['a check that could fail', 'CONTROL (for example the dopamine-to-MBON map shuffled)', 'Scramble part of the wiring and see if the result goes away. It does.'],
    ['changed rule', 'RULE CHANGE (recovery term switched off)', 'A tweak to the published rule, shown only to explain a failure, not as a fix.'],
    ['from the whole-brain model', 'QUOTED (results/*.json)', 'Read from the saved results of the whole-brain model, not worked out on this page.'],
    ['movement-command neurons', `descending neurons (DNs), ${n(q?.motor.nDN)} in the unpruned graph`, 'The cells that carry commands from the brain to the body.'],
    ['whole-brain model', `recurrent rate model from DOOM-x-Fly (${n(k.nodes)} neurons unpruned; ${n(k.nodesV5)} in the five-synapse Doom graph)`, 'A simulation of the whole scanned brain, where signals loop back. Used for the body test, and to show why the memory neurons are computed separately.'],
    ['contact points', 'synapses', 'Where one neuron passes a signal to the next. The scan counts them.'],
    ['made-up smells', `synthetic odours: ${n(k.perWord)} random glomeruli each, antennal lobe bypassed`, "Test smells are random mixes of channels. The nose's first processing stage is skipped."],
    ['test runs (repeat runs)', `independent odour draws (seeds), ${n(q?.seeds.n)} of them; mean ± SD`, 'The same test with fresh sets of random smells, to show how much results vary.'],
  ];
}
