/* ============================================================================
   solar-system-data.js — the bodies, their real numbers and their stories.

   Radii, rotation periods, tilts and moon orbits are real measured values
   (NASA planetary fact sheets). Rotation periods are signed: a negative
   number means the body spins backwards compared with its orbit.

   `texture` names a painter in solar-system-textures.js.
   ========================================================================== */

export const SUN = {
  id: 'sun',
  name: 'Sun',
  kind: 'star',
  color: '#ffb545',
  radiusKm: 695700,
  rotationHours: 609.12,          // ~25.4 days at the equator
  tilt: 7.25,
  blurb: 'An ordinary yellow dwarf star — and 99.86% of everything in the solar system.',
  stats: [
    ['Diameter', '1,391,400 km — 109 Earths side by side'],
    ['Surface temperature', '5,500 °C (core: 15 million °C)'],
    ['Spins once in', '25 days at the equator, 35 at the poles'],
    ['Age', 'about 4.6 billion years, roughly halfway through its life'],
    ['Made of', '~73% hydrogen, ~25% helium']
  ],
  facts: [
    'Every second the Sun turns about 600 million tonnes of hydrogen into helium, and converts roughly 4 million tonnes of that into pure energy.',
    'Sunlight takes 8 minutes 20 seconds to reach Earth — so you always see the Sun as it was eight minutes ago.',
    'The Sun is not solid, so it does not spin as one piece: its equator laps its poles every few weeks. That twisting is what makes sunspots and solar flares.',
    'In August 2026 the Inouye telescope in Hawaii took the sharpest pictures of the Sun ever made, and found tiny whirlpools — mostly about 65 km apart, the smallest only 25 km across — swirling along the edge of every magnetic patch. Nobody expected any stirring to be happening there at all.',
    'Those whirlpools keep twisting the Sun’s magnetic field lines until they braid like plaited hair. Every so often a braid snaps and dumps its energy as heat, and that may be the answer to a decades-old puzzle: why the Sun’s outer atmosphere is a million °C while the surface below it is a mere 5,500 °C.',
    'It is so massive that its gravity holds Neptune in place from 4.5 billion km away.'
  ]
};

export const PLANETS = [
  {
    id: 'mercury',
    name: 'Mercury',
    symbol: '☿',
    color: '#b6a58e',
    texture: 'mercury',
    radiusKm: 2439.7,
    rotationHours: 1407.6,
    tilt: 0.034,
    moonsKnown: 0,
    blurb: 'The smallest planet, closest to the Sun — a cratered ball of rock with a giant iron heart.',
    stats: [
      ['Distance from Sun', '57.9 million km (0.39 AU)'],
      ['Year', '88 Earth days'],
      ['Day (sunrise to sunrise)', '176 Earth days'],
      ['Diameter', '4,879 km — smaller than some moons'],
      ['Temperature', '−180 °C at night, +430 °C in the day'],
      ['Moons', 'none']
    ],
    facts: [
      'Mercury spins three times for every two orbits, so a single day-to-night cycle lasts two of its years.',
      'It has the biggest temperature swing of any planet: over 600 °C between day and night, because there is almost no atmosphere to hold the heat.',
      'About 60% of Mercury is a solid iron core — proportionally the largest core in the solar system.',
      'Radar shows water ice hiding in crater floors near the poles that sunlight has never touched.'
    ],
    moons: []
  },
  {
    id: 'venus',
    name: 'Venus',
    symbol: '♀',
    color: '#e8c88a',
    texture: 'venus',
    radiusKm: 6051.8,
    rotationHours: -5832.5,        // retrograde: it spins backwards
    tilt: 177.4,
    moonsKnown: 0,
    blurb: 'Earth\'s twin in size, and a crushing 464 °C furnace wrapped in acid clouds.',
    stats: [
      ['Distance from Sun', '108.2 million km (0.72 AU)'],
      ['Year', '225 Earth days'],
      ['Day (one spin)', '243 Earth days — backwards'],
      ['Diameter', '12,104 km (95% of Earth)'],
      ['Temperature', '464 °C, day and night, everywhere'],
      ['Moons', 'none']
    ],
    facts: [
      'Venus spins so slowly, and the wrong way round, that its day is longer than its year — and the Sun rises in the west.',
      'Its thick carbon-dioxide air presses down as hard as being 900 m deep in the ocean, and traps heat so well that Venus is hotter than Mercury.',
      'The clouds are droplets of sulfuric acid, blown around the whole planet in just four days by winds far faster than the planet turns.',
      'Under the clouds it is startlingly flat and young — lava seems to have repaved almost the entire surface a few hundred million years ago.'
    ],
    moons: []
  },
  {
    id: 'earth',
    name: 'Earth',
    symbol: '⊕',
    color: '#5aa9e6',
    texture: 'earth',
    radiusKm: 6371,
    rotationHours: 23.9345,
    tilt: 23.44,
    moonsKnown: 1,
    blurb: 'Home. The only world we know of with liquid water oceans and life.',
    stats: [
      ['Distance from Sun', '149.6 million km (1 AU)'],
      ['Year', '365.256 days'],
      ['Day (one spin)', '23 h 56 m 4 s'],
      ['Diameter', '12,742 km'],
      ['Temperature', '−89 °C to +57 °C, average +15 °C'],
      ['Moons', '1']
    ],
    facts: [
      'Earth is tilted 23.4°, and that tilt — not our distance from the Sun — is what gives us summer and winter.',
      'We are actually closest to the Sun in early January and furthest in early July, a difference of about 5 million km.',
      'Earth travels around the Sun at 29.8 km every second — roughly 107,000 km/h — while spinning at 1,670 km/h at the equator.',
      'Its liquid iron outer core generates a magnetic field that deflects the solar wind and keeps our atmosphere from being stripped away.'
    ],
    moons: [
      {
        id: 'moon', name: 'The Moon', color: '#cfcabc', texture: 'moon',
        radiusKm: 1737.4, aKm: 384400, periodDays: 27.3217,
        blurb: 'The fifth-largest moon in the solar system, and the only other world humans have stood on.',
        facts: [
          'The Moon always shows us the same face: it spins exactly once per orbit, locked by Earth\'s gravity.',
          'Long ago the Moon spun faster. Earth pulled harder on its near side than its far side, stretching it a little — and that stretch acted like a brake, slowing the spin down over millions of years until it matched the orbit, locking the same face toward us forever.',
          'It is drifting away from us by about 3.8 cm a year — the same rate your fingernails grow.',
          'Its gravity raises our tides, and steadies Earth\'s tilt, which keeps our seasons from wandering wildly.',
          'It probably formed when a Mars-sized world smashed into the young Earth about 4.5 billion years ago.',
          'The Moon\'s path around Earth is tilted slightly, so most months it passes just above or below the Sun instead of straight in front of it. A solar eclipse only happens on the rare occasions it lines up exactly, which is just a couple of times a year.'
        ]
      }
    ]
  },
  {
    id: 'mars',
    name: 'Mars',
    symbol: '♂',
    color: '#e07a4e',
    texture: 'mars',
    radiusKm: 3389.5,
    rotationHours: 24.6229,
    tilt: 25.19,
    moonsKnown: 2,
    blurb: 'The rusty desert world — with the tallest volcano and the deepest canyon of them all.',
    stats: [
      ['Distance from Sun', '227.9 million km (1.52 AU)'],
      ['Year', '687 Earth days'],
      ['Day (one spin)', '24 h 37 m — almost the same as ours'],
      ['Diameter', '6,779 km (about half of Earth)'],
      ['Temperature', '−140 °C to +20 °C, average −63 °C'],
      ['Moons', '2']
    ],
    facts: [
      'Olympus Mons is a volcano 22 km high and as wide as France — nearly three times the height of Everest.',
      'Valles Marineris is a canyon system 4,000 km long; it would stretch across the whole of the United States.',
      'Mars is red because its dust is full of iron oxide — literally rust.',
      'Rovers have found dried-up river beds, lake sediments and clays: Mars had flowing water billions of years ago.'
    ],
    moons: [
      {
        id: 'phobos', name: 'Phobos', color: '#8a7a6d', texture: 'rock',
        radiusKm: 11.27, aKm: 9376, periodDays: 0.31891,
        blurb: 'A lumpy 22 km potato orbiting closer to its planet than any other moon.',
        facts: [
          'Phobos races around Mars three times a day, so from the surface it rises in the west and sets in the east.',
          'It is spiralling inwards by about 2 cm a year and will be torn apart into a ring in roughly 50 million years.'
        ]
      },
      {
        id: 'deimos', name: 'Deimos', color: '#9c8b7b', texture: 'rock',
        radiusKm: 6.2, aKm: 23463, periodDays: 1.26244,
        blurb: 'Mars\'s tiny outer moon — barely 12 km across, and smooth with dust.',
        facts: [
          'From the surface of Mars, Deimos looks like a bright star that takes 2.7 days to cross the sky.',
          'Both Martian moons are probably captured asteroids, or debris blasted off Mars by a giant impact.'
        ]
      }
    ]
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    symbol: '♃',
    color: '#d8a06a',
    texture: 'jupiter',
    radiusKm: 69911,
    rotationHours: 9.9250,
    tilt: 3.13,
    moonsKnown: 95,
    blurb: 'The giant: more than twice the mass of all the other planets put together.',
    stats: [
      ['Distance from Sun', '778.5 million km (5.20 AU)'],
      ['Year', '11.86 Earth years'],
      ['Day (one spin)', '9 h 56 m — the fastest of any planet'],
      ['Diameter', '139,820 km — 11 Earths across'],
      ['Cloud-top temperature', '−145 °C'],
      ['Moons', '95 confirmed']
    ],
    facts: [
      'Jupiter spins so fast that it bulges: it is about 7% wider across the equator than pole to pole.',
      'The Great Red Spot is a storm wider than Earth that has been raging for at least 190 years — though it has been shrinking.',
      'There is no surface to land on. The gas simply gets thicker until it becomes an ocean of liquid metallic hydrogen.',
      'Its gravity flings away or swallows many comets, acting a little like a shield for the inner planets.'
    ],
    moons: [
      {
        id: 'io', name: 'Io', color: '#e8d474', texture: 'io',
        radiusKm: 1821.6, aKm: 421700, periodDays: 1.769138,
        blurb: 'The most volcanically active world in the solar system.',
        facts: [
          'Io has over 400 active volcanoes, some throwing plumes 300 km into space.',
          'Jupiter\'s gravity kneads Io like dough, flexing its surface by up to 100 m and heating its insides.',
          'Its yellow-orange colours are sulfur and sulfur dioxide frost.'
        ]
      },
      {
        id: 'europa', name: 'Europa', color: '#dcc8ac', texture: 'europa',
        radiusKm: 1560.8, aKm: 671034, periodDays: 3.551181,
        blurb: 'A cracked shell of ice hiding a salty ocean — one of the best places to look for life.',
        facts: [
          'Under 15–25 km of ice there is probably a global ocean with more liquid water than all of Earth\'s oceans combined.',
          'Its surface is the smoothest of any solid body we know: fresh ice keeps resurfacing it.',
          'The dark streaks are cracks where the shell has pulled apart and refrozen.'
        ]
      },
      {
        id: 'ganymede', name: 'Ganymede', color: '#a89e94', texture: 'ganymede',
        radiusKm: 2634.1, aKm: 1070412, periodDays: 7.154553,
        blurb: 'The largest moon in the solar system — bigger than the planet Mercury.',
        facts: [
          'Ganymede is the only moon known to generate its own magnetic field.',
          'It has both dark, ancient cratered ground and lighter terrain carved into long grooves.',
          'It, too, likely holds a salty ocean sandwiched between layers of ice.'
        ]
      },
      {
        id: 'callisto', name: 'Callisto', color: '#8b8175', texture: 'callisto',
        radiusKm: 2410.3, aKm: 1882709, periodDays: 16.689017,
        blurb: 'The most heavily cratered object we know of — a 4-billion-year-old surface.',
        facts: [
          'Callisto has so many craters that new ones can only form on top of old ones.',
          'It orbits far enough out to escape the worst of Jupiter\'s radiation, which makes it a plausible future base.',
          'The huge Valhalla basin has rings spreading 1,900 km from its centre, like a frozen ripple.'
        ]
      }
    ]
  },
  {
    id: 'saturn',
    name: 'Saturn',
    symbol: '♄',
    color: '#e8d3a0',
    texture: 'saturn',
    radiusKm: 58232,
    rotationHours: 10.656,
    tilt: 26.73,
    moonsKnown: 274,
    ring: { inner: 1.24, outer: 2.27 },
    blurb: 'The ringed jewel — a planet so light it would float in a big enough bath.',
    stats: [
      ['Distance from Sun', '1.43 billion km (9.54 AU)'],
      ['Year', '29.4 Earth years'],
      ['Day (one spin)', '10 h 39 m'],
      ['Diameter', '116,460 km — 9 Earths across'],
      ['Cloud-top temperature', '−178 °C'],
      ['Moons', '274 confirmed — the most of any planet']
    ],
    facts: [
      'Saturn\'s average density is less than water\'s, so it really would float — if you could find an ocean big enough.',
      'The rings stretch 280,000 km across but are often only about 10 metres thick: a sheet of paper at that scale would be miles wide.',
      'They are made almost entirely of water ice, from dust grains to house-sized boulders, each on its own little orbit.',
      'A six-sided jet stream — the hexagon — circles the north pole, wide enough to swallow four Earths.'
    ],
    moons: [
      {
        id: 'mimas', name: 'Mimas', color: '#c9c4bb', texture: 'ice',
        radiusKm: 198.2, aKm: 185539, periodDays: 0.942422,
        blurb: 'The little moon with an enormous crater, often called the "Death Star moon".',
        facts: [
          'Herschel crater is 130 km wide — a third of the width of the whole moon.',
          'The impact that made it very nearly shattered Mimas; fractures show on the far side.'
        ]
      },
      {
        id: 'enceladus', name: 'Enceladus', color: '#f2f4f5', texture: 'ice',
        radiusKm: 252.1, aKm: 237948, periodDays: 1.370218,
        blurb: 'A tiny ice moon firing geysers of ocean water into space.',
        facts: [
          'Over 100 geysers erupt from "tiger stripe" cracks at the south pole, feeding Saturn\'s faint E ring.',
          'Cassini flew through the plumes and found salt, silica and organic molecules — signs of warm water meeting rock.',
          'It reflects almost all the sunlight that hits it, making it the most reflective body in the solar system.'
        ]
      },
      {
        id: 'tethys', name: 'Tethys', color: '#dcd8cf', texture: 'ice',
        radiusKm: 531.1, aKm: 294619, periodDays: 1.887802,
        blurb: 'An icy moon split by a canyon that runs three-quarters of the way around it.',
        facts: [
          'Ithaca Chasma is 2,000 km long and up to 5 km deep.',
          'Tethys is almost pure water ice, which is why it is so bright.'
        ]
      },
      {
        id: 'dione', name: 'Dione', color: '#d5d2c9', texture: 'ice',
        radiusKm: 561.4, aKm: 377396, periodDays: 2.736915,
        blurb: 'Streaked with bright ice cliffs that Voyager mistook for wispy clouds.',
        facts: [
          'The "wisps" are walls of fresh ice hundreds of metres high, formed as the crust cracked.',
          'Dione may hide a small internal ocean of its own.'
        ]
      },
      {
        id: 'rhea', name: 'Rhea', color: '#cfcbc2', texture: 'ice',
        radiusKm: 763.8, aKm: 527108, periodDays: 4.518212,
        blurb: 'Saturn\'s second-largest moon: a dirty snowball of ice and rock.',
        facts: [
          'Rhea is about three-quarters water ice by mass.',
          'It has a thin oxygen and carbon-dioxide atmosphere — far too thin to breathe, but real.'
        ]
      },
      {
        id: 'titan', name: 'Titan', color: '#e0a24e', texture: 'titan',
        radiusKm: 2574.7, aKm: 1221870, periodDays: 15.945421,
        blurb: 'The only moon with a thick atmosphere — and rivers, rain and seas of liquid methane.',
        facts: [
          'Titan\'s air is 1.5 times denser than Earth\'s at sea level, and mostly nitrogen, like ours.',
          'It rains methane, which carves river valleys and fills lakes near the poles — the only other place with liquid on its surface.',
          'In 2005 the Huygens probe landed here, the most distant landing ever made.',
          'Gravity is so low and the air so thick that a human with strapped-on wings could fly.'
        ]
      },
      {
        id: 'iapetus', name: 'Iapetus', color: '#b3a893', texture: 'iapetus',
        radiusKm: 734.5, aKm: 3560820, periodDays: 79.3215,
        blurb: 'Two-faced: one side is bright as snow, the other dark as coal.',
        facts: [
          'Dust from an outer moon coats its leading side, which then absorbs sunlight, warms up and loses its ice.',
          'A ridge of mountains up to 20 km high runs along its equator, giving it a walnut shape.'
        ]
      }
    ]
  },
  {
    id: 'uranus',
    name: 'Uranus',
    symbol: '♅',
    color: '#8fd8e0',
    texture: 'uranus',
    radiusKm: 25362,
    rotationHours: -17.24,
    tilt: 97.77,
    moonsKnown: 28,
    ring: { inner: 1.64, outer: 2.00, faint: true },
    blurb: 'The ice giant that orbits lying on its side.',
    stats: [
      ['Distance from Sun', '2.87 billion km (19.2 AU)'],
      ['Year', '84 Earth years'],
      ['Day (one spin)', '17 h 14 m — backwards'],
      ['Diameter', '50,724 km — 4 Earths across'],
      ['Cloud-top temperature', '−224 °C, the coldest measured anywhere'],
      ['Moons', '28 confirmed']
    ],
    facts: [
      'Uranus is tipped 98°, so it rolls around the Sun on its side — probably knocked over by a huge collision.',
      'That means each pole gets 42 years of continuous sunlight, then 42 years of darkness.',
      'It is the coldest planet, even though Neptune is further out, because it gives off almost no leftover heat of its own.',
      'The blue-green colour comes from methane in the upper atmosphere, which soaks up red light.',
      'It has 13 narrow, dark rings, discovered in 1977 when they blocked the light of a distant star.'
    ],
    moons: [
      {
        id: 'miranda', name: 'Miranda', color: '#c8ccd0', texture: 'ice',
        radiusKm: 235.8, aKm: 129900, periodDays: 1.413479,
        blurb: 'The strangest surface in the solar system — a moon that looks stitched together.',
        facts: [
          'Verona Rupes is a cliff up to 20 km high; a dropped stone would take about 12 minutes to reach the bottom.',
          'Its jumbled terrain suggests Miranda was smashed apart and reassembled, or churned by tidal heating.'
        ]
      },
      {
        id: 'ariel', name: 'Ariel', color: '#d2d6d8', texture: 'ice',
        radiusKm: 578.9, aKm: 190900, periodDays: 2.520379,
        blurb: 'The brightest of Uranus\'s moons, cut by deep rift valleys.',
        facts: [
          'Its valleys appear to have been flooded by icy "lava" — cryovolcanism.',
          'Ariel has fewer large craters than its neighbours, so its surface is comparatively young.'
        ]
      },
      {
        id: 'umbriel', name: 'Umbriel', color: '#8d8d90', texture: 'rock',
        radiusKm: 584.7, aKm: 266000, periodDays: 4.144177,
        blurb: 'The dark one: ancient, cratered and mysteriously dim.',
        facts: [
          'Umbriel reflects only about half as much light as Ariel, and nobody is sure why.',
          'A bright ring of frost nicknamed the "fluorescent cheerio" sits on its crater Wunda.'
        ]
      },
      {
        id: 'titania', name: 'Titania', color: '#c2b8ae', texture: 'ice',
        radiusKm: 788.4, aKm: 436300, periodDays: 8.705872,
        blurb: 'Uranus\'s largest moon, scarred by canyons 1,600 km long.',
        facts: [
          'Messina Chasma runs nearly from the equator to the south pole.',
          'It is about half ice and half rock, and may hold a thin liquid layer deep inside.'
        ]
      },
      {
        id: 'oberon', name: 'Oberon', color: '#b0a396', texture: 'rock',
        radiusKm: 761.4, aKm: 583500, periodDays: 13.463239,
        blurb: 'The outermost big moon, with a mountain 11 km tall poking off its limb.',
        facts: [
          'Its craters have dark floors, possibly material erupted from below.',
          'Oberon and Titania were both discovered by William Herschel in 1787.'
        ]
      }
    ]
  },
  {
    id: 'neptune',
    name: 'Neptune',
    symbol: '♆',
    color: '#5b7ce8',
    texture: 'neptune',
    radiusKm: 24622,
    rotationHours: 16.11,
    tilt: 28.32,
    moonsKnown: 16,
    blurb: 'The windiest world, found by mathematics before anyone saw it.',
    stats: [
      ['Distance from Sun', '4.5 billion km (30.1 AU)'],
      ['Year', '164.8 Earth years'],
      ['Day (one spin)', '16 h 7 m'],
      ['Diameter', '49,244 km'],
      ['Cloud-top temperature', '−214 °C'],
      ['Moons', '16 confirmed']
    ],
    facts: [
      'Winds reach 2,100 km/h — faster than the speed of sound on Earth and the fastest in the solar system.',
      'Neptune was predicted with pen and paper from wobbles in Uranus\'s orbit, then found in 1846 within a degree of where the maths said.',
      'It has only completed one orbit since its discovery: its first "birthday" came round in 2011.',
      'Voyager 2 saw a storm called the Great Dark Spot in 1989; by 1994 it had vanished, and new ones have appeared since.',
      'Neptune radiates more than twice the heat it receives from the Sun — something inside is still warm.'
    ],
    moons: [
      {
        id: 'proteus', name: 'Proteus', color: '#7f7d7a', texture: 'rock',
        radiusKm: 210, aKm: 117647, periodDays: 1.122315,
        blurb: 'A dark, boxy moon just about as big as a body can be without gravity rounding it off.',
        facts: [
          'Proteus is so dark it escaped detection until Voyager 2 flew past in 1989.',
          'It is not quite spherical — a lumpy 420 km across.'
        ]
      },
      {
        id: 'triton', name: 'Triton', color: '#d9c9c4', texture: 'triton',
        radiusKm: 1353.4, aKm: 354759, periodDays: 5.876854, retrograde: true,
        blurb: 'A captured world from the Kuiper Belt, orbiting backwards and spitting nitrogen geysers.',
        facts: [
          'Triton is the only large moon that orbits its planet backwards, which means Neptune caught it rather than growing it.',
          'At −235 °C it is one of the coldest places measured in the solar system.',
          'Geysers shoot nitrogen gas and dark dust 8 km up through its icy "cantaloupe" crust.',
          'Its backwards orbit is decaying: in a few billion years Neptune will tear it into a ring.'
        ]
      }
    ]
  }
];

export const ASTEROID_BELT = {
  id: 'asteroid-belt',
  name: 'Asteroid Belt',
  kind: 'belt',
  color: '#b59b7a',
  blurb: 'A sparse ring of rocky leftovers from the solar system\'s birth, orbiting between Mars and Jupiter.',
  stats: [
    ['Location', 'between Mars and Jupiter, 2.2–3.2 AU from the Sun'],
    ['Width', 'about 1 AU (roughly 150 million km) across'],
    ['Total mass', '~2.4×10²¹ kg — only about 3% of the Moon\'s mass'],
    ['Contains', 'over a million asteroids wider than 1 km, plus the dwarf planet Ceres'],
    ['Largest member', 'Ceres — 940 km across, about a third of the belt\'s total mass']
  ],
  facts: [
    'The belt formed from the same disc of dust and rock that built the planets, but Jupiter\'s huge gravity kept stirring these leftover chunks up before they could collide gently enough to stick together into a planet.',
    'It looks crowded in movies, but it is almost entirely empty space: the average distance between two sizeable asteroids is roughly a million kilometres, and every spacecraft sent through it has passed clean through without a planned dodge.',
    'Ceres, discovered in 1801, was the first asteroid found and is now classed as a dwarf planet — the only one in the inner solar system. It alone holds about a third of the belt\'s entire mass.',
    'Jupiter\'s gravity carves empty lanes called Kirkwood gaps at distances where an asteroid\'s orbit would repeat a simple fraction of Jupiter\'s own — 1:3, 2:5, 3:7 — resonances that shake those orbits unstable over millions of years.',
    'NASA\'s Dawn spacecraft orbited both Vesta (2011) and Ceres (2015), the first mission ever to orbit two different worlds beyond Earth.',
    'A handful of belt asteroids even have their own tiny moons.'
  ]
};

export const DWARF_PLANETS = [
  {
    id: 'pluto',
    name: 'Pluto',
    symbol: '♇',
    color: '#c9a888',
    texture: 'pluto',
    radiusKm: 1188.3,
    // Retrograde: obliquity past 90° already flips the visible spin, so this
    // stays positive (unlike Venus/Uranus's rotationHours — see SS-B2).
    rotationHours: 153.3,
    tilt: 122.5,
    blurb: 'The most famous dwarf planet — a small, icy, tilted world that spent 76 years classified as the ninth planet.',
    stats: [
      ['Type', 'Dwarf planet'],
      ['Distance from Sun', '5.9 billion km (39.5 AU) on average — 29.7 to 49.3 AU'],
      ['Year', '247.9 Earth years'],
      ['Day (one spin)', '6 days 9 hours — backwards'],
      ['Diameter', '2,377 km — smaller than our Moon'],
      ['Temperature', 'about −225 °C'],
      ['Moons', '5 — Charon, Styx, Nix, Kerberos, Hydra']
    ],
    facts: [
      'Pluto\'s orbit is tilted 17° from the plane the planets travel in, and stretched enough that it sometimes swings closer to the Sun than Neptune — it last did, between 1979 and 1999. That tilt and stretch are exactly why astronomers eventually decided it isn\'t a planet like the other eight.',
      'Charon, its largest moon, is so big — over half Pluto\'s width — that the two don\'t really orbit like a planet and its moon. They swing around a point in the empty space between them, more like a double world.',
      'NASA\'s New Horizons spacecraft flew past in July 2015 after a nine-year journey and found a heart-shaped glacier of nitrogen ice bigger than Texas, plus mountains of water ice as tall as the Rockies.',
      'It was discovered in 1930 by 24-year-old Clyde Tombaugh, comparing photographic plates by hand. A small pinch of his ashes now rides aboard New Horizons, heading out of the solar system.'
    ],
    moons: []
  },
  {
    id: 'ceres',
    name: 'Ceres',
    symbol: '⚳',
    color: '#a89e8f',
    texture: 'ceres',
    radiusKm: 469.7,
    rotationHours: 9.074,
    tilt: 4,
    blurb: 'The largest asteroid, and the only dwarf planet in the inner solar system — an icy rock hiding an ocean\'s worth of water.',
    stats: [
      ['Type', 'Dwarf planet'],
      ['Distance from Sun', '414 million km (2.77 AU) on average'],
      ['Year', '4.6 Earth years'],
      ['Day (one spin)', '9 h 4 m — one of the fastest of any round world'],
      ['Diameter', '940 km — about the size of Texas'],
      ['Temperature', 'about −105 °C'],
      ['Moons', 'none']
    ],
    facts: [
      'Ceres was the very first asteroid ever found, in 1801 — and for a few decades afterwards astronomers actually called it a planet.',
      'Almost a quarter of Ceres by mass may be water, some scientists think — more fresh water than exists on Earth, mostly frozen or trapped as briny sludge underground.',
      'The bright patches inside Occator crater are salt left behind after briny water bubbled up through cracks and evaporated into space — a sign Ceres may still be geologically active today.',
      'NASA\'s Dawn spacecraft settled into orbit around Ceres in 2015 — the first time a spacecraft had ever orbited a dwarf planet.'
    ],
    moons: []
  },
  {
    id: 'eris',
    name: 'Eris',
    color: '#e6e4de',
    texture: 'eris',
    radiusKm: 1163,
    rotationHours: 378.9,
    tilt: 0,          // pole direction isn't well constrained — left upright rather than guessed
    blurb: 'A distant, brilliant-white world out past Pluto whose discovery rewrote the definition of a planet.',
    stats: [
      ['Type', 'Dwarf planet'],
      ['Distance from Sun', '10.1 billion km (67.7 AU) on average — currently near its farthest point, about 95 AU out'],
      ['Year', '557 Earth years'],
      ['Day (one spin)', '15.8 Earth days'],
      ['Diameter', '2,326 km — almost exactly Pluto\'s size, but noticeably heavier'],
      ['Temperature', 'about −231 to −243 °C'],
      ['Moons', '1 — Dysnomia']
    ],
    facts: [
      'Eris is slightly smaller across than Pluto but about 27% heavier. Finding a world that rivalled Pluto out past Neptune is what forced astronomers to finally sit down and define what "planet" means — and Pluto lost.',
      'It\'s one of the most reflective large worlds known: its icy surface bounces back almost all the sunlight that reaches it, kept fresh by a paper-thin atmosphere of frozen methane and nitrogen that refreezes onto the ground each time Eris drifts further from the Sun.',
      'Its one moon, Dysnomia, is named for the Greek spirit of lawlessness — a nod to Eris, goddess of strife and discord, and to the "planet wars" this discovery touched off in 2005.',
      'Sunlight takes about 8 minutes to reach Earth. Out at Eris, right now, it takes more than 13 hours.'
    ],
    moons: []
  },
  {
    id: 'haumea',
    name: 'Haumea',
    color: '#dce6ea',
    texture: 'haumea',
    radiusKm: 780,
    rotationHours: 3.915,
    tilt: 0,          // pole direction isn't well constrained — left upright rather than guessed
    blurb: 'An egg-shaped dwarf planet spinning so fast it stretched itself out of shape — and grew a ring.',
    stats: [
      ['Type', 'Dwarf planet'],
      ['Distance from Sun', '6.5 billion km (43.2 AU) on average — 35 to 52 AU'],
      ['Year', '284 Earth years'],
      ['Day (one spin)', '3 h 55 m — the fastest spin of any large body in the solar system'],
      ['True shape', 'a stretched ellipsoid, roughly 2,100 × 1,680 × 1,070 km — drawn here as a sphere for scale'],
      ['Temperature', 'about −241 °C'],
      ['Moons', '2 — Hiʻiaka and Namaka — plus a ring']
    ],
    facts: [
      'Haumea spins once every 3 hours 55 minutes — faster than any other large body in the solar system — and that speed has stretched it into an elongated, egg-like shape, wider than it is tall.',
      'In 2017 astronomers watched Haumea pass in front of a distant star and, from the brief shadow it cast, discovered it has its own ring — only the second ring system ever found around anything smaller than a gas giant.',
      'Haumea and its two moons, Hiʻiaka and Namaka, are all named after a Hawaiian goddess of childbirth and her daughters, since the telescope that found them sits atop Mauna Kea.',
      'Its surface is coated in crystalline water ice, almost like fresh, glittering snow — usually a sign of ice that formed or was disturbed recently, since radiation slowly wrecks ice crystals over millions of years out in the Kuiper Belt.'
    ],
    moons: []
  },
  {
    id: 'makemake',
    name: 'Makemake',
    color: '#b8654a',
    texture: 'makemake',
    radiusKm: 715,
    rotationHours: 22.5,
    tilt: 0,          // pole direction isn't well constrained — left upright rather than guessed
    blurb: 'A reddish, frozen world named for a creation god, discovered just days after Easter.',
    stats: [
      ['Type', 'Dwarf planet'],
      ['Distance from Sun', '6.8 billion km (45.5 AU) on average — 38 to 53 AU'],
      ['Year', '306.7 Earth years'],
      ['Day (one spin)', '22.5 hours — close to Earth\'s'],
      ['Diameter', 'about 1,430 km'],
      ['Temperature', 'about −239 °C'],
      ['Moons', '1 — a small, dark moon nicknamed MK 2']
    ],
    facts: [
      'Makemake is coated in frozen methane and ethane, tinted reddish-brown by decades of sunlight cooking those ices into complex organic molecules called tholins — the same reddish "space tar" seen on Pluto and Neptune\'s moon Triton.',
      'It was discovered in March 2005, just days after Easter, and named after the creator of humanity in the mythology of Easter Island\'s Rapa Nui people.',
      'Unlike Pluto, Makemake seems to have essentially no atmosphere most of the time — any nitrogen or methane that briefly escapes when it\'s nearest the Sun quickly freezes back onto the surface as frost.',
      'Its one known moon is small, dark and hard to see — a 2015 Hubble image caught it almost lost in Makemake\'s glare, and it\'s still only nicknamed MK 2.'
    ],
    moons: []
  }
];

export const COMET = {
  id: 'halley',
  name: 'Halley\'s Comet',
  kind: 'comet',
  color: '#cfe3f5',
  texture: 'halley',
  radiusKm: 5,
  rotationHours: 52.8,      // real rotation is a slow, complex tumble — not quoted in the facts below
  tilt: 0,
  blurb: 'The most famous comet of all — a 15 km dirty snowball that swings past the Sun once in most human lifetimes.',
  stats: [
    ['Type', 'Comet (short-period, retrograde)'],
    ['Closest to Sun (perihelion)', '0.59 AU — inside Venus\'s orbit'],
    ['Farthest from Sun (aphelion)', '35.1 AU — beyond Neptune'],
    ['Orbital period', 'about 76 years'],
    ['Nucleus', 'roughly 15 × 8 × 8 km — a loosely packed "dirty snowball" of ice and dust'],
    ['Next visible from Earth', '28 July 2061']
  ],
  facts: [
    'Edmond Halley didn\'t discover the comet that bears his name. In 1705 he used Newton\'s brand-new laws of gravity to work out that comets seen in 1531, 1607 and 1682 were the same object, returning again and again, and predicted it would come back in 1758. He died 16 years before it did — he never found out he was right.',
    'It has been watched and recorded for over 2,000 years, including a famous appearance in the Bayeux Tapestry in 1066, stitched in as a bad omen right before the Battle of Hastings.',
    'In 1986, five spacecraft from four countries flew out to meet it — nicknamed the "Halley Armada" — and Europe\'s Giotto probe passed within 600 km of the nucleus, taking the first close-up photos ever of a comet\'s icy heart.',
    'Halley\'s comet orbits backwards compared with the planets, and its orbit is tilted 162° — tipped over so far it is nearly upside down.',
    'A comet\'s tail always points straight away from the Sun, not backwards along the way it came — pushed out by sunlight and the solar wind. That\'s why the tail swings around to lead the way as Halley rounds the Sun and heads back out again.',
    'It won\'t return until 28 July 2061 — anyone hoping to see it needs to be patient.'
  ],
  moons: []
};

/** Flat lookup: id → body record (planets and moons alike). */
export const BY_ID = (() => {
  const map = { sun: SUN, 'asteroid-belt': ASTEROID_BELT, halley: COMET };
  for (const p of [...PLANETS, ...DWARF_PLANETS]) {
    map[p.id] = p;
    for (const m of p.moons || []) { m.parent = p; map[m.id] = m; }
  }
  return map;
})();
