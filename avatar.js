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
    hairColor: '#2c1810',
    dimpleStyle: 'none',
    dimpleColor: '#ffb3c6'
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
  // viewBox="0 0 100 100"
  // Face centre: (50, 55). Hair dome sides land at y≈52, inner fill y≈39.
  // Layer order: bg → hairBack → face → hairFront → eyes → nose → mouth → dimples

  function renderAvatarSVG(state, size) {
    var s = Object.assign({}, DEFAULTS, state);
    var sz = size || '100';

    // ── Background ────────────────────────────────────────────────────────
    var bg = '<rect width="100" height="100" fill="' + s.bgColor + '" rx="16"/>';

    // ── Hair (back layer, drawn before face) ──────────────────────────────
    // Inner arc baseline sits at y≈39; sides meet face at y≈52.
    // These y-values ensure hair dome clearly overlaps the face top edge (y≈27).
    var hairBack = '', hairFront = '';
    if (s.hairStyle !== 'none') {
      var hc = s.hairColor;
      switch (s.hairStyle) {
        case 'short':
          // Simple dome cap
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
          break;

        case 'long':
          // Dome + side curtains extending below the face
          hairBack = '<path d="M18,52 Q12,68 14,88 Q28,96 50,92 Q72,96 86,88 Q88,68 82,52 Q82,12 50,10 Q18,12 18,52 Z" fill="' + hc + '"/>';
          break;

        case 'curly':
          // Bumpy/wavy dome
          hairBack = '<path d="M18,52 Q20,22 26,16 Q29,12 33,16 Q37,12 41,16 Q45,12 50,10 Q55,12 59,16 Q63,12 67,16 Q71,12 74,16 Q80,22 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
          break;

        case 'bun':
          // Short dome + top-knot circle drawn AFTER face (via hairFront)
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
          hairFront = '<circle cx="50" cy="7" r="11" fill="' + hc + '"/>';
          break;

        case 'spiky':
          // Triangle spikes along the top
          hairBack = '<path d="M18,52 L19,30 L25,44 L31,22 L37,40 L43,18 L50,10 L57,18 L63,40 L69,22 L75,44 L81,30 L82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
          break;

        case 'bangs':
          // Short dome (back) + forehead-covering fringe (front, drawn after face)
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
          hairFront = '<path d="M18,52 Q26,36 50,34 Q74,36 82,52 Q66,45 50,44 Q34,45 18,52 Z" fill="' + hc + '"/>';
          break;

        case 'hands':
          // Two hands at sides + two legs at bottom (four circles only, no hair dome)
          hairBack = '';
          hairFront = '<circle cx="15" cy="50" r="8" fill="' + hc + '"/>' +    // left hand
                      '<circle cx="85" cy="50" r="8" fill="' + hc + '"/>' +    // right hand
                      '<circle cx="28" cy="90" r="7" fill="' + hc + '"/>' +    // left leg
                      '<circle cx="72" cy="90" r="7" fill="' + hc + '"/>';     // right leg
          break;

        case 'avocado':
          // Teardrop/avocado shape: pointed at the top, wide and round at the bottom.
          // The face drawn on top becomes the "pit" sitting in the lower-centre.
          hairBack = '<path d="M50,2 C27,2 5,22 5,57 C5,80 24,99 50,99 C76,99 95,80 95,57 C95,22 73,2 50,2 Z" fill="' + hc + '"/>';
          break;

        default:
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>';
      }
    }

    // ── Face shape ────────────────────────────────────────────────────────
    var face = '';
    var sc = s.skinColor;
    switch (s.faceShape) {
      case 'oval':
        // Taller than wide
        face = '<ellipse cx="50" cy="56" rx="26" ry="33" fill="' + sc + '"/>'; break;
      case 'rect':
        // Wider rectangle with soft rounded corners — clearly wider than tall
        face = '<rect x="13" y="30" width="74" height="52" rx="14" fill="' + sc + '"/>'; break;
      case 'tall':
        // Tall rectangle with high corner radius — long vertical orientation
        face = '<rect x="23" y="18" width="54" height="74" rx="18" fill="' + sc + '"/>'; break;
      case 'square':
        // Boxy / angular — small corner radius
        face = '<rect x="20" y="27" width="60" height="56" rx="6" fill="' + sc + '"/>'; break;
      default:
        // circle — classic round ellipse
        face = '<ellipse cx="50" cy="55" rx="30" ry="28" fill="' + sc + '"/>'; break;
    }

    // ── Eyes ──────────────────────────────────────────────────────────────
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
      default: // round
        eyes = '<circle cx="37" cy="48" r="4.5" fill="#1a1a2e"/><circle cx="39" cy="46.5" r="1.5" fill="white"/>' +
               '<circle cx="63" cy="48" r="4.5" fill="#1a1a2e"/><circle cx="65" cy="46.5" r="1.5" fill="white"/>'; break;
    }

    // ── Nose ──────────────────────────────────────────────────────────────
    var nose = '';
    switch (s.noseStyle) {
      case 'button':
        nose = '<circle cx="47" cy="57" r="2" fill="rgba(0,0,0,0.18)"/><circle cx="53" cy="57" r="2" fill="rgba(0,0,0,0.18)"/>'; break;
      case 'line':
        nose = '<path d="M47,59 Q50,55 53,59" stroke="rgba(0,0,0,0.3)" stroke-width="1.8" fill="none" stroke-linecap="round"/>'; break;
      case 'triangle':
        nose = '<polygon points="50,52 46,60 54,60" fill="rgba(0,0,0,0.15)"/>'; break;
      case 'none': nose = ''; break;
      default: // dot
        nose = '<circle cx="50" cy="57" r="2" fill="rgba(0,0,0,0.2)"/>'; break;
    }

    // ── Mouth ─────────────────────────────────────────────────────────────
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
      default: // smile
        mouth = '<path d="M40,66 Q50,74 60,66" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
    }

    // ── Dimples ───────────────────────────────────────────────────────────
    var dimples = '';
    if (s.dimpleStyle !== 'none') {
      var dc = s.dimpleColor || '#ffb3c6';
      if (s.dimpleStyle === 'round') {
        // Circular dimples
        dimples = '<circle cx="33" cy="66" r="6" fill="' + dc + '" opacity="0.72"/>' +
                  '<circle cx="67" cy="66" r="6" fill="' + dc + '" opacity="0.72"/>';
      } else if (s.dimpleStyle === 'oval') {
        // Oval dimples with long side horizontal
        dimples = '<ellipse cx="33" cy="66" rx="7" ry="5" fill="' + dc + '" opacity="0.72"/>' +
                  '<ellipse cx="67" cy="66" rx="7" ry="5" fill="' + dc + '" opacity="0.72"/>';
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '">' +
      bg + hairBack + face + hairFront + eyes + nose + mouth + dimples + '</svg>';
  }

  window.__avatarRender = renderAvatarSVG;

  // ── Badge CSS ─────────────────────────────────────────────────────────────

  var BADGE_CSS = [
    '#avatar-badge{',
      'position:fixed;bottom:14px;right:14px;',
      'display:flex;align-items:center;gap:7px;',
      'background:rgba(28,23,48,0.92);',
      'border:1.5px solid #4c1d95;',
      'border-radius:24px;',
      'padding:5px 10px 5px 5px;',
      'z-index:9999;',
      'cursor:pointer;',
      'pointer-events:all;',
      'backdrop-filter:blur(6px);',
      '-webkit-backdrop-filter:blur(6px);',
      'max-width:160px;',
      'text-decoration:none;',
      'transition:border-color 0.18s, background 0.18s, transform 0.12s;',
      'animation:avatar-badge-in 0.4s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '#avatar-badge:active{',
      'transform:scale(0.92);',
      'border-color:#7c3aed;',
      'background:rgba(109,40,217,0.45);',
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

      // Don't show badge on the avatar management page itself
      if (window.location.pathname.indexOf('avatar.html') !== -1) return;

      var badge = document.createElement('div');
      badge.id = 'avatar-badge';
      badge.setAttribute('role', 'button');
      badge.setAttribute('aria-label', 'Change avatar');
      badge.innerHTML =
        '<div id="avatar-badge-svg">' + renderAvatarSVG(avatar, '36') + '</div>' +
        '<span id="avatar-badge-name">' + escapeHtml(avatar.nickname) + '</span>';

      badge.addEventListener('click', function () {
        window.location.href = 'avatar.html';
      });

      document.body.appendChild(badge);
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
