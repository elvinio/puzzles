/* ============================================================================
   sync-registry.js — declarative merge rules for save-state sync.

   Every syncable localStorage key is described once here. Adding a new game =
   add one { match, strategy } entry. Keys that match nothing default to
   'devicePref' (kept local, never uploaded) so unknown data is never corrupted.
   ========================================================================== */
(function () {
  'use strict';

  // Score-direction registry — mirrors the __avatarSave(..., lowerIsBetter)
  // calls across the games. Returns true when a SMALLER score is better.
  function lowerIsBetter(scoreKey) {
    return /^(memory-|wordle-|minesweeper-|number-|sudoku-)/.test(scoreKey)
        || scoreKey === 'mastermind';
    // Everything else is higher-is-better: spaceinvaders, 2048-, carjam,
    // whackamole-, *-accuracy, hangman-wins, mathblitz-, typing-tutor-lvl-,
    // battleship, breakout, ...
  }

  var KEYS = [
    { match: 'puzzles-avatars',          strategy: 'avatars' },
    { match: 'puzzles-avatar-active',    strategy: 'devicePref' },  // per-device choice
    { match: 'puzzles-gdrive-client-id', strategy: 'devicePref' },  // config, not save-state
    { match: 'puzzles-sync-lastTime',    strategy: 'devicePref' },  // local bookkeeping
    { match: 'puzzles-favourites',       strategy: 'unionArray' },
    { match: 'sudoku_autosave',          strategy: 'lastWrite' },
    { match: 'tower2_state',             strategy: 'lastWrite' },
    { match: 'breakout-best',            strategy: 'maxNumber' },
    { match: 'si-best',                  strategy: 'maxNumber' },
    { match: 'spelling-tests',           strategy: 'unionArray' },
    { match: /^puzzles-2048-best-/,      strategy: 'maxNumber' },
    { match: 'puzzles-2048-theme',       strategy: 'lastWrite' },
    { match: /^typing-stats-/,           strategy: 'srMap' },
    { match: /^typing-unlocks-/,         strategy: 'unionObject' },
    { match: /^chinese-progress-/,       strategy: 'srMap' },
    { match: /^english-progress-/,       strategy: 'srMap' }
  ];

  function strategyFor(key) {
    for (var i = 0; i < KEYS.length; i++) {
      var e = KEYS[i];
      var hit = (e.match instanceof RegExp) ? e.match.test(key) : e.match === key;
      if (hit) return e.strategy;
    }
    return 'devicePref';
  }

  window.PZSyncRegistry = {
    KEYS: KEYS,
    strategyFor: strategyFor,
    lowerIsBetter: lowerIsBetter
  };
})();
