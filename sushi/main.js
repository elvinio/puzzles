/* ============================================================================
   main.js — Tamago's Sushi Bar.

   Wires the three.js scene, the game loop and the DOM overlay together.
   Layout is a shallow diorama: customers seated across the counter at the
   back, Tamago at his station on the left, the plate in the middle and the
   ingredient tray along the front edge where thumbs can reach it.
   ========================================================================== */
import * as THREE from 'three';
import {
  Ease, tween, after, updateTweens, clearTweens,
  squashLand, hop, wobble, popIn, popOut, arcTo,
  initParticles, burst, floatText, shake, applyShake
} from './fx.js';
import {
  setFace, updateBlink, makeNumberChip, setChipValue, updatePatienceRing
} from './faces.js';
import {
  INGREDIENTS, SPECIALS,
  makeIngredient, makeRice, makeCustomer, makeChef,
  makeCounter, makePlate, makeContactShadow, CUSTOMER_KINDS
} from './models.js';
import {
  WAVES, TRAY_SLOTS, MAX_CUSTOMERS, waveFor, waveIndex,
  makeOrder, chooseRefillValue, resolveWildValue, isSatisfiable,
  scoreServe, comboMultiplier, starRating, patienceFor
} from './game.js';
import { unlock, sfx, isMuted, setMuted } from './audio.js';

// ── Layout ─────────────────────────────────────────────────────────────────
const SEATS = [
  { x: -3.6, z: -2.4 },
  { x:  0.5, z: -2.7 },
  { x:  4.6, z: -2.4 }
];
const SEAT_Y    = 0.05;
const CHEF_POS  = new THREE.Vector3(-6.2, -1.84, -2.6);   // on the floor behind the counter, head clear of it
const PLATE_POS = new THREE.Vector3(0.4, 0, 1.1);
const TRAY_Z    = 2.95;
const TRAY_Y    = 0.24;
const TRAY_GAP  = 1.36;
const TRAY_X0   = 0.3 - ((TRAY_SLOTS - 1) / 2) * TRAY_GAP;

const CAM_TARGET = new THREE.Vector3(-0.2, 1.05, 0.0);
const CAM_DIR    = new THREE.Vector3(0, 0.60, 0.80).normalize();
const FIT_HALF_W = 7.9;
const FIT_HALF_H = 4.5;

const MAX_PLATE = 6;

// ── Renderer / scene ───────────────────────────────────────────────────────
const container = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = makeSkyTexture();

const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
const cameraHome = new THREE.Vector3();

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0.00, '#ffd3ad');
  grd.addColorStop(0.42, '#ffe7d1');
  grd.addColorStop(1.00, '#fff5ea');
  g.fillStyle = grd;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// lighting — warm key, soft pink fill, nothing harsh
scene.add(new THREE.HemisphereLight(0xfff2e2, 0xffcfae, 0.9));

const key = new THREE.DirectionalLight(0xfff0dd, 1.5);
key.position.set(5, 11, 7);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.near = 1;
key.shadow.camera.far = 36;
key.shadow.camera.left = -13;
key.shadow.camera.right = 13;
key.shadow.camera.top = 13;
key.shadow.camera.bottom = -9;
key.shadow.bias = -0.0016;
key.shadow.radius = 3;
scene.add(key);

const fill = new THREE.DirectionalLight(0xffdcea, 0.45);
fill.position.set(-8, 5, 4);
scene.add(fill);

initParticles(scene);

// ── Static set ─────────────────────────────────────────────────────────────
scene.add(makeCounter());

const plate = makePlate();
plate.position.copy(PLATE_POS);
scene.add(plate);

const plateShadow = makeContactShadow(1.9);
plateShadow.position.set(PLATE_POS.x, 0.04, PLATE_POS.z);
scene.add(plateShadow);

const rice = makeRice();
rice.position.set(PLATE_POS.x, 0.1, PLATE_POS.z);
rice.userData.rest = 'happy';
scene.add(rice);

const chef = makeChef();
chef.scale.setScalar(1.7);
chef.userData.baseScale.set(1.7, 1.7, 1.7);
chef.position.copy(CHEF_POS);
chef.rotation.y = 0.34;
scene.add(chef);
chef.userData.rest = 'happy';

const chefShadow = makeContactShadow(1.9);
chefShadow.position.set(CHEF_POS.x, -1.60, CHEF_POS.z);
scene.add(chefShadow);

// the running total, floating above whatever is on the plate
const totalChip = makeNumberChip(0, 0.92);
totalChip.position.set(PLATE_POS.x, 1.62, PLATE_POS.z + 0.1);
scene.add(totalChip);

// ── HUD refs ───────────────────────────────────────────────────────────────
const el = id => document.getElementById(id);
const hudScore    = el('hudScore');
const hudHappy    = el('hudHappy');
const hudCombo    = el('hudCombo');
const timeFill    = el('timeFill');
const timeWrap    = el('timeWrap');
const startScreen = el('startScreen');
const pauseScreen = el('pauseScreen');
const overScreen  = el('overScreen');
const toastEl     = el('toast');
const btnMute     = el('btnMute');

// ── State ──────────────────────────────────────────────────────────────────
const S = {
  mode: 'idle',                 // idle | playing | paused | over
  sessionSeconds: 180,
  timeLeft: 180,
  score: 0, happy: 0, lost: 0,
  streak: 0, bestStreak: 0,
  wasabi: false,
  tray: new Array(TRAY_SLOTS).fill(null),
  plateItems: [],
  customers: [],
  seatBusy: [false, false, false],
  seatPending: [false, false, false],
  lastTickSecond: -1
};

// ── Camera fitting ─────────────────────────────────────────────────────────
// Pull the camera back far enough that the whole diorama fits at any aspect,
// so the game is playable in portrait as well as landscape.
function layout() {
  const w = container.clientWidth || window.innerWidth;
  const h = container.clientHeight || window.innerHeight;

  camera.aspect = w / h;
  const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
  const dist = Math.max(
    FIT_HALF_H / Math.tan(halfFov),
    FIT_HALF_W / (Math.tan(halfFov) * camera.aspect)
  ) * 1.02;

  camera.position.copy(CAM_TARGET).addScaledVector(CAM_DIR, dist);
  camera.lookAt(CAM_TARGET);
  camera.updateProjectionMatrix();
  cameraHome.copy(camera.position);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
}

// ── Small helpers ──────────────────────────────────────────────────────────
const slotPosition = i => new THREE.Vector3(TRAY_X0 + i * TRAY_GAP, TRAY_Y, TRAY_Z);
const trayValues   = () => S.tray.filter(t => t && !t.spec.special).map(t => t.value);
const trayWilds    = () => S.tray.filter(t => t && t.spec.special === 'wild').length;
const plateValues  = () => S.plateItems.map(p => p.value);
const plateSum     = () => S.plateItems.reduce((a, p) => a + p.value, 0);
const pendingTargets = () => S.customers.filter(c => c.state === 'waiting').map(c => c.order.target);
const progress     = () => 1 - S.timeLeft / S.sessionSeconds;
const currentWave  = () => waveFor(progress());
const activeSeats  = () => (waveIndex(progress()) === 0 ? 2 : MAX_CUSTOMERS);

// ── Tray ───────────────────────────────────────────────────────────────────
function pickSpec(wave) {
  const specialChance = wave === WAVES[0] ? 0 : 0.13;   // let them settle in first
  const pool = Math.random() < specialChance ? SPECIALS : INGREDIENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function dealSlot(i, delay = 0) {
  if (S.tray[i]) return;
  const wave = currentWave();

  // A special carries no number, so it cannot rescue a stranded order. If any
  // waiting customer is currently unfillable, this slot must be a real
  // ingredient so chooseRefillValue gets its chance to repair the tray.
  const stranded = pendingTargets().some(
    t => !isSatisfiable(t, trayValues(), plateValues(), trayWilds())
  );
  const spec = stranded
    ? INGREDIENTS[Math.floor(Math.random() * INGREDIENTS.length)]
    : pickSpec(wave);

  const value = spec.special
    ? null
    : chooseRefillValue(wave, trayValues(), plateValues(), pendingTargets(), trayWilds());

  const obj = makeIngredient(spec, value);
  const p = slotPosition(i);
  obj.position.copy(p);
  scene.add(obj);

  S.tray[i] = { obj, spec, value, slot: i, busy: false };

  popIn(obj, 0.45, delay);
  after(delay + 0.32, () => {
    squashLand(obj, 0.3, 0.45);
    burst(p.clone(), { kind: 'puff', colors: ['#fff6e8'], count: 4, size: 0.26, rise: 0.45, spread: 0.45 });
  });
}

function fillTray() {
  for (let i = 0; i < TRAY_SLOTS; i++) dealSlot(i, i * 0.07);
}

// ── Customers ──────────────────────────────────────────────────────────────
function scheduleSpawn(seat, delay) {
  if (S.seatBusy[seat] || S.seatPending[seat]) return;
  S.seatPending[seat] = true;
  after(delay, () => {
    S.seatPending[seat] = false;
    if (S.mode !== 'playing' || seat >= activeSeats() || S.seatBusy[seat]) return;
    spawnCustomer(seat);
  });
}

function spawnCustomer(seat) {
  if (S.seatBusy[seat]) return;
  const wave = currentWave();
  const order = makeOrder(wave, trayValues(), pendingTargets());
  if (!order) { scheduleSpawn(seat, 0.8); return; }   // tray still landing

  const kind = CUSTOMER_KINDS[Math.floor(Math.random() * CUSTOMER_KINDS.length)];
  const obj = makeCustomer(kind, order.label);
  const p = SEATS[seat];
  obj.position.set(p.x, SEAT_Y, p.z);
  scene.add(obj);

  const maxPatience = patienceFor(wave, order.target, order.addends.length);
  const c = { obj, order, seat, kind, patience: maxPatience, maxPatience, state: 'waiting', matched: false };
  S.customers.push(c);
  S.seatBusy[seat] = true;

  popIn(obj, 0.6);
  updatePatienceRing(obj.userData.ring, 1);
  burst(new THREE.Vector3(p.x, 0.9, p.z),
    { kind: 'star', colors: ['#ffe08a', '#ffd0dc'], count: 6, size: 0.34 });
  refreshTotal();
}

function removeCustomer(c, happyExit) {
  if (c.state === 'leaving') return;
  c.state = 'leaving';

  const idx = S.customers.indexOf(c);
  if (idx >= 0) S.customers.splice(idx, 1);

  const obj = c.obj;
  setFace(obj.userData.face, happyExit ? 'happy' : 'sad');
  obj.userData.cardGroup.visible = false;
  obj.userData.glow.material.opacity = 0;

  if (happyExit) hop(obj, 0.55, 0.5);
  else wobble(obj, 0.16, 0.6);

  const z0 = obj.position.z;
  tween({
    dur: 0.75, delay: 0.35, ease: Ease.inCubic,
    onUpdate: t => {
      obj.position.z = z0 - t * 3.4;
      obj.position.y = SEAT_Y - t * 0.9;
      obj.scale.setScalar(Math.max(0.001, obj.userData.baseScale.x * (1 - t)));
    },
    onDone: () => {
      scene.remove(obj);
      S.seatBusy[c.seat] = false;         // freed only once they are really gone
    }
  });
  refreshTotal();
}

// ── Plate ──────────────────────────────────────────────────────────────────
function platePosition(index) {
  // a gentle spiral upward so every layer of the sushi stays visible
  const a = index * 1.15;
  return new THREE.Vector3(
    PLATE_POS.x + Math.cos(a) * 0.11,
    0.66 + index * 0.2,
    PLATE_POS.z + Math.sin(a) * 0.08
  );
}

/**
 * Once a piece is on the plate its number chip shrinks and swings out to
 * alternating sides, so the stack reads as a little column of addends the
 * child can still check against the running total above it.
 */
function styleChipOnPlate(entry, index) {
  const chip = entry.obj.userData.chip;
  if (!chip) return;
  // Alternating sides keeps consecutive chips apart; the stack's 0.2 vertical
  // step then clears same-side neighbours at this size.
  const side = index % 2 ? 0.58 : -0.58;
  const from = chip.position.clone();
  const to = new THREE.Vector3(side, 0.0, 0.34);
  const s0 = chip.scale.x;
  tween({
    dur: 0.3, ease: Ease.outCubic,
    onUpdate: t => {
      chip.position.lerpVectors(from, to, t);
      const sc = s0 + (0.38 - s0) * t;
      chip.scale.set(sc, sc, 1);
    }
  });
}

function relayoutPlate() {
  S.plateItems.forEach((p, i) => {
    const from = p.obj.position.clone();
    const to = platePosition(i);
    tween({ dur: 0.28, ease: Ease.outCubic, onUpdate: t => p.obj.position.lerpVectors(from, to, t) });
    styleChipOnPlate(p, i);
  });
}

function addToPlate(item) {
  const target = platePosition(S.plateItems.length);
  const obj = item.obj;

  S.tray[item.slot] = null;
  item.busy = true;
  const entry = { obj, value: item.value, spec: item.spec };
  S.plateItems.push(entry);

  sfx.tap(S.plateItems.length - 1);

  obj.userData.baseScale.set(0.9, 0.9, 0.9);
  tween({ dur: 0.5, onUpdate: t => { const s = 1 - t * 0.1; obj.scale.set(s, s, s); } });

  arcTo(obj, target, {
    dur: 0.5, lift: 1.7, spin: Math.PI * 2,
    onDone: () => {
      squashLand(obj, 0.45, 0.55);
      burst(target.clone(), { kind: 'puff', colors: ['#fffaf0', '#ffe9d6'], count: 7, size: 0.3, rise: 0.6, spread: 0.55 });
      hop(rice, 0.07, 0.24);
      const at = S.plateItems.indexOf(entry);
      if (at >= 0) styleChipOnPlate(entry, at);
    }
  });

  after(0.4, () => dealSlot(item.slot, 0));
  refreshTotal();
}

function removeFromPlate(entry) {
  const i = S.plateItems.indexOf(entry);
  if (i < 0) return;
  S.plateItems.splice(i, 1);
  sfx.undo();

  const obj = entry.obj;
  burst(obj.position.clone(), { kind: 'puff', colors: ['#ffe9d6'], count: 5, size: 0.26, rise: 0.5 });
  popOut(obj, 0.28, () => scene.remove(obj));
  relayoutPlate();
  refreshTotal();
}

function clearPlate(silent) {
  if (!S.plateItems.length) return;
  if (!silent) sfx.undo();
  for (const p of S.plateItems) {
    burst(p.obj.position.clone(), { kind: 'puff', colors: ['#ffe9d6'], count: 4, size: 0.24, rise: 0.5 });
    popOut(p.obj, 0.26, obj => scene.remove(p.obj));
  }
  S.plateItems.length = 0;
  refreshTotal();
}

/**
 * Repaint the running total and mark any customer it satisfies. This is the
 * game's core feedback loop, so it is deliberately loud: colour, sound, the
 * rice's expression and a glow under the matching customer all change at once.
 */
let lastTotalState = '';
function refreshTotal() {
  const sum = plateSum();
  const targets = pendingTargets();
  const anyMatch = targets.includes(sum);
  const overAll = targets.length > 0 && sum > Math.max(...targets);

  const state = sum + '|' + anyMatch + '|' + overAll;
  const changed = state !== lastTotalState;
  lastTotalState = state;

  const bg = anyMatch ? '#d8f6e4' : overAll ? '#ffdfe4' : '#fffaf2';
  const fg = anyMatch ? '#2f7d53' : overAll ? '#c2415a' : '#5b4038';
  setChipValue(totalChip, sum, bg, fg);

  for (const c of S.customers) {
    if (c.state === 'waiting') c.matched = sum > 0 && c.order.target === sum;
  }

  if (!changed) return;

  if (anyMatch) {
    sfx.ready();
    rice.userData.rest = 'excited';
    pulse(totalChip, 1.35);
    burst(totalChip.position.clone(), { kind: 'star', colors: ['#9be3c9', '#ffe08a'], count: 6, size: 0.3, rise: 0.7 });
  } else if (overAll) {
    sfx.over();
    rice.userData.rest = 'worried';
    wobble(rice, 0.1, 0.4);
    shake(0.05);
  } else {
    rice.userData.rest = sum > 0 ? 'neutral' : 'happy';
  }
}

/** Scale pop used on the total chip — position is owned by the idle bob. */
function pulse(sprite, peak = 1.3) {
  const base = sprite.userData.baseSize || sprite.scale.x;
  sprite.userData.baseSize = base;
  tween({
    dur: 0.4, ease: Ease.outElastic,
    onUpdate: t => {
      const s = base * (1 + (peak - 1) * (1 - t));
      sprite.scale.set(s, s, 1);
    },
    onDone: () => sprite.scale.set(base, base, 1)
  });
}

// ── Serving ────────────────────────────────────────────────────────────────
function serve(c) {
  const sum = plateSum();
  if (sum === 0 || sum !== c.order.target) {
    sfx.nope();
    setFace(c.obj.userData.face, 'worried');
    wobble(c.obj, 0.14, 0.45);
    return;
  }

  c.state = 'served';
  const addendCount = S.plateItems.length;
  const res = scoreServe({
    patienceFrac: c.patience / c.maxPatience,
    streak: S.streak,
    addendCount,
    wasabi: S.wasabi
  });

  const wasWasabi = S.wasabi;
  S.wasabi = false;
  S.score += res.points;
  S.happy += 1;
  S.streak += 1;
  S.bestStreak = Math.max(S.bestStreak, S.streak);

  sfx.serve(res.multiplier);
  setFace(c.obj.userData.face, 'eating');
  setFace(chef.userData.face, 'excited');
  chef.userData.rest = 'excited';
  hop(chef, 0.4, 0.5);
  shake(0.09);

  const mouth = c.obj.position.clone().add(new THREE.Vector3(0, 0.75, 0.7));
  const celebrateAt = c.obj.position.clone().add(new THREE.Vector3(0, 2.1, 0.4));

  // the sushi flies to the customer piece by piece
  S.plateItems.forEach((p, i) => {
    arcTo(p.obj, mouth, {
      dur: 0.45, delay: i * 0.07, lift: 1.9, spin: Math.PI * 3,
      onDone: () => {
        popOut(p.obj, 0.2, () => scene.remove(p.obj));
        burst(mouth, { kind: 'heart', colors: ['#ff8fa8', '#ffd0dc'], count: 4, size: 0.32, rise: 1.0 });
      }
    });
  });
  S.plateItems.length = 0;
  refreshTotal();
  hop(rice, 0.3, 0.45);

  after(0.55, () => {
    burst(celebrateAt, {
      kind: 'star', colors: ['#ffe08a', '#9be3c9', '#ff9aa2', '#fffaf2'],
      count: 16, size: 0.44, rise: 1.5, spread: 1.5
    });
    burst(celebrateAt, { kind: 'note', colors: ['#ffb3c6'], count: 4, size: 0.32, rise: 1.2 });
    floatText(celebrateAt, '+' + res.points, wasWasabi ? '#5fae2e' : '#ff7aa2', 1.0);
    if (res.multiplier > 1) floatText(celebrateAt.clone().add(new THREE.Vector3(1.3, -0.2, 0)), '×' + res.multiplier, '#ffa62e', 0.68);
    if (addendCount >= 3) floatText(celebrateAt.clone().add(new THREE.Vector3(-1.4, 0.1, 0)), addendCount + ' pieces!', '#4a9fd4', 0.56);
  });

  after(0.9, () => removeCustomer(c, true));
  after(1.4, () => { chef.userData.rest = 'happy'; });
  updateHUD();
}

// ── Specials ───────────────────────────────────────────────────────────────
function useSpecial(item) {
  const kind = item.spec.special;
  const obj = item.obj;

  if (kind === 'wild') {
    // becomes exactly the number that finishes somebody's order
    const value = resolveWildValue(plateSum(), pendingTargets(), currentWave());
    sfx.wild();
    item.value = value;
    item.spec = Object.assign({}, item.spec, { special: null });   // now an ordinary piece
    setChipValue(obj.userData.chip, value, '#fff3c9', '#a06a12');
    burst(obj.position.clone().add(new THREE.Vector3(0, 0.4, 0)),
      { kind: 'star', colors: ['#ffc93c', '#fff0b0'], count: 10, size: 0.36, rise: 1.0 });
    pulse(obj.userData.chip, 1.6);
    after(0.3, () => addToPlate(item));
    return;
  }

  S.tray[item.slot] = null;

  if (kind === 'tea') {
    sfx.tea();
    for (const c of S.customers) {
      if (c.state !== 'waiting') continue;
      c.patience = Math.min(c.maxPatience, c.patience + 7);
      burst(c.obj.position.clone().add(new THREE.Vector3(0, 1.8, 0.3)),
        { kind: 'puff', colors: ['#bfe3c0', '#ffffff'], count: 8, size: 0.4, rise: 1.2 });
      hop(c.obj, 0.25, 0.4);
    }
    toast('🍵 Everyone is happy to wait a little longer!');

  } else if (kind === 'wasabi') {
    sfx.wasabi();
    S.wasabi = true;
    toast('🌶️ Wasabi! Your next order scores double.');
    burst(obj.position.clone(), { kind: 'star', colors: ['#9bd46b', '#e8ffd8'], count: 12, size: 0.4, rise: 1.3 });
    updateHUD();
  }

  popOut(obj, 0.3, () => scene.remove(obj));
  after(0.4, () => dealSlot(item.slot, 0));
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

// ── Input ──────────────────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function hitTargets() {
  const list = [];
  for (const t of S.tray) {
    if (!t || t.busy) continue;
    t.obj.userData.hit.userData.owner = { type: 'tray', ref: t };
    list.push(t.obj.userData.hit);
  }
  for (const p of S.plateItems) {
    const hit = p.obj.userData.hit;
    if (!hit) continue;
    hit.userData.owner = { type: 'plate', ref: p };
    list.push(hit);
  }
  for (const c of S.customers) {
    if (c.state !== 'waiting') continue;
    c.obj.userData.hit.userData.owner = { type: 'customer', ref: c };
    list.push(c.obj.userData.hit);
  }
  return list;
}

function onPointerDown(e) {
  unlock();
  if (S.mode !== 'playing') return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(hitTargets(), false);
  if (!hits.length) return;

  const owner = hits[0].object.userData.owner;
  if (!owner) return;

  if (owner.type === 'tray') {
    const item = owner.ref;
    if (item.busy) return;
    if (item.spec.special) { item.busy = true; useSpecial(item); return; }
    if (S.plateItems.length >= MAX_PLATE) { sfx.nope(); wobble(rice, 0.12, 0.4); return; }
    addToPlate(item);

  } else if (owner.type === 'plate') {
    removeFromPlate(owner.ref);

  } else if (owner.type === 'customer') {
    serve(owner.ref);
  }
}

renderer.domElement.addEventListener('pointerdown', onPointerDown);

// ── Session flow ───────────────────────────────────────────────────────────
function startGame(seconds) {
  clearTweens();

  for (const t of S.tray) if (t) scene.remove(t.obj);
  for (const p of S.plateItems) scene.remove(p.obj);
  for (const c of S.customers) scene.remove(c.obj);

  S.mode = 'playing';
  S.sessionSeconds = seconds;
  S.timeLeft = seconds;
  S.score = 0; S.happy = 0; S.lost = 0;
  S.streak = 0; S.bestStreak = 0;
  S.wasabi = false;
  S.tray = new Array(TRAY_SLOTS).fill(null);
  S.plateItems = [];
  S.customers = [];
  S.seatBusy = [false, false, false];
  S.seatPending = [false, false, false];
  S.lastTickSecond = -1;
  lastTotalState = '';
  hudCache = {};

  startScreen.classList.remove('open');
  overScreen.classList.remove('open');
  pauseScreen.classList.remove('open');
  document.body.classList.add('playing');

  unlock();
  sfx.start();
  chef.userData.rest = 'happy';
  rice.userData.rest = 'happy';
  hop(chef, 0.5, 0.6);

  fillTray();
  refreshTotal();
  updateHUD();
  updateTimeBar();

  // customers only arrive once there is something to cook with
  scheduleSpawn(0, 1.0);
  scheduleSpawn(1, 2.4);
}

function endGame() {
  if (S.mode === 'over') return;
  S.mode = 'over';
  document.body.classList.remove('playing');
  sfx.finish();

  for (const c of S.customers.slice()) removeCustomer(c, false);
  clearPlate(true);

  const stars = starRating(S.score, S.sessionSeconds);
  const prevBest = parseInt(localStorage.getItem('sushi-best') || '0', 10);
  const best = Math.max(S.score, prevBest);
  localStorage.setItem('sushi-best', String(best));
  if (window.__avatarSave) window.__avatarSave('sushi-best', S.score, false);

  el('overScore').textContent  = S.score;
  el('overHappy').textContent  = S.happy;
  el('overLost').textContent   = S.lost;
  el('overStreak').textContent = S.bestStreak;
  el('overBest').textContent   = best;
  el('overStars').innerHTML =
    '<span class="on">' + '★'.repeat(stars) + '</span>' + '☆'.repeat(3 - stars);
  el('overTitle').textContent =
    stars === 3 ? 'Master Chef!' : stars === 2 ? 'Great service!' : stars === 1 ? 'Nice work!' : 'Good try!';
  el('overNote').textContent =
    S.happy === 0 ? 'Tap ingredients so their numbers add up to the order.'
      : S.score > prevBest ? 'A new personal best — Tamago is delighted!'
      : stars === 3 ? 'Tamago is very proud of you.'
      : 'Tip: three pieces in one sushi earns a bonus.';

  overScreen.classList.add('open');
}

function pauseGame(on) {
  if (S.mode === 'playing' && on) {
    S.mode = 'paused';
    pauseScreen.classList.add('open');
  } else if (S.mode === 'paused' && !on) {
    S.mode = 'playing';
    pauseScreen.classList.remove('open');
  }
}

// ── HUD ────────────────────────────────────────────────────────────────────
let hudCache = {};
function updateHUD() {
  if (hudCache.score !== S.score) { hudScore.textContent = S.score; hudCache.score = S.score; }
  if (hudCache.happy !== S.happy) { hudHappy.textContent = S.happy; hudCache.happy = S.happy; }

  const mult = comboMultiplier(S.streak);
  const label = S.wasabi ? '×' + mult * 2 + ' 🌶️' : mult > 1 ? '×' + mult : '';
  if (hudCache.combo !== label) {
    hudCombo.textContent = label;
    hudCombo.classList.toggle('on', !!label);
    hudCache.combo = label;
  }
}

function updateTimeBar() {
  timeFill.style.transform = 'scaleX(' + Math.max(0, S.timeLeft / S.sessionSeconds) + ')';
  timeWrap.classList.toggle('urgent', S.timeLeft <= 15 && S.mode === 'playing');
}

// ── Per-frame updates ──────────────────────────────────────────────────────
function updateGame(dt) {
  S.timeLeft -= dt;
  updateTimeBar();

  const sec = Math.ceil(S.timeLeft);
  if (sec !== S.lastTickSecond && S.timeLeft <= 10 && S.timeLeft > 0) {
    S.lastTickSecond = sec;
    sfx.tick(sec <= 5);
  }
  if (S.timeLeft <= 0) { S.timeLeft = 0; updateTimeBar(); endGame(); return; }

  const now = performance.now() * 0.006;
  for (const c of S.customers.slice()) {
    if (c.state !== 'waiting') continue;

    c.patience -= dt;
    const f = Math.max(0, c.patience / c.maxPatience);
    updatePatienceRing(c.obj.userData.ring, f);
    updateBlink(c.obj.userData.face, dt, c.matched ? 'excited' : f > 0.28 ? 'neutral' : 'worried');

    const glow = c.obj.userData.glow;
    const want = c.matched ? 0.5 + Math.sin(now) * 0.25 : 0;
    glow.material.opacity += (want - glow.material.opacity) * Math.min(1, dt * 8);
    const cardScale = c.matched ? 1.08 : 1;
    c.obj.userData.cardGroup.scale.lerp(new THREE.Vector3(cardScale, cardScale, cardScale), Math.min(1, dt * 8));

    if (f <= 0) {
      S.lost += 1;
      S.streak = 0;
      sfx.leave();
      chef.userData.rest = 'worried';
      after(1.2, () => { chef.userData.rest = 'happy'; });
      burst(c.obj.position.clone().add(new THREE.Vector3(0, 1.9, 0.2)),
        { kind: 'puff', colors: ['#cbbfb6'], count: 8, size: 0.4, rise: 0.9 });
      removeCustomer(c, false);
      updateHUD();
    }
  }

  for (let i = 0; i < activeSeats(); i++) {
    if (!S.seatBusy[i]) scheduleSpawn(i, 0.5 + Math.random() * 1.0);
  }

  updateHUD();
}

function updateIdleMotion(dt, time) {
  // nothing on screen is ever completely still
  for (const t of S.tray) {
    if (!t) continue;
    const d = t.obj.userData;
    t.obj.position.y = TRAY_Y + Math.sin(time * 1.6 + d.bobPhase) * 0.035;
    t.obj.rotation.y = Math.sin(time * 0.8 + d.bobPhase) * 0.12;
    updateBlink(d.face, dt, 'neutral');
  }

  for (const c of S.customers) {
    const d = c.obj.userData;
    d.bodyGroup.position.y = Math.sin(time * 2.1 + d.bobPhase) * 0.045;
    d.bodyGroup.rotation.z = Math.sin(time * 1.3 + d.bobPhase) * 0.03;
    d.cardGroup.position.y = 1.9 + Math.sin(time * 1.7 + d.bobPhase + 1) * 0.05;
  }

  const cd = chef.userData;
  chef.position.y = CHEF_POS.y + Math.sin(time * 1.9) * 0.05;
  cd.arms[0].rotation.z = -0.5 + Math.sin(time * 3.1) * 0.18;
  cd.arms[1].rotation.z = 0.5 - Math.sin(time * 3.1 + 0.6) * 0.18;
  updateBlink(cd.face, dt, chef.userData.rest);

  updateBlink(rice.userData.face, dt, rice.userData.rest);
  totalChip.position.y = 1.62 + S.plateItems.length * 0.2 + Math.sin(time * 2.4) * 0.05;
  totalChip.visible = S.mode === 'playing';
}

// ── Loop ───────────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);   // clamp so a backgrounded
  last = now;                                        // tab cannot fast-forward

  updateTweens(dt);
  if (S.mode === 'playing') updateGame(dt);
  updateIdleMotion(dt, now / 1000);

  camera.position.copy(cameraHome);
  applyShake(camera, CAM_TARGET, dt);

  renderer.render(scene, camera);
}

// ── Wiring ─────────────────────────────────────────────────────────────────
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 250));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'playing') pauseGame(true);
});

document.querySelectorAll('[data-start]').forEach(btn => {
  btn.addEventListener('click', () => startGame(parseInt(btn.dataset.start, 10)));
});
el('btnAgain').addEventListener('click', () => startGame(S.sessionSeconds));
el('btnMenu').addEventListener('click', () => {
  overScreen.classList.remove('open');
  startScreen.classList.add('open');
  S.mode = 'idle';
});
el('btnPause').addEventListener('click', () => pauseGame(S.mode === 'playing'));
el('btnResume').addEventListener('click', () => pauseGame(false));
el('btnQuit').addEventListener('click', () => { pauseScreen.classList.remove('open'); S.mode = 'playing'; endGame(); });
el('btnClear').addEventListener('click', () => { if (S.mode === 'playing') clearPlate(); });

btnMute.addEventListener('click', () => {
  setMuted(!isMuted());
  btnMute.textContent = isMuted() ? '🔇' : '🔊';
});
btnMute.textContent = isMuted() ? '🔇' : '🔊';
document.addEventListener('pointerdown', unlock, { once: true });

layout();
totalChip.visible = false;
requestAnimationFrame(frame);

// Exposed for console pokes and the headless smoke test: the same entry points
// the raycaster calls, so a scripted round exercises the real code paths.
window.__sushi = {
  S, startGame, endGame,
  tapTray:     i => { const t = S.tray[i]; if (!t || t.busy) return false;
                      if (t.spec.special) { t.busy = true; useSpecial(t); } else addToPlate(t); return true; },
  tapPlate:    i => { const p = S.plateItems[i]; if (!p) return false; removeFromPlate(p); return true; },
  tapCustomer: i => { const c = S.customers[i]; if (!c) return false; serve(c); return true; },
  plateSum
};
