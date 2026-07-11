from __future__ import annotations

import argparse
import json
import shutil
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT_DIR = Path(__file__).resolve().parent
LIVE_DATA_PATH = ROOT_DIR / "data" / "sammeltjes.json"
MAX_REQUEST_BYTES = 2_000_000


class SammeltjesDevHandler(SimpleHTTPRequestHandler):
    data_path = LIVE_DATA_PATH
    test_mode = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        if urlsplit(self.path).path == "/data/sammeltjes.json":
            payload = self.data_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return
        super().do_GET()

    def do_POST(self) -> None:
        route = urlsplit(self.path).path
        if route == "/api/reset-sammeltjes" and self.test_mode:
            shutil.copyfile(LIVE_DATA_PATH, self.data_path)
            self._send_json({"ok": True, "reset": True})
            return
        if route != "/api/save-sammeltjes":
            self.send_error(HTTPStatus.NOT_FOUND, "Onbekende route")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Ongeldige Content-Length")
            return
        if content_length <= 0 or content_length > MAX_REQUEST_BYTES:
            self.send_error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "JSON-bestand is te groot")
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_error(HTTPStatus.BAD_REQUEST, "Ongeldige JSON")
            return

        validation_error = validate_payload(payload)
        if validation_error:
            self.send_error(HTTPStatus.BAD_REQUEST, validation_error)
            return

        self.data_path.parent.mkdir(parents=True, exist_ok=True)
        self.data_path.write_text(
            f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8"
        )
        self._send_json(
            {
                "ok": True,
                "path": str(self.data_path.relative_to(ROOT_DIR)).replace("\\", "/"),
                "testMode": self.test_mode,
            }
        )

    def _send_json(self, value: object) -> None:
        response = json.dumps(value).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def validate_payload(payload: object) -> str | None:
    if not isinstance(payload, list):
        return "Verwacht een lijst met Sammeltjes"
    ids: set[str] = set()
    for index, item in enumerate(payload, start=1):
        if not isinstance(item, dict):
            return f"Sammeltje {index} is geen object"
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id.strip():
            return f"Sammeltje {index} mist een ID"
        if item_id in ids:
            return f"Dubbel ID: {item_id}"
        ids.add(item_id)
        if not isinstance(item.get("name"), str) or not item["name"].strip():
            return f"Sammeltje {item_id} mist een naam"
        if not isinstance(item.get("lat"), (int, float)) or not isinstance(
            item.get("lng"), (int, float)
        ):
            return f"Sammeltje {item_id} mist een geldige locatie"
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lokale server voor Sammeltjes van Wieringen")
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--test", action="store_true", help="Schrijf alleen naar een tijdelijke testkopie")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_path = LIVE_DATA_PATH
    if args.test:
        data_path = ROOT_DIR / "test-results" / "sammeltjes.test.json"
        data_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(LIVE_DATA_PATH, data_path)

    SammeltjesDevHandler.data_path = data_path
    SammeltjesDevHandler.test_mode = args.test
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SammeltjesDevHandler)
    mode = "testkopie" if args.test else "live JSON"
    print(f"Sammeltjes dev-server: http://127.0.0.1:{args.port}/ ({mode})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer gestopt.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
