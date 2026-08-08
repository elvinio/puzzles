# Bugs

Back to [README.md](README.md).

---

## SS-B1 — "Squeezed / Real gaps" toggle is permanently disabled after one mission

**Size:** S · **Batchable:** yes

### What happens

Tap 🚀 Fly, then leave the mission (✕ Leave / ✓ Done). The `↔ Squeezed` chip stays
greyed out for the rest of the page's life. Only a reload brings it back.

### Why

`solar-system.js:933` — `beginMission()` sets `btnScale.disabled = true`.

`endMission()` (`solar-system.js:948-956`) restores `btnTrueSize.disabled = false`
explicitly but never touches `btnScale.disabled`. It relies on
`setTrueSizes(trueSizeBeforeMission)` to do it as a side effect, because
`setTrueSizes` contains `btnScale.disabled = on`.

But `setTrueSizes` opens with an early return (`solar-system.js:827`):

```js
if (trueSizes === on) return;
```

On the default path True size is **off** before the mission, and `beginMission()`
calls `setTrueSizes(false)` while it is already false — so both calls early-return
and the side effect never fires.

### Fix

Set `btnScale.disabled = false` explicitly in `endMission()`, next to the existing
`btnTrueSize.disabled = false`. Do not rely on `setTrueSizes` for it. Consider
making the disabled state derived from `trueSizes || missionActive` in one place
so the two owners cannot disagree.

### Verify

1. Load the page, confirm `↔ Squeezed` toggles between Squeezed and Real gaps.
2. Tap 🚀 Fly, then ✕ Leave without launching anything.
3. `↔ Squeezed` must still toggle.
4. Repeat with True size **on** before entering the mission — on exit, True size
   should be restored to on and the scale toggle should be disabled (which is the
   correct state, since True size implies Real gaps).

### Done

_(record the fix here)_

---

## SS-B2 — Venus and Uranus visually spin the wrong way

**Size:** S · **Batchable:** yes

### What happens

Venus and Uranus render as spinning prograde, despite both being retrograde and
despite the fact text saying so ("Venus spins so slowly, and the wrong way round").

### Why

Retrograde rotation is encoded **twice**, and the two negations cancel.

1. Obliquity past 90° flips the spin axis:
   - `solar-system-data.js:73` — Venus `tilt: 177.4`
   - `solar-system-data.js:350` — Uranus `tilt: 97.77`
   - applied at `solar-system.js:292` — `axis.rotation.z = planet.tilt * DEG`

2. A negative rotation period reverses the spin again:
   - `solar-system-data.js:72` — Venus `rotationHours: -5832.5`
   - `solar-system-data.js:349` — Uranus `rotationHours: -17.24`
   - applied at `solar-system.js:711-713` — `turns = (dtDays * damp) / (rotationHours / 24)`

With `tilt: 177.4` the group's local +Y points nearly at world −Y, so a positive
spin about local +Y already reads as retrograde in world space. The minus sign
then flips it back to prograde.

### Fix

Pick one convention and use it consistently. The tilt values already follow the
IAU convention (obliquity measured from the orbital normal, so retrograde bodies
exceed 90°), so the clean fix is:

- Make `rotationHours` positive for Venus (`5832.5`) and Uranus (`17.24`).
- Keep the tilts as they are.
- Update the header comment in `solar-system-data.js:1-9`, which currently states
  "Rotation periods are signed: a negative number means the body spins backwards" —
  that convention no longer applies once the tilts carry the information.

Check no other body relies on the sign. Currently only Venus and Uranus are
negative; every other `rotationHours` is positive with a tilt below 90°, so
nothing else changes.

### Verify

1. Select Venus, zoom in until surface features are visible, and set speed to
   `1 month/s` (its spin is 243 days, so anything slower is imperceptible).
2. Watch the direction of surface motion relative to the terminator. Venus must
   rotate **east to west** — opposite to Earth.
3. Compare directly against Earth at the same speed; they must turn opposite ways.
4. Repeat for Uranus at `10 days/s`.
5. Confirm Mercury, Earth, Mars, Jupiter, Saturn and Neptune are unchanged
   (all prograde).

### Done

_(record the fix here)_

---

## SS-B3 — Moon orbital phases are random

**Size:** M

### What happens

Planets are ephemeris-exact, but every moon is placed at a random angle. Two page
loads put the Moon in different places on the same date. The Moon fact about
eclipses ("A solar eclipse only happens on the rare occasions it lines up exactly")
can never actually be seen.

This quietly contradicts the promise in the module header (`solar-system.js:5-7`):
"on any given date every planet is where it really is".

### Why

`solar-system.js:271`:

```js
phase: Math.random() * Math.PI * 2,
```

consumed at `solar-system.js:727`:

```js
const ang = m.phase + m.dir * (days / m.data.periodDays) * Math.PI * 2;
```

The angular *rate* is correct (real period), only the epoch offset is fake.

### Fix — two tiers, pick by appetite

**Tier 1 (small, do this at minimum):** replace `Math.random()` with a deterministic
per-moon constant — either a hardcoded `phase0` in `solar-system-data.js`, or a hash
of the moon's id. This costs nothing and makes the page reproducible. Add a comment
saying the phases are arbitrary but stable.

**Tier 2 (the real fix, and what SS-F2 needs):** give each moon a real epoch. For the
major moons the mean longitude at J2000 plus the mean motion is enough to be visually
correct. Earth's Moon deserves better than the others — see SS-F2, which needs a
proper lunar ephemeris (ELP2000 truncated, or the standard Meeus low-precision series,
~20 terms) to place eclipses correctly.

Note the display distances are compressed (`solar-system.js:249-251`), so even with
a correct phase the Moon is drawn further out than reality. That is fine for phase
and eclipse *timing*, which depend on angle, not distance.

### Verify

- Tier 1: reload twice on the same date and confirm every moon is in the same place.
- Tier 2: set the date to a known event and check by eye. Good test cases:
  - Total solar eclipse 12 August 2026 — the Moon should sit between Earth and Sun.
  - Total lunar eclipse 3 March 2026 — Earth between Sun and Moon.
  - Io/Europa/Ganymede sit in a 1:2:4 Laplace resonance; over 8 Io orbits the
    pattern should repeat exactly.

### Depends on

Nothing. **SS-F2 depends on this** (tier 2).

### Done

_(record the fix here)_

---

## SS-B4 — Sunlight has no distance falloff

**Size:** M

### What happens

Neptune is lit exactly as brightly as Mercury. Real sunlight at Neptune is about
1/900 of Earth's.

### Why

`solar-system.js:96`:

```js
const sunLight = new THREE.PointLight(0xfff4e0, 3.1, 0, 0);   // decay 0: lights Neptune too
```

Decay 0 disables the inverse-square falloff. This is a deliberate visibility
choice and the comment says so.

### Fix

Do **not** simply switch decay to 2 — that makes the outer planets black and the
page unusable. Two viable approaches:

1. **Compressed falloff (recommended default).** Scale each planet's material
   brightness by `pow(1/r², k)` with `k` around 0.25–0.35, so Neptune is visibly
   dimmer than Mercury without vanishing. Applies per-material, so it works with
   the existing decay-0 light rather than replacing it.
2. **Honest falloff behind a toggle.** Keep the current flat lighting as the
   default and let the user switch to true 1/r². This is more interesting than
   fixing it silently — see **SS-F3**, which turns this into a teaching feature
   with a "sunlight here: 1/900 of Earth's" readout.

Earth uses its own self-lit shader (`solar-system-earth.js`) that ignores the
scene light entirely, so whatever you do must be applied there too or Earth will
be inconsistent with its neighbours.

### Verify

Compare Mercury and Neptune side by side at the same zoom. Neptune should read as
noticeably dimmer while still being clearly visible and identifiable.

### Related

**SS-F3** is the feature version of this item. If you build SS-F3, this becomes
part of it.

### Done

_(record the fix here)_

---

## SS-B5 — Clock runs past the ephemeris' valid range with no guardrail

**Size:** S · **Batchable:** yes

### What happens

The Standish elements are documented valid **1800–2050 AD**
(`solar-system-ephem.js:5-8`). The top clock speed is `5 years/s`
(`solar-system.js:67`), so holding ⏩ puts you in the year 3000 in under three
minutes, with planet positions silently degrading — no warning, no visual cue.

### Why

Nothing clamps `jd`. It is advanced freely at `solar-system.js:862`.

### Fix

Any of these, in increasing order of politeness:

1. Clamp `jd` to the range `[jdFromDate(1800-01-01), jdFromDate(2050-12-31)]` and
   stop the clock at the boundary with a brief message.
2. Let it run but show a persistent note past 2050: "beyond 2050 these positions
   are extrapolated — treat them as a sketch."
3. Both: clamp hard at a wider outer bound (say 1600–2200) and warn from 2050.

Option 3 is the most in keeping with the page's tone — it is honest about
uncertainty rather than hiding it, which is the same instinct that made the
"Squeezed / Real gaps" toggle exist.

Export the valid-range constants from `solar-system-ephem.js` rather than
hardcoding dates in `solar-system.js`.

### Verify

Hold ⏩ at max speed for a minute and confirm the clock either stops at the bound
or shows the warning. Confirm winding back inside the range clears the warning.

### Done

_(record the fix here)_

---

## SS-B6 — Asteroid belt orbit equation inverted; Kuiper belt frozen

**Size:** S · **Batchable:** yes

### What happens

Two small modelling slips in `buildBelt` (`solar-system.js:385-419`).

**(a) Inverted orbit equation.** `solar-system.js:409`:

```js
const rad = r.a * (1 + r.ecc * Math.cos(ang));
```

The polar equation of an ellipse about a focus is `r = a(1−e²)/(1 + e·cos ν)`.
As written, perihelion and aphelion are swapped: the rocks are furthest from the
Sun where they should be closest. With `ecc ≤ 0.12` this is a subtle visual
difference, but it is the one place in the page where Kepler is faked and it is
faked backwards.

**(b) Kuiper belt never updates.** `updateKuiper` is called only at boot
(`solar-system.js:964`) and on a scale toggle (`solar-system.js:809`), never in
the frame loop — unlike `updateAsteroids` (`solar-system.js:735`). The Kuiper
objects are static.

### Fix

(a) Use the correct equation. Note that `ang` is being used as both the mean
anomaly proxy and the true anomaly; for a belt of decorative rocks at e ≤ 0.12
that conflation is acceptable, but say so in a comment.

(b) Either call `updateKuiper(days)` in the frame loop, or keep it static and add
a comment explaining the choice — at 33–49 au their periods are 190–340 years, so
at `1 day/s` they genuinely do not move perceptibly. Skipping 1800 point updates
per frame is a reasonable trade; it just needs to be a stated decision rather than
an apparent oversight.

### Verify

(a) Set an artificially high eccentricity (say 0.6) in a scratch build and confirm
the rocks bunch up near the Sun rather than away from it, then revert to 0.12.

(b) If you make it dynamic, run at `1 year/s` and confirm the outer belt drifts.

### Done

_(record the fix here)_
</content>
