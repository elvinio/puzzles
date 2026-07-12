/* ============================================================================
   app.js — per-page bootstrap. Loaded last on every page.
     1. Registers the service worker (offline shell).
     2. Fallback-injects the manifest <link> / theme-color (in case a page's
        head snippet was missed during rollout).
     3. Auto-on-load: if a Drive Client ID is set, silently pull+merge once.
   ========================================================================== */
(function () {
  'use strict';

  // Resolve shared assets against app.js's OWN url (captured synchronously),
  // not the page url — so pages in subdirectories (e.g. chinese/) still reach
  // the root-level manifest + service worker with correct root scope.
  var APP_BASE = (document.currentScript && document.currentScript.src) || location.href;

  // ── Manifest / theme fallback ──────────────────────────────────────────────
  if (!document.querySelector('link[rel="manifest"]')) {
    var link = document.createElement('link');
    link.rel = 'manifest';
    link.href = new URL('manifest.webmanifest', APP_BASE).href;
    document.head.appendChild(link);
  }
  if (!document.querySelector('meta[name="theme-color"]')) {
    var meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = '#13111c';
    document.head.appendChild(meta);
  }

  // ── Service worker ──────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    var swUrl = new URL('sw.js', APP_BASE).href;   // root sw.js, root scope
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(swUrl).catch(function () {});
    });
  }

  // ── Auto-on-load sync (silent) ──────────────────────────────────────────────
  // Best-effort: only attempts when a Client ID exists and we're online. Any
  // failure (no consent yet, offline, popup blocked) is swallowed quietly.
  window.addEventListener('load', function () {
    try {
      var D = window.PZSyncDrive;
      if (D && D.isConfigured() && navigator.onLine) {
        D.syncNow({ silent: true }).catch(function () {});
      }
    } catch (e) {}
  });
})();
