"""Publish only saved creature data, using a separate temporary Git checkout."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
import threading
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


def revision(items):
    return hashlib.sha256(json.dumps(items, sort_keys=True, ensure_ascii=False, allow_nan=False).encode("utf-8")).hexdigest()


def git(folder, *args, timeout=45):
    result = subprocess.run(["git", "-C", str(folder), *args], capture_output=True, text=True,
                            encoding="utf-8", timeout=timeout,
                            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"})
    if result.returncode:
        raise ValueError("Git kon de publicatie niet uitvoeren. Controleer je GitHub-aanmelding en verbinding.")
    return result.stdout.strip()


class Publisher:
    def __init__(self, root: Path, data_path: Path, remote=None, public_url=None, test_mode=False):
        self.root, self.data_path, self.remote = root, data_path, remote
        self.public_url = public_url or "https://joost-dijkstra.github.io/Sammetjes-van-wieringen/data/sammeltjes.json"
        self.test_mode = test_mode
        self.jobs = {}
        self.lock = threading.Lock()

    def checkout(self, directory):
        if self.test_mode and not self.remote:
            raise ValueError("Publiceren staat uit in de testomgeving zonder aparte testrepository.")
        remote = self.remote or git(self.root, "remote", "get-url", "origin")
        git(directory, "init", "--quiet")
        git(directory, "remote", "add", "origin", remote)
        git(directory, "fetch", "--depth=1", "origin", "main")
        git(directory, "checkout", "--quiet", "-b", "publication", "FETCH_HEAD")
        return git(directory, "rev-parse", "HEAD")

    def preview(self):
        items = json.loads(self.data_path.read_text(encoding="utf-8"))
        with tempfile.TemporaryDirectory(prefix="sammeltjes-publish-") as folder:
            head = self.checkout(folder)
            remote_items = json.loads((Path(folder) / "data/sammeltjes.json").read_text(encoding="utf-8"))
            # New data must not depend on local code or unpublished images.
            for name in ["game-rules.js", "terrain.js"]:
                target = Path(folder) / name
                if not target.exists() or target.read_text(encoding="utf-8") != (self.root / name).read_text(encoding="utf-8"):
                    raise ValueError("Publiceer eerst de nieuwe appversie. De website gebruikt nog andere spelregels.")
            for item in items:
                for key in ["image", "thumbnail"]:
                    if not (Path(folder) / item[key]).is_file():
                        raise ValueError(f"{item['name']}: de afbeelding staat nog niet online. Neem die eerst mee in een appupdate.")
        before = {item["id"]: item for item in remote_items}
        after = {item["id"]: item for item in items}
        changes = []
        labels = {"lat": "woonplek", "lng": "woonplek", "radius": "woonradius", "behavior": "karakter", "speedKmh": "snelheid",
                  "availabilityMode": "dagritme", "activeFrom": "dagritme", "activeUntil": "dagritme", "randomHoursPerDay": "dagritme",
                  "active": "vindbaarheid", "name": "naam", "image": "afbeelding", "thumbnail": "afbeelding", "description": "verhaal", "type": "woonwijze", "biome": "omgeving"}
        for key, item in after.items():
            if key not in before:
                changes.append(f"Toevoegen: {item['name']}")
            elif item != before[key]:
                fields = sorted({labels.get(k, k) for k in item if item.get(k) != before[key].get(k)})
                changes.append(f"{item['name']}: {', '.join(fields)}")
        for key, item in before.items():
            if key not in after:
                changes.append(f"Verwijderen: {item['name']}")
        return {"revision": revision(items), "remoteHead": head, "changes": changes}

    def start(self, expected_revision, expected_head):
        items = json.loads(self.data_path.read_text(encoding="utf-8"))
        if revision(items) != expected_revision:
            raise ValueError("De opgeslagen gegevens zijn veranderd. Open het publicatieoverzicht opnieuw.")
        with self.lock:
            if any(job["status"] in ["working", "checking"] for job in self.jobs.values()):
                raise ValueError("Er loopt al een publicatie.")
            job_id = uuid.uuid4().hex
            self.jobs[job_id] = {"status": "working", "message": "Publicatie bezig..."}
        threading.Thread(target=self.run, args=(job_id, items, expected_head), daemon=True).start()
        return {"id": job_id}

    def run(self, job_id, items, expected_head):
        job = self.jobs[job_id]
        try:
            with tempfile.TemporaryDirectory(prefix="sammeltjes-publish-") as folder:
                head = self.checkout(folder)
                if head != expected_head:
                    raise ValueError("De website is ondertussen gewijzigd. Controleer het nieuwe publicatieoverzicht.")
                target = Path(folder) / "data/sammeltjes.json"
                target.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                git(folder, "add", "--", "data/sammeltjes.json")
                if git(folder, "diff", "--cached", "--name-only"):
                    git(folder, "-c", "user.name=Sammeltjes Werkplaats", "-c", "user.email=werkplaats@localhost", "-c", "commit.gpgsign=false", "commit", "-m", "Update Sammeltjes from local workshop")
                    git(folder, "push", "origin", "HEAD:refs/heads/main")
            job.update(status="checking", message="Naar GitHub verzonden. Wachten op de telefoonapp...")
            for attempt in range(24):
                try:
                    url = self.public_url + ("&" if "?" in self.public_url else "?") + f"revision={time.time_ns()}"
                    request = Request(url, headers={"Cache-Control": "no-cache"})
                    with urlopen(request, timeout=8) as response:
                        if revision(json.load(response)) == revision(items):
                            job.update(status="online", message="Online beschikbaar. Open je telefoonapp opnieuw.")
                            return
                except Exception:
                    pass
                time.sleep(5)
            job.update(status="pending", message="Verzonden naar GitHub; online versie nog niet bevestigd. Controleer straks opnieuw via Publiceren.")
        except Exception as error:
            job.update(status="failed", message=str(error))
