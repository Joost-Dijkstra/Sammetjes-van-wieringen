from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from publisher import Publisher, revision

ROOT_DIR = Path(__file__).resolve().parent
LIVE_DATA_PATH = ROOT_DIR / "data" / "sammeltjes.json"
MAX_REQUEST_BYTES = 2_000_000
SAVE_LOCK = threading.Lock()


def validate_payload(payload):
    if not isinstance(payload, list) or not payload:
        return "Verwacht een niet-lege lijst met Sammeltjes."
    try:
        encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False)
        result = subprocess.run(
            ["node", str(ROOT_DIR / "scripts" / "validate-data.cjs")],
            input=encoded, capture_output=True, text=True, encoding="utf-8", timeout=10,
        )
        if result.returncode:
            return "De gegevenscontrole kon niet starten."
        errors = json.loads(result.stdout)
        return errors[0] if errors else None
    except (ValueError, OSError, subprocess.TimeoutExpired):
        return "Ongeldige gegevens of Node.js is niet beschikbaar voor de controle."


def atomic_save(path, payload, backup_dir):
    path.parent.mkdir(parents=True, exist_ok=True)
    backup_dir.mkdir(parents=True, exist_ok=True)
    if path.exists():
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        shutil.copyfile(path, backup_dir / f"{stamp}-{uuid.uuid4().hex[:8]}.json")
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as stream:
            temporary = stream.name
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and Path(temporary).exists():
            Path(temporary).unlink()


class SammeltjesDevHandler(SimpleHTTPRequestHandler):
    data_path = LIVE_DATA_PATH
    test_mode = False
    publisher = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        if not self.test_mode:
            super().log_message(format, *args)

    def json_response(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route = urlsplit(self.path).path
        if any(part.startswith(".") for part in route.split("/") if part) or route.startswith(("/output/", "/test-results/", "/node_modules/")):
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        try:
            if route == "/data/sammeltjes.json":
                self.json_response(json.loads(self.data_path.read_text(encoding="utf-8")))
                return
            if route == "/api/state":
                with SAVE_LOCK:
                    items = json.loads(self.data_path.read_text(encoding="utf-8"))
                assets = []
                for path in sorted((ROOT_DIR / "assets/sammeltjes-webp/full").glob("*.webp")):
                    thumb = ROOT_DIR / "assets/sammeltjes-webp/thumbs" / path.name
                    if thumb.is_file():
                        assets.append({"name": path.stem.replace("-", " ").title(),
                                       "image": path.relative_to(ROOT_DIR).as_posix(),
                                       "thumbnail": thumb.relative_to(ROOT_DIR).as_posix()})
                self.json_response({"items": items, "revision": revision(items), "assets": assets})
                return
            if route == "/api/publish-preview":
                self.json_response(self.publisher.preview())
                return
            if route == "/api/publish-status":
                job_id = parse_qs(urlsplit(self.path).query).get("id", [""])[0]
                job = self.publisher.jobs.get(job_id)
                self.json_response(job or {"error": "Publicatie niet gevonden."}, 200 if job else 404)
                return
            if route.startswith("/api/"):
                self.json_response({"error": "Onbekende opdracht."}, 404)
                return
        except Exception as error:
            self.json_response({"error": str(error)}, 400)
            return
        super().do_GET()

    def do_POST(self):
        route = urlsplit(self.path).path
        origin = self.headers.get("Origin")
        expected = f"http://{self.headers.get('Host')}"
        if (origin and origin != expected) or self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.json_response({"error": "Open de werkplaats via de lokale server."}, 403)
            return
        if route == "/api/shutdown-test-server" and self.test_mode:
            self.json_response({"ok": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        if route == "/api/reset-sammeltjes" and self.test_mode:
            with SAVE_LOCK:
                shutil.copyfile(LIVE_DATA_PATH, self.data_path)
            self.json_response({"ok": True})
            return
        if route not in ["/api/save-sammeltjes", "/api/publish"]:
            self.json_response({"error": "Onbekende opdracht."}, 404)
            return
        try:
            if self.headers.get_content_type() != "application/json":
                raise ValueError("Gebruik JSON voor deze opdracht.")
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_REQUEST_BYTES:
                raise ValueError("Het bestand is leeg of te groot.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Gebruik de nieuwste werkplaats en herlaad de pagina.")
            if route == "/api/publish":
                if not isinstance(payload.get("revision"), str) or not isinstance(payload.get("remoteHead"), str):
                    raise ValueError("Controleer eerst het publicatieoverzicht.")
                self.json_response(self.publisher.start(payload["revision"], payload["remoteHead"]))
                return
            items = payload.get("items")
            error = validate_payload(items)
            if error:
                raise ValueError(error)
            with SAVE_LOCK:
                current = json.loads(self.data_path.read_text(encoding="utf-8"))
                if payload.get("revision") != revision(current):
                    self.json_response({"error": "Een andere werkplaats heeft deze gegevens gewijzigd. Exporteer je wijzigingen en herlaad voordat je opnieuw opslaat."}, 409)
                    return
                backup_dir = ROOT_DIR / ("test-results/backups" if self.test_mode else ".backups")
                atomic_save(self.data_path, items, backup_dir)
            self.json_response({"ok": True, "revision": revision(items), "testMode": self.test_mode})
        except Exception as error:
            self.json_response({"error": str(error)}, 400)


def main():
    parser = argparse.ArgumentParser(description="Lokale Sammeltjes Werkplaats")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--publish-remote")
    parser.add_argument("--public-url")
    args = parser.parse_args()
    if (args.publish_remote or args.public_url) and not args.test:
        parser.error("Een afwijkende publicatiebestemming is alleen toegestaan in testmodus.")
    data_path = LIVE_DATA_PATH
    if args.test:
        data_path = ROOT_DIR / "test-results/sammeltjes.test.json"
        data_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(LIVE_DATA_PATH, data_path)
    SammeltjesDevHandler.data_path = data_path
    SammeltjesDevHandler.test_mode = args.test
    SammeltjesDevHandler.publisher = Publisher(ROOT_DIR, data_path, args.publish_remote, args.public_url, args.test)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SammeltjesDevHandler)
    print(f"Sammeltjes: http://127.0.0.1:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
