#!/usr/bin/env python3
"""Synthesize chinese/data/p3-passage.json into listening-comprehension audio
via Azure Cognitive Services Speech (the same zh-CN neural voice chinese.html
already uses through its browser proxy — this script calls Azure directly
since it runs server-side, so no proxy is needed).

For each passage it writes:
  - one "whole passage" clip — the full passage read straight through, with a
    short <break> between sentences. This is the primary listening-test
    audio: play once (or twice), then answer the 5 questions.
  - one clip per sentence — for post-test review ("replay sentence 3") or a
    future sentence-by-sentence/shadowing mode. Not meant to be the first
    thing a student hears; see the mode discussion in the repo PR/README.

Output layout (mirrors the p3-N lesson keys in p3-passage.json):

    chinese/passage_audio/
      manifest.json                        voice/rate + per-passage file map
      p3-1/
        p3-1-passage-1.mp3                 whole passage
        p3-1-passage-1-s01.mp3             sentence 1
        p3-1-passage-1-s02.mp3             sentence 2
        ...

Setup:
    export AZURE_SPEECH_KEY=<your Azure Speech subscription key>
    export AZURE_SPEECH_REGION=<e.g. eastasia>
    pip install: none — stdlib only.

Usage:
    python3 tools/gen-passage-audio.py                  # all lessons, both modes
    python3 tools/gen-passage-audio.py p3-1 p3-2         # specific lessons only
    python3 tools/gen-passage-audio.py --mode whole      # skip per-sentence clips
    python3 tools/gen-passage-audio.py --dry-run         # list planned files, no network calls
    python3 tools/gen-passage-audio.py --force           # re-synthesize existing files

Re-run anytime the passage text changes — existing files are skipped unless
--force, so it's cheap to re-run after adding a new lesson.
"""
import argparse
import http.client
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
PASSAGES_PATH = ROOT / "chinese/data/p3-passage.json"
OUT_DIR_DEFAULT = ROOT / "chinese/passage_audio"

# Same voice chinese.html uses for word/sentence TTS (azureSpeak in chinese.js).
# Flashcard pronunciation there deliberately slows to -15% for beginners
# sounding out a single word; a listening-comprehension passage should sound
# closer to how the passage is actually spoken, so this defaults to natural
# speed instead. Override with --rate if a slower pace suits the class.
VOICE_DEFAULT = "zh-CN-XiaoxiaoNeural"
RATE_DEFAULT = "0%"
SENTENCE_BREAK_MS = 600  # pause inserted between sentences in the whole-passage clip

OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
TOKEN_URL_FMT = "https://{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
TTS_URL_FMT = "https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
TOKEN_LIFETIME_S = 9 * 60  # Azure tokens last 10 minutes; refresh a bit early


class AzureTts:
    def __init__(self, key, region, voice, rate):
        self.key = key
        self.region = region
        self.voice = voice
        self.rate = rate
        self._token = None
        self._token_at = 0.0

    def _get_token(self):
        now = time.monotonic()
        if self._token and (now - self._token_at) < TOKEN_LIFETIME_S:
            return self._token
        req = urllib.request.Request(
            TOKEN_URL_FMT.format(region=self.region),
            data=b"",
            headers={"Ocp-Apim-Subscription-Key": self.key},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            self._token = resp.read().decode("utf-8")
        self._token_at = now
        return self._token

    def _ssml(self, text):
        return (
            "<speak version='1.0' xml:lang='zh-CN'>"
            f"<voice name='{self.voice}'>"
            f"<prosody rate='{self.rate}'>{text}</prosody>"
            "</voice></speak>"
        )

    def synthesize(self, ssml_body, retries=3):
        last_err = None
        for attempt in range(1, retries + 1):
            try:
                token = self._get_token()
                req = urllib.request.Request(
                    TTS_URL_FMT.format(region=self.region),
                    data=ssml_body.encode("utf-8"),
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/ssml+xml",
                        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
                        "User-Agent": "gen-passage-audio.py",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    return resp.read()
            except (urllib.error.URLError, urllib.error.HTTPError, http.client.HTTPException,
                    ConnectionError, TimeoutError) as e:
                last_err = e
                if isinstance(e, urllib.error.HTTPError) and e.code == 401:
                    self._token = None  # force re-issue, then retry
                wait = 2 ** attempt
                print(f"    retry {attempt}/{retries} after error: {e} (waiting {wait}s)")
                time.sleep(wait)
        raise RuntimeError(f"TTS request failed after {retries} attempts: {last_err}")

    def synthesize_text(self, text, **kw):
        return self.synthesize(self._ssml(escape(text)), **kw)

    def synthesize_sentences(self, sentences, **kw):
        pause = f"<break time='{SENTENCE_BREAK_MS}ms'/>"
        joined = pause.join(escape(s) for s in sentences)
        return self.synthesize(self._ssml(joined), **kw)


def load_passages(lesson_filter):
    data = json.loads(PASSAGES_PATH.read_text(encoding="utf-8"))
    keys = lesson_filter or list(data.keys())
    missing = [k for k in keys if k not in data]
    if missing:
        sys.exit(f"Unknown lesson key(s): {', '.join(missing)}")
    return {k: data[k] for k in keys}


def write_if_needed(path, content_bytes, force, dry_run, stats):
    if path.exists() and not force:
        stats["skipped"] += 1
        print(f"  skip (exists): {path.relative_to(ROOT)}")
        return
    if dry_run:
        stats["planned"] += 1
        print(f"  would write: {path.relative_to(ROOT)}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content_bytes)
    stats["written"] += 1
    print(f"  wrote: {path.relative_to(ROOT)} ({len(content_bytes)} bytes)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("lessons", nargs="*", help="lesson keys to process, e.g. p3-1 p3-2 (default: all)")
    ap.add_argument("--mode", choices=["whole", "segments", "both"], default="both",
                     help="which clips to generate (default: both)")
    ap.add_argument("--voice", default=VOICE_DEFAULT)
    ap.add_argument("--rate", default=RATE_DEFAULT, help="SSML prosody rate, e.g. '0%%', '-15%%'")
    ap.add_argument("--out-dir", default=str(OUT_DIR_DEFAULT))
    ap.add_argument("--key", default=os.environ.get("AZURE_SPEECH_KEY"),
                     help="Azure Speech subscription key (default: $AZURE_SPEECH_KEY)")
    ap.add_argument("--region", default=os.environ.get("AZURE_SPEECH_REGION"),
                     help="Azure Speech region, e.g. eastasia (default: $AZURE_SPEECH_REGION)")
    ap.add_argument("--force", action="store_true", help="re-synthesize files that already exist")
    ap.add_argument("--dry-run", action="store_true", help="print planned output, make no network calls")
    ap.add_argument("--sleep", type=float, default=0.3, help="seconds to sleep between requests (default 0.3)")
    args = ap.parse_args()

    if not args.dry_run and not (args.key and args.region):
        sys.exit(
            "Azure Speech key/region required. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION,\n"
            "or pass --key/--region. Use --dry-run to preview output without credentials."
        )

    passages = load_passages(args.lessons)
    out_dir = Path(args.out_dir)
    tts = None if args.dry_run else AzureTts(args.key, args.region, args.voice, args.rate)

    manifest_path = out_dir / "manifest.json"
    manifest = {"voice": args.voice, "rate": args.rate, "lessons": {}}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            pass

    stats = {"written": 0, "skipped": 0, "planned": 0}

    for lesson_key, entries in passages.items():
        print(f"\n=== {lesson_key} ({len(entries)} passages) ===")
        lesson_dir = out_dir / lesson_key
        manifest_entries = []

        for entry in entries:
            pid = entry["id"]
            sentences = entry["sentences"]
            print(f"[{pid}] {entry.get('theme', '')}")

            record = {"id": pid, "theme": entry.get("theme", ""), "sentences": sentences}

            if args.mode in ("whole", "both"):
                whole_path = lesson_dir / f"{pid}.mp3"
                if args.dry_run:
                    write_if_needed(whole_path, b"", args.force, True, stats)
                else:
                    if whole_path.exists() and not args.force:
                        stats["skipped"] += 1
                        print(f"  skip (exists): {whole_path.relative_to(ROOT)}")
                    else:
                        audio = tts.synthesize_sentences(sentences)
                        write_if_needed(whole_path, audio, args.force, False, stats)
                        time.sleep(args.sleep)
                record["whole"] = str(whole_path.relative_to(out_dir))

            if args.mode in ("segments", "both"):
                seg_paths = []
                for i, sentence in enumerate(sentences, start=1):
                    seg_path = lesson_dir / f"{pid}-s{i:02d}.mp3"
                    if args.dry_run:
                        write_if_needed(seg_path, b"", args.force, True, stats)
                    else:
                        if seg_path.exists() and not args.force:
                            stats["skipped"] += 1
                            print(f"  skip (exists): {seg_path.relative_to(ROOT)}")
                        else:
                            audio = tts.synthesize_text(sentence)
                            write_if_needed(seg_path, audio, args.force, False, stats)
                            time.sleep(args.sleep)
                    seg_paths.append(str(seg_path.relative_to(out_dir)))
                record["segments"] = seg_paths

            manifest_entries.append(record)

        manifest["lessons"][lesson_key] = manifest_entries

    if not args.dry_run:
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"\nWrote manifest: {manifest_path.relative_to(ROOT)}")

    print(f"\nDone. written={stats['written']} skipped={stats['skipped']} planned={stats['planned']}")


if __name__ == "__main__":
    main()
