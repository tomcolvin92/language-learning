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
import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env.local"
LESSONS_DIR = ROOT / "lessons"
API_URL = "https://api.openai.com/v1/audio/speech"
MODEL = "gpt-4o-mini-tts"
DEFAULT_FRENCH_VOICES = ("marin", "cedar", "coral", "sage")
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


def unique_items(items: list[tuple[str, str, str, Path, str]]) -> list[tuple[str, str, str, Path, str]]:
    seen: set[Path] = set()
    unique: list[tuple[str, str, str, Path, str]] = []
    for lang, text, instructions, output_path, voice in items:
        key = output_path
        if key in seen:
            continue
        seen.add(key)
        unique.append((lang, text, instructions, output_path, voice))
    return unique


def lesson_paths() -> list[Path]:
    return sorted(LESSONS_DIR.glob("lesson-*/lesson.json"))


def parse_lesson_range(value: str | None) -> set[int] | None:
    if not value:
        return None

    lessons: set[int] = set()
    for part in value.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_text, end_text = part.split("-", 1)
            start = int(start_text)
            end = int(end_text)
            lessons.update(range(start, end + 1))
        else:
            lessons.add(int(part))
    return lessons


def lesson_number(path: Path) -> int | None:
    match = re.search(r"lesson-(\d+)", path.parent.name)
    return int(match.group(1)) if match else None


def lesson_audio_path(lesson_path: Path, lang: str, text: str, voice: str | None = None) -> Path:
    if lang == "fr":
        if not voice:
            raise ValueError("French audio requires a voice folder.")
        return lesson_path.parent / "audio" / lang / voice / f"{slugify(text)}.mp3"
    return lesson_path.parent / "audio" / lang / f"{slugify(text)}.mp3"


def items_from_lesson(lesson_path: Path, french_voices: tuple[str, ...]) -> list[tuple[str, str, str, Path, str]]:
    lesson = json.loads(lesson_path.read_text(encoding="utf-8"))
    french_instructions = "Speak in clear, natural French from France. Use a warm tutor voice and a calm beginner-friendly pace."
    english_instructions = "Speak in clear, natural British English. Use a warm tutor voice and a calm beginner-friendly pace."
    items: list[tuple[str, str, str, Path, str]] = []

    for word in lesson.get("words", []):
        text = word.get("say") or word["fr"]
        for voice in french_voices:
            items.append(("fr", text, french_instructions, lesson_audio_path(lesson_path, "fr", text, voice), voice))
        items.append(("en", word["en"], english_instructions, lesson_audio_path(lesson_path, "en", word["en"]), ENGLISH_VOICE))

    sentence_groups = lesson.get("sentenceGroups", {})
    for group in sentence_groups.values():
        for sentence in group:
            for voice in french_voices:
                items.append(("fr", sentence["fr"], french_instructions, lesson_audio_path(lesson_path, "fr", sentence["fr"], voice), voice))
            items.append(("en", sentence["en"], english_instructions, lesson_audio_path(lesson_path, "en", sentence["en"]), ENGLISH_VOICE))

    for sentence in lesson.get("listeningSentences", []):
        for voice in french_voices:
            items.append(("fr", sentence["fr"], french_instructions, lesson_audio_path(lesson_path, "fr", sentence["fr"], voice), voice))
        items.append(("en", sentence["en"], english_instructions, lesson_audio_path(lesson_path, "en", sentence["en"]), ENGLISH_VOICE))

    return items


def speech_request(api_key: str, lang: str, text: str, instructions: str, output_path: Path, voice: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "model": MODEL,
        "voice": voice,
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

    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                output_path.write_bytes(response.read())
            return
        except urllib.error.HTTPError as error:
            message = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OpenAI request failed for {text!r}: {error.code} {message}") from error
        except (TimeoutError, urllib.error.URLError) as error:
            if attempt == 3:
                raise RuntimeError(f"OpenAI request timed out for {text!r} after 3 attempts.") from error
            wait_seconds = attempt * 3
            print(f"Retrying {lang}/{voice}: {text} after timeout ({wait_seconds}s)")
            time.sleep(wait_seconds)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate missing lesson MP3 files from lesson JSON files.")
    parser.add_argument("--lessons", help="Optional lesson range, for example 1-5 or 1-20.")
    parser.add_argument(
        "--voices",
        default=",".join(DEFAULT_FRENCH_VOICES),
        help="Comma-separated French voices to generate, for example marin,cedar,coral,sage.",
    )
    args = parser.parse_args()

    load_env_file()
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Missing OPENAI_API_KEY. Add it to .env.local or your environment.", file=sys.stderr)
        return 1

    selected_lessons = parse_lesson_range(args.lessons)
    paths = lesson_paths()
    if selected_lessons is not None:
        paths = [path for path in paths if lesson_number(path) in selected_lessons]

    if not paths:
        print("No lesson.json files found in lessons/lesson-*.", file=sys.stderr)
        return 1

    french_voices = tuple(voice.strip() for voice in args.voices.split(",") if voice.strip())
    if not french_voices:
        print("No French voices selected.", file=sys.stderr)
        return 1

    items: list[tuple[str, str, str, Path, str]] = []
    for lesson_path in paths:
        items.extend(items_from_lesson(lesson_path, french_voices))

    generated = 0
    skipped = 0
    for lang, text, instructions, output_path, voice in unique_items(items):
        if output_path.exists() and output_path.stat().st_size > 0:
            skipped += 1
            continue

        print(f"Generating {lang}/{voice}: {text}")
        speech_request(api_key, lang, text, instructions, output_path, voice)
        generated += 1
        time.sleep(0.2)

    print(f"Done. Generated {generated} MP3s, skipped {skipped} existing files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
