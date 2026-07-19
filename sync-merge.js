/* ============================================================================
   sync-merge.js — pure, network-free merge engine.

   snapshotLocal()                -> { schema, __ts, data:{ key: value } }
   mergeSnapshots(local, remote)  -> merged snapshot (idempotent, converges)
   applySnapshot(merged)          -> writes merged values back to localStorage

   The merge never overwrites blindly: each key is reduced by the strategy named
   in sync-registry.js. A key present on only one side is always kept.
   ========================================================================== */
(function () {
  'use strict';

  var R = window.PZSyncRegistry;
  var SCHEMA = 1;

  function union(a, b) {
    var seen = {}, out = [];
    [].concat(a || [], b || []).forEach(function (v) {
      var k = (typeof v === 'object') ? JSON.stringify(v) : String(v);
      if (!seen[k]) { seen[k] = 1; out.push(v); }
    });
    return out;
  }

  function num(v) { var n = parseFloat(v); return isNaN(n) ? null : n; }

  // ── Score map: direction-aware per key ────────────────────────────────────
  function mergeScores(sa, sb) {
    sa = sa || {}; sb = sb || {};
    var out = {};
    Object.keys(sa).concat(Object.keys(sb)).forEach(function (k) {
      if (k in out) return;
      var x = sa[k], y = sb[k];
      if (x === undefined) { out[k] = y; return; }
      if (y === undefined) { out[k] = x; return; }
      out[k] = R.lowerIsBetter(k) ? Math.min(x, y) : Math.max(x, y);
    });
    return out;
  }

  // ── Avatars: merge by id, profile fields prefer local, scores merge ───────
  function mergeAvatars(local, remote) {
    var byId = {}, order = [];
    function add(a) {
      if (!a || !a.id) return;
      if (!byId[a.id]) order.push(a.id);
      byId[a.id] = byId[a.id]
        ? mergeOne(byId[a.id], a)   // existing (remote) merged with local
        : a;
    }
    (remote || []).forEach(add);
    (local  || []).forEach(add);
    return order.map(function (id) { return byId[id]; });
  }

  function mergeOne(remoteAv, localAv) {
    // Object.assign: later wins -> local profile fields take precedence.
    var merged = Object.assign({}, remoteAv, localAv);
    merged.scores = mergeScores(localAv.scores, remoteAv.scores);
    return merged;
  }

  // ── Spaced-repetition map (chinese/english/typing progress) ───────────────
  // Merge two versions of one SR record. Monotone and commutative (up to
  // tie-breaks on equal lastTested) so repeated merges converge. The optional
  // `skills` (per-group schedules) and `byMode` (per-group counters) blocks
  // exist only on chinese records — english/typing records pass through with
  // the original flat semantics.
  function mergeSrRecord(a, b) {
    // scheduling state follows the record tested more recently
    var at = String(a.lastTested || ''), bt = String(b.lastTested || '');
    var newer = at >= bt ? a : b;
    var out = Object.assign({}, newer, {
      attempts:    Math.max(a.attempts    || 0, b.attempts    || 0),
      correct:     Math.max(a.correct     || 0, b.correct     || 0),
      wrong:       Math.max(a.wrong       || 0, b.wrong       || 0),
      totalTimeMs: Math.max(a.totalTimeMs || 0, b.totalTimeMs || 0)
    });
    if (a.skills || b.skills) {
      out.skills = {};
      // Union of whatever group names either side has — not a fixed list —
      // so a group rename/split on one device (e.g. the new 'listening'
      // group splitting off 'recognition') merges cleanly with an
      // un-migrated snapshot from the other; migrateProgress folds legacy
      // names on next load.
      var groups = {};
      Object.keys(a.skills || {}).concat(Object.keys(b.skills || {})).forEach(function (g) { groups[g] = 1; });
      Object.keys(groups).forEach(function (g) {
        var sa = a.skills && a.skills[g], sb = b.skills && b.skills[g];
        var pick = !sa ? sb : !sb ? sa
                 : (String(sa.lastTested || '') >= String(sb.lastTested || '') ? sa : sb);
        if (pick) out.skills[g] = pick;
      });
    }
    if (a.byMode || b.byMode) {
      out.byMode = {};
      var groups = {};
      Object.keys(a.byMode || {}).concat(Object.keys(b.byMode || {})).forEach(function (g) { groups[g] = 1; });
      Object.keys(groups).forEach(function (g) {
        var ma = (a.byMode || {})[g], mb = (b.byMode || {})[g];
        if (!ma || !mb) { out.byMode[g] = ma || mb; return; }
        out.byMode[g] = {
          correct: Math.max(ma.correct || 0, mb.correct || 0),
          wrong:   Math.max(ma.wrong   || 0, mb.wrong   || 0),
          timeMs:  Math.max(ma.timeMs  || 0, mb.timeMs  || 0),
          timed:   Math.max(ma.timed   || 0, mb.timed   || 0)
        };
      });
    }
    return out;
  }

  // A `_resetAt` meta key (chinese progress only, ISO timestamp string) is the
  // tombstone left by "Reset progress": records last tested before the newest
  // reset day are dropped instead of resurrected by the key union. Keys
  // starting with `_` are meta values, not records — the newest one wins.
  function mergeSrMap(local, remote) {
    local = local || {}; remote = remote || {};
    var ra = String(local._resetAt || ''), rb = String(remote._resetAt || '');
    var resetDay = (ra >= rb ? ra : rb).slice(0, 10);
    var out = {};
    Object.keys(local).concat(Object.keys(remote)).forEach(function (k) {
      if (k in out) return;
      var a = local[k], b = remote[k];
      if (k.charAt(0) === '_') { out[k] = String(a || '') >= String(b || '') ? a : b; return; }
      var v = !a ? b : !b ? a : mergeSrRecord(a, b);
      if (resetDay && v && v.lastTested && String(v.lastTested).slice(0, 10) < resetDay) return;
      out[k] = v;
    });
    return out;
  }

  var STRATEGIES = {
    devicePref:  function (l)            { return l; },
    maxNumber:   function (l, r) {
      var a = num(l), b = num(r);
      if (a === null) return r;
      if (b === null) return l;
      // preserve the original string type used by the games
      return String(Math.max(a, b));
    },
    unionArray:  function (l, r)         { return union(l, r); },
    unionObject: function (l, r)         { return Object.assign({}, r || {}, l || {}); },
    // Coarse last-write: whichever device's whole snapshot is newer wins this
    // key wholesale. Acceptable for low-stakes in-progress single-game saves;
    // see plan §lastWrite tradeoff. Upgrade path: a puzzles-sync-meta map.
    lastWrite:   function (l, r, meta)   { return (meta.localTs >= meta.remoteTs) ? l : r; },
    srMap:       mergeSrMap,
    avatars:     mergeAvatars
  };

  // ── Snapshot / merge / apply ──────────────────────────────────────────────
  function snapshotLocal() {
    var snap = { schema: SCHEMA, __ts: Date.now(), data: {} };
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (R.strategyFor(k) === 'devicePref') continue;
      var raw = localStorage.getItem(k);
      try { snap.data[k] = JSON.parse(raw); } catch (e) { snap.data[k] = raw; }
    }
    return snap;
  }

  function mergeSnapshots(local, remote) {
    local  = local  || { __ts: 0, data: {} };
    remote = remote || { __ts: 0, data: {} };
    var meta = { localTs: local.__ts || 0, remoteTs: remote.__ts || 0 };
    var merged = { schema: SCHEMA, __ts: Date.now(), data: {} };
    var ld = local.data || {}, rd = remote.data || {};
    var seen = {};
    Object.keys(ld).concat(Object.keys(rd)).forEach(function (k) {
      if (seen[k]) return; seen[k] = 1;
      var lv = ld[k], rv = rd[k];
      if (lv === undefined) { merged.data[k] = rv; return; }
      if (rv === undefined) { merged.data[k] = lv; return; }
      var fn = STRATEGIES[R.strategyFor(k)] || STRATEGIES.devicePref;
      merged.data[k] = fn(lv, rv, meta);
    });
    return merged;
  }

  function applySnapshot(merged) {
    if (!merged || !merged.data) return;
    Object.keys(merged.data).forEach(function (k) {
      var v = merged.data[k];
      try {
        localStorage.setItem(k, (typeof v === 'string') ? v : JSON.stringify(v));
      } catch (e) {}
    });
  }

  window.PZSyncMerge = {
    snapshotLocal: snapshotLocal,
    mergeSnapshots: mergeSnapshots,
    applySnapshot: applySnapshot,
    // shared with chinese.html's progress migration (key-collision folding)
    mergeSrRecord: mergeSrRecord
  };
})();
