"""Device choice for the recurrent runs (sections 3.1, 3.2 and 4.8)."""
from __future__ import annotations

import torch


def resolve_device(device: str) -> str:
    """Return the requested device, or refuse a CUDA device when CUDA is not available (instead of failing later)."""
    if device.startswith("cuda") and not torch.cuda.is_available():
        raise RuntimeError(f"device {device!r} requested but CUDA is not available; use --device cpu")
    return device
