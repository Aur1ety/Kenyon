# Results: a fruit-fly memory circuit built from its own connectome (2026-09-16 to 2026-09-20)

**Where this came from.** The recurrent connectome model, the subgraph builder and the data import were first
built for [DOOM-x-Fly](https://github.com/Aur1ety/DOOM-x-Fly), where the MaleCNS subgraph, run unchanged, plays
the first level of Doom. The Doom results live there (its sections 1 to 6). This file is the memory half, which
was sections 7 to 10 of that write-up, moved here with its code, results and tests. "The Doom model" and "the Doom
subgraph" below mean that recurrent model and its five-synapse-threshold graph (`subgraph_v5.npz`), which
sections 3 and 4.8 reuse.

**Numbering.** Sections 7, 8, 9 and 10 of the DOOM-x-Fly write-up are sections 1, 2, 3 and 4 here, with the same
subsection numbers (7.4 is 1.4, 9.2 is 3.2, 10.8 is 4.8). Three stored outputs predate the move and still cite the
old numbers: `magnitude.json` ("sections 7 to 9"), `online.json` ("sections 7-9") and `pathway.json` ("section-9
finding", "Section 9"). `pathway.json` also still carries wording from before section 4.8, that the anatomy
"confirms ... that the memory does not reach the descending neurons". The module now claims only what 4.4 shows,
no memory-specific route to DNa02 or DNa03; the file has not been regenerated yet (that needs the connectome
files).

**Files.** Every result file named below is in `results/`; the pre-review files that section 1's introduction
and 3.2 mention as superseded are in `results/superseded/`. DOOM-x-Fly's `mb_*.py` modules are
`kenyon/experiments/*.py` here, with the circuit in `kenyon/model/mushroom_body.py`, the recurrent plasticity in
`kenyon/model/plasticity.py` and the cache builder in `kenyon/connectome/mb_build.py`. The builder's source hash
that the `olf5_*`, `vis5_*` and `beh5_*` files record (`build_source_sha` c82e39b4017c) is that of DOOM-x-Fly's
`flybrain/eval/mb_build.py` at commit 519d464, which built the cache they ran on; the moved copy here hashes
differently.

## 1. Memory in the fly's own mushroom body (2026-09-16/17)

Goal: not a memory bolted onto the model, but the fly's own memory circuit doing what it does in the animal:
learn that an odour predicts punishment or reward, keep several such memories, and let them change a choice.
Ground truth is published fly physiology and behaviour, fixed before the runs: Hige et al. 2015 (Neuron), one
pairing block of an odour with the PPL1-gamma1pedc dopamine neuron depresses that odour's drive onto
MBON-gamma1pedc>alpha/beta (MBON11) by about 80% in spikes and 90% in synaptic charge, the unpaired odour is
unchanged; Owald et al. 2015, reward also works by depression, in the PAM compartments; Aso et al. 2014, MBON
transmitter predicts valence; Tully and Quinn T-maze, wild-type single-cycle performance index 0.44 to 0.53.
Learning rule: Gkanias, McCurdy, Nitabach and Webb 2022 (eLife) on KC->MBON synapses only,
dW = -lr * delta_j * (k_i + W_ij - 1). Wiring comes from the full MaleCNS connectome (minconf 0.5, no weight
threshold), cached once by `kenyon/connectome/mb_build.py` (the cache records its build time and the builder's
source hash). Code: `kenyon/model/mushroom_body.py` (the circuit and the rule), `kenyon/experiments/olfactory.py`,
`kenyon/experiments/behaviour.py`; results in `results/olf5_*.json`, with the spread over ten independent odour
draws in `results/mb_seeds.json` (`kenyon/experiments/seeds.py`). The feedforward modules of sections 1, 2 and
4.1 to 4.6 run on the CPU in seconds to about a minute and a half each, and the ten-draw spread in about six
minutes. The recurrent runs (3.1, 3.2 and 4.8) also run on the CPU, slowly: about
an hour per condition for 3.1 and 3.2, about two hours per graph for 4.8. `tests/test_memory.py` guards the
defects listed below on a synthetic wiring cache, without the data.

Sections 1, 2 and 4 were regenerated after two adversarial code reviews, and the two section-3 modules were
rerun on the CPU after them on 2026-09-20 (`results/kcsparse2_*_cpu.json`, `results/embed2_cpu.json`; the
pre-review files they replace are kept in `results/superseded/`). The first review found a Kenyon-cell code that
drifted between the recurrent model's substeps and a k-winners-take-all threshold sized to the whole Kenyon-cell
pool rather than the driven subset. The second (2026-09-19, an automated eight-agent code review, every finding
independently re-verified) found that the generalisation tables had been read after eight pairings while labelled as one
(1.3, 2.2), that the section 3.1 decodability test could only ever return zero, that the visual pathway was
described as reaching one Kenyon-cell type when the cache reaches three (2.1), that two behavioural comparisons
between smell and vision said the opposite of what the outputs contain (2.3), that one table cell had no source
(3.2), and that several numbers rested on a single odour draw. All are fixed here and each correction is stated
where it applies.

### 1.1 Negative result: the Doom model's Kenyon cells cannot hold an odour

In the uniform, gain-matched recurrent rate model used for Doom, the 4,064 Kenyon cells respond to every input
the same way: with synthetic odours driving the projection neurons, every cell is active and every odour drives
nearly the same pattern (cross-odour cosine 0.999). Section 3.1 shows this properly (the fix for the drift bug
does not change it), and also that the odours can still be decoded from tiny rate differences: the information is
not gone, but the sparse code the plasticity rule needs is. The feedforward PN->KC drive alone gives that code;
the recurrent dynamics erase it. So the mushroom body is run as the circuit actually works: feedforward, with the
real Kenyon-cell physiology applied and disclosed.

### 1.2 The circuit, taken from the connectome

Projection neurons -> Kenyon cells -> MBONs, plus the dopamine -> MBON wiring, all from the full connectome:

| element | count |
|---|---|
| olfactory projection neurons (excitatory, uniglomerular; thermo/hygro VP glomeruli and GABAergic vPNs excluded) | 220 cells, 50 glomeruli |
| Kenyon cells | 4,064 (3,755 receive olfactory input) |
| MBONs | 97 cells, 37 types |
| plastic KC->MBON connections | 61,210 |
| PPL101 (punishment) -> MBON, pooled per type | lands on MBON11; 97% of all learning lands there |
| PAM (316 cells, reward) -> MBON | MBON03, 05, 06 lead |

Kenyon-cell physiology (disclosed): feedforward drive through the real PN->KC wiring, then k-winners-take-all
keeping the top 5% of the Kenyon cells this pathway can drive (a stand-in for the APL's feedback inhibition;
section 4.5 computes the code from the real APL loop instead and finds the APL sets only the sparseness
level). Result: 188 cells active per odour (5% of the 3,755 driven cells, 4.6% of all 4,064; the JSON field
`active_frac` uses the 4,064 denominator), cross-odour cosine 0.10 +- 0.01 over ten
odour draws (0.11 for the seed-0 draw the tables below quote), from the wiring alone. A "binary" reading (a
cell fires or not, the spike-count analogue) is the main condition; odours are synthetic glomerulus sets; one
rule call is one pairing block. Unless a row says otherwise, a table cell is the seed-0 draw and the spread in
brackets is mean +- SD over ten draws (`results/mb_seeds.json`).

### 1.3 What is calibrated and what is predicted

With a binary code the paired drop at an MBON after p pairings is exactly (1 - (1 - lr * delta)^p), so its size
is set by lr, not by the wiring. lr is set once so one pairing gives Hige's 90% at MBON11, and that number is a
calibration, not a result. Everything else follows from the wiring and the rule and can fail:

| endpoint (one pairing, odour A + PPL101, read at MBON11) | value | note |
|---|---|---|
| paired odour drop | 0.90 | calibrated to Hige |
| unpaired odours, mean | 0.13 (ten draws 0.09 +- 0.03) | = 0.9 x the fraction of the odour's MBON11 drive through KCs shared with A (that share is 0.145 here); Hige: unchanged |
| unpaired odours, the single worst odour of a draw | 0.30 (ten draws 0.21 +- 0.06) | in this draw two of the seven unpaired odours share enough Kenyon cells with A to lose a fifth or more of their drive; "unchanged" holds on average, not for every odour |
| share of all lost drive landing on MBON11 | 0.97 (0.96 +- 0.01) | Hige: compartment specific |
| reward (odour C + PAM), drop in PAM compartments / at MBON11 | 0.69 / 0.06 | Owald: reward depresses in PAM compartments |
| A punished and C rewarded together: A / C | 0.85 / 0.69 | two memories in different compartments coexist |

Generalisation follows glomerulus overlap (one pairing; with a binary code the drop is exactly 0.9 times the
share of the test odour's MBON11 drive that passes through A's Kenyon cells):

| test odour shares with A | 5/6 | 4/6 | 3/6 | 1/6 | 0/6 |
|---|---|---|---|---|---|
| drop at MBON11, seed 0 | 0.59 | 0.40 | 0.28 | 0.11 | 0.06 |
| ten draws | 0.60 +- 0.04 | 0.41 +- 0.04 | 0.29 +- 0.02 | 0.12 +- 0.02 | 0.05 +- 0.01 |

Correction (2026-09-19): an earlier version of this table read 0.65 / 0.45 / 0.31 / 0.12 / 0.06. The review
found those values were measured after the eight pairings of the pairing curve above, not after one, and are
the glomerulus overlap itself (the saturated limit). The code now reads the generalisation from the one-pairing
memory, and `tests/test_memory.py` checks it.

### 1.4 Controls that can fail

| condition | paired | unpaired | share on MBON11 | reading |
|---|---|---|---|---|
| real wiring, binary code (main) | 0.90 | 0.13 | 0.97 | specific |
| dopamine -> MBON map shuffled | 0.00 (lands on MBON10) | 0.00 | 0.01 | compartment is wiring-set |
| dense code (no k-winners-take-all) | 0.90 | 0.43 | 0.97 | sparse code gives specificity |
| ten independent odour draws (`seeds.py`) | 0.90 in every draw | 0.09 +- 0.03 (0.05 to 0.13) | 0.96 +- 0.01 | robust |
| degree-preserving PN->KC / KC->MBON shuffles | 0.90 | ~0.13 | ~0.97 | match; not a test, expected |

The clear negative: at the calibrated strength the published rule cannot hold two memories in the same
compartment, because every dopamine pulse also relaxes the synapses of silent Kenyon cells back toward rest
(after odour B is trained, A keeps 0.19 +- 0.06 of its memory, ten draws). Real flies do hold several. Scaling
that recovery term down (a rule change, disclosed) retains the first memory.

### 1.5 Does the memory change what the fly does?

Choice through the published valence map (71 approach MBONs, GABA or ACh; 26 avoidance, glutamate; MBON11 is
GABAergic, so depressing it removes approach). The transmitter of every MBON type is the connectome's consensus
call, unanimous across the cells of all 37 types, and agrees with Aso et al. 2014 for the types they assigned.
P(choose X over Y) = sigmoid(beta (s(X) - s(Y))). Reciprocal T-maze performance index by beta, one pairing:

| beta | 1 | 2 | 4 | 8 | 16 | 32 |
|---|---|---|---|---|---|---|
| index, seed-0 odour pair | 0.05 | 0.09 | 0.18 | 0.35 | 0.63 | 0.90 |
| index, ten independently drawn pairs | 0.04 +- 0.00 | 0.09 +- 0.01 | 0.17 +- 0.02 | 0.34 +- 0.03 | 0.59 +- 0.05 | 0.85 +- 0.06 |

The wild-type 0.44 to 0.53 is met near beta 10 to 11 (the walkthrough and video use 11). Beta is fitted; the
sign and ordering are not. The untrained index is not a control: under the reciprocal design it is 0 by
construction for any circuit. What matters is the untrained circuit's innate preference between the two
odours, which for smell is small (|bias| 0.05 +- 0.04 at beta 8) and does not limit the index. The size of what
one pairing writes, free of beta and of the pair drawn, is the drop in the punished odour's approach score:
0.10 +- 0.01 over the ten pairs. Correction (2026-09-19): an earlier version quoted 0.05 / 0.10 / 0.20 / 0.38 /
0.62 at beta 1 / 2 / 4 / 8 / 16; the output (`beh5_olf.json`) reads 0.05 / 0.09 / 0.18 / 0.35 / 0.63, and the
earlier "untrained 0 at every beta" was the tautology above.

Several memories change choices in the right order without fitting: A punished, C rewarded, D untouched give
P(C over A) 0.48 -> 0.82, P(D over A) 0.50 -> 0.70, P(C over D) 0.49 -> 0.67. With the dopamine-to-MBON map
shuffled the same training gives P(C over A) 0.48 -> 0.34, P(D over A) 0.50 -> 0.48, P(C over D) 0.49 -> 0.36,
and the index at beta 8 falls from 0.35 to 0.02 (`beh5_olf_shufdan.json`). The two effects have different
causes. Under this shuffle the punishment lands on MBON10 (`olf5_shufdan.json`), whose output cells carry the
same approach sign as MBON11 but weigh far less in A's score: the punished odour's score shift collapses from
0.10 to 0.005 while keeping its sign (the index stays positive, just tiny). The reward moves from MBON03/05/06
(glutamate, avoidance) to MBON12/16/25-like, where most of the depression falls on approach-sign cells, so
rewarding C lowers C's approach score and C now loses to A and to D; D against A barely moves. Correction
(2026-09-19): an earlier version said the shuffled map "inverts" all of these choices; only the C-over-A and
C-over-D choices invert, and the earlier sentence had no output behind it.

### 1.6 Caveats (worst first)

1. The mushroom body is run as a feedforward circuit lifted out of the recurrent model (1.1); section 3 puts it
   back inside the recurrent brain and reports what survives.
2. The 0.90 paired drop is calibrated, not predicted. The predictions are specificity, compartment,
   generalisation, reward compartments, coexistence, and choice ordering.
3. The published rule fails same-compartment coexistence at this strength; the fix shown is a rule change.
4. Odours are synthetic; the antennal lobe is bypassed; this section has no time axis, so timing is not tested
   here (section 4.1 adds a clock and an eligibility trace).
5. Binary Kenyon-cell reading is a choice (graded ceiling ~55%).

## 2. Visual memory: the same circuit, a second sense (2026-09-17)

The plan was smell first, then vision. The same mushroom-body model, switched to the fly's visual input
pathway, tests whether it can also learn that a visual object predicts punishment or reward. All wiring is from
the full connectome cache; the section 1 olfactory result reproduces on it. Code:
`kenyon/experiments/olfactory.py --modality visual`, `kenyon/experiments/behaviour.py --modality visual`; results in
`results/vis5_*.json` and `results/beh5_vis.json`.

### 2.1 The visual pathway is real but small

Visual projection neurons reach the Kenyon cells that carry visual input: mostly KCg-d (through the ventral
accessory calyx) and KCab-p (dorsal accessory calyx), plus a handful of cells of other types. The cache keeps
every Kenyon cell with any visual input, and that whole set is the pool the model competes over (an earlier
version of this table described the pathway as KCg-d only, with 200 inputs and 203 cells; the numbers below are
what the cache actually contains). The pathway is far smaller and weaker than the olfactory one, matching the
biology:

| pathway | connections | inputs reaching KCs | KCs reached | median synapse count |
|---|---|---|---|---|
| smell: olfactory PN to KC | 20,300 | 215 of 220 | 3,755 of 4,064 | 17 |
| vision: VPN to KC | 1,616 | 252 of 9,201 | 332 of 4,064 (203 KCg-d, 108 KCab-p, 21 other) | 3 |

A visual object is a random set of six of the 101 anatomical visual-projection types (lobula and medulla
feature detectors), the visual analogue of glomeruli.

### 2.2 The visual memory is specific, but coarser than smell over ten draws

Kenyon-cell competition is applied to the driven visual subpopulation, the 332 cells with visual input (the
first review found an earlier version sized the winner count to the whole 4,064-cell pool, which disabled
competition among the visual cells and made vision look artificially coarse; fixed). With the fix the visual
code is sparse and distinct:

| endpoint (one pairing, object A + PPL101, read at MBON11) | smell | vision |
|---|---|---|
| Kenyon cells active per stimulus | 188 (5% of the 3,755 driven; 4.6% of all 4,064) | 17 (5% of the 332 driven; 0.4% of all 4,064) |
| cross-object code similarity | 0.11 (0.10 +- 0.01) | 0.10 (0.11 +- 0.04) |
| paired drop at MBON11 | 0.90 (calibrated) | 0.90 (calibrated) |
| unpaired objects, mean, seed 0 | 0.13 | 0.02 |
| unpaired objects, mean, ten draws | 0.09 +- 0.03 | 0.18 +- 0.12 (0.02 to 0.39) |
| unpaired, single worst object of a draw, ten draws | 0.21 +- 0.06 (up to 0.30) | 0.42 +- 0.24 (up to 0.87) |
| share of all learning landing on MBON11 | 0.97 | 0.95 |
| generalisation, 5 of 6 channels shared (one pairing) | 0.59 (0.60 +- 0.04) | 0.71 (0.71 +- 0.07) |
| reward (PAM) in reward compartments / at MBON11 | 0.69 / 0.06 | 0.65 / 0.06 |
| A punished and C rewarded together: A / C | 0.85 / 0.69 | 0.85 / 0.65 |

Reading: the same circuit learns visual punishment and reward, lands them at the correct output cells and
dopamine compartments, and holds a punishment and a reward memory at once. Its specificity is NOT as sharp as
smell's. The seed-0 draw in the table is an unusually clean one; over ten draws the unpaired objects lose
0.18 +- 0.12 of their MBON11 drive (smell: 0.09 +- 0.03), and the worst object of a draw loses up to 0.87. The
reason is the size of the pool: the visual code is 17 winners out of 332 cells, so two random objects can share
most of their Kenyon cells, whereas two odours pick 188 cells out of 3,755. Correction (2026-09-19): an earlier
version of this section claimed visual specificity "at least as sharp as smell" from the single 0.02 draw; the
ten-draw numbers above replace it. Controls: shuffling the dopamine-to-MBON map destroys the memory at MBON11
(0.0004; the punishment lands on MBON10, a compartment the visual Kenyon cells do not reach, so the calibration
itself is impossible there and the rule keeps its default strength, which the output now states); the
dense-code control (no competition) raises the seed-0 leakage from 0.02 to 0.19, so the sparse code is still
what gives the specificity there is, as for smell.

### 2.3 Visual memory changes choice, moderately

Through the same valence map (one pairing). For the seed-0 object pair the reciprocal T-maze index peaks at 0.27
near gain 8 to 16; over ten independently drawn pairs it is 0.20 +- 0.11 at gain 8 (0.01 to 0.38) and
0.23 +- 0.19 at gain 16 (0.00 to 0.67), against smell's 0.34 +- 0.03 and 0.59 +- 0.05. That gap is not the
memory. The untrained circuit already prefers one object of most visual pairs (innate |bias| 0.31 +- 0.13 at
gain 8, against 0.05 +- 0.04 for odour pairs), because a 17-cell code gives the two objects unequal valence
sums, and the reciprocal index falls with that bias (correlation -0.92 at gain 8: after the preferred object is
punished, the fly can still pick it). The size of what the pairing writes, the drop in the punished object's
approach score, is 0.10 +- 0.03, against 0.10 +- 0.01 for smell: the memory writes a change of the same mean
size in both senses (three times more variable across visual pairs); it is the innate preference of the pair
that caps the visual index. Correction
(2026-09-19): an earlier version read "visual memory shifts choice less strongly than smell, consistent with
visual conditioning being harder in flies"; that comparison was one object pair with a large innate bias, and
is withdrawn.

Reach into the descending neurons, through the cache's MBON -> DN and MBON -> interneuron -> DN routes (a relay
is an interneuron, never another MBON or a DN; an earlier version let MBONs and DNs relay, and excluding them
left the direct route unchanged, moved the pooled two-hop values by 2 to 7% (smell 0.036 to 0.037, vision 0.019
to 0.021, driven DNs 1,285 to 1,256) and the single-cell and untouched figures by up to 20% (DNa02 two-hop
0.018 to 0.021 smell, 0.009 to 0.011 vision), with every comparison below keeping its sign under both
versions). Smell reaches the steering neurons MORE than vision in absolute terms: two-hop relative
change 0.037 (smell) against 0.021 (vision); direct 0.031 against 0.014; DNa02 two-hop 0.021 against 0.011;
DNa03 0.012 against 0.010. Vision is more trained-specific: its trained object moves the two-hop drive 13 times
more than an untouched object (0.021 against 0.0016), smell 7.6 times (0.037 against 0.0049). Correction
(2026-09-19): an earlier version said the change "reaches the descending neurons more here than for smell,
because the visual output cells sit on shorter paths to steering"; the outputs say the opposite, and no
path-length measurement exists to support the mechanism, so both are withdrawn. Either way the signal is small
and does not close the loop to action (section 3.2, 4.4).

## 3. Putting the memory back inside the recurrent brain (2026-09-17)

Sections 1 and 2 run the mushroom body feedforward. This section tests whether the memory can live inside the
full recurrent brain that plays Doom (138,968 neurons, 4.64 M connections). Code: `kenyon/experiments/sparse.py`
(3.1; results in `results/kcsparse2_*_cpu.json`) and `kenyon/experiments/embed.py` (3.2; `results/embed2_cpu.json`).
Both run on a GPU or, more slowly, on a CPU: these results are the CPU rerun of 2026-09-20 (about one hour per
condition on a shared CPU), which is why an earlier version of this section said the reruns were pending.
Section 4.8 repeats 3.2's descending-neuron test on the unpruned connectome and supersedes its negative.

### 3.1 Why it cannot be done the naive way

The recurrent gain-matched model cannot compute a sparse Kenyon-cell code. Driving the projection neurons
(re-imposed every substep, so the odour is not overwritten between integration steps) and sweeping the
Kenyon-cell threshold gives either nearly every cell active (85 to 100%) or every cell silent, with or without
the APL, and never anything near the roughly 5% of a real Kenyon layer. The raw cross-odour cosine of the Kenyon
rates stays at 0.999 throughout: as patterns, the six odours are nearly the same direction.

| Kenyon-cell threshold (resting potential) | fraction active, APL intact / APL silenced | mean Kenyon rate | raw cross-odour cosine | odour decoded from the rates (chance 0.17) |
|---|---|---|---|---|
| default | 1.00 / 1.00 | 0.68 | 0.999 | 1.00 |
| raised a little (-2) | 0.85 / 1.00 | 0.11 | 0.999 | 1.00 |
| raised more (-5) | 0.00 / 0.00 | 0.006 | 0.999 | 1.00, see below |
| raised further (-10) | 0.00 / 0.00 | 0.000 | 0.999 | 1.00, see below |

The last column decodes the raw continuous rates; "fraction active" counts rates above 0.1. In the bottom two rows
those are different quantities: no cell is active by that definition, so the decoder is separating rate vectors of
order 1e-5 rather than reading a code.

Correction (2026-09-19, completed 2026-09-20). An earlier version of this table reported a "centered cross-odour
cosine" of -0.20 and a "nearest-neighbour odour decoding" of 0.00 against a chance of 0.17, and presented them as
two further independent tests. Both were artefacts of the test design, not measurements: with one presentation
per odour, subtracting the per-cell mean across six odours forces the mean cross-odour cosine to exactly
-1/(6-1) = -0.20 for any code, and a decoder that excludes the self-match with one sample per class cannot return
anything but 0. `sparse.py` now presents each odour five times with projection-neuron rate jitter and scores a
leave-one-out nearest-centroid decoder on held-out presentations, with a self-check that the decoder reaches 1.00
on a separable code and 0.30 on shuffled labels. That rerun is now done, and it reverses that number: the decoder
scores 1.00 in every condition, and each odour's repeats cluster about six times more tightly than the odours are
apart. So the earlier "no code at all" reading was too strong, and the honest statement is narrower: the odour
information is present and perfectly separable, but not in the format the plasticity rule needs. Format is not a
detail here. Section 1's dense-code control writes the same memory onto a code with the winners-take-all step
switched off, which leaves 31 to 50% of Kenyon cells active instead of 4.6%, and one pairing then depresses
untouched odours by 0.43 instead of 0.13: a specificity of 2.1 to 1 instead of 6.9 to 1, against the same paired
0.90. The memory stops being about the odour that was trained. At the two highest thresholds the decoder still scores 1.00 while the mean Kenyon rate
has fallen to 0.000, so it is reading differences far below any plausible spiking noise; in a deterministic
simulation that is possible, in an animal it is not. What is measured, and what justifies injecting a feedforward
code in 3.2, is the sparseness failure: every cell at one rate, or every cell silent. This is a property of the
uniform rate model, not of the fly; real Kenyon cells are feedforward coincidence detectors.

### 3.2 The faithful embedding, and what it shows

So the Kenyon-cell code is computed the way the cell works (real PN->KC wiring plus k-winners-take-all) and
injected at the Kenyon-cell layer of the full recurrent core, pinned every substep; the learned KC->MBON
changes are applied to the core's own edges; and the memory is read at the output cells and descending neurons
through the full recurrent brain. The memory lives on the connectome's real synapses; only Kenyon-cell activity
is computed feedforward, which is disclosed.

| endpoint, inside the full recurrent brain (one pairing, odour A + PPL101) | value |
|---|---|
| MBON11 fraction of input from Kenyon cells (full connectome; `MBON11_input_frac_from_KC` in `olf5_binary.json`; an earlier version printed 0.88 with no source) | 0.86 |
| the same fraction inside this pruned subgraph (`MBON11_input_frac_from_KC_subgraph`) | 0.89 |
| unpaired odours, mean drop at MBON11 (wiring-derived) | 0.10 |
| paired odour A, drop at MBON11 (calibrated, capped) | 0.68 |
| paired-over-unpaired specificity ratio | 7 to 1 |
| descending-neuron drive, relative change pooled over the 1,322 descending neurons (trained) | 0.0003 |
| descending-neuron drive, largest single-neuron change (on a scale of 5) | 0.006 |
| descending neurons changing by more than 1% of the peak rate | 0 |

The CPU rerun of 2026-09-20 reproduces the six numbers this module computes (rows 3 to 8: 0.0981, 0.6837, 6.97,
0.0003, 0.0063, 0), so nothing here rests on the old output; row 1 is read from `olf5_binary.json` and row 2 is new
in the rerun. It also adds the whole-core figure the old file did not have, 0.0004.

Correction (2026-09-20). This table is the `--lr-auto` run, and that search has no validity cap: it hunts for a 0.9
drop in MBON11's firing rate, which plateaus at 0.68, so it always settles on the ceiling of its range, lr 8. That
is eight times the plasticity rule's own valid limit, and at it the depression saturates in every compartment PPL101
innervates rather than only MBON11; the dose is also taken from the model's compressed edge values instead of raw
synapse counts. Section 4.8 fixes both and re-measures this same graph at the calibrated lr 0.9. The specificity
survives and improves (paired over unpaired 11.2 against 6.97 here), but the descending-neuron magnitudes do not:
the pooled change is 0.000107 against 0.0003 and the largest single change 0.0020 against 0.0063, about three times
smaller. For the size of the descending-neuron effect read 4.8's table, not this one. What this table establishes
is the specificity ratio at MBON11, which is the wiring-derived claim.

Reading. The memory does express inside the full recurrent brain, and specifically: the trained odour drops
about seven times more than unpaired odours at MBON11, on the connectome's real synapses. The specificity is
the wiring-derived result; the paired magnitude (0.68) is a calibrated quantity, and it caps at 0.68 even at
the maximum learning rate, because once the KC->MBON11 synapses are fully depressed the recurrent loop still
restores part of the output. The negative, as measured here: the change barely reaches the descending neurons.
The relative change pooled across the 1,322 descending neurons is 0.0003 (an earlier version of this text called
that number "whole-brain"; it was never computed over the whole brain. `results/superseded/embed2.json` is
the pre-review output and still stores this DN-pooled value under the old key `rel_change_whole_brain`;
`embed.py` now writes `rel_change_DN_population`, a true whole-core `rel_change_whole_brain` and the
subgraph's MBON11 Kenyon-input fraction), the most-affected descending neuron of any type moves 0.0063 on a scale
of 5, and not one descending neuron changes by even 1% of the peak firing rate. The file's DNa02 0.0052 and DNa03
0.0076 are sums over each type's two cells, not single neurons. On this graph the memory-to-action
loop is not closed; the behaviour results of sections 1 and 2 go through the published valence map.

Two later results qualify this. Section 4.4 shows from the connectome alone that no memory-specific route from
MBON11 to the steering neurons DNa02 and DNa03 exists, so for those cells this is anatomy, not a modelling
shortfall. Section 4.8 repeats the measurement on the unpruned connectome and finds that this graph's weight
threshold had deleted every direct MBON11 contact onto a descending neuron, which changes the result for one
cell and should be read before this paragraph is quoted.

A methodology note, in the spirit of reporting what broke: the adversarial review of this code found that an
initial version pinned the Kenyon-cell code only once per decision, but the core runs six substeps per
decision, so the injected code drifted and the memory looked completely absent. Pinning every substep fixed it.
The same drift bug was found and fixed in the sparse-code test of 3.1. The injection has to hold at the
integration timescale, not the decision timescale.

### 3.3 Caveats (worst first)

1. The memory expresses at the output cell but barely at the descending neurons (largest change 0.006 of 5): it
   does not change what the modelled fly does. Section 4.4 finds the connectome gives it no dedicated route to
   the steering neurons, and section 4.8 finds direct contacts onto two other descending neurons (nine synapses)
   that this graph had deleted.
2. Kenyon-cell activity is injected feedforward, not computed by the recurrent model, because the recurrent
   model cannot produce a sparse code (3.1). This is faithful to Kenyon-cell physiology but is a modelling choice.
3. The paired magnitude is calibrated and caps near 0.68; only the specificity ratio and the descending-neuron
   readout are wiring-derived claims.
4. The descending-neuron readout runs on the weight-thresholded Doom subgraph, which keeps 4.64 M of the
   connectome's 25.58 M connections and 69% of the synaptic weight arriving at its neurons, so it can only
   reduce the apparent reach of the memory; section 4.8 measures by how much.
   Correction (2026-09-20): this caveat used to add that the operating point drives many cells near their rate
   ceiling, where a cell cannot respond at all. That was a suspicion, and it is wrong. Measured in the state the
   test actually runs in, no descending neuron is at the ceiling and 0.2% of all dynamic cells are, so saturation
   was never the reason for the small numbers. Neither, as 4.8 then measures, was the pruning: restoring 15 M
   connections moves the pooled change by 1.1 times, leaves the 95th percentile and the count above 5% unchanged,
   and adds two cells above 0.5% of their own rate. What the pruning cost was the direct contacts, not the size
   of the effect. The numbers in this section are instead about three times too large, for the reason given in 3.2.
5. The 1,322 cells called descending neurons here were selected by a type name beginning "DN". Section 4.8
   selects on the annotation's superclass instead and gets 1,312 on this graph. The counts differ by only 10, but
   the two sets differ in 46 of 1,322 cells, 3.5%: the name rule pulls in 28 cells the annotation does not call
   descending (16 of them clock neurons, DN1pA, DN1a and DN1pB; the other 12, DNd01, DNx01, DNx02, DNg28 and
   DNES3, carry descending-style names the superclass disagrees with) and misses 18 that it does call descending,
   including MDN, pIP1, pIP10, aSP22, pMP2, CB0429 and four untyped cells. Both full lists are in the
   `dn_selection` block of `results/motor2_v5.json`. This section's pooled figure was not recomputed on the
   superclass set; of the 18 cells it wrongly omits, pIP1 turns out to be the largest mover on this graph in 4.8.

## 4. Experiments on the simulated fly (2026-09-18/20)

Seven further things you can do to the section-1 circuit once it exists: teach it in real time, lesion it, give
it a partial cue, trace where its memory could go, take away the one hand-set part of its Kenyon code, ask
whether the size of the memory is a prediction, and ask whether it produces anything the body could act on.
The first six run on the CPU in seconds: 4.1 to 4.3 and 4.5 need the wiring cache, 4.4 reads the connectome
files directly, and 4.6 uses the cache only for a cross-check. The seventh, 4.8, runs the whole recurrent brain
and takes about two hours per graph on a shared CPU. Results in `results/online.json`, `lesion.json`,
`recall.json`, `pathway.json`, `apl.json`, `magnitude.json`, `motor2_v5.json`, `motor2_full.json` and
`motor2_full_cut.json`. Each output carries its own
verdict string and says which of its numbers are calibrated, which are closed forms of the rule, and which come
from the wiring. These modules went through the same adversarial review as sections 1 to 3; the labelling below
is what survived it, and where a review overturned a conclusion the correction is stated in place.

### 4.1 Teaching with a clock (`online.py`)

Sections 1 to 3 have no time axis: one rule call is one pairing block. Here the odour switches its Kenyon cells
on for 5 s, dopamine arrives as four 50 ms pulses at 2 Hz starting at a set delay, and a KC->MBON synapse
weakens only where a decaying eligibility trace of recent Kenyon activity (time constant 0.8 s) and dopamine
coincide. The rule is a trace-gated multiplicative depression, NOT the Gkanias rule of section 1 (it has no
silent-cell recovery term, so the same-compartment failure of 1.4 does not arise here); the two are not
interchangeable. One constant is anchored so the standard protocol (pulses from 0.2 s after odour onset) gives
Hige's 0.90 at MBON11. With a binary code every active synapse then sees the same trace and the same dopamine,
so the MBON11 drop for ANY schedule is a closed form of the anchor and the timings; the module prints that
closed form next to each measured value and they coincide. The timing and dose tables are therefore the rule,
not the wiring; what the wiring contributes is the unpaired odour (0.06) and the behaviour.

| dopamine train, relative to a 5 s odour | drop at MBON11 |
|---|---|
| ends 2.0, 1.0, 0.5 s BEFORE odour onset | 0.00, 0.00, 0.00 (zero by construction: no trace before Kenyon activity) |
| starts 0, 0.2, 0.5, 1, 2 s after onset (during the odour) | 0.85, 0.90, 0.94, 0.96, 0.97 |
| starts 0.2, 1, 2 s after odour OFFSET | 0.74, 0.38, 0.13 (the trace decaying) |
| pulses at 0.2 s: 0, 1, 2, 4, 8, 16 | 0.00, 0.20, 0.53, 0.90, 1.00, 1.00 |

Controls, both zero by the mechanism: dopamine with no odour 0.00, odour with no dopamine 0.00. Behaviour
through the valence map (gain 8): P(avoid A) 0.50 untrained, 0.68 after forward teaching, 0.50 after a train
that ends 2.2 s before the odour; reciprocal index 0.35 forward, 0.00 backward; avoidance against pulses
0.50, 0.54, 0.61, 0.68, 0.69, 0.68. Caveats: the backward zero is a property of a forward-only trace, not a
measured timing curve; the bidirectional rule of Cohn et al. 2015 (dopamine before the odour potentiates) is
not modelled; single odour draw.

### 4.2 Lesions (`lesion.py`)

The rule is calibrated once on the intact circuit and held fixed; each lesion is applied, the same one pairing
is run, and the memory (MBON11) and the behaviour (P(avoid A) at gain 8, before and after) are read. Three
rows are identities of the rule or the readout and cannot fail once the dopamine-to-MBON compartment map is
taken as given: no punishment dopamine means no weight change; zeroing MBON11's valence removes the cell
carrying 97% of the depression (that share is the compartment map, itself a wiring result of 1.3 and 1.4, so
this row is an identity given the map, not independent of the wiring); and no KC->MBON synapses means nothing
to depress. Only the APL and KCg-m rows test the connectome here.

| lesion | real fly | wiring test? | unpaired leak at MBON11 | MBON11 drive to A lost | learned shift in P(avoid A), fraction of intact |
|---|---|---|---|---|---|
| none | learns and avoids | (baseline) | 0.08 | 0 | +0.18 (1.00) |
| PPL1-gamma1pedc silenced | memory abolished (Aso 2010, 2012) | no, identity | 0 | 0 | 0.00 (0.00) |
| MBON11 silenced in the readout | avoidance lost (Aso 2014, Perisse 2016) | no, identity | 0.08 | 0 | -0.00 (-0.02) |
| APL removed (dense code) | specificity lost (Lin 2014) | yes | 0.41 | not applicable (dense code raises drive) | +0.07 (0.37) |
| KCg-m Kenyon cells silenced | short-term memory impaired (Aso 2014) | yes | 0.02 | 0.75 | +0.15 (0.82) |
| all KC->MBON synapses cut | nothing stored | no, identity | none | 1.00 | 0.00 (0.00) |

Reading: the two wiring-dependent rows go the way the animal goes. Without APL sparsening the memory leaks onto
unpaired odours five times more (0.08 -> 0.41) and the learned avoidance drops to 37% of intact; silencing the
main gamma Kenyon cells removes three quarters of MBON11's drive to the odour and leaves 82% of the learned
avoidance, a mild impairment. The behavioural readout is the change in P(avoid A), not its absolute value: the
untrained baseline is lesion-specific (0.43 to 0.55 here), so an absolute 0.5 means nothing. Caveats: the MBON11
row lesions the readout, not the circuit; the paired drop itself is calibration-locked (0.90 whenever any
trained synapse survives) and cannot express graded impairment; single odour draw.

### 4.3 A partial cue (`recall.py`)

Teach the full six-glomerulus odour once, then present only some of its glomeruli.

| glomeruli of A presented | 6/6 | 5/6 | 4/6 | 3/6 | 2/6 | 1/6 |
|---|---|---|---|---|---|---|
| recall at MBON11, fraction of the full-odour drop | 1.00 | 0.81 | 0.65 | 0.50 | 0.42 | 0.29 |

Recall is graded (slope 0.83 against cue fraction), never complete. What this measures, exactly: with a binary
code and one pairing, the recall fraction EQUALS the share of the partial cue's MBON11 drive that passes through
the trained odour's Kenyon cells (the module prints both; they agree to the third decimal in the recorded
output). So the curve is
the connectome's partial-cue overlap, and completion is excluded for this feedforward circuit by construction;
the finding is the shape of the graded curve, not a test that could have shown completion. A recurrent or
attractor stage would be needed for a degraded cue to re-create the whole memory.

### 4.4 Where the memory could go: MBON11 to the steering neurons (`pathway.py`)

From the full connectome alone, no model: the routes from MBON-gamma1pedc (2 cells) to the established steering
descending neurons DNa02 and DNa03 (4 cells). A bridge is an interneuron; MBONs and DNs are not counted as
relays. The bridge that matters is one that both receives a meaningful share of its input from MBON11 (so the
memory can modulate it) and drives the steering neurons.

| quantity | value |
|---|---|
| direct MBON11 -> DNa02/DNa03 synapses | 0 |
| interneuron bridges (types) | 19 (16) |
| strongest bridge by memory-modulated throughput | CRE021: 72 synapses onto the steering DNs, but MBON11 is 0.19% of its input |
| largest raw capacity | AOTU019: 1,058 synapses onto the steering DNs, 5 from MBON11 (0.01% of its input) |
| most MBON11-specific bridge | SMP272: 0.22% of its input from MBON11, 3 synapses onto the steering DNs |
| share of the steering DNs' 84,206 input synapses that MBON11 can modulate | 0.0003% |

Reading: the connectome offers no memory-specific route from this compartment to steering, which is the
anatomical version of section 3.2's negative. Prediction, testable in a fly: silencing the top bridge types
(CRE021, AOTU019, SMP148) should NOT selectively abolish learned odour avoidance while leaving naive behaviour
intact; a null result supports diffuse summation over many compartments or a longer route, a positive hit means
the behavioural path uses connections below this connectome's confidence threshold. AOTU019 in particular is a
poor target: it steers, but MBON11 barely touches it, so a deficit there would not be memory-specific.

### 4.5 The Kenyon code from the real APL loop (`apl.py`)

The one hand-set part of section 1 is the top-5% rule that stands in for APL inhibition. Here the code is
computed the way the circuit does it: the projection-neuron drive enters, the Kenyon cells excite the two APL
cells (KC -> APL synapses from the connectome), the APL inhibits every Kenyon cell back in proportion to its own
APL -> KC synapse count, and the loop relaxes to a fixed point (convergence checked). One parameter is set, the
inhibition gain, chosen so the code lands at the same density as the top-5% baseline; which cells survive is
decided by the wiring. Ten seeds, fresh odours and a fresh shuffle each; cross-odour cosine, lower is more
distinct, at matched density (about 4.6% active):

| Kenyon code | cross-odour cosine |
|---|---|
| top-5% of the PN->KC drive, no APL (section 1) | 0.100 +- 0.015, the most distinct in all ten seeds |
| APL loop, every APL->KC weight set to the same value | 0.107 +- 0.014 |
| APL loop, real per-cell APL->KC weights | 0.130 +- 0.016 |
| APL loop, real weights shuffled across Kenyon cells | 0.179 +- 0.016, worse in all ten seeds |

Reading: the real loop does sparsen the code from one gain, so the sparseness LEVEL no longer has to be set by
hand. But the per-cell APL->KC weights do not create the odour identity: a structureless uniform threshold is
as distinct as the real weights in nine of ten seeds, and the pure feedforward top-k beats both. The real weights
are not random (shuffling them hurts), but "beats random" is not "makes the code". Mechanistically this is
near-forced: with two APL cells the loop's inhibition is rank 2, a near-global modulation that cannot select
winners cell by cell. Honest conclusion: the PN->KC wiring gives the odour identity; the APL loop sets only how
many cells fire. This module went through two reviews of its own (a density confound in the comparison and a
one-sided test were found and removed).

### 4.6 Is the size of the memory a prediction? (`magnitude.py`)

The one number set by hand in section 1 is the learning rate, chosen so that one pairing block reproduces Hige's
90%. That stays a calibration: nobody has measured the size of a single dopamine-driven depression at this
synapse, so one number has to be set. But Hige's pairing block is not one event, and how the pulses inside it
combine is a property of the rule rather than of the fit, so it can be scored. Three candidates all reproduce
0.90 at the four-pulse arm and disagree elsewhere:

| rule | one-pulse / four-pulse ratio | what it says |
|---|---|---|
| block is the unit (sections 1 to 3) | 1.00 | one rule application per block; pulse count does not enter |
| independent pulses | 0.49 | each pulse multiplies the synapse by 1 - 0.44; count matters, timing does not |
| eligibility trace (4.1) | 0.71 | a pulse acts on the trace of recent Kenyon activity; count and timing both matter |

Hige ran arms that bear on this. The depression of the UNPAIRED odour was 20 +- 6.3% after a single pulse and
27 +- 7.1% after four, a ratio of 0.74 +- 0.30. That ratio is comparable to ours because under this rule a
probe odour's drop is exactly its Kenyon-cell overlap with the trained odour times the paired drop, and the
overlap does not depend on the dopamine schedule, so it cancels.

The two arms differ in two ways, and both have to be reproduced: four pulses from +0.2 s against ONE pulse at
+0.8 s, into a 1 s odour. The delay is not a detail. By 0.8 s the eligibility trace has charged, so a rule in
which timing matters expects one late pulse to do nearly as much as four early ones, while a rule without
timing expects it to do much less. Each arm is therefore simulated on its own schedule.

| candidate | ratio | z against the measured 0.74 +- 0.30 |
|---|---|---|
| eligibility trace | 0.71 | -0.12 |
| independent pulses | 0.49 | -0.84 |
| block is the unit | 1.00 | +0.85 |

The trace rule is closest, and it stays closest across the whole trace-constant sweep (0.57 to 0.82 for tau from
3.2 s down to 0.2 s). But one ratio of two noisy means separates none of them: all three sit within one
propagated SEM of the measurement, and the two rules that are wrong are wrong in opposite directions. The
honest statement is that this measurement is under-powered, not that it picks a winner. What the trace rule
buys is an explanation rather than a coincidence: it expects a late single pulse to do nearly as much as four
early ones, which is what was seen, whereas a timing-free rule has to treat that as luck.

Hige's other pulse arm does not help either. A 1 min odour with 120 pulses gave suppression "similar" to four
pulses, but anchored at 0.90 there is only 0.10 of headroom: every candidate here is above 0.97 by eight pulses
and at 1.00 by 120, which on the unpaired channel is a move from 0.27 to at most 0.30, inside its own SEM. That
observation is consistent with all three rules and discriminates nothing.

Correction (2026-09-19): the first version of this section scored the single-pulse arm at +0.2 s rather than
Hige's +0.8 s, and used a 5 s odour rather than his 1 s. Under a trace rule the delay is the mechanism, so that
reversed the result: it reported the trace rule as the worst fit (ratio 0.22) and concluded that dopamine
saturates within a block and that 4.1's pulse axis was wrong. With the protocols matched the trace rule is the
best fit of the three and no such conclusion follows. The 120-pulse argument was also wrong, for the reason
given above.

The experiment that WOULD separate the rules holds the timing fixed and varies only the count. At the
four-pulse arm's own onset the trace rule predicts 0.22 for one pulse against 0.44 for independent pulses and
0.90 for the block rule, a factor of two between the first two. The magnitude-free version is the curvature:
with a trace comparable to or slower than the pulse interval the second pulse adds more than the first (true
for tau of 0.4 s and above here, and at pulse rates of 1 to 5 Hz, but not at 0.5 Hz, where most of the train
falls outside a 1 s odour). That is a sign test on two increments, so it needs no absolute magnitude and no
anchor value, and pulse independence can never produce it. It does not prove a trace, though: anything that
grows within a train, such as dopamine facilitation or receptor sensitisation, would also give a rising
increment. Read backwards, the same experiment measures the trace constant, which is hand-set here and which
the literature sweep found unmeasured: a single-pulse depression of 0.15 implies 2.3 s, 0.20 implies 1.0 s,
0.30 implies 0.46 s, 0.44 implies 0.24 s.

For context, the only direct measurements of this synapse (Yamada, Davidson & Hige 2024, J Physiol, using
exogenous dopamine and direct Kenyon activation rather than odour and PPL1, so not substitute anchors) give
54.7 +- 8.5% depression from gamma Kenyon cells and 81.8 +- 3.8% from alpha/beta Kenyon cells onto the same
MBON, both presynaptic (paired-pulse ratio up about 90%). They bracket the calibrated 0.90 and show the
magnitude is Kenyon-class dependent, which this model does not represent: its rule is identical for every
Kenyon cell.

Caveats on the comparison, worst first: the measured numbers are the unpaired (CS-) channel, because the paired
magnitude for the single-pulse arm exists only in a supplementary plot and is not stated in readable text
anywhere; the two arms come from different experiment sets and the single-pulse arm's odour pair could not be
confirmed, while the same paper shows unpaired depression scales with Kenyon-cell overlap (Pearson r = 0.90),
so odour identity is an unexcluded alternative explanation for 20% against 27%; the n for the single-pulse arm
is not stated and the four-pulse arm is n = 7; the propagated error on a ratio of two noisy means is a
first-order approximation and the ratio's distribution is skewed, so the z values are indicative; and these are
spike counts, not the EPSC charge transfer the 0.90 calibration uses.

### 4.7 Caveats for this section (worst first)

1. 4.1's timing and dose curves are closed forms of an anchored rule; they demonstrate the trace mechanism and
   contain no connectome information. Only the unpaired odour and the behaviour there depend on the wiring. Its
   pulse-count axis is the part 4.6 scores against data; it survives, but the measurement is under-powered.
2. 4.2 has two real tests in six rows; three rows are identities kept as floors and one is the intact baseline.
3. 4.3 cannot show completion by construction; it measures the partial-cue overlap.
4. 4.4 is anatomy at minconf 0.5: capacity, not proven necessity, and a route below the threshold is invisible.
5. 4.1 to 4.3 are single odour draws; 4.5 has ten; 4.8 has three, and they are not independent replicates.
6. 4.6 scores three candidate rules against two published numbers whose caveats are listed there, and the
   comparison separates none of them. It does not make the calibrated magnitude itself a prediction, and no
   measurement now in the literature would.
7. 4.8's one positive rests on nine synapses in a single reconstruction, in connections below the five-synapse
   threshold of the Doom graph used in section 3, and its left-right split is at the scale of reconstruction
   noise.

### 4.8 Does the memory produce a motor command? (`motor.py`)

Section 3.2 read the memory at the descending neurons, the only cells that carry commands from the brain to the
body, and found almost nothing. That measurement ran on the Doom subgraph, which keeps a connection only if it has
at least five synapses: 4.64 M of the connectome's 25.58 M connections, carrying 69% of the synaptic weight that
arrives at its neurons (build report in `results/subgraph_v5_build.json`). This section repeats it on the unpruned graph (`subgraph_full.npz`, built at a threshold of
one synapse: 144,981 neurons, 19.51 M connections, 97% of the weight arriving at its neurons; build report in
`results/subgraph_full_build.json`), with the same
settings on both, so the two can be compared: one pairing of odour A with PPL101, three odour draws, four odours
each, thirty decisions of settling. Neither graph includes the ventral nerve cord, so "descending neuron" here means
the cell whose axon would leave the brain, measured at its soma.

Four things are done differently from 3.2, each because the first version of this test got them wrong and a review
caught it. Descending neurons are selected by the annotation's superclass rather than by a name beginning "DN"
(1,312 cells here, against 1,322 by name). The learning rate is section 1's 0.9, the one Hige-calibrated pairing,
capped at the rule's valid ceiling; an earlier version searched for a 90% drop in MBON11's firing rate, which this
recurrent brain cannot reach, ran the rate to its limit of 8 and in doing so wiped out every output cell the
punishment neuron touches at all. The dopamine dose per output cell comes from raw synapse counts, as in section 1,
not from the model's compressed edge values. And the control is dose-matched: the same depression, on the same
Kenyon cells that the odour activates, moved to randomly chosen output cells.

| one pairing, three odour draws | Doom subgraph | unpruned graph |
|---|---|---|
| MBON11's own rate drop (paired / untouched odours) | 0.65 / 0.058 | 0.59 / 0.046 |
| share of the removed synaptic drive that lands in MBON11 | 0.96 | 0.95 |
| pooled change across all descending neurons | 0.000107 | 0.000119 |
| the same for untouched odours | 0.0000094 | 0.0000094 |
| the same for the dose-matched control | 0.000050 | 0.000039 |
| largest change in any single cell, as a fraction of that cell's rate | 0.40% | 2.8% |
| second largest | 0.39% | 0.91% |
| cells changing by more than 0.5% of their rate | 0 of 1,312 | 2 of 1,314 |
| cells changing by more than 5% | 0 | 0 |
| what the odour itself does to the descending neurons, pooled | 0.00062 | 0.00079 |
| the memory as a share of that | 0.17 | 0.15 |
| direct MBON11 synapses onto a descending neuron | 0 | 9, in 3 connections |

The table is `results/motor2_v5.json` and `results/motor2_full.json`, except the last row, which is the
`--anatomy-only` output (`results/motor_anatomy_v5.json`, `results/motor_anatomy_full.json`).

Reading, size first. Restoring fifteen million connections does not change the population result: the pooled change
is 1.1 times larger, still about one part in ten thousand, and 95% of descending neurons move by less than 0.07% of
their own rate on either graph. It changes two cells. On the unpruned graph the left DNp52 moves 2.8% of its rate
and the right DNp62 0.91%, against 0.018% and 0.016% for their opposite numbers and 0.24% for the third largest
mover; on the pruned graph the two largest movers are the right and left pIP1 at 0.40% and 0.39%, which is the flat
top of a diffuse distribution rather than a signal. The two cells that stand out are the two the wiring picks out:
MBON11 contacts the left DNp52 directly with eight synapses, four from each hemisphere, and the right DNp62 with a
single synapse. Nine synapses in total, in connections of four, four and one, every one of them below the Doom
graph's threshold of five, which is why section 3.2 could not see any of this. The 1% line used elsewhere in this
report falls between these two cells, so the count above 0.5% is quoted here instead: that count is 2 in all three
draws, while the count above 1% is 1 and would be 2 if the second cell moved a tenth of a percent more.

That is a correlation between an anatomical difference and a functional one, so it was tested directly: silencing
exactly those nine synapses and repeating the measurement (`--cut-direct`, `results/motor2_full_cut.json`).

| unpruned graph, one draw | intact | those 9 synapses silenced |
|---|---|---|
| MBON11's own rate drop | 0.594 | 0.594 |
| largest change in any single cell, as a fraction of its rate | 2.8% (DNp52 left) | 0.24% (DNg104 right) |
| second largest | 0.95% (DNp62 right) | 0.17% to 0.24%; DNp62 right at most about 0.2% |
| cells changing by more than 0.5% of their rate | 2 | 0 |
| pooled change across all descending neurons | 0.000123 | 0.000102 |
| 95th percentile of per-cell change, as a fraction of rate | 0.000626 | 0.000626 |
| right-minus-left part, over the common-mode part | 0.51 | 0.35 |

The cut run stores only its eight largest movers by absolute change, not the per-cell vectors, so for other cells
only a bound is known: the eighth largest changes by 0.00088, so DNp62 right is at most about 0.2% of its rate,
and two cells at 0.17% put the second-largest change between 0.17% and 0.24%.

The memory itself is untouched by the cut, as it must be, since these synapses are downstream of where the learning
happens. What changes is the reading: both cells collapse and neither appears among the eight largest movers
afterwards, so DNp52's change fell more than seventeen-fold; the largest single-cell change falls from 2.8% of its
cell's rate to 0.24%, now in a different cell; and the ninety-fifth percentile of the population does not move at
all. So the whole of the unpruned graph's advantage at the descending neurons is those nine synapses acting on two
cells, and the diffuse remainder, which is four fifths of the pooled change, arrives by routes both graphs already
had.

What may be claimed from this, and what may not. The memory does reach the descending neurons, it is specific to the
odour that was trained (about 13 times the untouched odours), and it is not an accident of where the depression
landed: a dose-matched control that depresses the same Kenyon cells onto random output cells produces 3.1 times
less, or 2.5 times less after allowing for that control removing 20% less synaptic drive. Dosing MBON11 alone
reproduces the whole effect (pattern cosine 0.998), so it belongs to that compartment.

Against a cell's own firing rate the effect is small: the strongest descending neuron moves under 3%, the next
0.91%, and the remaining 1,312 less than 0.25%. That yardstick carries less information than it appears to, for two
reasons. Most of a cell's rate in this test is its resting level rather than evoked drive, since the model idles at
softplus(0) = 0.69 and the mean descending-neuron rate is 0.56. And the odour itself fails the same bar: presented
to a brain that has learned nothing, it moves no descending neuron by 5% of its rate, nineteen by more than 1%, and
the median one by 0.013%. A criterion that calls the stimulus "not a command" cannot be used to decide that the
memory is not one either.

The comparison that does carry information is the memory against what the odour itself does to each cell, since that
is the only sensory drive in the test. Pooled, the memory is 0.15 of it. On 12% of descending neurons it is larger
than it. And on the left DNp52 it is 1.1 times the odour's own effect with the opposite sign: untrained, that cell
sits 0.014 below its no-odour rate when the odour arrives, and after one pairing it sits 0.001 above it. For that
one cell the memory does not bias the odour response, it cancels and inverts it. So the claim that survives is
narrow but real: in absolute rate the memory tilts the motor output very slightly, and at the two cells MBON11
contacts directly it is comparable to, or larger than, the odour response it is modifying.

The per-cell figures in this section (DNp52's reversal, the 12%, the nineteen cells, the median, and the DNa02 and
DNa03 ranks below) are odour draw 0 of `results/motor2_full.npz`, the per-cell vectors saved next to
`motor2_full.json`. `python -m kenyon.experiments.motor --cells results/motor2_full.npz` recomputes them in seconds,
and `tests/test_memory.py` pins them.

Four cautions. The eight-against-zero split between the left and right DNp52 is not a case of a missing cell: both
are reconstructed, with 1,829 and 1,431 input synapses (`results/dnp52_trace.json`, from
`scripts/dnp52_trace.py`), and neither is flagged by the builder's left-right audit.
The asymmetry is in the contacts found, not in the cells, and at four synapses it is at the scale where proofreading
decisions matter, so nothing here should be read as a lateralised memory-to-motor pathway in the animal. Second, the
whole positive rests on connections of four, four and one synapse in a single reconstruction, all of them below the
five-synapse threshold of the Doom graph used in section 3. Third, the odour is injected at the
Kenyon cells, so the antennal-lobe route to the lateral horn is not driven and both the memory and the odour it is
compared against reach the descending neurons through the mushroom body alone. Fourth, the three odour draws are not
three independent measurements: they re-measure one fixed pattern, whose cosine across draws is 0.9999, so their
spread says how little the answer depends on which odour is trained, not how uncertain it is.

One connection to section 4.4, which asked the same question of the anatomy alone and found no memory-specific
route from MBON11 to the steering neurons DNa02 and DNa03. That holds, but not in the way an earlier draft of this
paragraph claimed. DNa02 and DNa03 are not among the smallest changes here; DNa02's two cells rank 13th and 19th of
1,314 by absolute change, about fifty times the median cell, and DNa03's right cell ranks 66th. What is true is that
they move by 0.14% (DNa02 left), 0.10% (DNa02 right) and 0.07% (DNa03 right) of their own rates, an order of
magnitude below the two cells MBON11 touches directly,
and that they are reached the way everything else is, by MBON11's diffuse indirect output. What 4.4 ruled out was a
memory-specific route to steering, and that still holds: the direct contacts that exist go to two other cells
entirely.
