(function () {
  'use strict';

  var DEFAULTS = {
    nickname: 'Player',
    bgColor: '#6d28d9',
    faceShape: 'circle',
    skinColor: '#f5cba7',
    eyeStyle: 'round',
    noseStyle: 'dot',
    mouthStyle: 'smile',
    hairStyle: 'short',
    hairColor: '#2c1810'
  };

  // ── Storage helpers ───────────────────────────────────────────────────────

  function loadAvatars() {
    try { return JSON.parse(localStorage.getItem('puzzles-avatars') || '[]'); } catch (e) { return []; }
  }

  function saveAvatars(list) {
    try { localStorage.setItem('puzzles-avatars', JSON.stringify(list)); } catch (e) {}
  }

  function getActiveId() {
    try { return localStorage.getItem('puzzles-avatar-active') || null; } catch (e) { return null; }
  }

  function getActiveAvatar() {
    var id = getActiveId();
    var list = loadAvatars();
    return list.find(function (a) { return a.id === id; }) || list[0] || null;
  }

  // Expose helpers for avatar.html and leaderboard.html
  window.__avatarLoadAvatars = loadAvatars;
  window.__avatarSaveAvatars = saveAvatars;
  window.__avatarGetActiveId = getActiveId;
  window.__avatarGetActive   = getActiveAvatar;

  // ── Migration from old single-avatar schema ───────────────────────────────

  (function migrate() {
    try {
      if (localStorage.getItem('puzzles-avatars')) return;
      var old = localStorage.getItem('puzzles-avatar');
      if (!old) return;
      var p = JSON.parse(old);
      if (!p || !p.nickname) return;
      p.id = 'av_' + Date.now();
      p.scores = {};
      saveAvatars([p]);
      localStorage.setItem('puzzles-avatar-active', p.id);
      localStorage.removeItem('puzzles-avatar');
    } catch (e) {}
  })();

  // ── Score saver ───────────────────────────────────────────────────────────

  window.__avatarSave = function (scoreKey, value, lowerIsBetter) {
    try {
      var list = loadAvatars();
      var id = getActiveId();
      var avatar = list.find(function (a) { return a.id === id; });
      if (!avatar) return;
      if (!avatar.scores) avatar.scores = {};
      var prev = avatar.scores[scoreKey];
      var isBetter = (prev === undefined || prev === null) ||
        (lowerIsBetter ? value < prev : value > prev);
      if (isBetter) {
        avatar.scores[scoreKey] = value;
        saveAvatars(list);
      }
    } catch (e) {}
  };

  // ── SVG render ────────────────────────────────────────────────────────────

  function renderAvatarSVG(state, size) {
    var s = Object.assign({}, DEFAULTS, state);
    var sz = size || '100';

    var bg = '<rect width="100" height="100" fill="' + s.bgColor + '" rx="16"/>';

    var hairBack = '', hairFront = '';
    if (s.hairStyle !== 'none') {
      var hc = s.hairColor;
      switch (s.hairStyle) {
        case 'short':
          hairBack = '<path d="M19,40 Q20,14 50,12 Q80,14 81,40 Q65,33 50,32 Q35,33 19,40 Z" fill="' + hc + '"/>';
          break;
        case 'long':
          hairBack = '<path d="M19,40 Q16,68 20,84 Q35,90 50,32 Q65,90 80,84 Q84,68 81,40 Q65,33 50,12 Q35,33 19,40 Z" fill="' + hc + '"/>';
          break;
        case 'curly':
          hairBack = '<path d="M19,40 Q22,18 28,14 Q31,10 35,14 Q39,10 43,14 Q47,10 50,14 Q53,10 57,14 Q61,10 65,14 Q69,10 72,14 Q78,18 81,40 Q65,33 50,32 Q35,33 19,40 Z" fill="' + hc + '"/>';
          break;
        case 'bun':
          hairBack = '<path d="M19,40 Q20,14 50,12 Q80,14 81,40 Q65,33 50,32 Q35,33 19,40 Z" fill="' + hc + '"/>';
          hairFront = '<circle cx="50" cy="13" r="10" fill="' + hc + '"/>';
          break;
        case 'spiky':
          hairBack = '<path d="M22,40 L24,20 L30,36 L35,18 L41,35 L47,16 L50,13 L53,16 L59,35 L65,18 L70,36 L76,20 L78,40 Q65,33 50,32 Q35,33 22,40 Z" fill="' + hc + '"/>';
          break;
        case 'bangs':
          hairBack = '<path d="M19,40 Q20,14 50,12 Q80,14 81,40 Q65,33 50,32 Q35,33 19,40 Z" fill="' + hc + '"/>';
          hairFront = '<path d="M22,44 Q28,31 50,29 Q72,31 78,44 Q65,37 50,36 Q35,37 22,44 Z" fill="' + hc + '"/>';
          break;
        default:
          hairBack = '<path d="M19,40 Q20,14 50,12 Q80,14 81,40 Q65,33 50,32 Q35,33 19,40 Z" fill="' + hc + '"/>';
      }
    }

    var face = '';
    var sc = s.skinColor;
    switch (s.faceShape) {
      case 'oval':   face = '<ellipse cx="50" cy="55" rx="26" ry="33" fill="' + sc + '"/>'; break;
      case 'round':  face = '<rect x="20" y="27" width="60" height="56" rx="30" fill="' + sc + '"/>'; break;
      case 'square': face = '<rect x="20" y="27" width="60" height="56" rx="8" fill="' + sc + '"/>'; break;
      default:       face = '<ellipse cx="50" cy="55" rx="30" ry="28" fill="' + sc + '"/>'; break;
    }

    var eyes = '';
    switch (s.eyeStyle) {
      case 'almond':
        eyes = '<ellipse cx="37" cy="48" rx="6" ry="3.5" fill="#1a1a2e" transform="rotate(-10,37,48)"/>' +
               '<ellipse cx="63" cy="48" rx="6" ry="3.5" fill="#1a1a2e" transform="rotate(10,63,48)"/>'; break;
      case 'wide':
        eyes = '<ellipse cx="37" cy="48" rx="7" ry="3.5" fill="#1a1a2e"/><circle cx="39" cy="46.5" r="1.5" fill="white"/>' +
               '<ellipse cx="63" cy="48" rx="7" ry="3.5" fill="#1a1a2e"/><circle cx="65" cy="46.5" r="1.5" fill="white"/>'; break;
      case 'dot':
        eyes = '<circle cx="37" cy="48" r="3" fill="#1a1a2e"/><circle cx="63" cy="48" r="3" fill="#1a1a2e"/>'; break;
      case 'closed':
        eyes = '<line x1="31" y1="48" x2="43" y2="48" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round"/>' +
               '<line x1="57" y1="48" x2="69" y2="48" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round"/>'; break;
      case 'starry':
        eyes = '<text x="37" y="52" text-anchor="middle" font-size="10" fill="#f0c040">★</text>' +
               '<text x="63" y="52" text-anchor="middle" font-size="10" fill="#f0c040">★</text>'; break;
      default:
        eyes = '<circle cx="37" cy="48" r="4.5" fill="#1a1a2e"/><circle cx="39" cy="46.5" r="1.5" fill="white"/>' +
               '<circle cx="63" cy="48" r="4.5" fill="#1a1a2e"/><circle cx="65" cy="46.5" r="1.5" fill="white"/>'; break;
    }

    var nose = '';
    switch (s.noseStyle) {
      case 'button':
        nose = '<circle cx="47" cy="57" r="2" fill="rgba(0,0,0,0.18)"/><circle cx="53" cy="57" r="2" fill="rgba(0,0,0,0.18)"/>'; break;
      case 'line':
        nose = '<path d="M47,59 Q50,55 53,59" stroke="rgba(0,0,0,0.3)" stroke-width="1.8" fill="none" stroke-linecap="round"/>'; break;
      case 'triangle':
        nose = '<polygon points="50,52 46,60 54,60" fill="rgba(0,0,0,0.15)"/>'; break;
      case 'none': nose = ''; break;
      default: nose = '<circle cx="50" cy="57" r="2" fill="rgba(0,0,0,0.2)"/>'; break;
    }

    var mouth = '';
    switch (s.mouthStyle) {
      case 'grin':
        mouth = '<path d="M40,65 Q50,76 60,65 Q50,72 40,65 Z" fill="#1a1a2e"/>' +
                '<path d="M42,65 Q50,73 58,65" stroke="white" stroke-width="1.5" fill="none"/>'; break;
      case 'flat':
        mouth = '<line x1="42" y1="67" x2="58" y2="67" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round"/>'; break;
      case 'frown':
        mouth = '<path d="M40,70 Q50,63 60,70" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
      case 'smirk':
        mouth = '<path d="M43,67 Q51,73 61,65" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
      case 'open':
        mouth = '<ellipse cx="50" cy="68" rx="8" ry="5" fill="#1a1a2e"/><ellipse cx="50" cy="69" rx="5" ry="3" fill="#c084fc"/>'; break;
      default:
        mouth = '<path d="M40,66 Q50,74 60,66" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '">' +
      bg + hairBack + face + hairFront + eyes + nose + mouth + '</svg>';
  }

  window.__avatarRender = renderAvatarSVG;

  // ── Badge CSS ─────────────────────────────────────────────────────────────

  var BADGE_CSS = [
    '#avatar-badge{',
      'position:fixed;bottom:14px;right:14px;',
      'display:flex;align-items:center;gap:7px;',
      'background:rgba(28,23,48,0.9);',
      'border:1.5px solid #4c1d95;',
      'border-radius:24px;',
      'padding:5px 10px 5px 5px;',
      'z-index:9999;',
      'pointer-events:none;',
      'backdrop-filter:blur(6px);',
      '-webkit-backdrop-filter:blur(6px);',
      'max-width:160px;',
      'animation:avatar-badge-in 0.4s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '#avatar-badge svg{width:36px;height:36px;border-radius:50%;display:block;flex-shrink:0;overflow:hidden;}',
    '#avatar-badge-name{',
      'font-family:system-ui,-apple-system,sans-serif;',
      'font-size:0.72rem;font-weight:700;',
      'color:#e2d9f3;',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px;',
    '}',
    '@keyframes avatar-badge-in{',
      '0%{opacity:0;transform:translateY(12px) scale(0.85)}',
      '100%{opacity:1;transform:translateY(0) scale(1)}',
    '}'
  ].join('');

  // ── Init badge ────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function init() {
    try {
      var avatar = getActiveAvatar();
      if (!avatar || !avatar.nickname) return;

      if (!document.getElementById('avatar-badge-style')) {
        var style = document.createElement('style');
        style.id = 'avatar-badge-style';
        style.textContent = BADGE_CSS;
        document.head.appendChild(style);
      }

      var badge = document.createElement('div');
      badge.id = 'avatar-badge';
      badge.innerHTML =
        '<div id="avatar-badge-svg">' + renderAvatarSVG(avatar, '36') + '</div>' +
        '<span id="avatar-badge-name">' + escapeHtml(avatar.nickname) + '</span>';
      document.body.appendChild(badge);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
