"""Packaging rule checks without CUDA, Conda, model files or downloads."""
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_runtime', Path(__file__).resolve().parents[2] / 'tools/Metrivum.LocalAnalyzer/package-runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class PackagingTests(unittest.TestCase):
    def test_only_unmanaged_pe_libraries_skip_entry_point_relocation(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source'; source.write_bytes(b'MZ-binary')
            def file(target, conda=False):
                return SimpleNamespace(source=str(source), target=target, is_conda=conda, file_mode='unknown')
            dll = file('torch/library.dll'); pyd = file('cv2/module.pyd')
            owned = file('Library/conda.dll', True); executable = file('Scripts/python-tool.exe'); script = file('module.py')
            runtime.stream_windows_wheel_libraries([dll, pyd, owned, executable, script])
            self.assertIsNone(dll.file_mode); self.assertIsNone(pyd.file_mode)
            self.assertEqual([owned.file_mode, executable.file_mode, script.file_mode], ['unknown'] * 3)

    def test_non_pe_file_remains_subject_to_normal_inspection(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fake.dll'; source.write_text('text with a prefix')
            file = SimpleNamespace(source=str(source), target='fake.dll', is_conda=False, file_mode='unknown')
            runtime.stream_windows_wheel_libraries([file])
            self.assertEqual(file.file_mode, 'unknown')


if __name__ == '__main__':
    unittest.main()
