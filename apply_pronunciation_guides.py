#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import unicodedata
import zipfile
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parent
SOURCE_WORKBOOK = ROOT / "sources" / "french-500-controlled-sentence-pack-with-pronunciation.xlsx"
LESSONS_DIR = ROOT / "lessons"
GUIDE_COLUMN = "Pronunciation guide (approx.; ü = French u)"
NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkgrel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


WORD_GUIDES = {
    "a": "ah",
    "à": "ah",
    "au": "oh",
    "avec": "ah-VEK",
    "beaucoup": "boh-KOO",
    "bien": "byeh(n)",
    "bonjour": "bohn-ZHOOR",
    "bon": "boh(n)",
    "bonne": "bun",
    "ça": "sah",
    "café": "kah-FEH",
    "calme": "kalm",
    "ce": "suh",
    "c'est": "seh",
    "chaise": "shehz",
    "chambre": "shah(n)br",
    "comment": "koh-MAH(N)",
    "content": "kohn-TAH(N)",
    "cuisine": "kwee-ZEEN",
    "dans": "dah(n)",
    "de": "duh",
    "derrière": "deh-RYEHR",
    "devant": "duh-VAH(N)",
    "du": "dü",
    "eau": "oh",
    "école": "eh-KOHL",
    "elle": "ehl",
    "enfant": "ah(n)-FAH(N)",
    "es": "eh",
    "est": "eh",
    "et": "eh",
    "être": "EH-tr",
    "fatigué": "fah-tee-GEH",
    "fenêtre": "fuh-NEH-tr",
    "fille": "fee",
    "fou": "foo",
    "frère": "frehr",
    "fromage": "froh-MAHZH",
    "garçon": "gahr-SOH(N)",
    "grande": "grah(n)d",
    "homme": "um",
    "ici": "ee-SEE",
    "il": "eel",
    "j'ai": "zheh",
    "j'aime": "zhem",
    "j'écoute": "zheh-KOOT",
    "j'": "zh",
    "jardin": "zhar-DAH(N)",
    "je": "zhuh",
    "la": "lah",
    "là": "lah",
    "lait": "leh",
    "le": "luh",
    "les": "lay",
    "lire": "leer",
    "loin": "lwa(n)",
    "ma": "mah",
    "magasin": "mah-gah-ZA(N)",
    "maison": "meh-ZOH(N)",
    "mal": "mahl",
    "mange": "mahnzh",
    "manges": "mahnzh",
    "manger": "mahn-ZHAY",
    "maintenant": "ma(n)t-NAH(N)",
    "merci": "mehr-SEE",
    "mère": "mehr",
    "mon": "moh(n)",
    "nous": "noo",
    "non": "noh(n)",
    "oui": "wee",
    "ou": "oo",
    "où": "oo",
    "pain": "pa(n)",
    "parc": "park",
    "parler": "par-LAY",
    "père": "pehr",
    "personne": "pehr-SUN",
    "petit": "puh-TEE",
    "petite": "puh-TEET",
    "plaît": "pleh",
    "poisson": "pwa-SOH(N)",
    "pomme": "pum",
    "porte": "port",
    "poulet": "poo-LEH",
    "près": "preh",
    "regarder": "ruh-gar-DAY",
    "repas": "ruh-PAH",
    "restaurant": "res-toh-RAH(N)",
    "riz": "ree",
    "rue": "rü",
    "s'il": "seel",
    "salut": "sah-LÜ",
    "sans": "sah(n)",
    "sœur": "seur",
    "suis": "swee",
    "table": "tahbl",
    "ta": "tah",
    "thé": "tay",
    "toi": "twah",
    "ton": "toh(n)",
    "travail": "trah-VAI",
    "très": "treh",
    "triste": "treest",
    "tu": "tü",
    "un": "uh(n)",
    "une": "ün",
    "va": "vah",
    "vais": "veh",
    "vas": "vah",
    "venir": "vuh-NEER",
    "veux": "vuh",
    "ville": "veel",
    "vous": "voo",
    "voudrais": "voo-DREH",
    "andouille": "ahn-DOOY",
    "arrête": "ah-RET",
    "bête": "BET",
    "d'andouille": "dahn-DOOY",
    "espèce": "ess-PESS",
    "mais": "meh",
    "mignon": "mee-NYON",
    "monstre": "mon-str",
    "putain": "poo-TAN",
    "quoi": "KWA",
    "t'es": "teh",
    "trop": "tro",
}


PHRASE_GUIDES = {
    "de l'eau": "duh loh",
    "du café": "dü kah-FEH",
    "du fromage": "dü froh-MAHZH",
    "du pain": "dü pa(n)",
    "du poisson": "dü pwa-SOH(N)",
    "du poulet": "dü poo-LEH",
    "du riz": "dü ree",
    "du thé": "dü tay",
    "je suis": "zhuh swee",
    "tu es": "tü eh",
    "il est": "eel eh",
    "elle est": "ehl eh",
    "ça va": "sah vah",
    "s'il vous plaît": "seel voo pleh",
    "à l'école": "ah leh-KOHL",
    "à la maison": "ah lah meh-ZOH(N)",
    "au café": "oh kah-FEH",
    "au magasin": "oh mah-gah-ZA(N)",
    "au parc": "oh park",
    "au restaurant": "oh res-toh-RAH(N)",
    "au travail": "oh trah-VAI",
    "dans la rue": "dah(n) lah rü",
    "dans la ville": "dah(n) lah veel",
    "dans le jardin": "dah(n) luh zhar-DAH(N)",
    "loin de": "lwa(n) duh",
    "près de": "preh duh",
    "je vais": "zhuh veh",
    "tu vas": "tü vah",
    "il va": "eel vah",
    "elle va": "ehl vah",
    "nous allons": "noo zah-LOH(N)",
    "je veux": "zhuh vuh",
    "tu veux": "tü vuh",
    "je fais": "zhuh feh",
    "tu fais": "tü feh",
    "je parle": "zhuh parl",
    "tu parles": "tü parl",
    "je lis": "zhuh lee",
    "tu lis": "tü lee",
    "je dors": "zhuh dor",
    "tu dors": "tü dor",
    "je regarde": "zhuh ruh-gard",
    "tu regardes": "tü ruh-gard",
    "j'écoute": "zheh-KOOT",
    "tu écoutes": "tü eh-KOOT",
    "espèce de petit monstre": "ess-PESS duh puh-TEE mon-str",
    "arrête espèce d'andouille": "ah-RET ess-PESS dahn-DOOY",
    "mais t'es fou ou quoi": "meh teh FOO oo KWA",
    "putain t'es trop mignon": "poo-TAN teh tro mee-NYON",
    "t'es bête": "teh BET",
}


def cell_column(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref)
    if not letters:
        raise ValueError(f"Could not parse cell reference {cell_ref!r}")
    value = 0
    for char in letters.group(0):
        value = value * 26 + (ord(char) - ord("A") + 1)
    return value - 1


def cell_value(cell: ElementTree.Element, strings: list[str]) -> object:
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        value = cell.findtext("main:v", default="", namespaces=NS)
        return strings[int(value)] if value else ""
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//main:t", NS))

    value = cell.findtext("main:v", default="", namespaces=NS)
    if value == "":
        return ""
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    return value


def shared_strings(workbook: zipfile.ZipFile) -> list[str]:
    try:
        xml = workbook.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ElementTree.fromstring(xml)
    return ["".join(node.text or "" for node in item.findall(".//main:t", NS)) for item in root.findall("main:si", NS)]


def sheet_paths(workbook: zipfile.ZipFile) -> dict[str, str]:
    workbook_root = ElementTree.fromstring(workbook.read("xl/workbook.xml"))
    rels_root = ElementTree.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
    rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels_root.findall("pkgrel:Relationship", NS)}

    paths = {}
    for sheet in workbook_root.findall("main:sheets/main:sheet", NS):
        rel_id = sheet.attrib[f"{{{NS['rel']}}}id"]
        target = rels[rel_id].lstrip("/")
        paths[sheet.attrib["name"]] = target if target.startswith("xl/") else f"xl/{target}"
    return paths


def read_sheet(workbook: zipfile.ZipFile, path: str, strings: list[str]) -> list[dict[str, object]]:
    root = ElementTree.fromstring(workbook.read(path))
    rows = []
    for row in root.findall("main:sheetData/main:row", NS):
        values = []
        for cell in row.findall("main:c", NS):
            column = cell_column(cell.attrib["r"])
            while len(values) < column:
                values.append("")
            values.append(cell_value(cell, strings))
        rows.append(values)

    headers = [str(value) for value in rows[0]]
    output = []
    for row in rows[1:]:
        if any(value not in ("", None) for value in row):
            output.append({headers[index]: row[index] if index < len(row) else "" for index in range(len(headers))})
    return output


def normalize(text: object) -> str:
    text = str(text or "").strip().lower()
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("’", "'")
    text = text.replace("œ", "oe")
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_lookup(text: object) -> str:
    text = normalize(text)
    text = text.strip(" .!?")
    return text


def source_guides() -> tuple[dict[str, str], dict[str, str]]:
    with zipfile.ZipFile(SOURCE_WORKBOOK) as workbook:
        strings = shared_strings(workbook)
        paths = sheet_paths(workbook)
        vocab_rows = read_sheet(workbook, paths["Vocabulary"], strings)
        sentence_rows = read_sheet(workbook, paths["Sentences"], strings)

    vocab_guides = {
        normalize_lookup(row["French item / phrase"]): str(row[GUIDE_COLUMN]).strip()
        for row in vocab_rows
        if row.get("French item / phrase") and row.get(GUIDE_COLUMN)
    }
    sentence_guides = {
        normalize_lookup(row["French"]): str(row[GUIDE_COLUMN]).strip()
        for row in sentence_rows
        if row.get("French") and row.get(GUIDE_COLUMN)
    }
    return vocab_guides, sentence_guides


def fallback_pronunciation(text: object) -> str:
    key = normalize_lookup(text)
    if key in PHRASE_GUIDES:
        return PHRASE_GUIDES[key]
    if key in WORD_GUIDES:
        return WORD_GUIDES[key]

    working = f" {key} "
    parts = []
    for phrase, guide in sorted(PHRASE_GUIDES.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = f" {phrase} "
        if pattern in working:
            token = f" __{len(parts)}__ "
            working = working.replace(pattern, token)
            parts.append(guide)

    words = []
    for token in re.findall(r"__[0-9]+__|[a-zàâçéèêëîïôùûüÿñæœ'’-]+", working, flags=re.IGNORECASE):
        if token.startswith("__"):
            words.append(parts[int(token.strip("_"))])
            continue
        lookup = normalize_lookup(token)
        words.append(WORD_GUIDES.get(lookup, lookup))

    return " ".join(word for word in words if word)


def apply_guides() -> dict[str, int]:
    vocab_guides, sentence_guides = source_guides()
    stats = {
        "words": 0,
        "wordSourceMatches": 0,
        "sentences": 0,
        "sentenceSourceMatches": 0,
        "fallbacks": 0,
    }

    for lesson_path in sorted(LESSONS_DIR.glob("lesson-*/lesson.json")):
        lesson = json.loads(lesson_path.read_text(encoding="utf-8"))

        for word in lesson.get("words", []):
            stats["words"] += 1
            key = normalize_lookup(word.get("say") or word.get("fr"))
            guide = vocab_guides.get(key)
            if guide:
                stats["wordSourceMatches"] += 1
            else:
                stats["fallbacks"] += 1
                guide = fallback_pronunciation(word.get("say") or word.get("fr"))
            word["pronunciation"] = guide
            word["sound"] = guide

        seen_sentence_objects = []
        for group in lesson.get("sentenceGroups", {}).values():
            seen_sentence_objects.extend(group)
        seen_sentence_objects.extend(lesson.get("listeningSentences", []))

        for sentence in seen_sentence_objects:
            stats["sentences"] += 1
            key = normalize_lookup(sentence.get("fr"))
            guide = sentence_guides.get(key)
            if guide:
                stats["sentenceSourceMatches"] += 1
            else:
                stats["fallbacks"] += 1
                guide = fallback_pronunciation(sentence.get("fr"))
            sentence["pronunciation"] = guide
            sentence["sound"] = guide

        lesson_path.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return stats


def main() -> int:
    stats = apply_guides()
    print(json.dumps(stats, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
