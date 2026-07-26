/* ============================================================================
   game.js — the rules of Tamago's Sushi Bar. Pure logic, no three.js: order
   generation, the solvability guarantee, tray dealing and scoring.

   The single most important thing in this file is that a child can never be
   handed an order they cannot fill. Every target is built BY summing real tray
   values, and every tray change re-checks the waiting orders and repairs them.
   ========================================================================== */

// ── Difficulty ramp ────────────────────────────────────────────────────────
// `until` is the fraction of the session elapsed. Targets climb 5 → 30, the
// number of ingredients allowed climbs 2 → 4, and the order cards pick up
// subtraction, doubling and halving along the way.
export const WAVES = [
  { until: 0.34, minTarget: 5,  maxTarget: 12, maxAddends: 2, valueMax: 9,
    patience: 26, types: ['plain', 'plain', 'plain', 'add'] },
  { until: 0.68, minTarget: 8,  maxTarget: 20, maxAddends: 3, valueMax: 10,
    patience: 24, types: ['plain', 'plain', 'sub', 'add', 'double'] },
  { until: 2.00, minTarget: 10, maxTarget: 30, maxAddends: 4, valueMax: 12,
    patience: 22, types: ['plain', 'plain', 'sub', 'add', 'double', 'half'] }
];

export const TRAY_SLOTS   = 8;
export const MAX_CUSTOMERS = 3;
export const WILD_MIN = 1;
export const WILD_MAX = 12;

export function waveFor(progress) {
  for (const w of WAVES) if (progress < w.until) return w;
  return WAVES[WAVES.length - 1];
}

export function waveIndex(progress) {
  for (let i = 0; i < WAVES.length; i++) if (progress < WAVES[i].until) return i;
  return WAVES.length - 1;
}

// ── Subset sum ─────────────────────────────────────────────────────────────

/** Classic bitset DP. Tiny inputs (≤ 8 values, target ≤ 40) so cost is nil. */
export function subsetSums(values, max) {
  const dp = new Uint8Array(max + 1);
  dp[0] = 1;
  for (const n of values) {
    if (n <= 0 || n > max) continue;
    for (let s = max; s >= n; s--) if (dp[s - n]) dp[s] = 1;
  }
  return dp;
}

/**
 * Can `target` be made from `values`? `wilds` is the count of ⭐ wildcards
 * present, each of which may stand in for any number in [WILD_MIN, WILD_MAX].
 */
export function reachable(values, target, wilds = 0) {
  if (target < 0) return false;
  if (target === 0) return true;
  const dp = subsetSums(values, target);
  if (dp[target]) return true;
  if (wilds > 0) {
    for (let v = WILD_MIN; v <= Math.min(WILD_MAX, target); v++) {
      if (dp[target - v]) return true;
    }
  }
  return false;
}

/** The fewest tray values that sum to `target` (0 if unreachable). */
export function minAddends(values, target) {
  if (target === 0) return 0;
  const best = new Int16Array(target + 1).fill(9999);
  best[0] = 0;
  for (const n of values) {
    if (n <= 0 || n > target) continue;
    for (let s = target; s >= n; s--) {
      if (best[s - n] + 1 < best[s]) best[s] = best[s - n] + 1;
    }
  }
  return best[target] >= 9999 ? 0 : best[target];
}

// ── Random helpers ─────────────────────────────────────────────────────────
const rnd  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Ingredient numbers, weighted toward the small end: little numbers combine
 * into more decompositions, which is the whole point of the game.
 */
export function dealValue(wave) {
  const max = wave.valueMax;
  const r = Math.random();
  if (r < 0.55) return rnd(1, Math.min(5, max));
  if (r < 0.88) return rnd(Math.min(4, max), Math.min(8, max));
  return rnd(Math.min(6, max), max);
}

// ── Order generation ───────────────────────────────────────────────────────

/**
 * Build an order the current tray can actually fill.
 *
 * The target is chosen by picking a real subset of the tray and summing it,
 * so solvability is true by construction rather than by hope. Only then is it
 * dressed up as "20 − 6" or "double 7".
 *
 * @param wave          entry from WAVES
 * @param trayValues    numeric values currently sitting in the tray
 * @param avoidTargets  targets already on other customers' cards
 * @returns { target, label, kind, addends }  (null if the tray is degenerate)
 */
export function makeOrder(wave, trayValues, avoidTargets = []) {
  const vals = trayValues.filter(v => typeof v === 'number' && v > 0);
  if (vals.length < 2) return null;

  // Enumerate every combination of 2..maxAddends tray pieces. With eight slots
  // that is at most 162 subsets, so exhaustive is both cheap and exact — no
  // sampling loop that can fall through to a bad fallback.
  const combos = [];
  const idx = [];
  (function walk(start, depth) {
    if (depth >= 2) {
      const sum = idx.reduce((a, i) => a + vals[i], 0);
      if (sum >= wave.minTarget && sum <= wave.maxTarget) {
        combos.push({ target: sum, addends: idx.map(i => vals[i]) });
      }
    }
    if (depth === wave.maxAddends) return;
    for (let i = start; i < vals.length; i++) {
      idx.push(i);
      walk(i + 1, depth + 1);
      idx.pop();
    }
  })(0, 0);

  if (!combos.length) {
    // Only possible if the whole tray cannot reach the wave's band at all
    // (e.g. eight 1s early on). Widen the addend budget rather than hand out
    // a target that is out of range or unreachable.
    const all = vals.slice().sort((a, b) => b - a);
    let sum = 0;
    const addends = [];
    for (const v of all) {
      if (sum >= wave.minTarget) break;
      sum += v; addends.push(v);
    }
    if (!addends.length) return null;
    const d = dressOrder(sum, wave);
    return { target: sum, label: d.label, kind: d.kind, addends };
  }

  // prefer a target nobody else is already asking for, and prefer variety in
  // how many pieces it takes
  const fresh = combos.filter(c => !avoidTargets.includes(c.target));
  const pool = fresh.length ? fresh : combos;
  const twoPiece = pool.filter(c => c.addends.length === 2);
  const wider    = pool.filter(c => c.addends.length > 2);
  const chosen = (wider.length && Math.random() > 0.55) || !twoPiece.length
    ? pick(wider.length ? wider : pool)
    : pick(twoPiece);

  const dressed = dressOrder(chosen.target, wave);
  return {
    target:  chosen.target,
    label:   dressed.label,
    kind:    dressed.kind,
    addends: chosen.addends
  };
}

/** Turn a bare number into the thing printed on the customer's card. */
export function dressOrder(target, wave) {
  const types = wave.types.slice();
  for (let i = 0; i < 8; i++) {
    const kind = pick(types);

    if (kind === 'sub') {
      const b = rnd(2, 9);
      if (target + b <= 40) return { kind, label: `${target + b} − ${b}` };

    } else if (kind === 'double') {
      if (target % 2 === 0 && target >= 4) return { kind, label: `double ${target / 2}` };

    } else if (kind === 'half') {
      if (target * 2 <= 60) return { kind, label: `half of ${target * 2}` };

    } else if (kind === 'add') {
      const a = rnd(1, Math.max(1, target - 1));
      return { kind, label: `${a} + ${target - a}` };

    } else {
      return { kind: 'plain', label: String(target) };
    }
  }
  return { kind: 'plain', label: String(target) };
}

// ── Solvability repair ─────────────────────────────────────────────────────

/**
 * A customer is satisfiable while their target can still be made from the
 * ingredients in play — tray plus whatever is already on the plate, since the
 * player can always take pieces back off.
 */
export function isSatisfiable(target, trayValues, plateValues, wilds) {
  const pool = trayValues.concat(plateValues).filter(v => typeof v === 'number' && v > 0);
  return reachable(pool, target, wilds);
}

/**
 * Choose the number for an incoming tray ingredient. Normally random, but if
 * any waiting order has become unfillable this picks the value that rescues
 * the most of them — the quiet safety net that keeps the game fair.
 */
export function chooseRefillValue(wave, trayValues, plateValues, pendingTargets, wilds) {
  const pool = trayValues.concat(plateValues).filter(v => typeof v === 'number' && v > 0);
  const stuck = pendingTargets.filter(t => !reachable(pool, t, wilds));

  if (stuck.length === 0) return dealValue(wave);

  let bestValue = null, bestFixed = -1;
  for (let v = 1; v <= wave.valueMax; v++) {
    let fixed = 0;
    for (const t of stuck) if (reachable(pool.concat([v]), t, wilds)) fixed++;
    if (fixed > bestFixed) { bestFixed = fixed; bestValue = v; }
  }
  // if nothing helps (shouldn't happen), hand over the smallest stuck target
  return bestFixed > 0 ? bestValue : Math.min(wave.valueMax, Math.min(...stuck));
}

/**
 * What number should a ⭐ Golden Tamago become right now? It takes the value
 * that completes a waiting order outright, preferring the smallest such jump;
 * with nothing to complete it falls back to a friendly small number.
 */
export function resolveWildValue(plateSum, pendingTargets, wave) {
  const needs = pendingTargets
    .map(t => t - plateSum)
    .filter(n => n >= WILD_MIN && n <= WILD_MAX)
    .sort((a, b) => a - b);
  if (needs.length) return needs[0];
  return dealValue(wave);
}

// ── Scoring ────────────────────────────────────────────────────────────────

export const SCORE = {
  base: 10,
  speedMax: 10,
  flourish3: 5,
  flourish4: 10,
  comboCap: 5
};

export function comboMultiplier(streak) {
  return Math.min(SCORE.comboCap, 1 + Math.floor(streak / 2));
}

/**
 * scoreServe({ patienceFrac, streak, addendCount, wasabi })
 * Returns { points, multiplier, speedBonus, flourish } so the HUD can explain
 * itself — children should be able to see why a serve was worth what it was.
 */
export function scoreServe({ patienceFrac = 0, streak = 0, addendCount = 2, wasabi = false }) {
  const speedBonus = Math.round(SCORE.speedMax * Math.max(0, Math.min(1, patienceFrac)));
  const flourish = addendCount >= 4 ? SCORE.flourish4 : addendCount >= 3 ? SCORE.flourish3 : 0;
  const multiplier = comboMultiplier(streak) * (wasabi ? 2 : 1);
  const points = (SCORE.base + speedBonus + flourish) * multiplier;
  return { points, multiplier, speedBonus, flourish };
}

/** Three stars is a genuinely good run, not a participation trophy. */
export function starRating(score, sessionSeconds) {
  const perMinute = score / Math.max(1, sessionSeconds / 60);
  if (perMinute >= 170) return 3;
  if (perMinute >= 105) return 2;
  if (perMinute >= 45)  return 1;
  return 0;
}

export function patienceFor(wave, target, addends) {
  // more ingredients and bigger numbers earn a little more thinking time
  return wave.patience + Math.max(0, addends - 2) * 4 + (target > 20 ? 3 : 0);
}
