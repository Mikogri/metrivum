import importlib.util
import json
import pathlib
import struct
import unittest

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("prepare", HERE / "prepare.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class AnatomyImportTests(unittest.TestCase):
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
