# CLAUDE.md — chinese/

Practical, agent-facing notes for working in this directory — things learned
while building the 📖🎤 朗读 (read-aloud passage) mode that aren't already
covered by the human-facing docs. **Read `README.md` first** for the page
inventory, file layout, and data schemas; `TODO.md` for the backlog; and
`data/README.md` for the `p3-passage.json` schema in depth. This file only
adds what those don't.

## Running and testing

No build step — static HTML/JS/CSS served directly. From the repo root:
`python3 -m http.server 3456` (matches `.claude/launch.json` at the repo
root), then open `http://localhost:3456/chinese/chinese.html`. Must be
served from the repo root, not from inside `chinese/` — pages reference
shared infra via `../app.js`, `../avatar.js`, etc.

Playwright is installed globally, not in this repo (there's no
node_modules/package.json here): require it via
`require('/opt/node22/lib/node_modules/playwright')`. Chromium lives at
`/opt/pw-browsers/chromium` — pass `executablePath` explicitly when
launching.

**Testing anything gated on an avatar** (`S.avatarId` in `chinese.js` — the
setup screen's Start button stays disabled without one): seed localStorage
before navigating, via `page.addInitScript`:
```js
localStorage.setItem('puzzles-avatars', JSON.stringify([{ id: 'av_test', nickname: 'Tester', scores: {} }]));
localStorage.setItem('puzzles-avatar-active', 'av_test');
```

**Testing anything behind the Azure speech proxy** (🎤 Speak, 📖🎤 朗读,
`oral.js`) without real credentials: launch Chromium with
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` (auto-
grants mic permission and provides a synthetic input device), seed
`chinese-azure-speech` in localStorage with a fake `{proxyUrl, apiKey,
threshold}`, and point `proxyUrl` at a small local HTTP server that mimics
the proxy's response shape for `?action=STT`:
```json
{"RecognitionStatus":"Success","NBest":[{"AccuracyScore":0,"Words":[{"Word":"字","PronunciationAssessment":{"AccuracyScore":90,"ErrorType":"None"}}]}]}
```
(read the real `ReferenceText` back out of the request's base64-encoded
`Pronunciation-Assessment` header if the mock needs to generate one scored
unit per character). This exercises the full mic-hold → WAV-encode →
network round-trip → response-parsing → render pipeline for real, not just
DOM assertions — worth doing for any change touching the recording/scoring
path, since that's exactly where subtle bugs (misalignment, wrong tier
colors, double-persisted SRS records) would show up.

## Gotcha: `chinese.js` contains a literal null byte

Line 789, inside `makeReorder`'s shuffle-uniqueness check: `s.join('\x00')`.
A `\0` join separator (rather than `''` or `' '`) avoids false-equal
collisions when comparing shuffled vs. original chunk arrays. Two
consequences worth knowing:

- It makes ripgrep — and the Grep tool — treat the **entire file** as
  binary and silently return zero matches (confirmed: `grep`/Grep report
  `binary file matches (found "\0" byte around offset 36839)` instead of
  actual results). Use `grep -a` via Bash, or just `Read` the relevant line
  range, instead of trusting a Grep miss on this file.
- The `Read` tool renders the byte visually indistinguishable from a plain
  space in its output — don't assume what you see in a `Read` of that line
  is literally what's on disk if something null-byte-adjacent looks off.

## Adding a new test mode: the registries you need to touch

Every practice mode in `chinese.html` (single-word flashcard or whole-screen
passage mode alike) needs entries in several places, or it renders/scores
inconsistently — easy to under-shoot:

- **`MODE_GROUP`** — which `SKILL_GROUPS` bucket (`listening`/
  `recognition`/`writing`/`speaking`) the mode's results count toward.
  Reuse an existing group if the new mode exercises the same underlying
  skill as an existing one (e.g. 朗读 buckets into `speaking`, same as
  🎤 Speak) rather than inventing a new group — a new group needs a
  `migrateProgress` backfill branch for old records (see how `listening`
  was split out), which usually isn't warranted.
- **`MODE_LABELS`** — human-readable name for tabs/bug reports.
- **`WHOLE_SCREEN_MODES`** — if the mode is its own screen (like the 4
  passage modes) rather than a flashcard-queue mode that can combine with
  others via Mix.
- **`startSession`'s dispatch `if` chain**, and a setup-screen tab button in
  the matching `.mode-group-*` div (inherits that group's color for free).
- **Persistence**: passage-style modes call `updateRecord`+`saveProgress`
  directly (see `startPassageMcq`/`startPassageSpeaking`), not
  `registerResult`/`makeCard` — those are specific to the single-card
  flashcard queue in the 🎮 game screen.
- **Summary screen**: if the mode's result rows need something other than
  elapsed seconds (e.g. a score), extend the `result-time` special-case in
  `showSummary`, which currently keys off `r.type`.

## Shared audio-recording core (🎤 Speak + 📖🎤 朗读)

Both mic-recording modes share one recorder core in `chinese.js` instead of
each forking its own copy of the MediaRecorder/WAV-encode/network glue:

- `recStartHold(site)` / `recStopHold()` / `recReleaseMic()` — low-level
  hold-to-record lifecycle (mic acquisition, MediaRecorder, min/max-duration
  handling). Only one recording can be in flight app-wide.
- `processAttempt(blob, site)` — WAV-encodes the blob (`blobToWav16kMono`),
  calls `assessPronunciation`, dispatches to the site's result/error
  handlers.
- Each mode builds its own `site` descriptor (DOM ids, timing constants,
  callbacks into its own state) fresh each time it's needed, so it always
  reads live state rather than a stale snapshot — see `prSite()` (single
  word) and `psSite()` (passage) for the pattern. **A future recording-based
  mode should add a third `xxSite()` builder and call the same
  `recStartHold`/`processAttempt`, not duplicate the pipeline.**
- `assessPronunciation(wavBlob, referenceText, timeoutMs)` and
  `parsePronResultForText(json, text)` are already generic over arbitrary
  reference text, not just single vocab words — `parsePronResultForText`
  aligns Azure's flattened per-syllable results positionally against a
  text's Han characters (via `HAN_CHAR_RE`), leaving punctuation unscored
  rather than hardcoding a punctuation whitelist. Reuse these directly for
  any future feature that scores pronunciation of text longer than one
  word — no reason to write a third parser.
- Recording/network timeouts scale with reference-text length rather than
  being a flat constant: single words use a flat 6s record / 10s network
  timeout; sentences and whole passages use `psSentenceMaxRecordMs`/
  `psWholeMaxRecordMs` and 15s/90s network timeouts respectively, since
  Azure's short-audio pronunciation endpoint isn't reliable much past a few
  seconds to ~20s of continuous speech per call, and a full passage read
  can run 60-190s. `oral.js` (a separate, duplicated recording pipeline for
  free-form spoken answers) independently converged on 30s/12s — a useful
  cross-check when picking timeouts for yet another recording use case.

## 📖🎤 朗读 (passage-speaking) mode

Fourth passage mode (alongside 短文改错/短文理解/听力理解 — see
`data/README.md`), reads a `p3-passage.json` passage aloud and scores it
character-by-character. Sentence-by-sentence recording is the default
flow (each sentence is its own hold-record-score-advance/retry/skip cycle,
mirroring 🎤 Speak's UX); a secondary whole-passage continuous-recording
flow sits behind a tab toggle, explicitly labeled "(beta)" since a single
60-190s recording pushes well past what Azure's endpoint is tuned for and
hasn't been validated against a real deployed proxy — ship/rely on the
sentence flow first if in doubt.

Scoring reuses the flowing per-character `<span class="pe-char">` pattern
from 短文改错 (colored by accuracy tier via `.ps-tier-0`..`.ps-tier-3`)
rather than 🎤 Speak's per-syllable chip row (`.pr-syl`) — chips read fine
for a 2-4 character word but become an unreadable wall of pills across a
full passage. Only the first attempt's scores get painted into the passage
and persisted per sentence; retries only move a live "Best" readout,
mirroring 🎤 Speak's "first attempt counts for SRS" contract, so the final
colored recap never contradicts what was actually saved. Persisted once per
unique in-pool character per sentence (not per occurrence), so a sentence
repeating 的/了/是 doesn't inflate that character's `rec.attempts` or
over-advance its SRS interval from what is really one continuous
performance.
