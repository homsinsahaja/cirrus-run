# Cirrus Run — Island Hopper

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/homsinsahaja/cirrus-run/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/homsinsahaja/cirrus-run/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

An entry in [make.fun's "Make the best flight game" bounty](https://make.fun/bounty/best-flight-game-20261126-0057) — a 3D bush-plane flight game in a golden-hour island archipelago, built with Three.js (vendored, no network). Fly the cream-and-red bush plane out of a
lagoon airfield, thread the glowing rings, watch the fuel, and put her down
soft on runway 09.

## How to play

Open `game/index.html` in a desktop browser (Chrome). No server needed, no
network requests — everything is local.

- **↑ / W** climb · **↓ / S** descend · **← → / A D** bank and turn
- **Shift** throttle up · **Ctrl** throttle down · **Space** airbrake
- **Mouse** steers gently · **Wheel** zooms the chase camera
- **Click / C** switches camera (chase / cockpit / far)
- **P** pause · **M** sound · **Enter** start / next sortie

## The sortie

Each sortie is a tour of the archipelago: fly through the rings in order
(each one is worth 100 points, more with a combo, and refuels +6), then land
on runway 09 for a landing bonus plus fuel and time bonuses. Fuel drains
with throttle, a stall below 26 m/s makes the wing drop, and a hard landing
damages the airframe — at 100% damage the sortie is over. Finish a sortie
and the next one generates a fresh ring course around the islands.

## What's inside

- `game/index.html` — canvas, HUD and screens
- `game/src/` — the game, plain ES modules:
  - `config.js` — world layout, runway, ring course, scoring
  - `terrain.js` — procedural islands, ocean and sky shaders, clouds, airfield, rings
  - `plane.js` — the bush plane model (primitives, spinning prop, nav lights)
  - `world.js` — flight model, rings, fuel/damage, scoring, sorties
  - `render.js` — Three.js scene, chase/cockpit/far cameras, blob shadow
  - `hud.js` — compass tape, attitude indicator, bars, messages, edge arrow
  - `input.js` — keyboard + mouse
  - `audio.js` — WebAudio synth engine, wind, chimes (no audio files)
  - `shots.js` — staged screenshot scenes (`?shot=cover|ring|landing|vista&seed=1`)
- `game/vendor/three.min.js` — Three.js 0.186.1 (MIT, see `three-LICENSE.txt`)
- `screenshots/` — four real renders from the running game (first is the cover)
- `main.ts` — copies `game/` and `screenshots/` to `/output` and writes
  `dossier.json` (run with `MAKEFUN_OUTPUT_DIR=<dir> node main.ts`)

## Screenshots

1. `1-cover.jpg` — chase view climbing out toward ring 1 over the lagoon
2. `2-ring.jpg` — banking through ring 2 over the green island
3. `3-landing.jpg` — final approach to runway 09, all rings clear
4. `4-vista.jpg` — high banking turn over the archipelago at sunset

All screenshots are 1280×720 JPEG, taken from the game running in headless
Chromium via `?shot=<name>&seed=1`, which stages the scene and sets
`window.__shotReady` once painted.

MIT licensed — see `LICENSE`.
