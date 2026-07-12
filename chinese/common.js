/* common.js — shared JavaScript for the Chinese app pages (chinese/*.html).
   Classic script: defines page-global helpers, so it MUST load before each
   page's own <page>.js. Reusable across current and future Chinese pages.

   Exports (as globals):
     • Pinyin toolkit — tone-mark tables + conversion/distractor helpers
       (stripTones, addToneMark, toneMarkIndex, extractInitial/Final,
        getToneVariants, getSimilarFromPool, synthesizeConfusables,
        TONED_TO_BASE, BASE_TO_TONES, TONE_NUMBER, INITIALS, SIMILAR_*,
        VALID_SYLLABLES).
     • esc(s) — HTML-escape a string for safe innerHTML interpolation.
   Currently consumed by chinese.js and chinese-cards.js. */
'use strict';

// ═══════════════════════════════════════════════════════════════
// PINYIN UTILITIES
// ═══════════════════════════════════════════════════════════════
const TONED_TO_BASE = {
  'ā': 'a', 'á': 'a', 'ǎ': 'a', 'à': 'a',
  'ē': 'e', 'é': 'e', 'ě': 'e', 'è': 'e',
  'ī': 'i', 'í': 'i', 'ǐ': 'i', 'ì': 'i',
  'ō': 'o', 'ó': 'o', 'ǒ': 'o', 'ò': 'o',
  'ū': 'u', 'ú': 'u', 'ǔ': 'u', 'ù': 'u',
  'ǖ': 'ü', 'ǘ': 'ü', 'ǚ': 'ü', 'ǜ': 'ü',
};
const BASE_TO_TONES = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};
const TONE_NUMBER = {
  'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4,
  'ē': 1, 'é': 2, 'ě': 3, 'è': 4,
  'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4,
  'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4,
  'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4,
  'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4,
};
// Phonetically similar finals for distractor generation
const SIMILAR_FINALS = {
  an: ['ang', 'en', 'uan'], ang: ['an', 'eng', 'uang'],
  en: ['an', 'eng', 'in'], eng: ['en', 'ang', 'ing'],
  in: ['ing', 'en', 'un'], ing: ['in', 'eng'],
  un: ['ong', 'en', 'in', 'uan'], ong: ['un', 'eng'],
  ian: ['iang', 'an', 'uan'], iang: ['ian', 'ang'],
  uan: ['an', 'uang', 'un', 'ian'], uang: ['uan', 'ang'],
  ie: ['e', 'ue'], ue: ['ie', 'e'],
  ao: ['ou', 'iao'], ou: ['ao', 'iou'],
  iao: ['ao', 'iou'], iou: ['iao', 'ou'],
  ai: ['ei', 'uai'], ei: ['ai'],
  uai: ['ai', 'ui'], ui: ['ei'],
  i: ['ü', 'u'], u: ['ü', 'i'],
  ü: ['u', 'i'],
};
// Phonetically similar initials for distractor generation
const SIMILAR_INITIALS = {
  b: ['p'], p: ['b'], d: ['t'], t: ['d'], g: ['k'], k: ['g'],
  z: ['zh', 'c'], c: ['ch', 'z'], zh: ['z', 'ch'], ch: ['c', 'zh'],
  s: ['sh'], sh: ['s'],
  j: ['q', 'x', 'z'], q: ['j', 'c'], x: ['s', 'sh'],
  n: ['l'], l: ['n'], f: ['h'], h: ['f'], r: ['l'],
};
const INITIALS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
// Every base syllable (tone-free, ü written as v) with recorded audio — the canonical
// set of valid Mandarin syllables, sourced from pinyin_audio/*.mp3 filenames.
const VALID_SYLLABLES = new Set([
  'a', 'ai', 'an', 'ang', 'ao', 'ba', 'bai', 'ban', 'bang', 'bao', 'bei', 'ben', 'beng', 'bi', 'bian', 'biao',
  'bie', 'bin', 'bing', 'bo', 'ca', 'cai', 'can', 'cang', 'cao', 'ce', 'cen', 'ceng', 'cha', 'chai', 'chan',
  'chang', 'chao', 'che', 'chen', 'cheng', 'chi', 'chong', 'chou', 'chu', 'chua', 'chuai', 'chuan', 'chuang',
  'chui', 'chun', 'chuo', 'ci', 'cong', 'cou', 'cu', 'cuan', 'cui', 'cun', 'cuo', 'da', 'dai', 'dan', 'dang',
  'dao', 'de', 'dei', 'den', 'deng', 'di', 'dian', 'diao', 'die', 'ding', 'diu', 'dong', 'dou', 'duan', 'dui',
  'dun', 'duo', 'e', 'en', 'eng', 'er', 'fa', 'fan', 'fang', 'fei', 'fen', 'feng', 'fo', 'fou', 'ga', 'gai',
  'gan', 'gang', 'gao', 'ge', 'gei', 'gen', 'geng', 'gong', 'gou', 'gua', 'guai', 'guan', 'guang', 'gui', 'gun',
  'guo', 'ha', 'hai', 'han', 'hang', 'hao', 'he', 'hei', 'hen', 'heng', 'hong', 'hou', 'hua', 'huai', 'huan',
  'huang', 'hui', 'hun', 'huo', 'ji', 'jia', 'jian', 'jiao', 'jie', 'jin', 'jing', 'jiong', 'jiu', 'ju', 'juan',
  'jue', 'jun', 'ka', 'kai', 'kan', 'kang', 'kao', 'ke', 'ken', 'keng', 'kong', 'kou', 'kua', 'kuai', 'kuan',
  'kuang', 'kui', 'kun', 'kuo', 'la', 'lai', 'lan', 'lang', 'lao', 'le', 'lei', 'leng', 'li', 'lian', 'liao',
  'lie', 'lin', 'ling', 'liu', 'long', 'lou', 'luan', 'lun', 'luo', 'lv', 'lve', 'ma', 'mai', 'man', 'mang',
  'mao', 'me', 'mei', 'men', 'meng', 'mi', 'mian', 'miao', 'mie', 'min', 'ming', 'miu', 'mo', 'mou', 'na', 'nai',
  'nan', 'nang', 'nao', 'ne', 'nei', 'nen', 'neng', 'ni', 'nian', 'niao', 'nie', 'nin', 'ning', 'niu', 'nong',
  'nou', 'nuan', 'nv', 'nve', 'o', 'ou', 'pa', 'pai', 'pan', 'pang', 'pao', 'pei', 'pen', 'peng', 'pi', 'pian',
  'piao', 'pie', 'pin', 'ping', 'po', 'pou', 'qi', 'qia', 'qian', 'qiao', 'qie', 'qin', 'qing', 'qiong', 'qiu',
  'qu', 'quan', 'que', 'qun', 'ran', 'rang', 'rao', 're', 'ren', 'reng', 'ri', 'rong', 'rou', 'ru', 'rua', 'ruan',
  'rui', 'run', 'ruo', 'sa', 'sai', 'san', 'sang', 'sao', 'se', 'sen', 'seng', 'sha', 'shai', 'shan', 'shang',
  'shao', 'she', 'shei', 'shen', 'sheng', 'shi', 'shou', 'shu', 'shua', 'shuai', 'shuan', 'shuang', 'shui',
  'shun', 'shuo', 'si', 'song', 'sou', 'su', 'suan', 'sui', 'sun', 'suo', 'ta', 'tai', 'tan', 'tang', 'tao', 'te',
  'teng', 'ti', 'tian', 'tiao', 'tie', 'ting', 'tong', 'tou', 'tuan', 'tui', 'tun', 'tuo', 'wa', 'wai', 'wan',
  'wang', 'wei', 'wen', 'weng', 'wo', 'wu', 'xi', 'xia', 'xian', 'xiao', 'xie', 'xin', 'xing', 'xiong', 'xiu',
  'xu', 'xuan', 'xue', 'xun', 'ya', 'yan', 'yang', 'yao', 'ye', 'yin', 'ying', 'yong', 'you', 'yu', 'yuan', 'yue',
  'yun', 'za', 'zai', 'zan', 'zang', 'zao', 'ze', 'zei', 'zen', 'zeng', 'zha', 'zhai', 'zhan', 'zhang', 'zhao',
  'zhe', 'zhei', 'zhen', 'zheng', 'zhi', 'zhong', 'zhou', 'zhu', 'zhua', 'zhuai', 'zhuan', 'zhuang', 'zhui',
  'zhun', 'zhuo', 'zi', 'zong', 'zou', 'zu', 'zuan', 'zui', 'zun', 'zuo',
]);

function stripTones(p) {
  return [...(p || '')].map(c => TONED_TO_BASE[c] || c).join('');
}

function getToneVariants(pinyin) {
  // Find first toned character and generate the other 3 tones
  for (let i = 0; i < pinyin.length; i++) {
    const base = TONED_TO_BASE[pinyin[i]];
    if (base) {
      return BASE_TO_TONES[base]
        .map(tc => pinyin.slice(0, i) + tc + pinyin.slice(i + 1))
        .filter(v => v !== pinyin);
    }
  }
  // Neutral-tone word — add tones to first vowel found
  for (const v of ['a', 'e', 'o', 'i', 'u', 'ü']) {
    const idx = pinyin.indexOf(v);
    if (idx >= 0 && BASE_TO_TONES[v]) {
      return BASE_TO_TONES[v].map(tc => pinyin.slice(0, idx) + tc + pinyin.slice(idx + 1));
    }
  }
  return [];
}

function extractFinal(pinyinBase) {
  for (const init of INITIALS) {
    if (pinyinBase.startsWith(init)) return pinyinBase.slice(init.length);
  }
  return pinyinBase;
}

function getSimilarFromPool(pinyin, pool, exclude) {
  const base = stripTones(pinyin);
  const final = extractFinal(base);
  const similar = SIMILAR_FINALS[final] || [];
  return pool
    .map(w => w.pinyin)
    .filter(p => {
      if (exclude.has(p)) return false;
      const pFinal = extractFinal(stripTones(p));
      return similar.includes(pFinal);
    });
}

function extractInitial(pinyinBase) {
  return INITIALS.find(init => pinyinBase.startsWith(init)) || '';
}

// Standard Hanyu Pinyin tone-mark placement: a > o > e > last of i/u/ü.
function toneMarkIndex(base) {
  if (base.includes('a')) return base.indexOf('a');
  if (base.includes('o')) return base.indexOf('o');
  if (base.includes('e')) return base.indexOf('e');
  for (let i = base.length - 1; i >= 0; i--) {
    if (base[i] === 'i' || base[i] === 'u' || base[i] === 'ü') return i;
  }
  return -1;
}

function addToneMark(base, toneNum) {
  const idx = toneMarkIndex(base);
  if (idx < 0) return base;
  const tones = BASE_TO_TONES[base[idx]];
  if (!tones) return base;
  return base.slice(0, idx) + tones[toneNum - 1] + base.slice(idx + 1);
}

// Synthesizes phonetically-confusable, real Mandarin syllables for a target pinyin
// by swapping the initial, swapping the final, or swapping the tone — independent
// of what happens to be in the current lesson pool.
function synthesizeConfusables(pinyin) {
  const base = stripTones(pinyin);
  const initial = extractInitial(base);
  const final = base.slice(initial.length);
  const toneChar = [...pinyin].find(c => TONE_NUMBER[c]);
  const toneNum = toneChar ? TONE_NUMBER[toneChar] : null;

  const buildCandidate = candBase => {
    if (candBase === base) return null;
    if (!VALID_SYLLABLES.has(candBase.replace(/ü/g, 'v'))) return null;
    return toneNum ? addToneMark(candBase, toneNum) : candBase;
  };

  const finalCands = (SIMILAR_FINALS[final] || [])
    .map(f => buildCandidate(initial + f))
    .filter(Boolean);
  const initialCands = (SIMILAR_INITIALS[initial] || [])
    .map(i => buildCandidate(i + final))
    .filter(Boolean);
  const toneCands = toneNum ? getToneVariants(pinyin) : [];

  return { final: finalCands, initial: initialCands, tone: toneCands };
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
