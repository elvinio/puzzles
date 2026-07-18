# Chinese datasets

Data files consumed by the pages in `chinese/` (see `../README.md` for how
each file maps to a page). This file documents `p3-passage.json` in depth —
the passage-and-quiz dataset — including the exact workflow to extend it to
more lessons.

## `p3-passage.json`

Reading passages generated from the character list of each P3 lesson in
`chinese-p3.json`, each paired with a 5-question multiple-choice quiz.
**Not yet wired into any page** — it's a standalone dataset for a future
reading-comprehension mode.

Keyed by lesson id, matching the keys in `chinese-p3.json` (`"p3-1"`,
`"p3-2"`, …). Each lesson maps to an array of passage objects:

```jsonc
{
  "p3-1": [
    {
      "id": "p3-1-passage-1",
      "theme": "成为科学家的心愿",
      "sentences": [
        "小美从小就希望将来成为一名科学家。",
        "她最喜欢的科目是科学,所以每天都努力学习。"
        // … 5-6 sentences total
      ],
      "characters_used": ["希", "望", "科", "努"],
      "questions": [
        {
          "question": "小美将来希望成为什么?",
          "options": ["医生", "科学家", "司机", "军人", "老师", "翻译家"],
          "answer": "科学家"
        }
        // … 5 questions total, each with exactly 6 options
      ]
    }
    // … 5 passages per lesson
  ]
  // … more lessons
}
```

Field notes:

- **No English anywhere** — passages, questions, and options are Chinese
  only (unlike `chinese-p3.json`, which pairs Chinese with English glosses).
- **`characters_used`** must be exactly the lesson characters that literally
  appear in that passage's `sentences` — not an aspirational list. Not every
  lesson character needs to appear in every passage, but across the 5
  passages for a lesson, every character in that lesson should appear at
  least once.
- **`questions`** — always exactly 5 per passage, each with exactly 6
  options, and `answer` must be a verbatim copy of one of the options
  (options are matched as plain strings, not by index).

## Workflow for adding the next lesson (e.g. `p3-2`)

1. **Pull the lesson's character list** from `chinese-p3.json[<lesson key>]`
   — the `character`, `pinyin`, `english`, and `words` fields per entry are
   your vocabulary bank. The `sentence`/`complex` fields already in that
   file show the target grammar level (P3 patterns like 虽然…但是,
   因为…所以, 不但…而且, 一边…一边, 只要…就, 为了…) — reuse that register.

2. **Write 5 passages**, each 5-6 sentences, each on a different theme
   (school life, family, sports, nature, a small story, etc. — vary them).
   Draw vocabulary from the lesson's `words` compounds where natural (e.g.
   科 → 科学/科目, 望 → 希望/望远镜) rather than using bare characters in
   contrived ways.

3. **Record `characters_used` per passage** as the literal intersection of
   the lesson's characters and that passage's sentence text — don't guess;
   derive it by checking each lesson character against the joined sentence
   string.

4. **Write 5 questions per passage**, each with 6 Chinese-only options and
   an `answer` copied verbatim from one option. Mix question types: passage
   comprehension (who/what/when), vocabulary/character meaning, and detail
   recall. Keep wrong options plausible but clearly wrong on a careful
   re-read.

5. **Check full lesson coverage** — every character in the lesson should
   appear in `characters_used` somewhere across the 5 passages. It's easy
   to accidentally drop one or two (e.g. a character whose only natural
   word, like 司 → 司令/司机, doesn't fit the themes chosen) — make sure to
   deliberately place a sentence for it if it's missing after the first
   draft.

6. **Validate before committing:**

   ```
   python3 tools/validate-p3-passage.py p3-2
   ```

   This checks sentence counts, that `characters_used` only contains real
   lesson characters that actually occur in the text, that every question
   has 6 options with a matching answer, and that the full lesson character
   set is covered across the 5 passages. Fix anything it flags — it exists
   specifically because earlier passes silently dropped a character or left
   a `characters_used` entry stale after an edit.

7. **Merge into the existing file** — add the new lesson key alongside the
   existing ones in `p3-passage.json`; don't overwrite other lessons.

If this dataset is later extended to P1/P2 as well, it'll need either a
separate `p1-passage.json`/`p2-passage.json` per level (mirroring the
`chinese-p{1,2,3}.json` split) or a rename to something level-agnostic —
not yet decided, so don't assume `p3-passage.json` will hold non-P3 lessons.
