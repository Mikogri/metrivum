"""Exercise a private DEVELOPMENT bucket; create and remove only this run's random objects."""
import argparse
import base64
import io
import json
import struct
import urllib.error
import urllib.request
import uuid
import wave
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("--settings", required=True)
parser.add_argument("--confirm-project", required=True)
args = parser.parse_args()
target = json.loads((Path(__file__).parent / "development-target.json").read_text())
settings = json.loads(Path(args.settings).read_text(encoding="utf-8-sig"))["Storage"]
assert target["environment"] == "development"
assert args.confirm_project == target["supabaseProjectRef"]
assert settings["Url"] == "https://" + target["supabaseProjectRef"] + ".supabase.co"
base = settings["Url"] + "/storage/v1"
headers = {"apikey": settings["SecretKey"], "Authorization": "Bearer " + settings["SecretKey"], "Content-Type": "application/json"}

def request(url, method="GET", data=None, request_headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, method=method, headers=request_headers or {}), timeout=30) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()

status, content = request(base + "/bucket/" + settings["Bucket"], request_headers=headers)
assert status == 200 and json.loads(content)["public"] is False, "Private bucket required"
audio = io.BytesIO()
with wave.open(audio, "wb") as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(8000); wav.writeframes(b"\x00\x00" * 8000)
files = [
    ("image/png", "png", base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX2kAAAAASUVORK5CYII=")),
    ("application/pdf", "pdf", b"%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"),
    ("video/mp4", "mp4", struct.pack(">I", 24) + b"ftypisom\x00\x00\x00\x00isomiso2"),
    ("audio/wav", "wav", audio.getvalue()),
]
created = []
try:
    for mime, extension, data in files:
        key = "stage3a-smoke/" + uuid.uuid4().hex + "." + extension
        path = settings["Bucket"] + "/" + key
        status, body = request(base + "/object/upload/sign/" + path, "POST", b"{}", headers | {"x-upsert": "false"})
        assert status == 200, f"Signing failed: {status}"
        upload = base + json.loads(body)["url"]
        status, _ = request(upload, "PUT", data, {"Content-Type": mime})
        assert status == 200, f"Upload failed: {status}"
        created.append(key)
        status, _ = request(upload, "PUT", data, {"Content-Type": mime})
        assert status >= 400, "Overwrite must be refused"
        status, _ = request(base + "/object/public/" + path)
        assert status >= 400, "Public access must be refused"
        status, body = request(base + "/object/sign/" + path, "POST", b'{"expiresIn":30}', headers)
        assert status == 200
        status, downloaded = request(base + json.loads(body)["signedURL"])
        assert status == 200 and downloaded == data
        print(mime + ": signed upload/read, no overwrite, no public access passed")
finally:
    if created:
        status, _ = request(base + "/object/" + settings["Bucket"], "DELETE", json.dumps({"prefixes": created}).encode(), headers)
        assert status == 200, "Smoke object cleanup failed"
        print("Only this run's smoke objects removed; private bucket retained.")
