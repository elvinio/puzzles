#!/usr/bin/env python3
"""Validate chinese/data/p3-passage.json against chinese/data/chinese-p3.json.

Checks, per lesson key (e.g. "p3-1"):
  - each passage has 5-6 sentences
  - characters_used is a subset of the lesson's character list
  - every character in characters_used actually appears in that passage's
    sentence text (catches stale/incomplete lists)
  - every passage has exactly 5 questions, each with exactly 6 options,
    and an answer that matches one of those options
  - every character in the lesson appears in at least one passage's
    characters_used (full lesson coverage across the 5 passages)

Usage:
    python3 tools/validate-p3-passage.py            # validate every lesson present
    python3 tools/validate-p3-passage.py p3-2 p3-3   # validate specific lessons

Exits non-zero if any check fails.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS_PATH = ROOT / "chinese/data/chinese-p3.json"
PASSAGES_PATH = ROOT / "chinese/data/p3-passage.json"


def main():
    lessons = json.loads(LESSONS_PATH.read_text(encoding="utf-8"))
    passages = json.loads(PASSAGES_PATH.read_text(encoding="utf-8"))

    keys = sys.argv[1:] or list(passages.keys())
    ok = True

    for key in keys:
        if key not in lessons:
            print(f"[{key}] ERROR: not found in chinese-p3.json")
            ok = False
            continue
        if key not in passages:
            print(f"[{key}] ERROR: not found in p3-passage.json")
            ok = False
            continue

        lesson_chars = {item["character"] for item in lessons[key]}
        all_used = set()

        for p in passages[key]:
            pid = p.get("id", "?")
            text = "".join(p["sentences"])

            if not (5 <= len(p["sentences"]) <= 6):
                print(f"[{pid}] ERROR: {len(p['sentences'])} sentences (want 5-6)")
                ok = False

            used = p["characters_used"]
            all_used.update(used)

            bad_lesson = [c for c in used if c not in lesson_chars]
            if bad_lesson:
                print(f"[{pid}] ERROR: characters_used not in lesson {key}: {bad_lesson}")
                ok = False

            bad_text = [c for c in used if c not in text]
            if bad_text:
                print(f"[{pid}] ERROR: characters_used missing from sentence text: {bad_text}")
                ok = False

            questions = p.get("questions", [])
            if len(questions) != 5:
                print(f"[{pid}] ERROR: {len(questions)} questions (want 5)")
                ok = False

            for i, q in enumerate(questions):
                opts = q.get("options", [])
                if len(opts) != 6:
                    print(f"[{pid}] ERROR: question {i + 1} has {len(opts)} options (want 6)")
                    ok = False
                if q.get("answer") not in opts:
                    print(f"[{pid}] ERROR: question {i + 1} answer not among its options")
                    ok = False

        missing = lesson_chars - all_used
        if missing:
            print(f"[{key}] ERROR: lesson characters never used in any passage: {sorted(missing)}")
            ok = False
        else:
            print(f"[{key}] OK - {len(passages[key])} passages, all {len(lesson_chars)} lesson characters covered")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
