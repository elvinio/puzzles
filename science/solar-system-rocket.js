/* ============================================================================
   solar-system-rocket.js — the ship, the aiming, and the three ways to watch.

   This is the presentation half of the rocket; solar-system-flight.js holds
   the maths and knows nothing about three.js or the DOM.

   The mission runs as a small state machine:

       off -> pick a planet to leave from -> pick where to go
           -> aim (drag, with a live preview of where you would end up)
           -> fly (play back the baked path) -> arrive

   The one idea worth knowing: once you launch, the whole trajectory is
   computed in one go and the ship then plays back along it. Nothing is
   integrated live. That means the line you were shown while aiming is exactly
   the line you fly, the mission can be fast-forwarded or rewound freely, and
   the camera has a smooth curve to follow instead of a jittering simulation.
   ========================================================================== */
import * as THREE from 'three';
import {
  makeSystem, kms, auPerDay,
  BUDGET_KMS, MAX_BURN_KMS, MAX_DAYS, PREVIEW_DAYS
} from './solar-system-flight.js';
import { dateFromJd } from './solar-system-ephem.js';
import { dotTexture, glowTexture } from './solar-system-textures.js';

export function initRocket(ctx) {
  const { scene, camera, canvas, AU_UNITS, radiusScene, getJd, setJd } = ctx;

  // The flight model wants radii in au; the display owns them in scene units.
  const radiusAU = {};
  for (const id in radiusScene) radiusAU[id] = radiusScene[id] / AU_UNITS;
  const sys = makeSystem(radiusAU);

  /* Ecliptic au -> scene units. Only valid while the page is in "real gaps"
     mode, where the map is a plain uniform scaling; mission mode forces that,
     because the squeezed view bends straight lines and would make every
     trajectory drawn here a lie. */
  const toScene = (x, y, z, out) => out.set(x * AU_UNITS, z * AU_UNITS, -y * AU_UNITS);

  // ── The ship ─────────────────────────────────────────────────────────────
  const SHIP_LEN = 0.05;                       // scene units, nose to tail

  function buildShip() {
    const g = new THREE.Group();
    /* Out here the only light is the Sun, and a chase camera usually sits on
       the ship's dark side — so without a little glow of its own the rocket
       reads as a black cut-out. A touch of emissive on every part keeps its
       shape legible from any angle without making it look lit from nowhere. */
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(SHIP_LEN * 0.17, SHIP_LEN * 0.2, SHIP_LEN * 0.62, 14),
      new THREE.MeshStandardMaterial({
        color: 0xe8e6f2, roughness: 0.42, metalness: 0.5,
        emissive: 0x6f7690, emissiveIntensity: 0.85
      })
    );
    g.add(body);

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(SHIP_LEN * 0.17, SHIP_LEN * 0.34, 14),
      new THREE.MeshStandardMaterial({
        color: 0xff7a6b, roughness: 0.5, metalness: 0.2,
        emissive: 0x8c3a32, emissiveIntensity: 0.9
      })
    );
    nose.position.y = SHIP_LEN * 0.48;
    g.add(nose);

    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(SHIP_LEN * 0.2, SHIP_LEN * 0.12, SHIP_LEN * 0.12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x6b6480, roughness: 0.6, metalness: 0.7,
        emissive: 0x39344a, emissiveIntensity: 0.9
      })
    );
    bell.position.y = -SHIP_LEN * 0.37;
    g.add(bell);

    const finMat = new THREE.MeshStandardMaterial({
      color: 0xa78bfa, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide,
      emissive: 0x4c3a86, emissiveIntensity: 0.9
    });
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(SHIP_LEN * 0.15, SHIP_LEN * 0.3, 4), finMat);
      const a = (i / 3) * Math.PI * 2;
      fin.position.set(Math.cos(a) * SHIP_LEN * 0.2, -SHIP_LEN * 0.26, Math.sin(a) * SHIP_LEN * 0.2);
      fin.rotation.y = -a;
      fin.rotation.x = Math.PI;
      fin.scale.z = 0.3;
      g.add(fin);
    }

    // Engine flare, lit only while a burn is happening.
    const plume = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(180,220,255,0.95)', 'rgba(90,120,255,0)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
    }));
    plume.position.y = -SHIP_LEN * 0.6;
    plume.scale.setScalar(SHIP_LEN * 1.1);
    g.add(plume);

    return { group: g, plume };
  }

  const ship = buildShip();
  ship.group.visible = false;
  scene.add(ship.group);

  // A coloured dot so the ship is findable from right across the system.
  const shipMark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,255,255,0.9)', 'rgba(160,190,255,0)'),
    color: new THREE.Color('#9fd0ff'), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  shipMark.visible = false;
  scene.add(shipMark);

  // ── Route drawing ────────────────────────────────────────────────────────
  const dot = dotTexture();
  const routeGroup = new THREE.Group();
  scene.add(routeGroup);

  function makeRoute(colour, size, opacity, count) {
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setDrawRange(0, 0);
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: dot, color: new THREE.Color(colour), transparent: true,
      opacity, sizeAttenuation: false, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    /* Positions are rewritten every frame but the bounding sphere is computed
       once, from the zero-filled buffer — which leaves three.js culling the
       whole route the moment the origin leaves the frustum. These are a few
       hundred points; skip the culling test rather than recompute the sphere
       against a partly stale array. */
    pts.frustumCulled = false;
    routeGroup.add(pts);
    return pts;
  }

  const ROUTE_PTS = 700;
  const plannedLine = makeRoute('#8fb7ff', 2.0, 0.55, ROUTE_PTS);   // the whole route
  const flownLine   = makeRoute('#ffd88a', 2.6, 0.95, ROUTE_PTS);   // the part already flown

  /** Resample a baked trajectory into the dotted route lines. */
  const _v = new THREE.Vector3();
  function drawRoute(traj, uptoJd) {
    if (!traj) {
      plannedLine.geometry.setDrawRange(0, 0);
      flownLine.geometry.setDrawRange(0, 0);
      return;
    }
    const arr = plannedLine.geometry.attributes.position.array;
    const flownArr = flownLine.geometry.attributes.position.array;
    const step = Math.max(1, Math.floor(traj.n / ROUTE_PTS));
    let n = 0, f = 0;
    for (let i = 0; i < traj.n && n < ROUTE_PTS; i += step) {
      toScene(traj.px[i], traj.py[i], traj.pz[i], _v);
      arr[n * 3] = _v.x; arr[n * 3 + 1] = _v.y; arr[n * 3 + 2] = _v.z;
      n++;
      if (uptoJd != null && traj.t[i] <= uptoJd && f < ROUTE_PTS) {
        flownArr[f * 3] = _v.x; flownArr[f * 3 + 1] = _v.y; flownArr[f * 3 + 2] = _v.z;
        f++;
      }
    }
    plannedLine.geometry.attributes.position.needsUpdate = true;
    plannedLine.geometry.setDrawRange(0, n);
    flownLine.geometry.attributes.position.needsUpdate = true;
    flownLine.geometry.setDrawRange(0, f);
  }

  // Markers at each close pass, so a slingshot is something you can point at.
  const encMarks = [];
  function drawEncounters(traj) {
    for (const m of encMarks) m.visible = false;
    if (!traj) return;
    traj.encounters.forEach((e, i) => {
      let m = encMarks[i];
      if (!m) {
        m = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture('rgba(255,240,190,0.9)', 'rgba(255,180,60,0)'),
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
        }));
        scene.add(m);
        encMarks[i] = m;
      }
      toScene(traj.px[e.index], traj.py[e.index], traj.pz[e.index], m.position);
      m.visible = true;
      m.userData.enc = e;
    });
  }

  /* The launch arrow. Without something to grab, "drag to aim" is an
     instruction with nothing to point at — so the ship trails a dotted arrow
     showing exactly which way and how hard it is about to push. */
  const AIM_PTS = 34;
  const aimLine = makeRoute('#ffd88a', 3.2, 0.95, AIM_PTS);
  const aimHandle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,236,180,0.95)', 'rgba(255,170,60,0)'),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  aimHandle.visible = false;
  scene.add(aimHandle);

  const _a0 = new THREE.Vector3(), _a1 = new THREE.Vector3();
  function drawAim() {
    if (M.phase !== 'aim' || !M.aimDir || M.aimSpeed <= 0) {
      aimLine.geometry.setDrawRange(0, 0);
      aimHandle.visible = false;
      return;
    }
    // Length tracks the fraction of a full burn, so the arrow reads as a
    // throttle as much as a direction.
    const frac = M.aimSpeed / auPerDay(MAX_BURN_KMS);
    const reach = Math.max(ctx.viewDist() * 0.3 * frac, radiusScene[M.fromId] * 2);
    _a0.copy(shipScene);
    toScene(M.aimDir[0], M.aimDir[1], M.aimDir[2], _a1).normalize();

    const arr = aimLine.geometry.attributes.position.array;
    for (let i = 0; i < AIM_PTS; i++) {
      const t = (i / (AIM_PTS - 1)) * reach;
      arr[i * 3]     = _a0.x + _a1.x * t;
      arr[i * 3 + 1] = _a0.y + _a1.y * t;
      arr[i * 3 + 2] = _a0.z + _a1.z * t;
    }
    aimLine.geometry.attributes.position.needsUpdate = true;
    aimLine.geometry.setDrawRange(0, AIM_PTS);

    aimHandle.position.copy(_a0).addScaledVector(_a1, reach);
    aimHandle.scale.setScalar(camera.position.distanceTo(aimHandle.position) * 0.045);
    aimHandle.visible = true;
  }

  // A ring around whichever planet is the destination.
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(1, 1.06, 64),
    new THREE.MeshBasicMaterial({
      color: 0x9fd0ff, transparent: true, opacity: 0.6,
      side: THREE.DoubleSide, depthWrite: false
    })
  );
  targetRing.visible = false;
  scene.add(targetRing);

  // ── Mission state ────────────────────────────────────────────────────────
  const M = {
    phase: 'off',            // off | from | to | aim | fly | done
    fromId: null,
    toId: null,
    aimDir: null,            // unit vector, ecliptic au frame
    aimSpeed: 0,             // au/day, relative to the departure planet
    fuel: auPerDay(BUDGET_KMS),
    traj: null,
    preview: null,
    launchJd: 0,
    view: 'map',             // map | chase | cockpit
    look: { yaw: 0, pitch: 0 },
    result: null,
    windowHint: ''        // "waiting until X would be cheaper", kept across redraws
  };

  const pos = [0, 0, 0], vel = [0, 0, 0];
  const shipScene = new THREE.Vector3();
  const shipDir = new THREE.Vector3(0, 1, 0);
  let shipActive = false;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const el = id => document.getElementById(id);
  const ui = {
    bar: el('missionBar'), status: el('mStatus'), detail: el('mDetail'),
    fuelFill: el('mFuelFill'), fuelText: el('mFuelText'),
    actions: el('mActions'),
    views: el('mViews'), hud: el('cockpitHud'),
    hudSpeed: el('hudSpeed'), hudBody: el('hudBody'),
    hudTarget: el('hudTarget'), hudEta: el('hudEta'),
    targetMark: el('hudTargetMark')
  };

  const dateFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });
  const fmtDate = jd => dateFmt.format(dateFromJd(jd));
  const nameOf = id => ctx.nameOf(id);

  function button(label, cls, fn) {
    const b = document.createElement('button');
    b.className = 'chip ' + (cls || '');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  function setActions(...buttons) {
    ui.actions.replaceChildren(...buttons.filter(Boolean));
  }

  function setFuel() {
    const frac = Math.max(0, M.fuel) / auPerDay(BUDGET_KMS);
    ui.fuelFill.style.width = (frac * 100).toFixed(1) + '%';
    ui.fuelFill.classList.toggle('low', frac < 0.25);
    ui.fuelText.textContent = kms(Math.max(0, M.fuel)).toFixed(1) + ' km/s of fuel left';
  }

  // ── Reading a predicted trajectory back in words ─────────────────────────
  function describe(traj) {
    if (!traj) return { text: 'Drag from the rocket to aim.', ok: false };
    const o = traj.outcome;
    const via = traj.encounters
      .filter(e => e.id !== M.toId && e.id !== M.fromId)
      .map(e => nameOf(e.id));
    const swing = via.length ? ` Swings past ${via.join(' and ')} on the way.` : '';

    if (o.kind === 'arrive') {
      const days = Math.round(o.jd - traj.jd0);
      return {
        ok: true,
        text: `Reaches ${nameOf(o.id)} on ${fmtDate(o.jd)} — ${days} days.` + swing
      };
    }
    if (o.kind === 'impact') return { ok: false, text: `Crashes into ${nameOf(o.id)} on ${fmtDate(o.jd)}.` };
    if (o.kind === 'sun')    return { ok: false, text: 'Falls into the Sun.' };
    if (o.kind === 'escape') return { ok: false, text: 'Leaves the solar system for ever.' + swing };

    // Timed out: say how close it got, which is the useful part.
    if (M.toId) {
      let best = Infinity, bestJd = 0;
      for (let i = 0; i < traj.n; i += 3) {
        const p = sys.planetPos(M.toId, traj.t[i]);
        const d = Math.hypot(traj.px[i] - p[0], traj.py[i] - p[1], traj.pz[i] - p[2]);
        if (d < best) { best = d; bestJd = traj.t[i]; }
      }
      const km = (best * 1.495978707e8 / 1e6).toFixed(0);
      return {
        ok: false,
        text: `Misses ${nameOf(M.toId)} by ${km} million km on ${fmtDate(bestJd)}.` + swing
      };
    }
    return { ok: false, text: 'Drifts off into the dark.' + swing };
  }

  // ── Aiming ───────────────────────────────────────────────────────────────
  /* The drag is read as a point on the ecliptic plane through the ship: the
     launch vector runs from the ship to wherever your finger is. That keeps
     aiming intelligible at any camera angle, and it keeps the burn in the
     plane the planets actually live in, which is where you want it. */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();

  function aimFromPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);

    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), shipScene);
    if (!ray.ray.intersectPlane(plane, hit)) return false;

    const dx = hit.x - shipScene.x, dz = hit.z - shipScene.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return false;

    // Scene axes back to ecliptic: scene (x, y, z) = (ex, ez, -ey) * k.
    const ex = dx, ey = -dz;
    const n = Math.hypot(ex, ey);
    M.aimDir = [ex / n, ey / n, 0];

    // Pull distance is measured against the current zoom, so the gesture feels
    // the same whether you are looking at the whole system or one planet.
    const full = Math.max(ctx.viewDist() * 0.32, radiusScene[M.fromId] * 6);
    const frac = Math.min(1, dist / full);
    M.aimSpeed = auPerDay(MAX_BURN_KMS) * frac;
    return true;
  }

  let previewTimer = 0, previewDirty = false;

  function launchState() {
    const park = sys.parkOffset(M.fromId, getJd(), M.aimDir);
    const vFrom = sys.planetVel(M.fromId, getJd());
    const v = [
      vFrom[0] + M.aimDir[0] * M.aimSpeed,
      vFrom[1] + M.aimDir[1] * M.aimSpeed,
      vFrom[2] + M.aimDir[2] * M.aimSpeed
    ];
    return { park, vel: v };
  }

  function refreshPreview(full = false) {
    if (!M.aimDir || M.aimSpeed <= 0) { M.preview = null; drawRoute(null); updateAimUI(); return; }
    const { park, vel: v } = launchState();
    M.preview = sys.bake({
      jd0: getJd(), pos: park, vel: v, targetId: M.toId, departId: M.fromId,
      maxDays: full ? MAX_DAYS : PREVIEW_DAYS
    });
    drawRoute(M.preview, null);
    drawEncounters(M.preview);
    updateAimUI();
  }

  /** Point the camera at a whole trajectory, so you can see where it goes. */
  const _c = new THREE.Vector3();
  function frameRoute(traj) {
    if (!traj || traj.n < 2) return;
    const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
    const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const step = Math.max(1, Math.floor(traj.n / 200));
    for (let i = 0; i < traj.n; i += step) {
      toScene(traj.px[i], traj.py[i], traj.pz[i], _c);
      lo.min(_c); hi.max(_c);
    }
    const centre = lo.clone().add(hi).multiplyScalar(0.5);
    const span = Math.max(lo.distanceTo(hi), radiusScene[M.fromId] * 8);
    ctx.focusScene(centre, span * 1.15);
  }

  function burnCost() {
    // Leaving the planet costs whatever the climb costs, on top of the aim.
    return Math.hypot(M.aimSpeed, sys.escapeToll(M.fromId));
  }

  function updateAimUI() {
    const d = describe(M.preview);
    const cost = burnCost();
    const over = cost > M.fuel;
    ui.status.textContent = `${nameOf(M.fromId)} → ${nameOf(M.toId)}`;
    ui.detail.innerHTML =
      `<span class="${d.ok && !over ? 'good' : 'warn'}">${d.text}</span>` +
      `<span class="m-burn">Burn ${kms(cost).toFixed(1)} km/s` +
      (over ? ' — more than you have' : '') + '</span>' +
      M.windowHint;
    const launchBtn = ui.actions.querySelector('.launch');
    if (launchBtn) launchBtn.disabled = over || M.aimSpeed <= 0;
  }

  // ── Suggest a launch ─────────────────────────────────────────────────────
  function doSuggest(btn) {
    btn.disabled = true;
    btn.textContent = 'Working…';
    // Let the button repaint before the solver blocks the thread.
    setTimeout(() => {
      const p = sys.plan(M.fromId, M.toId, getJd(), Math.min(M.fuel, auPerDay(MAX_BURN_KMS)));
      btn.disabled = false;
      btn.textContent = '✨ Suggest';
      if (!p) {
        const w = sys.windows(M.fromId, M.toId, getJd(), 4000, 30)
          .filter(x => x.cost <= Math.min(M.fuel, auPerDay(MAX_BURN_KMS)));
        ui.detail.innerHTML = w.length
          ? `<span class="warn">Not from today. The next good launch window is ` +
            `${fmtDate(w[0].jd)} — wind the clock forward and try again.</span>`
          : `<span class="warn">${nameOf(M.toId)} is too far to reach on one burn. ` +
            `Fly past Jupiter and let its gravity throw you out there instead.</span>`;
        return;
      }
      const vFrom = sys.planetVel(M.fromId, getJd());
      const dv = [p.vel[0] - vFrom[0], p.vel[1] - vFrom[1], p.vel[2] - vFrom[2]];
      const n = Math.hypot(...dv) || 1;
      M.aimDir = [dv[0] / n, dv[1] / n, dv[2] / n];
      M.aimSpeed = n;
      refreshPreview(true);
      frameRoute(M.preview);
      offerWindow(p.cost);
    }, 30);
  }

  /**
   * If waiting would make the trip markedly cheaper, say so and offer to wind
   * the clock forward. Launch windows are the reason real missions sit on the
   * pad for years, and this is the moment that lands.
   */
  function offerWindow(costNow) {
    const w = sys.windows(M.fromId, M.toId, getJd(), 2600, 30)
      .find(x => x.cost < costNow * 0.75);
    if (!w) return;
    M.windowHint =
      `<span class="m-hint">Waiting until ${fmtDate(w.jd)} would cost only ` +
      `${kms(w.cost).toFixed(1)} km/s — the planets only line up for a cheap ` +
      `trip every so often.</span>`;
    setActions(
      button('✨ Suggest', 'quiet', function () { doSuggest(this); }),
      button('⏩ Wait for ' + fmtDate(w.jd), 'quiet', () => {
        setJd(w.jd);
        M.aimDir = null;
        M.aimSpeed = 0;
        askAim();
      }),
      button('🚀 Launch', 'launch primary', doLaunch),
      button('↩ Back', 'quiet', askTo)
    );
    updateAimUI();
  }

  // ── Phases ───────────────────────────────────────────────────────────────
  function setPhase(p) {
    M.phase = p;
    ui.bar.hidden = p === 'off';
    ui.views.hidden = p !== 'fly' && p !== 'done';
    ui.hud.hidden = !(M.view === 'cockpit' && (p === 'fly' || p === 'done'));
    canvas.classList.toggle('aiming', p === 'aim');
  }

  function begin() {
    ctx.beginMission();
    M.fuel = auPerDay(BUDGET_KMS);
    M.fromId = M.toId = null;
    M.aimDir = null;
    M.aimSpeed = 0;
    M.traj = M.preview = M.result = null;
    M.view = 'map';
    shipActive = false;
    ship.group.visible = false;
    shipMark.visible = false;
    targetRing.visible = false;
    drawRoute(null);
    drawEncounters(null);
    setFuel();
    askFrom();
  }

  /* At real distances the inner planets sit in a knot a few units across while
     Neptune is three hundred units out, so their labels collide, hide, and
     leave nothing to tap. A row of chips is the dependable way to choose a
     world — and on a phone it beats hunting for a two-pixel dot even when the
     labels do show. Tapping a planet in the sky still works too. */
  function planetChips(skipId, onPick) {
    return sys.ids.filter(id => id !== skipId).map(id => {
      const b = button(nameOf(id), 'world', () => onPick(id));
      const swatch = document.createElement('span');
      swatch.className = 'p-dot sm';
      swatch.style.background = ctx.colorOf(id);
      b.prepend(swatch);
      return b;
    });
  }

  function askFrom() {
    setPhase('from');
    ui.status.textContent = 'Choose your launch pad';
    ui.detail.innerHTML = '<span class="m-hint">Pick a planet to start from — or tap one in the sky.</span>';
    setActions(...planetChips(null, id => { M.fromId = id; askTo(); }),
      button('✕ Leave', 'quiet', end));
  }

  function askTo() {
    setPhase('to');
    ui.status.textContent = `Launching from ${nameOf(M.fromId)}`;
    ui.detail.innerHTML = '<span class="m-hint">Where do you want to go?</span>';
    setActions(...planetChips(M.fromId, id => { M.toId = id; askAim(); }),
      button('↩ Change', 'quiet', askFrom), button('✕ Leave', 'quiet', end));
  }

  function askAim() {
    setPhase('aim');
    M.windowHint = '';
    ctx.setPlaying(false);                 // hold the clock still while aiming
    placeShipParked();

    const launch = button('🚀 Launch', 'launch primary', doLaunch);
    setActions(
      button('✨ Suggest', 'quiet', function () { doSuggest(this); }),
      launch,
      button('↩ Back', 'quiet', askTo)
    );
    refreshPreview();
    ctx.focusScene(shipScene, Math.max(radiusScene[M.fromId] * 26, 3));
  }

  function placeShipParked() {
    const p = sys.parkOffset(M.fromId, getJd(), M.aimDir);
    pos[0] = p[0]; pos[1] = p[1]; pos[2] = p[2];
    toScene(pos[0], pos[1], pos[2], shipScene);
    ship.group.position.copy(shipScene);
    shipActive = true;
    ship.group.visible = true;
    shipMark.visible = true;

    // Nose points the way you are currently aiming.
    if (M.aimDir) {
      toScene(M.aimDir[0], M.aimDir[1], M.aimDir[2], shipDir);
      shipDir.normalize();
      ship.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shipDir);
    }
  }

  function doLaunch() {
    if (M.aimSpeed <= 0) return;
    const cost = burnCost();
    if (cost > M.fuel) return;

    const { park, vel: v } = launchState();
    M.traj = sys.bake({
      jd0: getJd(), pos: park, vel: v, targetId: M.toId,
      departId: M.fromId, maxDays: MAX_DAYS
    });
    M.fuel -= cost;
    M.launchJd = getJd();
    M.result = null;
    setFuel();
    drawRoute(M.traj, getJd());
    drawEncounters(M.traj);

    setPhase('fly');
    M.view = 'chase';
    syncViewButtons();
    ctx.setPlaying(true);
    ctx.setSpeedDays(3);
    ui.status.textContent = `${nameOf(M.fromId)} → ${nameOf(M.toId)}`;
    setActions(
      button('⏭ Skip ahead', 'quiet', skipToEvent),
      button('✕ End mission', 'quiet', end)
    );
  }

  /**
   * Jump the clock to just before the next interesting moment — a flyby, or
   * the arrival. Stopping a few days short rather than at the event itself
   * matters: the close pass is the whole point of the trip, and landing the
   * clock right on top of it would skip the bit worth watching.
   */
  function skipToEvent() {
    if (!M.traj) return;
    const now = getJd();
    const next = M.traj.encounters.find(e => e.jd > now + 1);
    const o = M.traj.outcome;
    setJd(next ? next.jd - 3
      : (o.jd && o.jd > now + 1 ? o.jd - 3 : M.traj.jdEnd));
    ctx.setSpeedDays(0.25);              // slow right down for the encounter
  }

  function finish() {
    const o = M.traj.outcome;
    setPhase('done');
    ctx.setPlaying(false);
    M.result = o;

    if (o.kind === 'arrive') {
      // A flyby is a flyby unless you can pay to stop, so charge the braking
      // burn if there is fuel for it and say plainly which one happened.
      const circ = Math.sqrt(sys.gm[sys.byId[o.id]] / Math.max(o.dist, radiusAU[o.id]));
      const brake = Math.max(0, o.speed - circ);
      const captured = brake <= M.fuel;
      if (captured) { M.fuel -= brake; setFuel(); }

      ui.status.textContent = `You reached ${nameOf(o.id)}!`;
      ui.detail.innerHTML = captured
        ? `<span class="good">Arrived ${fmtDate(o.jd)} after ${Math.round(o.jd - M.launchJd)} days. ` +
          `Braking burn ${kms(brake).toFixed(1)} km/s — you are in orbit.</span>`
        : `<span class="warn">Flew past on ${fmtDate(o.jd)} at ${kms(o.speed).toFixed(1)} km/s. ` +
          `Stopping would have cost ${kms(brake).toFixed(1)} km/s and the tank is too low — ` +
          `so it is a flyby, just like Voyager.</span>`;
      ctx.selectBody(o.id);
      setActions(button('🚀 New mission', 'primary', begin), button('✓ Done', 'quiet', end));
    } else {
      const d = describe(M.traj);
      ui.status.textContent = o.kind === 'impact' ? 'Crashed' :
        o.kind === 'sun' ? 'Lost to the Sun' :
          o.kind === 'escape' ? 'Gone for ever' : 'Mission over';
      ui.detail.innerHTML = `<span class="warn">${d.text}</span>`;
      setActions(button('🚀 Try again', 'primary', begin), button('✕ Leave', 'quiet', end));
    }
  }

  function end() {
    setPhase('off');
    shipActive = false;
    ship.group.visible = false;
    shipMark.visible = false;
    targetRing.visible = false;
    drawRoute(null);
    drawEncounters(null);
    M.traj = M.preview = null;
    M.fromId = M.toId = null;
    ctx.endMission();
  }

  // ── Picking planets during setup ─────────────────────────────────────────
  function handlePick(id) {
    if (M.phase === 'from') {
      if (!sys.byId.hasOwnProperty(id)) return true;      // moons and the Sun are not launch pads
      M.fromId = id;
      askTo();
      return true;
    }
    if (M.phase === 'to') {
      if (!sys.byId.hasOwnProperty(id) || id === M.fromId) return true;
      M.toId = id;
      askAim();
      return true;
    }
    return M.phase !== 'off' && M.phase !== 'fly' && M.phase !== 'done';
  }

  // ── Aiming and free-look gestures ────────────────────────────────────────
  let dragging = false;

  canvas.addEventListener('pointerdown', e => {
    if (M.phase === 'aim') { dragging = true; aimFromPointer(e.clientX, e.clientY); previewDirty = true; }
  }, true);

  canvas.addEventListener('pointermove', e => {
    if (M.phase === 'aim' && dragging) {
      if (aimFromPointer(e.clientX, e.clientY)) {
        placeShipParked();
        previewDirty = true;
      }
      e.stopPropagation();
    } else if (M.view === 'cockpit' && (M.phase === 'fly' || M.phase === 'done') && e.buttons) {
      M.look.yaw   -= e.movementX * 0.004;
      M.look.pitch -= e.movementY * 0.004;
      M.look.pitch = Math.max(-1.2, Math.min(1.2, M.look.pitch));
      e.stopPropagation();
    }
  }, true);

  for (const ev of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(ev, () => {
      if (dragging) { dragging = false; previewDirty = true; }
    }, true);
  }

  // ── Camera views ─────────────────────────────────────────────────────────
  const camPos = new THREE.Vector3(), camAim = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let camReady = false;

  function syncViewButtons() {
    for (const b of ui.views.querySelectorAll('button')) {
      b.classList.toggle('on', b.dataset.view === M.view);
    }
    ui.hud.hidden = !(M.view === 'cockpit' && (M.phase === 'fly' || M.phase === 'done'));
    if (M.view !== 'cockpit') { M.look.yaw = M.look.pitch = 0; }
    camReady = false;
  }

  ui.views.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    M.view = b.dataset.view;
    syncViewButtons();
    if (M.view === 'map') frameRoute(M.traj || M.preview);
  });

  /**
   * Drive the camera for chase and cockpit. Returns true when it has taken
   * over, so the orrery's own rig stands down for the frame.
   */
  const _right = new THREE.Vector3(), _q = new THREE.Quaternion();
  const _look = new THREE.Vector3(), _gaze = new THREE.Vector3(), _tp = new THREE.Vector3();

  /**
   * How strongly the view should turn to face the destination, given how near
   * it is: nothing at all out in the cruise, all the way over once the planet
   * fills a good part of the sky. Writes the unit direction into `out`.
   */
  function gazeTarget(out) {
    const body = M.phase === 'done' && M.result && M.result.id ? M.result.id : M.toId;
    if (!body) return 0;
    const p = sys.planetPos(body, getJd());
    toScene(p[0], p[1], p[2], _tp);
    out.copy(_tp).sub(shipScene);
    const d = out.length();
    if (d < 1e-9) return 0;
    out.divideScalar(d);
    // Fade in across the last stretch of the approach.
    const near = radiusScene[body] * 3, far = radiusScene[body] * 18;
    return Math.max(0, Math.min(1, (far - d) / (far - near)));
  }

  function driveCamera(dt) {
    if (M.view === 'map' || !shipActive) return false;

    // A sideways vector for the flight path, guarded for the moment the ship
    // happens to be heading straight up or down the ecliptic pole.
    _right.crossVectors(shipDir, up);
    if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
    _right.normalize();

    if (M.view === 'cockpit') {
      camPos.copy(shipScene).addScaledVector(shipDir, SHIP_LEN * 0.75);
      camera.position.copy(camPos);

      /* Normally you look where you are going. But a transfer orbit does not
         point its nose at the destination — it arrives sideways — so flying
         strictly prograde would leave the planet off the edge of the screen at
         the one moment worth seeing. As the target closes, the gaze swings
         over to it. */
      camAim.copy(shipDir);
      const t = gazeTarget(_gaze);
      if (t > 0) camAim.lerp(_gaze, t).normalize();

      camAim.applyQuaternion(_q.setFromAxisAngle(up, M.look.yaw));
      camAim.applyQuaternion(_q.setFromAxisAngle(_right, M.look.pitch));
      camera.lookAt(_look.copy(camPos).add(camAim));
    } else {
      /* Behind, above and off to one side. Sitting straight up the exhaust
         shows nothing but the engine bell; a three-quarter view reads as a
         rocket going somewhere. */
      camPos.copy(shipScene)
        .addScaledVector(shipDir, -SHIP_LEN * 4.6)
        .addScaledVector(up, SHIP_LEN * 1.7)
        .addScaledVector(_right, SHIP_LEN * 2.4);

      const k = 1 - Math.pow(0.0016, dt);        // frame-rate independent easing
      if (!camReady) { camera.position.copy(camPos); camReady = true; }
      else camera.position.lerp(camPos, k);
      camera.lookAt(camAim.copy(shipScene).addScaledVector(shipDir, SHIP_LEN * 2.2));
    }
    return true;
  }

  // ── Cockpit readouts ─────────────────────────────────────────────────────
  const _proj = new THREE.Vector3();

  function updateHud() {
    if (ui.hud.hidden) return;
    const speed = Math.hypot(vel[0], vel[1], vel[2]);
    ui.hudSpeed.textContent = kms(speed).toFixed(1) + ' km/s';

    const dom = sys.dominant(pos[0], pos[1], pos[2], getJd(), M.traj.tab);
    ui.hudBody.textContent = dom === 'sun' ? 'Held by the Sun' : `Held by ${nameOf(dom)}`;

    if (M.toId) {
      const tp = sys.planetPos(M.toId, getJd());
      const d = Math.hypot(tp[0] - pos[0], tp[1] - pos[1], tp[2] - pos[2]);
      ui.hudTarget.textContent = `${nameOf(M.toId)} · ${(d * 1.495978707e8 / 1e6).toFixed(0)}M km`;
      const o = M.traj.outcome;
      ui.hudEta.textContent = o.kind === 'arrive' && o.jd > getJd()
        ? `arrive in ${Math.round(o.jd - getJd())} days` : '';

      // Where the target sits on screen, if it is in front of you.
      toScene(tp[0], tp[1], tp[2], _proj);
      _proj.project(camera);
      const on = _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1;
      ui.targetMark.style.display = on ? '' : 'none';
      if (on) {
        ui.targetMark.style.left = ((_proj.x * 0.5 + 0.5) * 100) + '%';
        ui.targetMark.style.top = ((-_proj.y * 0.5 + 0.5) * 100) + '%';
      }
    }
  }

  // ── Per-frame ────────────────────────────────────────────────────────────
  function update(dt) {
    if (M.phase === 'off') return false;

    if (M.phase === 'aim') {
      // Re-fly the preview at most a few times a second; the solver is cheap
      // but not free, and a human drag does not need sixty updates a second.
      previewTimer += dt;
      if (previewDirty && previewTimer > 0.06) {
        previewDirty = false;
        previewTimer = 0;
        refreshPreview();
      }
      ship.plume.material.opacity = 0.25 + 0.2 * Math.sin(performance.now() * 0.006);
      drawAim();
    }

    if (M.phase === 'fly' || M.phase === 'done') {
      const jd = Math.min(getJd(), M.traj.jdEnd);
      const st = sys.stateAt(M.traj, jd, pos, vel);
      toScene(pos[0], pos[1], pos[2], shipScene);
      ship.group.position.copy(shipScene);

      const sp = Math.hypot(vel[0], vel[1], vel[2]);
      if (sp > 1e-9) {
        toScene(vel[0], vel[1], vel[2], shipDir);
        shipDir.normalize();
        ship.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), shipDir);
      }
      ship.plume.material.opacity = 0;
      drawRoute(M.traj, jd);

      if (M.toId) {
        const tp = sys.planetPos(M.toId, getJd());
        toScene(tp[0], tp[1], tp[2], targetRing.position);
        const r = radiusScene[M.toId] * 2.2;
        targetRing.scale.setScalar(r);
        targetRing.quaternion.copy(camera.quaternion);
        targetRing.visible = true;
      }

      if (M.phase === 'fly' && st.done) finish();
      updateHud();
    }

    // Keep the ship's marker readable from any distance, the way planets do.
    if (shipActive) {
      const eye = camera.position.distanceTo(shipScene);
      shipMark.position.copy(shipScene);
      shipMark.scale.setScalar(Math.max(eye * 0.016, SHIP_LEN * 2.2));
      shipMark.visible = M.view === 'map' || M.phase === 'aim';

      /* At map distances a true-size rocket is well under a pixel. Chase and
         cockpit put the camera right beside it, so there it stays its own
         size; anywhere else it is grown to hold a steady share of the screen.
         Everything on this page is already drawn out of scale — the ship is
         the one thing that has to stay findable. */
      const grown = Math.max(1, eye * 0.05 / SHIP_LEN);
      ship.group.scale.setScalar(M.view === 'map' || M.phase === 'aim' ? grown : 1);
      // Hide the hull when the camera is sitting inside it.
      ship.group.visible = !(M.view === 'cockpit' && (M.phase === 'fly' || M.phase === 'done'));
    }

    for (const m of encMarks) {
      if (m.visible) m.scale.setScalar(camera.position.distanceTo(m.position) * 0.02);
    }

    return driveCamera(dt);
  }

  // ── Entry point ──────────────────────────────────────────────────────────
  el('btnRocket').addEventListener('click', () => {
    if (M.phase === 'off') begin(); else end();
  });

  setFuel();
  setPhase('off');

  return {
    update,
    handlePick,
    isActive: () => M.phase !== 'off',
    isAiming: () => M.phase === 'aim',
    ownsCamera: () => M.phase !== 'off' && M.view !== 'map' && shipActive,
    shipPosition: () => shipScene,
    followsShip: () => M.phase === 'fly' && M.view === 'map'
  };
}
