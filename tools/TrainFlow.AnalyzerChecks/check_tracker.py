"""Opt-in real-GPU parity check; synthetic video only, no private recordings or model downloads."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys
import time
from unittest.mock import patch

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--motiontrace-root', type=Path, required=True)
parser.add_argument('--baseline', type=Path, required=True)
parser.add_argument('--seed', type=int, default=9)
args = parser.parse_args()
if not 0 <= args.seed < 24:
    parser.error('Seed must be in the generated 24-frame timeline')
root = args.motiontrace_root.resolve()
sys.path[:0] = [str(root / 'ai'), str(root / '.models/points/tapnet')]
import numpy as np
import torch
from tapnet.tapnextpp.votsp2026.model import TAPNextPP

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

old = load('baseline_adapter', args.baseline.resolve())
new = load('optimized_adapter', root / 'ai/comparison/tap_backends.py')
checkpoint, _ = new.installation(root / '.models/points', 'tapnextpp')
base = np.random.default_rng(42).integers(0, 256, (1080, 1920, 3), dtype=np.uint8)
frames = [np.roll(base, (i * 2, i), axis=(0, 1)) for i in range(24)]
pose = {'video': {'width': 1920, 'height': 1080}, 'frames': [
    {'timestampSeconds': i / 30, 'athletes': []} for i in range(24)]}
target = {'frameIndex': args.seed, 'points': [{'x': 800., 'y': 450.}, {'x': 1100., 'y': 450.}],
          'targetId': 'bar', 'athleteTrackId': 1}
model = TAPNextPP.from_checkpoint(checkpoint, device='cuda', input_resolution=256)
reference = None
results = []
# Reuse identical weights to measure tracking separately from process/model startup.
with patch.object(TAPNextPP, 'from_checkpoint', return_value=model):
    for adapter in (new, old, old, new):
        torch.cuda.reset_peak_memory_stats()
        started = time.perf_counter()
        with patch.object(adapter, 'decoded_frames', side_effect=lambda *a: enumerate(frames)):
            observations = adapter.tapnext('generated', pose, target, checkpoint, 'cuda', lambda *a: None)
        torch.cuda.synchronize()
        if reference is None:
            reference = observations
        if observations != reference:
            raise AssertionError('Tracker observations changed')
        results.append({'adapter': adapter.VERSION, 'seconds': time.perf_counter() - started,
                        'peakGpuBytes': torch.cuda.max_memory_allocated()})
print(json.dumps({'exactOutputParity': True, 'frames': 24, 'seed': args.seed, 'runs': results}, indent=2))
