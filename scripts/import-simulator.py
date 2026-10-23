#!/usr/bin/env python3
"""Import the pinned public browser export without modifying its game files."""

import hashlib
import json
from pathlib import Path
import sys
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REVISION = "a1732fcddc0487e47ec8d903bcb0049a627e69c7"
ARCHIVE_SHA256 = "8df0442face7930972e5da396962757f21d84c5c15846ebfd933c6b49293fce3"
SOURCE = "https://github.com/Jcw87/c2-sans-fight"
DESTINATION = ROOT / "public/vendor/c2-sans-fight"


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python3 scripts/import-simulator.py /path/to/pinned-build.zip")
    archive = Path(sys.argv[1]).read_bytes()
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
        raise SystemExit("Archive does not match the pinned export. No files were written.")
    files = {}
    with zipfile.ZipFile(sys.argv[1]) as zipped:
        prefix = f"c2-sans-fight-{REVISION}/"
        for entry in zipped.infolist():
            if entry.is_dir():
                continue
            if not entry.filename.startswith(prefix):
                raise SystemExit("Unexpected archive root")
            relative = Path(entry.filename.removeprefix(prefix))
            if relative.is_absolute() or ".." in relative.parts:
                raise SystemExit("Invalid archive path")
            files[relative.as_posix()] = zipped.read(entry)
    if len(files) != 108:
        raise SystemExit("Unexpected export file count")
    for relative, data in files.items():
        target = DESTINATION / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    manifest = {
        "source": SOURCE,
        "branch": "gh-pages",
        "revision": REVISION,
        "archiveUrl": f"https://codeload.github.com/Jcw87/c2-sans-fight/zip/{REVISION}",
        "archiveSha256": ARCHIVE_SHA256,
        "reuseStatement": SOURCE + "/issues/81",
        "customization": "reference/simulator-customization.json",
        "files": {
            relative: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
            for relative, data in sorted(files.items())
        },
    }
    manifest_path = ROOT / "reference/c2-sans-fight.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Imported {len(files)} unchanged upstream files at {REVISION}.")
    subprocess.run([sys.executable, str(ROOT / 'scripts/configure-simulator.py')], check=True)


if __name__ == "__main__":
    main()
