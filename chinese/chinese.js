/* chinese.js — main logic for the Chinese practice hub (chinese.html).
   Shared pinyin toolkit + esc() live in common.js, loaded first. */
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // EDITABLE CONFIG
    // ═══════════════════════════════════════════════════════════════
    const SESSION_CONFIG = {
      p1: { cards: 10, minutes: 6 },
      p2: { cards: 12, minutes: 8 },
      p3: { cards: 15, minutes: 10 },
    };
    const LESSON_GROUPS = [3, 6, 9, 12, 15, 19];

    // ═══════════════════════════════════════════════════════════════
    // DATA
    // ═══════════════════════════════════════════════════════════════
    const DATA = { p1: null, p2: null, p3: null };

    const dataPromise = Promise.all([
      fetch('data/chinese-p1.json').then(r => r.json()).catch(() => null),
      fetch('data/chinese-p2.json').then(r => r.json()).catch(() => null),
      fetch('data/chinese-p3.json').then(r => r.json()).catch(() => null),
    ]).then(([p1, p2, p3]) => { 
      DATA.p1 = p1; DATA.p2 = p2; DATA.p3 = p3; 
      if (typeof renderSetupLessonTabs === 'function') renderSetupLessonTabs();
    });

    function getWordPool(level, lessons) {
      const data = DATA[level];
      if (!data) return [];
      const seen = new Set();
      const words = [];
      const lessonArray = (lessons === 'all') ? Array.from({length: getLessonCount(level)}, (_, i) => i + 1) : lessons;
      for (const i of lessonArray) {
        const lessonKey = `${level}-${i}`;
        (data[lessonKey] || []).forEach(entry => {
          // Progress records are keyed by character alone — the same character
          // in several lessons shares one schedule (first lesson's entry wins
          // as the displayed metadata).
          const key = entry.character;
          if (!seen.has(key)) {
            seen.add(key);
            words.push({ key, lessonKey, lessonNum: i, level, ...entry });
          }
        });
      }
      return words;
    }

    // ═══════════════════════════════════════════════════════════════
    // PROGRESS (Spaced Repetition Storage)
    // ═══════════════════════════════════════════════════════════════
    function progressKey(avatarId) { return `chinese-progress-${avatarId}`; }

    function loadProgress(avatarId) {
      let map;
      try { map = JSON.parse(localStorage.getItem(progressKey(avatarId)) || '{}') || {}; }
      catch { return {}; }
      return migrateProgress(avatarId, map);
    }

    // Records used to be keyed `${level}-${lesson}-${character}`, giving the
    // same character an independent schedule per lesson. They are now keyed by
    // character alone (lesson/level live on the pool words as metadata).
    const LEGACY_KEY_RE = /^p\d+-\d+-(.+)$/;

    // Upgrades stored records to the current shape. Runs on every read because
    // the sync layer (applySnapshot) writes merged blobs straight to
    // localStorage — a stale device can re-introduce legacy shapes at any time
    // — so each step is shape-detected and idempotent. Writes back when
    // anything changed so sync snapshots upload migrated data.
    function migrateProgress(avatarId, map) {
      let changed = false;
      // A reset stores a `_resetAt` tombstone instead of just wiping the map —
      // the sync merge unions keys, so a bare wipe would be resurrected by the
      // next snapshot. Records last tested before the reset day are dropped
      // here and in mergeSrMap. (Records from the reset day itself survive a
      // cross-device merge — acceptable soft edge.)
      const resetDay = String(map._resetAt || '').slice(0, 10);
      const out = {};
      for (const [key, rec] of Object.entries(map)) {
        if (key.charAt(0) === '_') { out[key] = rec; continue; }  // meta keys (e.g. reset tombstone)
        if (!rec || typeof rec !== 'object') { changed = true; continue; }
        if (resetDay && rec.lastTested && String(rec.lastTested).slice(0, 10) < resetDay) { changed = true; continue; }
        let r = rec;
        // Records once kept a single flat schedule; seed every group from it,
        // then drop the flat fields.
        if (!r.skills || 'interval' in r) {
          r = { ...r };
          if (!r.skills) {
            const sched = { interval: r.interval || 1, easeFactor: r.easeFactor || 2.5, dueDate: r.dueDate || todayStr(), lastTested: r.lastTested || null };
            r.skills = {};
            SKILL_GROUPS.forEach(g => r.skills[g] = { ...sched });
          }
          delete r.interval; delete r.easeFactor; delete r.dueDate;
          changed = true;
        }
        const legacy = key.match(LEGACY_KEY_RE);
        const newKey = legacy ? legacy[1] : key;
        if (newKey !== key) changed = true;
        // Same character from two lessons (or re-synced legacy keys): fold with
        // the sync merge semantics — monotone, so re-folding never inflates.
        out[newKey] = out[newKey] ? window.PZSyncMerge.mergeSrRecord(out[newKey], r) : r;
      }
      if (changed) saveProgress(avatarId, out);
      return out;
    }

    // Erase an avatar's SRS history, leaving a tombstone that propagates the
    // reset through Drive sync (a bare wipe would be resurrected by the merge's
    // key union).
    function resetProgress(avatarId) {
      saveProgress(avatarId, { _resetAt: new Date().toISOString() });
      if (S.avatarId === avatarId) S.progress = loadProgress(avatarId);
    }

    function saveProgress(avatarId, progress) {
      try { localStorage.setItem(progressKey(avatarId), JSON.stringify(progress)); }
      catch { }
    }

    // Remembers each avatar's last-selected level so re-opening (or switching
    // avatars) restores where that student left off instead of always p1.
    function lastLevelKey(avatarId) { return `chinese-last-level-${avatarId}`; }

    function loadLastLevel(avatarId) {
      try { return localStorage.getItem(lastLevelKey(avatarId)) || 'p1'; }
      catch { return 'p1'; }
    }

    function saveLastLevel(avatarId, level) {
      try { localStorage.setItem(lastLevelKey(avatarId), level); }
      catch { }
    }

    const AZURE_CONFIG_KEY = 'chinese-azure-speech';

    function getAzureConfig() {
      let cfg = {};
      try { cfg = JSON.parse(localStorage.getItem(AZURE_CONFIG_KEY) || '{}'); } catch { }
      return { proxyUrl: (cfg.proxyUrl || '').replace(/\/+$/, ''), apiKey: cfg.apiKey || '', threshold: cfg.threshold || 70 };
    }

    function saveAzureConfig(cfg) {
      try { localStorage.setItem(AZURE_CONFIG_KEY, JSON.stringify(cfg)); } catch { }
    }

    function isAzureConfigured() {
      const cfg = getAzureConfig();
      return !!(cfg.proxyUrl && cfg.apiKey);
    }

    // Each record carries one schedule per skill group (rec.skills) so
    // recognition success can't postpone writing practice. The top-level
    // lastTested tracks the most recent practice in any group (used by the
    // sync merge and the reset tombstone).
    const SKILL_GROUPS = ['recognition', 'writing', 'speaking'];

    function freshSkill() {
      return { interval: 1, easeFactor: 2.5, dueDate: todayStr(), lastTested: null };
    }

    function freshSkills() {
      const s = {};
      SKILL_GROUPS.forEach(g => s[g] = freshSkill());
      return s;
    }

    function getSkill(rec, group) {
      return rec.skills[group];
    }

    function freshRecord() {
      return { correct: 0, wrong: 0, totalTimeMs: 0, attempts: 0, lastTested: null, skills: freshSkills() };
    }

    function todayStr() { return new Date().toISOString().slice(0, 10); }

    // Cards graded together would otherwise stay due on the same future day
    // forever; ±5% jitter on the calendar offset spreads them out. The stored
    // interval stays exact so growth math and mastery thresholds are unaffected.
    function fuzzedDueOffset(interval) {
      if (interval < 5) return interval;
      const jitter = Math.round(interval * (Math.random() * 0.10 - 0.05));
      return Math.max(1, interval + jitter);
    }

    // Which memory each test mode exercises — tracked separately inside the
    // record so recognition success doesn't hide production weakness.
    const MODE_GROUP = {
      'pinyin-chinese': 'recognition', 'chinese-pinyin': 'recognition',
      'english-chinese': 'recognition', 'word-fill': 'recognition',
      'listening': 'recognition',
      'sentence-fill': 'recognition', 'choose-char': 'recognition',
      'tone-tap': 'recognition', 'reorder': 'recognition',
      'word-write': 'writing', 'find-correct': 'writing',
      'pronunciation': 'speaking',
    };

    // Human-readable label per test mode / card type, reused by the setup
    // mode tabs' wording and by bug reports (so a report always names the
    // mode the way the student saw it, even under Mix All).
    const MODE_LABELS = {
      'pinyin-chinese': 'Pinyin → 汉字', 'chinese-pinyin': '汉字 → Pinyin',
      'english-chinese': 'English → 汉字', 'listening': '🔊 听音',
      'word-fill': '词语', 'word-write': '写词', 'find-correct': '找错字',
      'sentence-fill': '句子填空', 'choose-char': '选字', 'tone-tap': '声调',
      'reorder': '连词成句', 'mix': 'Mix All', 'pronunciation': '🎤 Speak',
    };

    function daysBetween(fromStr, toStr) {
      return Math.round((new Date(toStr) - new Date(fromStr)) / 86400000);
    }

    // Reviews done ahead of schedule (e.g. queue filler) prove less about memory
    // than on-time ones, so their interval growth is scaled by how much of the
    // scheduled gap actually elapsed (never below half).
    function schedEarliness(sched) {
      const today = todayStr();
      if (!sched.lastTested || !sched.dueDate || sched.dueDate <= today) return 1;
      const elapsed = Math.max(0, daysBetween(sched.lastTested, today));
      return Math.min(1, Math.max(0.5, elapsed / Math.max(1, sched.interval)));
    }

    // Pure per-skill scheduling: advances one {interval, easeFactor, dueDate,
    // lastTested} schedule by one graded answer.
    function gradeSched(sched, correct, grade) {
      sched = { ...sched };
      const earliness = schedEarliness(sched);
      if (correct) {
        let factor;
        if (grade === 'easy') { factor = sched.easeFactor; sched.easeFactor = Math.min(2.8, sched.easeFactor + 0.05); }
        else if (grade === 'hard') { factor = 1.3; sched.easeFactor = Math.max(1.3, sched.easeFactor - 0.10); }
        else { factor = 2.0; sched.easeFactor = Math.max(1.3, sched.easeFactor - 0.05); }
        const growth = Math.round((Math.round(sched.interval * factor) - sched.interval) * earliness);
        // Always grow by at least one day so slow-but-correct cards can graduate
        sched.interval = Math.min(365, sched.interval + Math.max(1, growth));
      } else {
        sched.easeFactor = Math.max(1.3, sched.easeFactor - 0.15);
        sched.interval = 1;
      }
      sched.lastTested = todayStr();
      const due = new Date();
      due.setDate(due.getDate() + fuzzedDueOffset(sched.interval));
      sched.dueDate = due.toISOString().slice(0, 10);
      return sched;
    }

    // grade: 'easy' | 'good' | 'hard' — how comfortably the answer was produced.
    // Callers derive it from a mode-appropriate signal (latency for MCQ, stroke
    // mistakes for writing, score for speech) so writing/speaking cards aren't
    // punished for inherently taking longer than a multiple-choice tap.
    function updateRecord(rec, correct, timeMs, grade = 'good', modeGroup = null) {
      rec = { ...rec };
      const group = modeGroup || 'recognition';
      rec.skills = { ...rec.skills };
      rec.attempts++;
      rec.lastTested = todayStr();
      rec.totalTimeMs += timeMs;
      correct ? rec.correct++ : rec.wrong++;
      rec.byMode = { ...(rec.byMode || {}) };
      const m = rec.byMode[group] = { ...(rec.byMode[group] || { correct: 0, wrong: 0 }) };
      correct ? m.correct++ : m.wrong++;
      // `timed` counts only attempts that contributed time — byMode counts
      // recorded before timeMs existed would understate averages otherwise.
      m.timeMs = (m.timeMs || 0) + timeMs;
      m.timed = (m.timed || 0) + 1;
      rec.skills[group] = gradeSched(rec.skills[group], correct, grade);
      return rec;
    }

    // Which skill schedules a session exercises: single-group modes look only
    // at their own schedule; mix (and anything unmapped) counts a card as due
    // when ANY group is due.
    function groupsForMode(mode) {
      if (mode === 'mix') return SKILL_GROUPS;
      const g = MODE_GROUP[mode];
      return g ? [g] : SKILL_GROUPS;
    }

    function isDueRec(rec, groups, today) {
      return !!rec && rec.attempts > 0 &&
        groups.some(g => { const s = getSkill(rec, g); return !s.dueDate || s.dueDate <= today; });
    }

    function soonestDue(rec, groups) {
      return groups.map(g => getSkill(rec, g).dueDate || '').sort()[0] || '';
    }

    function buildQueue(pool, progress, targetCards, groups) {
      const today = todayStr();
      const isDue = k => isDueRec(progress[k], groups, today);
      const isNew = k => !progress[k] || progress[k].attempts === 0;
      const isWeak = k => { const r = progress[k]; return r && r.attempts > 0 && !isDue(k); };

      const due = pool.filter(w => isDue(w.key)).sort((a, b) => soonestDue(progress[a.key], groups) < soonestDue(progress[b.key], groups) ? -1 : 1);
      const nw = shuffle(pool.filter(w => isNew(w.key)));
      const weak = pool.filter(w => isWeak(w.key)).sort((a, b) => (progress[b.key]?.wrong || 0) - (progress[a.key]?.wrong || 0));

      const q = [...due];
      for (const w of nw) { if (q.length >= targetCards) break; q.push(w); }
      for (const w of weak) { if (q.length >= targetCards) break; q.push(w); }
      return q.slice(0, targetCards);
    }

    // ═══════════════════════════════════════════════════════════════
    // CARD GENERATORS
    // ═══════════════════════════════════════════════════════════════
    function shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // Guess-rate mitigation: a 4-option MCQ (1 right + 3 distractors) is
    // beatable by chance 25% of the time. P2/P3 get 6 options (down to
    // ~17%); P1 stays at 4 since younger learners already juggle plenty.
    function mcqDistractorCount(word) {
      return (word.level || S.level) === 'p1' ? 3 : 5;
    }

    function pickChars(pool, excludeChars, count) {
      const seen = new Set(excludeChars);
      const candidates = shuffle(pool.filter(w => !seen.has(w.character)));
      const result = [];
      for (const w of candidates) {
        if (result.length >= count) break;
        if (!seen.has(w.character)) { result.push(w.character); seen.add(w.character); }
      }
      return result;
    }

    function makePinyinChinese(word, pool) {
      const targetBase = stripTones(word.pinyin);
      const n = mcqDistractorCount(word);
      // Wrong options: characters whose base pinyin differs from the target
      const filtered = pool.filter(w => stripTones(w.pinyin) !== targetBase && w.character !== word.character);
      let distractors = pickChars(filtered, [word.character], n);
      // Fallback: any different character
      if (distractors.length < n) {
        const extra = pickChars(pool, [word.character, ...distractors], n - distractors.length);
        distractors.push(...extra);
      }
      return { type: 'pinyin-chinese', prompt: word.pinyin, answer: word.character, options: shuffle([word.character, ...distractors.slice(0, n)]), word };
    }

    function makeChinesePinyin(word, pool) {
      const correct = word.pinyin;
      const n = mcqDistractorCount(word);
      const exclude = new Set([correct]);
      const distractors = [];

      // Step 1: synthesize confusable syllables — final swap, initial swap, tone swap —
      // round-robining across categories so options are varied rather than n tone variants
      // of the same syllable or n unrelated pool syllables.
      const { final: finalCands, initial: initialCands, tone: toneCands } = synthesizeConfusables(correct);
      const categories = [shuffle(finalCands), shuffle(initialCands), shuffle(toneCands)];
      let progress = true;
      while (distractors.length < n && progress) {
        progress = false;
        for (const cat of categories) {
          if (distractors.length >= n) break;
          while (cat.length) {
            const v = cat.shift();
            if (!exclude.has(v)) { distractors.push(v); exclude.add(v); progress = true; break; }
          }
        }
      }
      // Step 2: similar-sounding from pool (fallback for syllables with no synthesized confusables)
      if (distractors.length < n) {
        for (const v of shuffle(getSimilarFromPool(correct, pool, exclude))) {
          if (distractors.length >= n) break;
          if (!exclude.has(v)) { distractors.push(v); exclude.add(v); }
        }
      }
      // Step 3: random pinyin from pool
      if (distractors.length < n) {
        for (const v of shuffle([...new Set(pool.map(w => w.pinyin))].filter(p => !exclude.has(p)))) {
          if (distractors.length >= n) break;
          distractors.push(v); exclude.add(v);
        }
      }

      return { type: 'chinese-pinyin', prompt: word.character, answer: correct, options: shuffle([correct, ...distractors.slice(0, n)]), word };
    }

    function makeEnglishChinese(word, pool) {
      const n = mcqDistractorCount(word);
      const distractors = pickChars(pool, [word.character], n);
      return { type: 'english-chinese', prompt: word.english, answer: word.character, options: shuffle([word.character, ...distractors.slice(0, n)]), word };
    }

    function makeWordFill(word, pool) {
      if (!word.words || word.words.length === 0) return null;

      // Pick a random phrase from words array (e.g., "衣服 (clothes)")
      const phraseStr = word.words[Math.floor(Math.random() * word.words.length)];
      // Extract just the Chinese characters before the space/paren
      const phraseMatch = phraseStr.match(/^([^\s(]+)/);
      const phrase = phraseMatch ? phraseMatch[1] : phraseStr;

      // Extract pinyin and English from parentheses; format: (pinyin, english)
      const englishMatch = phraseStr.match(/\(([^)]+)\)/);
      let englishFromPhrase = word.english;
      let phraseP = null;
      if (englishMatch) {
        const content = englishMatch[1];
        const commaIdx = content.search(/[,，]/);
        if (commaIdx !== -1) {
          phraseP = content.slice(0, commaIdx).trim();
          englishFromPhrase = content.slice(commaIdx + 1).trim();
        } else {
          englishFromPhrase = content;
        }
      }

      if (phrase.length === 0 || !phrase.includes(word.character)) return null;

      // Find the position of the main character to blank out
      const blankPos = phrase.indexOf(word.character);
      const prompt = phrase.slice(0, blankPos) + '_' + phrase.slice(blankPos + 1);

      // Generate distractors
      const n = mcqDistractorCount(word);
      const distractors = pickChars(pool, [word.character], n);

      // Mask the pinyin syllable that is being tested
      let maskedPinyin = phraseP;
      if (phraseP) {
        const syllables = phraseP.split(' ');
        if (blankPos < syllables.length) {
          syllables[blankPos] = '_';
          maskedPinyin = syllables.join(' ');
        }
      }

      return {
        type: 'word-fill',
        prompt,
        answer: word.character,
        options: shuffle([word.character, ...distractors.slice(0, n)]),
        word,
        phrase,
        english: englishFromPhrase,
        phrasePinyin: maskedPinyin
      };
    }

    function makeWordWrite(word, pool) {
      if (!word.words || word.words.length === 0) return null;

      // Pick a random phrase from words array (e.g., "衣服 (yī fu, clothes)")
      const phraseStr = word.words[Math.floor(Math.random() * word.words.length)];
      const phraseMatch = phraseStr.match(/^([^\s(]+)/);
      const phrase = phraseMatch ? phraseMatch[1] : phraseStr;

      const englishMatch = phraseStr.match(/\(([^)]+)\)/);
      let englishFromPhrase = word.english;
      let phraseP = null;
      if (englishMatch) {
        const content = englishMatch[1];
        const commaIdx = content.search(/[,，]/);
        if (commaIdx !== -1) {
          phraseP = content.slice(0, commaIdx).trim();
          englishFromPhrase = content.slice(commaIdx + 1).trim();
        } else {
          englishFromPhrase = content;
        }
      }

      if (phrase.length === 0 || !phrase.includes(word.character)) return null;

      // Find the position of the main character to blank out
      const blankPos = phrase.indexOf(word.character);
      const prompt = phrase.slice(0, blankPos) + '_' + phrase.slice(blankPos + 1);

      return {
        type: 'word-write',
        prompt,
        answer: word.character,
        correctChar: word.character, // shared field name used by the fc- writer panel helpers
        word,
        phrase,
        english: englishFromPhrase,
        phrasePinyin: phraseP // unmasked — the student needs the full pinyin to know what to write
      };
    }

    function makeFindCorrect(word, pool) {
      if (!word['same-sounding-character'] || word['same-sounding-character'].length === 0) return null;

      const { chinese } = parseSentence(word.sentence);
      if (!chinese || chinese.indexOf(word.character) === -1) return null;

      const wrongIndex = chinese.indexOf(word.character);

      const distractorStr = word['same-sounding-character'][Math.floor(Math.random() * word['same-sounding-character'].length)];
      const distractorMatch = distractorStr.match(/^([^\s(]+)/);
      const distractorChar = distractorMatch ? distractorMatch[1] : distractorStr;

      const chars = Array.from(chinese);
      chars[wrongIndex] = distractorChar;

      return {
        type: 'find-correct',
        chars,
        wrongIndex,
        correctChar: word.character,
        distractorChar,
        word
      };
    }

    // Shared by the sentence-level cloze modes: blank every occurrence of the
    // tested character in the example sentence — leaving one visible would
    // give the answer away.
    function makeSentenceBlank(word) {
      const { chinese, english } = parseSentence(word.sentence);
      if (!chinese || !chinese.includes(word.character)) return null;
      return { chinese, english, prompt: chinese.split(word.character).join('_') };
    }

    // Sentence-level cloze (句子填空) — word-fill on the full example
    // sentence, matching the P3 exam format.
    function makeSentenceFill(word, pool) {
      const blank = makeSentenceBlank(word);
      if (!blank) return null;
      const n = mcqDistractorCount(word);
      // A distractor already visible in the sentence would be obviously wrong
      const filtered = pool.filter(w => !blank.chinese.includes(w.character));
      const distractors = pickChars(filtered, [word.character], n);
      if (distractors.length < n) {
        distractors.push(...pickChars(pool, [word.character, ...distractors], n - distractors.length));
      }
      return {
        type: 'sentence-fill', prompt: blank.prompt, answer: word.character,
        options: shuffle([word.character, ...distractors.slice(0, n)]),
        word, english: blank.english,
        speakAfter: { hanzi: blank.chinese, pinyin: word.pinyin },
      };
    }

    // 选字填空 — the reading twin of 听音: same-sounding characters compete
    // to fill the sentence blank, so only meaning (not sound) can decide.
    function makeChooseChar(word, pool) {
      if (!word['same-sounding-character'] || word['same-sounding-character'].length === 0) return null;
      const blank = makeSentenceBlank(word);
      if (!blank) return null;
      const n = mcqDistractorCount(word);
      const sameSound = [...new Set(
        word['same-sounding-character']
          .map(s => (s.match(/^([^\s(]+)/) || [])[1])
          .filter(c => c && c !== word.character && !blank.chinese.includes(c))
      )];
      if (sameSound.length === 0) return null;
      const distractors = shuffle(sameSound).slice(0, n);
      if (distractors.length < n) {
        distractors.push(...pickChars(pool, [word.character, ...distractors], n - distractors.length));
      }
      return {
        type: 'choose-char', prompt: blank.prompt, answer: word.character,
        options: shuffle([word.character, ...distractors.slice(0, n)]),
        word, english: blank.english, pinyinHint: word.pinyin,
        speakAfter: { hanzi: blank.chinese, pinyin: word.pinyin },
      };
    }

    // 声调 drill — name the tone of the character. Options are the four
    // tones of the word's own syllable, fixed in 1→4 order so the grid
    // reads like a tone keypad.
    function makeToneTap(word) {
      const p = (word.pinyin || '').trim();
      // Skip polyphones ("wèi / wéi"), multi-syllable pinyin, and neutral-tone
      // particles (的/了/吗…) — there is no single correct tone to tap.
      if (!p || p.includes('/') || /\s/.test(p)) return null;
      const toneChar = [...p].find(c => TONE_NUMBER[c]);
      if (!toneChar) return null;
      const base = stripTones(p);
      const options = [1, 2, 3, 4].map(n => addToneMark(base, n));
      if (new Set(options).size !== 4) return null;
      // Derive the answer through addToneMark too, so it's guaranteed to be
      // one of the options even if the source data marks an unusual vowel.
      const answer = addToneMark(base, TONE_NUMBER[toneChar]);
      return {
        type: 'tone-tap', prompt: word.character, answer, options, word,
        toneless: base,
        speakAfter: { hanzi: word.character, pinyin: word.pinyin },
      };
    }

    // ── 连词成句 (sentence reorder) ──
    // No proper segmenter is available, so segment by greedy longest-match
    // against the level's own vocabulary (every entry's example words plus
    // the characters themselves), falling back to single characters. The
    // lesson sentences are written from exactly this vocabulary, so it
    // chunks into natural words most of the time.
    const _segLexicons = {};
    function getSegLexicon(level) {
      if (_segLexicons[level]) return _segLexicons[level];
      const set = new Set();
      let maxLen = 1;
      for (const entries of Object.values(DATA[level] || {})) {
        for (const e of entries) {
          set.add(e.character);
          for (const w of (e.words || [])) {
            const m = w.match(/^([^\s(]+)/);
            if (m && m[1].length > 1) {
              set.add(m[1]);
              maxLen = Math.max(maxLen, Math.min(m[1].length, 4));
            }
          }
        }
      }
      return (_segLexicons[level] = { set, maxLen });
    }

    function segmentSentence(chinese, level) {
      const { set, maxLen } = getSegLexicon(level);
      // Terminal punctuation is fixed (not a chip); internal commas attach
      // to the chunk before them.
      const chars = Array.from(chinese.replace(/[。？！]+$/, ''));
      const chunks = [];
      let i = 0;
      while (i < chars.length) {
        if (chars[i] === '，' || chars[i] === ',') {
          if (chunks.length) chunks[chunks.length - 1] += chars[i];
          i++;
          continue;
        }
        let len = Math.min(maxLen, chars.length - i);
        while (len > 1 && !set.has(chars.slice(i, i + len).join(''))) len--;
        chunks.push(chars.slice(i, i + len).join(''));
        i += len;
      }
      return chunks;
    }

    function makeReorder(word, pool) {
      const { chinese, english } = parseSentence(word.sentence);
      if (!chinese) return null;
      const punct = (chinese.match(/[。？！]+$/) || ['。'])[0];
      const chunks = segmentSentence(chinese, word.level || S.level);
      // <4 chunks is trivially easy; >12 doesn't fit a phone screen
      if (chunks.length < 4 || chunks.length > 12) return null;
      let shuffled = null;
      for (let t = 0; t < 10 && !shuffled; t++) {
        const s = shuffle(chunks);
        if (s.join(' ') !== chunks.join(' ')) shuffled = s;
      }
      if (!shuffled) return null; // every chunk identical — unshufflable
      return {
        type: 'reorder', chunks, shuffled, punct,
        chinese: chunks.join(''), english, word,
      };
    }

    // "衣服 (yī fu, clothes)" → { hanzi:'衣服', pinyin:'yī fu', english:'clothes' }
    function parseExampleWord(word) {
      const raw = (word.words && word.words[0]) || '';
      const m = raw.match(/^([^\s(]+)\s*\(([^,)]+),\s*([^)]*)\)/);
      if (m) return { hanzi: m[1], pinyin: m[2].trim(), english: m[3].trim() };
      return { hanzi: word.character, pinyin: word.pinyin, english: word.english };
    }

    // Listening (听音) — hear the word, pick the correctly written form.
    // With homophone data the options are the example word with the tested
    // character swapped for same-sounding characters (classic 选字 exam
    // format); otherwise fall back to single characters that sound different.
    function makeListening(word, pool) {
      const ref = parseExampleWord(word);
      const n = mcqDistractorCount(word);
      const sameSound = [...new Set(
        (word['same-sounding-character'] || [])
          .map(s => (s.match(/^([^\s(]+)/) || [])[1])
          .filter(c => c && c !== word.character)
      )];

      if (ref.hanzi.length > 1 && ref.hanzi.includes(word.character) && sameSound.length) {
        const variants = shuffle(sameSound).slice(0, n)
          .map(c => ref.hanzi.replace(word.character, c));
        if (variants.length < n) {
          for (const c of pickChars(pool, [word.character, ...sameSound], n - variants.length)) {
            variants.push(ref.hanzi.replace(word.character, c));
          }
        }
        return {
          type: 'listening', prompt: '', answer: ref.hanzi,
          options: shuffle([ref.hanzi, ...variants.slice(0, n)]),
          word, refHanzi: ref.hanzi, refPinyin: ref.pinyin,
        };
      }

      // Single-character fallback — distractors must sound different, or the
      // audio alone couldn't distinguish the right answer.
      const targetBase = stripTones(word.pinyin);
      const filtered = pool.filter(w => stripTones(w.pinyin) !== targetBase && w.character !== word.character);
      const distractors = pickChars(filtered, [word.character], n);
      if (distractors.length < n) {
        distractors.push(...pickChars(pool, [word.character, ...distractors], n - distractors.length));
      }
      return {
        type: 'listening', prompt: '', answer: word.character,
        options: shuffle([word.character, ...distractors.slice(0, n)]),
        word, refHanzi: word.character, refPinyin: word.pinyin,
      };
    }

    function makePronunciation(word) {
      const ref = parseExampleWord(word);
      return {
        type: 'pronunciation',
        word,
        refHanzi: ref.hanzi,
        refPinyin: ref.pinyin,
        refEnglish: ref.english,
        refPinyinSyllables: ref.pinyin.trim().split(/\s+/).filter(Boolean),
      };
    }

    function makeCard(word, pool, mode, dueGroups) {
      if (mode === 'mix') {
        const mixModes = ['pinyin-chinese', 'chinese-pinyin', 'english-chinese', 'listening', 'word-fill', 'word-write', 'find-correct',
          'sentence-fill', 'choose-char', 'tone-tap', 'reorder'];
        if (isAzureConfigured()) mixModes.push('pronunciation');
        // Prefer submodes that exercise a skill this word is actually due in —
        // otherwise a word pulled into the mix because writing is due could be
        // dealt a recognition card and leave the writing schedule untouched.
        let ordered = shuffle(mixModes);
        if (dueGroups && dueGroups.length) {
          ordered = [...ordered.filter(m => dueGroups.includes(MODE_GROUP[m])),
                     ...ordered.filter(m => !dueGroups.includes(MODE_GROUP[m]))];
        }
        // Try modes in order until one supports this word — some modes return
        // null for words lacking phrase/homophone data, and dropping the card
        // would silently shrink the session below its target size.
        for (const m of ordered) {
          const card = makeCard(word, pool, m);
          if (card) return card;
        }
        return makeEnglishChinese(word, pool);
      }
      if (mode === 'pinyin-chinese') return makePinyinChinese(word, pool);
      if (mode === 'chinese-pinyin') return makeChinesePinyin(word, pool);
      if (mode === 'listening') return makeListening(word, pool);
      if (mode === 'word-fill') return makeWordFill(word, pool);
      if (mode === 'word-write') return makeWordWrite(word, pool);
      if (mode === 'find-correct') return makeFindCorrect(word, pool);
      if (mode === 'sentence-fill') return makeSentenceFill(word, pool);
      if (mode === 'choose-char') return makeChooseChar(word, pool);
      if (mode === 'tone-tap') return makeToneTap(word);
      if (mode === 'reorder') return makeReorder(word, pool);
      if (mode === 'pronunciation') return makePronunciation(word);
      return makeEnglishChinese(word, pool);
    }

    // ═══════════════════════════════════════════════════════════════
    // APP STATE
    // ═══════════════════════════════════════════════════════════════
    const S = {
      level: 'p1',
      lessons: [1],
      lessonTest: false,
      mode: 'pinyin-chinese',
      cards: [],
      cardIndex: 0,
      results: [],
      sessionStart: 0,
      cardStart: 0,
      renderToken: 0,
      timerInterval: null,
      timeLimitReached: false,
      timeLimitMs: 0,
      avatarId: null,
      progress: {},
      wordPool: [],
      statsAvatarId: null,
      statsLevel: 'p1',
      statsPrev: 'setup',   // which screen to go back to
    };

    // ═══════════════════════════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════════════════════════
    function showScreen(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
    }

    // ═══════════════════════════════════════════════════════════════
    // TOAST
    // ═══════════════════════════════════════════════════════════════
    let toastTimer = null;
    function showToast(msg, ms = 2500) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), ms);
    }

    // ═══════════════════════════════════════════════════════════════
    // SETUP SCREEN
    // ═══════════════════════════════════════════════════════════════
    function initSetup() {
      const avatar = window.__avatarGetActive ? window.__avatarGetActive() : null;
      const warn = document.getElementById('setup-no-avatar');
      const startBtn = document.getElementById('setup-start');

      if (avatar) {
        const levelChanged = S.avatarId !== avatar.id;
        S.avatarId = avatar.id;
        S.progress = loadProgress(avatar.id);
        warn.style.display = 'none';
        startBtn.disabled = false;
        if (levelChanged) {
          S.level = loadLastLevel(avatar.id);
          S.lessons = [1];
          S.lessonTest = false;
          const levelTabs = document.getElementById('setup-level-tabs');
          levelTabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.level === S.level));
        }
      } else {
        warn.style.display = 'block';
        startBtn.disabled = true;
        S.avatarId = null;
      }
      renderSetupLessonTabs(); // refresh mastery bars with the latest progress
      showScreen('screen-setup');
    }

    // Tab helpers
    function bindTabs(containerId, onSelect) {
      const container = document.getElementById(containerId);
      container.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
          container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          onSelect(tab);
        });
      });
    }

    bindTabs('setup-level-tabs', tab => {
      S.level = tab.dataset.level;
      S.lessons = [1];
      S.lessonTest = false;
      if (S.avatarId) saveLastLevel(S.avatarId, S.level);
      renderSetupLessonTabs();
    });

    // Fraction of a lesson's words the active avatar has "mastered"
    // (reviewed at least once and scheduled a week or more out).
    // Mastery looks at the weakest skill the student actually exercises:
    // min-over-all-groups would make mastery unreachable without e.g. Azure
    // speech configured, while the flat mirror is just "last mode played".
    function masteryInterval(rec) {
      const attempted = SKILL_GROUPS.filter(g => {
        const m = rec.byMode && rec.byMode[g];
        return m && (m.correct + m.wrong) > 0;
      });
      const groups = attempted.length ? attempted : SKILL_GROUPS;
      return Math.min(...groups.map(g => getSkill(rec, g).interval));
    }

    function lessonMastery(level, lessonNum) {
      if (!S.avatarId) return 0;
      const words = getWordPool(level, [lessonNum]);
      if (!words.length) return 0;
      const mastered = words.filter(w => {
        const r = S.progress[w.key];
        return r && r.attempts > 0 && masteryInterval(r) >= 7;
      }).length;
      return mastered / words.length;
    }

    // Child-facing mastery tiers for the word grids. Tier >= 2 matches the
    // lessonMastery "mastered" rule so the tab bar and grids always agree.
    function masteryTier(rec) {
      if (!rec || !(rec.attempts > 0)) return 0;
      const iv = masteryInterval(rec);
      if (iv >= 21) return 3;
      if (iv >= 7) return 2;
      return 1;
    }

    // Long-press without pointer capture: native scroll must still fire
    // pointercancel to abort the hold. Must be attached BEFORE the element's
    // click handler so a fired hold can swallow the synthetic click.
    function attachLongPress(el, onHold) {
      let timer = null, held = false, x0 = 0, y0 = 0;
      const cancel = () => { clearTimeout(timer); timer = null; };
      el.addEventListener('pointerdown', e => {
        held = false; x0 = e.clientX; y0 = e.clientY;
        cancel();
        timer = setTimeout(() => { held = true; onHold(); }, 500);
      });
      el.addEventListener('pointermove', e => {
        if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) cancel();
      });
      el.addEventListener('pointerup', cancel);
      el.addEventListener('pointercancel', cancel);
      el.addEventListener('contextmenu', e => e.preventDefault());
      el.addEventListener('click', e => {
        if (!held) return;
        held = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      });
    }

    function showLessonMastery(level, lessonNum) {
      const words = getWordPool(level, [lessonNum]);
      if (!words.length) return;
      const levelName = { p1: 'Primary 1', p2: 'Primary 2', p3: 'Primary 3' }[level] || level;
      document.getElementById('lm-title').textContent = `${levelName} · 第${lessonNum}课`;
      const known = words.filter(w => masteryTier(S.progress[w.key]) >= 2).length;
      document.getElementById('lm-sub').textContent = `${known} of ${words.length} words known`;
      const grid = document.getElementById('lm-grid');
      grid.innerHTML = '';
      words.forEach(w => {
        const tier = masteryTier(S.progress[w.key]);
        const card = document.createElement('div');
        card.className = 'browse-word-card compact' + (tier ? ` lm-tier-${tier}` : '');
        card.innerHTML = `<div class="browse-word-char">${esc(w.character)}</div>`;
        card.addEventListener('click', () => showCharModal(w));
        grid.appendChild(card);
      });
      document.getElementById('lesson-modal').classList.add('open');
    }

    document.getElementById('lesson-modal').addEventListener('click', e => {
      if (e.target.id === 'lesson-modal') document.getElementById('lesson-modal').classList.remove('open');
    });
    document.getElementById('lm-close').addEventListener('click', () => {
      document.getElementById('lesson-modal').classList.remove('open');
    });

    function renderSetupLessonTabs() {
      const container = document.getElementById('setup-lesson-tabs');
      if (!container) return;
      container.innerHTML = '';
      const count = getLessonCount(S.level);
      
      for (let i = 1; i <= count; i++) {
        const btn = document.createElement('button');
        btn.className = 'tab' + (S.lessons.includes(i) && !S.lessonTest ? ' active' : '');
        btn.textContent = 'L' + i;
        const mastery = lessonMastery(S.level, i);
        if (mastery > 0) {
          const bar = document.createElement('span');
          bar.className = 'tab-mastery';
          bar.style.width = Math.round(mastery * 100) + '%';
          btn.appendChild(bar);
        }
        attachLongPress(btn, () => showLessonMastery(S.level, i));
        btn.addEventListener('click', () => {
          S.lessonTest = false;
          if (S.lessons.includes(i)) {
            S.lessons = S.lessons.filter(l => l !== i);
            if (S.lessons.length === 0) S.lessons = [i];
          } else {
            S.lessons.push(i);
            S.lessons.sort((a,b) => a-b);
          }
          renderSetupLessonTabs();
        });
        container.appendChild(btn);
      }
      
      const allBtn = document.createElement('button');
      const allSelected = count > 0 && !S.lessonTest && S.lessons.length === count;
      allBtn.className = 'tab' + (allSelected ? ' active' : '');
      allBtn.textContent = 'All Random';
      allBtn.addEventListener('click', () => {
        S.lessonTest = false;
        S.lessons = Array.from({length: count}, (_, i) => i + 1);
        renderSetupLessonTabs();
      });
      container.appendChild(allBtn);

      const testBtn = document.createElement('button');
      testBtn.className = 'tab' + (S.lessonTest ? ' active' : '');
      testBtn.textContent = 'Test';
      testBtn.addEventListener('click', () => {
        S.lessonTest = true;
        renderSetupLessonTabs();
      });
      container.appendChild(testBtn);

      renderSetupLessonWords();
    }

    function renderSetupLessonWords() {
      const container = document.getElementById('setup-lesson-words');
      if (!container) return;
      const data = DATA[S.level];
      if (!data) { container.innerHTML = ''; return; }
      const words = getWordPool(S.level, S.lessonTest ? 'all' : S.lessons);
      if (words.length === 0) {
        container.innerHTML = `<div class="browse-empty">No words for this selection</div>`;
        return;
      }
      container.innerHTML = '';
      words.forEach(w => {
        const tier = masteryTier(S.progress[w.key]);
        const card = document.createElement('div');
        card.className = 'browse-word-card compact' + (tier ? ` lm-tier-${tier}` : '');
        card.innerHTML = `<div class="browse-word-char">${esc(w.character)}</div>`;
        card.addEventListener('click', () => showCharModal(w));
        container.appendChild(card);
      });
    }
    bindTabs('setup-mode-tabs', tab => {
      S.mode = tab.dataset.mode;
      const startBtn = document.getElementById('setup-start');
      if (S.mode === 'puzzle') {
        startBtn.disabled = false;
      } else if (!S.avatarId) {
        startBtn.disabled = true;
      }
      if (S.mode === 'pronunciation' && !isAzureConfigured()) {
        showToast('Ask a parent to set up the speech key ⚙');
      }
    });

    document.getElementById('setup-stats-btn').addEventListener('click', () => {
      S.statsPrev = 'setup';
      openStats();
    });

    document.getElementById('setup-start').addEventListener('click', startSession);

    // ═══════════════════════════════════════════════════════════════
    // START SESSION
    // ═══════════════════════════════════════════════════════════════
    async function startSession() {
      await dataPromise;
      if (!DATA[S.level]) { showToast('Failed to load word data'); return; }

      S.wordPool = getWordPool(S.level, S.lessonTest ? 'all' : S.lessons);
      if (S.wordPool.length === 0) { showToast('No words found'); return; }

      if (S.mode === 'puzzle') { startPuzzle(); return; }

      const cfg = SESSION_CONFIG[S.level];
      S.progress = loadProgress(S.avatarId);

      const groups = groupsForMode(S.mode);
      let queue;
      if (S.lessonTest) {
        S.timeLimitMs = Infinity;
        const today = todayStr();
        queue = S.wordPool
          .filter(w => isDueRec(S.progress[w.key], groups, today))
          .sort((a, b) => soonestDue(S.progress[a.key], groups) < soonestDue(S.progress[b.key], groups) ? -1 : 1);
        if (queue.length === 0) { showToast('No words due for review'); return; }
      } else {
        S.timeLimitMs = cfg.minutes * 60 * 1000;
        queue = buildQueue(S.wordPool, S.progress, cfg.cards, groups);
        if (queue.length === 0) { showToast('No words to review'); return; }
      }

      const today = todayStr();
      S.cards = queue.map(w => {
        const r = S.progress[w.key];
        const dueGroups = r ? groups.filter(g => { const s = getSkill(r, g); return !s.dueDate || s.dueDate <= today; }) : [];
        return makeCard(w, S.wordPool, S.mode, dueGroups);
      }).filter(c => c !== null);
      if (S.cards.length === 0) { showToast('No valid cards for this mode'); return; }
      S.cardIndex = 0;
      S.results = [];
      S.timeLimitReached = false;
      S.sessionStart = Date.now();

      showScreen('screen-game');
      startTimer();
      renderCard();
    }

    // ═══════════════════════════════════════════════════════════════
    // SESSION TIMER
    // ═══════════════════════════════════════════════════════════════
    function startTimer() {
      clearInterval(S.timerInterval);
      S.timerInterval = setInterval(() => {
        const elapsed = Date.now() - S.sessionStart;
        const remaining = Math.max(0, S.timeLimitMs - elapsed);
        const mins = Math.floor(remaining / 60000);
        const el = document.getElementById('hud-timer');
        if (S.timeLimitMs === Infinity) el.textContent = '—';
        else if (remaining <= 0) el.textContent = '0 min';
        else if (mins < 1) el.textContent = '< 1 min';
        else el.textContent = `${mins} min`;
        el.className = 'hud-val';
        if (S.timeLimitMs !== Infinity) {
          if (remaining / S.timeLimitMs < 0.15) el.classList.add('danger');
          else if (remaining / S.timeLimitMs < 0.35) el.classList.add('warn');
        }
        if (remaining <= 0 && !S.timeLimitReached) {
          S.timeLimitReached = true;
          showToast("Time's up — finish this card", 3000);
        }
      }, 500);
    }

    function stopTimer() { clearInterval(S.timerInterval); }

    // ═══════════════════════════════════════════════════════════════
    // RENDER CARD
    // ═══════════════════════════════════════════════════════════════
    // Guess-rate mitigation: pause this long on the question alone before
    // MCQ options render, so the learner retrieves an answer instead of
    // just recognizing it among the choices.
    const THINK_BEAT_MS = 900;

    function renderCard() {
      const card = S.cards[S.cardIndex];
      const total = S.cards.length;
      S.renderToken++; // invalidates any think-beat timeout still pending from the previous card

      document.getElementById('hud-card').textContent = `${S.cardIndex + 1}/${total}`;
      document.getElementById('progress-fill').style.width = `${(S.cardIndex / total) * 100}%`;
      document.getElementById('hud-correct').textContent = S.results.filter(r => r.correct).length;

      const typeLabel = document.getElementById('question-type-label');
      const qText = document.getElementById('question-text');
      const qWrap = document.getElementById('question-wrap');
      const sourceKey = card.word.lessonKey;

      // Remove old source key if exists
      const oldKey = qWrap.querySelector('.source-key');
      if (oldKey) oldKey.remove();

      // Add source key in bottom right
      const keyEl = document.createElement('div');
      keyEl.className = 'source-key';
      keyEl.textContent = (card.isRetry ? 'retry · ' : '') + sourceKey;
      qWrap.appendChild(keyEl);

      qText.onclick = null;
      qText.style.cursor = '';
      qText.style.display = '';
      qWrap.classList.remove('fc-compact');
      document.getElementById('options-grid').style.display = '';
      document.getElementById('fc-sentence-wrap').style.display = 'none';
      document.getElementById('fc-feedback').style.display = 'none';
      document.getElementById('fc-write-panel').classList.remove('open');
      document.getElementById('pr-panel').style.display = 'none';
      document.getElementById('ro-panel').style.display = 'none';
      document.getElementById('answer-feedback').style.display = 'none';
      FC = null;
      PR = null;
      RO = null;

      if (card.type === 'pronunciation') {
        typeLabel.textContent = '';
        qText.innerHTML = `<div>${esc(card.refHanzi)}</div>`;
        qText.className = 'question-text';
        document.getElementById('options-grid').innerHTML = '';
        document.getElementById('options-grid').style.display = 'none';
        document.getElementById('continue-row').style.display = 'none';
        renderPronunciation(card);
        S.cardStart = Date.now();
        return;
      } else if (card.type === 'find-correct') {
        typeLabel.textContent = '';
        qText.style.display = 'none';
        qWrap.classList.add('fc-compact');
        renderFindCorrect(card);
        document.getElementById('options-grid').innerHTML = '';
        document.getElementById('options-grid').style.display = 'none';
        document.getElementById('continue-row').style.display = 'none';
        S.cardStart = Date.now();
        return;
      } else if (card.type === 'reorder') {
        typeLabel.textContent = '连词成句 — put the words in order';
        qText.innerHTML = '<div class="fc-hint" id="ro-hint">💡 Tap for hint</div>';
        qText.className = 'question-text';
        document.getElementById('options-grid').innerHTML = '';
        document.getElementById('options-grid').style.display = 'none';
        document.getElementById('continue-row').style.display = 'none';
        renderReorder(card);
        S.cardStart = Date.now();
        return;
      } else if (card.type === 'word-write') {
        typeLabel.textContent = '';
        const pinyinHint = card.phrasePinyin ? `<div style="font-size:0.28em;color:var(--p-xl);margin-top:6px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.03em">${esc(card.phrasePinyin)}</div>` : '';
        qText.innerHTML = `<div>${esc(card.prompt)}</div>${pinyinHint}<div style="font-size:0.3em;color:var(--muted);margin-top:8px;font-weight:500;font-family:system-ui,-apple-system,sans-serif">${esc(card.english)}</div>`;
        qText.className = 'question-text';
        document.getElementById('options-grid').innerHTML = '';
        document.getElementById('options-grid').style.display = 'none';
        document.getElementById('continue-row').style.display = 'none';
        renderWordWrite(card);
        S.cardStart = Date.now();
        return;
      } else if (card.type === 'listening') {
        typeLabel.textContent = 'Listen — pick what you heard';
        qText.innerHTML = `<button class="listen-big-btn" id="listen-replay" title="Play again">🔊</button>`;
        qText.className = 'question-text';
        document.getElementById('listen-replay').addEventListener('click', () => azureSpeak(card.refHanzi, card.refPinyin));
        setTimeout(() => azureSpeak(card.refHanzi, card.refPinyin), 250);
      } else if (card.type === 'pinyin-chinese') {
        typeLabel.textContent = 'Which character matches this sound?';
        qText.textContent = card.prompt;
        qText.className = 'question-text is-pinyin';
      } else if (card.type === 'chinese-pinyin') {
        typeLabel.textContent = 'Which pinyin is correct?';
        qText.textContent = card.prompt;
        qText.className = 'question-text';
      } else if (card.type === 'word-fill') {
        typeLabel.textContent = '';
        const pinyinHint = card.phrasePinyin ? `<div style="font-size:0.28em;color:var(--p-xl);margin-top:6px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.03em">${esc(card.phrasePinyin)}</div>` : '';
        qText.innerHTML = `<div>${esc(card.prompt)}</div>${pinyinHint}<div style="font-size:0.3em;color:var(--muted);margin-top:8px;font-weight:500;font-family:system-ui,-apple-system,sans-serif">${esc(card.english)}</div>`;
        qText.className = 'question-text';
      } else if (card.type === 'sentence-fill' || card.type === 'choose-char') {
        typeLabel.textContent = card.type === 'choose-char' ? '选字填空 — which character fits?' : 'Fill in the sentence';
        // The pinyin hint is only safe for choose-char: every option sounds
        // the same there, so it can't leak the answer.
        const pinyinHint = card.pinyinHint ? `<div style="font-size:0.55em;color:var(--p-xl);margin-top:6px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.03em">${esc(card.pinyinHint)}</div>` : '';
        qText.innerHTML = `<div>${esc(card.prompt)}</div>${pinyinHint}<div style="font-size:0.55em;color:var(--muted);margin-top:8px;font-weight:500;font-family:system-ui,-apple-system,sans-serif">${esc(card.english)}</div>`;
        qText.className = 'question-text is-sentence';
      } else if (card.type === 'tone-tap') {
        typeLabel.textContent = '这是第几声? — Which tone?';
        qText.innerHTML = `<div>${esc(card.prompt)}</div><div style="font-size:0.28em;color:var(--p-xl);margin-top:6px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.03em">${esc(card.toneless)}</div>`;
        qText.className = 'question-text';
      } else {
        typeLabel.textContent = 'Which character means this?';
        qText.textContent = card.prompt;
        qText.className = 'question-text is-english';
      }

      const grid = document.getElementById('options-grid');
      grid.innerHTML = '';
      const isPinyinOpt = card.type === 'chinese-pinyin';
      const isToneOpt = card.type === 'tone-tap';

      document.getElementById('continue-row').style.display = 'none';

      // Retrieval-before-recognition: hold the options back for a short beat
      // so the question is met with recall first, not a scan of the choices.
      const token = S.renderToken;
      const think = document.createElement('div');
      think.className = 'think-beat';
      think.textContent = 'Think…';
      grid.appendChild(think);

      setTimeout(() => {
        if (token !== S.renderToken) return; // a newer card has since rendered
        grid.innerHTML = '';
        card.options.forEach(opt => {
          const btn = document.createElement('button');
          btn.className = 'opt-btn' + (isPinyinOpt ? ' is-pinyin-opt' : '') + (isToneOpt ? ' is-tone-opt' : '') + (opt.length > 1 && !isPinyinOpt && !isToneOpt ? ' is-phrase-opt' : '');
          btn.textContent = opt;
          btn.addEventListener('click', () => handleAnswer(opt, card));
          grid.appendChild(btn);
        });
        S.cardStart = Date.now();
      }, THINK_BEAT_MS);
    }

    // ═══════════════════════════════════════════════════════════════
    // HANDLE ANSWER
    // ═══════════════════════════════════════════════════════════════
    // Records one card outcome. In-session retries are practice only — they
    // never touch the SRS record or the results list. A failed first attempt
    // re-queues the word once at the end of the session.
    function registerResult(card, correct, timeMs, grade, extra) {
      if (card.isRetry) return;
      let rec = S.progress[card.word.key] || freshRecord();
      rec = updateRecord(rec, correct, timeMs, grade, MODE_GROUP[card.type] || null);
      S.progress[card.word.key] = rec;
      saveProgress(S.avatarId, S.progress);
      S.results.push({ word: card.word, correct, timeMs, type: card.type, ...(extra || {}) });
      if (!correct) {
        const retry = makeCard(card.word, S.wordPool, S.mode);
        if (retry) { retry.isRetry = true; S.cards.push(retry); }
      }
    }

    function handleAnswer(chosen, card) {
      const timeMs = Date.now() - S.cardStart;
      const correct = chosen === card.answer;

      // Flash feedback on buttons
      document.querySelectorAll('#options-grid .opt-btn').forEach(btn => {
        if (btn.textContent === card.answer) btn.classList.add(correct ? 'flash-correct' : 'flash-reveal');
        else if (btn.textContent === chosen && !correct) btn.classList.add('flash-wrong');
        btn.disabled = true;
      });

      const grade = timeMs < 5000 ? 'easy' : timeMs < 10000 ? 'good' : 'hard';
      registerResult(card, correct, timeMs, grade);

      if (correct && card.type === 'sentence-fill') {
        // 句子填空 doesn't auto-advance: pause on a Continue button so the
        // tested character (tappable into the full character card) stays
        // on screen instead of flashing past.
        showAnswerFeedback(card.word);
        document.getElementById('continue-row').style.display = 'flex';
      } else if (correct) {
        // Reinforce a correct answer with the sound of what was tested
        // (wrong answers already get audio via showAnswerFeedback).
        if (card.speakAfter) azureSpeak(card.speakAfter.hanzi, card.speakAfter.pinyin);
        setTimeout(() => {
          S.cardIndex++;
          const done = S.cardIndex >= S.cards.length || S.timeLimitReached;
          if (done) { stopTimer(); showSummary(); }
          else renderCard();
        }, 1500);
      } else {
        showAnswerFeedback(card.word);
        document.getElementById('continue-row').style.display = 'flex';
      }
    }

    // Turn a correct 句子填空 answer or a wrong answer (any mode) into a
    // learning moment during the Continue pause: show the tested word with
    // pinyin and meaning, play its audio, and open the full character card
    // on tap.
    function showAnswerFeedback(word) {
      const el = document.getElementById('answer-feedback');
      el.innerHTML = `<span class="af-char">${esc(word.character)}</span><span class="af-pinyin">${esc(word.pinyin)}</span><span class="af-eng">${esc(word.english)}</span><span class="af-more">ⓘ</span>`;
      el.onclick = () => showCharModal(word);
      el.style.display = 'flex';
      azureSpeak(word.character, word.pinyin);
    }

    // ═══════════════════════════════════════════════════════════════
    // FIND & CORRECT MODE (找错字) — tap-then-write interaction
    // ═══════════════════════════════════════════════════════════════
    let FC = null; // { card, step: 'tap'|'write', mistakes }
    let fcWriter = null; // single reused HanziWriter instance (see fcStartWriting)

    function fcCharDataLoader(char, onComplete, onError) {
      fetch(`hanzi-data/chars/${encodeURIComponent(char)}.json`)
        .then(r => { if (!r.ok) throw new Error('missing hanzi data'); return r.json(); })
        .then(onComplete)
        .catch(onError);
    }

    function renderFindCorrect(card) {
      FC = { card, step: 'tap', mistakes: 0 };

      const sentWrap = document.getElementById('fc-sentence-wrap');
      const feedback = document.getElementById('fc-feedback');
      sentWrap.style.display = 'flex';
      feedback.style.display = 'block';
      document.getElementById('fc-write-panel').classList.remove('open');
      document.getElementById('fc-reveal-row').style.display = 'none';
      document.getElementById('fc-self-check-row').style.display = 'none';
      // Only clear the writer target if no HanziWriter instance owns it yet — once
      // created, it's reused via setCharacter() across cards (see fcStartWriting),
      // and wiping its innerHTML here would detach the SVG that instance manipulates.
      if (!fcWriter) document.getElementById('fc-writer-target').innerHTML = '';

      sentWrap.innerHTML = '';
      card.chars.forEach((ch, idx) => {
        const span = document.createElement('span');
        span.className = 'fc-char';
        span.textContent = ch;
        span.dataset.idx = String(idx);
        sentWrap.appendChild(span);
      });

      feedback.textContent = 'Tap the character that looks wrong';
    }

    // ═══════════════════════════════════════════════════════════════
    // WORD WRITE MODE (写词) — fill-in-the-blank, straight to writing
    // (no tap step, since there's no wrong character to find — reuses
    // the same fc- writer panel/state as 找错字)
    // ═══════════════════════════════════════════════════════════════
    function renderWordWrite(card) {
      FC = { card, step: 'write', mistakes: 0 };
      document.getElementById('fc-sentence-wrap').style.display = 'none';
      document.getElementById('fc-feedback').style.display = 'block';
      document.getElementById('fc-feedback').textContent = 'Write the missing character';
      document.getElementById('fc-reveal-row').style.display = 'none';
      document.getElementById('fc-self-check-row').style.display = 'none';
      if (!fcWriter) document.getElementById('fc-writer-target').innerHTML = '';
      fcStartWriting(card);
    }

    // Delegated tap handler — bound once, works for every card
    document.getElementById('fc-sentence-wrap').addEventListener('click', (e) => {
      const span = e.target.closest('.fc-char');
      if (!span || !FC || FC.step !== 'tap') return;
      const idx = Number(span.dataset.idx);
      const card = FC.card;

      if (idx !== card.wrongIndex) {
        span.classList.remove('fc-wrong-tap');
        void span.offsetWidth; // restart animation if tapped again
        span.classList.add('fc-wrong-tap');
        setTimeout(() => span.classList.remove('fc-wrong-tap'), 600);
        return;
      }

      span.classList.add('fc-marked');
      FC.step = 'write';
      document.getElementById('fc-feedback').textContent = 'Now write the correct character';
      fcStartWriting(card);
    });

    function fcResetHint() {
      const hint = document.getElementById('fc-hint');
      hint.classList.remove('revealed');
      hint.textContent = '💡 Tap for hint';
    }

    document.getElementById('fc-hint').addEventListener('click', () => {
      if (!FC) return;
      const hint = document.getElementById('fc-hint');
      if (hint.classList.contains('revealed')) {
        fcResetHint();
      } else {
        hint.classList.add('revealed');
        hint.textContent = FC.card.correctChar;
      }
    });

    function fcStartWriting(card) {
      document.getElementById('fc-write-panel').classList.add('open');
      fcResetHint();
      const target = document.getElementById('fc-writer-target');

      fcCharDataLoader(card.correctChar, () => {
        // HanziWriter attaches its pointer listeners to the target div once, at
        // construction — re-running .create() on every card would stack duplicate
        // listeners, so a single instance is created lazily and reused via
        // setCharacter() from then on.
        if (!fcWriter) {
          fcWriter = HanziWriter.create(target, card.correctChar, {
            width: target.clientWidth || 280,
            height: target.clientHeight || 280,
            padding: 12,
            showOutline: false,
            showCharacter: false,
            showHintAfterMisses: 3,
            markStrokeCorrectAfterMisses: 3,
            charDataLoader: fcCharDataLoader
          });
        } else {
          fcWriter.setCharacter(card.correctChar);
        }
        fcWriter.quiz({
          onMistake: () => {
            if (!FC) return;
            FC.mistakes++;
            if (FC.mistakes >= 8) document.getElementById('fc-reveal-row').style.display = 'flex';
          },
          onComplete: () => fcFinish(true, card)
        });
      }, () => fcMissingData(card));
    }

    // Fallback when a character has no self-hosted stroke data (or the fetch fails)
    function fcMissingData(card) {
      if (FC) FC.selfCheck = true;
      document.getElementById('fc-feedback').textContent = 'No stroke data for this character — write it on paper, then check yourself';
      const target = document.getElementById('fc-writer-target');
      target.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted);font-size:0.9rem;text-align:center;padding:8px">✍️ Write the character</div>`;
      // The SVG this instance owned is now detached from the DOM — force a fresh
      // create() next time rather than reusing an instance bound to a removed node.
      fcWriter = null;
      document.getElementById('fc-self-check-row').style.display = 'flex';
    }

    document.getElementById('fc-reveal-btn').addEventListener('click', () => {
      if (!FC) return;
      const card = FC.card;
      const target = document.getElementById('fc-writer-target');
      target.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:'Kaiti SC','KaiTiRegular','STKaiti',serif;font-size:5rem;color:var(--ok-lt)">${esc(card.correctChar)}</div>`;
      fcWriter = null; // SVG this instance owned was just replaced — force a fresh create() next time
      document.getElementById('fc-reveal-row').style.display = 'none';
      document.getElementById('fc-feedback').textContent = 'Did you write it correctly?';
      document.getElementById('fc-self-check-row').style.display = 'flex';
    });

    document.getElementById('fc-self-correct').addEventListener('click', () => { if (FC) fcFinish(true, FC.card); });
    document.getElementById('fc-self-wrong').addEventListener('click', () => { if (FC) fcFinish(false, FC.card); });

    function fcFinish(correct, card) {
      if (!card) return;
      const timeMs = Date.now() - S.cardStart;
      document.getElementById('fc-self-check-row').style.display = 'none';
      document.getElementById('fc-reveal-row').style.display = 'none';
      document.getElementById('fc-feedback').textContent = correct ? '✓ Correct!' : `✗ The answer was ${card.correctChar}`;

      // Grade writing by stroke mistakes, not elapsed time — writing always
      // takes >10s, so a latency-based grade would permanently mark it "hard".
      let grade;
      if (FC && FC.selfCheck) grade = 'good'; // paper self-check: no stroke count to verify against
      else if (FC && FC.mistakes === 0) grade = 'easy';
      else if (FC && FC.mistakes <= 2) grade = 'good';
      else grade = 'hard';
      registerResult(card, correct, timeMs, grade);
      FC = null;

      setTimeout(() => {
        S.cardIndex++;
        const done = S.cardIndex >= S.cards.length || S.timeLimitReached;
        if (done) { stopTimer(); showSummary(); }
        else renderCard();
      }, correct ? 1200 : 2200);
    }

    // ═══════════════════════════════════════════════════════════════
    // REORDER MODE (连词成句) — tap the scrambled words into order
    // ═══════════════════════════════════════════════════════════════
    let RO = null; // { card, placed: [indices into card.shuffled], done }

    function renderReorder(card) {
      RO = { card, placed: [], done: false };
      document.getElementById('ro-panel').style.display = 'flex';
      document.getElementById('ro-feedback').style.display = 'block';
      document.getElementById('ro-feedback').textContent = 'Tap the words in order';
      document.getElementById('ro-clear-row').style.display = 'flex';
      roRender();
    }

    function roChip(text, idx) {
      const el = document.createElement('button');
      el.className = 'ro-chip';
      el.textContent = text;
      el.dataset.i = String(idx);
      return el;
    }

    // Chips are tracked by index into card.shuffled, not by text, so
    // duplicated chunks (two 我 chips) move independently.
    function roRender() {
      if (!RO) return;
      const { card, placed } = RO;
      const answer = document.getElementById('ro-answer');
      const bank = document.getElementById('ro-bank');
      answer.innerHTML = '';
      bank.innerHTML = '';
      placed.forEach(i => {
        const chip = roChip(card.shuffled[i], i);
        chip.addEventListener('click', () => {
          if (!RO || RO.done) return;
          RO.placed.splice(RO.placed.indexOf(i), 1);
          roRender();
        });
        answer.appendChild(chip);
      });
      if (placed.length === card.shuffled.length) {
        const punct = document.createElement('span');
        punct.className = 'ro-punct';
        punct.textContent = card.punct;
        answer.appendChild(punct);
      }
      card.shuffled.forEach((chunk, i) => {
        if (placed.includes(i)) return;
        const chip = roChip(chunk, i);
        chip.addEventListener('click', () => {
          if (!RO || RO.done) return;
          RO.placed.push(i);
          roRender();
          if (RO.placed.length === RO.card.shuffled.length) roCheck();
        });
        bank.appendChild(chip);
      });
    }

    function roCheck() {
      if (!RO || RO.done) return;
      const { card, placed } = RO;
      const timeMs = Date.now() - S.cardStart;
      // Joined-text compare, so swapping two identical chips still passes
      const correct = placed.map(i => card.shuffled[i]).join('') === card.chinese;
      RO.done = true;
      document.getElementById('ro-clear-row').style.display = 'none';

      document.querySelectorAll('#ro-answer .ro-chip').forEach((chip, k) => {
        const ok = correct || card.chunks[k] === card.shuffled[placed[k]];
        chip.classList.add(ok ? 'ok' : 'err');
        chip.disabled = true;
      });

      // Assembling a sentence takes far longer than one MCQ tap — relaxed
      // thresholds, same reasoning as stroke-based grading in fcFinish.
      const grade = timeMs < 15000 ? 'easy' : timeMs < 30000 ? 'good' : 'hard';
      registerResult(card, correct, timeMs, grade);

      if (correct) {
        document.getElementById('question-text').innerHTML = '';
        document.getElementById('ro-feedback').textContent = '✓ Correct!';
        azureSpeak(card.chinese + card.punct, card.word.pinyin);
        setTimeout(() => {
          S.cardIndex++;
          const done = S.cardIndex >= S.cards.length || S.timeLimitReached;
          if (done) { stopTimer(); showSummary(); }
          else renderCard();
        }, 1500);
      } else {
        const qt = document.getElementById('question-text');
        qt.innerHTML = `<div>${esc(card.chinese)}${esc(card.punct)}</div>`;
        qt.className = 'question-text ro-reveal';
        document.getElementById('ro-feedback').textContent = '✗ Not quite — correct sentence above';
        showAnswerFeedback(card.word);
        document.getElementById('continue-row').style.display = 'flex';
      }
    }

    document.getElementById('ro-clear-btn').addEventListener('click', () => {
      if (!RO || RO.done) return;
      RO.placed = [];
      roRender();
    });

    // Hint button is re-created inside #question-text on every reorder card,
    // so bind the handler once via delegation on the persistent wrapper.
    document.getElementById('question-wrap').addEventListener('click', e => {
      const hint = e.target.closest('#ro-hint');
      if (!hint || !RO || RO.done) return;
      if (hint.classList.contains('revealed')) {
        hint.classList.remove('revealed', 'is-text');
        hint.textContent = '💡 Tap for hint';
      } else {
        hint.classList.add('revealed', 'is-text');
        hint.textContent = RO.card.english;
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // PRONUNCIATION MODE (🎤 Speak) — hold-to-record, Azure scoring
    // ═══════════════════════════════════════════════════════════════
    let PR = null; // { card, attempts, bestScore, recording, busy, recStart }
    let prStream = null;
    let prRecorder = null;
    let prChunks = [];
    let prMaxTimer = null;
    let prAudioCtx = null;

    function renderPronunciation(card) {
      PR = { card, attempts: 0, bestScore: -1, firstScore: null, recording: false, busy: false, recStart: 0 };
      const panel = document.getElementById('pr-panel');
      panel.style.display = 'flex';
      document.getElementById('pr-score-wrap').style.display = 'none';
      document.getElementById('pr-syllables').innerHTML = '';
      document.getElementById('pr-next-btn').style.display = 'none';
      document.getElementById('pr-skip-btn').style.display = '';
      document.getElementById('pr-mic-btn').classList.remove('recording');

      const configured = isAzureConfigured();
      document.getElementById('pr-mic-btn').style.display = configured ? '' : 'none';
      document.getElementById('pr-unconfigured').style.display = configured ? 'none' : 'flex';
      document.getElementById('pr-status').textContent = configured ? 'Hold the mic and say it!' : '';
    }

    function prSetStatus(msg) {
      document.getElementById('pr-status').textContent = msg;
    }

    function prReleaseMic() {
      if (prRecorder && prRecorder.state !== 'inactive') { try { prRecorder.stop(); } catch { } }
      prRecorder = null;
      if (prStream) { prStream.getTracks().forEach(t => t.stop()); prStream = null; }
      clearTimeout(prMaxTimer);
    }

    async function prStartRecording() {
      if (!PR || PR.busy || PR.recording || !isAzureConfigured()) return;
      // Create/resume the AudioContext inside the user gesture (required on iOS)
      if (!prAudioCtx) { try { prAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } }
      if (prAudioCtx && prAudioCtx.state === 'suspended') prAudioCtx.resume().catch(() => { });

      if (!prStream) {
        try {
          prStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        } catch {
          prSetStatus('Microphone blocked — allow it in browser settings');
          return;
        }
      }
      if (!PR || PR.busy || PR.recording) return; // state may have changed while awaiting

      prChunks = [];
      try { prRecorder = new MediaRecorder(prStream); } catch {
        prSetStatus('Recording not supported in this browser');
        return;
      }
      prRecorder.ondataavailable = e => { if (e.data && e.data.size) prChunks.push(e.data); };
      prRecorder.onstop = () => {
        document.getElementById('pr-mic-btn').classList.remove('recording');
        if (!PR) return;
        PR.recording = false;
        const durMs = Date.now() - PR.recStart;
        const blob = new Blob(prChunks, { type: prRecorder && prRecorder.mimeType || 'audio/webm' });
        prChunks = [];
        if (durMs < 400 || !blob.size) {
          prSetStatus('Too short — hold the button while you speak');
          return;
        }
        prProcessAttempt(blob);
      };
      PR.recording = true;
      PR.recStart = Date.now();
      prRecorder.start();
      document.getElementById('pr-mic-btn').classList.add('recording');
      prSetStatus('Listening… release when done');
      clearTimeout(prMaxTimer);
      prMaxTimer = setTimeout(prStopRecording, 6000);
    }

    function prStopRecording() {
      clearTimeout(prMaxTimer);
      if (!PR || !PR.recording || !prRecorder || prRecorder.state === 'inactive') return;
      try { prRecorder.stop(); } catch { }
    }

    async function prProcessAttempt(blob) {
      PR.busy = true;
      const mic = document.getElementById('pr-mic-btn');
      mic.disabled = true;
      prSetStatus('Checking… 🤔');
      try {
        const wav = await blobToWav16kMono(blob);
        const json = await assessPronunciation(wav, PR.card.refHanzi);
        const result = parsePronResult(json, PR.card);
        if (result.noSpeech) {
          prSetStatus("I couldn't hear you — try again!");
        } else {
          prShowScore(result);
        }
      } catch (err) {
        if (err && err.kind === 'auth') prSetStatus('Speech key problem — ask a parent to check settings ⚙');
        else if (err && err.kind === 'network') prSetStatus('No internet — try again in a moment');
        else prSetStatus('Something went wrong — try again');
      } finally {
        if (PR) PR.busy = false;
        mic.disabled = false;
      }
    }

    function revealPronunciationAnswer(card) {
      const qText = document.getElementById('question-text');
      if (qText.querySelector('.pr-answer-reveal')) return; // already revealed
      const reveal = document.createElement('div');
      reveal.className = 'pr-answer-reveal';
      const pinyinHint = document.createElement('div');
      pinyinHint.style.cssText = 'font-size:0.28em;color:var(--p-xl);margin-top:6px;font-weight:700;font-family:system-ui,-apple-system,sans-serif;letter-spacing:0.03em;display:flex;align-items:center;justify-content:center;gap:4px';
      pinyinHint.textContent = card.refPinyin;
      const listenBtn = document.createElement('button');
      listenBtn.className = 'speak-btn';
      listenBtn.title = 'Listen';
      listenBtn.textContent = '🔊';
      listenBtn.addEventListener('click', e => { e.stopPropagation(); azureSpeak(card.refHanzi, card.refPinyin); });
      pinyinHint.appendChild(listenBtn);
      const englishHint = document.createElement('div');
      englishHint.style.cssText = 'font-size:0.3em;color:var(--muted);margin-top:8px;font-weight:500;font-family:system-ui,-apple-system,sans-serif';
      englishHint.textContent = card.refEnglish;
      reveal.appendChild(pinyinHint);
      reveal.appendChild(englishHint);
      qText.appendChild(reveal);
    }

    function prShowScore(result) {
      PR.attempts++;
      if (PR.firstScore === null) PR.firstScore = result.score;
      PR.bestScore = Math.max(PR.bestScore, result.score);
      revealPronunciationAnswer(PR.card);
      const threshold = getAzureConfig().threshold;

      const wrap = document.getElementById('pr-score-wrap');
      const numEl = document.getElementById('pr-score-num');
      const starsEl = document.getElementById('pr-score-stars');
      wrap.style.display = 'flex';
      numEl.textContent = Math.round(result.score);
      let stars, cls;
      if (result.score >= 85) { stars = '🌟🌟🌟 Amazing!'; cls = 'pr-good'; }
      else if (result.score >= threshold) { stars = '🌟🌟 Good!'; cls = 'pr-good'; }
      else if (result.score >= 50) { stars = '🌟 Almost — try again!'; cls = 'pr-mid'; }
      else { stars = 'Keep trying! 💪'; cls = 'pr-bad'; }
      starsEl.textContent = stars;
      numEl.className = `pr-score-num ${cls}`;
      document.getElementById('pr-score-best').textContent =
        PR.attempts > 1 ? `First (counts for SRS): ${Math.round(PR.firstScore)} · Best: ${Math.round(PR.bestScore)} (attempt ${PR.attempts})` : '';

      const sylWrap = document.getElementById('pr-syllables');
      sylWrap.innerHTML = '';
      result.syllables.forEach(syl => {
        const chip = document.createElement('button');
        const weak = syl.score < 70 || (syl.errorType && syl.errorType !== 'None');
        chip.className = `pr-syl ${weak ? 'weak' : 'ok'}`;
        chip.innerHTML = `${esc(syl.pinyin)} <span>${weak ? '✗ 🔊' : '✓'}</span>`;
        chip.title = weak ? 'Tap to hear this syllable' : `${Math.round(syl.score)}/100`;
        chip.addEventListener('click', () => speakChinese(syl.pinyin));
        sylWrap.appendChild(chip);
      });

      document.getElementById('pr-next-btn').style.display = '';
      document.getElementById('pr-skip-btn').style.display = 'none';
      prSetStatus('');

      // Play the correct pronunciation so the student hears the right tones
      // right after seeing their score.
      azureSpeak(PR.card.refHanzi, PR.card.refPinyin);
    }

    function prFinish() {
      if (!PR || !PR.card) return;
      const card = PR.card;
      const timeMs = Date.now() - S.cardStart;
      // Only the first submission's score counts toward the word's SRS record —
      // later retries just let the student practice, they don't change what's registered.
      const score = PR.firstScore === null ? 0 : PR.firstScore;
      const correct = score >= getAzureConfig().threshold;
      registerResult(card, correct, timeMs, score >= 85 ? 'easy' : 'good', { score: Math.round(score) });
      prAdvance();
    }

    // Skipping without attempting counts the word as wrong for its SRS record.
    function prRegisterSkip() {
      if (!PR || !PR.card) return;
      const card = PR.card;
      const timeMs = Date.now() - S.cardStart;
      revealPronunciationAnswer(PR.card);
      registerResult(card, false, timeMs, 'hard', { score: 0 });
      prAdvance();
    }

    function prAdvance() {
      PR = null;
      S.cardIndex++;
      const done = S.cardIndex >= S.cards.length || S.timeLimitReached;
      if (done) { stopTimer(); showSummary(); }
      else renderCard();
    }

    // Tap-and-hold wiring (bound once)
    {
      const micBtn = document.getElementById('pr-mic-btn');
      micBtn.addEventListener('pointerdown', e => {
        e.preventDefault();
        try { micBtn.setPointerCapture(e.pointerId); } catch { }
        prStartRecording();
      });
      const releasePointer = e => { try { micBtn.releasePointerCapture(e.pointerId); } catch { } };
      micBtn.addEventListener('pointerup', e => { releasePointer(e); prStopRecording(); });
      micBtn.addEventListener('pointercancel', e => { releasePointer(e); prStopRecording(); });
      micBtn.addEventListener('contextmenu', e => e.preventDefault());

      document.getElementById('pr-next-btn').addEventListener('click', () => {
        if (!PR) return;
        if (PR.attempts === 0) prRegisterSkip(); // moved on without attempting — counts as wrong
        else prFinish();
      });
      document.getElementById('pr-skip-btn').addEventListener('click', () => {
        if (!PR) return;
        if (PR.attempts === 0) prRegisterSkip(); // counts as wrong
        else prFinish(); // already attempted — register the first-attempt score as usual
      });
      document.getElementById('pr-open-settings').addEventListener('click', openSpeechSettings);
    }

    // ── Audio: MediaRecorder blob → 16 kHz mono PCM WAV ──
    async function blobToWav16kMono(blob) {
      const buf = await blob.arrayBuffer();
      if (!prAudioCtx) prAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await prAudioCtx.decodeAudioData(buf);
      const rate = 16000;
      const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start();
      const rendered = await offline.startRendering();
      return encodeWavPcm16(rendered);
    }

    function encodeWavPcm16(audioBuffer) {
      const samples = audioBuffer.getChannelData(0);
      const rate = audioBuffer.sampleRate;
      const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
      const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      out.setUint32(4, 36 + samples.length * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      out.setUint32(16, 16, true);      // fmt chunk size
      out.setUint16(20, 1, true);       // PCM
      out.setUint16(22, 1, true);       // mono
      out.setUint32(24, rate, true);
      out.setUint32(28, rate * 2, true); // byte rate
      out.setUint16(32, 2, true);       // block align
      out.setUint16(34, 16, true);      // bits per sample
      writeStr(36, 'data');
      out.setUint32(40, samples.length * 2, true);
      for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      return new Blob([out.buffer], { type: 'audio/wav' });
    }

    // ── Azure Pronunciation Assessment (REST) ──
    function b64Utf8(str) {
      return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
    }

    async function assessPronunciation(wavBlob, referenceText) {
      const cfg = getAzureConfig();
      const params = b64Utf8(JSON.stringify({
        ReferenceText: referenceText,
        GradingSystem: 'HundredMark',
        Granularity: 'Phoneme',
        Dimension: 'Comprehensive',
      }));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      let res;
      try {
        res = await fetch(`${cfg.proxyUrl}/?action=STT&language=zh-CN&format=detailed&token=${encodeURIComponent(cfg.apiKey)}`, {
          method: 'POST',
          headers: {
            'Pronunciation-Assessment': params,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Accept': 'application/json',
          },
          body: wavBlob,
          signal: ctrl.signal,
        });
      } catch {
        throw { kind: 'network' };
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 401 || res.status === 403) throw { kind: 'auth' };
      if (!res.ok) throw { kind: 'server' };
      return res.json();
    }

    function parsePronResult(json, card) {
      if (!json || json.RecognitionStatus !== 'Success' || !json.NBest || !json.NBest.length) {
        return { noSpeech: true };
      }
      const nb = json.NBest[0];
      // Detailed REST responses may put scores at NBest level or under PronunciationAssessment
      const score = nb.PronunciationAssessment?.AccuracyScore ?? nb.AccuracyScore ?? 0;

      // One syllable per hanzi for zh-CN; align to reference pinyin by index
      const units = [];
      (nb.Words || []).forEach(w => {
        const sylls = w.Syllables && w.Syllables.length ? w.Syllables : [w];
        sylls.forEach(s => units.push({
          score: s.PronunciationAssessment?.AccuracyScore ?? s.AccuracyScore ?? score,
          errorType: s.PronunciationAssessment?.ErrorType ?? s.ErrorType ?? w.PronunciationAssessment?.ErrorType ?? w.ErrorType ?? 'None',
        }));
      });
      const syllables = card.refPinyinSyllables.map((pinyin, i) => ({
        pinyin,
        score: units[i] ? units[i].score : 0,
        errorType: units[i] ? units[i].errorType : 'Omission',
      }));
      return { score, syllables };
    }

    // Game → end session manually
    document.getElementById('game-end-btn').addEventListener('click', () => {
      prReleaseMic();
      PR = null;
      stopTimer();
      showSummary();
    });

    // Game → continue to next card
    document.getElementById('continue-btn').addEventListener('click', () => {
      S.cardIndex++;
      const done = S.cardIndex >= S.cards.length || S.timeLimitReached;
      if (done) { stopTimer(); showSummary(); }
      else renderCard();
    });

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY SCREEN
    // ═══════════════════════════════════════════════════════════════
    function showSummary() {
      prReleaseMic();
      PR = null;
      const elapsed = Date.now() - S.sessionStart;
      const correct = S.results.filter(r => r.correct).length;
      const wrong = S.results.length - correct;

      document.getElementById('summary-correct').textContent = correct;
      document.getElementById('summary-wrong').textContent = wrong;
      const m = Math.floor(elapsed / 60000), sec = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('summary-time').textContent = `${m}:${String(sec).padStart(2, '0')}`;

      const list = document.getElementById('summary-result-list');
      list.innerHTML = '';
      S.results.forEach(r => {
        const item = document.createElement('div');
        item.className = `result-item ${r.correct ? 'ok' : 'err'}`;

        const charEl = document.createElement('div');
        charEl.className = 'result-char';
        charEl.textContent = r.word.character;
        charEl.addEventListener('click', () => showCharModal(r.word));

        item.appendChild(charEl);
        item.insertAdjacentHTML('beforeend', `
      <div class="result-info">
        <div class="result-pinyin" style="display:flex;align-items:center;gap:4px"><span>${esc(r.word.pinyin)}</span></div>
        <div class="result-english">${esc(r.word.english)}</div>
      </div>
      <div class="result-time">${r.type === 'pronunciation' ? `${r.score} pts ` : `${(r.timeMs / 1000).toFixed(1)}s `}${r.correct ? '✓' : '✗'}</div>`);
        item.querySelector('.result-pinyin').appendChild(makeSpeakBtn(r.word.character, r.word.pinyin));
        list.appendChild(item);
      });

      // Save best accuracy to avatar scores
      if (S.results.length && window.__avatarSave) {
        const pct = Math.round((correct / S.results.length) * 100);
        window.__avatarSave(`chinese-${S.level}-accuracy`, pct, false);
      }

      showScreen('screen-summary');
    }

    document.getElementById('summary-again-btn').addEventListener('click', startSession);
    document.getElementById('summary-setup-btn').addEventListener('click', initSetup);
    document.getElementById('summary-stats-btn').addEventListener('click', () => { S.statsPrev = 'summary'; openStats(); });

    // ═══════════════════════════════════════════════════════════════
    // STATS SCREEN
    // ═══════════════════════════════════════════════════════════════
    function openStats() {
      S.statsAvatarId = S.avatarId;
      S.statsLevel = S.level;
      document.querySelectorAll('#stats-level-tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.level === S.statsLevel);
      });
      renderAvatarChips();
      renderStatsTable();
      showScreen('screen-stats');
    }

    function renderAvatarChips() {
      const avatars = window.__avatarLoadAvatars ? window.__avatarLoadAvatars() : [];
      const container = document.getElementById('stats-av-chips');
      container.innerHTML = '';
      if (avatars.length === 0) {
        container.innerHTML = '<span style="color:var(--muted);font-size:0.85rem">No avatars yet</span>';
        return;
      }
      avatars.forEach(av => {
        const chip = document.createElement('div');
        chip.className = `av-chip ${av.id === S.statsAvatarId ? 'active' : ''}`;
        chip.innerHTML = `<div style="flex-shrink:0">${window.__avatarRender ? window.__avatarRender(av, '28') : '👤'}</div>${esc(av.nickname)}`;
        chip.addEventListener('click', () => { S.statsAvatarId = av.id; renderAvatarChips(); renderStatsTable(); });
        container.appendChild(chip);
      });
    }

    function renderStatsTable() {
      const progress = S.statsAvatarId ? loadProgress(S.statsAvatarId) : {};
      const pool = getWordPool(S.statsLevel, 'all');

      let rows = pool
        .map(w => ({ ...w, rec: progress[w.key] }))
        .filter(w => w.rec && w.rec.attempts > 0);

      const sort = document.getElementById('stats-sort').value;
      if (sort === 'wrong') rows.sort((a, b) => (b.rec.wrong || 0) - (a.rec.wrong || 0));
      else if (sort === 'time') rows.sort((a, b) => avgTimeMs(b.rec) - avgTimeMs(a.rec));
      else if (sort === 'due') rows.sort((a, b) => statsDueDate(a.rec) < statsDueDate(b.rec) ? -1 : 1);
      else if (sort === 'lesson') rows.sort((a, b) => a.lessonNum - b.lessonNum);

      document.getElementById('stats-count').textContent = rows.length
        ? `${rows.length} word${rows.length !== 1 ? 's' : ''} practiced`
        : '';

      const tbody = document.getElementById('stats-tbody');
      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="stats-empty">No practice data yet for this level.<br>Complete a session to see your progress here.</td></tr>`;
        return;
      }

      const today = todayStr();
      tbody.innerHTML = rows.map(w => {
        const r = w.rec;
        const avgMs = avgTimeMs(r);
        const avg = avgMs ? (avgMs / 1000).toFixed(1) + 's' : '—';
        const wrongCls = r.wrong > 0 ? 'err' : 'ok';
        const correctCls = r.correct > 0 ? 'ok' : '';
        const dueDate = statsDueDate(r);
        const dueCls = dueDate && dueDate <= today ? 'warn' : '';
        const byMode = r.byMode
          ? esc(Object.entries(r.byMode).map(([g, m]) => `${g} ${m.correct}✓ ${m.wrong}✗`).join(' · '))
          : '';
        return `<tr data-word-key="${esc(w.key)}">
      <td class="td-char">${esc(w.character)}</td>
      <td class="td-pinyin"><span style="display:inline-flex;align-items:center;gap:4px">${esc(w.pinyin)}<button class="speak-btn" data-char="${esc(w.character)}" data-pinyin="${esc(w.pinyin)}" title="Listen">🔊</button></span></td>
      <td>${esc(w.english)}</td>
      <td class="td-lesson">L${w.lessonNum}</td>
      <td class="${correctCls}" title="${byMode}">${r.correct}</td>
      <td class="${wrongCls}" title="${byMode}">${r.wrong}</td>
      <td title="${esc(avgTimeTooltip(r))}">${avg}</td>
      <td class="${dueCls}" title="${esc(dueTooltip(r))}">${dueDate || '—'}</td>
    </tr>`;
      }).join('');
    }

    // Recognition-only average when per-mode time exists — the overall average
    // mixes 3s MCQ taps with 40s writing sessions and means little. Records
    // graded only before per-mode time was tracked fall back to the lifetime
    // average.
    function avgTimeMs(rec) {
      const m = rec.byMode && rec.byMode.recognition;
      if (m && m.timed) return m.timeMs / m.timed;
      return rec.attempts ? rec.totalTimeMs / rec.attempts : 0;
    }

    function avgTimeTooltip(rec) {
      if (!rec.byMode) return '';
      return Object.entries(rec.byMode)
        .filter(([, m]) => m.timed)
        .map(([g, m]) => `${g} ${(m.timeMs / m.timed / 1000).toFixed(1)}s`)
        .join(' · ');
    }

    // Groups the student has actually practiced this word in — never-touched
    // groups sit at their seeded due-today schedule and would otherwise make
    // every row read as permanently due.
    function attemptedGroups(rec) {
      return SKILL_GROUPS.filter(g => {
        const m = rec.byMode && rec.byMode[g];
        return m && (m.correct + m.wrong) > 0;
      });
    }

    function statsDueDate(rec) {
      const groups = attemptedGroups(rec);
      return soonestDue(rec, groups.length ? groups : SKILL_GROUPS);
    }

    function dueTooltip(rec) {
      return attemptedGroups(rec)
        .map(g => `${g} ${getSkill(rec, g).dueDate || '—'}`)
        .join(' · ');
    }

    // Stats level tabs
    bindTabs('stats-level-tabs', tab => { S.statsLevel = tab.dataset.level; renderStatsTable(); });

    document.getElementById('stats-sort').addEventListener('change', renderStatsTable);

    document.getElementById('stats-back-btn').addEventListener('click', () => {
      if (S.statsPrev === 'summary') showScreen('screen-summary');
      else initSetup();
    });

    // ═══════════════════════════════════════════════════════════════
    // CHARACTER CARD MODAL
    // ═══════════════════════════════════════════════════════════════
    // Find a character's full entry anywhere in the loaded data — used to make
    // the "Same Sound" chips navigate to that character's own card.
    function findWordByChar(char) {
      for (const level of ['p1', 'p2', 'p3']) {
        const data = DATA[level];
        if (!data) continue;
        for (const lk of Object.keys(data)) {
          const entry = (data[lk] || []).find(e => e.character === char);
          if (entry) {
            const lessonNum = Number((lk.match(/-(\d+)$/) || [])[1] || 0);
            return { ...entry, lessonKey: lk, lessonNum, level, key: entry.character };
          }
        }
      }
      return null;
    }

    // Splits a "汉字 (pinyin, english)" / "汉字 (english)" chip string into a
    // Kaiti hanzi span and a sans-serif span for the pinyin/english part.
    function chipContent(text) {
      const frag = document.createDocumentFragment();
      const m = text.match(/^(\S+)\s*(\(.*\))$/);
      const zh = document.createElement('span');
      zh.className = 'chip-zh';
      zh.textContent = m ? m[1] : text;
      frag.appendChild(zh);
      if (m) {
        const meta = document.createElement('span');
        meta.className = 'chip-meta';
        meta.textContent = ' ' + m[2];
        frag.appendChild(meta);
      }
      return frag;
    }

    function showCharModal(word) {
      document.getElementById('cm-lesson').textContent = word.lessonKey || (word.level ? `${word.level}-${word.lessonNum}` : '');
      document.getElementById('cm-pinyin').textContent = word.pinyin;
      const cmSpeak = document.getElementById('cm-speak-btn');
      cmSpeak.onclick = e => { e.stopPropagation(); speakChinese(word.pinyin || word.character); };
      document.getElementById('cm-eng').textContent = word.english;
      document.getElementById('cm-def-en').textContent = word['definition-english'] || '';
      document.getElementById('cm-def-zh').textContent = word['definition-chinese'] || '';

      cmShowWriter(word.character);

      const wordsEl = document.getElementById('cm-words');
      wordsEl.innerHTML = '';
      (word.words || []).forEach(w => {
        const chip = document.createElement('span');
        chip.className = 'char-modal-chip';
        chip.appendChild(chipContent(w));
        const m = w.match(/^([^\s(]+)\s*\(([^,)]+)/);
        chip.style.cursor = 'pointer';
        chip.title = 'Listen';
        chip.addEventListener('click', () => azureSpeak(m ? m[1] : w, m ? m[2].trim() : ''));
        wordsEl.appendChild(chip);
      });

      const sameEl = document.getElementById('cm-same');
      sameEl.innerHTML = '';
      (word['same-sounding-character'] || []).forEach(s => {
        const chip = document.createElement('span');
        chip.className = 'char-modal-chip';
        chip.appendChild(chipContent(s));
        const ch = (s.match(/^([^\s(]+)/) || [])[1];
        chip.style.cursor = 'pointer';
        chip.title = 'Open this character';
        chip.addEventListener('click', () => {
          const found = ch ? findWordByChar(ch) : null;
          if (found) showCharModal(found);
          else if (ch) speakChinese(ch);
        });
        sameEl.appendChild(chip);
      });

      document.getElementById('char-modal').classList.add('open');
    }

    // Stroke-order writer in the modal — same singleton pattern as fcWriter
    // (HanziWriter binds to the target div once; setCharacter() reuses it).
    // Freshly created/set, it shows the character fully drawn; the play
    // button then replays the stroke-by-stroke animation on top of that.
    let cmWriter = null;
    function cmShowWriter(char) {
      const target = document.getElementById('cm-stroke-target');
      document.getElementById('cm-play-btn').style.display = '';
      if (cmWriter) { try { cmWriter.pauseAnimation(); } catch { } }
      else target.innerHTML = '';

      fcCharDataLoader(char, () => {
        if (!cmWriter) {
          cmWriter = HanziWriter.create(target, char, {
            width: 176, height: 176, padding: 10,
            strokeAnimationSpeed: 1,
            delayBetweenStrokes: 250,
            delayBetweenLoops: 1500,
            charDataLoader: fcCharDataLoader,
          });
        } else {
          cmWriter.setCharacter(char);
        }
      }, () => {
        target.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:'Kaiti SC','KaiTiRegular','STKaiti',serif;font-size:5rem;color:var(--p-text)">${esc(char)}</div>`;
        cmWriter = null; // its SVG was just replaced — recreate next time
        document.getElementById('cm-play-btn').style.display = 'none';
      });
    }

    document.getElementById('cm-play-btn').addEventListener('click', () => {
      if (cmWriter) cmWriter.loopCharacterAnimation();
    });

    document.getElementById('char-modal').addEventListener('click', e => {
      if (e.target.id === 'char-modal') document.getElementById('char-modal').classList.remove('open');
    });
    document.getElementById('cm-close').addEventListener('click', () => {
      document.getElementById('char-modal').classList.remove('open');
    });

    // ── Settings modal (speech + danger zone) ──
    function openSpeechSettings() {
      const cfg = getAzureConfig();
      document.getElementById('ss-proxy-url').value = cfg.proxyUrl;
      document.getElementById('ss-api-key').value = cfg.apiKey;
      document.getElementById('ss-threshold').value = cfg.threshold;
      document.getElementById('ss-test-status').textContent = '';
      resetConfirmStep(0);
      document.getElementById('speech-settings-modal').classList.add('open');
    }

    // Reset progress: deliberately two explicit confirmations after the
    // initial tap — this erases a child's whole SRS history on every device.
    function resetConfirmStep(step) {
      document.getElementById('reset-step0').style.display = step === 0 ? '' : 'none';
      document.getElementById('reset-step1').style.display = step === 1 ? 'flex' : 'none';
      document.getElementById('reset-step2').style.display = step === 2 ? 'flex' : 'none';
    }

    document.getElementById('reset-progress-btn').addEventListener('click', () => {
      const avatar = window.__avatarGetActive ? window.__avatarGetActive() : null;
      if (!avatar) { showToast('No avatar selected'); return; }
      document.getElementById('reset-warn-text').textContent =
        `This erases ALL practice history for ${avatar.nickname} — every schedule, score and time, on all synced devices. There is no undo.`;
      resetConfirmStep(1);
    });
    document.getElementById('reset-continue-btn').addEventListener('click', () => {
      const avatar = window.__avatarGetActive ? window.__avatarGetActive() : null;
      if (!avatar) { resetConfirmStep(0); return; }
      document.getElementById('reset-final-text').textContent =
        `Really erase everything for ${avatar.nickname}?`;
      resetConfirmStep(2);
    });
    document.getElementById('reset-cancel1-btn').addEventListener('click', () => resetConfirmStep(0));
    document.getElementById('reset-cancel2-btn').addEventListener('click', () => resetConfirmStep(0));
    document.getElementById('reset-confirm-btn').addEventListener('click', () => {
      const avatar = window.__avatarGetActive ? window.__avatarGetActive() : null;
      if (!avatar) { resetConfirmStep(0); return; }
      resetProgress(avatar.id);
      resetConfirmStep(0);
      renderSetupLessonTabs();
      document.getElementById('speech-settings-modal').classList.remove('open');
      showToast(`Progress reset for ${avatar.nickname}`);
    });

    function readSpeechSettingsForm() {
      return {
        proxyUrl: document.getElementById('ss-proxy-url').value.trim().replace(/\/+$/, ''),
        apiKey: document.getElementById('ss-api-key').value.trim(),
        threshold: Math.min(100, Math.max(1, parseInt(document.getElementById('ss-threshold').value, 10) || 70)),
      };
    }

    document.getElementById('setup-speech-settings-btn').addEventListener('click', openSpeechSettings);
    document.getElementById('speech-settings-modal').addEventListener('click', e => {
      if (e.target.id === 'speech-settings-modal') document.getElementById('speech-settings-modal').classList.remove('open');
    });
    document.getElementById('ss-close').addEventListener('click', () => {
      document.getElementById('speech-settings-modal').classList.remove('open');
    });
    document.getElementById('ss-save').addEventListener('click', () => {
      saveAzureConfig(readSpeechSettingsForm());
      document.getElementById('speech-settings-modal').classList.remove('open');
      showToast('Speech settings saved');
      // Refresh the current card if it was waiting for a key
      if (PR && PR.card) renderCard();
    });
    document.getElementById('ss-test').addEventListener('click', async () => {
      const cfg = readSpeechSettingsForm();
      const status = document.getElementById('ss-test-status');
      if (!cfg.proxyUrl || !cfg.apiKey) { status.textContent = '✗ Enter proxy URL and API key first'; status.style.color = 'var(--err)'; return; }
      status.textContent = 'Testing…';
      status.style.color = 'var(--muted)';
      try {
        const res = await fetch(`${cfg.proxyUrl}/?action=Test&token=${encodeURIComponent(cfg.apiKey)}`);
        if (res.status === 403) { status.textContent = '✗ Wrong API key'; status.style.color = 'var(--err)'; return; }
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (res.ok && data && data.ok) { status.textContent = '✓ Key works!'; status.style.color = 'var(--ok)'; }
        else { status.textContent = '✗ Proxy reachable, but Azure key/region is wrong'; status.style.color = 'var(--err)'; }
      } catch {
        status.textContent = '✗ Could not reach proxy — check the URL and internet';
        status.style.color = 'var(--err)';
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // BUG REPORTS — a test-mode 🐛 button lets a student flag a broken
    // question (wrong audio/word/punctuation/other); reports are stored
    // locally and reviewed/cleared from the setup screen's Bugs list.
    // ═══════════════════════════════════════════════════════════════
    const ISSUE_LABELS = {
      audio: 'Audio is wrong', word: 'Word is wrong',
      punctuation: 'Punctuation is wrong', other: 'Others',
    };
    const BUG_REPORTS_KEY = 'chinese-bug-reports';
    const BR = { word: null, cardType: null, issue: null };

    function loadBugReports() {
      try { return JSON.parse(localStorage.getItem(BUG_REPORTS_KEY) || '[]'); } catch { return []; }
    }
    function saveBugReports(arr) { localStorage.setItem(BUG_REPORTS_KEY, JSON.stringify(arr)); }

    function openBugReportModal() {
      const card = S.cards[S.cardIndex];
      if (!card || !card.word) { showToast('No question to report'); return; }
      BR.word = card.word;
      BR.cardType = card.type;
      BR.issue = null;
      document.querySelectorAll('#br-issue-tabs .tab').forEach(t => t.classList.remove('active'));
      document.getElementById('br-note').value = '';
      const modeLabel = MODE_LABELS[card.type] || card.type;
      document.getElementById('br-context').textContent =
        `${card.word.lessonKey} · ${card.word.character} · ${modeLabel}`;
      document.getElementById('bug-report-modal').classList.add('open');
    }

    function closeBugReportModal() {
      document.getElementById('bug-report-modal').classList.remove('open');
    }

    document.getElementById('bug-report-btn').addEventListener('click', openBugReportModal);
    document.getElementById('bug-report-modal').addEventListener('click', e => {
      if (e.target.id === 'bug-report-modal') closeBugReportModal();
    });
    document.getElementById('br-close').addEventListener('click', closeBugReportModal);
    document.getElementById('br-cancel').addEventListener('click', closeBugReportModal);

    document.querySelectorAll('#br-issue-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#br-issue-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        BR.issue = tab.dataset.issue;
      });
    });

    document.getElementById('br-submit').addEventListener('click', () => {
      if (!BR.word) { closeBugReportModal(); return; }
      if (!BR.issue) { showToast("Pick what's wrong first"); return; }
      const word = BR.word;
      const bugs = loadBugReports();
      bugs.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ts: new Date().toISOString(),
        level: word.level,
        lessonKey: word.lessonKey,
        character: word.character,
        pinyin: word.pinyin,
        english: word.english,
        mode: BR.cardType,
        modeLabel: MODE_LABELS[BR.cardType] || BR.cardType,
        issue: BR.issue,
        issueLabel: ISSUE_LABELS[BR.issue] || BR.issue,
        note: document.getElementById('br-note').value.trim(),
      });
      saveBugReports(bugs);
      closeBugReportModal();
      showToast('Bug reported — thanks!');
    });

    function renderBugList() {
      const bugs = loadBugReports();
      const container = document.getElementById('bug-list');
      if (!bugs.length) {
        container.innerHTML = '<div class="bug-empty">No bugs reported yet.</div>';
        return;
      }
      container.innerHTML = '';
      bugs.forEach(b => {
        const card = document.createElement('div');
        card.className = 'bug-card';
        const date = new Date(b.ts).toLocaleDateString();
        card.innerHTML = `
      <div class="bug-card-info">
        <div class="bug-card-title">${esc(b.character || '?')} <span class="bug-issue-tag">${esc(b.issueLabel || '')}</span></div>
        <div class="bug-card-meta">${esc(b.lessonKey || '')} · ${esc(b.modeLabel || b.mode || '')} · ${esc(date)}</div>
        ${b.note ? `<div class="bug-card-note">${esc(b.note)}</div>` : ''}
      </div>
      <button class="btn btn-danger btn-sm" data-del="${esc(b.id)}" style="flex-shrink:0">✕</button>`;
        card.querySelector('[data-del]').addEventListener('click', () => deleteBugReport(b.id));
        container.appendChild(card);
      });
    }

    function deleteBugReport(id) {
      saveBugReports(loadBugReports().filter(b => b.id !== id));
      renderBugList();
    }

    document.getElementById('setup-bugs-btn').addEventListener('click', () => {
      renderBugList();
      showScreen('screen-bugs');
    });
    document.getElementById('bugs-back-btn').addEventListener('click', () => showScreen('screen-setup'));

    // Stats table: speak button and click td-char to open character modal
    document.getElementById('stats-tbody').addEventListener('click', e => {
      const speakBtn = e.target.closest('.speak-btn[data-char]');
      if (speakBtn) { e.stopPropagation(); speakChinese(speakBtn.dataset.pinyin || speakBtn.dataset.char); return; }
      const td = e.target.closest('td.td-char');
      if (!td) return;
      const key = td.closest('tr').dataset.wordKey;
      if (!key) return;
      const pool = getWordPool(S.statsLevel, 'all');
      const word = pool.find(w => w.key === key);
      if (word) showCharModal(word);
    });

    // ═══════════════════════════════════════════════════════════════
    // SPEECH
    // ═══════════════════════════════════════════════════════════════
    let _audioQueue = [];
    let _currentAudio = null;

    function _pinyinToFilename(syllable) {
      let tone = 5;
      for (const ch of syllable) {
        if (TONE_NUMBER[ch]) { tone = TONE_NUMBER[ch]; break; }
      }
      const base = stripTones(syllable).replace(/ü/g, 'v');
      return `pinyin_audio/${base}${tone}.mp3`;
    }

    function _playNext() {
      if (_currentAudio) { _currentAudio.pause(); _currentAudio = null; }
      if (_audioQueue.length === 0) return;
      const src = _audioQueue.shift();
      const audio = new Audio(src);
      _currentAudio = audio;
      audio.onerror = () => _playNext();
      audio.onended = () => _playNext();
      audio.play().catch(() => _playNext());
    }

    function speakChinese(pinyinOrChar) {
      if (!pinyinOrChar) return;
      if (/[一-鿿]/.test(pinyinOrChar)) {
        if (!window.speechSynthesis) return;
        const utt = new SpeechSynthesisUtterance(pinyinOrChar);
        utt.lang = 'zh-CN'; utt.rate = 0.8;
        speechSynthesis.cancel();
        speechSynthesis.speak(utt);
        return;
      }
      _audioQueue = pinyinOrChar.trim().split(/\s+/).filter(Boolean).map(_pinyinToFilename);
      _playNext();
    }

    function makeSpeakBtn(character, pinyin) {
      const btn = document.createElement('button');
      btn.className = 'speak-btn';
      btn.title = 'Listen';
      btn.textContent = '🔊';
      btn.addEventListener('click', e => { e.stopPropagation(); speakChinese(pinyin || character); });
      return btn;
    }

    // Natural-voice TTS via Azure (zh-CN-XiaoxiaoNeural); falls back to local
    // pinyin mp3s / speechSynthesis when no key or the request fails.
    const _ttsCache = new Map(); // text → object URL (this page load only)
    let _ttsAudio = null;

    // Persistent TTS cache (IndexedDB) — Azure's neural TTS output is
    // deterministic for a fixed (voice, rate, text), so once synthesized it
    // never goes stale. Cache indefinitely, same policy as the local
    // pinyin_audio mp3s the service worker caches forever; just cap entry
    // count so it can't grow unbounded.
    const TTS_DB_NAME = 'chinese-tts-cache';
    const TTS_STORE = 'audio';
    const TTS_DB_MAX = 300;

    let _ttsDbPromise = null;
    function openTtsDb() {
      if (!('indexedDB' in window)) return Promise.reject(new Error('no indexedDB'));
      if (!_ttsDbPromise) {
        _ttsDbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(TTS_DB_NAME, 1);
          req.onupgradeneeded = () => {
            const store = req.result.createObjectStore(TTS_STORE, { keyPath: 'hanzi' });
            store.createIndex('ts', 'ts');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return _ttsDbPromise;
    }

    async function ttsDbGet(hanzi) {
      try {
        const db = await openTtsDb();
        return await new Promise((resolve, reject) => {
          const req = db.transaction(TTS_STORE, 'readonly').objectStore(TTS_STORE).get(hanzi);
          req.onsuccess = () => resolve(req.result ? req.result.blob : null);
          req.onerror = () => reject(req.error);
        });
      } catch { return null; }
    }

    async function ttsDbPut(hanzi, blob) {
      try {
        const db = await openTtsDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(TTS_STORE, 'readwrite');
          tx.objectStore(TTS_STORE).put({ hanzi, blob, ts: Date.now() });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
        ttsDbEvictOverflow();
      } catch { }
    }

    // FIFO-evict oldest entries once the cache grows past TTS_DB_MAX.
    async function ttsDbEvictOverflow() {
      try {
        const db = await openTtsDb();
        const store = db.transaction(TTS_STORE, 'readwrite').objectStore(TTS_STORE);
        store.count().onsuccess = function () {
          const over = this.result - TTS_DB_MAX;
          if (over <= 0) return;
          let deleted = 0;
          store.index('ts').openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (!cursor || deleted >= over) return;
            cursor.delete();
            deleted++;
            cursor.continue();
          };
        };
      } catch { }
    }

    async function azureSpeak(hanzi, pinyinFallback) {
      const fallback = () => speakChinese(pinyinFallback || hanzi);
      if (!isAzureConfigured()) { fallback(); return; }
      try {
        let url = _ttsCache.get(hanzi);
        if (!url) {
          let blob = await ttsDbGet(hanzi);
          if (!blob) {
            const cfg = getAzureConfig();
            const ssml = `<speak version='1.0' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'><prosody rate='-15%'>${esc(hanzi)}</prosody></voice></speak>`;
            const res = await fetch(`${cfg.proxyUrl}/?action=TTS&token=${encodeURIComponent(cfg.apiKey)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
              },
              body: ssml,
            });
            if (!res.ok) throw new Error(`tts ${res.status}`);
            blob = await res.blob();
            ttsDbPut(hanzi, blob); // fire-and-forget persist for future sessions
          }
          url = URL.createObjectURL(blob);
          _ttsCache.set(hanzi, url);
        }
        if (_ttsAudio) _ttsAudio.pause();
        _ttsAudio = new Audio(url);
        _ttsAudio.play().catch(fallback);
      } catch {
        fallback();
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════
    // BROWSE SCREEN
    // ═══════════════════════════════════════════════════════════════
    const B = { level: 'p1', lesson: 1, prev: 'setup' };

    function getLessonCount(level) {
      const data = DATA[level];
      if (!data) return 0;
      let max = 0;
      for (const key of Object.keys(data)) {
        const m = key.match(/^[a-z]\d+-(\d+)$/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      return max;
    }

    function openBrowse(prev) {
      B.prev = prev || 'setup';
      B.level = S.level;
      B.lesson = 1;
      renderBrowseLevelTabs();
      renderBrowseLessonTabs();
      renderBrowseWords();
      showScreen('screen-browse');
    }

    function renderBrowseLevelTabs() {
      document.querySelectorAll('#browse-level-tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.level === B.level);
      });
    }

    function renderBrowseLessonTabs() {
      const container = document.getElementById('browse-lesson-tabs');
      container.innerHTML = '';
      const count = getLessonCount(B.level);
      for (let i = 1; i <= count; i++) {
        const btn = document.createElement('button');
        btn.className = 'browse-lesson-tab' + (i === B.lesson ? ' active' : '');
        btn.textContent = `L${i}`;
        btn.addEventListener('click', () => {
          B.lesson = i;
          container.querySelectorAll('.browse-lesson-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          renderBrowseWords();
        });
        container.appendChild(btn);
      }
    }

    function renderBrowseWords() {
      const grid = document.getElementById('browse-word-grid');
      grid.innerHTML = '';
      const data = DATA[B.level];
      if (!data) { grid.innerHTML = `<div class="browse-empty">Loading…</div>`; return; }
      const lessonKey = `${B.level}-${B.lesson}`;
      const words = data[lessonKey] || [];
      if (words.length === 0) {
        grid.innerHTML = `<div class="browse-empty">No words for ${lessonKey}</div>`;
        return;
      }
      words.forEach(w => {
        const card = document.createElement('div');
        card.className = 'browse-word-card';
        const wordObj = { ...w, lessonKey, lessonNum: B.lesson, level: B.level, key: w.character };
        card.innerHTML = `
      <div class="browse-word-char">${esc(w.character)}</div>
      <div style="display:flex;align-items:center;gap:4px">
        <div class="browse-word-pinyin">${esc(w.pinyin)}</div>
      </div>
      <div class="browse-word-eng">${esc(w.english)}</div>`;
        card.querySelector('.browse-word-pinyin').after(makeSpeakBtn(w.character, w.pinyin));
        card.addEventListener('click', () => showCharModal(wordObj));
        grid.appendChild(card);
      });
    }

    bindTabs('browse-level-tabs', tab => {
      B.level = tab.dataset.level;
      B.lesson = 1;
      renderBrowseLessonTabs();
      renderBrowseWords();
    });

    document.getElementById('browse-back-btn').addEventListener('click', () => {
      if (B.prev === 'stats') showScreen('screen-stats');
      else initSetup();
    });

    document.getElementById('setup-browse-btn').addEventListener('click', async () => {
      await dataPromise;
      openBrowse('setup');
    });

    // ═══════════════════════════════════════════════════════════════
    // SPELLING MODE
    // ═══════════════════════════════════════════════════════════════
    const SP = { level: 'p1', questions: [], currentIdx: 0, testName: '' };

    function spellingTests() {
      try { return JSON.parse(localStorage.getItem('spelling-tests') || '[]'); } catch { return []; }
    }
    function saveSpellingTests(arr) { localStorage.setItem('spelling-tests', JSON.stringify(arr)); }

    function showSpellingSubview(id) {
      ['sp-list-view', 'sp-create-view', 'sp-test-view', 'sp-results-view'].forEach(sid => {
        document.getElementById(sid).classList.toggle('sp-active', sid === id);
      });
    }

    function showSpellingScreen() {
      renderSpellingList();
      showSpellingSubview('sp-list-view');
      showScreen('screen-spelling');
    }

    function renderSpellingList() {
      const tests = spellingTests();
      const container = document.getElementById('sp-test-list');
      if (tests.length === 0) {
        container.innerHTML = '<div class="sp-empty">No tests yet. Tap ＋ New to create one.</div>';
        return;
      }
      container.innerHTML = '';
      tests.forEach(t => {
        const card = document.createElement('div');
        card.className = 'sp-test-card';
        const wc = (t.writingWords || []).length;
        const pc = (t.pinyinWords || []).length;
        card.innerHTML = `
      <div class="sp-test-card-info" data-id="${esc(t.id)}">
        <div class="sp-test-name">${esc(t.name)}</div>
        <div class="sp-test-meta">${esc(t.level.toUpperCase())} · ${wc} writing · ${pc} pinyin</div>
      </div>
      <button class="btn btn-danger btn-sm" data-del="${esc(t.id)}" style="flex-shrink:0">✕</button>`;
        card.querySelector('.sp-test-card-info').addEventListener('click', () => startSpellingTest(t.id));
        card.querySelector('[data-del]').addEventListener('click', e => { e.stopPropagation(); deleteSpellingTest(t.id); });
        container.appendChild(card);
      });
    }

    function deleteSpellingTest(id) {
      saveSpellingTests(spellingTests().filter(t => t.id !== id));
      renderSpellingList();
    }

    function showSpellingCreate() {
      SP.level = 'p1';
      document.getElementById('sp-name-input').value = '';
      document.getElementById('sp-pinyin-input').value = '';
      document.getElementById('sp-writing-input').value = '';
      document.querySelectorAll('#sp-level-tabs .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.level === 'p1');
      });
      showSpellingSubview('sp-create-view');
    }

    function saveSpellingTest() {
      const name = document.getElementById('sp-name-input').value.trim();
      if (!name) { showToast('Please enter a test name'); return; }
      const writingWords = document.getElementById('sp-writing-input').value.split(/[,，]/).map(w => w.trim()).filter(Boolean);
      const pinyinWords = document.getElementById('sp-pinyin-input').value.split(/[,，]/).map(w => w.trim()).filter(Boolean);
      if (writingWords.length === 0 && pinyinWords.length === 0) { showToast('Add at least one word to test'); return; }
      const tests = spellingTests();
      tests.push({ id: Date.now().toString(), level: SP.level, name, writingWords, pinyinWords });
      saveSpellingTests(tests);
      renderSpellingList();
      showSpellingSubview('sp-list-view');
      showToast('Test saved!');
    }

    function findSpellingEntry(level, word) {
      const data = DATA[level];
      if (!data) return null;
      for (const lk of Object.keys(data)) {
        for (const entry of data[lk]) {
          if (entry.character === word) return { entry, pinyin: entry.pinyin };
        }
      }
      // Search inside compound words array
      for (const lk of Object.keys(data)) {
        for (const entry of data[lk]) {
          for (const w of (entry.words || [])) {
            if (w === word || w.startsWith(word + ' ') || w.startsWith(word + '(')) {
              const m = w.match(/\(([^,)]+)/);
              return { entry, pinyin: m ? m[1].trim() : entry.pinyin };
            }
          }
        }
      }
      return null;
    }

    function parseSentence(str) {
      if (!str) return { chinese: '', english: '' };
      const idx = str.indexOf('(');
      if (idx === -1) return { chinese: str.trim(), english: '' };
      return { chinese: str.slice(0, idx).trim(), english: str.slice(idx + 1).replace(/\)$/, '').trim() };
    }

    function buildSpellingQuestions(test) {
      const questions = [];
      const skipped = [];
      for (const word of (test.writingWords || [])) {
        const found = findSpellingEntry(test.level, word);
        if (!found) { skipped.push(word); continue; }
        const { chinese } = parseSentence(found.entry.sentence);
        questions.push({ type: 'writing', word, pinyin: found.pinyin, chinese });
      }
      for (const word of (test.pinyinWords || [])) {
        const found = findSpellingEntry(test.level, word);
        if (!found) { skipped.push(word); continue; }
        const { chinese } = parseSentence(found.entry.sentence);
        questions.push({ type: 'pinyin', word, pinyin: found.pinyin, chinese });
      }
      if (skipped.length) setTimeout(() => showToast('Not found, skipped: ' + skipped.join(', ')), 300);
      return questions;
    }

    function startSpellingTest(id) {
      dataPromise.then(() => {
        const test = spellingTests().find(t => t.id === id);
        if (!test) return;
        SP.questions = buildSpellingQuestions(test);
        SP.currentIdx = 0;
        SP.testName = test.name;
        if (SP.questions.length === 0) { showToast('No valid words found for this test'); return; }
        document.getElementById('sp-test-title').textContent = test.name;
        showSpellingSubview('sp-test-view');
        renderSpellingQuestion(0);
      });
    }

    function renderSpellingQuestion(idx) {
      const q = SP.questions[idx];
      const total = SP.questions.length;
      document.getElementById('sp-progress-label').textContent = `Question ${idx + 1} of ${total}`;
      document.getElementById('sp-next-btn').textContent = idx < total - 1 ? 'Next →' : 'See Answers';

      const card = document.getElementById('sp-question-card');
      card.innerHTML = '';

      const numDiv = document.createElement('div');
      numDiv.className = 'sp-q-num';
      numDiv.textContent = q.type === 'writing'
        ? `Q${idx + 1}. — Write the character`
        : `Q${idx + 1}. — Write the pinyin`;
      card.appendChild(numDiv);

      if (q.type === 'writing') {
        const audioRow = document.createElement('div');
        audioRow.className = 'sp-q-audio-row';
        const speakerBtn = document.createElement('button');
        speakerBtn.className = 'sp-q-speaker';
        speakerBtn.innerHTML = '🔊';
        speakerBtn.title = 'Listen again';
        speakerBtn.addEventListener('click', () => speakChinese(q.pinyin || q.word));
        const hint = document.createElement('div');
        hint.className = 'sp-q-hint';
        hint.textContent = 'Tap to hear again';
        audioRow.appendChild(speakerBtn);
        audioRow.appendChild(hint);
        card.appendChild(audioRow);

        // Only show the sentence when the tested word actually appears in it —
        // otherwise the un-blanked sentence could display the answer characters.
        if (q.chinese && q.chinese.includes(q.word)) {
          const sentDiv = document.createElement('div');
          sentDiv.className = 'sp-q-sentence';
          const blankHtml = `<span class="sp-blank">___</span><span class="sp-blank" style="font-size:0.85rem"> (${esc(q.pinyin)})</span>`;
          sentDiv.innerHTML = esc(q.chinese).split(q.word).join(blankHtml);
          card.appendChild(sentDiv);
        }
        speakChinese(q.pinyin || q.word);

      } else {
        if (q.chinese && q.chinese.includes(q.word)) {
          const sentDiv = document.createElement('div');
          sentDiv.className = 'sp-q-sentence';
          const underlineHtml = `<span class="sp-underline">${esc(q.word)}</span><span class="sp-bracket"> [ ]</span>`;
          sentDiv.innerHTML = esc(q.chinese).split(q.word).join(underlineHtml);
          card.appendChild(sentDiv);
        } else {
          // No usable sentence — show the word itself so the question still has content
          const wordDiv = document.createElement('div');
          wordDiv.className = 'sp-q-sentence';
          wordDiv.innerHTML = `<span class="sp-underline">${esc(q.word)}</span><span class="sp-bracket"> [ ]</span>`;
          card.appendChild(wordDiv);
        }
        const hint = document.createElement('div');
        hint.className = 'sp-q-hint';
        hint.textContent = 'Write the pinyin for the underlined word';
        card.appendChild(hint);
      }
    }

    function nextSpellingQuestion() {
      if (SP.currentIdx < SP.questions.length - 1) {
        SP.currentIdx++;
        renderSpellingQuestion(SP.currentIdx);
      } else {
        showSpellingResults();
      }
    }

    function showSpellingResults() {
      const container = document.getElementById('sp-results-content');
      container.innerHTML = '';
      const writingQs = SP.questions.filter(q => q.type === 'writing');
      const pinyinQs = SP.questions.filter(q => q.type === 'pinyin');

      function buildSection(title, qs, startNum) {
        if (!qs.length) return;
        const sec = document.createElement('div');
        sec.className = 'sp-results-section';
        const hdr = document.createElement('div');
        hdr.className = 'section-label';
        hdr.textContent = title;
        sec.appendChild(hdr);
        qs.forEach((q, i) => {
          const item = document.createElement('div');
          item.className = 'sp-answer-item';
          const top = document.createElement('div');
          top.className = 'sp-ans-top';
          top.innerHTML = `
        <span class="sp-ans-qnum">Q${startNum + i}.</span>
        <span class="sp-ans-word">${esc(q.word)}</span>
        <span class="sp-ans-arrow">→</span>
        <span class="sp-ans-pinyin">${esc(q.pinyin)}</span>`;
          item.appendChild(top);
          if (q.chinese) {
            const sent = document.createElement('div');
            sent.className = 'sp-ans-sentence';
            sent.textContent = q.chinese;
            item.appendChild(sent);
          }
          sec.appendChild(item);
        });
        container.appendChild(sec);
      }

      buildSection('Writing Answers', writingQs, 1);
      buildSection('Pinyin Answers', pinyinQs, writingQs.length + 1);
      showSpellingSubview('sp-results-view');
    }

    // Spelling event listeners
    document.getElementById('setup-spelling-btn').addEventListener('click', () => showSpellingScreen());
    document.getElementById('sp-back-to-setup').addEventListener('click', () => initSetup());
    document.getElementById('sp-new-btn').addEventListener('click', () => showSpellingCreate());
    document.getElementById('sp-form-back').addEventListener('click', () => showSpellingSubview('sp-list-view'));
    document.getElementById('sp-save-btn').addEventListener('click', () => saveSpellingTest());
    document.getElementById('sp-next-btn').addEventListener('click', () => nextSpellingQuestion());
    document.getElementById('sp-test-end-btn').addEventListener('click', () => showSpellingSubview('sp-list-view'));
    document.getElementById('sp-results-back-btn').addEventListener('click', () => showSpellingSubview('sp-list-view'));
    bindTabs('sp-level-tabs', tab => { SP.level = tab.dataset.level; });

    // ═══════════════════════════════════════════════════════════════
    // PUZZLE MODE
    // ═══════════════════════════════════════════════════════════════
    const P = {};
    const PUZ_DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];

    function extractPuzzleWords(pool) {
      const seen = new Set();
      const out = [];
      for (const w of pool) {
        for (const wordStr of (w.words || [])) {
          const m = wordStr.match(/^([一-鿿]+)/);
          if (!m) continue;
          const chars = m[1];
          if (chars.length < 2 || chars.length > 3 || seen.has(chars)) continue;
          const pm = wordStr.match(/\(([^,]+),\s*(.+?)\)/);
          seen.add(chars);
          out.push({ chars, pinyin: pm ? pm[1] : '', english: pm ? pm[2] : '', found: false });
        }
      }
      return shuffle(out).slice(0, 8);
    }

    function generatePuzGrid(words, pool) {
      const R = 6, C = 6;
      const grid = Array(R * C).fill(null);
      const placed = [];
      for (const word of words) {
        const arr = [...word.chars];
        let success = false;
        for (const [dr, dc] of shuffle([...PUZ_DIRS])) {
          const candidates = [];
          for (let r = 0; r < R; r++)
            for (let c = 0; c < C; c++) {
              const er = r + dr * (arr.length - 1), ec = c + dc * (arr.length - 1);
              if (er >= 0 && er < R && ec >= 0 && ec < C) candidates.push([r, c]);
            }
          for (const [sr, sc] of shuffle(candidates)) {
            let ok = true;
            for (let i = 0; i < arr.length; i++) {
              const idx = (sr + dr * i) * C + (sc + dc * i);
              if (grid[idx] !== null && grid[idx] !== arr[i]) { ok = false; break; }
            }
            if (ok) {
              const cells = [];
              for (let i = 0; i < arr.length; i++) {
                const idx = (sr + dr * i) * C + (sc + dc * i);
                grid[idx] = arr[i];
                cells.push({ row: sr + dr * i, col: sc + dc * i });
              }
              placed.push({ word, cells });
              success = true; break;
            }
          }
          if (success) break;
        }
      }
      const chars = pool.map(w => w.character);
      for (let i = 0; i < R * C; i++)
        if (grid[i] === null) grid[i] = chars[Math.floor(Math.random() * chars.length)];
      return { grid, placed };
    }

    function startPuzzle() {
      const pool = getWordPool(S.level, S.lessonTest ? 'all' : S.lessons);
      const candidates = extractPuzzleWords(pool);
      const { grid, placed } = generatePuzGrid(candidates, pool);
      if (placed.length < 2) { showToast('Not enough words — select more lessons'); return; }

      P.grid = grid;
      P.words = placed.map(p => p.word);
      P.foundCells = new Set();
      P.selecting = false;
      P.selCells = [];
      P.selDir = null;

      const gridEl = document.getElementById('puz-grid');
      gridEl.innerHTML = '';
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          const cell = document.createElement('div');
          cell.className = 'puzzle-cell';
          cell.dataset.row = r; cell.dataset.col = c;
          cell.textContent = grid[r * 6 + c];
          gridEl.appendChild(cell);
        }
      }

      const listEl = document.getElementById('puz-wordlist');
      listEl.innerHTML = '';
      for (const w of P.words) {
        const chip = document.createElement('div');
        chip.className = 'puz-chip';
        chip.dataset.word = w.chars;
        chip.innerHTML = `<span class="puz-chip-chars">${esc(w.pinyin)}</span><span class="puz-chip-hint">${esc(w.english)}</span>`;
        listEl.appendChild(chip);
      }

      document.getElementById('puz-complete').style.display = 'none';
      showScreen('screen-puzzle');
    }

    // Puzzle interaction — bound ONCE on the persistent #puz-grid element and
    // window (startPuzzle only replaces the grid's innerHTML, never the element,
    // so per-start binding would stack duplicate listeners).
    {
      const el = document.getElementById('puz-grid');
      let audioInitialized = false;

      function initAudio() {
        if (audioInitialized) return;
        audioInitialized = true;
        const silent = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
        silent.play().catch(() => {});
      }

      function getCellAt(x, y) {
        const target = document.elementFromPoint(x, y);
        if (!target) return null;
        const c = target.closest ? target.closest('.puzzle-cell') : null;
        return c ? { row: +c.dataset.row, col: +c.dataset.col, el: c } : null;
      }

      function startSel(x, y) {
        document.querySelectorAll('.puzzle-cell.puz-selecting').forEach(c => c.classList.remove('puz-selecting'));
        P.selCells = []; P.selDir = null; P.selecting = true;
        const cell = getCellAt(x, y);
        if (cell) { P.selCells.push(cell); cell.el.classList.add('puz-selecting'); }
      }

      function moveSel(x, y) {
        if (!P.selecting || !P.selCells.length) return;
        const cell = getCellAt(x, y);
        if (!cell) return;
        const last = P.selCells[P.selCells.length - 1];
        if (cell.row === last.row && cell.col === last.col) return;
        if (!P.selDir) {
          const dr = cell.row - P.selCells[0].row, dc = cell.col - P.selCells[0].col;
          if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr || dc)) {
            P.selDir = { dr: Math.sign(dr), dc: Math.sign(dc) };
            P.selCells.push(cell); cell.el.classList.add('puz-selecting');
          }
        } else {
          const exp = { row: last.row + P.selDir.dr, col: last.col + P.selDir.dc };
          if (cell.row === exp.row && cell.col === exp.col) {
            P.selCells.push(cell); cell.el.classList.add('puz-selecting');
          }
        }
      }

      function endSel() {
        P.selecting = false;
        if (P.selCells.length < 2) {
          P.selCells.forEach(c => c.el.classList.remove('puz-selecting'));
          P.selCells = []; return;
        }
        evaluatePuzSel();
      }

      el.addEventListener('touchstart', e => { e.preventDefault(); initAudio(); startSel(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
      el.addEventListener('touchmove',  e => { e.preventDefault(); moveSel(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
      el.addEventListener('touchend',   e => { e.preventDefault(); endSel(); }, { passive: false });
      el.addEventListener('mousedown',  e => { initAudio(); startSel(e.clientX, e.clientY); });
      window.addEventListener('mousemove', e => { if (P.selecting) moveSel(e.clientX, e.clientY); });
      window.addEventListener('mouseup',   () => { if (P.selecting) endSel(); });
    }

    function evaluatePuzSel() {
      const chars = P.selCells.map(c => P.grid[c.row * 6 + c.col]).join('');
      const charsRev = [...chars].reverse().join('');
      const matched = P.words.find(w => !w.found && (w.chars === chars || w.chars === charsRev));
      if (matched) {
        P.selCells.forEach(c => {
          c.el.classList.remove('puz-selecting');
          c.el.classList.add('puz-found');
          P.foundCells.add(`${c.row}-${c.col}`);
        });
        matched.found = true;
        const chip = document.querySelector(`.puz-chip[data-word="${matched.chars}"]`);
        if (chip) chip.classList.add('found');
        speakChinese(matched.pinyin);
        if (P.words.every(w => w.found))
          setTimeout(() => { document.getElementById('puz-complete').style.display = 'flex'; }, 400);
      } else {
        P.selCells.forEach(c => {
          c.el.classList.remove('puz-selecting');
          if (!P.foundCells.has(`${c.row}-${c.col}`)) {
            c.el.classList.add('puz-wrong');
            setTimeout(() => c.el.classList.remove('puz-wrong'), 750);
          }
        });
        speakChinese(chars);
      }
      P.selCells = []; P.selDir = null;
    }

    document.getElementById('puz-back').addEventListener('click', () => showScreen('screen-setup'));
    document.getElementById('puz-again-btn').addEventListener('click', startPuzzle);
    document.getElementById('puz-exit-btn').addEventListener('click', () => showScreen('screen-setup'));

    // ═══════════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════════
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSetup);
    } else {
      initSetup();
    }
