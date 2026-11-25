import os
from hashlib import sha256
from json import loads
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

script_dir = Path(__file__).resolve().parent
project_dir = script_dir.parent
target = Path(os.environ.get("EQ_BUILD_DIR", str(project_dir / "dist-desktop")))
resources = Path(os.environ.get("EQ_BASELINE_RESOURCES", r"C:\Program Files (x86)\Equilibrio\resources"))
old = resources / "app"
if not old.is_dir() or loads((old / "package.json").read_bytes())["version"] != "1.0.41":
    old = resources / "app.equilibrio-1.0.41-backup"
new = target / "win-unpacked/resources/app"
assert loads((old / "package.json").read_bytes())["version"] == "1.0.41"
assert loads((new / "package.json").read_bytes())["version"] == "1.0.42"
manifest = loads((target / "RUNTIME-PACKAGE-SHA256.json").read_bytes())
changed = []
with ZipFile(target / "Setup1042.payload.zip", "w", ZIP_DEFLATED, compresslevel=9) as payload:
    payload.writestr("sha256.txt", "".join(f'{item["sha256"]} {item["path"]}\n' for item in manifest))
    for item in manifest:
        name = item["path"]
        after = (new / name).read_bytes()
        assert sha256(after).hexdigest() == item["sha256"]
        baseline = old / name
        if not baseline.is_file() or baseline.read_bytes() != after:
            payload.writestr("app/" + name, after)
            changed.append(name)
print(f"{len(changed)} alterações, {len(manifest)} recursos a verificar")
