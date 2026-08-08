# Science facts

Back to [README.md](README.md).

All of these live in `science/solar-system-data.js` and are copy-only — no render
risk. **SS-S1 through SS-S8 are batchable into a single commit.**

The page's standing contract, from the module headers: every number quoted in the
fact panel is the real measured one, even where the render is deliberately not to
scale. Keep that.

---

## SS-S1 — Moon counts are stale

**Size:** S · **Batchable:** yes

| Body | In the file | Current (2026) |
|------|-------------|----------------|
| Jupiter | `moonsKnown: 95` (`:188`), stat "95 confirmed" (`:196`) | past 100 — IAU MPC confirmed batches in March and April 2026, reported around 115 |
| Saturn | `moonsKnown: 274` (`:256`), stat "274 confirmed — the most of any planet" (`:265`) | ~292 |
| Uranus | `moonsKnown: 28` (`:351`), stat "28 confirmed" (`:360`) | 29 — JWST found S/2025 U1 in August 2025 |
| Neptune | `moonsKnown: 16` (`:426`), stat (`:434`) | 16 — still correct |
| Mercury, Venus | none | still correct |

### Fix

Update the numbers, but more importantly **stop them going stale silently**. These
churn constantly — Saturn gained 128 moons in a single 2025 announcement. Options:

1. Date them in the copy: `'292 confirmed as of 2026 — the most of any planet'`.
2. Phrase as a floor: `'more than 290, and counting'`.

Option 1 fits the page's precise voice better. Whichever you choose, apply it
consistently to all four giant planets, and add a comment at the top of the file
noting that these need a periodic check against the IAU Minor Planet Center.

Saturn's "the most of any planet" claim remains true and is worth keeping.

### Sources

- <https://earthsky.org/space/more-moons-for-jupiter-and-saturn-total-satellite-discoveries/>
- <https://skyandtelescope.org/astronomy-news/jwst-discovers-new-moon-of-uranus/>

Cross-check against <https://science.nasa.gov/> before committing — the numbers may
have moved again.

### Done

_(record the fix here)_

---

## SS-S2 — Uranus "coldest measured anywhere" contradicts Triton

**Size:** S · **Batchable:** yes

`solar-system-data.js:359`:

> `['Cloud-top temperature', '−224 °C, the coldest measured anywhere']`

`solar-system-data.js:459` (Triton):

> `'At −235 °C it is one of the coldest places measured in the solar system.'`

−235 is colder than −224, so the page contradicts itself. Uranus holds the record
for the coldest *planetary atmosphere*; Triton and Pluto are both colder.

### Fix

Change to `'−224 °C — the coldest of any planet'`. Uranus's neighbouring fact
(`:365`) already makes the interesting point correctly ("It is the coldest planet,
even though Neptune is further out"), so only the stat row needs the edit.

### Done

_(record the fix here)_

---

## SS-S3 — Titan: "1.5 times denser" is the pressure, not the density

**Size:** S · **Batchable:** yes

`solar-system-data.js:325`:

> `'Titan's air is 1.5 times denser than Earth's at sea level, and mostly nitrogen, like ours.'`

Titan's surface **pressure** is ~1.45 bar. Its **density** is roughly **four times**
Earth's at sea level, because the atmosphere sits at ~94 K: same gas, similar
pressure, far colder, so `ρ = P/RT` gives about 4x.

This matters because the very next fact (`:328`) — "a human with strapped-on wings
could fly" — depends on the 4x density figure, not 1.5. As written, the page states
the weaker number and then draws a conclusion that needs the stronger one.

### Fix

Something like: `'Titan's air presses down half again as hard as ours — but it is
so cold that it is about four times as dense, and it is mostly nitrogen, like ours.'`

Then the flying fact follows naturally from the sentence before it.

### Done

_(record the fix here)_

---

## SS-S4 — Mercury's core is not solid

**Size:** S · **Batchable:** yes

`solar-system-data.js:60`:

> `'About 60% of Mercury is a solid iron core — proportionally the largest core in the solar system.'`

Two problems:

1. **Not solid.** MESSENGER established that Mercury has a molten outer core — which
   is precisely why it has a magnetic field, unlike Mars or Venus. That is a more
   interesting fact than the one currently there.
2. **60% of what?** It is ~60% by mass. By radius the core is about 85%, which is
   the genuinely startling number and the reason "proportionally the largest core"
   is true.

### Fix

Suggested rewrite:

> `'Its iron core fills about 85% of Mercury's radius — proportionally the biggest of any planet — and the outer part of it is still molten, which is why tiny Mercury has a magnetic field when Mars and Venus do not.'`

### Done

_(record the fix here)_

---

## SS-S5 — Venus "day longer than its year" conflates spin with solar day

**Size:** S · **Batchable:** yes

`solar-system-data.js:85`:

> `'Venus spins so slowly, and the wrong way round, that its day is longer than its year — and the Sun rises in the west.'`

243 days is the **sidereal spin**. Sunrise to sunrise on Venus is **117 Earth days**,
which is *shorter* than its 225-day year. So "its day is longer than its year" is
only true if "day" means one rotation, and the sentence goes on to talk about
sunrises, where the other meaning applies.

The page already handles this distinction beautifully for Mercury —
`solar-system-data.js:52` uses the label `'Day (sunrise to sunrise)'` and
`:58` explains the 3:2 resonance. Venus is the planet where the distinction bites
hardest and it is the one place the page doesn't make it.

### Fix

Keep both numbers and make the contrast the point. Something like:

> `'Venus takes 243 Earth days to turn once — longer than its 225-day year. But it turns backwards, and that backwards spin means the Sun still crawls across the sky roughly every 117 days, rising in the west.'`

Also consider relabelling the stat at `:79` from `'Day (one spin)'` to match
Mercury's clarity, and adding a second row for the solar day.

### Done

_(record the fix here)_

---

## SS-S6 — Sun: "99.86% of everything"

**Size:** S · **Batchable:** yes

`solar-system-data.js:19`:

> `'An ordinary yellow dwarf star — and 99.86% of everything in the solar system.'`

Should be 99.86% of the solar system's **mass**.

Optional bonus while you are here: the Sun is not actually yellow — it is white,
and looks yellow from the ground only because the atmosphere scatters blue light
away. "Yellow dwarf" is standard usage so it is fine to keep, but it would make a
good addition to the `facts` array, and it pairs nicely with the existing
sky-colour intuition kids already have.

### Done

_(record the fix here)_

---

## SS-S7 — DKIST fact: tighten the numbers, name the mechanism, plan for ageing

**Size:** S · **Batchable:** yes

`solar-system-data.js:31-32`. The fact **is real and current** — published in
*Nature* on 5 August 2026 — so this is a refinement, not a correction.

Two adjustments:

1. **Numbers.** Reporting describes the vortices as roughly 20 km across with
   50–65 km spacing. The file says "mostly about 65 km apart, the smallest only
   25 km across". Close, but worth aligning with the published figures.
2. **Mechanism.** The vortices are identified as Kelvin–Helmholtz instabilities —
   plasma layers sliding past each other at different speeds. The file describes
   the braiding consequence (`:32`) but not the cause, and "layers sliding past
   each other and curling up" is a very tractable image for a young reader.

**Third, structural:** "In August 2026 the Inouye telescope…" will read oddly in
2028. Consider a lightweight convention for dated discoveries — a `since` field on
a fact, rendered as a small date badge in the panel — so new results can be added
over time without every one of them being written as breaking news. That is a small
change to `select()` in `solar-system.js:669-686` and the `.p-facts` styles.

### Sources

- <https://www.sci.news/astronomy/inouye-solar-telescope-plasma-vortices-sun-14974.html>
- <https://www.eurekalert.org/news-releases/1138745>

### Done

_(record the fix here)_

---

## SS-S8 — Olympus Mons "as wide as France"

**Size:** S · **Batchable:** yes

`solar-system-data.js:153`:

> `'Olympus Mons is a volcano 22 km high and as wide as France — nearly three times the height of Everest.'`

- Height 22 km is right (above datum; ~26 km above the surrounding plains).
- "Nearly three times Everest" — Everest is 8.85 km, so it is ~2.5x. Defensible but
  loose; "two and a half times" is both accurate and still impressive.
- "As wide as France" works by **area** (~300,000 km² vs France's ~550,000 km²,
  so actually a bit over half) but not by **width** — Olympus Mons is ~600 km across
  and France is ~1,000 km. NASA's usual comparison is the state of Arizona.

### Fix

Pick one comparison and make the axis explicit, e.g. `'…600 km across — it would
cover most of France — and two and a half times the height of Everest.'`

### Done

_(record the fix here)_

---

## SS-S9 — The Sun's differential rotation is described but rendered rigidly

**Size:** M

### What happens

The Sun's copy makes differential rotation the whole point:

- `solar-system-data.js:22` — `['Spins once in', '25 days at the equator, 35 at the poles']`
- `solar-system-data.js:30` — "its equator laps its poles every few weeks. That
  twisting is what makes sunspots and solar flares."

But the render spins the Sun as one rigid body (`solar-system.js:734`):

```js
sun.spin.rotation.y += (dtDays * Math.min(1, 12 / SPEEDS[speedIdx].v)) / 25.4 * Math.PI * 2;
```

So the one thing the text says is special about the Sun is the one thing you cannot
see.

### Fix

The Sun is already a procedural shader (`solar-system-sun.js`) rather than a
textured sphere, so this is more tractable here than it would be for a planet: add
a latitude-dependent angular velocity to the surface shader's UV lookup rather than
rotating the mesh rigidly. Roughly `ω(lat) = ω_eq · (1 − 0.19·sin²lat − 0.02·sin⁴lat)`
reproduces the real profile well enough.

At the visible-rate damping already applied for high time speeds, the lapping would
be perceptible at `1 month/s` and above — which is exactly when a curious viewer is
winding time forward anyway.

### Verify

Set speed to `1 month/s`, watch a surface feature near the equator and one near a
pole. The equatorial one should visibly pull ahead over a few simulated months.

### Done

_(record the fix here)_
</content>
