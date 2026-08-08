# Solar System page — review backlog

A review of `science/solar-system.html` and its modules (`science/solar-system*.js`,
`science/solar-system.css`), split into work items that can each be picked up in a
separate session.

Reviewed at commit `4b1607d`, August 2026.

## How to use this

Every item has a stable ID (`SS-B1`, `SS-S3`, …). When you fix one:

1. Read the item's file for the full context — the summary table here is only a pointer.
2. Make the change, verify it against the item's **Verify** section.
3. Tick the box in the table below and add a one-line note under **Done** in the item file.
4. Commit referencing the ID, e.g. `Fix permanently disabled scale toggle after a mission (SS-B1)`.

Items are independent unless a **Depends on** line says otherwise. Anything marked
**Batchable** is small enough to group with its siblings in one commit.

## Status

### Bugs — [01-bugs.md](01-bugs.md)

| ID | Item | Size | Done |
|----|------|------|------|
| SS-B1 | "Squeezed / Real gaps" toggle is permanently disabled after one mission | S | [ ] |
| SS-B2 | Venus and Uranus visually spin the wrong way (double-negated retrograde) | S | [ ] |
| SS-B3 | Moon orbital phases are `Math.random()` — moons are never in the right place | M | [ ] |
| SS-B4 | Sunlight has no distance falloff (`PointLight` decay 0) | M | [ ] |
| SS-B5 | Clock runs far past the ephemeris' valid 1800–2050 range with no guardrail | S | [ ] |
| SS-B6 | Asteroid belt orbit equation is inverted; Kuiper belt is frozen | S | [ ] |

### Science facts — [02-science-facts.md](02-science-facts.md)

| ID | Item | Size | Done |
|----|------|------|------|
| SS-S1 | Moon counts are stale (Jupiter, Saturn, Uranus) | S | [x] |
| SS-S2 | Uranus "coldest measured anywhere" contradicts Triton in the same dataset | S | [x] |
| SS-S3 | Titan: "1.5 times denser" is the pressure, not the density (~4x) | S | [x] |
| SS-S4 | Mercury's core is not solid, and 60% is a mass fraction | S | [x] |
| SS-S5 | Venus "day longer than its year" conflates spin with solar day | S | [x] |
| SS-S6 | Sun: "99.86% of everything" should be "of the mass" | S | [x] |
| SS-S7 | DKIST fact — tighten the numbers, name the mechanism, plan for ageing | S | [x] |
| SS-S8 | Olympus Mons "as wide as France" works by area, not by width | S | [x] |
| SS-S9 | Sun's differential rotation is described but rendered rigidly | M | [ ] |

### UI & UX — [03-ui-ux.md](03-ui-ux.md)

| ID | Item | Size | Done |
|----|------|------|------|
| SS-U1 | Gesture hint is hidden on touch devices and shown on desktop | S | [ ] |
| SS-U2 | Top header is overloaded: back + 3-line clock + 5 chips in 30vw | M | [ ] |
| SS-U3 | No keyboard support at all | M | [ ] |
| SS-U4 | Accessibility gaps: zoom blocked, no reduced-motion, no h1, no live region | M | [ ] |
| SS-U5 | No WebGL failure or context-lost path — the loading overlay never clears | S | [ ] |
| SS-U6 | Loading overlay hides before textures have arrived | S | [ ] |
| SS-U7 | Fact panel hides the mission bar mid-flight on narrow screens | S | [ ] |
| SS-U8 | Toggles disabled during a mission with no explanation | S | [ ] |
| SS-U9 | No reverse time — the clock only moves forward from 1 Jan 2026 | S | [ ] |
| SS-U10 | Clock UI and label layout rewrite the DOM 60x/second | S | [ ] |
| SS-U11 | "Suggest" freezes the main thread | M | [ ] |

### Features — [04-features.md](04-features.md)

| ID | Item | Size | Done |
|----|------|------|------|
| SS-F1 | Date picker and a "Today" button | M | [ ] |
| SS-F2 | Real lunar ephemeris → eclipse finder | L | [ ] |
| SS-F3 | Sunlight falloff mode with a brightness readout | M | [ ] |
| SS-F4 | Light-travel time between two bodies | S | [ ] |
| SS-F5 | Retrograde motion of Mars as seen from Earth | M | [ ] |
| SS-F6 | Real mission replays (Voyager 2, Cassini, New Horizons) | L | [ ] |
| SS-F7 | Wire missions into the existing rewards / sync system | M | [ ] |
| SS-F8 | Dwarf planets and a comet with an anti-sunward tail | M | [ ] |
| SS-F9 | Guided tour / story mode | M | [ ] |
| SS-F10 | Deep links (`?body=saturn&date=2027-05-03`) | S | [ ] |

## Suggested order

1. **SS-B1, SS-B2, SS-B5, SS-B6** — small, independently verifiable, one commit.
2. **SS-S1 … SS-S8** — copy-only, one commit, no render risk.
3. **SS-U1, SS-U5, SS-U6, SS-U8** — small UI correctness fixes.
4. **SS-F1** — the highest-value feature and a prerequisite for SS-F2.
5. Everything else by appetite.

## What is already good — don't regress it

Worth knowing before you change anything:

- Planet positions come from real JPL/Standish Keplerian elements
  (`solar-system-ephem.js`), so orbits keep their true shapes, tilts and
  eccentricities. Do not replace this with circular orbits for convenience.
- The flight model (`solar-system-flight.js`) is a real Lambert solver plus RK4
  integration, with the gravity fudge documented and bounded in the header comment.
  The Sun keeps its true GM so heliocentric transfers are genuine.
- Trajectories are **baked once and played back**, which is what makes missions
  scrubbable and the drawn route identical to the flown route. Keep that property.
- Every number quoted in the fact panel is the real measured one, even where the
  render is deliberately not to scale. Keep that contract.
</content>
</invoke>
