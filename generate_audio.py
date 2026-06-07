#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env.local"
LESSONS_DIR = ROOT / "lessons"
API_URL = "https://api.openai.com/v1/audio/speech"
MODEL = "gpt-4o-mini-tts"
FRENCH_VOICE = "marin"
ENGLISH_VOICE = "cedar"

def load_env_file() -> None:
    if not ENV_FILE.exists():
        return

    for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", without_marks.lower()).strip("-")


def unique_items(items: list[tuple[str, str, str, Path]]) -> list[tuple[str, str, str, Path]]:
    seen: set[Path] = set()
    unique: list[tuple[str, str, str, Path]] = []
    for lang, text, instructions, output_path in items:
        key = output_path
        if key in seen:
            continue
        seen.add(key)
        unique.append((lang, text, instructions, output_path))
    return unique


def lesson_paths() -> list[Path]:
    return sorted(LESSONS_DIR.glob("lesson-*/lesson.json"))


def lesson_audio_path(lesson_path: Path, lang: str, text: str) -> Path:
    return lesson_path.parent / "audio" / lang / f"{slugify(text)}.mp3"


def items_from_lesson(lesson_path: Path) -> list[tuple[str, str, str, Path]]:
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    french_instructions = "Speak in clear, natural French from France. Use a warm tutor voice and a calm beginner-friendly pace."
    english_instructions = "Speak in clear, natural British English. Use a warm tutor voice and a calm beginner-friendly pace."
    items: list[tuple[str, str, str, Path]] = []

    for word in lesson.get("words", []):
        text = word.get("say") or word["fr"]
        items.append(("fr", text, french_instructions, lesson_audio_path(lesson_path, "fr", text)))

    sentence_groups = lesson.get("sentenceGroups", {})
    for group in sentence_groups.values():
        for sentence in group:
            items.append(("fr", sentence["fr"], french_instructions, lesson_audio_path(lesson_path, "fr", sentence["fr"])))
            items.append(("en", sentence["en"], english_instructions, lesson_audio_path(lesson_path, "en", sentence["en"])))

    for sentence in lesson.get("listeningSentences", []):
        items.append(("fr", sentence["fr"], french_instructions, lesson_audio_path(lesson_path, "fr", sentence["fr"])))
        items.append(("en", sentence["en"], english_instructions, lesson_audio_path(lesson_path, "en", sentence["en"])))

    return items


def speech_request(api_key: str, lang: str, text: str, instructions: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "model": MODEL,
        "voice": FRENCH_VOICE if lang == "fr" else ENGLISH_VOICE,
        "input": text,
        "instructions": instructions,
    }
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            output_path.write_bytes(response.read())
    except urllib.error.HTTPError as error:
        message = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI request failed for {text!r}: {error.code} {message}") from error


def main() -> int:
    load_env_file()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY. Add it to .env.local or your environment.", file=sys.stderr)
        return 1

    paths = lesson_paths()
    if not paths:
        print("No lesson.json files found in lessons/lesson-*.", file=sys.stderr)
        return 1

    items: list[tuple[str, str, str, Path]] = []
    for lesson_path in paths:
        items.extend(items_from_lesson(lesson_path))

    generated = 0
    skipped = 0
    for lang, text, instructions, output_path in unique_items(items):
        if output_path.exists() and output_path.stat().st_size > 0:
            skipped += 1
            continue

        print(f"Generating {lang}: {text}")
        speech_request(api_key, lang, text, instructions, output_path)
        generated += 1
        time.sleep(0.2)

    print(f"Done. Generated {generated} MP3s, skipped {skipped} existing files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
