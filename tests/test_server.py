import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("dev_server", ROOT / "dev-server.py")
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)
from publisher import Publisher, git, revision


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "sammeltjes.json"
        self.items = json.loads((ROOT / "data/sammeltjes.json").read_text(encoding="utf-8"))
        self.path.write_text(json.dumps(self.items), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_shared_validator_rejects_bad_speed_and_missing_image(self):
        self.assertIsNone(server_module.validate_payload(self.items))
        self.items[0]["speedKmh"] = 200
        self.assertIn("snelheid", server_module.validate_payload(self.items))
        self.items[0]["speedKmh"] = 0
        self.items[0]["image"] = "assets/missing.webp"
        self.assertIn("ontbreekt", server_module.validate_payload(self.items))

    def test_atomic_save_has_recoverable_backup(self):
        before = self.path.read_bytes()
        self.items[0]["name"] = "Nieuw wolkje"
        backups = Path(self.temp.name) / "backups"
        server_module.atomic_save(self.path, self.items, backups)
        self.assertEqual(next(backups.glob("*.json")).read_bytes(), before)
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8"))[0]["name"], "Nieuw wolkje")

    def test_interrupted_save_leaves_original_intact(self):
        before = self.path.read_bytes()
        with patch.object(server_module.os, "replace", side_effect=OSError("Disk busy")):
            with self.assertRaises(OSError):
                server_module.atomic_save(self.path, self.items, Path(self.temp.name) / "backups")
        self.assertEqual(self.path.read_bytes(), before)
        self.assertEqual(list(Path(self.temp.name).glob("*.tmp")), [])

    def test_http_rejects_stale_revision_and_cross_site_write(self):
        class Handler(server_module.SammeltjesDevHandler):
            data_path = self.path
            test_mode = True
            def log_message(self, *args):
                pass
        http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        try:
            url = f"http://127.0.0.1:{http.server_port}/api/save-sammeltjes"
            body = json.dumps({"items": self.items, "revision": "stale"}).encode()
            with self.assertRaises(HTTPError) as stale:
                urlopen(Request(url, data=body, headers={"Content-Type": "application/json"}))
            self.assertEqual(stale.exception.code, 409)
            with self.assertRaises(HTTPError) as cross:
                urlopen(Request(url, data=body, headers={"Content-Type": "application/json", "Origin": "https://unrelated.example"}))
            self.assertEqual(cross.exception.code, 403)
        finally:
            http.shutdown()
            http.server_close()


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        base = Path(self.temp.name)
        self.repo = base / "source"
        self.repo.mkdir()
        (self.repo / "data").mkdir()
        self.items = json.loads((ROOT / "data/sammeltjes.json").read_text(encoding="utf-8"))
        self.data = self.repo / "data/sammeltjes.json"
        self.data.write_text(json.dumps(self.items), encoding="utf-8")
        for name in ["game-rules.js", "terrain.js"]:
            shutil.copyfile(ROOT / name, self.repo / name)
        for item in self.items:
            for key in ["image", "thumbnail"]:
                target = self.repo / item[key]
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"test-image")
        git(self.repo, "init", "-b", "main")
        git(self.repo, "add", ".")
        git(self.repo, "-c", "user.name=Test", "-c", "user.email=test@localhost", "-c", "commit.gpgsign=false", "commit", "-m", "Initial fixture")
        self.remote = base / "remote.git"
        git(base, "clone", "--bare", str(self.repo), str(self.remote))
        remote = self.remote
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                value = git(remote, "show", "main:data/sammeltjes.json").encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(value)))
                self.end_headers()
                self.wfile.write(value)
            def log_message(self, *args):
                pass
        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=self.http.serve_forever, daemon=True).start()
        self.publisher = Publisher(self.repo, self.data, str(self.remote), f"http://127.0.0.1:{self.http.server_port}/data.json", True)

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.temp.cleanup()

    def test_publish_changes_only_data_and_confirms_served_revision(self):
        self.items[0]["radius"] = 125
        self.data.write_text(json.dumps(self.items), encoding="utf-8")
        (self.repo / "unrelated.txt").write_text("Never publish this", encoding="utf-8")
        head = git(self.repo, "rev-parse", "HEAD")
        preview = self.publisher.preview()
        self.assertIn("woonradius", preview["changes"][0])
        self.publisher.jobs["test"] = {}
        self.publisher.run("test", self.items, preview["remoteHead"])
        self.assertEqual(self.publisher.jobs["test"]["status"], "online")
        changed = git(self.remote, "diff-tree", "--no-commit-id", "--name-only", "-r", "main")
        self.assertEqual(changed, "data/sammeltjes.json")
        self.assertEqual(git(self.repo, "rev-parse", "HEAD"), head)
        self.assertTrue((self.repo / "unrelated.txt").exists())

    def test_changed_remote_and_stale_local_revision_are_rejected(self):
        self.publisher.jobs["test"] = {}
        head = git(self.remote, "rev-parse", "main")
        self.publisher.run("test", self.items, "not-the-current-head")
        self.assertEqual(self.publisher.jobs["test"]["status"], "failed")
        self.assertEqual(git(self.remote, "rev-parse", "main"), head)
        with self.assertRaises(ValueError):
            self.publisher.start("stale-local-revision", head)

    def test_test_mode_never_defaults_to_production_remote(self):
        publisher = Publisher(self.repo, self.data, test_mode=True)
        with self.assertRaisesRegex(ValueError, "testomgeving"):
            publisher.preview()


if __name__ == "__main__":
    unittest.main()
