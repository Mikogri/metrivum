import importlib.util
import json
import pathlib
import struct
import unittest
import hashlib
import io
import tempfile
from unittest.mock import patch

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("prepare", HERE / "prepare.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class AnatomyImportTests(unittest.TestCase):
    def test_download_retries_corrupt_or_partial_response_before_caching(self):
        good = b"verified archive"
        def response(data, status=200, length=None):
            stream = io.BytesIO(data)
            stream.status = status
            stream.headers = {"Content-Length": str(len(data) if length is None else length)}
            return stream
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory)
            with patch.object(prepare.urllib.request, "urlopen", side_effect=[
                response(b"partial", 206), response(b"truncated", length=100), response(good)
            ]) as download:
                prepare.ensure_source(source, "archive.zip", hashlib.sha256(good).hexdigest())
            self.assertEqual(download.call_count, 3)
            self.assertEqual((source / "archive.zip").read_bytes(), good)
            self.assertFalse((source / "archive.zip.download").exists())

    def test_checksum_mismatch_never_becomes_cached_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = pathlib.Path(directory)
            def response(*args, **kwargs):
                stream = io.BytesIO(b"changed")
                stream.status = 200
                stream.headers = {}
                return stream
            with patch.object(prepare.urllib.request, "urlopen", side_effect=response):
                with self.assertRaisesRegex(ValueError, "expected .*got"):
                    prepare.ensure_source(source, "archive.zip", hashlib.sha256(b"original").hexdigest())
            self.assertEqual(list(source.iterdir()), [])

    def test_conversion_preserves_positions_topology_and_separate_identity(self):
        obj = "v 1 2 3\nv 4 5 6\nv 7 8 9\nf 1 2 3\n"
        data = prepare.glb([({"id": "FJ1"}, obj), ({"id": "FJ2"}, obj)])
        length = struct.unpack_from("<I", data, 12)[0]
        doc = json.loads(data[20:20 + length])
        self.assertEqual([n["name"] for n in doc["nodes"]], ["FJ1", "FJ2"])
        self.assertEqual(len(doc["meshes"]), 2)
        buffer = data[28 + length:]
        view = doc["bufferViews"][0]
        self.assertEqual(struct.unpack_from("<9f", buffer, view["byteOffset"]), (1, 2, 3, 4, 5, 6, 7, 8, 9))
        self.assertEqual(prepare.obj_geometry(obj)[2], [0, 1, 2])

    def test_nontriangular_geometry_is_not_silently_retopologized(self):
        with self.assertRaises(ValueError):
            prepare.obj_geometry("v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4")

    def test_generated_import_never_updates_existing_catalogue_or_exercise_links(self):
        sql = (HERE / "muscles.sql").read_text(encoding="utf-8")
        self.assertNotIn("UPDATE", sql)
        self.assertNotIn("DELETE", sql)
        self.assertNotIn("exercise_muscles", sql)
        self.assertEqual(sql.count("INSERT INTO"), sql.count("ON CONFLICT (key) DO NOTHING"))
        report = json.loads((HERE / "import-report.json").read_text(encoding="utf-8"))
        self.assertNotIn("muscle organ", [row["labelEn"] for row in report["newMuscles"]])
        self.assertEqual(len(report["newMuscles"]), len({row["key"] for row in report["newMuscles"]}))

    def test_anatomical_layers_keep_tendons_ligaments_and_named_nerves_out_of_other(self):
        manifest = json.loads((prepare.ROOT / "apps/web/public/anatomy/bodyparts3d-4.0/manifest.json").read_text(encoding="utf-8"))
        for word, category in [("tendon", "tendons"), ("ligament", "ligaments"), ("nerve", "nervous")]:
            structures = [entry for entry in manifest["structures"] if word in entry["name"].lower()]
            self.assertTrue(structures, word)
            self.assertEqual({entry["category"] for entry in structures}, {category}, word)
        self.assertEqual(len(manifest["structures"]), len({entry["id"] for entry in manifest["structures"]}))


if __name__ == "__main__":
    unittest.main()
