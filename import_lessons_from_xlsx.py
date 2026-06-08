#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parent
DEFAULT_WORKBOOK = Path("/Users/tomcolvin/Downloads/french_500_word_20_lesson_controlled_sentence_pack.xlsx")
LESSONS_DIR = ROOT / "lessons"
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    without_marks = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", without_marks.lower()).strip("-")


def parse_lesson_range(value: str) -> set[int]:
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


def cell_column(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref)
    if not letters:
        raise ValueError(f"Could not parse cell reference {cell_ref!r}")
    value = 0
    for char in letters.group(0):
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    try:
        xml = workbook.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ElementTree.fromstring(xml)
    strings: list[str] = []
    for item in root.findall("main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        strings.append("".join(parts))
    return strings


def sheet_paths(workbook: zipfile.ZipFile) -> dict[str, str]:
    workbook_root = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
    rels_root = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    rels = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rels_root.findall("pkgrel:Relationship", NS)
    }

    paths: dict[str, str] = {}
    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        name = sheet.attrib["name"]
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rels[rel_id].lstrip("/")
        paths[name] = target if target.startswith("xl/") else f"xl/{target}"
    return paths


def cell_value(cell: ElementTree.Element, strings: list[str]) -> object:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value = cell.findtext("main:v", default="", namespaces=NS)
        return strings[int(value)] if value else ""
    if cell_type == "inlineStr":
        parts = [node.text or "" for node in cell.findall(".//main:t", NS)]
        return "".join(parts)

    value = cell.findtext("main:v", default="", namespaces=NS)
    if value == "":
        return ""
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def read_sheet(workbook: zipfile.ZipFile, path: str, strings: list[str]) -> list[list[object]]:
    root = ElementTree.fromstring(workbook.read(path))
    rows: list[list[object]] = []
    for row in root.findall("main:sheetData/main:row", NS):
        values: list[object] = []
        for cell in row.findall("main:c", NS):
            column = cell_column(cell.attrib["r"])
            while len(values) < column:
                values.append("")
            values.append(cell_value(cell, strings))
        rows.append(values)
    return rows


def rows_as_dicts(rows: list[list[object]]) -> list[dict[str, object]]:
    headers = [str(value) for value in rows[0]]
    output: list[dict[str, object]] = []
    for row in rows[1:]:
        if not any(value not in ("", None) for value in row):
            continue
        output.append({headers[index]: row[index] if index < len(row) else "" for index in range(len(headers))})
    return output


def unique_id(base: str, used: set[str]) -> str:
    candidate = base or "item"
    index = 2
    while candidate in used:
        candidate = f"{base}-{index}"
        index += 1
    used.add(candidate)
    return candidate


def clean_theme(theme: str) -> str:
    return re.sub(r"^\d+\s+", "", theme).strip()


def build_lesson(number: int, vocab_rows: list[dict[str, object]], sentence_rows: list[dict[str, object]]) -> dict[str, object]:
    lesson_vocab = [row for row in vocab_rows if int(row["Lesson"]) == number]
    lesson_sentences = [row for row in sentence_rows if int(row["Lesson"]) == number]
    if not lesson_vocab or not lesson_sentences:
        raise ValueError(f"Lesson {number} is missing vocabulary or sentences")

    theme = str(lesson_vocab[0]["Lesson Theme"])
    word_ids: set[str] = set()
    sentence_ids: set[str] = set()
    group_ids: set[str] = set()
    sentence_groups: dict[str, list[dict[str, str]]] = {}

    words = []
    for row in lesson_vocab:
        french = str(row["French item / chunk"]).strip()
        focus_type = str(row.get("Type") or "Word").strip()
        words.append({
            "id": unique_id(slugify(french), word_ids),
            "fr": french,
            "en": str(row["English"]).strip(),
            "say": french,
            "sound": "",
            "category": focus_type.replace("_", " ").title(),
        })

    listening_sentences = []
    for row in lesson_sentences:
        french = str(row["French"]).strip()
        english = str(row["English"]).strip()
        sentence = {
            "id": unique_id(slugify(french), sentence_ids),
            "fr": french,
            "en": english,
        }
        listening_sentences.append(sentence)

        focus = str(row.get("Grammar / Focus") or "sentences").strip()
        group_key = unique_id(slugify(focus), group_ids) if slugify(focus) not in sentence_groups else slugify(focus)
        sentence_groups.setdefault(group_key, []).append(sentence.copy())

    return {
        "id": f"lesson-{number:02d}",
        "title": clean_theme(theme),
        "level": number,
        "audioBase": f"lessons/lesson-{number:02d}/audio",
        "words": words,
        "sentenceGroups": sentence_groups,
        "listeningSentences": listening_sentences,
    }


def write_lesson(lesson: dict[str, object]) -> None:
    lesson_dir = LESSONS_DIR / str(lesson["id"])
    lesson_dir.mkdir(parents=True, exist_ok=True)
    path = lesson_dir / "lesson.json"
    path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_manifest(imported_lessons: list[dict[str, object]]) -> None:
    manifest_path = LESSONS_DIR / "index.json"
    existing = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"lessons": []}
    by_id = {lesson["id"]: lesson for lesson in existing.get("lessons", [])}
    for lesson in imported_lessons:
        lesson_id = str(lesson["id"])
        by_id[lesson_id] = {
            "id": lesson_id,
            "title": str(lesson["title"]),
            "level": int(lesson["level"]),
            "path": f"lessons/{lesson_id}/lesson.json",
        }
    ordered = sorted(by_id.values(), key=lambda item: int(item["level"]))
    manifest_path.write_text(json.dumps({"lessons": ordered}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import lesson JSON files from the controlled sentence pack workbook.")
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--lessons", default="1-5", help="Lesson numbers to import, for example 1-5 or 1-20.")
    args = parser.parse_args()

    selected_lessons = parse_lesson_range(args.lessons)
    with zipfile.ZipFile(args.workbook) as workbook:
        strings = shared_strings(workbook)
        paths = sheet_paths(workbook)
        vocab_rows = rows_as_dicts(read_sheet(workbook, paths["Vocabulary"], strings))
        sentence_rows = rows_as_dicts(read_sheet(workbook, paths["Sentences"], strings))

    imported = []
    for number in sorted(selected_lessons):
        lesson = build_lesson(number, vocab_rows, sentence_rows)
        write_lesson(lesson)
        imported.append(lesson)

    update_manifest(imported)
    print(f"Imported {len(imported)} lesson(s): {', '.join(str(lesson['id']) for lesson in imported)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
