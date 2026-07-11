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

- [ ] **Sentence-level cloze**: every data entry has a full example `sentence`, but word-fill only
  blanks a 2-character phrase. Add a mode (or extend 词语) that blanks the character inside the
  full sentence — closer to P3 exam format.
- [ ] **连词成句 (sentence reorder)**: scramble the words of `sentence`, student taps them into
  order. P3 exam staple; data already sufficient.
- [ ] **Homophone-in-context choice (选字填空, visual)**: show the sentence with a blank and offer
  the correct character plus its `same-sounding-character` entries (在/再 style). The listening
  mode covers the audio-driven variant; this is the reading-driven one.
- [ ] **Tone-tap drill**: show the 汉字, student taps tone 1–4. Cheap: `TONE_NUMBER` already maps
  tones, and wrong options are implicit.
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

- [ ] **Per-skill scheduling split**: one record per (lesson, char) is still shared across modes;
  the new `byMode` counters only *report* the split. Full fix = separate due date/interval per
  skill group (recognition / writing / speaking) so recognition success stops postponing writing
  practice. Requires a record migration in `loadProgress`.
- [ ] **Deduplicate characters across lessons**: record key is `${lessonKey}-${character}`, so the
  same character in two lessons carries two independent schedules. Consider keying by character
  (keep lesson as metadata) — also a migration.
- [ ] **Interval fuzz**: add ±5–10% jitter to `dueDate` so cards reviewed together don't pile up
  on the same future day forever.
- [ ] **Per-mode average time in Stats**: "Avg Time" still mixes 3s MCQ taps with 40s writing.
  Either split by `byMode` (now recorded) or show avg only for recognition modes.

## Engineering (minor)

- [ ] **HanziWriter canvas size on rotation**: `fcWriter` keeps its creation-time width/height;
  recreate or resize on orientation change / large viewport resize.
- [ ] **Lazy-load level JSONs**: all three levels (~670 KB) are fetched on page load; loading only
  the selected level would speed first paint on cold cache (service worker mitigates repeat visits).

## Explore / motivation (designer, lower priority)

- [ ] **Richer mastery view for the student**: the lesson-tab bars are minimal by design; a
  child-friendly per-lesson detail (e.g. tap-and-hold a lesson tab → grid of its words colored by
  mastery) would guide self-directed exploration without touching the test screen.
