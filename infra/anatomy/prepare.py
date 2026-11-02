"""Reproducible BodyParts3D 4.0 import. Python standard library only; no mesh simplification."""
import argparse
import collections
import csv
import hashlib
import http.client
import json
import pathlib
import re
import shutil
import struct
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = "https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/"
VERSION = "bodyparts3d-4.0"
CREDIT = "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International"
FILES = ["README_e.html", "isa_parts_list_e.txt", "partof_parts_list_e.txt",
         "isa_inclusion_relation_list.txt", "partof_inclusion_relation_list.txt",
         "isa_element_parts.txt", "partof_element_parts.txt",
         "isa_BP3D_4.0_obj_99.zip", "partof_BP3D_4.0_obj_99.zip"]


def descendants(edges, root):
    found, todo = {root}, [root]
    while todo:
        for child in edges.get(todo.pop(), []):
            if child not in found:
                found.add(child)
                todo.append(child)
    return found


def canonical(name):
    # Only spelling/laterality normalization. Semantic group aliases are reviewed separately.
    return re.sub(r"\s+", " ", re.sub(r"\b(left|right|muscle)\b", "", name.lower())).strip()


def read_table(path):
    with path.open(encoding="utf-8-sig") as stream:
        return list(csv.DictReader(stream, delimiter="\t"))


def obj_geometry(text):
    vertices, normals, faces = [], [], []
    for line in text.splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "v":
            vertices.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "vn":
            normals.append(tuple(map(float, fields[1:4])))
        elif fields[0] == "f":
            if len(fields) != 4:
                raise ValueError("Expected original triangulated OBJ; refusing to retopologize")
            face = []
            for field in fields[1:]:
                parts = field.split("/")
                vertex = int(parts[0]) - 1
                if len(parts) > 2 and parts[2] and int(parts[2]) - 1 != vertex:
                    raise ValueError("Separate normal indices need an explicitly reviewed conversion")
                face.append(vertex)
            faces.extend(face)
    if not vertices or not faces or min(faces) < 0 or max(faces) >= len(vertices):
        raise ValueError("Invalid source topology")
    if normals and len(normals) != len(vertices):
        raise ValueError("Source normal count differs")
    return vertices, normals, faces


def glb(meshes):
    doc = {"asset": {"version": "2.0", "generator": "Metrivum BodyParts3D lossless topology converter", "copyright": CREDIT},
           "scene": 0, "scenes": [{"nodes": []}], "nodes": [], "meshes": [], "accessors": [], "bufferViews": []}
    binary = bytearray()

    def accessor(values, component, kind, count, bounds=None):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(struct.pack("<" + str(len(values)) + component, *values))
        view = len(doc["bufferViews"])
        doc["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset})
        entry = {"bufferView": view, "componentType": 5126 if component == "f" else 5125, "count": count, "type": kind}
        if bounds:
            entry.update({"min": bounds[0], "max": bounds[1]})
        doc["accessors"].append(entry)
        return len(doc["accessors"]) - 1

    for metadata, text in meshes:
        vertices, normals, faces = obj_geometry(text)
        low = [min(v[i] for v in vertices) for i in range(3)]
        high = [max(v[i] for v in vertices) for i in range(3)]
        positions = accessor([c for v in vertices for c in v], "f", "VEC3", len(vertices), (low, high))
        attributes = {"POSITION": positions}
        if normals:
            attributes["NORMAL"] = accessor([c for n in normals for c in n], "f", "VEC3", len(normals))
        indices = accessor(faces, "I", "SCALAR", len(faces))
        doc["meshes"].append({"name": metadata["id"], "primitives": [{"attributes": attributes, "indices": indices}]})
        index = len(doc["nodes"])
        doc["nodes"].append({"name": metadata["id"], "mesh": index, "extras": metadata})
        doc["scenes"][0]["nodes"].append(index)
    while len(binary) % 4:
        binary.append(0)
    doc["buffers"] = [{"byteLength": len(binary)}]
    encoded = json.dumps(doc, separators=(",", ":"), ensure_ascii=True).encode()
    encoded += b" " * (-len(encoded) % 4)
    return struct.pack("<III", 0x46546C67, 2, 28 + len(encoded) + len(binary)) + struct.pack("<II", len(encoded), 0x4E4F534A) + encoded + struct.pack("<II", len(binary), 0x004E4942) + binary


def ensure_source(source, name, expected):
    destination = source / name
    if destination.exists():
        actual = hashlib.sha256(destination.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Source checksum changed: {name}; expected {expected}, got {actual} ({destination.stat().st_size} bytes); remove the invalid cached file before retrying")
        return
    temporary = source / (name + ".download")
    for attempt in range(1, 4):
        try:
            print(f"Downloading {name} (attempt {attempt}/3)", flush=True)
            with urllib.request.urlopen(BASE + name, timeout=120) as response, temporary.open("wb") as target:
                if response.status != 200:
                    raise ValueError(f"Unexpected HTTP status {response.status}; expected a complete response")
                shutil.copyfileobj(response, target)
                length = response.headers.get("Content-Length")
            size = temporary.stat().st_size
            if length is not None and size != int(length):
                raise ValueError(f"Incomplete download: expected {length} bytes, got {size}")
            actual = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if actual != expected:
                raise ValueError(f"Source checksum changed: {name}; expected {expected}, got {actual} ({size} bytes); review the provider update explicitly")
            temporary.replace(destination)
            return
        except (OSError, ValueError, http.client.IncompleteRead) as error:
            if attempt == 3:
                raise
            print(f"Download rejected: {error}; retrying", flush=True)
        finally:
            if temporary.exists():
                temporary.unlink()


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True)
    lock_path = ROOT / "infra/anatomy/source-lock.json"
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    for name in FILES:
        ensure_source(source, name, lock[name])
    names, representations, children = {}, {}, collections.defaultdict(set)
    elements, parents = collections.defaultdict(set), {"isa": [], "partof": []}
    for variant in ("isa", "partof"):
        for row in read_table(source / f"{variant}_parts_list_e.txt"):
            names[row["concept id"]] = row["en"]
            representations[row["concept id"]] = row["representation id"]
        for row in read_table(source / f"{variant}_inclusion_relation_list.txt"):
            a, b = row["parent id"], row["child id"]
            names[a], names[b] = row["parent name"], row["child name"]
            parents[variant].append([a, b])
            if variant == "isa":
                children[a].add(b)
        for row in read_table(source / f"{variant}_element_parts.txt"):
            elements[row["concept id"]].add(row["element file id"])
    muscles = descendants(children, "FMA5022") | descendants(children, "FMA10474") | descendants(children, "FMA85453")
    categories = {
        "muscles": muscles,
        "skeleton": descendants(children, "FMA5018") | descendants(children, "FMA10483"),
        "nervous": descendants(children, "FMA65132") | descendants(children, "FMA45638") | descendants(children, "FMA55676") | descendants(children, "FMA61284") | descendants(children, "FMA11195"),
        # The archived ISA tree places the calcaneal tendon under skeletal ligament; retain its IDs/tree, correct only the display category.
        "tendons": descendants(children, "FMA9721") | descendants(children, "FMA51061"),
        "ligaments": descendants(children, "FMA21496") | descendants(children, "FMA86375") | descendants(children, "FMA58838"),
        "skin": descendants(children, "FMA7163") | descendants(children, "FMA71012"),
        "vascular": descendants(children, "FMA3710") | descendants(children, "FMA3711") | descendants(children, "FMA50720") | descendants(children, "FMA50723"),
    }
    part_children = collections.defaultdict(set)
    for a, b in parents["partof"]:
        part_children[a].add(b)
    categories["nervous"] |= descendants(part_children, "FMA7157")
    categories["organs"] = set().union(*(descendants(part_children, c) for c in ["FMA7152", "FMA7158", "FMA7159", "FMA7160", "FMA9668", "FMA7088"]))
    blobs, metadata, archives = {}, {}, {}
    for variant in ("isa", "partof"):
        file = source / f"{variant}_BP3D_4.0_obj_99.zip"
        archives[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
        with zipfile.ZipFile(file) as archive:
            for path in archive.namelist():
                if not path.endswith(".obj"):
                    continue
                raw = archive.read(path)
                text = raw.decode("utf-8")
                fid = re.search(r"# File ID : (\S+)", text)[1]
                header = lambda field: re.search(r"# " + field + r" : ([^\r\n]*)", text)[1].strip()
                concept, representation, label = header("Concept ID"), header("Representation ID"), header("English name")
                if concept:
                    elements[concept].add(fid)
                    names[concept] = label
                if fid in blobs:
                    # Archive headers describe different hierarchies; the same FJ identity must have identical geometry.
                    geometry_lines = lambda data: [line for line in data.splitlines() if line and not line.startswith(b"#")]
                    if geometry_lines(blobs[fid]) != geometry_lines(raw):
                        raise ValueError(f"Conflicting original mesh {fid}; do not silently choose a variant")
                    metadata[fid]["sources"].append({"variant": variant, "conceptId": concept, "representationId": representation, "name": label})
                    continue
                blobs[fid] = raw
                category = next((c for c, concepts in categories.items() if concept in concepts), "other")
                metadata[fid] = {"id": fid, "conceptId": concept, "representationId": representation, "name": label or fid, "category": category,
                                 "sources": [{"variant": variant, "conceptId": concept, "representationId": representation, "name": label}]}
    for entry in metadata.values():
        concepts = {source["conceptId"] for source in entry["sources"]}
        entry["category"] = next((category for category, members in categories.items() if concepts & members), "other")
    baseline = json.loads((ROOT / "infra/anatomy/catalog-baseline.json").read_text(encoding="utf-8"))["muscles"]
    aliases = json.loads((ROOT / "infra/anatomy/aliases.json").read_text(encoding="utf-8"))
    normalized = collections.defaultdict(list)
    for concept in muscles:
        if elements[concept] & blobs.keys():
            normalized[canonical(names[concept])].append(concept)
    mappings, additions, ambiguous, covered = [], [], [], set()

    def map_muscle(key, concepts):
        for concept in sorted(concepts):
            ids = sorted(elements[concept] & blobs.keys())
            if ids:
                mappings.append({"muscleKey": key, "conceptId": concept, "representationId": representations.get(concept, ""), "meshIds": ids})
                covered.update(ids)

    for row in baseline:
        targets = aliases.get(row["key"], [row["label_en"].lower()])
        concepts = {c for target in targets for c in normalized.get(canonical(target), [])}
        map_muscle(row["key"], concepts)
    # Add only named bilateral muscle organs/subdivisions. Skip ambiguous composites and existing geometry.
    for name, concepts in sorted(normalized.items()):
        non_lateral = [c for c in concepts if not re.search(r"\b(left|right)\b", names[c], re.I)]
        if len(non_lateral) != 1:
            ambiguous.append({"name": name, "reason": "No unique non-lateral concept", "conceptIds": sorted(concepts)})
            continue
        concept = non_lateral[0]
        ids = elements[concept] & blobs.keys()
        if not ids or ids <= covered:
            continue
        specific_children = [c for c in children.get(concept, []) if not re.search(r"\b(left|right)\b", names[c], re.I)]
        if concept in {"FMA5022", "FMA10474", "FMA85453"} or specific_children:
            ambiguous.append({"name": name, "reason": "Anatomical class/composite, not an individual muscle", "conceptIds": sorted(concepts)})
            continue
        # Regions/collections are not new muscles. A zone is kept in metadata for explicit existing mappings.
        if any(word in names[concept].lower() for word in ["zone of", "musculature", "muscle of", "group", "compartment", "head of", "part of"]):
            ambiguous.append({"name": name, "reason": "Composite/subdivision needs review", "conceptIds": sorted(concepts)})
            continue
        key = "anatomy-" + concept.lower()
        additions.append({"key": key, "labelEn": names[concept], "labelPl": names[concept], "conceptId": concept})
        map_muscle(key, concepts)
    mapped = {m["muscleKey"] for m in mappings}
    report = {"version": VERSION, "existingCount": len(baseline), "existingMatched": sum(r["key"] in mapped for r in baseline),
              "newMuscles": additions, "missing": [r["key"] for r in baseline if r["key"] not in mapped],
              "unresolved": ambiguous, "archives": archives, "structureCount": len(blobs)}
    layers = []
    for category in [*categories, "other"]:
        selected = [(m, blobs[fid].decode("utf-8")) for fid, m in sorted(metadata.items()) if m["category"] == category]
        if not selected:
            continue
        data = glb(selected)
        digest = hashlib.sha256(data).hexdigest()[:16]
        filename = f"{category}-{digest}.glb"
        (output / filename).write_bytes(data)
        layers.append({"id": category, "url": filename, "structures": len(selected), "bytes": len(data)})
        print(category, len(selected), len(data), flush=True)
    manifest = {"version": VERSION, "attribution": CREDIT, "layers": layers, "structures": list(metadata.values()),
                "mappings": sorted(mappings, key=lambda m: (m["muscleKey"], m["conceptId"])), "hierarchy": parents,
                "concepts": [{"id": c, "name": n, "meshIds": sorted(elements[c] & blobs.keys())} for c, n in sorted(names.items())]}
    for name, data in [("manifest.json", manifest), ("import-report.json", report)]:
        (output / name).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    referenced = {layer["url"] for layer in layers}
    for previous in output.glob("*.glb"):
        # Only retire this converter's unreferenced hashed outputs, never original/source assets.
        if previous.parent.resolve() == output.resolve() and re.fullmatch(r"(?:muscles|skeleton|nervous|tendons|ligaments|skin|vascular|organs|other)-[a-f0-9]{16}\.glb", previous.name) and previous.name not in referenced:
            previous.unlink()
    (ROOT / "infra/anatomy/import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "infra/anatomy/mappings.json").write_text(json.dumps(manifest["mappings"], ensure_ascii=False, indent=2), encoding="utf-8")
    # SQL is data-only and idempotent. Existing labels, versions, states and exercise links are untouched.
    quote = lambda s: "'" + s.replace("'", "''") + "'"
    sql = []
    for row in additions:
        sql.append("INSERT INTO exercise_catalog.muscles (key,label_en,label_pl,is_active,version) VALUES (" + ",".join([quote(row["key"]), quote(row["labelEn"]), quote(row["labelPl"]), "true", "1"]) + ") ON CONFLICT (key) DO NOTHING;")
    (ROOT / "infra/anatomy/muscles.sql").write_text("\n".join(sql) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ["newMuscles", "unresolved", "archives"]}), "added", len(additions), "unresolved", len(ambiguous))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, default=ROOT / ".local/bodyparts3d-4.0/source")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "apps/web/public/anatomy/bodyparts3d-4.0")
    args = parser.parse_args()
    args.source.mkdir(parents=True, exist_ok=True)
    prepare(args.source, args.output)
