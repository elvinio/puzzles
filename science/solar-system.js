/* ============================================================================
   solar-system.js — an orrery you can hold in your hands.

   Planet positions are computed from real orbital elements (see
   solar-system-ephem.js), so on any given date every planet is where it
   really is, and the orbits keep their true shapes, tilts and eccentricities.

   Two things are deliberately not to scale, because otherwise there would be
   nothing to look at: distances are compressed (a gentle power curve — the
   "Real gaps" switch turns that off), and the bodies themselves are
   drawn far larger than reality. Sizes stay in the right *order*, and every
   number quoted in the fact panel is the true one.

   Clock starts at 1 January 2026, 00:00 UTC.
   ========================================================================== */
import * as THREE from 'three';
import {
  ELEMENTS, positionAt, orbitPath, jdFromDate, dateFromJd,
  dayOfYear, daysInYear, J2000, DEG
} from './solar-system-ephem.js';
import { SUN, PLANETS, BY_ID } from './solar-system-data.js';
import {
  surfaceTexture, earthMaps, cloudTexture, ringTexture,
  dotTexture, glowTexture, skyTexture
} from './solar-system-textures.js';
import { initRocket } from './solar-system-rocket.js';
import { initSun } from './solar-system-sun.js';
import { buildEarth } from './solar-system-earth.js';

// ── Scale ──────────────────────────────────────────────────────────────────
const AU_UNITS   = 10;      // scene units for 1 au once compression is undone
const COMPRESS   = 0.48;    // r^0.48 keeps Neptune on screen beside Mercury
const EARTH_SIZE = 0.30;    // scene units for Earth's radius
const SIZE_POW   = 0.42;    // how much big planets are allowed to dwarf small

let realDistances = false;

function orbitRadius(rAU) {
  return realDistances ? AU_UNITS * rAU : AU_UNITS * Math.pow(rAU, COMPRESS);
}

/** Ecliptic position in au → scene position (y is ecliptic north). */
const _p = new THREE.Vector3();
function toScene(p, out) {
  const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) || 1e-9;
  const k = orbitRadius(r) / r;
  return out.set(p.x * k, p.z * k, -p.y * k);
}

const bodyRadius = km => EARTH_SIZE * Math.pow(km / 6371, SIZE_POW);

// ── Time ───────────────────────────────────────────────────────────────────
const START_JD = jdFromDate(new Date(Date.UTC(2026, 0, 1)));
const SPEEDS = [
  { v: 1 / 24, label: '1 hour/s' },
  { v: 3 / 24, label: '3 hours/s' },
  { v: 0.25, label: '¼ day/s' },
  { v: 1,    label: '1 day/s' },
  { v: 3,    label: '3 days/s' },
  { v: 10,   label: '10 days/s' },
  { v: 30,   label: '1 month/s' },
  { v: 100,  label: '100 days/s' },
  { v: 365,  label: '1 year/s' },
  { v: 1825, label: '5 years/s' }
];
const DEFAULT_SPEED_IDX = 3;    // 1 day/s
let jd = START_JD;
let speedIdx = DEFAULT_SPEED_IDX;
let playing = true;

// ── Renderer, scene, camera ────────────────────────────────────────────────
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({
  antialias: true, powerPreference: 'high-performance',
  // The cockpit view sits a few thousandths of a unit off the hull while
  // Neptune is still hundreds of units away. A logarithmic depth buffer is
  // what lets one camera span that range without the far planets z-fighting.
  logarithmicDepthBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = skyTexture();

const camera = new THREE.PerspectiveCamera(45, 1, 0.0015, 6000);

// A little ambient light so night sides read as dark blue rather than a hole.
scene.add(new THREE.AmbientLight(0xb9c7ff, 0.2));
const sunLight = new THREE.PointLight(0xfff4e0, 3.1, 0, 0);   // decay 0: lights Neptune too
scene.add(sunLight);

// ── Starfield ──────────────────────────────────────────────────────────────
function buildStars() {
  const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // Even spread over a big sphere, biased slightly towards a galactic band.
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u), r = 1400;
    pos[i * 3] = r * s * Math.cos(th);
    pos[i * 3 + 1] = r * u;
    pos[i * 3 + 2] = r * s * Math.sin(th);
    const t = Math.random();
    c.setHSL(t < 0.75 ? 0.58 : 0.08, 0.35, 0.75 + Math.random() * 0.25);
    const b = 0.35 + Math.pow(Math.random(), 2.5) * 0.65;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.6, map: dotTexture(), vertexColors: true, transparent: true,
    sizeAttenuation: false, depthWrite: false, blending: THREE.AdditiveBlending
  });
  scene.add(new THREE.Points(geo, mat));
}
buildStars();

// ── The Sun ────────────────────────────────────────────────────────────────
const sunRadius = bodyRadius(SUN.radiusKm);
const sunGroup = new THREE.Group();
scene.add(sunGroup);

/* A star rather than a painted ball — boiling granulation, a corona, rays and
   prominences. See solar-system-sun.js; the costly layers only switch on once
   you are close enough to make them out. */
const sun = initSun({
  renderer,
  radius: sunRadius,
  lowres: window.matchMedia('(pointer: coarse)').matches ||
          Math.min(window.innerWidth, window.innerHeight) < 700
});
sunGroup.add(sun.group);
const sunMesh = sun.mesh;

/* Sprite haloes, so the Sun still reads as a bright spot from out past
   Neptune where its disc is barely a pixel. They bow out as you close in and
   the shader corona takes the job over. */
const sunHaloes = [
  [5.2, glowTexture('rgba(255,214,140,0.55)', 'rgba(255,120,20,0)'), 0.85],
  [12,  glowTexture('rgba(255,180,90,0.22)',  'rgba(255,90,10,0)'),  0.5]
].map(([scale, map, opacity]) => {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  halo.scale.setScalar(sunRadius * scale);
  halo.userData.opacity = opacity;
  sunGroup.add(halo);
  return halo;
});

// ── Planets, moons, rings, orbit paths ─────────────────────────────────────
const orbitGroup = new THREE.Group();       // dotted paths live here so they toggle as one
scene.add(orbitGroup);

const dot = dotTexture();
const pickables = [];                       // invisible hit spheres for tapping
const bodies = [];                          // everything selectable, in draw order

function makeHitSphere(radius, id) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 10, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  m.userData.id = id;
  pickables.push(m);
  return m;
}

/** A dotted ring of points — used for every orbit path in the scene. */
function dottedPath(points, colour, size, opacity) {
  const pos = new Float32Array(points.length * 3);
  points.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size, map: dot, color: new THREE.Color(colour), transparent: true,
    opacity, sizeAttenuation: false, depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  return new THREE.Points(geo, mat);
}

function buildPlanetOrbit(planet) {
  const raw = orbitPath(ELEMENTS[planet.id], jd, 420);
  const pts = raw.map(p => toScene(p, new THREE.Vector3()));
  const path = dottedPath(pts, planet.color, 2.0, 0.55);
  path.userData.rebuild = () => {
    const arr = path.geometry.attributes.position.array;
    raw.forEach((p, i) => {
      toScene(p, _p);
      arr[i * 3] = _p.x; arr[i * 3 + 1] = _p.y; arr[i * 3 + 2] = _p.z;
    });
    path.geometry.attributes.position.needsUpdate = true;
  };
  orbitGroup.add(path);
  return path;
}

function buildRing(planet, radius) {
  const inner = radius * planet.ring.inner, outer = radius * planet.ring.outer;
  const geo = new THREE.RingGeometry(inner, outer, 128, 1);
  // Re-map UVs radially so the 1-D ring strip reads from inner to outer edge.
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: ringTexture(planet.ring.faint ? 'uranus' : 'saturn'),
    transparent: true, side: THREE.DoubleSide, depthWrite: false,
    opacity: planet.ring.faint ? 0.55 : 0.95
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** A line through the poles, shown only while its planet is the selected one. */
function buildAxisLine(radius) {
  const len = radius * 2.4;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -len, 0), new THREE.Vector3(0, len, 0)
  ]);
  const mat = new THREE.LineBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false
  });
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  return line;
}

function buildMoon(planet, moon, planetRadius, aMax, ringOuter) {
  const radius = Math.max(0.028, planetRadius * Math.pow(moon.radiusKm / planet.radiusKm, 0.55));
  const base = ringOuter ? ringOuter + 0.55 : 1.7;
  const dist = planetRadius * (base + 2.3 * Math.pow(moon.aKm / aMax, 0.6));

  const pivot = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 20, 14),
    new THREE.MeshStandardMaterial({ map: surfaceTexture(moon.texture), roughness: 1, metalness: 0 })
  );
  pivot.add(mesh);
  mesh.add(makeHitSphere(Math.max(radius * 3.2, 0.09), moon.id));

  const ringPts = [];
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(Math.cos(a) * dist, 0, Math.sin(a) * dist));
  }
  const path = dottedPath(ringPts, moon.color, 1.4, 0.35);

  const rec = {
    id: moon.id, data: moon, kind: 'moon', parent: planet.id,
    mesh, pivot, path, dist, radius,
    phase: Math.random() * Math.PI * 2,
    dir: moon.retrograde ? -1 : 1
  };
  bodies.push(rec);
  return rec;
}

function buildPlanet(planet) {
  const radius = bodyRadius(planet.radiusKm);
  const group = new THREE.Group();
  scene.add(group);

  // Obliquity: the axis stays pointing the same way all the way round the Sun.
  const axis = new THREE.Group();
  axis.rotation.z = planet.tilt * DEG;
  group.add(axis);

  // Drawn only while this planet is the selected one; see select() and updateBodies().
  const axisLine = buildAxisLine(radius);
  axis.add(axisLine);

  const spin = new THREE.Group();
  axis.add(spin);

  // Earth gets its own self-lit day/night/atmosphere shader (see
  // solar-system-earth.js); every other body is a plain lit sphere.
  let mesh, earth = null;
  if (planet.id === 'earth') {
    earth = buildEarth(radius, earthMaps());
    mesh = earth.surface;
    spin.add(mesh);
    spin.add(earth.atmosphere);
  } else {
    mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 44, 30),
      new THREE.MeshStandardMaterial({
        map: surfaceTexture(planet.texture), roughness: 1, metalness: 0
      })
    );
    spin.add(mesh);
  }
  group.add(makeHitSphere(Math.max(radius * 2.4, 0.34), planet.id));

  let clouds = null;
  if (planet.id === 'earth') {
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.014, 40, 26),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, alphaMap: cloudTexture(), transparent: true,
        roughness: 1, depthWrite: false
      })
    );
    spin.add(clouds);
  }

  if (planet.ring) axis.add(buildRing(planet, radius));

  // A marker glow so the planet still reads as a coloured dot from across the
  // solar system, then settles into a soft atmospheric halo once you fly in.
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,0.85)', 'rgba(255,255,255,0)'),
    color: new THREE.Color(planet.color), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  group.add(marker);

  // Moons ride in the planet's equatorial plane — except ours, which tracks
  // the ecliptic far more closely than Earth's equator.
  const moonPlane = new THREE.Group();
  if (planet.id === 'earth') { group.add(moonPlane); moonPlane.rotation.z = 5.14 * DEG; }
  else axis.add(moonPlane);

  const moons = [];
  const list = planet.moons || [];
  const aMax = list.reduce((m, x) => Math.max(m, x.aKm), 1);
  for (const m of list) {
    const rec = buildMoon(planet, m, radius, aMax, planet.ring ? planet.ring.outer : 0);
    moonPlane.add(rec.pivot);
    moonPlane.add(rec.path);
    moons.push(rec);
  }

  const rec = {
    id: planet.id, data: planet, kind: 'planet',
    group, axis, spin, mesh, clouds, marker, radius, moons, earth, axisLine,
    path: buildPlanetOrbit(planet),
    systemRadius: moons.reduce((m, x) => Math.max(m, x.dist), radius * 3)
  };
  bodies.push(rec);
  return rec;
}

const planetRecs = PLANETS.map(buildPlanet);
const recById = {};
for (const r of bodies) recById[r.id] = r;

// The Sun is selectable too.
sunGroup.add(makeHitSphere(sunRadius * 1.6, 'sun'));
bodies.push({ id: 'sun', data: SUN, kind: 'star', group: sunGroup, mesh: sunMesh, radius: sunRadius });
recById.sun = bodies[bodies.length - 1];

// Who wins a crowded patch of screen: the Sun, then planets, then moons.
const labelOrder = [recById.sun, ...planetRecs, ...bodies.filter(b => b.kind === 'moon')];

// ── Asteroid belt & Kuiper belt ────────────────────────────────────────────
function buildBelt(count, aMin, aMax, spread, colour, size, opacity) {
  const rocks = [];
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    rocks.push({
      a: aMin + Math.random() * (aMax - aMin),
      phase: Math.random() * Math.PI * 2,
      inc: (Math.random() - 0.5) * spread,
      ecc: Math.random() * 0.12
    });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: dot, color: new THREE.Color(colour), transparent: true,
    opacity, sizeAttenuation: false, depthWrite: false
  }));
  scene.add(points);

  return function update(days) {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const r = rocks[i];
      const ang = r.phase + (days / (365.25 * Math.pow(r.a, 1.5))) * Math.PI * 2;
      const rad = r.a * (1 + r.ecc * Math.cos(ang));
      const k = orbitRadius(rad) / rad;
      arr[i * 3]     = Math.cos(ang) * rad * k;
      arr[i * 3 + 1] = Math.sin(r.inc) * rad * k * 0.4;
      arr[i * 3 + 2] = Math.sin(ang) * rad * k;
    }
    geo.attributes.position.needsUpdate = true;
  };
}
const updateAsteroids = buildBelt(1500, 2.1, 3.4, 0.34, 0xb59b7a, 1.5, 0.55);
const updateKuiper    = buildBelt(1800, 33, 49, 0.5, 0x8fa6c8, 1.3, 0.3);

// ── Camera rig: orbit, pinch-zoom, two-finger pan ──────────────────────────
const view = { target: new THREE.Vector3(), dist: 140, theta: 0.95, phi: 0.92 };
const HOME = { theta: 0.95, phi: 0.92 };
const goalTarget = new THREE.Vector3();
let goalDist = view.dist;
let follow = null;                 // body record the camera is riding along with
let minDist = 1.2, maxDist = 900;

function applyCamera() {
  const sp = Math.sin(view.phi), cp = Math.cos(view.phi);
  camera.position.set(
    view.target.x + view.dist * sp * Math.sin(view.theta),
    view.target.y + view.dist * cp,
    view.target.z + view.dist * sp * Math.cos(view.theta)
  );
  camera.lookAt(view.target);
}

const canvas = renderer.domElement;
const ptrs = new Map();
let pinchDist = 0, pinchMid = null, tapStart = null;

/* The rocket is built at boot, but the gesture handlers below have to know
   whether it is currently claiming the drag — while you are aiming a launch,
   or while a chase/cockpit camera is flying itself. */
let rocket = null;
const rocketHasDrag = () => rocket && (rocket.isAiming() || rocket.ownsCamera());

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (ptrs.size === 2) { tapStart = null; startPinch(); }
});

canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;

  if (ptrs.size === 1) {
    if (rocketHasDrag()) return;          // aiming a launch, or riding the ship
    view.theta -= dx * 0.006;
    view.phi = Math.min(Math.PI - 0.06, Math.max(0.06, view.phi - dy * 0.006));
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (pinchDist > 0) {
      zoomBy(pinchDist / d);
      panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
    }
    pinchDist = d; pinchMid = mid;
  }
});

function endPointer(e) {
  if (tapStart && ptrs.size === 1 && !(rocket && rocket.isAiming())) {
    const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
    if (moved < 12 && performance.now() - tapStart.t < 400) pickAt(e.clientX, e.clientY);
  }
  ptrs.delete(e.pointerId);
  tapStart = null;
  if (ptrs.size < 2) pinchDist = 0;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); tapStart = null; pinchDist = 0; });

function startPinch() {
  const [a, b] = [...ptrs.values()];
  pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function zoomBy(factor) {
  view.dist = Math.min(maxDist, Math.max(minDist, view.dist * factor));
  goalDist = view.dist;
}

const _right = new THREE.Vector3(), _up = new THREE.Vector3();
function panBy(dx, dy) {
  if (!dx && !dy) return;
  const scale = view.dist * 0.0022;
  camera.matrixWorld.extractBasis(_right, _up, new THREE.Vector3());
  view.target.addScaledVector(_right, -dx * scale);
  view.target.addScaledVector(_up, dy * scale);
  follow = null;
  goalTarget.copy(view.target);
}

canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (rocket && rocket.ownsCamera()) return;
  zoomBy(Math.exp(e.deltaY * 0.0012));
}, { passive: false });

// Safari's own pinch-to-zoom would fight ours.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, e => e.preventDefault(), { passive: false });
}

function focusOn(rec) {
  if (!rec) return;
  follow = rec;
  const span = rec.kind === 'planet' ? Math.max(rec.systemRadius * 2.3, rec.radius * 8)
    : rec.kind === 'star' ? rec.radius * 7
      : rec.radius * 9;
  goalDist = Math.min(maxDist, span);
  minDist = Math.max(0.08, rec.radius * 1.6);
}

/** Camera distance that just fits a disc of radius R, tilted by the current view. */
function fitDistance(R) {
  const t = Math.tan(camera.fov * DEG / 2);
  const wide = R / (t * Math.max(0.35, camera.aspect));
  const tall = R * Math.cos(view.phi) / t;
  return Math.max(wide, tall) * 1.2;
}

function resetView() {
  follow = null;
  goalTarget.set(0, 0, 0);
  view.theta = HOME.theta;
  view.phi = HOME.phi;
  goalDist = Math.min(maxDist, fitDistance(orbitRadius(30.1) * 1.06));
  minDist = 1.2;
  select(null);
}

// ── Picking ────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function pickAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  const id = hits.length ? hits[0].object.userData.id : null;

  // While a mission is choosing its launch pad or its destination, a tap on a
  // planet means "that one" rather than "tell me about it".
  if (rocket && rocket.handlePick(id)) return;
  select(id);
}

// ── Labels (HTML, so the text stays crisp on a retina screen) ──────────────
const labelLayer = document.getElementById('labels');
const labels = new Map();
let showLabels = true;

for (const rec of bodies) {
  const el = document.createElement('button');
  el.className = 'lbl' + (rec.kind === 'moon' ? ' moon' : '');
  el.type = 'button';
  el.innerHTML = `<i style="background:${rec.data.color}"></i>${rec.data.name}`;
  el.addEventListener('click', ev => { ev.stopPropagation(); select(rec.id); });
  labelLayer.appendChild(el);
  labels.set(rec.id, el);
}

const _wp = new THREE.Vector3();
const placed = [];                          // screen slots already taken this frame

/** Draw one label, unless it would land on top of one already drawn. */
function placeLabel(rec, w, h) {
  const el = labels.get(rec.id);
  const host = rec.kind === 'moon' ? recById[rec.parent] : rec;
  // Moon labels only make sense once you have flown in close to their planet.
  const near = rec.kind !== 'moon' ||
    (host && camera.position.distanceTo(host.group.position) < host.systemRadius * 7);
  // Riding the ship, floating name tags would sit between you and the view.
  const riding = rocket && rocket.ownsCamera();
  if (!showLabels || !near || riding) { el.style.display = 'none'; return; }

  (rec.mesh || rec.group).getWorldPosition(_wp);
  _wp.project(camera);
  if (_wp.z > 1 || Math.abs(_wp.x) > 1.2 || Math.abs(_wp.y) > 1.2) {
    el.style.display = 'none';
    return;
  }

  const x = (_wp.x * 0.5 + 0.5) * w, y = (-_wp.y * 0.5 + 0.5) * h;

  // Sit above the body; if that spot is taken, duck underneath; if the
  // neighbourhood is full, stay hidden until the view opens up.
  for (const dy of [-17, 19]) {
    let free = true;
    for (let i = 0; i < placed.length; i += 2) {
      if (Math.abs(placed[i] - x) < 68 && Math.abs(placed[i + 1] - (y + dy)) < 19) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    placed.push(x, y + dy);
    el.style.display = '';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-50% + ${dy}px))`;
    return;
  }
  el.style.display = 'none';
}

function updateLabels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  placed.length = 0;
  // Whatever is selected gets first claim on its patch of screen.
  for (const rec of labelOrder) if (rec.id === selected) placeLabel(rec, w, h);
  for (const rec of labelOrder) if (rec.id !== selected) placeLabel(rec, w, h);
}

// ── Fact panel ─────────────────────────────────────────────────────────────
const panel = document.getElementById('panel');
const panelBody = document.getElementById('panelBody');
let selected = null;

function statRows(rec) {
  const d = rec.data;
  if (d.stats) return d.stats;
  const p = BY_ID[rec.parent];
  return [
    ['Diameter', `${Math.round(d.radiusKm * 2).toLocaleString()} km`],
    ['Orbits', p ? p.name : '—'],
    ['Distance from planet', `${Math.round(d.aKm).toLocaleString()} km`],
    ['Goes round in', d.periodDays < 2
      ? `${(d.periodDays * 24).toFixed(1)} hours`
      : `${d.periodDays.toFixed(2)} Earth days`]
  ];
}

function select(id) {
  selected = id;
  for (const [key, el] of labels) el.classList.toggle('on', key === id);
  const lit = id && recById[id] ? (recById[id].parent || id) : null;
  for (const rec of planetRecs) {
    rec.path.material.opacity = !lit || lit === rec.id ? 0.55 : 0.2;
  }

  if (!id) {
    panel.classList.remove('open');
    return;
  }

  const rec = recById[id];
  const d = rec.data;
  const moons = (d.moons || []);
  panelBody.innerHTML = `
    <div class="p-head">
      <span class="p-dot" style="background:${d.color}"></span>
      <h2>${d.symbol ? `<span class="p-sym">${d.symbol}</span>` : ''}${d.name}</h2>
    </div>
    <p class="p-blurb">${d.blurb}</p>
    <dl class="p-stats">
      ${statRows(rec).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
    </dl>
    <h3>Did you know?</h3>
    <ul class="p-facts">${d.facts.map(f => `<li>${f}</li>`).join('')}</ul>
    ${moons.length ? `<h3>Major moons</h3><div class="p-moons">${
      moons.map(m => `<button class="chip" data-id="${m.id}">
        <span class="p-dot sm" style="background:${m.color}"></span>${m.name}</button>`).join('')
    }</div>` : ''}
    ${rec.parent ? `<div class="p-moons"><button class="chip" data-id="${rec.parent}">
      ↑ Back to ${BY_ID[rec.parent].name}</button></div>` : ''}
  `;
  for (const chip of panelBody.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => select(chip.dataset.id));
  }
  panel.classList.add('open');
  panel.scrollTop = 0;
  focusOn(rec);
}

document.getElementById('panelClose').addEventListener('click', () => select(null));

// ── Simulation ─────────────────────────────────────────────────────────────
const eclip = { x: 0, y: 0, z: 0 };

function updateBodies(dtDays) {
  const days = jd - J2000;

  for (const rec of planetRecs) {
    const p = positionAt(ELEMENTS[rec.id], jd);
    eclip.x = p.x; eclip.y = p.y; eclip.z = p.z;
    toScene(eclip, rec.group.position);
    if (rec.earth) rec.earth.update(rec.group.position);

    // Self-rotation. At high time speeds a true spin would just strobe, so the
    // visible rate is eased off — the clock stays honest, the picture readable.
    const damp = Math.min(1, 12 / Math.max(1, SPEEDS[speedIdx].v));
    const turns = (dtDays * damp) / (rec.data.rotationHours / 24);
    rec.spin.rotation.y += turns * Math.PI * 2;
    if (rec.clouds) rec.clouds.rotation.y += turns * Math.PI * 2 * 0.06;

    const eye = camera.position.distanceTo(rec.group.position);
    const want = eye * 0.013, floor = rec.radius * 2.7;
    const t = Math.min(1, want / floor);
    rec.marker.scale.setScalar(Math.max(want, floor));
    rec.marker.material.opacity = 0.09 + 0.76 * t * t;

    // The rotation axis only shows for the planet you tapped to view, and
    // shares the Orbits toggle so it hides whenever orbit paths do.
    rec.axisLine.visible = showOrbits && selected === rec.id;

    for (const m of rec.moons) {
      const ang = m.phase + m.dir * (days / m.data.periodDays) * Math.PI * 2;
      m.pivot.position.set(Math.cos(ang) * m.dist, 0, Math.sin(ang) * m.dist);
      m.mesh.rotation.y = -ang;          // moons keep one face towards home
      m.path.visible = showOrbits && eye < rec.systemRadius * 12;
    }
  }

  sun.spin.rotation.y += (dtDays * Math.min(1, 12 / SPEEDS[speedIdx].v)) / 25.4 * Math.PI * 2;
  updateAsteroids(days);
}

// ── Clock readout ──────────────────────────────────────────────────────────
const elDay = document.getElementById('dayNum');
const elYear = document.getElementById('yearNum');
const elDate = document.getElementById('dateText');
const elLaps = document.getElementById('lapText');
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
});

function updateClockUI() {
  const { year, day } = dayOfYear(jd);
  elDay.textContent = day;
  elYear.textContent = year;
  elDate.textContent = dateFmt.format(dateFromJd(jd));
  const laps = (jd - START_JD) / 365.256898;
  const n = Math.floor(Math.abs(laps));
  elLaps.textContent = `Day ${day} of ${daysInYear(year)} · Earth has completed ` +
    `${n} ${n === 1 ? 'lap' : 'laps'} of the Sun since 1 Jan 2026`;
}

// ── Controls ───────────────────────────────────────────────────────────────
const btnPlay = document.getElementById('btnPlay');
const elSpeed = document.getElementById('speedLabel');
let showOrbits = true;

function setPlaying(on) {
  playing = on;
  btnPlay.textContent = on ? '⏸' : '▶';
  btnPlay.setAttribute('aria-label', on ? 'Pause time' : 'Play time');
  btnPlay.classList.toggle('on', on);
}

function setSpeed(i) {
  speedIdx = Math.min(SPEEDS.length - 1, Math.max(0, i));
  elSpeed.textContent = SPEEDS[speedIdx].label;
  document.getElementById('btnSlower').disabled = speedIdx === 0;
  document.getElementById('btnFaster').disabled = speedIdx === SPEEDS.length - 1;
}

btnPlay.addEventListener('click', () => setPlaying(!playing));
document.getElementById('btnFaster').addEventListener('click', () => setSpeed(speedIdx + 1));
document.getElementById('btnSlower').addEventListener('click', () => setSpeed(speedIdx - 1));
document.getElementById('btnTimeReset').addEventListener('click', () => {
  jd = START_JD;
  setSpeed(DEFAULT_SPEED_IDX);
  updateBodies(0);
  updateClockUI();
});
document.getElementById('btnView').addEventListener('click', resetView);

const btnOrbits = document.getElementById('btnOrbits');
btnOrbits.addEventListener('click', () => {
  showOrbits = !showOrbits;
  orbitGroup.visible = showOrbits;
  btnOrbits.classList.toggle('on', showOrbits);
});

const btnLabels = document.getElementById('btnLabels');
btnLabels.addEventListener('click', () => {
  showLabels = !showLabels;
  btnLabels.classList.toggle('on', showLabels);
});

const btnScale = document.getElementById('btnScale');

function setRealDistances(on) {
  if (realDistances === on) return;
  realDistances = on;
  btnScale.classList.toggle('on', on);
  btnScale.querySelector('span').textContent = on ? 'Real gaps' : 'Squeezed';
  for (const rec of planetRecs) rec.path.userData.rebuild();
  updateKuiper(jd - J2000);
  updateBodies(0);
}

btnScale.addEventListener('click', () => {
  setRealDistances(!realDistances);
  resetView();
});

// ── Resize ─────────────────────────────────────────────────────────────────
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ── Main loop ──────────────────────────────────────────────────────────────
let last = performance.now();

function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);   // cap so a background tab can't jump the clock
  last = now;
  const dtDays = playing ? dt * SPEEDS[speedIdx].v : 0;
  if (dtDays) jd += dtDays;

  updateBodies(dtDays);

  // The rocket gets to move itself and, in chase or cockpit view, to fly the
  // camera. When it does, the orrery's own rig stands down for the frame.
  const camTaken = rocket ? rocket.update(dt) : false;
  const trailing = rocket && rocket.followsShip();

  if (trailing) goalTarget.copy(rocket.shipPosition());
  else if (follow) (follow.mesh || follow.group).getWorldPosition(goalTarget);
  view.target.lerp(goalTarget, follow || trailing ? 0.16 : 0.09);
  view.dist += (goalDist - view.dist) * 0.09;
  if (!camTaken) applyCamera();

  /* The Sun's rays and prominences are worth the money only when you are near
     enough to see them; the distance haloes fade out over the same stretch so
     the two never double up. Everything is measured from the origin, which is
     where the Sun sits. */
  const sunEye = camera.position.length();
  sun.setDetail(selected === 'sun' || sunEye < sunRadius * 18);
  const haloFade = Math.min(1, Math.max(0, (sunEye - sunRadius * 4) / (sunRadius * 12)));
  for (const halo of sunHaloes) halo.material.opacity = halo.userData.opacity * haloFade;
  sun.update(dt, camera);

  updateLabels();
  updateClockUI();
  renderer.render(scene, camera);
}

// ── The rocket ─────────────────────────────────────────────────────────────
/* Mission mode forces "Real gaps" on, and puts it back the way it was on the
   way out. The squeezed view is a lovely picture but it bends straight lines,
   so nothing flown inside it would be true; at real distances the map is a
   plain uniform scaling and the trajectories mean what they look like. */
const btnRocket = document.getElementById('btnRocket');
let scaleBeforeMission = false;

{
  const radiusScene = { sun: sunRadius };
  for (const rec of planetRecs) radiusScene[rec.id] = rec.radius;

  rocket = initRocket({
    scene, camera, canvas, AU_UNITS, radiusScene,

    getJd: () => jd,
    setJd: v => { jd = v; updateBodies(0); updateClockUI(); },
    setPlaying,
    setSpeedDays: v => {
      const i = SPEEDS.findIndex(s => s.v >= v);
      setSpeed(i < 0 ? SPEEDS.length - 1 : i);
    },

    viewDist: () => view.dist,
    focusScene: (vec, dist) => {
      follow = null;
      goalTarget.copy(vec);
      goalDist = Math.min(maxDist, dist);
      minDist = 0.02;
    },

    selectBody: id => select(id),
    nameOf: id => (BY_ID[id] ? BY_ID[id].name : id),
    colorOf: id => (BY_ID[id] ? BY_ID[id].color : '#fff'),

    beginMission: () => {
      scaleBeforeMission = realDistances;
      setRealDistances(true);
      btnScale.disabled = true;
      btnRocket.classList.add('on');
      document.body.classList.add('mission');
      select(null);
      // Frame Jupiter's orbit rather than Neptune's: at real distances the
      // whole-system view squashes everything worth launching from into a
      // knot a few pixels across.
      follow = null;
      goalTarget.set(0, 0, 0);
      view.theta = HOME.theta;
      view.phi = 0.55;                       // nearer overhead, so aiming reads flat
      goalDist = Math.min(maxDist, fitDistance(orbitRadius(5.5)));
      minDist = 0.02;
    },
    endMission: () => {
      setRealDistances(scaleBeforeMission);
      btnScale.disabled = false;
      btnRocket.classList.remove('on');
      document.body.classList.remove('mission');
      minDist = 1.2;
      resetView();
    }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
resize();
setSpeed(speedIdx);
setPlaying(true);
updateKuiper(0);
updateBodies(0);
goalTarget.copy(view.target);
view.dist = goalDist = Math.min(maxDist, fitDistance(orbitRadius(30.1) * 1.06));
applyCamera();
updateClockUI();
document.getElementById('loading').classList.add('gone');
frame();
