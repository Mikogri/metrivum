"""Packaging regressions; tiny synthetic files, no ML dependencies or credentials."""
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_runtime', Path(__file__).resolve().parents[2] / 'tools/Metrivum.LocalAnalyzer/package-runtime.py')
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)

class CompactPackageTests(unittest.TestCase):
    def test_compact_preserves_active_weights_source_and_notices(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for folder, names in {'vision': ['manifest.json', 'unused.safetensors'], 'points': ['tapnextpp_ckpt.pt', 'tapnextpp_512.ckpt', 'manifest.json', 'LICENSE', 'tapnet/model.py', '.git/config']}.items():
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

if __name__ == '__main__':
    unittest.main()
