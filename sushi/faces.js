/* ============================================================================
   faces.js — every drawn-on-canvas texture in the game: kawaii faces, number
   chips and customer order cards.

   Faces are painted onto a transparent canvas and applied to a small plane
   parented in front of a mesh, rather than UV-mapped onto the mesh itself —
   that way one face works on a slab, a sphere or a blob without any unwrap.
   ========================================================================== */
import * as THREE from 'three';

const texCache = new Map();

function canvasTexture(key, size, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

// ── Face painting ──────────────────────────────────────────────────────────

const INK   = '#4a3a3f';
const BLUSH = 'rgba(255,150,164,0.55)';

function eyeDot(g, x, y, r) {
  g.fillStyle = INK;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  // little highlight — the single detail that sells "cute"
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.32, 0, Math.PI * 2); g.fill();
}

function eyeClosed(g, x, y, r, down) {
  g.strokeStyle = INK;
  g.lineWidth = r * 0.55;
  g.lineCap = 'round';
  g.beginPath();
  if (down) g.arc(x, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85);
  else      g.arc(x, y - r * 0.2, r, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
}

function eyeSparkle(g, x, y, r) {
  g.strokeStyle = INK;
  g.lineWidth = r * 0.45;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x - r, y + r * 0.5); g.lineTo(x, y - r * 0.6); g.lineTo(x + r, y + r * 0.5);
  g.stroke();
}

function blushes(g, S, y, r) {
  g.fillStyle = BLUSH;
  g.beginPath(); g.ellipse(S * 0.22, y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(S * 0.78, y, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
}

/**
 * faceTexture(expression) — 'neutral' | 'blink' | 'happy' | 'excited' |
 * 'worried' | 'sad' | 'eating' | 'wow' | 'sleepy'
 */
export function faceTexture(expression) {
  return canvasTexture('face|' + expression, 256, (g, S) => {
    const ex = S * 0.32, exr = S * 0.68;   // eye x positions
    const ey = S * 0.42;                   // eye y
    const er = S * 0.085;                  // eye radius
    const my = S * 0.66;                   // mouth y

    g.clearRect(0, 0, S, S);
    blushes(g, S, S * 0.58, S * 0.1);

    g.strokeStyle = INK;
    g.lineWidth = S * 0.038;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    switch (expression) {
      case 'blink':
        eyeClosed(g, ex, ey, er, false); eyeClosed(g, exr, ey, er, false);
        g.beginPath(); g.arc(S / 2, my - S * 0.04, S * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        break;

      case 'happy':
        eyeClosed(g, ex, ey, er * 1.15, false); eyeClosed(g, exr, ey, er * 1.15, false);
        g.beginPath(); g.arc(S / 2, my - S * 0.05, S * 0.095, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
        break;

      case 'excited':
        eyeSparkle(g, ex, ey, er * 1.1); eyeSparkle(g, exr, ey, er * 1.1);
        g.fillStyle = INK;
        g.beginPath(); g.ellipse(S / 2, my, S * 0.1, S * 0.085, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ff8fa8';
        g.beginPath(); g.ellipse(S / 2, my + S * 0.04, S * 0.055, S * 0.04, 0, 0, Math.PI * 2); g.fill();
        break;

      case 'worried':
        eyeDot(g, ex, ey + S * 0.01, er); eyeDot(g, exr, ey + S * 0.01, er);
        // slanted brows
        g.beginPath(); g.moveTo(ex - er * 1.3, ey - er * 2.4); g.lineTo(ex + er * 1.1, ey - er * 1.5); g.stroke();
        g.beginPath(); g.moveTo(exr + er * 1.3, ey - er * 2.4); g.lineTo(exr - er * 1.1, ey - er * 1.5); g.stroke();
        g.beginPath(); g.arc(S / 2, my + S * 0.06, S * 0.08, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
        break;

      case 'sad':
        eyeClosed(g, ex, ey, er, true); eyeClosed(g, exr, ey, er, true);
        g.beginPath(); g.arc(S / 2, my + S * 0.07, S * 0.085, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
        // a single tear
        g.fillStyle = 'rgba(120,190,255,0.9)';
        g.beginPath();
        g.moveTo(exr + er * 1.4, ey + er * 0.6);
        g.quadraticCurveTo(exr + er * 2.4, ey + er * 2.6, exr + er * 1.4, ey + er * 3.2);
        g.quadraticCurveTo(exr + er * 0.4, ey + er * 2.6, exr + er * 1.4, ey + er * 0.6);
        g.fill();
        break;

      case 'eating':
        eyeClosed(g, ex, ey, er * 1.15, false); eyeClosed(g, exr, ey, er * 1.15, false);
        g.fillStyle = INK;
        g.beginPath(); g.ellipse(S / 2, my + S * 0.01, S * 0.13, S * 0.115, 0, 0, Math.PI * 2); g.fill();
        break;

      case 'wow':
        eyeDot(g, ex, ey, er * 1.25); eyeDot(g, exr, ey, er * 1.25);
        g.fillStyle = INK;
        g.beginPath(); g.ellipse(S / 2, my, S * 0.075, S * 0.105, 0, 0, Math.PI * 2); g.fill();
        break;

      case 'sleepy':
        eyeClosed(g, ex, ey, er, false); eyeClosed(g, exr, ey, er, false);
        g.beginPath(); g.ellipse(S / 2, my, S * 0.05, S * 0.06, 0, 0, Math.PI * 2); g.stroke();
        break;

      default: // neutral
        eyeDot(g, ex, ey, er); eyeDot(g, exr, ey, er);
        g.beginPath(); g.arc(S / 2, my - S * 0.03, S * 0.07, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
  });
}

/** A face plane sized to sit just in front of a mesh. */
export function makeFace(width, expression = 'neutral') {
  const mat = new THREE.MeshBasicMaterial({
    map: faceTexture(expression),
    transparent: true,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width), mat);
  mesh.renderOrder = 4;
  mesh.userData.isFace = true;
  return mesh;
}

/** Swap a face plane's expression. */
export function setFace(faceMesh, expression) {
  if (!faceMesh) return;
  if (faceMesh.userData.expression === expression) return;
  faceMesh.userData.expression = expression;
  faceMesh.material.map = faceTexture(expression);
  faceMesh.material.needsUpdate = true;
}

/**
 * Randomised blinking. Call every frame; swaps to 'blink' for a beat and back
 * to whatever resting expression the owner currently wants.
 */
export function updateBlink(faceMesh, dt, restingExpression) {
  const d = faceMesh.userData;
  if (d.blinkTimer === undefined) d.blinkTimer = 1 + Math.random() * 4;
  d.blinkTimer -= dt;
  if (d.blinkTimer <= 0) {
    if (d.blinking) { d.blinking = false; d.blinkTimer = 2.5 + Math.random() * 4; setFace(faceMesh, restingExpression); }
    else            { d.blinking = true;  d.blinkTimer = 0.12; setFace(faceMesh, 'blink'); }
  } else if (!d.blinking && d.expression !== restingExpression) {
    setFace(faceMesh, restingExpression);
  }
}

// ── Number chips ───────────────────────────────────────────────────────────

/**
 * A bold number on a soft rounded chip — the readable, high-contrast label
 * that carries the actual maths. Big and flat on purpose.
 */
export function numberTexture(value, bg = '#fffaf2', fg = '#5b4038') {
  return canvasTexture('num|' + value + '|' + bg + '|' + fg, 256, (g, S) => {
    g.clearRect(0, 0, S, S);
    const pad = S * 0.06, r = S * 0.28;
    g.fillStyle = 'rgba(120,80,70,0.18)';
    roundRect(g, pad, pad + S * 0.035, S - pad * 2, S - pad * 2, r); g.fill();
    g.fillStyle = bg;
    roundRect(g, pad, pad, S - pad * 2, S - pad * 2, r); g.fill();

    const txt = String(value);
    g.fillStyle = fg;
    g.font = '900 ' + (txt.length > 1 ? S * 0.58 : S * 0.66) + 'px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, S / 2, S * 0.54);
  });
}

/*  Chips, cards and rings are Sprites rather than planes: they must stay
    square-on to the player at any iPad aspect ratio, and the maths has to be
    the most legible thing on screen.  */
export function makeNumberChip(value, size = 0.62, bg, fg) {
  const mat = new THREE.SpriteMaterial({
    map: numberTexture(value, bg, fg),
    transparent: true,
    depthWrite: false
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(size, size, 1);
  sp.renderOrder = 6;
  return sp;
}

/** Repoint an existing chip at a new value (used by the ⭐ wildcard). */
export function setChipValue(chipMesh, value, bg, fg) {
  chipMesh.material.map = numberTexture(value, bg, fg);
  chipMesh.material.needsUpdate = true;
}

// ── Order cards ────────────────────────────────────────────────────────────

/**
 * The card a customer holds. `label` is what the child reads ("14", "20 − 6",
 * "double 7"); it is drawn large, with a small "I want" line above it.
 */
export function orderCardTexture(label, tint = '#fffaf2') {
  return canvasTexture('card|' + label + '|' + tint, 512, (g, S) => {
    g.clearRect(0, 0, S, S);
    const w = S * 0.92, h = S * 0.66, x = (S - w) / 2, y = (S - h) / 2;

    g.fillStyle = 'rgba(120,80,70,0.20)';
    roundRect(g, x, y + S * 0.028, w, h, S * 0.09); g.fill();
    g.fillStyle = tint;
    roundRect(g, x, y, w, h, S * 0.09); g.fill();
    g.strokeStyle = 'rgba(160,110,95,0.35)';
    g.lineWidth = S * 0.014;
    roundRect(g, x, y, w, h, S * 0.09); g.stroke();

    g.fillStyle = '#b48a7c';
    g.font = '800 ' + S * 0.072 + 'px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('I  W  A  N  T', S / 2, y + h * 0.22);

    const long = label.length > 6;
    g.fillStyle = '#5b4038';
    g.font = '900 ' + S * (long ? 0.17 : 0.28) + 'px system-ui, -apple-system, sans-serif';
    g.fillText(label, S / 2, y + h * 0.63);
  });
}

export function makeOrderCard(label, width = 1.5) {
  const mat = new THREE.SpriteMaterial({
    map: orderCardTexture(label),
    transparent: true,
    depthWrite: false
  });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(width, width, 1);
  sp.renderOrder = 8;
  return sp;
}

/** Repoint a card at a new label (customers re-order after being served). */
export function setOrderLabel(card, label) {
  card.material.map = orderCardTexture(label);
  card.material.needsUpdate = true;
}

// ── Patience ring ──────────────────────────────────────────────────────────

/**
 * The ring around a customer's card. Redrawn as the timer drains; goes from
 * green through amber to red so urgency reads without needing to read numbers.
 */
export function makePatienceRing(radius = 0.62) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(radius * 2, radius * 2, 1);
  sp.renderOrder = 7;
  sp.userData = { canvas: c, ctx: c.getContext('2d'), tex, lastStep: -1 };
  return sp;
}

export function updatePatienceRing(ring, fraction) {
  const d = ring.userData;
  const step = Math.round(Math.max(0, Math.min(1, fraction)) * 60);
  if (step === d.lastStep) return;         // only repaint when it visibly moves
  d.lastStep = step;

  const f = step / 60;
  const g = d.ctx, S = 256, cx = S / 2, cy = S / 2, r = S * 0.40, lw = S * 0.105;
  g.clearRect(0, 0, S, S);

  g.lineCap = 'round';
  g.lineWidth = lw;
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();

  const color = f > 0.55 ? '#6dd6a5' : f > 0.28 ? '#ffc24d' : '#ff7b8a';
  g.strokeStyle = color;
  g.beginPath();
  g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
  g.stroke();

  d.tex.needsUpdate = true;
}

// ── shared ─────────────────────────────────────────────────────────────────
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y,     x + w, y + h, r);
  g.arcTo(x + w, y + h, x,     y + h, r);
  g.arcTo(x,     y + h, x,     y,     r);
  g.arcTo(x,     y,     x + w, y,     r);
  g.closePath();
}
