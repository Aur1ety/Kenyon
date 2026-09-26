# Data contracts between modules

All arrays are numpy; files are `.npz` (compressed) or `.parquet`. Inputs are read from `$KENYON_DATA`
(default `~/kenyon/data`) and outputs go to `$KENYON_OUT` (default `~/kenyon/outputs`). If those are unset but
DOOM-x-Fly's `$FLYBRAIN_DATA` and `$FLYBRAIN_OUT` are set, those are used, so both repos can share one data
directory. DOOM-x-Fly's own defaults (`~/flybrain-doom/...`) are not searched.

## Graph convention (everywhere)

- A neuron's **index** is its row in `neurons.parquet` (0..N-1). `bodyId` is the MaleCNS id.
- Edge `(pre, post, w)`: `w` = synapse count (float32, >0). Sign belongs to the **presynaptic**
  neuron: `sign[pre] in {+1, -1}` from `consensus_nt` (ACh/DA/OA/5-HT/unclear -> +1;
  GABA/Glu/histamine -> -1). Signs are never stored inside `w`.
- **CSR is indexed by POST** (rows = post, cols = pre) so that `W @ r` gives each neuron's input:
  `indptr_post[N+1]`, `indices_pre[E]`, `weight[E]` (int64, int32, float32).
- **CSC is indexed by PRE** (rows = pre, cols = post): `indptr_pre[N+1]`, `indices_post[E]`,
  `perm_csr_to_csc[E]` such that `weight_csc = weight[perm_csr_to_csc]`.
- Edge order in `weight` is the CSR order. Any per-edge parameter (theta) follows CSR order.

## `graph_full.npz` (from `kenyon.connectome.import_malecns`)

Keys: `n_neurons`, `n_edges`, `bodyId[N]`, `sign[N]` (int8), `indptr_post`, `indices_pre`,
`weight`, `indptr_pre`, `indices_post`, `perm_csr_to_csc`, plus `ledger` (JSON string with:
raw_rows, unresolved_objects, non_neuronal_excluded, n_neurons, n_edges, n_contacts, and the
doomfly reference numbers and pass/fail per item).

Reference ledger (doomfly, must match to the row or the diff is reported, never fudged):
raw weight rows 151,856,684; unresolved objects 33,013; non-neuronal excluded 11,864;
neurons 166,700; edges 25,582,938; contacts 124,177,617. Node policy: every annotated entry
with a superclass, including uncertain classes; exclude explicit glia; no restriction to Traced
status. Edge policy: all released edges between retained entries, no weight threshold, keep
autapses.

## `neurons.parquet`

Columns: `idx`, `bodyId`, `type`, `instance`, `superclass`, `class`, `subclass`, `somaSide`,
`rootSide`, `assignedOlHex1`, `assignedOlHex2`, `status`, `statusLabel`, `consensus_nt`,
`sign`, `type_id` (int32, dense id over unique `type`; -1 for null type).

## `subgraph_<name>.npz` (from `kenyon.connectome.subgraph`)

Keys: `node_idx[M]` (index into `neurons.parquet`), `bodyId[M]`, `is_clamped[M]` (bool: rates set
from outside; incoming edges dropped. In DOOM-x-Fly the eye model drives them; the recurrent
measurements in this repo hold them at zero, i.e. dark), `is_output[M]` (bool: pre-registered readout DNs),
`is_dynamic[M]` (= ~is_clamped), `type_id[M]`, `sign[M]`, local CSR/CSC (`indptr_post`,
`indices_pre`, `weight`, `indptr_pre`, `indices_post`, `perm_csr_to_csc`) over the M local
indices, `w_min` (float), `report` (JSON string: counts per set, achieved w_min, fraction of
total synaptic weight retained, DN reachability within 4 hops, left/right completeness audit,
forced-inclusion hits/misses).

Edges INTO clamped nodes are not stored (their rates are inputs). Edges FROM clamped nodes to
dynamic nodes are stored.

## Readout set `configs/readout_v1.json`

`{"version": 1, "cells": [{"type": "DNa02", "side": "R", "bodyId": ..., "role": "turn"} ...],
 "sha256": "<hash of the cells list>"}`. Written once by `kenyon.connectome.subgraph --readout`,
then frozen. Roles: turn, forward, backward, dodge, attack_midline, attack_pursuit, and unassigned (DNpe050,
DNp67). The roles come from the Doom work; here the set only stamps `is_output`, and section 4.8 reports it separately.

## `mb_wiring.npz` (from `kenyon.connectome.mb_build`)

The mushroom-body submatrices from the full connectome (minconf 0.5, no weight threshold), read by
`kenyon.model.mushroom_body.MushroomBody(wiring=...)`: `pk_*` (olfactory PN -> KC, CSR [KC, PN]),
`vk_*` (visual projection neuron -> KC, CSR [KC, VPN]), `km_*` (KC -> MBON, COO [MBON, KC]),
`dan_mbon` (dense [MBON, DAN]), `dn_mbon_direct` and `dn_mbon_2hop` (dense [DN, MBON]; a two-hop
relay is an interneuron, never an MBON or a DN), `kc_apl` and `apl_kc`, the type labels (`kc_type`,
`mbon_type`, `opn_glom`, `vpn_type`, `dan_type`, `dn_type`), `mbon_in_total` (whole-connectome
input per MBON), `kc_body`, and the provenance fields `build_time` and `build_source_sha`.
