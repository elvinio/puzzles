/* ============================================================================
   fx.js — tiny tween engine, squash-and-stretch helpers, particle bursts and
   camera shake for Tamago's Sushi Bar.

   No external tween library: every animation in the game is a Tween pushed
   onto one list that main.js pumps once per frame with the frame delta.
   ========================================================================== */
import * as THREE from 'three';

// ── Easing ─────────────────────────────────────────────────────────────────
export const Ease = {
  linear:   t => t,
  inQuad:   t => t * t,
  outQuad:  t => t * (2 - t),
  inOutQuad:t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: t => (--t) * t * t + 1,
  inCubic:  t => t * t * t,
  outBack:  t => { const c = 1.70158 + 1; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: t => {
    if (t === 0 || t === 1) return t;
    const p = 0.36;
    return Math.pow(2, -11 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  },
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d)      return n * t * t;
    if (t < 2 / d)      return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d)    return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
};

// ── Tween engine ───────────────────────────────────────────────────────────
const tweens = [];

/**
 * tween({ dur, delay, ease, onUpdate(t01, raw), onDone })
 * Returns a handle with .cancel(). Durations are in seconds.
 */
export function tween(opts) {
  const t = {
    dur:   opts.dur || 0.3,
    delay: opts.delay || 0,
    ease:  opts.ease || Ease.outCubic,
    onUpdate: opts.onUpdate,
    onDone:   opts.onDone,
    elapsed: 0,
    dead: false,
    cancel() { this.dead = true; }
  };
  tweens.push(t);
  return t;
}

/** Convenience: run a callback after `delay` seconds, on the game clock. */
export function after(delay, fn) {
  return tween({ dur: 0.0001, delay, onDone: fn });
}

export function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    if (t.dead) { tweens.splice(i, 1); continue; }

    // NB: keep the leftover time in a local — mutating `dt` here would leak
    // into every other tween processed this frame.
    let step = dt;
    if (t.delay > 0) {
      t.delay -= dt;
      if (t.delay > 0) continue;
      step = -t.delay;      // the slice of this frame left after the delay ended
      t.delay = 0;
    }

    t.elapsed += step;
    const raw = Math.min(1, t.elapsed / t.dur);
    if (t.onUpdate) t.onUpdate(t.ease(raw), raw);
    if (raw >= 1) {
      tweens.splice(i, 1);
      if (t.onDone) t.onDone();
    }
  }
}

/** Drop every pending tween — used when restarting the game. */
export function clearTweens() { tweens.length = 0; }

// ── Motion recipes ─────────────────────────────────────────────────────────

/** Squash on impact, then spring back. The signature clay-landing feel. */
export function squashLand(obj, amount = 0.4, dur = 0.45) {
  const bx = obj.userData.baseScale ? obj.userData.baseScale.x : 1;
  const by = obj.userData.baseScale ? obj.userData.baseScale.y : 1;
  const bz = obj.userData.baseScale ? obj.userData.baseScale.z : 1;
  tween({
    dur, ease: Ease.outElastic,
    onUpdate: t => {
      // start squashed (flat & wide) and elastically settle back to base
      const s = 1 - (1 - t) * amount;
      const w = 1 + (1 - t) * amount * 0.6;
      obj.scale.set(bx * w, by * s, bz * w);
    },
    onDone: () => obj.scale.set(bx, by, bz)
  });
}

/** A quick happy hop in place. */
export function hop(obj, height = 0.35, dur = 0.45) {
  const y0 = obj.position.y;
  tween({
    dur, ease: Ease.linear,
    onUpdate: t => { obj.position.y = y0 + Math.sin(t * Math.PI) * height; },
    onDone: () => { obj.position.y = y0; }
  });
}

/** Side-to-side "nope" wobble. */
export function wobble(obj, amount = 0.22, dur = 0.5) {
  const r0 = obj.rotation.z;
  tween({
    dur, ease: Ease.linear,
    onUpdate: t => { obj.rotation.z = r0 + Math.sin(t * Math.PI * 6) * amount * (1 - t); },
    onDone: () => { obj.rotation.z = r0; }
  });
}

/** Grow in from nothing with an overshoot. */
export function popIn(obj, dur = 0.5, delay = 0) {
  const b = obj.userData.baseScale || new THREE.Vector3(1, 1, 1);
  obj.scale.set(0.001, 0.001, 0.001);
  tween({
    dur, delay, ease: Ease.outBack,
    onUpdate: t => obj.scale.set(b.x * t, b.y * t, b.z * t),
    onDone: () => obj.scale.copy(b)
  });
}

/** Shrink away, then run `done` (usually a removal from the scene). */
export function popOut(obj, dur = 0.35, done) {
  const b = obj.scale.clone();
  tween({
    dur, ease: Ease.inCubic,
    onUpdate: t => obj.scale.set(b.x * (1 - t), b.y * (1 - t), b.z * (1 - t)),
    onDone: () => { if (done) done(); }
  });
}

/**
 * Arc an object from its current position to `to` along a lobbed bezier,
 * spinning as it flies. Used for ingredients flying to the plate and for
 * finished sushi flying into a customer's mouth.
 */
export function arcTo(obj, to, opts = {}) {
  const from = obj.position.clone();
  const lift = opts.lift !== undefined ? opts.lift : Math.max(1.2, from.distanceTo(to) * 0.45);
  const dur  = opts.dur || 0.55;
  const spin = opts.spin !== undefined ? opts.spin : Math.PI * 2;
  const r0   = obj.rotation.y;
  const mid  = from.clone().add(to).multiplyScalar(0.5);
  mid.y += lift;

  tween({
    dur, delay: opts.delay || 0, ease: opts.ease || Ease.inOutQuad,
    onUpdate: t => {
      const u = 1 - t;
      // quadratic bezier from → mid → to
      obj.position.x = u * u * from.x + 2 * u * t * mid.x + t * t * to.x;
      obj.position.y = u * u * from.y + 2 * u * t * mid.y + t * t * to.y;
      obj.position.z = u * u * from.z + 2 * u * t * mid.z + t * t * to.z;
      obj.rotation.y = r0 + spin * t;
    },
    onDone: () => { obj.position.copy(to); if (opts.onDone) opts.onDone(); }
  });
}

// ── Particles ──────────────────────────────────────────────────────────────
// A pooled set of camera-facing sprites. Cheap, and the soft blobby shapes
// suit the claymation look better than a points cloud would.

const spriteCache = new Map();

function blobTexture(kind, color) {
  const key = kind + '|' + color;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = color;

  if (kind === 'heart') {
    g.translate(S / 2, S / 2 + 4);
    g.scale(1.5, 1.5);
    g.beginPath();
    g.moveTo(0, 12);
    g.bezierCurveTo(-16, -2, -11, -16, 0, -8);
    g.bezierCurveTo(11, -16, 16, -2, 0, 12);
    g.fill();
  } else if (kind === 'star') {
    g.translate(S / 2, S / 2);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 10 : 24;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else if (kind === 'note') {
    g.translate(S / 2, S / 2);
    g.beginPath(); g.ellipse(-6, 10, 9, 7, -0.4, 0, Math.PI * 2); g.fill();
    g.fillRect(1, -16, 4, 27);
    g.beginPath(); g.moveTo(5, -16); g.quadraticCurveTo(20, -12, 16, 0);
    g.lineTo(13, -2); g.quadraticCurveTo(15, -9, 5, -10); g.fill();
  } else { // 'puff'
    const grd = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
    grd.addColorStop(0, color);
    grd.addColorStop(0.65, color);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  spriteCache.set(key, tex);
  return tex;
}

let particleRoot = null;
export function initParticles(scene) {
  particleRoot = new THREE.Group();
  particleRoot.name = 'particles';
  scene.add(particleRoot);
}

/**
 * burst(position, { kind, colors, count, spread, rise, size, dur })
 * kind: 'puff' | 'heart' | 'star' | 'note'
 */
export function burst(position, opts = {}) {
  if (!particleRoot) return;
  const kind   = opts.kind || 'puff';
  const colors = opts.colors || ['#ffffff'];
  const count  = opts.count || 10;
  const spread = opts.spread !== undefined ? opts.spread : 0.9;
  const rise   = opts.rise !== undefined ? opts.rise : 1.1;
  const size   = opts.size || 0.4;
  const dur    = opts.dur || 0.9;

  for (let i = 0; i < count; i++) {
    const color = colors[i % colors.length];
    const mat = new THREE.SpriteMaterial({
      map: blobTexture(kind, color),
      transparent: true,
      depthWrite: false
    });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(position);
    const s0 = size * (0.7 + Math.random() * 0.6);
    sp.scale.set(s0, s0, s0);
    particleRoot.add(sp);

    const a  = Math.random() * Math.PI * 2;
    const rr = Math.random() * spread;
    const dx = Math.cos(a) * rr;
    const dz = Math.sin(a) * rr;
    const dy = rise * (0.6 + Math.random() * 0.8);
    const p0 = sp.position.clone();
    const life = dur * (0.75 + Math.random() * 0.5);

    tween({
      dur: life, ease: Ease.outCubic,
      onUpdate: t => {
        sp.position.set(p0.x + dx * t, p0.y + dy * t - 0.9 * t * t, p0.z + dz * t);
        mat.opacity = 1 - t * t;
        const s = s0 * (1 + t * 0.5);
        sp.scale.set(s, s, s);
      },
      onDone: () => { particleRoot.remove(sp); mat.map = null; mat.dispose(); }
    });
  }
}

/** A floating "+120" style score chip that drifts up and fades. */
export function floatText(position, text, color = '#ff7aa2', size = 0.9) {
  if (!particleRoot) return;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 76px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 12;
  g.lineJoin = 'round';
  g.strokeStyle = '#fffaf2';
  g.strokeText(text, 128, 64);
  g.fillStyle = color;
  g.fillText(text, 128, 64);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
  const sp = new THREE.Sprite(mat);
  sp.position.copy(position);
  sp.scale.set(size * 2, size, 1);
  sp.renderOrder = 20;
  particleRoot.add(sp);

  const y0 = sp.position.y;
  tween({
    dur: 1.15, ease: Ease.outCubic,
    onUpdate: t => {
      sp.position.y = y0 + t * 1.4;
      mat.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const k = 1 + Ease.outBack(Math.min(1, t * 4)) * 0.25;
      sp.scale.set(size * 2 * k, size * k, 1);
    },
    onDone: () => { particleRoot.remove(sp); tex.dispose(); mat.dispose(); }
  });
}

// ── Camera shake ───────────────────────────────────────────────────────────
let shakeAmount = 0;
export function shake(amount = 0.12) { shakeAmount = Math.max(shakeAmount, amount); }

export function applyShake(camera, baseTarget, dt) {
  if (shakeAmount <= 0.0001) return;
  shakeAmount = Math.max(0, shakeAmount - dt * 0.6);
  camera.position.x += (Math.random() - 0.5) * shakeAmount;
  camera.position.y += (Math.random() - 0.5) * shakeAmount;
  camera.lookAt(baseTarget);
}
