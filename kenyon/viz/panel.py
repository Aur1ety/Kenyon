"""Drawing helpers for the memory video: an H.264 writer and a front view of the scanned cell bodies.

Taken from DOOM-x-Fly's dashboard renderer, which draws the same brain view next to the game.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np


class FFmpegWriter:
    """Raw RGB frames -> H.264 MP4 through the ffmpeg binary bundled with imageio-ffmpeg (no imageio exe probe)."""

    def __init__(self, path: Path, w: int, h: int, fps: int, crf: int = 18):
        import glob
        import subprocess
        import imageio_ffmpeg
        exe = sorted(glob.glob(str(Path(imageio_ffmpeg.__file__).parent / "binaries" / "ffmpeg-*")))[-1]
        self.log = open(str(path) + ".ffmpeg.log", "wb")
        self.p = subprocess.Popen([exe, "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
                                   "-i", "pipe:0", "-c:v", "libx264", "-preset", "medium", "-crf", str(crf), "-pix_fmt", "yuv420p",
                                   "-threads", "4", "-movflags", "+faststart", str(path)], stdin=subprocess.PIPE, stdout=self.log, stderr=self.log)

    def append_data(self, frame: np.ndarray) -> None:
        self.p.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())

    def close(self) -> None:
        self.p.stdin.close(); rc = self.p.wait(); self.log.close()
        if rc != 0:
            raise RuntimeError(f"ffmpeg exited {rc}; see {self.log.name}")


def _font(size: int):
    from PIL import ImageFont
    return ImageFont.load_default(size=size)


def soma_positions(sub: dict, annotations: Path) -> tuple[np.ndarray, np.ndarray]:
    """(node indices with a known soma, their xyz) for the subgraph's nodes (MaleCNS voxel coordinates)."""
    import pyarrow.feather as feather
    t = feather.read_table(annotations, columns=["bodyId", "somaLocation"]).to_pandas().drop_duplicates("bodyId").set_index("bodyId")
    v = t["somaLocation"].reindex(np.asarray(sub["bodyId"]))
    ok = np.array([x is not None and not isinstance(x, float) and len(x) == 3 for x in v])
    return np.flatnonzero(ok), np.array([x for x in v[ok]], float)


class BrainPanel:
    """Front view of the subgraph's cell bodies at their scanned positions.

    render(act) lights each shown cell by `act` (0..1, one value per shown cell; the memory video passes 1 for the
    Kenyon cells that fire for the current odour). The clamped input cells of the subgraph are tinted blue-grey.
    calibrate() and activity() turn simulated rates into `act` relative to each cell's typical level; the memory
    video does not use them.
    """

    def __init__(self, nodes: np.ndarray, xyz: np.ndarray, is_clamped: np.ndarray, w: int, h: int):
        self.w, self.h = w, h
        lo, hi = np.percentile(xyz, 0.5, 0), np.percentile(xyz, 99.5, 0)
        keep = np.all((xyz >= lo) & (xyz <= hi), 1)                 # a few far outliers (neck) would shrink the view
        self.nodes, xyz = nodes[keep], xyz[keep]
        self.eye = is_clamped[self.nodes]
        c = (lo + hi) / 2
        p = (xyz - c) / (hi - lo)[[0, 1]].max()                      # normalised; scan x = left-right, y = dorsal-ventral
        s = 0.80 * self.w
        i = np.clip((p[:, 1] * s + self.h / 2 - 20).astype(int), 0, self.h - 1)
        j = np.clip((p[:, 0] * s + self.w / 2).astype(int), 0, self.w - 1)
        self.flat = i * self.w + j
        n = self.w * self.h
        self.base_dyn = np.bincount(self.flat[~self.eye], minlength=n).reshape(self.h, self.w).astype(np.float32)
        self.base_eye = np.bincount(self.flat[self.eye], minlength=n).reshape(self.h, self.w).astype(np.float32)
        self.mean = None; self.sd = None
        self.n_shown = len(self.nodes)

    def calibrate(self, rate_rows: np.ndarray) -> None:
        """rate_rows: [T, n_nodes_total] rates from a calibration run -> per-neuron typical level and spread."""
        r = rate_rows[:, self.nodes]
        self.mean = r.mean(0); self.sd = r.std(0) + 1e-3

    def activity(self, rates: np.ndarray) -> np.ndarray:
        """0..1 per shown neuron: rate above typical, in units of 3 spreads (0 = at or below typical)."""
        return np.clip((rates[self.nodes] - self.mean) / (3.0 * self.sd), 0.0, 1.0)

    def render(self, act: np.ndarray) -> np.ndarray:
        from scipy.ndimage import gaussian_filter
        hot = np.bincount(self.flat, weights=act, minlength=self.w * self.h).reshape(self.h, self.w)
        img = np.zeros((self.h, self.w, 3), np.float32)
        img[..., 0] = self.base_dyn * 0.09 + self.base_eye * 0.06 + hot * 1.0
        img[..., 1] = self.base_dyn * 0.09 + self.base_eye * 0.08 + hot * 0.85
        img[..., 2] = self.base_dyn * 0.09 + self.base_eye * 0.16 + hot * 0.35
        img = gaussian_filter(img, sigma=(0.9, 0.9, 0)) * 1.6           # light blur so single cell bodies are visible
        return (np.clip(img, 0, 1) * 255).astype(np.uint8)
