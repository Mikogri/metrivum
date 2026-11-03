"""Packaging regressions; tiny synthetic files, no ML dependencies or credentials."""
import importlib.util
import gzip
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_runtime', Path(__file__).resolve().parents[2] / 'tools/Metrivum.LocalAnalyzer/package-runtime.py')
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)
audit_spec = importlib.util.spec_from_file_location('verify_package', Path(__file__).with_name('verify_package.py'))
audit = importlib.util.module_from_spec(audit_spec)
audit_spec.loader.exec_module(audit)

class CompactPackageTests(unittest.TestCase):
    def test_stale_product_binaries_block_release(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'host'
            source.mkdir()
            (source / 'TrainFlow.legacy.dll').write_bytes(b'old build')
            output = root / 'host.tar.gz'
            packaging.archive(output, [(source, '')])
            with self.assertRaisesRegex(ValueError, 'Obsolete product filename'):
                audit.verify(output)

    def test_compact_preserves_active_weights_source_and_notices(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for folder, names in {'vision': ['manifest.json', 'unused.safetensors'], 'points': ['tapnextpp_ckpt.pt', 'tapnextpp_512.ckpt', 'bootstapir_checkpoint_v2.pt', 'manifest.json', 'LICENSE', 'tapnet/model.py', '.git/config']}.items():
                for name in names:
                    file = root / folder / name
                    file.parent.mkdir(parents=True, exist_ok=True)
                    file.write_text('synthetic fixture')
            output = root / 'models.tar.gz'
            sources = [(root / name, name) for name in ('vision', 'points')]
            packaging.archive(output, sources, points_only=True)
            with tarfile.open(output) as tar:
                actual = set(tar.getnames())
            self.assertEqual(actual, {'vision/manifest.json', 'points/tapnextpp_ckpt.pt', 'points/manifest.json', 'points/LICENSE', 'points/tapnet/model.py'})
            packaging.archive(output, sources)
            with tarfile.open(output) as tar:
                self.assertIn('points/tapnextpp_512.ckpt', tar.getnames())
                self.assertIn('points/bootstapir_checkpoint_v2.pt', tar.getnames())

    def test_compression_preserves_every_file_byte(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'source'
            source.mkdir()
            data = bytes(range(256)) * 4096
            (source / 'runtime.bin').write_bytes(data)
            output = root / 'runtime.tar.gz'
            packaging.archive(output, [(source, '')])
            with tarfile.open(output) as tar:
                self.assertEqual(tar.extractfile('runtime.bin').read(), data)
            with gzip.open(output, 'rb') as tar:
                plain = tar.read()
            self.assertLess(output.stat().st_size, len(gzip.compress(plain, compresslevel=1)))

if __name__ == '__main__':
    unittest.main()
