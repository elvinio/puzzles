/* ============================================================================
   sw.js — service worker for offline use.

   • Precaches the small app shell (all pages + shared js/css + JSON data + icons).
   • Runtime cache-first for big assets (fonts, pinyin audio, sprite images),
     with an LRU cap on the audio cache so it can't evict the whole SW cache.
   • Cross-origin (Google/Drive/CDN) is network-only, never cached.

   Bump VERSION in version.js on deploy to hard-reset caches.
   ========================================================================== */
importScripts('version.js');
const VERSION = self.PZ_VERSION;
const SHELL   = 'shell-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;
const AUDIO   = 'audio-' + VERSION;
const AUDIO_MAX = 120;            // keep at most N cached mp3s

const PRECACHE = [
  './',
  // pages
  'index.html', 'avatar.html', 'leaderboard.html', '2048.html', 'battleship.html',
  'breakout.html', 'carjam.html', 'english-idioms.html',
  'english-proverbs.html', 'english.html', 'goblet.html', 'hangman.html', 'mastermind.html',
  'mathblitz.html', 'memory.html', 'minesweeper.html', 'number.html',
  'science.html', 'spaceinvaders.html', 'sudoku.html', 'tower.html', 'tower2.html',
  'typingtutor.html', 'whackamole.html', 'wordle.html',
  // shared js/css
  'styles.css', 'app.js', 'avatar.js', 'version.js',
  'sync-registry.js', 'sync-merge.js', 'sync-drive.js', 'sync-ui.js',
  // Chinese app (chinese/ subdir: pages + extracted css/js + data + hanzi lib)
  'chinese/chinese.html', 'chinese/radicals.html', 'chinese/pinyin_tones.html',
  'chinese/oral.html',
  'chinese/common.css', 'chinese/common.js',
  'chinese/chinese.css', 'chinese/chinese.js',
  'chinese/radicals.css', 'chinese/radicals.js',
  'chinese/pinyin_tones.css', 'chinese/pinyin_tones.js',
  'chinese/oral.css', 'chinese/oral.js',
  'chinese/oral-topics/park.svg', 'chinese/oral-topics/classroom.png',
  'chinese/oral-topics/library.svg', 'chinese/oral-topics/hawker.png',
  'chinese/oral-topics/bus.svg', 'chinese/oral-topics/road.svg',
  'chinese/oral-topics/chores.png', 'chinese/oral-topics/birthday.svg',
  'chinese/oral-topics/sports.png', 'chinese/oral-topics/community.png',
  'chinese/hanzi-data/hanzi-writer.min.js',
  'chinese/data/chinese-p1.json', 'chinese/data/chinese-p2.json', 'chinese/data/chinese-p3.json',
  'chinese/data/chinese-idioms-p1.json', 'chinese/data/chinese-idioms-p3.json',
  // JSON data (small)
  'english-p1.json', 'english-p3.json', 'english-idioms.json', 'english-proverbs.json',
  // manifest + icons
  'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png', 'icons/icon.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL).then(function (cache) {
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  var keep = [SHELL, RUNTIME, AUDIO];
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        return keep.indexOf(n) === -1 ? caches.delete(n) : null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isAudio(url)  { return /\/pinyin_audio\//.test(url.pathname); }
function isHeavy(url)  {
  return /\.(ttf|otf|woff2?)$/i.test(url.pathname)
      || /\/science\//.test(url.pathname)
      || /\/tower\//.test(url.pathname)
      || /\/fonts\//.test(url.pathname)
      || /\/hanzi-data\/chars\//.test(url.pathname);
}

// Cache-first; on miss fetch and store. Used for shell + heavy static assets.
function cacheFirst(req, cacheName) {
  return caches.match(req).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (resp) {
      if (resp && resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
        var copy = resp.clone();
        caches.open(cacheName).then(function (c) { c.put(req, copy); });
      }
      return resp;
    });
  });
}

// Stale-while-revalidate for the shell: serve cache instantly, refresh in bg.
function staleWhileRevalidate(req) {
  return caches.open(SHELL).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (resp) {
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

function audioFirst(req) {
  return caches.open(AUDIO).then(function (cache) {
    return cache.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          cache.put(req, resp.clone());
          cache.keys().then(function (keys) {
            if (keys.length > AUDIO_MAX) cache.delete(keys[0]); // simple FIFO eviction
          });
        }
        return resp;
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Cross-origin (Google APIs, GIS, CDN) -> network only.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      staleWhileRevalidate(req).catch(function () { return caches.match('index.html'); })
    );
    return;
  }

  if (isAudio(url)) { event.respondWith(audioFirst(req)); return; }
  if (isHeavy(url)) { event.respondWith(cacheFirst(req, RUNTIME)); return; }

  // Shell assets (and anything else same-origin) -> SWR.
  event.respondWith(staleWhileRevalidate(req));
});
