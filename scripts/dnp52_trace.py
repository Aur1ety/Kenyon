"""Why does one cell (DNp52, left) move on the unpruned graph and not on the Doom graph? Trace MBON11 -> target routes.

For each graph and each target cell: its total input synapses, the direct MBON11 synapses onto it, and the
strongest two-hop (MBON11 -> relay -> target) and three-hop routes by synapse-count products. This is the anatomy
behind the cautions in section 4.8 of docs/RESULTS.md; results/dnp52_trace.json is its output for DNp52.

    python scripts/dnp52_trace.py                   # DNp52 on subgraph_full.npz and subgraph_v5.npz
    python scripts/dnp52_trace.py --target DNp62
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

from kenyon import OUT_DIR
from kenyon.model.core import load_subgraph
from kenyon.model.plasticity import node_types


def trace(subgraph: Path, neurons: Path, target: str, source: str = "MBON11") -> dict:
    sub = load_subgraph(subgraph); m = len(sub["bodyId"])
    types = node_types(sub, neurons); body = np.asarray(sub["bodyId"])
    ann = pd.read_parquet(neurons, columns=["bodyId", "somaSide"]).drop_duplicates("bodyId").set_index("bodyId").reindex(body)
    side = ann["somaSide"].fillna("").astype(str).to_numpy()
    A = sparse.csr_matrix((np.asarray(sub["weight"], float), np.asarray(sub["indices_pre"]), np.asarray(sub["indptr_post"])),
                          shape=(m, m))                                     # A[post, pre] = synapse counts
    sign = np.asarray(sub["sign"]).astype(float)
    indeg = np.asarray(A.sum(axis=1)).ravel()
    src = np.flatnonzero(types == source); tgt = np.flatnonzero(types == target)
    r = {"MBON11_nodes": [(int(body[i]), side[i]) for i in src], "targets": []}
    for t in tgt:
        direct = float(A[t, src].sum())
        a_in = A[t].toarray().ravel()                                       # counts into the target from every node
        a_m = np.asarray(A[:, src].sum(axis=1)).ravel()                     # counts from the source into every node
        two = a_in * a_m; idx = np.argsort(-two)[:6]
        via = np.asarray(A @ a_m).ravel() * a_in; idx3 = np.argsort(-via)[:6]   # source -> i -> j -> target, by last relay j
        r["targets"].append({"body": int(body[t]), "side": side[t], "total_input_synapses": float(indeg[t]),
                             "direct_from_MBON11": direct, "two_hop_sum_products": float(two.sum()),
                             "two_hop_top": [{"relay": str(types[i]), "side": side[i], "MBON11_to_relay": float(a_m[i]),
                                              "relay_to_target": float(a_in[i]), "relay_sign": float(sign[i]),
                                              "relay_total_input": float(indeg[i])} for i in idx if two[i] > 0],
                             "three_hop_sum": float(via.sum()),
                             "three_hop_top_last_relay": [{"relay": str(types[j]), "side": side[j], "to_target": float(a_in[j]),
                                                           "sign": float(sign[j])} for j in idx3 if via[j] > 0]})
    return r


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--graph-dir", type=Path, default=OUT_DIR / "graph")
    ap.add_argument("--target", default="DNp52")
    ap.add_argument("--graphs", nargs="+", default=["full", "v5"])
    ap.add_argument("--out", type=Path, default=None)
    a = ap.parse_args(argv)
    neurons = a.graph_dir / "neurons.parquet"
    res = {name: trace(a.graph_dir / f"subgraph_{name}.npz", neurons, a.target) for name in a.graphs}
    text = json.dumps(res, indent=1)
    if a.out:
        a.out.parent.mkdir(parents=True, exist_ok=True); a.out.write_text(text)
    print(text)


if __name__ == "__main__":
    main()
