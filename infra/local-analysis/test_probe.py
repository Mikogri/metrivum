import hashlib
from pathlib import Path
import tempfile
import unittest

from probe import verified_file


class IntegrityTests(unittest.TestCase):
    def test_verification_rejects_tampering_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'weights.pt').write_bytes(b'actual artifact')
            entry = {'path': 'weights.pt', 'size': 15,
                     'sha256': hashlib.sha256(b'actual artifact').hexdigest()}
            self.assertEqual(verified_file(root, entry)['sizeBytes'], 15)
            (root / 'weights.pt').write_bytes(b'tampered bytes!')
            with self.assertRaises(ValueError):
                verified_file(root, entry)
            with self.assertRaises(ValueError):
                verified_file(root, {**entry, 'path': '../outside.pt'})


if __name__ == '__main__':
    unittest.main()
