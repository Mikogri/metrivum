"""Verify real development Supabase JWTs without creating TrainFlow business records."""
import argparse
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--settings", required=True)
    parser.add_argument("--confirm-project", required=True)
    parser.add_argument("--api-url", required=True)
    args = parser.parse_args()
    target = json.loads((Path(__file__).parents[1] / "development-target.json").read_text())
    settings = json.loads(Path(args.settings).read_text(encoding="utf-8-sig"))
    origin = "https://" + target["supabaseProjectRef"] + ".supabase.co"
    if target["environment"] != "development" or args.confirm_project != target["supabaseProjectRef"]:
        raise RuntimeError("Explicit confirmation of the recorded development project is required.")
    if settings["Storage"]["Url"] != origin or settings["Supabase"]["Auth"]["ProjectUrl"] != origin:
        raise RuntimeError("Auth and Storage must match the confirmed development project.")
    api = urllib.parse.urlsplit(args.api_url)
    if api.scheme != "http" or api.hostname not in ("localhost", "127.0.0.1", "::1") or api.username or api.query or api.fragment or api.path not in ("", "/"):
        raise RuntimeError("Use a local HTTP API origin for this smoke test.")
    opener = urllib.request.build_opener(NoRedirect())

    def request(url, method="GET", body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        try:
            with opener.open(urllib.request.Request(url, method=method, data=data,
                             headers={"Content-Type": "application/json"} | (headers or {})), timeout=30) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()
        except urllib.error.URLError:
            raise RuntimeError("Smoke endpoint unavailable; no credentials were logged.") from None

    status, content = request(origin + "/auth/v1/.well-known/jwks.json")
    if status != 200 or not any(k.get("kty") in ("RSA", "EC") for k in json.loads(content).get("keys", [])):
        raise RuntimeError("Asymmetric public JWKS discovery failed.")
    key = settings["Storage"]["SecretKey"]
    admin_headers = {"apikey": key, "Authorization": "Bearer " + key}
    user_id = str(uuid.uuid4())
    email = "trainflow-audit-" + user_id + "@example.invalid"
    password = secrets.token_urlsafe(40) + "aA1!"
    # A supplied random UUID permits exact cleanup even if the creation response is lost.
    try:
        status, content = request(origin + "/auth/v1/admin/users", "POST",
                                  {"id": user_id, "email": email, "password": password, "email_confirm": True}, admin_headers)
        if status not in (200, 201) or json.loads(content).get("id") != user_id:
            raise RuntimeError(f"Temporary Auth user creation failed: HTTP {status}.")
        status, content = request(origin + "/auth/v1/token?grant_type=password", "POST",
                                  {"email": email, "password": password}, {"apikey": key})
        if status != 200:
            raise RuntimeError(f"Real password sign-in failed: HTTP {status}.")
        token = json.loads(content)["access_token"]
        path = args.api_url.rstrip("/") + "/openapi/v1.json"
        for authorization, expected in ((None, 401), (token, 200), (token + "corrupted", 401)):
            status, _ = request(path, headers={} if authorization is None else {"Authorization": "Bearer " + authorization})
            if status != expected:
                raise RuntimeError(f"API authentication smoke expected HTTP {expected}, received {status}.")
        print("Real Supabase sign-in/JWKS accepted; anonymous and tampered tokens rejected. No TrainFlow business records created.")
    finally:
        status, _ = request(origin + "/auth/v1/admin/users/" + user_id, "DELETE", headers=admin_headers)
        if status not in (200, 204, 404):
            raise RuntimeError(f"Temporary Auth user cleanup failed: HTTP {status}.")
        print("This run's temporary Auth user removed; no email sent.")


if __name__ == "__main__":
    main()
