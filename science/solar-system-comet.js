/* ============================================================================
   solar-system-comet.js — Halley's tail: anti-sunward, not backwards.

   Everyone's mental picture of a comet has the tail trailing behind it like
   smoke off a car — pointing back along the way it came. The real physics is
   simpler and stranger: sunlight and the solar wind blow the tail straight
   away from the Sun, full stop, regardless of which way the comet is moving.
   Inbound, the tail trails behind. Outbound, it leads the way. That flip,
   right around perihelion, is the one thing this module exists to show.

   The Sun sits at the scene origin (see solar-system-earth.js for the same
   trick), so "away from the Sun" from any position is just that position's
   own direction, normalized — no separate sun-direction bookkeeping needed.

   The tail itself is a soft, additive-blended cone: apex pinned to the
   nucleus, flared base pointing away from the Sun, re-oriented and rescaled
   every frame from the comet's real heliocentric distance so it grows
   approaching perihelion and fades to nothing out past a few au, same as a
   real comet's coma only ever lighting up near the Sun.
   ========================================================================== */
import * as THREE from 'three';

/** Unit cone: apex at the local origin, a flared ring of radius 1 at local
 *  y = 1. uv.y is 1 at the apex and 0 at the base rim, so a texture painted
 *  bright-to-transparent top-to-bottom (see tailTexture()) reads bright at
 *  the nucleus and fades out towards the tip. */
function tailGeometry(radialSegments) {
  const positions = [0, 0, 0];
  const uvs = [0.5, 1];
  for (let i = 0; i <= radialSegments; i++) {
    const a = (i / radialSegments) * Math.PI * 2;
    positions.push(Math.cos(a), 1, Math.sin(a));
    uvs.push(i / radialSegments, 0);
  }
  const index = [];
  for (let i = 0; i < radialSegments; i++) index.push(0, i + 1, i + 2);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  return geo;
}

/** Vertical gradient: bright and opaque at the canvas top, fading to nothing
 *  at the bottom. With flipY (the texture default) that's uv.y = 1 → top, so
 *  it lines up with the apex end of tailGeometry() above. */
function tailTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0.00, 'rgba(235,245,255,0.95)');
  g.addColorStop(0.35, 'rgba(210,230,255,0.55)');
  g.addColorStop(0.75, 'rgba(190,220,255,0.16)');
  g.addColorStop(1.00, 'rgba(190,220,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build Halley's tail. `nucleusRadius` is the comet's own drawn radius (scene
 * units) — the tail's length and width are expressed as multiples of it, the
 * same way the Sun's haloes size themselves off `sunRadius`, so the tail
 * always reads as proportionate to its (tiny) nucleus regardless of the
 * squeezed/real-gaps toggle or how far out the camera is.
 *
 * The caller adds `mesh` under the comet's own group (so it inherits the
 * comet's position for free) and calls `update(scenePos, distanceAu)` once a
 * frame with the comet's scene-space position and its real Sun distance.
 */
export function buildCometTail(nucleusRadius, {
  minMult = 3, maxMult = 150, nearAu = 0.9, farAu = 6.5
} = {}) {
  const mesh = new THREE.Mesh(
    tailGeometry(24),
    new THREE.MeshBasicMaterial({
      map: tailTexture(), transparent: true, depthWrite: false,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    })
  );
  mesh.visible = false;

  const UP = new THREE.Vector3(0, 1, 0);
  const _dir = new THREE.Vector3();
  const _q = new THREE.Quaternion();

  function update(scenePos, distanceAu) {
    const t = Math.min(1, Math.max(0, 1 - (distanceAu - nearAu) / (farAu - nearAu)));
    const strength = t * t;
    if (strength < 0.004) { mesh.visible = false; return; }

    mesh.visible = true;
    _dir.copy(scenePos).normalize();           // away from the Sun, which sits at the origin
    _q.setFromUnitVectors(UP, _dir);
    mesh.quaternion.copy(_q);

    const length = nucleusRadius * (minMult + (maxMult - minMult) * strength);
    const width = nucleusRadius * (1.4 + 5 * strength);
    mesh.scale.set(width, length, width);
  }

  return { mesh, update, maxLength: nucleusRadius * maxMult };
}
