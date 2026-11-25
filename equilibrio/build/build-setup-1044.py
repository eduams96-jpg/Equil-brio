"""Build the maintenance payload against the published 1.0.43 manifest."""
import json
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

project = Path(__file__).resolve().parents[1]
workspace = project.parents[1]
records = json.loads((workspace / "Entrega-v1.0.43-20261124/RUNTIME-PACKAGE-SHA256.json").read_bytes())
destination = workspace / "Entrega-v1.0.44"
destination.mkdir(exist_ok=True)
with ZipFile(project / "build/Setup1044.payload.zip", "w", ZIP_DEFLATED) as payload:
    for record in records:
        name = record["path"]
        content = (project / name).read_bytes()
        digest = sha256(content).hexdigest()
        if digest != record["sha256"]:
            payload.writestr("app/" + name, content)
            record.update(sha256=digest, size=len(content))
    payload.writestr("sha256.txt", "".join(f'{r["sha256"]} {r["path"]}\n' for r in records))
(destination / "RUNTIME-PACKAGE-SHA256.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
