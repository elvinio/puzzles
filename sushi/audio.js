/* ============================================================================
   audio.js — all sound is synthesised with WebAudio, so the game ships with
   zero audio files and still works offline.

   iPadOS will not start an AudioContext until a real touch happens, so
   unlock() is wired to the first pointer event on the page.
   ========================================================================== */

let ctx = null;
let master = null;
let muted = localStorage.getItem('sushi-muted') === '1';

export function isMuted() { return muted; }

export function setMuted(v) {
  muted = !!v;
  localStorage.setItem('sushi-muted', muted ? '1' : '0');
  if (master) master.gain.value = muted ? 0 : 0.9;
}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.9;
  master.connect(ctx.destination);
}

/** One shaped note. `type` picks the timbre, everything else is envelope. */
function note(freq, when, dur, opts = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = opts.type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);

  const peak = (opts.gain || 0.25);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.03, dur * 0.3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Short filtered noise — used for the sprinkle and the sad puff. */
function noise(when, dur, freq = 1400, gainVal = 0.12) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = gainVal;

  src.connect(filt); filt.connect(gain); gain.connect(master);
  src.start(t0);
}

// ── The sound palette ──────────────────────────────────────────────────────
// Everything is pentatonic and soft — no harsh edges, nothing that punishes.

const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

export const sfx = {
  /** picking an ingredient off the tray — pitch rises with the stack height */
  tap(step = 0) {
    note(PENTA[Math.min(PENTA.length - 1, step)], 0, 0.18, { type: 'triangle', gain: 0.26 });
    note(PENTA[Math.min(PENTA.length - 1, step)] * 2, 0.01, 0.09, { type: 'sine', gain: 0.08 });
  },

  /** taking a piece back off the plate */
  undo() {
    note(440, 0, 0.14, { type: 'triangle', gain: 0.2, slideTo: 300 });
  },

  /** the plate went past the target */
  over() {
    note(320, 0, 0.13, { type: 'square', gain: 0.1 });
    note(285, 0.09, 0.18, { type: 'square', gain: 0.1 });
  },

  /** total matches an order — a little "ding, you're ready" */
  ready() {
    note(1046.5, 0, 0.16, { type: 'sine', gain: 0.2 });
    note(1318.5, 0.08, 0.22, { type: 'sine', gain: 0.18 });
  },

  /** a happy customer */
  serve(multiplier = 1) {
    const root = 523.25 * (1 + Math.min(4, multiplier - 1) * 0.06);
    [0, 4, 7, 12].forEach((semi, i) => {
      note(root * Math.pow(2, semi / 12), i * 0.065, 0.34, { type: 'triangle', gain: 0.22 });
    });
    noise(0.02, 0.25, 2600, 0.05);
  },

  /** tapped the wrong customer — gentle, never a buzzer */
  nope() {
    note(392, 0, 0.12, { type: 'sine', gain: 0.16 });
    note(349.23, 0.1, 0.2, { type: 'sine', gain: 0.14 });
  },

  /** a customer gave up and left */
  leave() {
    note(392, 0, 0.28, { type: 'sine', gain: 0.2, slideTo: 196 });
    noise(0.2, 0.3, 700, 0.06);
  },

  /** special ingredients */
  tea() {
    [659.25, 783.99, 987.77].forEach((f, i) => note(f, i * 0.07, 0.4, { type: 'sine', gain: 0.16 }));
  },
  wasabi() {
    note(180, 0, 0.3, { type: 'sawtooth', gain: 0.1, slideTo: 620 });
  },
  wild() {
    [880, 1046.5, 1318.5, 1760].forEach((f, i) => note(f, i * 0.05, 0.3, { type: 'sine', gain: 0.15 }));
  },

  /** last ten seconds of the session */
  tick(urgent) {
    note(urgent ? 880 : 660, 0, 0.07, { type: 'sine', gain: urgent ? 0.16 : 0.09 });
  },

  start() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      note(f, i * 0.09, 0.4, { type: 'triangle', gain: 0.22 }));
  },

  finish() {
    [1046.5, 880, 783.99, 659.25, 523.25].forEach((f, i) =>
      note(f, i * 0.11, 0.5, { type: 'triangle', gain: 0.2 }));
  }
};
