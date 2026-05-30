/* ============================================================================
   sync-drive.js — Google Identity Services + Drive REST v3 backup/sync.

   Uses the minimal 'drive.file' scope: the app can only see files it created,
   so it stores a single game-saves.json in the user's Drive. The OAuth Web
   Client ID is read from localStorage (set via the Settings field in the menu)
   — it is not a secret, so this is safe and per-device.

   Public API (window.PZSyncDrive):
     isConfigured()              -> bool (client id present)
     getClientId() / setClientId(id)
     getEmail()                  -> string|null (in-memory, after sign-in)
     getLastSync()               -> number ms epoch | 0
     signIn({silent})            -> Promise<token>
     signOut()
     syncNow({silent})           -> Promise<{merged}>  (snapshot+merge+upload)
   ========================================================================== */
(function () {
  'use strict';

  var CLIENT_KEY   = 'puzzles-gdrive-client-id';
  var LASTSYNC_KEY = 'puzzles-sync-lastTime';
  var FILE_NAME    = 'game-saves.json';
  var SCOPE        = 'https://www.googleapis.com/auth/drive.file';
  var GIS_SRC      = 'https://accounts.google.com/gsi/client';

  var tokenClient = null;
  var accessToken = null;
  var tokenExpiry = 0;
  var email       = null;
  var gisPromise  = null;

  // ── Config ────────────────────────────────────────────────────────────────
  function getClientId() {
    try { return (localStorage.getItem(CLIENT_KEY) || '').trim() || null; }
    catch (e) { return null; }
  }
  function setClientId(id) {
    try {
      id = (id || '').trim();
      if (id) localStorage.setItem(CLIENT_KEY, id);
      else localStorage.removeItem(CLIENT_KEY);
    } catch (e) {}
    tokenClient = null;            // force re-init with new id
    accessToken = null; tokenExpiry = 0;
  }
  function isConfigured() { return !!getClientId(); }
  function getEmail()     { return email; }
  function getLastSync()  {
    try { return parseInt(localStorage.getItem(LASTSYNC_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }

  // ── Load Google Identity Services lazily ──────────────────────────────────
  function loadGIS() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      if (!navigator.onLine) { reject(new Error('offline')); return; }
      var s = document.createElement('script');
      s.src = GIS_SRC; s.async = true; s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { gisPromise = null; reject(new Error('gis-load-failed')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }

  function ensureTokenClient() {
    var id = getClientId();
    if (!id) throw new Error('no-client-id');
    if (tokenClient) return tokenClient;
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: SCOPE,
      callback: function () {}      // replaced per request
    });
    return tokenClient;
  }

  // ── Sign in / out ─────────────────────────────────────────────────────────
  function signIn(opts) {
    opts = opts || {};
    if (accessToken && Date.now() < tokenExpiry - 30000) {
      return Promise.resolve(accessToken);
    }
    return loadGIS().then(function () {
      return new Promise(function (resolve, reject) {
        var tc = ensureTokenClient();
        tc.callback = function (resp) {
          if (resp && resp.access_token) {
            accessToken = resp.access_token;
            tokenExpiry = Date.now() + ((resp.expires_in || 3600) * 1000);
            fetchEmail().finally(function () { resolve(accessToken); });
          } else {
            reject(new Error(resp && resp.error ? resp.error : 'auth-failed'));
          }
        };
        tc.error_callback = function (err) { reject(err || new Error('auth-failed')); };
        try {
          tc.requestAccessToken({ prompt: opts.silent ? 'none' : '' });
        } catch (e) { reject(e); }
      });
    });
  }

  function signOut() {
    var tok = accessToken;
    accessToken = null; tokenExpiry = 0; email = null;
    if (tok && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try { window.google.accounts.oauth2.revoke(tok, function () {}); } catch (e) {}
    }
  }

  function fetchEmail() {
    return fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.email) email = j.email; })
      .catch(function () {});
  }

  // ── Drive file ops ────────────────────────────────────────────────────────
  function authHeaders() { return { Authorization: 'Bearer ' + accessToken }; }

  function findFileId() {
    var url = 'https://www.googleapis.com/drive/v3/files'
      + '?q=' + encodeURIComponent("name='" + FILE_NAME + "' and trashed=false")
      + '&spaces=drive&fields=files(id,name,modifiedTime)';
    return fetch(url, { headers: authHeaders() })
      .then(function (r) {
        if (r.status === 401) throw new Error('unauthorized');
        return r.json();
      })
      .then(function (j) {
        return (j && j.files && j.files.length) ? j.files[0].id : null;
      });
  }

  function downloadFile(id) {
    return fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media',
      { headers: authHeaders() })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function uploadFile(id, snapshot) {
    var boundary = 'pzsync' + Date.now();
    var meta = { name: FILE_NAME, mimeType: 'application/json' };
    var body =
      '--' + boundary + '\r\n' +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(meta) + '\r\n' +
      '--' + boundary + '\r\n' +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(snapshot) + '\r\n' +
      '--' + boundary + '--';
    var url = 'https://www.googleapis.com/upload/drive/v3/files'
      + (id ? '/' + id : '') + '?uploadType=multipart&fields=id';
    return fetch(url, {
      method: id ? 'PATCH' : 'POST',
      headers: Object.assign(authHeaders(), {
        'Content-Type': 'multipart/related; boundary=' + boundary
      }),
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error('upload-failed-' + r.status);
      return r.json();
    });
  }

  // ── Orchestration ─────────────────────────────────────────────────────────
  function syncNow(opts) {
    opts = opts || {};
    if (!isConfigured())   return Promise.reject(new Error('no-client-id'));
    if (!navigator.onLine) return Promise.reject(new Error('offline'));

    var local = window.PZSyncMerge.snapshotLocal();

    return signIn({ silent: !!opts.silent }).then(function () {
      return findFileId().catch(function (e) {
        // one silent re-auth on 401, then retry once
        if (String(e.message) === 'unauthorized') {
          accessToken = null; tokenExpiry = 0;
          return signIn({ silent: false }).then(findFileId);
        }
        throw e;
      });
    }).then(function (fileId) {
      var remoteP = fileId ? downloadFile(fileId) : Promise.resolve(null);
      return remoteP.then(function (remote) {
        var merged = window.PZSyncMerge.mergeSnapshots(local, remote || { __ts: 0, data: {} });
        window.PZSyncMerge.applySnapshot(merged);     // local updated immediately
        return uploadFile(fileId, merged).then(function () {
          try { localStorage.setItem(LASTSYNC_KEY, String(Date.now())); } catch (e) {}
          return { merged: merged };
        });
      });
    });
  }

  window.PZSyncDrive = {
    isConfigured: isConfigured,
    getClientId: getClientId,
    setClientId: setClientId,
    getEmail: getEmail,
    getLastSync: getLastSync,
    isSignedIn: function () { return !!accessToken && Date.now() < tokenExpiry; },
    signIn: signIn,
    signOut: signOut,
    syncNow: syncNow
  };
})();
