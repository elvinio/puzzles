# Chinese app

Chinese-language learning corner of the Puzzles PWA. Everything Chinese-specific
lives in this `chinese/` directory; shared site infrastructure stays at the repo
root (see [Shared root dependencies](#shared-root-dependencies)).

## Pages

`chinese.html` is the **hub** — the practice engine — and links to the other
sub-pages from its top nav. Only `chinese.html` and `pinyin_tones.html` are
surfaced on the site's root `../index.html`; the others are reached from within
the hub.

| Page | What it is | Data source |
|------|------------|-------------|
| `chinese.html` | Practice hub: SRS flashcards + ~14 quiz modes across 3 levels, 默写 spelling tests, dictionary browse (with stroke-order + TTS per word), stats, speech (STT/TTS) | `data/chinese-p{1,2,3}.json`, `hanzi-data/`, `pinyin_audio/` |
| `radicals.html` | Kangxi radical reference, searchable | inline (data hard-coded in `radicals.js`) |
| `pinyin_tones.html` | Pinyin tone drills (play the 4 tones of a syllable) | `pinyin_audio/` |

## File layout

Each page is a trio — `<name>.html` + `<name>.css` + `<name>.js` — so markup,
style, and logic are separate and easy to navigate:

```
chinese/
  README.md              this file
  TODO.md                backlog / improvement notes
  common.css             @font-face (KaiTi) + box-model reset  — loaded by every page first
  common.js              shared JS: pinyin toolkit + esc()      — loaded by pages that use it
  chinese.html / .css / .js
  radicals.html / .css / .js
  pinyin_tones.html / .css / .js
  data/                  chinese-p{1,2,3}.json, chinese-idioms-p{1,3}.json
  fonts/                 KaiTiRegular.ttf  (the Chinese display font)
  pinyin_audio/          <syllable><tone>.mp3  (e.g. hao3.mp3) — 1500+ clips
  hanzi-data/
    hanzi-writer.min.js  stroke-order animation library
    chars/<char>.json    per-character stroke data (lazy-loaded)
```

### Shared code: `common.css` / `common.js`

- **`common.css`** — only the rules that are byte-identical across pages: the
  `@font-face` for KaiTi and the `* { box-sizing/margin/padding }` reset. Each
  page keeps its **own `:root` palette** in its `<name>.css` because the token
  sets deliberately differ (e.g. `--p-lt` is a bright purple in the hub/cards but
  a pale lavender in radicals/pinyin). Every page links `common.css` **then** its
  own `<name>.css`.
- **`common.js`** — a classic (non-module) script that defines page-global
  helpers, so it must load **before** the page's own `<name>.js`. Contents:
  - **Pinyin toolkit** — tone-mark lookup tables (`TONED_TO_BASE`,
    `BASE_TO_TONES`, `TONE_NUMBER`, `INITIALS`, `SIMILAR_FINALS`,
    `SIMILAR_INITIALS`, `VALID_SYLLABLES`) and helpers (`stripTones`,
    `addToneMark`, `toneMarkIndex`, `extractInitial`, `extractFinal`,
    `getToneVariants`, `getSimilarFromPool`, `synthesizeConfusables`). Self-
    contained and reusable — the natural place to build new pinyin-aware modes.
  - **`esc(s)`** — HTML-escape for safe `innerHTML` interpolation.

  Currently loaded by `chinese.html`. `radicals.html` and `pinyin_tones.html`
  don't use these helpers, so they don't load `common.js` — add the
  `<script src="common.js">` tag before their `<name>.js` if a future change
  needs the toolkit.

## Shared root dependencies

The pages reference site-wide infrastructure at the repo root via `../`:

- `../styles.css` — shared design tokens + `.pz-*` sync-menu components.
- `../sync-registry.js`, `../sync-merge.js`, `../sync-drive.js`, `../sync-ui.js`
  — Google-Drive backup + local merge. Progress is stored under localStorage
  keys matching `chinese-progress-*` (merge strategy declared in
  `../sync-registry.js`).
- `../avatar.js` — floating avatar badge / profile.
- `../app.js` — per-page bootstrap; **registers the service worker** and
  resolves it against its own URL, so the root-scoped `../sw.js` is used
  correctly even though these pages live in a subdirectory.
- `../manifest.webmanifest`, `../icons/…`, back-links to `../index.html` /
  `../avatar.html`.

`../sw.js` precaches all three pages, their css/js, `data/*.json`, and the hanzi
library; `pinyin_audio/*.mp3` and `hanzi-data/chars/*.json` are runtime
cache-first. **When you add or rename a page/asset here, update the `PRECACHE`
list and bump `VERSION` in `../sw.js`.**

## Data schema

`data/chinese-p{1,2,3}.json` — one file per primary level, keyed by lesson id:

```jsonc
{
  "p1-1": [
    {
      "character": "衣",
      "english": "clothing",
      "pinyin": "yī",
      "same-sounding-character": ["一 (one)", "医 (doctor)"],
      "words": ["衣服 (yī fu, clothes)", "衣柜 (yī guì, wardrobe)"],
      "definition-english": "Clothing worn on the body; garment or dress",
      "definition-chinese": "穿在身体上面的东西",
      "sentence": "这件衣服很漂亮。(This piece of clothing is very pretty.)"
    }
    // …more characters
  ]
  // …more lessons: "p1-2", "p1-3", …
}
```

`data/chinese-idioms-p{1,3}.json` — a flat array of
`{ character, idiom, pinyin, meaning-chinese, meaning-english }`. **Not yet
consumed by any page** (precached for a planned idioms feature).

Per-character stroke data is lazy-loaded from `hanzi-data/chars/<char>.json` by
the hanzi-writer library when a stroke animation is requested. If a character
has no stroke data, the card modal falls back to showing the plain glyph
instead of an animation.

### Regenerating stroke data

Whenever `data/chinese-p{1,2,3}.json` gains new `character` values, run from
the repo root:

```
python3 tools/gen-hanzi-data.py
```

It scans those three files for every character in use, then re-vendors
`hanzi-data/hanzi-writer.min.js` and `hanzi-data/chars/<char>.json` for each
one from the `hanzi-writer`/`hanzi-writer-data` npm packages (fetched
directly from `registry.npmjs.org`, no `npm install` needed). It's idempotent
— safe to rerun any time — and prints a warning listing any characters the
source package doesn't cover (rare; these keep the plain-glyph fallback).

## Extending the hub

- **Levels** (`data-level="p1|p2|p3"`) and **practice modes**
  (`data-mode="pinyin-chinese"`, `chinese-pinyin`, `english-chinese`,
  `listening`, `word-fill`, `word-write`, `find-correct`, `sentence-fill`,
  `choose-char`, `tone-tap`, `reorder`, `mix`, `pronunciation`, `puzzle`) are
  tab buttons near the top of `chinese.html`; their behaviour lives in
  `chinese.js`. Add a mode by adding a tab button + its handler branch.
- **Pronunciation / TTS** use a user-configured Azure speech proxy
  (`cfg.proxyUrl`), not a bundled service — configured in the in-app speech
  settings modal, no file to ship.
- New pinyin-aware logic should reuse the toolkit in `common.js` rather than
  re-implementing tone-mark handling.
