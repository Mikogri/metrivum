"""Build private-data-free, relocatable Windows runtime assets from an installed MotionTrace.

Requires conda-pack 0.8.1 in the packaging interpreter. Does not train/download models.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tarfile
import subprocess
import sys


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def archive(output, sources, reuse=False):
    if output.exists() and reuse:
        print('Reusing', output.name, flush=True)
        return
    temporary = output.with_suffix('.partial')
    with tarfile.open(temporary, 'w:gz', compresslevel=1) as target:
        for source, prefix in sources:
            for path in source.rglob('*'):
                relative = path.relative_to(source)
                if not path.is_file() or path.is_symlink() or any(part in ('.git', '__pycache__', '.pytest_cache') for part in relative.parts):
                    continue
                if path.suffix in ('.pyc', '.log') or path.name.startswith('.env'):
                    continue
                if source.name == 'ai' and path.suffix not in ('.py', '.txt', '.md', '.yaml', '.yml', '.toml'):
                    continue
                target.add(path, arcname=str(Path(prefix) / relative), recursive=False)
    temporary.replace(output)


def audited_pip_replacements(prefix):
    # Existing pose env uses pip replacements for these packaging tools. Never waive a missing ML/runtime binary.
    replacements = []
    clean_environment = {key: value for key, value in os.environ.items() if key not in ('PYTHONPATH', 'PYTHONHOME')}
    for record in (prefix / 'conda-meta').glob('*.json'):
        metadata = json.loads(record.read_text())
        missing = [name for name in metadata.get('files', []) if not (prefix / name).exists()]
        if not missing:
            continue
        if (metadata['name'], metadata['version']) not in {('packaging', '26.3'), ('setuptools', '83.0.0')} or any(Path(name).suffix.lower() in ('.dll', '.pyd', '.exe') for name in missing):
            raise ValueError('Unreviewed missing Conda package files: ' + metadata['name'])
        actual = subprocess.check_output([str(prefix / 'python.exe'), '-c',
            'import importlib.metadata as m,sys; print(m.version(sys.argv[1]))', metadata['name']], text=True, env=clean_environment).strip()
        if actual == metadata['version']:
            raise ValueError('Incomplete active packaging tool: ' + metadata['name'])
        replacements.append({'name': metadata['name'], 'condaVersion': metadata['version'], 'installedPipVersion': actual, 'obsoleteFiles': len(missing)})
    subprocess.run([str(prefix / 'python.exe'), '-m', 'pip', 'check'], check=True, env=clean_environment)
    return replacements


def stream_windows_wheel_libraries(files):
    # conda-pack's Windows binary relocation only rewrites distlib executable shebangs.
    # DLL/PYD wheel libraries have no such entry point: stream them unchanged, avoiding multi-GB reads/UTF-8 probes.
    for file in files:
        if not file.is_conda and file.file_mode == 'unknown' and Path(file.target).suffix.lower() in ('.dll', '.pyd'):
            with open(file.source, 'rb') as source:
                if source.read(2) == b'MZ':
                    file.file_mode = None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', default='1.7.0')
    parser.add_argument('--motiontrace', type=Path, required=True)
    parser.add_argument('--environments', type=Path, required=True)
    parser.add_argument('--host', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--web-origin', default='http://localhost:5173')
    args = parser.parse_args()
    import conda_pack
    args.output.mkdir(parents=True, exist_ok=True)
    required = [args.host / 'TrainFlow.LocalAnalyzer.exe', args.motiontrace / 'ai/comparison/analyze_session.py',
                args.motiontrace / '.models/vision/manifest.json', args.motiontrace / '.models/points/tapnextpp_ckpt.pt']
    if any(not path.is_file() for path in required):
        raise ValueError('Complete published host, MotionTrace source and offline models are required')
    adapter = args.motiontrace / 'ai/comparison/tap_backends.py'
    if '\nVERSION = "tap-points-8"\n' not in adapter.read_text():
        raise ValueError('Apply the reviewed model-input-spool.patch and resident-worker.patch before packaging this analyzer.')
    probe = Path(__file__).resolve().parents[2] / 'infra/local-analysis/probe.py'
    subprocess.run([sys.executable, str(probe), '--model-root', str(args.motiontrace / '.models/points'),
                    '--output', str(args.output / 'tapnext-audit.json')], check=True, stdout=subprocess.DEVNULL)
    audit_path = args.output / 'packaging-audit.json'
    audit = json.loads(audit_path.read_text()) if audit_path.exists() else {}
    for label, name in [('pose', 'motiontrace'), ('vision', 'motiontrace-vision'), ('points', 'motiontrace-points')]:
        output = args.output / (label + '.tar.gz')
        receipt = args.output / (label + '.pack-v2.json')
        if not output.exists() or not receipt.exists():
            print('Packing', label, flush=True)
            prefix = args.environments / name
            audit[label] = audited_pip_replacements(prefix)
            partial = str(output) + '.partial'
            environment = conda_pack.CondaEnv.from_prefix(str(prefix), ignore_missing_files=bool(audit[label]))
            for pattern in ['**/__pycache__/**', '*.pyc', 'conda-meta/state', 'conda-meta/history', 'etc/aau_token', '.condarc', 'pip.ini', '.env', '.env.*', '.netrc', '**/credentials']:
                environment = environment.exclude(pattern)
            stream_windows_wheel_libraries(environment.files)
            environment.pack(output=partial, format='tar.gz', compress_level=1, force=True, n_threads=1)
            Path(partial).replace(output)
            receipt.write_text(json.dumps({'sanitizationVersion': 2, 'pipCheck': True, 'replacements': audit[label]}) + '\n')
    (args.output / 'packaging-audit.json').write_text(json.dumps(audit, indent=2) + '\n')
    archive(args.output / 'host.tar.gz', [(args.host, '')])
    archive(args.output / 'source.tar.gz', [(args.motiontrace / 'ai', 'ai'), (args.motiontrace / 'ThirdPartyNotices', 'ThirdPartyNotices')])
    archive(args.output / 'models.tar.gz', [(args.motiontrace / '.models/vision', 'vision'), (args.motiontrace / '.models/points', 'points')], reuse=True)
    checkpoints = Path.home() / '.cache/torch/hub/checkpoints'
    # These files are the existing RTMPose/RTMDet offline dependency, not videos or job caches.
    archive(args.output / 'torch.tar.gz', [(checkpoints, 'hub/checkpoints')], reuse=True)
    targets = {'pose': 'env/pose', 'vision': 'env/vision', 'points': 'env/points', 'host': '.',
               'source': 'motiontrace', 'models': 'motiontrace/.models', 'torch': 'torch'}
    assets = []
    for name, target in targets.items():
        path = args.output / (name + '.tar.gz')
        print('Hashing', path.name, flush=True)
        assets.append({'name': path.name, 'target': target, 'size': path.stat().st_size, 'sha256': digest(path)})
    manifest = {'version': args.version, 'baseUrl': args.base_url.rstrip('/') + '/', 'webOrigin': args.web_origin,
                'assets': assets}
    (args.output / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Runtime assets ready', flush=True)


if __name__ == '__main__':
    main()
