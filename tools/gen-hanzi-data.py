#!/usr/bin/env python3
"""
Regenerates hanzi-data/ — the self-hosted handwriting library + per-character
stroke data used by the 找错字 (Find & Correct) quiz mode in chinese.html.

Run this whenever chinese-p1.json / chinese-p2.json / chinese-p3.json gain new
"character" values that aren't yet covered by hanzi-data/chars/.

Sources (fetched from registry.npmjs.org, MIT-licensed):
  - hanzi-writer          https://www.npmjs.com/package/hanzi-writer
  - hanzi-writer-data     https://www.npmjs.com/package/hanzi-writer-data
    (stroke data derived from Make Me a Hanzi, Arphic Public License)

Usage:
  python3 tools/gen-hanzi-data.py
"""
import json
import os
import sys
import tarfile
import urllib.request
from io import BytesIO

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHINESE_DIR = os.path.join(REPO_ROOT, "chinese")
OUT_DIR = os.path.join(CHINESE_DIR, "hanzi-data")
CHARS_DIR = os.path.join(OUT_DIR, "chars")

HANZI_WRITER_VERSION = "3.7.3"
HANZI_WRITER_DATA_VERSION = "2.0.1"

VOCAB_FILES = ["chinese-p1.json", "chinese-p2.json", "chinese-p3.json"]


def needed_characters():
    chars = set()
    for fname in VOCAB_FILES:
        path = os.path.join(CHINESE_DIR, "data", fname)
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for lesson in data.values():
            for entry in lesson:
                chars.add(entry["character"])
    return chars


def fetch_tarball(package, version):
    url = f"https://registry.npmjs.org/{package}/-/{package}-{version}.tgz"
    print(f"Fetching {url} ...")
    with urllib.request.urlopen(url) as resp:
        return resp.read()


def main():
    os.makedirs(CHARS_DIR, exist_ok=True)

    chars = needed_characters()
    print(f"{len(chars)} unique characters needed across {VOCAB_FILES}")

    # --- hanzi-writer library (vendored, single minified file) ---
    hw_bytes = fetch_tarball("hanzi-writer", HANZI_WRITER_VERSION)
    with tarfile.open(fileobj=BytesIO(hw_bytes)) as tf:
        member = tf.getmember("package/dist/hanzi-writer.min.js")
        src = tf.extractfile(member).read().decode("utf-8")

    header = (
        f"/* Vendored from npm hanzi-writer@{HANZI_WRITER_VERSION}, MIT License.\n"
        f"   Source: https://www.npmjs.com/package/hanzi-writer\n"
        f"   Regenerate via tools/gen-hanzi-data.py */\n"
    )
    with open(os.path.join(OUT_DIR, "hanzi-writer.min.js"), "w", encoding="utf-8") as f:
        f.write(header + src)
    print("Wrote hanzi-data/hanzi-writer.min.js")

    # --- per-character stroke data ---
    hwd_bytes = fetch_tarball("hanzi-writer-data", HANZI_WRITER_DATA_VERSION)
    written = 0
    missing = []
    with tarfile.open(fileobj=BytesIO(hwd_bytes)) as tf:
        names = set(tf.getnames())
        for ch in sorted(chars):
            member_name = f"package/{ch}.json"
            if member_name not in names:
                missing.append(ch)
                continue
            data = tf.extractfile(member_name).read()
            out_path = os.path.join(CHARS_DIR, f"{ch}.json")
            with open(out_path, "wb") as f:
                f.write(data)
            written += 1

    print(f"Wrote {written} character files to hanzi-data/chars/")
    if missing:
        print(f"WARNING: {len(missing)} characters had no stroke data: {''.join(missing)}")
        print("These fall back to the reveal-answer UI at runtime.")

    # Attribution file for the data set's license.
    with open(os.path.join(CHARS_DIR, "ATTRIBUTION.md"), "w", encoding="utf-8") as f:
        f.write(
            "Stroke data in this directory is vendored from npm package "
            f"`hanzi-writer-data@{HANZI_WRITER_DATA_VERSION}` "
            "(https://www.npmjs.com/package/hanzi-writer-data), derived from the "
            "Make Me a Hanzi project (https://github.com/skishore/makemeahanzi), "
            "licensed under the Arphic Public License.\n"
        )

    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
