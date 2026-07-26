/* ============================================================================
   models.js — every mesh in the game, built procedurally. No model files, no
   textures on disk: the whole sushi bar is generated at boot so the page stays
   a handful of small text files and works offline.

   House style is "kawaii claymation": chunky rounded silhouettes, matte
   MeshPhysicalMaterial with a whisper of clearcoat, and a warm pastel palette.
   ========================================================================== */
import * as THREE from 'three';
import { makeFace, makeNumberChip, makeOrderCard, makePatienceRing } from './faces.js';

// ── Palette ────────────────────────────────────────────────────────────────
export const PAL = {
  cream:    0xFFF3E2,
  rice:     0xFFFBF3,
  salmon:   0xFF9AA2,
  seafoam:  0x9BE3C9,
  butter:   0xFFE08A,
  cocoa:    0x8C6A5D,
  wood:     0xE0B084,
  woodDark: 0xC08E63,
  nori:     0x3B4A45,
  tuna:     0xE4626F,
  ink:      0x5B4038
};

// ── Materials ──────────────────────────────────────────────────────────────
const matCache = new Map();

/** The one material recipe the whole game uses. Cached per colour+options. */
export function clay(color, opts = {}) {
  const key = color + '|' + (opts.rough ?? 0.85) + '|' + (opts.clearcoat ?? 0.15) +
              '|' + (opts.emissive ?? 0) + '|' + (opts.transparent ? 1 : 0);
  if (matCache.has(key)) return matCache.get(key);

  const m = new THREE.MeshPhysicalMaterial({
    color,
    roughness:  opts.rough ?? 0.85,
    metalness:  0,
    clearcoat:  opts.clearcoat ?? 0.15,
    clearcoatRoughness: 0.6,
    sheen:      0.35,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.9,
    emissive:   new THREE.Color(opts.emissive ?? 0x000000),
    flatShading: !!opts.flat,
    transparent: !!opts.transparent,
    opacity:     opts.opacity ?? 1
  });
  matCache.set(key, m);
  return m;
}

// ── Geometry helpers ───────────────────────────────────────────────────────

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const geoCache = new Map();
function cached(key, build) {
  if (!geoCache.has(key)) geoCache.set(key, build());
  return geoCache.get(key);
}

/**
 * A pillow-soft box: w × d footprint, h tall, corners rounded in plan and
 * bevelled top and bottom. This single primitive carries most of the game.
 */
export function roundedSlab(w, d, h, r = 0.12, bevel = 0.045) {
  return cached(`slab|${w}|${d}|${h}|${r}|${bevel}`, () => {
    const b = Math.min(bevel, h / 2 - 0.005, r * 0.8);
    const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
      depth: Math.max(0.002, h - b * 2),
      bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3,
      curveSegments: 8
    });
    geo.rotateX(-Math.PI / 2);   // extrude along +Y instead of +Z
    geo.center();
    geo.computeVertexNormals();
    return geo;
  });
}

/** A soft leaf / petal outline, extruded thin. */
export function leafGeo(len = 1, wid = 0.5, thick = 0.1) {
  return cached(`leaf|${len}|${wid}|${thick}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-len / 2, 0);
    s.quadraticCurveTo(0,  wid / 2, len / 2, 0);
    s.quadraticCurveTo(0, -wid / 2, -len / 2, 0);
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: thick * 0.6, bevelEnabled: true,
      bevelThickness: thick * 0.2, bevelSize: thick * 0.2, bevelSegments: 2, curveSegments: 12
    });
    geo.rotateX(-Math.PI / 2);
    geo.center();
    geo.computeVertexNormals();
    return geo;
  });
}

const sphereGeo   = (s = 16) => cached('sph|' + s,  () => new THREE.SphereGeometry(0.5, s, Math.max(8, s / 2)));
const cylGeo      = (s = 20) => cached('cyl|' + s,  () => new THREE.CylinderGeometry(0.5, 0.5, 1, s));
const capsuleGeo  = ()       => cached('cap',       () => new THREE.CapsuleGeometry(0.32, 0.5, 6, 14));
const torusGeo    = ()       => cached('tor',       () => new THREE.TorusGeometry(0.36, 0.17, 10, 22, Math.PI * 1.35));
const coneGeo     = ()       => cached('cone',      () => new THREE.ConeGeometry(0.5, 1, 18));

// ── Ingredient catalogue ───────────────────────────────────────────────────
/*
   Twenty-eight varieties. `shape` picks the silhouette, `deco` adds the one
   detail that makes it legible at a glance, `emoji` is what the HUD shows.
   Numbers are NOT part of a spec — they are assigned when an ingredient is
   dealt into the tray, so the same prawn can be a 3 one round and an 8 the
   next and the maths stays fresh.
*/
export const INGREDIENTS = [
  // neta — the fish and egg cuts that sit on top of the rice
  { id: 'tamago',   name: 'Tamago',      shape: 'slab',    color: 0xFFD86B, accent: 0x3B4A45, deco: 'noriband', emoji: '🍳' },
  { id: 'salmon',   name: 'Salmon',      shape: 'slab',    color: 0xFF9A76, accent: 0xFFD9C8, deco: 'stripes',  emoji: '🍣' },
  { id: 'tuna',     name: 'Tuna',        shape: 'slab',    color: 0xE4626F, accent: 0xF4A0A6, deco: 'stripes',  emoji: '🐟' },
  { id: 'unagi',    name: 'Unagi',       shape: 'slab',    color: 0x8A5A3B, accent: 0x5C3620, deco: 'glaze',    emoji: '🍱' },
  { id: 'squid',    name: 'Squid',       shape: 'slab',    color: 0xFDF3EE, accent: 0xE7D6CE, deco: 'score',    emoji: '🦑' },
  { id: 'octopus',  name: 'Octopus',     shape: 'slab',    color: 0xE9A8C0, accent: 0xB56A8A, deco: 'rim',      emoji: '🐙' },
  { id: 'yellowtl', name: 'Yellowtail',  shape: 'slab',    color: 0xFBE3C4, accent: 0xF3C79A, deco: 'stripes',  emoji: '🐠' },
  { id: 'seabream', name: 'Sea Bream',   shape: 'slab',    color: 0xFFF0F0, accent: 0xFFC9CE, deco: 'rim',      emoji: '🎣' },

  { id: 'prawn',    name: 'Prawn',       shape: 'curl',    color: 0xFFB0A0, accent: 0xFF7E6B, deco: 'bands',    emoji: '🦐' },
  { id: 'crab',     name: 'Crab Stick',  shape: 'roll',    color: 0xFFF6EE, accent: 0xFF7E7E, deco: 'spiral',   emoji: '🦀' },
  { id: 'scallop',  name: 'Scallop',     shape: 'dome',    color: 0xFFF1DC, accent: 0xEBD3B4, deco: 'none',     emoji: '🐚' },
  { id: 'shiitake', name: 'Shiitake',    shape: 'dome',    color: 0x9A6E55, accent: 0xC49A7E, deco: 'score',    emoji: '🍄' },
  { id: 'kamaboko', name: 'Fish Cake',   shape: 'dome',    color: 0xFFFBF5, accent: 0xFF9AA2, deco: 'rim',      emoji: '🍥' },

  { id: 'avocado',  name: 'Avocado',     shape: 'leaf',    color: 0xA8D46B, accent: 0x7FB349, deco: 'none',     emoji: '🥑' },
  { id: 'shiso',    name: 'Shiso Leaf',  shape: 'leaf',    color: 0x7DBE72, accent: 0x4F8A56, deco: 'vein',     emoji: '🌿' },
  { id: 'gari',     name: 'Ginger',      shape: 'leaf',    color: 0xFFD3DC, accent: 0xFFAABB, deco: 'none',     emoji: '🌸' },

  { id: 'cucumber', name: 'Cucumber',    shape: 'disc',    color: 0xBFE39A, accent: 0xE8F5D8, deco: 'ring',     emoji: '🥒' },
  { id: 'takuan',   name: 'Pickle',      shape: 'disc',    color: 0xFFDE72, accent: 0xFFF0B8, deco: 'ring',     emoji: '🟡' },
  { id: 'lotus',    name: 'Lotus Root',  shape: 'disc',    color: 0xFFF7E8, accent: 0xE9DAC2, deco: 'holes',    emoji: '⚪' },
  { id: 'cheese',   name: 'Cheese',      shape: 'wedge',   color: 0xFFD97A, accent: 0xFFC24D, deco: 'holes',    emoji: '🧀' },

  { id: 'ikura',    name: 'Salmon Roe',  shape: 'cluster', color: 0xFF8B4A, accent: 0xFFC49A, deco: 'none',     emoji: '🟠' },
  { id: 'tobiko',   name: 'Tobiko',      shape: 'cluster', color: 0xFFB347, accent: 0xFFD9A0, deco: 'none',     emoji: '🟧' },
  { id: 'corn',     name: 'Sweetcorn',   shape: 'cluster', color: 0xFFE066, accent: 0xFFF0A8, deco: 'none',     emoji: '🌽' },
  { id: 'edamame',  name: 'Edamame',     shape: 'cluster', color: 0x9BD46B, accent: 0xC3E8A0, deco: 'none',     emoji: '🫛' },
  { id: 'natto',    name: 'Natto',       shape: 'cluster', color: 0xC49A5E, accent: 0xE0C193, deco: 'none',     emoji: '🫘' },

  { id: 'ume',      name: 'Plum',        shape: 'ball',    color: 0xE0566E, accent: 0xF08FA0, deco: 'none',     emoji: '🍒' },
  { id: 'sesame',   name: 'Sesame',      shape: 'sprinkle',color: 0xF3E6CE, accent: 0x8C6A5D, deco: 'none',     emoji: '⚫' },
  { id: 'nori',     name: 'Nori',        shape: 'band',    color: 0x3B4A45, accent: 0x2A3630, deco: 'none',     emoji: '🟩' }
];

/** Specials sit in a tray slot but never land on the plate. */
export const SPECIALS = [
  { id: 'tea',    name: 'Green Tea',     shape: 'cup',   color: 0xBFE3C0, accent: 0x6FAF88, special: 'tea',    emoji: '🍵',
    blurb: 'Everyone waits longer!' },
  { id: 'wasabi', name: 'Wasabi',        shape: 'blob',  color: 0x9BD46B, accent: 0x6FAF4B, special: 'wasabi', emoji: '🌶️',
    blurb: 'Next order scores double!' },
  { id: 'golden', name: 'Golden Tamago', shape: 'slab',  color: 0xFFC93C, accent: 0xFFF0B0, special: 'wild',   emoji: '⭐',
    blurb: 'Becomes any number you need!' }
];

export const INGREDIENT_BY_ID = new Map(
  INGREDIENTS.concat(SPECIALS).map(s => [s.id, s])
);

// ── Ingredient builder ─────────────────────────────────────────────────────

function addDeco(group, spec, w, d, topY) {
  const a = clay(spec.accent, { rough: 0.7 });
  switch (spec.deco) {
    case 'stripes':
      for (let i = -1; i <= 1; i++) {
        const m = new THREE.Mesh(roundedSlab(w * 0.82, d * 0.09, 0.03, 0.03, 0.012), a);
        m.position.set(0, topY, i * d * 0.22);
        m.rotation.y = 0.09;
        group.add(m);
      }
      break;
    case 'noriband': {
      const m = new THREE.Mesh(roundedSlab(w * 0.2, d * 1.02, 0.035, 0.02, 0.014), a);
      m.position.set(0, topY - 0.005, 0);
      group.add(m);
      break;
    }
    case 'glaze': {
      const m = new THREE.Mesh(roundedSlab(w * 0.78, d * 0.66, 0.03, 0.1, 0.012),
        clay(spec.accent, { rough: 0.25, clearcoat: 0.9 }));
      m.position.set(0, topY, 0);
      group.add(m);
      break;
    }
    case 'score':
      for (let i = -1; i <= 1; i++) {
        const m = new THREE.Mesh(roundedSlab(w * 0.06, d * 0.7, 0.02, 0.02, 0.008), a);
        m.position.set(i * w * 0.2, topY, 0);
        m.rotation.y = 0.5;
        group.add(m);
      }
      break;
    case 'rim': {
      const m = new THREE.Mesh(new THREE.TorusGeometry(w * 0.42, 0.035, 8, 26), a);
      m.rotation.x = Math.PI / 2;
      m.scale.z = d / w;
      m.position.y = topY - 0.02;
      group.add(m);
      break;
    }
    case 'ring': {
      const m = new THREE.Mesh(cylGeo(20), a);
      m.scale.set(w * 0.52, 0.04, w * 0.52);
      m.position.y = topY;
      group.add(m);
      break;
    }
    case 'holes':
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(sphereGeo(10), clay(0xF6E2C2, { rough: 0.95 }));
        const r = w * 0.24 * Math.sqrt(Math.random());
        const t = Math.random() * Math.PI * 2;
        const s = 0.09 + Math.random() * 0.07;
        m.scale.setScalar(s);
        m.position.set(Math.cos(t) * r, topY - 0.01, Math.sin(t) * r);
        group.add(m);
      }
      break;
    case 'spiral': {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 20), a);
      m.rotation.x = Math.PI / 2;
      m.position.y = topY - 0.04;
      group.add(m);
      break;
    }
    case 'bands':
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 6, 16, Math.PI), a);
        m.position.set(0, 0, -0.14 + i * 0.14);
        m.rotation.set(0, Math.PI / 2, 0);
        group.add(m);
      }
      break;
    case 'vein': {
      const m = new THREE.Mesh(roundedSlab(0.62, 0.035, 0.02, 0.015, 0.008), a);
      m.position.y = topY;
      group.add(m);
      break;
    }
  }
}

/** Build just the edible part of an ingredient (no chip, no face). */
export function buildIngredientBody(spec) {
  const g = new THREE.Group();
  const body = clay(spec.color);
  const W = 0.92, D = 0.6;

  switch (spec.shape) {
    case 'slab': {
      const m = new THREE.Mesh(roundedSlab(W, D, 0.24, 0.13), body);
      g.add(m);
      addDeco(g, spec, W, D, 0.125);
      break;
    }
    case 'dome': {
      const m = new THREE.Mesh(sphereGeo(20), body);
      m.scale.set(0.78, 0.46, 0.62);
      m.position.y = 0.02;
      g.add(m);
      addDeco(g, spec, 0.78, 0.62, 0.2);
      break;
    }
    case 'disc': {
      const m = new THREE.Mesh(cylGeo(24), body);
      m.scale.set(0.74, 0.2, 0.74);
      g.add(m);
      addDeco(g, spec, 0.74, 0.74, 0.11);
      break;
    }
    case 'leaf': {
      const m = new THREE.Mesh(leafGeo(1.0, 0.56, 0.14), body);
      m.rotation.z = 0.06;
      g.add(m);
      addDeco(g, spec, 1.0, 0.56, 0.07);
      break;
    }
    case 'curl': {
      const m = new THREE.Mesh(torusGeo(), body);
      m.rotation.set(Math.PI / 2, 0, 0.3);
      m.scale.set(1.05, 1.05, 0.8);
      g.add(m);
      const tail = new THREE.Mesh(coneGeo(), clay(spec.accent));
      tail.scale.set(0.2, 0.28, 0.2);
      tail.position.set(0.34, 0, 0.3);
      tail.rotation.z = -0.9;
      g.add(tail);
      addDeco(g, spec, W, D, 0.1);
      break;
    }
    case 'roll': {
      const m = new THREE.Mesh(cylGeo(22), body);
      m.scale.set(0.5, 0.66, 0.5);
      m.rotation.z = Math.PI / 2;
      g.add(m);
      addDeco(g, spec, W, D, 0.18);
      break;
    }
    case 'wedge': {
      const s = new THREE.Shape();
      s.moveTo(-0.42, -0.26); s.lineTo(0.42, -0.26); s.lineTo(0.42, 0.3); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3
      });
      geo.center();
      const m = new THREE.Mesh(geo, body);
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      addDeco(g, spec, 0.7, 0.5, 0.16);
      break;
    }
    case 'cluster': {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(sphereGeo(12), i % 3 === 0 ? clay(spec.accent) : body);
        const ring = i === 0 ? 0 : 0.15 + (i > 5 ? 0.12 : 0);
        const a = (i / n) * Math.PI * 2 * 1.6;
        m.scale.setScalar(0.26 + (i % 3) * 0.03);
        m.position.set(Math.cos(a) * ring, 0.05 + (i % 2) * 0.09, Math.sin(a) * ring * 0.8);
        g.add(m);
      }
      break;
    }
    case 'ball': {
      const m = new THREE.Mesh(sphereGeo(18), body);
      m.scale.setScalar(0.52);
      m.position.y = 0.08;
      g.add(m);
      const stalk = new THREE.Mesh(cylGeo(8), clay(0x7FB349));
      stalk.scale.set(0.045, 0.22, 0.045);
      stalk.position.set(0.05, 0.34, 0);
      stalk.rotation.z = -0.3;
      g.add(stalk);
      break;
    }
    case 'sprinkle': {
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(sphereGeo(8), i % 2 ? clay(spec.accent) : body);
        m.scale.set(0.12, 0.07, 0.09);
        m.position.set((Math.random() - 0.5) * 0.8, 0.03 + Math.random() * 0.05, (Math.random() - 0.5) * 0.5);
        m.rotation.y = Math.random() * Math.PI;
        g.add(m);
      }
      break;
    }
    case 'band': {
      const m = new THREE.Mesh(roundedSlab(W, D * 0.55, 0.08, 0.05, 0.03), body);
      g.add(m);
      break;
    }
    case 'cup': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.44, 20), clay(0xFFF6E8));
      g.add(m);
      const tea = new THREE.Mesh(cylGeo(18), clay(spec.color, { rough: 0.3, clearcoat: 0.8 }));
      tea.scale.set(0.6, 0.04, 0.6);
      tea.position.y = 0.19;
      g.add(tea);
      break;
    }
    case 'blob': {
      const m = new THREE.Mesh(sphereGeo(18), body);
      m.scale.set(0.6, 0.5, 0.55);
      m.position.y = 0.1;
      g.add(m);
      const tip = new THREE.Mesh(coneGeo(), clay(spec.accent));
      tip.scale.set(0.28, 0.34, 0.28);
      tip.position.y = 0.34;
      g.add(tip);
      break;
    }
  }
  return g;
}

/**
 * A tray-ready ingredient: clay body, a face, and a big readable number chip.
 * `value` may be null for specials that carry a symbol instead of a number.
 */
export function makeIngredient(spec, value, camera) {
  const root = new THREE.Group();
  root.name = 'ingredient:' + spec.id;

  const body = buildIngredientBody(spec);
  body.name = 'body';
  root.add(body);

  const face = makeFace(0.46, 'neutral');
  face.position.set(0, 0.16, spec.shape === 'slab' ? 0.31 : 0.3);
  face.userData.expression = 'neutral';
  body.add(face);

  const chip = makeNumberChip(
    value === null ? spec.emoji : value,
    0.56,
    spec.special ? '#fff3c9' : '#fffaf2',
    spec.special ? '#a06a12' : '#5b4038'
  );
  chip.position.set(0, 0.06, 0.62);
  root.add(chip);

  // generous invisible tap target — small fingers, small ingredients
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 8, 6),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 0.12;
  root.add(hit);

  root.userData = {
    spec, value, face, chip, body, hit,
    baseScale: new THREE.Vector3(1, 1, 1),
    bobPhase: Math.random() * Math.PI * 2
  };
  return root;
}

// ── Rice base ──────────────────────────────────────────────────────────────

/** The shari the player builds on. Grains are a light dusting of tiny blobs. */
export function makeRice() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(roundedSlab(1.6, 1.05, 0.44, 0.32), clay(PAL.rice, { rough: 0.95 }));
  base.position.y = 0.21;
  base.castShadow = true;
  g.add(base);

  for (let i = 0; i < 26; i++) {
    const grain = new THREE.Mesh(sphereGeo(8), clay(0xFFFFFF, { rough: 1 }));
    grain.scale.set(0.09, 0.06, 0.07);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
    grain.position.set(Math.cos(a) * r * 0.66, 0.4 + Math.random() * 0.02, Math.sin(a) * r * 0.42);
    grain.rotation.y = Math.random() * Math.PI;
    g.add(grain);
  }

  const face = makeFace(0.52, 'happy');
  face.position.set(0, 0.36, 0.44);
  face.rotation.x = -0.55;
  face.userData.expression = 'happy';
  g.add(face);

  g.userData = { face, baseScale: new THREE.Vector3(1, 1, 1) };
  return g;
}

// ── Characters ─────────────────────────────────────────────────────────────

/*  Each customer is a rounded blob with one silhouette-defining feature —
    ears, a beak, a shell — so they read instantly at iPad distance.  */
export const CUSTOMER_KINDS = [
  { id: 'cat',    color: 0xFFD9B0, accent: 0xFFB6C1, ears: 'point'  },
  { id: 'bear',   color: 0xC79A72, accent: 0xEFD4B8, ears: 'round'  },
  { id: 'bunny',  color: 0xFFF1F3, accent: 0xFFC2CE, ears: 'long'   },
  { id: 'panda',  color: 0xFBF6EF, accent: 0x4A4A4A, ears: 'round'  },
  { id: 'frog',   color: 0xA8DC94, accent: 0x7FBF6B, ears: 'eyes'   },
  { id: 'penguin',color: 0x5C6B8A, accent: 0xFFC24D, ears: 'beak'   },
  { id: 'fox',    color: 0xFFA867, accent: 0xFFF0E0, ears: 'point'  },
  { id: 'tanuki', color: 0xB09A86, accent: 0x6B5B4E, ears: 'round'  },
  { id: 'sheep',  color: 0xFFFBF5, accent: 0xE6D8CC, ears: 'fluff'  },
  { id: 'octo',   color: 0xE9A8C0, accent: 0xC77FA0, ears: 'tent'   }
];

export function makeCustomer(kind, orderLabel, camera) {
  const root = new THREE.Group();
  root.name = 'customer:' + kind.id;

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const head = new THREE.Mesh(sphereGeo(24), clay(kind.color));
  head.scale.set(0.95, 0.86, 0.85);
  head.position.y = 0.55;
  head.castShadow = true;
  bodyGroup.add(head);

  const belly = new THREE.Mesh(sphereGeo(20), clay(kind.color));
  belly.scale.set(0.78, 0.6, 0.7);
  belly.position.y = 0.0;
  belly.castShadow = true;
  bodyGroup.add(belly);

  const bib = new THREE.Mesh(roundedSlab(0.62, 0.12, 0.16, 0.07, 0.05), clay(kind.accent));
  bib.position.set(0, 0.16, 0.3);
  bib.rotation.x = 0.3;
  bodyGroup.add(bib);

  // ears / heads-up feature
  const acc = clay(kind.accent);
  const put = (m, x, y, z) => { m.position.set(x, y, z); bodyGroup.add(m); return m; };
  switch (kind.ears) {
    case 'point':
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(coneGeo(), clay(kind.color));
        e.scale.set(0.24, 0.3, 0.18);
        put(e, s * 0.3, 0.96, -0.02).rotation.z = s * 0.25;
      }
      break;
    case 'round':
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(sphereGeo(14), clay(kind.ears === 'round' && kind.id === 'panda' ? kind.accent : kind.color));
        e.scale.setScalar(0.3);
        put(e, s * 0.36, 0.94, -0.05);
      }
      break;
    case 'long':
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(capsuleGeo(), clay(kind.color));
        e.scale.set(0.34, 0.46, 0.3);
        put(e, s * 0.22, 1.12, -0.05).rotation.z = s * 0.16;
      }
      break;
    case 'fluff':
      for (let i = 0; i < 7; i++) {
        const e = new THREE.Mesh(sphereGeo(12), clay(kind.color));
        e.scale.setScalar(0.3);
        const a = (i / 7) * Math.PI * 2;
        put(e, Math.cos(a) * 0.42, 0.86 + Math.sin(a) * 0.2, -0.16);
      }
      break;
    case 'beak': {
      const b = new THREE.Mesh(coneGeo(), acc);
      b.scale.set(0.17, 0.22, 0.17);
      put(b, 0, 0.46, 0.44).rotation.x = Math.PI / 2;
      break;
    }
    case 'eyes':
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(sphereGeo(14), clay(kind.color));
        e.scale.setScalar(0.34);
        put(e, s * 0.3, 1.0, 0.02);
      }
      break;
    case 'tent':
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(capsuleGeo(), acc);
        t.scale.set(0.24, 0.3, 0.24);
        put(t, -0.5 + i * 0.25, -0.34, 0.18).rotation.x = 0.4;
      }
      break;
  }

  const face = makeFace(0.72, 'neutral');
  face.position.set(0, 0.56, 0.66);
  face.userData.expression = 'neutral';
  bodyGroup.add(face);

  // the order card + patience ring float beside the head, angled at the player
  const cardGroup = new THREE.Group();
  cardGroup.position.set(0.0, 1.90, 0.25);
  root.add(cardGroup);

  const card = makeOrderCard(orderLabel, 1.62);
  cardGroup.add(card);

  const ring = makePatienceRing(0.52);
  ring.position.set(0.95, 0.5, 0.02);
  cardGroup.add(ring);

  root.add(makeStool());

  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 10, 8),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hit.position.y = 0.5;
  root.add(hit);

  // soft glow disc that lights up when the plate matches this order
  const glow = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.3, 32),
    new THREE.MeshBasicMaterial({ color: 0xFFE08A, transparent: true, opacity: 0, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.30;
  root.add(glow);

  // customers read small at iPad distance, so they are built oversized
  root.scale.setScalar(1.3);
  root.userData = {
    kind, face, card, ring, cardGroup, hit, glow, bodyGroup,
    baseScale: new THREE.Vector3(1.3, 1.3, 1.3),
    bobPhase: Math.random() * Math.PI * 2
  };
  return root;
}

/** Chef Tamago himself: an egg in a very tall hat. */
export function makeChef() {
  const root = new THREE.Group();
  root.name = 'chef';

  const body = new THREE.Mesh(sphereGeo(26), clay(0xFFE9A8));
  body.scale.set(0.92, 1.15, 0.9);
  body.position.y = 1.0;
  body.castShadow = true;
  root.add(body);

  const coat = new THREE.Mesh(sphereGeo(22), clay(0xFFFDF7));
  coat.scale.set(0.95, 0.62, 0.92);
  coat.position.y = 0.42;
  root.add(coat);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.09, 8, 24), clay(PAL.salmon));
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.86;
  root.add(collar);

  // hat: a band with a cloud of puffs on top
  const band = new THREE.Mesh(cylGeo(24), clay(0xFFFFFF));
  band.scale.set(0.78, 0.22, 0.74);
  band.position.y = 1.62;
  root.add(band);
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(sphereGeo(16), clay(0xFFFFFF));
    const a = (i / 6) * Math.PI * 2;
    puff.scale.setScalar(0.46 + (i % 2) * 0.08);
    puff.position.set(Math.cos(a) * 0.26, 1.86 + (i % 2) * 0.08, Math.sin(a) * 0.24);
    root.add(puff);
  }
  const topPuff = new THREE.Mesh(sphereGeo(18), clay(0xFFFFFF));
  topPuff.scale.setScalar(0.52);
  topPuff.position.y = 2.02;
  root.add(topPuff);

  // hachimaki headband, because every sushi chef needs one
  const bandana = new THREE.Mesh(cylGeo(24), clay(PAL.tuna));
  bandana.scale.set(0.86, 0.12, 0.83);
  bandana.position.y = 1.42;
  root.add(bandana);

  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(capsuleGeo(), clay(0xFFFDF7));
    arm.scale.set(0.42, 0.5, 0.42);
    arm.position.set(s * 0.78, 0.62, 0.18);
    arm.rotation.z = s * 0.5;
    root.add(arm);
    arms.push(arm);
  }

  const face = makeFace(0.8, 'happy');
  face.position.set(0, 1.04, 0.48);
  face.userData.expression = 'happy';
  root.add(face);

  root.scale.setScalar(1.15);
  root.userData = { face, arms, baseScale: new THREE.Vector3(1.15, 1.15, 1.15), bobPhase: 0 };
  return root;
}

// ── Set dressing ───────────────────────────────────────────────────────────

export function makeCounter() {
  const g = new THREE.Group();

  const top = new THREE.Mesh(roundedSlab(17, 3.4, 0.5, 0.24), clay(PAL.wood, { rough: 0.75, clearcoat: 0.3 }));
  top.position.set(0, -0.25, 0.4);
  top.receiveShadow = true;
  g.add(top);

  const front = new THREE.Mesh(roundedSlab(17, 0.5, 2.6, 0.2), clay(PAL.woodDark, { rough: 0.9 }));
  front.position.set(0, -1.55, 2.0);
  g.add(front);

  // the raised neta shelf the tray sits on
  const shelf = new THREE.Mesh(roundedSlab(11.6, 1.9, 0.36, 0.2), clay(0xF7E0C4, { rough: 0.9 }));
  shelf.position.set(0, -0.02, 2.75);
  shelf.receiveShadow = true;
  g.add(shelf);

  // back wall — kept low and close so the customers, not the room, fill the
  // frame. Everything hung on it lives between y 2.6 and y 4.2.
  const wall = new THREE.Mesh(roundedSlab(24, 0.6, 6.2, 0.4), clay(0xFFE3C8, { rough: 1 }));
  wall.position.set(0, 1.0, -5.0);
  g.add(wall);

  const skirt = new THREE.Mesh(roundedSlab(24, 0.5, 1.4, 0.2), clay(0xF3CDAC, { rough: 1 }));
  skirt.position.set(0, -1.5, -4.9);
  g.add(skirt);

  // noren curtain
  for (let i = 0; i < 7; i++) {
    const panel = new THREE.Mesh(roundedSlab(2.2, 0.16, 1.6, 0.12), clay(i % 2 ? PAL.tuna : 0xFF8FA3, { rough: 0.95 }));
    panel.position.set(-7.2 + i * 2.4, 3.5, -4.6);
    g.add(panel);
  }
  const rail = new THREE.Mesh(cylGeo(14), clay(PAL.cocoa));
  rail.scale.set(0.11, 18, 0.11);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 4.35, -4.6);
  g.add(rail);

  // paper lanterns at either end
  for (const x of [-6.9, 6.9]) {
    const lantern = new THREE.Mesh(sphereGeo(20), clay(0xFFD9A0, { rough: 0.6, emissive: 0x3a2408 }));
    lantern.scale.set(0.85, 1.05, 0.85);
    lantern.position.set(x, 2.9, -4.2);
    g.add(lantern);
    const cap = new THREE.Mesh(cylGeo(14), clay(PAL.cocoa));
    cap.scale.set(0.36, 0.17, 0.36);
    cap.position.set(x, 3.5, -4.2);
    g.add(cap);
    const cord = new THREE.Mesh(cylGeo(8), clay(PAL.cocoa));
    cord.scale.set(0.05, 1.2, 0.05);
    cord.position.set(x, 4.1, -4.2);
    g.add(cord);
  }

  // a rising-sun plaque so the wall has something to look at
  const plaque = new THREE.Mesh(cylGeo(28), clay(0xFFF6E8, { rough: 0.9 }));
  plaque.scale.set(1.5, 0.16, 1.5);
  plaque.rotation.x = Math.PI / 2;
  plaque.position.set(0, 2.5, -4.55);
  g.add(plaque);
  const sun = new THREE.Mesh(cylGeo(28), clay(PAL.tuna, { rough: 0.85 }));
  sun.scale.set(0.95, 0.16, 0.95);
  sun.rotation.x = Math.PI / 2;
  sun.position.set(0, 2.5, -4.44);
  g.add(sun);

  // counter props — small, but they stop the worktop reading as empty
  const soyDish = new THREE.Mesh(roundedSlab(0.9, 0.9, 0.16, 0.4), clay(0xFFFDF8, { rough: 0.5, clearcoat: 0.5 }));
  soyDish.position.set(-2.6, 0.08, 1.3);
  g.add(soyDish);
  const soy = new THREE.Mesh(cylGeo(20), clay(0x5C3620, { rough: 0.2, clearcoat: 0.9 }));
  soy.scale.set(0.62, 0.05, 0.62);
  soy.position.set(-2.6, 0.15, 1.3);
  g.add(soy);

  const wasabiDish = new THREE.Mesh(roundedSlab(0.8, 0.8, 0.14, 0.35), clay(0xFFFDF8, { rough: 0.5, clearcoat: 0.5 }));
  wasabiDish.position.set(3.6, 0.07, 1.35);
  g.add(wasabiDish);
  const wasabiBlob = new THREE.Mesh(sphereGeo(16), clay(0x9BD46B, { rough: 0.8 }));
  wasabiBlob.scale.set(0.4, 0.3, 0.4);
  wasabiBlob.position.set(3.6, 0.16, 1.35);
  g.add(wasabiBlob);
  const gariPile = new THREE.Mesh(sphereGeo(16), clay(0xFFD3DC, { rough: 0.9 }));
  gariPile.scale.set(0.42, 0.22, 0.36);
  gariPile.position.set(4.2, 0.12, 1.2);
  g.add(gariPile);

  // chopsticks on a rest
  for (const dx of [-0.09, 0.09]) {
    const stick = new THREE.Mesh(cylGeo(8), clay(PAL.cocoa, { rough: 0.7 }));
    stick.scale.set(0.05, 1.6, 0.05);
    stick.rotation.set(0, 0, Math.PI / 2);
    stick.position.set(-4.4, 0.16, 1.5 + dx);
    g.add(stick);
  }
  const rest = new THREE.Mesh(roundedSlab(0.34, 0.42, 0.14, 0.06), clay(PAL.seafoam, { rough: 0.8 }));
  rest.position.set(-4.4, 0.1, 1.5);
  g.add(rest);

  // the floor the customers' stools stand on
  const floor = new THREE.Mesh(roundedSlab(24, 4.6, 0.4, 0.2), clay(0xD9A87E, { rough: 1 }));
  floor.position.set(0, -1.85, -3.0);
  floor.receiveShadow = true;
  g.add(floor);

  // potted greenery bookending the counter
  for (const x of [-7.3, 7.3]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.6, 16), clay(0xE6A98A, { rough: 0.95 }));
    pot.position.set(x, 0.05, -1.2);
    g.add(pot);
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(leafGeo(1.1, 0.5, 0.14), clay(i % 2 ? 0x8FC97A : 0x6FAF62, { rough: 0.9 }));
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 0.22, 0.75 + (i % 2) * 0.22, -1.2 + Math.sin(a) * 0.16);
      leaf.rotation.set(-0.9 + (i % 2) * 0.2, a, 0.3);
      g.add(leaf);
    }
  }

  return g;
}

/** A little stool so each customer has somewhere to actually sit. */
export function makeStool() {
  const g = new THREE.Group();
  g.name = 'stool';
  const cushion = new THREE.Mesh(roundedSlab(1.05, 1.05, 0.3, 0.4), clay(PAL.salmon, { rough: 0.9 }));
  cushion.position.y = -0.35;
  cushion.castShadow = true;
  g.add(cushion);
  const post = new THREE.Mesh(cylGeo(14), clay(PAL.cocoa, { rough: 0.85 }));
  post.scale.set(0.26, 1.1, 0.26);
  post.position.y = -1.05;
  g.add(post);
  const foot = new THREE.Mesh(cylGeo(16), clay(PAL.cocoa, { rough: 0.85 }));
  foot.scale.set(0.8, 0.16, 0.8);
  foot.position.y = -1.58;
  g.add(foot);
  return g;
}

export function makePlate() {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(roundedSlab(2.9, 2.2, 0.24, 0.55), clay(0xFFFDF8, { rough: 0.5, clearcoat: 0.5 }));
  dish.position.y = 0.02;
  dish.receiveShadow = true;
  g.add(dish);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 10, 40), clay(PAL.seafoam, { rough: 0.6 }));
  rim.rotation.x = Math.PI / 2;
  rim.scale.z = 0.78;
  rim.position.y = 0.06;
  g.add(rim);
  return g;
}

/** A cheap baked contact shadow — reads better than a real shadow for clay. */
export function makeContactShadow(radius = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(120,80,70,0.42)');
  grd.addColorStop(0.55, 'rgba(120,80,70,0.16)');
  grd.addColorStop(1, 'rgba(120,80,70,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}
