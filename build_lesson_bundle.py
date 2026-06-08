#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LESSONS_DIR = ROOT / "lessons"
OUTPUT = LESSONS_DIR / "bundle.js"


def main() -> int:
    manifest = json.loads((LESSONS_DIR / "index.json").read_text(encoding="utf-8"))
    lessons = {}
    for entry in manifest["lessons"]:
        path = ROOT / entry["path"]
        lessons[entry["id"]] = json.loads(path.read_text(encoding="utf-8"))

    payload = {
        "manifest": manifest,
        "lessons": lessons,
    }
    OUTPUT.write_text(
        "window.LESSON_BUNDLE = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    print(f"Wrote {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
