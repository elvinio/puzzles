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
    dimpleColor: '#ffb3c6',
    browStyle: 'none',
    glassesStyle: 'none',
    glassesColor: '#1a1a2e',
    hatStyle: 'none',
    hatColor: '#ef4444'
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

  window.__avatarSetActiveId = function (id) {
    try { localStorage.setItem('puzzles-avatar-active', id); } catch (e) {}
    updateBadge();
    try { window.dispatchEvent(new CustomEvent('pz-avatar-change', { detail: { id: id } })); } catch (e) {}
  };

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

  // ── Coin balance ──────────────────────────────────────────────────────────
  // Coins are earned by answering chinese.html test questions correctly (1
  // coin, 2 for writing-mode cards) and spent via the PIN-gated deduct form
  // on avatar.html when they're exchanged for something outside the app.
  // coinsUpdatedAt is a plain timestamp (not a "best score") so cross-device
  // sync can pick whichever side changed most recently — see mergeOne in
  // sync-merge.js.

  window.__avatarGetCoins = function (avatarId) {
    var list = loadAvatars();
    var avatar = list.find(function (a) { return a.id === avatarId; });
    return avatar ? (avatar.coins || 0) : 0;
  };

  window.__avatarAddCoins = function (avatarId, amount) {
    if (!avatarId || !amount) return;
    try {
      var list = loadAvatars();
      var avatar = list.find(function (a) { return a.id === avatarId; });
      if (!avatar) return;
      avatar.coins = (avatar.coins || 0) + amount;
      avatar.coinsUpdatedAt = new Date().toISOString();
      saveAvatars(list);
      try { window.dispatchEvent(new CustomEvent('pz-avatar-coins-change', { detail: { id: avatarId, coins: avatar.coins } })); } catch (e2) {}
    } catch (e) {}
  };

  // Returns the new balance on success, or null if the balance was
  // insufficient (caller should treat null as "not deducted").
  window.__avatarDeductCoins = function (avatarId, amount) {
    try {
      var list = loadAvatars();
      var avatar = list.find(function (a) { return a.id === avatarId; });
      if (!avatar) return null;
      var bal = avatar.coins || 0;
      if (!(amount > 0) || amount > bal) return null;
      avatar.coins = bal - amount;
      avatar.coinsUpdatedAt = new Date().toISOString();
      saveAvatars(list);
      try { window.dispatchEvent(new CustomEvent('pz-avatar-coins-change', { detail: { id: avatarId, coins: avatar.coins } })); } catch (e2) {}
      return avatar.coins;
    } catch (e) { return null; }
  };

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
  // Layer order: bg → hairBack → face → hairFront → brows → eyes → nose → mouth → dimples → glasses → hat

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

        case 'afro':
          // Big round cloud surrounding the top half of the face
          hairBack = '<circle cx="50" cy="32" r="34" fill="' + hc + '"/>' +
                     '<circle cx="24" cy="42" r="14" fill="' + hc + '"/>' +
                     '<circle cx="76" cy="42" r="14" fill="' + hc + '"/>';
          break;

        case 'pigtails':
          // Short dome + two side bunches hanging below ear level
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q66,40 50,39 Q34,40 18,52 Z" fill="' + hc + '"/>' +
                     '<circle cx="13" cy="56" r="10" fill="' + hc + '"/>' +
                     '<circle cx="87" cy="56" r="10" fill="' + hc + '"/>' +
                     '<circle cx="12" cy="70" r="8" fill="' + hc + '"/>' +
                     '<circle cx="88" cy="70" r="8" fill="' + hc + '"/>';
          break;

        case 'mohawk':
          // Narrow centre strip of spikes, bare sides
          hairBack = '<path d="M40,32 L42,14 L46,26 L50,6 L54,26 L58,14 L60,32 Q55,28 50,28 Q45,28 40,32 Z" fill="' + hc + '"/>';
          break;

        case 'sidepart':
          // Asymmetric sweep: dome parted high on the left, longer over the right side
          hairBack = '<path d="M18,52 Q18,12 50,10 Q82,12 82,52 Q80,34 70,30 Q74,46 62,38 Q48,30 34,36 Q24,41 18,52 Z" fill="' + hc + '"/>';
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
      case 'happy':
        eyes = '<path d="M31,50 Q37,43 43,50" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
               '<path d="M57,50 Q63,43 69,50" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
      case 'wink':
        eyes = '<circle cx="37" cy="48" r="4.5" fill="#1a1a2e"/><circle cx="39" cy="46.5" r="1.5" fill="white"/>' +
               '<line x1="57" y1="48" x2="69" y2="48" stroke="#1a1a2e" stroke-width="2.5" stroke-linecap="round"/>'; break;
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
      case 'tongue':
        mouth = '<path d="M40,65 Q50,74 60,65" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
                '<path d="M46,68 Q46,76 51,75 Q56,74 55,67 Q50,71 46,68 Z" fill="#ff8fab"/>'; break;
      case 'cat':
        mouth = '<path d="M40,65 Q45,71 50,66 Q55,71 60,65" stroke="#1a1a2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
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
      } else if (s.dimpleStyle === 'freckles') {
        // A few small dots scattered across each cheek
        dimples = '<circle cx="30" cy="63" r="1.6" fill="' + dc + '" opacity="0.85"/>' +
                  '<circle cx="35" cy="66" r="1.6" fill="' + dc + '" opacity="0.85"/>' +
                  '<circle cx="30" cy="69" r="1.6" fill="' + dc + '" opacity="0.85"/>' +
                  '<circle cx="70" cy="63" r="1.6" fill="' + dc + '" opacity="0.85"/>' +
                  '<circle cx="65" cy="66" r="1.6" fill="' + dc + '" opacity="0.85"/>' +
                  '<circle cx="70" cy="69" r="1.6" fill="' + dc + '" opacity="0.85"/>';
      }
    }

    // ── Eyebrows ──────────────────────────────────────────────────────────
    // Drawn in hair color, sitting just above the eyes (eyes at y≈48).
    var brows = '';
    if (s.browStyle && s.browStyle !== 'none') {
      var bc = s.hairColor;
      switch (s.browStyle) {
        case 'straight':
          brows = '<line x1="31" y1="40" x2="43" y2="40" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                  '<line x1="57" y1="40" x2="69" y2="40" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>'; break;
        case 'curved':
          brows = '<path d="M31,41 Q37,37 43,41" stroke="' + bc + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
                  '<path d="M57,41 Q63,37 69,41" stroke="' + bc + '" stroke-width="2.5" fill="none" stroke-linecap="round"/>'; break;
        case 'angry':
          brows = '<line x1="31" y1="38" x2="43" y2="42" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                  '<line x1="57" y1="42" x2="69" y2="38" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>'; break;
        case 'worried':
          brows = '<line x1="31" y1="42" x2="43" y2="38" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                  '<line x1="57" y1="38" x2="69" y2="42" stroke="' + bc + '" stroke-width="2.5" stroke-linecap="round"/>'; break;
        case 'thick':
          brows = '<rect x="30" y="38" width="14" height="4.5" rx="2.2" fill="' + bc + '"/>' +
                  '<rect x="56" y="38" width="14" height="4.5" rx="2.2" fill="' + bc + '"/>'; break;
      }
    }

    // ── Glasses ───────────────────────────────────────────────────────────
    // Fixed dark frame, centred on the eyes (y≈48).
    var glasses = '';
    if (s.glassesStyle && s.glassesStyle !== 'none') {
      var gc = s.glassesColor || '#1a1a2e';
      switch (s.glassesStyle) {
        case 'round':
          glasses = '<circle cx="37" cy="48" r="9" fill="none" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<circle cx="63" cy="48" r="9" fill="none" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="46" y1="48" x2="54" y2="48" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="28" y1="46" x2="22" y2="44" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                    '<line x1="72" y1="46" x2="78" y2="44" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>'; break;
        case 'square':
          glasses = '<rect x="28" y="40" width="18" height="15" rx="3" fill="none" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<rect x="54" y="40" width="18" height="15" rx="3" fill="none" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="46" y1="46" x2="54" y2="46" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="28" y1="45" x2="22" y2="43" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                    '<line x1="72" y1="45" x2="78" y2="43" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>'; break;
        case 'sunglasses':
          glasses = '<rect x="27" y="41" width="19" height="14" rx="5" fill="' + gc + '"/>' +
                    '<rect x="54" y="41" width="19" height="14" rx="5" fill="' + gc + '"/>' +
                    '<line x1="46" y1="45" x2="54" y2="45" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="27" y1="45" x2="21" y2="43" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                    '<line x1="73" y1="45" x2="79" y2="43" stroke="' + gc + '" stroke-width="2.5" stroke-linecap="round"/>' +
                    '<line x1="31" y1="45" x2="36" y2="50" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>' +
                    '<line x1="58" y1="45" x2="63" y2="50" stroke="rgba(255,255,255,0.35)" stroke-width="2"/>'; break;
        case 'star':
          glasses = '<text x="37" y="55" text-anchor="middle" font-size="22" fill="#f0c040" stroke="' + gc + '" stroke-width="0.8">★</text>' +
                    '<text x="63" y="55" text-anchor="middle" font-size="22" fill="#f0c040" stroke="' + gc + '" stroke-width="0.8">★</text>' +
                    '<line x1="46" y1="47" x2="54" y2="47" stroke="' + gc + '" stroke-width="2.5"/>'; break;
        case 'heart':
          glasses = '<text x="37" y="56" text-anchor="middle" font-size="22" fill="' + gc + '">♥</text>' +
                    '<text x="63" y="56" text-anchor="middle" font-size="22" fill="' + gc + '">♥</text>' +
                    '<line x1="46" y1="47" x2="54" y2="47" stroke="' + gc + '" stroke-width="2.5"/>'; break;
        case 'monocle':
          glasses = '<circle cx="63" cy="48" r="9" fill="none" stroke="' + gc + '" stroke-width="2.5"/>' +
                    '<line x1="63" y1="57" x2="70" y2="80" stroke="' + gc + '" stroke-width="1.5"/>' +
                    '<circle cx="70" cy="82" r="2.2" fill="' + gc + '"/>'; break;
      }
    }

    // ── Headwear ──────────────────────────────────────────────────────────
    // Topmost layer, sits over the hair dome (dome top y≈10).
    var hat = '';
    if (s.hatStyle && s.hatStyle !== 'none') {
      var tc = s.hatColor || '#ef4444';
      switch (s.hatStyle) {
        case 'cap':
          hat = '<path d="M22,26 Q22,4 50,4 Q78,4 78,26 Q64,20 50,20 Q36,20 22,26 Z" fill="' + tc + '"/>' +
                '<path d="M50,20 Q78,20 84,28 Q66,26 50,26 Z" fill="' + tc + '" stroke="rgba(0,0,0,0.15)" stroke-width="1"/>' +
                '<circle cx="50" cy="6" r="2.5" fill="rgba(0,0,0,0.2)"/>'; break;
        case 'beanie':
          hat = '<path d="M22,28 Q22,4 50,4 Q78,4 78,28 L78,30 Q64,24 50,24 Q36,24 22,30 Z" fill="' + tc + '"/>' +
                '<path d="M20,30 Q50,20 80,30 L80,24 Q50,14 20,24 Z" fill="' + tc + '" opacity="0.75"/>' +
                '<circle cx="50" cy="4" r="4" fill="' + tc + '" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>'; break;
        case 'party':
          hat = '<path d="M50,0 L64,28 Q50,22 36,28 Z" fill="' + tc + '"/>' +
                '<line x1="43" y1="15" x2="55" y2="11" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>' +
                '<line x1="40" y1="23" x2="58" y2="17" stroke="rgba(255,255,255,0.5)" stroke-width="2"/>' +
                '<circle cx="50" cy="2" r="3.5" fill="#f0c040"/>'; break;
        case 'crown':
          hat = '<path d="M28,26 L26,8 L36,17 L50,3 L64,17 L74,8 L72,26 Q50,18 28,26 Z" fill="' + tc + '"/>' +
                '<circle cx="26" cy="7" r="2.5" fill="#f0c040"/><circle cx="50" cy="3" r="2.5" fill="#f0c040"/><circle cx="74" cy="7" r="2.5" fill="#f0c040"/>'; break;
        case 'bow':
          hat = '<path d="M50,12 L36,4 Q32,12 36,20 Z" fill="' + tc + '"/>' +
                '<path d="M50,12 L64,4 Q68,12 64,20 Z" fill="' + tc + '"/>' +
                '<circle cx="50" cy="12" r="4" fill="' + tc + '" stroke="rgba(0,0,0,0.2)" stroke-width="1.5"/>'; break;
        case 'headphones':
          hat = '<path d="M20,45 Q20,8 50,8 Q80,8 80,45" fill="none" stroke="' + tc + '" stroke-width="5" stroke-linecap="round"/>' +
                '<rect x="12" y="42" width="10" height="16" rx="5" fill="' + tc + '"/>' +
                '<rect x="78" y="42" width="10" height="16" rx="5" fill="' + tc + '"/>'; break;
        case 'flower':
          hat = '<circle cx="72" cy="14" r="7" fill="' + tc + '"/><circle cx="80" cy="19" r="7" fill="' + tc + '"/>' +
                '<circle cx="77" cy="27" r="7" fill="' + tc + '"/><circle cx="67" cy="27" r="7" fill="' + tc + '"/>' +
                '<circle cx="64" cy="19" r="7" fill="' + tc + '"/><circle cx="72" cy="20" r="5" fill="#f0c040"/>'; break;
        case 'halo':
          hat = '<ellipse cx="50" cy="2" rx="17" ry="4.5" fill="none" stroke="' + tc + '" stroke-width="3" opacity="0.85"/>'; break;
        case 'bandana':
          hat = '<path d="M18,32 Q18,6 50,6 Q82,6 82,32 Q66,18 50,18 Q34,18 18,32 Z" fill="' + tc + '"/>' +
                '<path d="M50,18 L43,32 L57,32 Z" fill="' + tc + '" opacity="0.7"/>' +
                '<path d="M78,26 L94,36 L89,20 Z" fill="' + tc + '"/>'; break;
      }
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + sz + '" height="' + sz + '">' +
      bg + hairBack + face + hairFront + brows + eyes + nose + mouth + dimples + glasses + hat + '</svg>';
  }

  window.__avatarRender = renderAvatarSVG;

  // ── Badge CSS ─────────────────────────────────────────────────────────────

  var BADGE_CSS = [
    '#avatar-badge{',
      'position:fixed;bottom:14px;right:14px;',
      'display:flex;align-items:center;',
      'z-index:9999;',
      'cursor:pointer;',
      'pointer-events:all;',
      'text-decoration:none;',
      'transition:transform 0.12s;',
      'animation:avatar-badge-in 0.4s cubic-bezier(0.34,1.56,0.64,1);',
    '}',
    '#avatar-badge:active{',
      'transform:scale(0.92);',
    '}',
    '#avatar-badge svg{width:40px;height:40px;border-radius:50%;display:block;flex-shrink:0;overflow:hidden;}',
    '#avatar-badge-name{display:none;}',
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

  function updateBadge() {
    try {
      var badge = document.getElementById('avatar-badge');
      if (!badge) return;
      var avatar = getActiveAvatar();
      if (!avatar) return;
      var svgHolder = document.getElementById('avatar-badge-svg');
      var nameHolder = document.getElementById('avatar-badge-name');
      if (svgHolder) svgHolder.innerHTML = renderAvatarSVG(avatar, '36');
      if (nameHolder) nameHolder.textContent = avatar.nickname || '';
    } catch (e) {}
  }

  window.__avatarUpdateBadge = updateBadge;

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
        if (window.PZSyncUI && typeof window.PZSyncUI.openMenu === 'function') {
          window.PZSyncUI.openMenu();
        } else {
          window.location.href = 'avatar.html';
        }
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
