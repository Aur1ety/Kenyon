"""kenyon: a fruit-fly memory circuit built from its own connectome (MaleCNS v1.0 mushroom body)."""

import os
from pathlib import Path


def _env(name: str, legacy: str, default: Path) -> Path:
    """KENYON_* wins; the FLYBRAIN_* name used by DOOM-x-Fly is the fallback, so one data directory can serve both."""
    value = os.environ.get(name) or os.environ.get(legacy)
    return Path(value) if value else default


DATA_DIR = _env("KENYON_DATA", "FLYBRAIN_DATA", Path.home() / "kenyon" / "data")
OUT_DIR = _env("KENYON_OUT", "FLYBRAIN_OUT", Path.home() / "kenyon" / "outputs")
MALECNS_DIR = DATA_DIR / "malecns_v1"
