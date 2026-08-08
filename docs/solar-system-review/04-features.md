# Feature ideas

Back to [README.md](README.md).

Ordered by payoff per unit of effort. Each is optional — unlike the bug and fact
items, these are proposals, not defects.

---

## SS-F1 — Date picker and a "Today" button

**Size:** M · **Highest value per unit of work**

### Why

The clock always starts at 1 Jan 2026 (`solar-system.js:56`) and can only crawl
forward from there. There is no way to jump to a date. A child cannot ask "where
was everything on my birthday?" or "what does the sky look like tonight?" — which
are the two questions that turn an orrery from a diagram into something personal.

### What to build

- A tappable date on the clock (`#dateText`, `solar-system.html:34`) that opens a
  date input.
- A "Today" button that sets `jd` from `Date.now()`.
- Consider making **Today** the default start rather than 1 Jan 2026. The current
  fixed epoch is what makes the "Earth has completed N laps since 1 Jan 2026"
  counter meaningful (`solar-system.js:753-755`), so if you change the default,
  keep 1 Jan 2026 as the lap-counter reference and just move the initial view.

`jdFromDate` and `dateFromJd` already exist (`solar-system-ephem.js:73-74`), and
the rocket module already calls `setJd` to wind the clock forward to a launch
window (`solar-system-rocket.js:485`), so the plumbing is in place.

### Watch out for

- Clamp to the ephemeris' valid range — see **SS-B5**.
- Jumping the clock must call `updateBodies(0)` and `updateClockUI()`, the way
  `btnTimeReset` does (`solar-system.js:780-785`).
- If a mission is in flight, a date jump scrubs the baked trajectory — that should
  work (playback is interpolated from the bake) but needs testing.

### Enables

**SS-F2** needs this. **SS-F10** pairs with it naturally.

---

## SS-F2 — Real lunar ephemeris → eclipse finder

**Size:** L · **The one that would make the page memorable**

### Why

The Moon's fact list already ends on eclipses (`solar-system-data.js:128`):

> "The Moon's path around Earth is tilted slightly, so most months it passes just
> above or below the Sun… A solar eclipse only happens on the rare occasions it
> lines up exactly."

That is a perfect setup for something the user can *watch*, and right now it is
only text — the Moon's orbital phase is random (**SS-B3**) so no alignment is ever
real.

### What to build

1. Fix **SS-B3** tier 2 for the Moon specifically: a truncated lunar ephemeris.
   Meeus' low-precision series (~20 periodic terms for longitude, ~10 for latitude)
   is accurate to a few arcminutes, which is plenty to get eclipse dates right,
   and is about 40 lines of arithmetic — a natural fit alongside the existing
   Kepler solver in `solar-system-ephem.js`.
2. Add a small "next eclipse" finder: step forward looking for
   Sun–Moon–Earth alignments within the eclipse limits, and offer a button that
   winds the clock there and frames Earth.
3. Show both kinds — solar (Moon between Earth and Sun) and lunar (Earth in the
   middle) — since the difference is far clearer seen from outside than it ever is
   from the ground, and that outside view is exactly what this page has.

Good test dates: total solar eclipse 12 August 2026; total lunar eclipse 3 March 2026.

### Depends on

**SS-B3** (tier 2) and **SS-F1**.

---

## SS-F3 — Sunlight falloff mode with a brightness readout

**Size:** M

### Why

See **SS-B4**: lighting is currently flat, so Neptune is as bright as Mercury.
Rather than silently fixing it, make it the point.

### What to build

A toggle that switches between the current flat lighting and true inverse-square,
paired with a readout on the selected body:

> "Sunlight here: 1/900 of Earth's. Noon on Neptune is about as bright as twilight
> at home."

The number is just `1/r²` in au, which the page already has for every body.

This teaches the inverse-square law without ever using the phrase, and it explains
something kids often find genuinely surprising — that the outer solar system is not
merely cold, it is *dark*.

### Watch out for

Earth's self-lit shader (`solar-system-earth.js`) bypasses the scene light entirely,
so it needs the same scaling applied to `uAmbient` and the day-map multiplier or
Earth will not match its neighbours.

### Related

Supersedes **SS-B4** if built.

---

## SS-F4 — Light-travel time between two bodies

**Size:** S

### Why

The Sun's fact list already has the hook (`solar-system-data.js:29`): "Sunlight
takes 8 minutes 20 seconds to reach Earth — so you always see the Sun as it was
eight minutes ago."

### What to build

Pick two bodies, get the one-way light time at the current date — and, because
positions are real and time-varying, watch it change as the planets move. "A radio
signal to Mars takes between 3 and 22 minutes depending on the date" is a far more
vivid statement when you can wind the clock and see the number move.

It is one distance calculation and a division. The main work is the interaction
design for picking a second body.

---

## SS-F5 — Retrograde motion of Mars as seen from Earth

**Size:** M

### Why

This is the single best "why was this so hard for two thousand years" moment in
astronomy, and the page already has everything needed to show it: two real
positions over time.

### What to build

Plot Mars' *apparent* path against the stars as seen from Earth over ~2 years, and
watch it trace a loop and go backwards. It is a projection of `positionAt(mars) −
positionAt(earth)` onto the sky, sampled over time and drawn as a trail.

Pair it with a view that shows both the heliocentric truth and the geocentric
appearance side by side. The moment the loop resolves into "oh — we overtook it" is
the whole lesson.

Works for any planet; Mars is the classic because its loops are the largest.

---

## SS-F6 — Real mission replays

**Size:** L

### Why

The architecture is already built for this. From `solar-system-rocket.js:13-17`:

> "once you launch, the whole trajectory is computed in one go and the ship then
> plays back along it. Nothing is integrated live."

A historical mission is just a baked trajectory from a different source. The
playback, the chase/cockpit cameras, the encounter markers and the route drawing
all work unchanged.

### What to build

Pre-baked trajectories for Voyager 2's grand tour (Jupiter → Saturn → Uranus →
Neptune, the four-planet alignment that only recurs every 175 years), Cassini, and
New Horizons. Ship them as sampled state arrays in the same shape `bake()` returns,
so `stateAt()` consumes them directly.

Add a small card per mission with launch date, arrival dates, and what it found —
tying back into the fact panels that already reference these missions (Huygens at
`solar-system-data.js:327`, Cassini at `:289`, Voyager 2 at `:449` and `:440`).

### Watch out for

The encounter-labelling logic in `bake()` (`solar-system-flight.js:432-469`) is
computed during integration, so pre-baked paths need their encounter list supplied
alongside rather than derived.

---

## SS-F7 — Wire missions into the existing rewards system

**Size:** M

### Why

`solar-system.html:107-113` loads `version.js`, `sync-registry.js`,
`sync-merge.js`, `sync-drive.js`, `sync-ui.js`, `avatar.js` and `app.js` — the
site's full progress-sync stack — and registers **nothing** with it. Every other
page in the repo that loads these participates in `rewards.html` and the
leaderboard.

### What to build

A mission log persisted through the existing sync registry:

- Planets visited (arrived at, distinct from flown past)
- First successful gravity assist
- Reached Neptune within the fuel budget
- Fewest days Earth → Mars
- Launched on a real transfer window

The mission code already distinguishes an orbital capture from a flyby and says so
in words (`solar-system-rocket.js:639-655`), so the outcomes worth recording are
already computed — they are just discarded when the mission ends.

Look at how another page registers with `sync-registry.js` before designing the
schema.

---

## SS-F8 — Dwarf planets and a comet

**Size:** M

### Why

Pluto's absence is conspicuous on a page this thorough, and a comet would be the
most visually striking object in the scene.

### What to build

- **Dwarf planets:** Pluto, Ceres, Eris, Haumea, Makemake. Ceres in particular
  gives the asteroid belt a reason to be tappable. Pluto's steep inclination and
  eccentricity are worth showing precisely because they look wrong next to the
  planets — that is the reason it was reclassified, made visible.
- **A comet:** Halley on its real orbit, with a tail pointing **anti-sunward** —
  not backwards along its path. That is the detail everyone gets wrong and it is
  the whole physics of the thing. The Sun direction per body is already computed
  (`solar-system-earth.js:218` does exactly this), so the tail orientation is
  nearly free.

Watching the tail swing around to lead the comet as it rounds perihelion and heads
back out is a genuinely memorable few seconds.

### Watch out for

The Keplerian elements in `solar-system-ephem.js` only cover the eight planets.
Dwarf planets and comets need their own element sets, and highly eccentric orbits
stress the compression curve (`solar-system.js:40-42`) — Halley's aphelion is 35 au.

---

## SS-F9 — Guided tour / story mode

**Size:** M

### Why

The page is deep, and a child who opens it cold sees a dark screen with dots and a
one-line hint that fades after nine seconds (`solar-system.css:510`). There is no
path from "I arrived" to "I found the good bits".

### What to build

A two-minute autoplay: eight stops, each flying the camera to a body, opening its
panel and showing one narration card, with skip-forward/back and an exit to free
exploration at any point.

The camera easing (`focusOn`, `solar-system.js:523-531`) and the panel already do
most of this; the tour is a list of stops and a timer.

Finish the tour on the 🚀 Fly button so the mission mode gets discovered, since it
is the most impressive thing on the page and currently the least obvious.

---

## SS-F10 — Deep links

**Size:** S

### Why

Nothing is in the URL, so nothing is shareable or bookmarkable — and the browser
back button does nothing useful.

### What to build

Encode the selected body and the current date: `?body=saturn&date=2027-05-03`.
Optionally the view state (squeezed/real, orbits/labels on) too.

Read it at boot in the boot block (`solar-system.js:960-971`), and update it with
`history.replaceState` on selection change in `select()` (`solar-system.js:653`) —
`replaceState` rather than `pushState`, so the back button leaves the page rather
than walking through every planet the user tapped.

### Depends on

Pairs naturally with **SS-F1**.
</content>
