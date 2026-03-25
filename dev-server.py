from __future__ import annotations

import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = 4173
ROOT_DIR = Path(__file__).resolve().parent
DATA_PATH = ROOT_DIR / "data" / "sammeltjes.json"


class SammeltjesDevHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def do_POST(self) -> None:
        if self.path != "/api/save-sammeltjes":
            self.send_error(HTTPStatus.NOT_FOUND, "Onbekende route")
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(HTTPStatus.BAD_REQUEST, "Ongeldige JSON")
            return

        if not isinstance(payload, list):
            self.send_error(HTTPStatus.BAD_REQUEST, "Verwacht een lijst met Sammeltjes")
            return

        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        DATA_PATH.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")

        response = json.dumps(
            {
                "ok": True,
                "path": str(DATA_PATH.relative_to(ROOT_DIR)).replace("\\", "/")
            }
        ).encode("utf-8")

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SammeltjesDevHandler)
    print(f"Sammeltjes dev server draait op http://127.0.0.1:{PORT}/")
    print("Direct opslaan naar data/sammeltjes.json is actief.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer gestopt.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
