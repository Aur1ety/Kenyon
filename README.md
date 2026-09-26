# Kenyon

A fruit-fly memory circuit built from its own connectome.

I took the fly's learning centre, the mushroom body, out of the MaleCNS brain scan (Janelia and Google), wired it exactly as the scan says, and added the published dopamine learning rule. Then I taught it things. It learns that an odour predicts punishment or reward, the memory stays with that odour, it holds a punishment and a reward memory at the same time, and it changes a simulated choice. It also fails in several places, and those are reported next to the successes.

The name comes from the Kenyon cells, the roughly 4,000 neurons in the mushroom body that carry the odour code the memory is written on.

This started as the second half of [DOOM-x-Fly](https://github.com/Aur1ety/DOOM-x-Fly), where the same scan, run unchanged as a recurrent network, plays the first level of Doom. The recurrent model and the data import come from there. The Doom half stays in that repository; the memory half is here.

## What it does, one pairing at a time

One pairing is one training block: odour A arrives together with the punishment dopamine neuron (PPL1-gamma1pedc). The memory is read at the output cell that neuron reaches, MBON-gamma1pedc (MBON11). Spreads are mean ± SD over ten independent odour draws.

| | result | what decides it |
|---|---|---|
| drop in odour A's drive onto MBON11 | 0.90 | **set by me** to match Hige et al. 2015 |
| drop for odours that were not paired | 0.09 ± 0.03 (worst single odour 0.21 ± 0.06) | the wiring (Kenyon-cell overlap) |
| share of all the lost drive that lands on MBON11 | 0.96 ± 0.01 | the wiring (dopamine-to-MBON map) |
| odour sharing 5, 4, 3, 1, 0 of A's 6 glomeruli | 0.60, 0.41, 0.29, 0.12, 0.05 | the wiring |
| A punished and C rewarded at the same time: A / C | 0.85 / 0.70 | the wiring (different compartments) |
| T-maze performance index (wild type 0.44 to 0.53) | 0.34 ± 0.03 at motor gain 8 (the wild-type range is met near the fitted gain, 10 to 11) | sign and order from the wiring, size from one fitted gain |
| same index for one odour pair, dopamine-to-MBON map shuffled | 0.35 → 0.02 | the control that can fail |

So the size of the memory is a calibration, and I don't count it as a result. What the wiring decides is where the memory lands, how specific it is, how it spreads to similar odours, and which way the choice goes. Those could have come out wrong.

The honest negatives:

- **Two memories in the same compartment don't coexist.** Train odour B after A, both punished, and A keeps only 0.19 ± 0.06 of its memory. Real flies hold several. It's the published rule's recovery term; turning that term down fixes it, but that is a rule change.
- **No pattern completion.** Give it half of a trained odour and it recalls about half (graded, slope 0.83). For this feedforward circuit that is forced by construction, so it measures the overlap, not a test that could have shown completion.
- **The size can't be made a prediction.** I scored three ways the dopamine pulses inside a pairing could combine against Hige's single-pulse and four-pulse arms. The eligibility-trace rule fits best (ratio 0.71 against a measured 0.74 ± 0.30), but all three sit within one error bar. The measurement is under-powered; section 4.6 describes the experiment that would separate them.
- **The APL loop doesn't make the odour code.** Computing the Kenyon code from the real APL feedback wiring sets how many cells fire, but a uniform threshold gives codes at least as distinct as the real per-cell weights (in nine of ten draws). The odour identity comes from the projection-neuron-to-Kenyon-cell wiring.
- **The Doom model's recurrent dynamics can't make a sparse code.** Inside the recurrent network, at every threshold I tried, either nearly all Kenyon cells are on (85 to 100%) or all are off, for every odour; never anything near the roughly 5% of a real Kenyon layer. So the Kenyon code is computed feedforward and injected (disclosed everywhere it matters).

Other checks: the same circuit learns visual objects through the fly's visual-to-Kenyon-cell wiring, but less specifically than smell (unpaired objects lose 0.18 ± 0.12, against 0.09 ± 0.03 for odours), because the visual pool is 332 Kenyon cells instead of 3,755. The lesions go the way the animal goes: removing APL inhibition makes the memory leak onto other odours (0.08 → 0.41), and silencing the main gamma Kenyon cells leaves 82% of the learned avoidance. Three of the six lesion rows can't fail by construction, and the write-up says which.

## Does the memory reach the body?

Barely. The two cells that stand out are reached through a side door.

The behaviour numbers above read the choice through a published rule of thumb (MBON transmitter says approach or avoid). The stricter test is the descending neurons, the cells that carry commands from the brain to the body. For that the memory goes back inside the full recurrent brain from DOOM-x-Fly.

- The anatomy gives no memory-specific route from MBON11 to the steering neurons DNa02 and DNa03. The share of their input that MBON11 can modulate is 0.0003%.
- On the Doom graph, which drops every connection under five synapses, the memory moves no descending neuron by more than 0.41% of its rate.
- On the unpruned graph (no synapse threshold), two cells move: DNp52 on the left by 2.8% of its rate and DNp62 on the right by 0.91%. MBON11 contacts them directly with nine synapses, in connections of 4, 4 and 1. That's why the Doom graph couldn't see them. Silencing just those nine synapses collapses both cells: DNp52's change falls more than seventeen-fold and drops out of the eight largest movers, and the largest change left is 0.24% of its cell's rate, in a different cell. So those synapses carry it.
- Across all 1,314 descending neurons the change is about one part in ten thousand, 1.1 times what the pruned graph gives.

At the one cell MBON11 hits hardest, the memory cancels and reverses that cell's response to the odour (1.1 times the odour's own effect, opposite sign). So it's real, and specific to the trained odour (13 times the untouched odours) and to MBON11. In absolute terms it tilts the motor output very slightly; against what the odour itself does, it is comparable or larger at the two cells MBON11 contacts directly. It also rests on nine synapses in one reconstruction, below the five-synapse threshold of the Doom graph, so I wouldn't read it as a pathway in the animal.

Everything, with the corrections the reviews forced, is in [docs/RESULTS.md](docs/RESULTS.md).

## What's real and what's mine

From the scan: which neurons exist, and the synapse counts for projection neurons → Kenyon cells, visual projection neurons → Kenyon cells, Kenyon cells → MBONs, dopamine neurons → MBONs, Kenyon cells ↔ APL, and MBONs → descending neurons. Each cell's transmitter comes from the scan's consensus call.

Chosen or fitted by me:

- one learning rate, set once so one pairing gives Hige's 90%;
- a top-5% winners-take-all on the Kenyon cells, standing in for APL inhibition (section 4.5 tests replacing it with the real APL loop);
- a binary Kenyon code (a cell fires or not);
- synthetic odours: six random glomeruli each, with the antennal lobe bypassed;
- one motor gain for the choice, fitted so the T-maze index lands in the real range;
- the valence rule of thumb from Aso et al. 2014 (GABA or acetylcholine MBONs mean approach, glutamate means avoid);
- a 0.8 s eligibility trace in the timed-learning experiment (4.1), set by hand because I found no measurement of it;
- in the recurrent runs, DOOM-x-Fly's uniform rate model with one global gain, with the Kenyon code injected rather than computed.

## Video

[media/mb_memory.mp4](media/mb_memory.mp4) (17 s, 350 KB): an odour lights up its Kenyon cells at their scanned positions, punishment dopamine arrives, the output cell's response to that odour drops to about 10% while an unpaired odour barely moves, then a reward memory on a third odour. It shows section 1 only. The choice bar is read through the valence rule of thumb, not through the simulated descending neurons, so the last caption ("it changes what the fly does") means that readout.

## How to run it

You need the MaleCNS v1.0 flat connectome (CC BY 4.0, [male-cns.janelia.org](https://male-cns.janelia.org/download/)), three Feather files, in `$KENYON_DATA/malecns_v1/`. The weights file is the big one, about a gigabyte.

```bash
export KENYON_DATA=~/kenyon/data KENYON_OUT=~/kenyon/outputs
mkdir -p $KENYON_DATA/malecns_v1
for f in body-annotations-male-cns-v1.0-minconf-0.5 body-neurotransmitters-male-cns-v1.0 connectome-weights-male-cns-v1.0-minconf-0.5; do
  curl -L -o $KENYON_DATA/malecns_v1/$f.feather \
    https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/$f.feather
done
pip install -e ".[dev]"          # Python 3.11+; the CPU build of PyTorch is enough
```

If you already have DOOM-x-Fly's data and set `FLYBRAIN_DATA` and `FLYBRAIN_OUT` for it, leave `KENYON_DATA` and `KENYON_OUT` unset and the code uses those. With none of the four set, it uses `~/kenyon/`.

Build the tables once. The import and the cache build load the whole weights table, so use a machine with plenty of RAM:

```bash
python -m kenyon.connectome.import_malecns     # graph_full.npz, neurons.parquet, ledger.json in $KENYON_OUT/graph
python -m kenyon.connectome.mb_build           # $KENYON_OUT/mb/mb_wiring.npz, the mushroom-body wiring
```

`neurons.parquet` from the import is needed for the transmitters behind the choice readout, so run the import before anything that reads a choice. The quickest look is the walkthrough, which teaches an odour and shows the choices change:

```bash
python -m kenyon.experiments.demo              # add --modality visual for a visual object
```

The feedforward results take seconds to a minute or two each on a CPU, and the ten-draw spread about six minutes (the control variants add `--sparsity 1.0`, `--seed 1` or `--shuffle dan_mbon|pn_kc|kc_mbon`):

```bash
W=$KENYON_OUT/mb/mb_wiring.npz
python -m kenyon.experiments.olfactory --binary-code --wiring $W                    # smell (section 1)
python -m kenyon.experiments.olfactory --binary-code --wiring $W --modality visual  # vision (section 2)
python -m kenyon.experiments.behaviour --wiring $W --binary-code                    # choice (1.5; --modality visual for 2.3)
python -m kenyon.experiments.seeds --wiring $W --seeds 10                          # the ten-draw spreads
python -m kenyon.experiments.online --wiring $W       # teaching with a clock (4.1)
python -m kenyon.experiments.lesion --wiring $W       # lesions next to real-fly results (4.2)
python -m kenyon.experiments.recall --wiring $W       # partial cue (4.3)
python -m kenyon.experiments.pathway                  # MBON11 to the steering neurons, from the Feather files (4.4)
python -m kenyon.experiments.apl --wiring $W          # the Kenyon code from the real APL loop (4.5)
python -m kenyon.experiments.magnitude --wiring $W    # is the size of the memory a prediction? (4.6)
```

Each takes `--out FILE.json` (`seeds` takes `--out-dir`); the files in `results/` are those outputs.

The recurrent runs are slow. On a shared CPU, section 3.1 is four runs of about an hour, 3.2 about an hour, and 4.8 about two hours per graph (`--device cuda:0` is faster). They need the Doom graph and, for 4.8, the unpruned one:

```bash
python -m kenyon.connectome.subgraph --name v5   --w-min 5 --max-dynamic 120000 --max-edges 6000000    # the Doom graph
python -m kenyon.connectome.subgraph --name full --w-min 1 --max-dynamic 200000 --max-edges 40000000   # no synapse threshold
G=$KENYON_OUT/graph M=$KENYON_OUT/mb
for v in none -2 -5 -10; do                                   # 3.1, one run per Kenyon-cell threshold
  a=$([ $v = none ] || echo "--kc-vrest $v")
  python -m kenyon.experiments.sparse --odours 6 --reps 5 $a --out $M/kcsparse2_${v}_cpu.json
done
python -m kenyon.experiments.embed --lr-auto --out $M/embed2_cpu.json                              # 3.2
python -m kenyon.experiments.motor --subgraph $G/subgraph_v5.npz   --out $M/motor2_v5.json          # 4.8
python -m kenyon.experiments.motor --subgraph $G/subgraph_full.npz --out $M/motor2_full.json
python -m kenyon.experiments.motor --subgraph $G/subgraph_full.npz --anatomy-only --out $M/motor_anatomy_full.json   # no simulation
python -m kenyon.experiments.motor --subgraph $G/subgraph_full.npz --seeds 1 --cut-direct --out $M/motor2_full_cut.json
python -m kenyon.experiments.motor --cells results/motor2_full.npz                                 # 4.8's per-cell figures, seconds
```

The video needs `imageio-ffmpeg` and the Doom graph (for the cell positions): `python -m kenyon.viz.video --out media/mb_memory.mp4`.

`python -m pytest` runs the tests in about a minute on a laptop CPU. They use small synthetic circuits, so they need no data; the few that check a real import skip when it isn't there.

## Website

`web/` is an interactive 3D version of sections 1 and 2 of [docs/RESULTS.md](docs/RESULTS.md): the same feedforward model, re-implemented in JavaScript and run in the browser on the exported MaleCNS wiring. Every cell is drawn at its scanned cell-body position, except 11 with no scanned cell body (drawn at their type's mean, as hollow rings) and 8 drawn at a scanned point on the neurite. Its tests replay the Python model's own outputs (`web/public/data/fixtures.json`). Almost every number it doesn't compute itself is read from the files in `results/`, copied verbatim into `web/public/data/results`. The exceptions are typed into the code and all come from docs/RESULTS.md: Hige's 90% target, the motor gains β 8 and 11, the body section's 0.5% and 5% cut-offs and five-synapse threshold, and the check that the three descending neurons it lists are the largest movers by share of rate (that needs `results/motor2_full.npz`, which the page doesn't read). It is a model of the wiring, not a recording of a fly.

```bash
cd web
npm ci                  # Node 22.12+ or 24+
npm run dev             # local server
npm run check           # the engine tests, then a production build into web/dist
npm run preview         # serve web/dist
npm run sync-results    # after regenerating results/ or the video, refresh the copies the site ships
```

To deploy on Vercel, import the repository and set **Root Directory** to `web`; pick Node 22 or 24. `web/vercel.json` makes the build command `npm run check`, so a deploy fails if the engine tests or the result copies fail, and serves `dist`. If Root Directory is left at the repository root, the root `vercel.json` does the same from there.

The site's data (`circuit.json`, `fixtures.json` and `manifest.json` in `web/public/data`) was exported by `web/scripts/export_web_data.py`. It needs PyTorch, the two build outputs above (`$KENYON_OUT/mb/mb_wiring.npz` and `$KENYON_OUT/graph/neurons.parquet`) and two of the MaleCNS Feather files (the annotations and the weights):

```bash
python web/scripts/export_web_data.py                 # writes web/public/data/
python web/scripts/export_web_data.py --crosscheck    # also re-runs the result modules and compares with results/
```

## Where things are

- `kenyon/connectome` – reading the scan, cutting the subgraphs, the mushroom-body wiring cache
- `kenyon/model` – the feedforward mushroom body and its learning rule (`mushroom_body.py`), the same rule on the recurrent network (`plasticity.py`), and the recurrent network itself (`core.py`, `spmm.py`, `gain.py`)
- `kenyon/experiments` – one module per result in the write-up, plus the text walkthrough
- `kenyon/viz` – the video
- `results/` – the stored outputs the write-up quotes; `results/superseded/` holds the pre-review files it mentions
- `configs/readout_v1.json` – DOOM-x-Fly's frozen 36-cell readout set, which the subgraph builder uses to mark output cells
- `docs/` – the write-up (`RESULTS.md`) and the file formats (`CONTRACTS.md`)
- `scripts/dnp52_trace.py` – the anatomy trace behind the DNp52 cautions in 4.8
- `web/` – the website: the browser engine (`web/src/engine`), the 3D view (`web/src/scene`) and the page (`web/src/ui`)

## Credits

MaleCNS v1.0 by HHMI Janelia Research Campus and Google Research (CC BY 4.0). The files in `results/` contain facts derived from it (cell types, body IDs, synapse counts). The import's node and edge policy matches doomfly (nftechie/doomfly) so its row counts can be checked against doomfly's ledger. The learning rule is Gkanias, McCurdy, Nitabach and Webb 2022 (eLife). The ground truth comes from Hige et al. 2015 (Neuron), Owald et al. 2015, Aso et al. 2014, Tully and Quinn's T-maze, Lin et al. 2014, and Yamada, Davidson and Hige 2024 (J Physiol); the full list is in the write-up.
