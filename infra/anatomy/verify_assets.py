"""Compare every generated mesh with the official archive, including all original triangles."""
import json
import pathlib
import struct
import zipfile
import prepare

root = pathlib.Path(__file__).resolve().parents[2]
output = root / "apps/web/public/anatomy/bodyparts3d-4.0"
manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
originals = {}
for variant in ("isa", "partof"):
    with zipfile.ZipFile(root / f".local/bodyparts3d-4.0/source/{variant}_BP3D_4.0_obj_99.zip") as archive:
        for name in archive.namelist():
            if name.endswith(".obj"):
                originals.setdefault(pathlib.PurePosixPath(name).stem, archive.read(name).decode())
seen, triangles = set(), 0
for layer in manifest["layers"]:
    data = (output / layer["url"]).read_bytes()
    magic, version, size = struct.unpack_from("<III", data)
    assert (magic, version, size) == (0x46546C67, 2, len(data))
    json_length = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20:20 + json_length])
    binary = memoryview(data)[28 + json_length:]
    for node in doc["nodes"]:
        identity = node["name"]
        assert identity not in seen, identity
        seen.add(identity)
        vertices, normals, faces = prepare.obj_geometry(originals[identity])
        primitive = doc["meshes"][node["mesh"]]["primitives"][0]
        for index, values, code in [
            (primitive["attributes"]["POSITION"], [c for v in vertices for c in v], "f"),
            (primitive["indices"], faces, "I"),
            *([(primitive["attributes"]["NORMAL"], [c for n in normals for c in n], "f")] if normals else []),
        ]:
            accessor = doc["accessors"][index]
            view = doc["bufferViews"][accessor["bufferView"]]
            actual = binary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]]
            assert actual == struct.pack("<" + str(len(values)) + code, *values), identity
        triangles += len(faces) // 3
assert seen == originals.keys() == {s["id"] for s in manifest["structures"]}
print(f"Verified {len(seen)} independent structures and {triangles} original triangles; positions/normals match float32 conversion exactly.")
