/* chinese-cards.js — logic for chinese-cards.html.  Shared helpers (esc) live in common.js, loaded first. */
'use strict';

const DATA = { p1: null, p2: null };
const dataPromise = Promise.all([
  fetch('data/chinese-p1.json').then(r => r.json()).catch(() => null),
  fetch('data/chinese-p2.json').then(r => r.json()).catch(() => null),
]).then(([p1, p2]) => { DATA.p1 = p1; DATA.p2 = p2; });

const S = { level: 'p1', lesson: 'all' };

// ── Lesson tabs ──
const LESSONS = Array.from({length: 19}, (_, i) => i + 1);

function buildLessonTabs() {
  const container = document.getElementById('lesson-tabs');
  container.innerHTML = '';
  const allBtn = document.createElement('button');
  allBtn.className = 'tab active';
  allBtn.textContent = 'All';
  allBtn.dataset.lesson = 'all';
  allBtn.addEventListener('click', () => selectLesson('all'));
  container.appendChild(allBtn);

  LESSONS.forEach(n => {
    const key = `${S.level}-${n}`;
    if (!DATA[S.level] || !DATA[S.level][key]) return;
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.textContent = `L${n}`;
    btn.dataset.lesson = String(n);
    btn.addEventListener('click', () => selectLesson(String(n)));
    container.appendChild(btn);
  });
}

function selectLesson(lesson) {
  S.lesson = lesson;
  document.querySelectorAll('#lesson-tabs .tab').forEach(t => {
    t.classList.toggle('active', t.dataset.lesson === lesson);
  });
  renderGrid();
}

// ── Level tabs ──
document.getElementById('level-tabs').querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('#level-tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    S.level = tab.dataset.level;
    S.lesson = 'all';
    buildLessonTabs();
    renderGrid();
  });
});

// ── Grid ──
function getWords() {
  const data = DATA[S.level];
  if (!data) return [];
  const words = [];
  LESSONS.forEach(n => {
    const key = `${S.level}-${n}`;
    (data[key] || []).forEach(entry => {
      if (S.lesson === 'all' || S.lesson === String(n)) {
        words.push({ ...entry, lessonNum: n, lessonKey: key });
      }
    });
  });
  return words;
}

function renderGrid() {
  const words = getWords();
  const grid = document.getElementById('char-grid');
  const count = document.getElementById('word-count');

  count.textContent = words.length ? `${words.length} character${words.length !== 1 ? 's' : ''}` : '';

  if (words.length === 0) {
    grid.innerHTML = '<div class="empty">No characters found.</div>';
    return;
  }

  grid.innerHTML = '';
  words.forEach(w => {
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-card-big">${w.character}</div>
      <div class="char-card-pinyin">${w.pinyin}</div>
      <div class="char-card-en">${esc(w.english)}</div>
      <div class="char-card-lesson">L${w.lessonNum}</div>`;
    card.addEventListener('click', () => showCharModal(w));
    grid.appendChild(card);
  });
}

// ── Character modal ──
function showCharModal(word) {
  document.getElementById('cm-char').textContent   = word.character;
  document.getElementById('cm-pinyin').textContent = word.pinyin;
  document.getElementById('cm-eng').textContent    = word.english;
  document.getElementById('cm-def-en').textContent = word['definition-english'] || '';
  document.getElementById('cm-def-zh').textContent = word['definition-chinese'] || '';

  const wordsEl = document.getElementById('cm-words');
  wordsEl.innerHTML = '';
  (word.words || []).forEach(w => {
    const chip = document.createElement('span');
    chip.className = 'char-modal-chip zh';
    chip.textContent = w;
    wordsEl.appendChild(chip);
  });

  const sameEl = document.getElementById('cm-same');
  sameEl.innerHTML = '';
  (word['same-sounding-character'] || []).forEach(s => {
    const chip = document.createElement('span');
    chip.className = 'char-modal-chip';
    chip.textContent = s;
    sameEl.appendChild(chip);
  });

  document.getElementById('char-modal').classList.add('open');
}

document.getElementById('char-modal').addEventListener('click', e => {
  if (e.target.id === 'char-modal') document.getElementById('char-modal').classList.remove('open');
});
document.getElementById('cm-close').addEventListener('click', () => {
  document.getElementById('char-modal').classList.remove('open');
});


// ── Init ──
dataPromise.then(() => {
  buildLessonTabs();
  renderGrid();
});
