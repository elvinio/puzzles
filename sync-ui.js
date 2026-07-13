/* ============================================================================
   sync-ui.js — the menu opened by tapping the floating avatar badge.

   Sections: avatar header, "Edit avatars", Google Drive sign-in / Sync now
   (with email + last-sync time + status), and Settings (OAuth Client ID input).
   Styling lives in styles.css (.pz-modal / .pz-btn / .pz-sync-*).
   ========================================================================== */
(function () {
  'use strict';

  var Drive = function () { return window.PZSyncDrive; };
  var overlay = null;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function relTime(ms) {
    if (!ms) return 'never';
    var d = Date.now() - ms;
    if (d < 60000)   return 'just now';
    if (d < 3600000) return Math.floor(d / 60000) + ' min ago';
    if (d < 86400000) return Math.floor(d / 3600000) + ' hr ago';
    return Math.floor(d / 86400000) + ' day(s) ago';
  }

  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function openMenu() {
    if (overlay) return;
    var av = (window.__avatarGetActive && window.__avatarGetActive()) || null;
    var avatarSvg = (av && window.__avatarRender) ? window.__avatarRender(av, '48') : '';
    var nick = av ? esc(av.nickname || 'Player') : 'No avatar';

    overlay = document.createElement('div');
    overlay.className = 'pz-modal';
    overlay.innerHTML =
      '<div class="pz-modal-card" role="dialog" aria-label="Sync menu">' +
        '<div class="pz-sync-head">' +
          '<div>' + avatarSvg + '</div>' +
          '<div>' +
            '<div class="pz-sync-name">' + nick + '</div>' +
            '<div class="pz-sync-sub">Puzzles</div>' +
          '</div>' +
          '<button class="pz-close" aria-label="Close" data-act="close">&times;</button>' +
        '</div>' +

        '<div class="pz-sync-section">' +
          '<div class="pz-sync-label">Switch avatar</div>' +
          '<div class="pz-avatar-strip" id="pz-avatar-strip"></div>' +
        '</div>' +

        '<div class="pz-sync-row">' +
          '<button class="pz-btn pz-btn-ghost" data-act="avatars">Edit avatars</button>' +
        '</div>' +

        '<div class="pz-sync-divider"></div>' +

        '<div class="pz-sync-section">' +
          '<div class="pz-sync-label">Google Drive backup</div>' +
          '<div class="pz-sync-row" id="pz-drive-area"></div>' +
          '<div class="pz-status" id="pz-status"></div>' +
        '</div>' +

        '<div class="pz-sync-section" id="pz-settings"></div>' +

        '<div class="pz-sync-version">Version ' + esc(window.PZ_VERSION || '?') + '</div>' +
      '</div>';

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
      var actEl = e.target.closest && e.target.closest('[data-act]');
      if (actEl) handleAct(actEl.getAttribute('data-act'), actEl);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);

    renderAvatarStrip();
    renderDriveArea();
    renderSettings();
  }

  function renderAvatarStrip() {
    var strip = overlay && overlay.querySelector('#pz-avatar-strip');
    if (!strip) return;
    var list = (window.__avatarLoadAvatars && window.__avatarLoadAvatars()) || [];
    var activeId = window.__avatarGetActiveId && window.__avatarGetActiveId();

    strip.innerHTML = list.map(function (a) {
      var isActive = a.id === activeId;
      var svg = window.__avatarRender ? window.__avatarRender(a, '40') : '';
      return '<button class="pz-avatar-chip' + (isActive ? ' is-active' : '') + '" ' +
        'data-act="switch-avatar" data-id="' + a.id + '" ' +
        'aria-label="Switch to ' + esc(a.nickname || 'avatar') + '" ' +
        (isActive ? 'aria-current="true"' : '') + '>' + svg + '</button>';
    }).join('') +
      '<a class="pz-avatar-chip pz-avatar-chip-add" href="avatar.html" aria-label="Create new avatar">+</a>';
  }

  function updateHead() {
    var head = overlay && overlay.querySelector('.pz-sync-head');
    if (!head) return;
    var av = (window.__avatarGetActive && window.__avatarGetActive()) || null;
    var svgHolder = head.querySelector('div');
    var nameHolder = head.querySelector('.pz-sync-name');
    if (svgHolder) svgHolder.innerHTML = (av && window.__avatarRender) ? window.__avatarRender(av, '48') : '';
    if (nameHolder) nameHolder.textContent = av ? (av.nickname || 'Player') : 'No avatar';
  }

  function statusEl() { return overlay && overlay.querySelector('#pz-status'); }
  function setStatus(msg, cls) {
    var el = statusEl(); if (!el) return;
    el.textContent = msg || '';
    el.className = 'pz-status' + (cls ? ' ' + cls : '');
  }

  function renderDriveArea() {
    var area = overlay && overlay.querySelector('#pz-drive-area');
    if (!area) return;
    var D = Drive();
    if (!D.isConfigured()) {
      area.innerHTML =
        '<p class="pz-hint">Add a Google OAuth Client ID in Settings below to enable backup.</p>';
      return;
    }
    if (D.isSignedIn()) {
      var emailLine = D.getEmail() ? '<div class="pz-sync-sub">' + esc(D.getEmail()) + '</div>' : '';
      area.innerHTML =
        emailLine +
        '<div class="pz-sync-sub">Last synced: ' + relTime(D.getLastSync()) + '</div>' +
        '<button class="pz-btn" data-act="sync">Sync now</button>' +
        '<button class="pz-btn pz-btn-danger" data-act="signout">Sign out</button>';
    } else {
      area.innerHTML =
        '<div class="pz-sync-sub">Last synced: ' + relTime(D.getLastSync()) + '</div>' +
        '<button class="pz-btn" data-act="signin">Sign in to Google Drive</button>';
    }
  }

  function renderSettings() {
    var box = overlay && overlay.querySelector('#pz-settings');
    if (!box) return;
    var D = Drive();
    box.innerHTML =
      '<div class="pz-sync-divider"></div>' +
      '<div class="pz-sync-label">Settings</div>' +
      '<div class="pz-sync-row">' +
        '<input class="pz-input" id="pz-clientid" placeholder="Google OAuth Client ID" ' +
          'value="' + esc(D.getClientId() || '') + '" autocomplete="off" spellcheck="false">' +
        '<button class="pz-btn pz-btn-ghost" data-act="save-id">Save Client ID</button>' +
      '</div>' +
      '<p class="pz-hint">Create a <b>Web application</b> OAuth client in your Google Cloud ' +
        'project and add this site’s origin as an authorized JavaScript origin. ' +
        'The ID is not secret.</p>';
  }

  function handleAct(act, el) {
    var D = Drive();
    if (act === 'close')   return close();
    if (act === 'avatars') { window.location.href = 'avatar.html'; return; }

    if (act === 'switch-avatar') {
      var id = el.getAttribute('data-id');
      if (!id) return;
      if (window.__avatarSetActiveId) window.__avatarSetActiveId(id);
      updateHead();
      renderAvatarStrip();
      return;
    }

    if (act === 'save-id') {
      var input = overlay.querySelector('#pz-clientid');
      D.setClientId(input ? input.value : '');
      setStatus('Client ID saved.', 'pz-ok');
      renderDriveArea();
      return;
    }

    if (act === 'signin') {
      setStatus('Signing in…', 'pz-busy');
      D.signIn({ silent: false }).then(function () {
        setStatus('Signed in.', 'pz-ok'); renderDriveArea();
      }).catch(function (e) {
        setStatus(authError(e), 'pz-err');
      });
      return;
    }

    if (act === 'signout') { D.signOut(); setStatus('Signed out.'); renderDriveArea(); return; }

    if (act === 'sync') {
      el.disabled = true;
      setStatus('Syncing…', 'pz-busy');
      D.syncNow({ silent: false }).then(function () {
        setStatus('Synced ✓', 'pz-ok'); renderDriveArea();
      }).catch(function (e) {
        setStatus(authError(e), 'pz-err');
      }).then(function () { if (el) el.disabled = false; });
      return;
    }
  }

  function authError(e) {
    var m = e && e.message ? String(e.message) : '';
    if (m === 'offline')      return 'You’re offline — sync skipped.';
    if (m === 'no-client-id') return 'Set a Client ID in Settings first.';
    if (m === 'gis-load-failed') return 'Could not reach Google. Try again online.';
    if (/access_denied|popup|interaction/i.test(m)) return 'Sign-in was cancelled.';
    return 'Sync failed. Please try again.';
  }

  window.PZSyncUI = { openMenu: openMenu, close: close };
})();
