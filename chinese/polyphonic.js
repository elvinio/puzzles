/* polyphonic.js — logic for polyphonic.html.
   Data source: data/chinese-polyphonic.json — a flat array of
   { character, readings: [{ pinyin, meaning, example }] }. */

function speak(text) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'zh-CN';
  utt.rate = 0.8;
  speechSynthesis.speak(utt);
}

function buildCard(entry) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.search = [
    entry.character,
    ...entry.readings.map(r => `${r.pinyin} ${r.meaning} ${r.example}`),
  ].join(' ').toLowerCase();

  const top = document.createElement('div');
  top.className = 'card-top';

  const charEl = document.createElement('div');
  charEl.className = 'poly-char';
  charEl.textContent = entry.character;
  charEl.title = 'Play sound';
  charEl.addEventListener('click', () => speak(entry.character));
  top.appendChild(charEl);

  const countEl = document.createElement('div');
  countEl.className = 'poly-count';
  countEl.textContent = `${entry.readings.length} readings`;
  top.appendChild(countEl);

  card.appendChild(top);
  card.appendChild(Object.assign(document.createElement('div'), { className: 'divider' }));

  const list = document.createElement('div');
  list.className = 'reading-list';

  entry.readings.forEach(r => {
    const row = document.createElement('div');
    row.className = 'reading-row';

    const head = document.createElement('div');
    head.className = 'reading-head';

    const pinyinEl = document.createElement('span');
    pinyinEl.className = 'reading-pinyin';
    pinyinEl.textContent = r.pinyin;
    head.appendChild(pinyinEl);

    const meaningEl = document.createElement('span');
    meaningEl.className = 'reading-meaning';
    meaningEl.textContent = r.meaning;
    head.appendChild(meaningEl);

    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-btn';
    speakBtn.textContent = '🔊';
    speakBtn.title = 'Play example sentence';
    speakBtn.addEventListener('click', () => speak(r.example));
    head.appendChild(speakBtn);

    row.appendChild(head);

    if (r.example) {
      const exampleEl = document.createElement('div');
      exampleEl.className = 'reading-example';
      exampleEl.textContent = r.example;
      exampleEl.title = 'Play example sentence';
      exampleEl.addEventListener('click', () => speak(r.example));
      row.appendChild(exampleEl);
    }

    list.appendChild(row);
  });

  card.appendChild(list);
  return card;
}

const main = document.getElementById('main');
const searchInput = document.getElementById('search');
const countNote = document.getElementById('count-note');

fetch('data/chinese-polyphonic.json')
  .then(r => r.json())
  .then(data => {
    const grid = document.createElement('div');
    grid.className = 'grid';
    data.forEach(entry => grid.appendChild(buildCard(entry)));
    main.appendChild(grid);
    countNote.textContent = `${data.length} characters`;
  })
  .catch(() => {
    main.innerHTML = '<div class="empty-msg">Could not load polyphonic character data.</div>';
  });

function applyFilters() {
  const q = searchInput.value.trim().toLowerCase();
  document.querySelectorAll('.card').forEach(card => {
    card.classList.toggle('hidden', !(!q || card.dataset.search.includes(q)));
  });
}

searchInput.addEventListener('input', applyFilters);
