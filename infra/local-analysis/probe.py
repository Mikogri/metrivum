"""Offline evidence for the actual MotionTrace artifact; never claims inference."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import platform


REVISION = '730cda1c730877cfedbe01bf87fb1cadb78a565d'
WEIGHTS = '5d3fb48e76c5422841e38501514121e251beabb7'
CHECKPOINT = {
    'path': 'tapnextpp_ckpt.pt', 'size': 2532282370,
    'sha256': 'cb96a43444ccb4fbdb25d800b88c7ba196179a526e78f01b021a16b1c1eff6da',
}


def file_info(path, name):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return {'path': name, 'sizeBytes': path.stat().st_size, 'sha256': digest.hexdigest()}


def verified_file(root, entry):
    root = root.resolve()
    path = (root / entry['path']).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Artifact path escapes model root')
    actual = file_info(path, entry['path'])
    if actual['sizeBytes'] != entry['size'] or actual['sha256'] != entry['sha256']:
        raise ValueError(f"Artifact integrity mismatch: {entry['path']}")
    return actual


def probe(root, inspect_tensors):
    installed = json.loads((root / 'manifest.json').read_text(encoding='utf-8-sig'))
    if installed['repositoryRevision'] != REVISION:
        raise ValueError('Unreviewed TAPNext source revision')
    if installed['models']['tapnextpp']['revision'] != WEIGHTS:
        raise ValueError('Unreviewed TAPNext weight revision')
    artifact = verified_file(root, CHECKPOINT)
    sources = installed.get('sourceFiles', [])
    if not sources:
        raise ValueError('Source integrity manifest is empty')
    for entry in sources:
        verified_file(root, entry)
    license_text = (root / 'LICENSE').read_text(encoding='utf-8')
    model_card = (root / 'MODEL_CARD.md').read_text(encoding='utf-8')
    if 'Apache License' not in license_text or 'license: apache-2.0' not in model_card:
        raise ValueError('Expected Apache-2.0 license evidence is absent')
    report = {
        'schemaVersion': 1, 'kind': 'source-artifact-audit',
        'observedAt': datetime.now(timezone.utc).isoformat(),
        'model': 'TAPNext++', 'resolution': [256, 256],
        'sourceRevision': REVISION, 'weightRevision': WEIGHTS,
        'artifact': artifact, 'verifiedSourceFileCount': len(sources),
        'license': {'spdx': 'Apache-2.0', 'evidence': [
            file_info(root / name, name) for name in ('LICENSE', 'MODEL_CARD.md')]},
        'referenceRuntime': 'PyTorch; not a mobile or browser artifact',
        'host': {'system': platform.system(), 'python': platform.python_version()},
        'exportPackages': {name: bool(importlib.util.find_spec(name))
                           for name in ('torch', 'onnx', 'onnxscript', 'onnxruntime')},
        'exportedArtifacts': [str(p.relative_to(root)) for p in root.rglob('*')
                              if p.suffix.lower() in ('.onnx', '.ort', '.tflite', '.pte', '.mlmodel')],
        'verification': {'checkpointIntegrity': True, 'sourceIntegrity': True,
                         'referenceInference': False, 'onnxExport': False,
                         'browserWebGpuInference': False, 'browserWasmInference': False,
                         'androidInference': False, 'iosInference': False},
    }
    if inspect_tensors:
        import torch
        from torch._subclasses.fake_tensor import FakeTensorMode
        # Reads metadata without materializing checkpoint storage or GPU tensors.
        with FakeTensorMode():
            checkpoint = torch.load(root / CHECKPOINT['path'], map_location='cpu',
                                    weights_only=True, mmap=True)
        tensors = checkpoint.get('state_dict', checkpoint)
        counts = Counter()
        tensor_bytes = 0
        for tensor in tensors.values():
            counts[str(tensor.dtype)] += tensor.numel()
            tensor_bytes += tensor.numel() * tensor.element_size()
        report['tensorMetadata'] = {'tensorCount': len(tensors),
                                    'elementsByDtype': dict(counts), 'storageBytes': tensor_bytes}
        report['host'].update(torch=torch.__version__, cudaAvailable=torch.cuda.is_available())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--inspect-tensors', action='store_true',
                        help='Use installed PyTorch FakeTensorMode; no inference')
    args = parser.parse_args()
    report = probe(args.model_root.resolve(), args.inspect_tensors)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
