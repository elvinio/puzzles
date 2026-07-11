# chinese.html — Remaining Improvements (from the 2026-07 review)

Backlog of items identified in the four-perspective review (teacher / SRS / engineer / designer)
that were **not** implemented in branch `claude/chinese-html-analysis-nu53ar`. That branch already
shipped: mode-aware SRS grading + graduation fix + ease recovery + early-review scaling +
in-session retry, the cheat-hole/listener-leak/mix-shrink/spelling-leak/stats-desync bug fixes,
the wrong-answer feedback strip, hidden WRONG counter, 听音 listening mode, stroke animation in
the char modal, tappable modal chips, and per-lesson mastery bars.

## Data fix (quick win)

- [ ] **Missing `yi` audio**: `pinyin_audio/` has no `yi1.mp3`–`yi4.mp3`, so 衣 / 一 / 医 and every
  other yī-family word plays no local audio (the queue skips silently). Record or source the four
  files, then add `'yi'` to `VALID_SYLLABLES` in chinese.html so the confusable generator can use it.

## New test modes (teacher)

- [x] **Sentence-level cloze**: shipped as the 句子填空 mode (`sentence-fill`) — blanks every
  occurrence of the character inside the full sentence, distractors excluded from characters
  already visible in the sentence.
- [x] **连词成句 (sentence reorder)**: shipped as the `reorder` mode — greedy longest-match
  segmentation against the level's own vocabulary, tap-to-order chips, auto-check on last chip.
- [x] **Homophone-in-context choice (选字填空, visual)**: shipped as the 选字 mode
  (`choose-char`) — sentence blank with `same-sounding-character` distractors and a safe pinyin
  hint (all options sound identical).
- [x] **Tone-tap drill**: shipped as the 声调 mode (`tone-tap`) — four fixed options (the word's
  syllable in tones 1–4); skips neutral-tone particles and p3 polyphones ("wèi / wéi").
- [ ] **量词 (measure word) drills**: needs a small data addition (measure word per noun) —
  flag entries in chinese-p*.json first.
- [ ] **Adaptive stroke scaffolding**: in 写词/找错字, pass `showOutline: true` to HanziWriter when
  the word's record is weak (e.g. interval < 7) and hide it at higher mastery, so support fades
  as skill grows.

## Distractor / question quality (teacher)

- [ ] **Smarter English→汉字 distractors**: currently random pool characters (`makeEnglishChinese`
  → `pickChars`). Prefer characters sharing a radical, similar stroke shape, or related meaning.
  (Radical data exists in `radicals.html` / `hanzi-data` and could be indexed.)
- [ ] **Guess-rate mitigation for MCQ (25% at 4 options)**: use 6 options at P2/P3, or a short
  "think first" beat before options render (retrieval before recognition).
- [ ] **找错字 ambiguity edge**: if the homophone distractor legitimately appears elsewhere in the
  sentence, two identical characters make the "wrong" one ambiguous. Skip such distractors in
  `makeFindCorrect` (check `chinese.includes(distractorChar)` before swapping).

## SRS (deeper changes — need care with existing saved records)

- [x] **Per-skill scheduling split**: shipped — records carry `rec.skills` with a full
  interval/ease/due/lastTested schedule per group (recognition / writing / speaking); queues,
  mastery, and stats are group-aware, and `loadProgress` migrates legacy flat records on read
  (idempotent). `mergeSrRecord` in sync-merge.js merges schedules per group.
- [x] **Deduplicate characters across lessons**: shipped — records are keyed by character alone;
  legacy `p*-N-char` keys fold on read via `mergeSrRecord`. Known trade-off: polyphones
  (为 wèi/wéi) share one schedule.
- [x] **Interval fuzz**: shipped — `fuzzedDueOffset` jitters `dueDate` by ±5% (intervals ≥ 5
  days); the stored interval stays exact.
- [x] **Per-mode average time in Stats**: shipped — `byMode` now records `timeMs`/`timed`; the
  Avg Time column shows the recognition-only average with per-group averages in the tooltip.
- [x] **(extra) Reset progress**: two-step-confirmed reset in the ⚙ Settings modal; writes a
  `_resetAt` tombstone so Drive sync propagates the wipe instead of resurrecting old records.

## Engineering (minor)

- [ ] **HanziWriter canvas size on rotation**: `fcWriter` keeps its creation-time width/height;
  recreate or resize on orientation change / large viewport resize.
- [ ] **Lazy-load level JSONs**: all three levels (~670 KB) are fetched on page load; loading only
  the selected level would speed first paint on cold cache (service worker mitigates repeat visits).

## Explore / motivation (designer, lower priority)

- [ ] **Richer mastery view for the student**: the lesson-tab bars are minimal by design; a
  child-friendly per-lesson detail (e.g. tap-and-hold a lesson tab → grid of its words colored by
  mastery) would guide self-directed exploration without touching the test screen.
