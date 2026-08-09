# UI & UX

Back to [README.md](README.md).

---

## SS-U1 — Gesture hint is hidden on touch devices and shown on desktop

**Size:** S · **Batchable:** yes

### What happens

`solar-system.html:98`:

```html
<div id="hint">Tap a planet for its story · pinch to zoom · drag to swing the view</div>
```

`solar-system.css:571`, inside `@media (max-width: 820px), (orientation: portrait)`:

```css
#hint { display: none; }
```

So the hint that says "pinch to zoom" is hidden on exactly the devices that can
pinch, and shown to mouse users who cannot. It was presumably hidden because it is
`white-space: nowrap` and would overflow a phone — but the fix for overflow is
wrapping, not deletion.

### Fix

Show it on touch, and make it fit: allow wrapping, cap the width at something like
`min(90vw, 34rem)`, and centre the text. Consider tailoring the wording by pointer
type — `pinch to zoom` for coarse pointers, `scroll to zoom` for fine ones — via a
`@media (pointer: coarse)` rule or a class set from
`window.matchMedia('(pointer: coarse)')`, which `solar-system.js:144` already uses
for the low-res Sun decision.

### Verify

Load on a phone-width viewport in portrait: the hint must appear, fit within the
screen, and fade out on the existing 9s animation. Confirm it does not collide with
the bottom time bar (`#hint` sits at `bottom: calc(84px + safe-area)`, same as the
mission bar).

### Done

_(record the fix here)_

---

## SS-U2 — The top header is overloaded

**Size:** M

### What happens

`solar-system.html:25-45` puts four things in one row: a 44px back button, a
three-line clock (year/day, full date, lap counter), and five toggle chips
(🚀 Fly, ◌ Orbits, ◆ Names, ↔ Squeezed, ◎ True size).

`solar-system.css:176-184` caps the chip cluster at `max-width: 30vw`, dropping to
`42vw` with 0.68rem text on narrow screens (`:556-559`). Five chips in 42vw of a
phone means a ragged two-or-three-row block of ~11px text competing with the clock
for attention.

The lap counter is already sacrificed on narrow screens (`.clock-lap { display: none }`,
`:547`), which is a signal that the row is over budget.

### Fix

Options, roughly in order of preference:

1. **A layers sheet.** Collapse Orbits / Names / Squeezed / True size into a single
   ⚙ or ☰ chip that opens a small panel with proper labels and one-line
   explanations of what each does. Leave 🚀 Fly as the one standalone chip, since
   it is the page's headline feature. This also gives SS-U8 somewhere to put the
   "why is this disabled" explanation.
2. **Move view toggles to the bottom bar** next to the ⌖ reset-view button, which
   is conceptually where they belong (they are all view settings), and leave the
   top to the clock and 🚀.

Either way, get the chip font back above 12px.

### Related

**SS-U8** (disabled toggles need explanation) is much easier once there is a sheet
with room for text.

### Done

_(record the fix here)_

---

## SS-U3 — No keyboard support

**Size:** M

### What happens

There is not a single `keydown` listener in the page. Everything is pointer-only:
camera orbit, zoom, pan, picking, and every control. The floating labels are real
`<button>` elements (`solar-system.js:575-581`) — a genuinely nice touch — but a
keyboard user cannot reach them usefully, and there is no `:focus-visible` styling
anywhere in the CSS, so tabbing gives no visible indication of position.

### Fix

Add a keyboard layer:

| Key | Action |
|-----|--------|
| `Space` | play / pause |
| `←` `→` | slower / faster |
| `Home` | reset clock to 1 Jan 2026 |
| `Esc` | close the fact panel (and back out of a mission phase) |
| Arrow keys + `Shift` | orbit the camera |
| `+` `−` | zoom |
| `O` `N` | toggle orbits / names |
| `?` | show the shortcut list |

And add a `:focus-visible` outline to `.chip-btn`, `.rbtn`, `.chip`, `.lbl` and
`.back`. The current `-webkit-tap-highlight-color: transparent` and
`user-select: none` (`solar-system.css:31-33`) suppress the default affordances, so
the focus ring has to be put back deliberately.

Guard against the keys firing while a mission is aiming, the same way the pointer
handlers do via `rocketHasDrag()` (`solar-system.js:447`).

### Verify

Tab through the page with no mouse: every control must be reachable and visibly
focused. Confirm `Space` does not also scroll or double-fire on a focused button.

### Done

_(record the fix here)_

---

## SS-U4 — Accessibility gaps

**Size:** M

Several independent items; can be split if a session is short.

**(a) Browser zoom is blocked.** `solar-system.html:5`:

```html
<meta name="viewport" content="... maximum-scale=1.0, user-scalable=no, ...">
```

The canvas already sets `touch-action: none` (`solar-system.css:39`) and the page
prevents Safari gesture events (`solar-system.js:519-521`), so `user-scalable=no`
is probably not buying much beyond what those already handle — while it does stop
a low-vision user enlarging the fact panel text. Try removing it and confirm the
pinch-to-zoom-the-orrery gesture still works cleanly.

**(b) No reduced-motion path.** Nothing honours `prefers-reduced-motion`: the
loading spinner (`solar-system.css:536-543`), the hint fade (`:510-518`), the panel
transition (`:252`), and the continuously moving orrery itself. At minimum, respect
it for the spinner and transitions; consider also defaulting the clock to paused
when it is set, since a permanently moving background is the actual problem for
motion-sensitive users.

**(c) No `<h1>`.** The document has a `<title>` and jumps straight to `<h2>` inside
the fact panel (`solar-system.js:672`). Add a visually-hidden `<h1>The Solar System</h1>`.

**(d) The clock is not announced.** `#dateText` / `#yearNum` / `#dayNum` change
constantly with no `aria-live`. Adding `aria-live="polite"` on the raw element would
be far too chatty at 60fps — pair this with **SS-U10**, which stops the per-frame
DOM writes, then put the live region on the date only.

**(e) The canvas has no text alternative.** Add an `aria-label` and a short
visually-hidden description of what is on screen, and mark the decorative label
layer `aria-hidden` where appropriate.

**(f) The fact panel is an `<aside>` with no dialog semantics.** On narrow screens
it is a bottom sheet covering half the viewport (`solar-system.css:562-570`) with no
drag handle, no focus move on open, and no Esc to close (see SS-U3). Give it
`role="dialog"` / `aria-labelledby` pointing at its `<h2>`, move focus to it on
open, and return focus to the trigger on close.

### Done

_(record the fix here)_

---

## SS-U5 — No WebGL failure or context-lost path

**Size:** S · **Batchable:** yes

### What happens

`solar-system.js:970` is the only thing that clears the loading overlay:

```js
document.getElementById('loading').classList.add('gone');
```

It is the second-to-last statement of a module with no error handling. If WebGL is
unavailable, a texture fails, or anything in the ~950 lines above throws, the user
is left staring at "Building the solar system…" and a spinner, forever, with no
explanation.

There is also no `webglcontextlost` handler. An iPad that gets backgrounded under
memory pressure can lose its GL context and come back to a permanently black screen.

### Fix

1. Wrap the boot sequence in a try/catch and, on failure, replace the loading
   overlay's contents with a plain message and a link back to `../science.html`.
   Detect the specific "no WebGL" case and say so, since that has a different remedy
   for the user than a generic error.
2. Add a `webglcontextlost` listener on `renderer.domElement` that calls
   `preventDefault()` and shows a "tap to restore" overlay, plus a
   `webglcontextrestored` listener that re-runs texture upload and resumes the frame
   loop. If a full restore is too much work, at minimum detect the loss and tell the
   user to reload rather than leaving a black screen.

### Verify

- Force the failure path by temporarily throwing at the top of the module; confirm a
  readable message appears.
- Simulate context loss with the `WEBGL_lose_context` extension from the console.

### Done

_(record the fix here)_

---

## SS-U6 — Loading overlay hides before the textures arrive

**Size:** S · **Batchable:** yes

### What happens

`solar-system.js:970` clears the overlay at the end of the module's synchronous
boot. But the planet surface maps are loaded asynchronously via
`THREE.TextureLoader` (`solar-system-textures.js:342-349`, `:373-378`), so the
overlay lifts on grey untextured spheres that then pop into their photo maps a
moment later.

### Fix

Use a `THREE.LoadingManager` shared by `photoLoader` and `earthLoader` in
`solar-system-textures.js`, expose its `onLoad`, and clear the overlay from that
rather than inline. Add a progress readout to the overlay while you are there —
"Building the solar system…" with a 0–100% bar is nicer than a bare spinner, and
the manager gives you the numbers for free.

Keep a timeout fallback so a single failed texture cannot strand the overlay
(and coordinate with **SS-U5**, which handles the error path).

### Verify

Throttle the network to Slow 3G in devtools and reload. The overlay should stay up
until the planets are textured, then lift cleanly with no pop.

### Depends on

Best done together with **SS-U5** — they both touch the overlay lifecycle.

### Done

_(record the fix here)_

---

## SS-U7 — The fact panel hides the mission bar mid-flight

**Size:** S

### What happens

`solar-system.css:581`:

```css
#panel.open ~ #missionBar { display: none; }
```

On a narrow screen, tapping a planet during an active mission makes the mission bar
vanish — taking the fuel gauge, the status line, and the action buttons
(⏭ Skip ahead, ✕ End mission) with it. The user has no way to know the controls
still exist, and no obvious way back other than closing the panel.

The HTML comment at `solar-system.html:87` shows this was a deliberate trade
("Sits after the fact panel so a narrow screen can hide one for the other"), but the
result is a dead end rather than a trade the user can see.

### Fix

Replace the hide with something visible. Either:

1. A two-tab segmented control at the bottom of a narrow screen — "Mission" /
   "Planet" — so both are reachable and the user can see the other exists.
2. Let the mission bar collapse to a single-line summary (status + fuel bar) that
   stays visible above the panel, expanding when tapped.

Option 2 keeps the fuel gauge on screen at all times, which is the piece the user
most needs during a flight.

### Verify

At phone width, start a mission, launch, then tap a planet mid-flight. The mission
status and a way back to the mission controls must remain visible.

### Done

_(record the fix here)_

---

## SS-U8 — Toggles disabled during a mission with no explanation

**Size:** S · **Batchable:** yes

### What happens

`beginMission()` (`solar-system.js:933-934`) disables both the scale and true-size
chips. They simply go grey (`.chip-btn:disabled { opacity: 0.4 }`,
`solar-system.css:200`) with no indication of why or when they come back.

The reason is good, and is documented in the code (`solar-system.js:893-896`): the
squeezed view bends straight lines, so any trajectory flown inside it would be a
lie. That reasoning is exactly the kind of thing this page is otherwise excellent at
surfacing to the user — it just never leaves the source file.

### Fix

Surface the explanation. A `title` attribute is the minimum; better is a line in the
mission bar's detail area when a mission starts: "Distances are shown for real while
you fly — the squeezed view bends straight lines, so a route drawn in it would not be
true." That turns a dead control into a teaching moment.

If **SS-U2** builds a layers sheet, the disabled entries there have natural room for
a sentence each.

### Depends on

Nothing, but nicer after **SS-U2**.

### Done

_(record the fix here)_

---

## SS-U9 — No reverse time

**Size:** S

### What happens

Every entry in `SPEEDS` (`solar-system.js:57-68`) is positive, and `jd` only ever
increases (`solar-system.js:862`). The only way back is ⏮, which jumps all the way
to 1 Jan 2026 and also resets the speed.

So a user who overshoots an interesting moment — a conjunction, a close approach,
the alignment they were winding towards — has to start again from the beginning and
wind forward.

### Fix

Add reverse. Either a ⏮/⏭ pair that steps the clock by one screen-speed unit, or
let ⏪ pass through zero into negative speeds (the label already reads "⏪ Slow down
time", so extending it past zero is a small conceptual step and the speed label can
show `−1 day/s`).

Check the consequences before committing:

- `updateBodies` handles negative `dtDays` fine — rotations just run backwards.
- The lap counter (`solar-system.js:753-755`) already uses `Math.abs`, so it copes.
- `dayOfYear` / `daysInYear` are date-based and fine.
- The rocket's playback (`solar-system-rocket.js:862-886`) clamps to `jdEnd` and
  interpolates a baked path, so scrubbing backwards through a flown mission should
  already work — the module header explicitly claims "the mission can be
  fast-forwarded or rewound freely" (`solar-system-rocket.js:16`), which is a
  capability nothing currently exposes.
- Guard against reversing past the ephemeris' lower bound — see **SS-B5**.

### Depends on

Coordinate with **SS-B5** (clock range clamping).

### Done

_(record the fix here)_

---

## SS-U10 — Clock UI and label layout rewrite the DOM every frame

**Size:** S · **Batchable:** yes

### What happens

The frame loop (`solar-system.js:887-888`) calls `updateLabels()` and
`updateClockUI()` unconditionally, 60 times a second.

`updateClockUI` (`solar-system.js:747-756`) runs `Intl.DateTimeFormat.format`,
builds a template string, and writes four text nodes — to produce a value that
changes at most once per simulated day, and at `1 hour/s` that is once every 24
seconds.

`updateLabels` (`solar-system.js:626-632`) projects and writes inline `transform`
and `display` styles for every body — roughly 30 elements — every frame, including
ones that are hidden.

### Fix

- **Clock:** cache the last rendered day/date and only write when it changes. Keep
  the `Intl` formatter instance (it already is hoisted, good) but skip the call
  entirely when the integer day has not moved.
- **Labels:** they genuinely do need per-frame repositioning since the camera moves,
  but skip the write when the computed transform is unchanged, and skip projection
  entirely for bodies whose host is out of range (the `near` check at
  `solar-system.js:592-593` already computes this — reorder so it short-circuits
  before the projection work).

This is the enabling fix for **SS-U4(d)**: an `aria-live` region is unusable while
the text is rewritten 60x/second.

### Verify

Profile a minute of running at `1 day/s` before and after; scripting time in the
frame should drop noticeably on a mid-range tablet.

### Done

`updateClockUI` now tracks the last rendered calendar day (via `Math.floor(jd -
0.5)`, which ticks over exactly at UTC midnight) and returns immediately when it
hasn't moved, so the four text-node writes only happen once per simulated day
instead of 60x/second.

`placeLabel` keeps a per-label `{ shown, transform }` cache and only touches
`el.style.display` / `el.style.transform` when the new value differs from what's
already on the element; the moon-vs-planet `near` check was already ordered ahead
of the projection call, so out-of-range moons were already skipping that work.
Positions are still recomputed every frame (the camera can move), but the DOM is
now untouched on frames where nothing actually changed on screen.

Verified in a headless browser: labels correctly re-project and their `on`/style
state still updates when the camera is dragged, the clock readout still advances
correctly across day boundaries, and — measured via a `MutationObserver` on the
label layer — zero `style` mutations occur per frame while paused and idle
(previously every frame rewrote all ~30 labels regardless).

---

## SS-U11 — "Suggest" freezes the main thread

**Size:** M

### What happens

Tapping ✨ Suggest during a mission runs `sys.plan()` synchronously
(`solar-system-rocket.js:445`), and on failure follows it with `sys.windows(...,
4000, 30)` (`:449`) — a scan of 4,000 days at 30-day steps, each step running a full
Lambert sweep across the flight-time horizon.

The `setTimeout(..., 30)` wrapper (`solar-system-rocket.js:444`) only lets the
button repaint its "Working…" label before the block; it does not prevent the
freeze. On a mid-range tablet this is a visible multi-second lock-up with no
progress indication and no way to cancel.

`plan()` itself (`solar-system-flight.js:659-717`) runs up to 3 Newton iterations,
each requiring 4 full trajectory bakes for the finite-difference Jacobian — so
around 12 bakes, each tens of thousands of RK4 steps.

### Fix

Move the solver to a Web Worker. `solar-system-flight.js` is already written as pure
maths with no three.js and no DOM (stated in its header, and true), so it can be
imported into a worker unchanged — this is the payoff for that discipline.

Plan:

1. Create `solar-system-flight-worker.js` that imports `makeSystem` and handles
   `plan` / `windows` / `suggest` messages.
2. In `initRocket`, post to the worker and await the result.
3. Show real progress rather than a static "Working…", and add a cancel.
4. Keep the synchronous path as a fallback if `Worker` is unavailable.

While in there: `windows()` re-derives `tofSteps(15)` for every one of the ~134 scan
points. Caching planet positions across the scan would cut the cost substantially
even before the worker move.

### Verify

Tap ✨ Suggest for a hard route (Earth → Neptune, which will fail and trigger the
window scan). The UI must stay responsive and the spinner must animate throughout.

### Done

_(record the fix here)_
</content>
