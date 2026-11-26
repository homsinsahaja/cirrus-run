// Cirrus Run — boot and the one loop: input every frame, the world
// advances in fixed 1/60 s steps, the renderer paints what is there.
// Screens: title, play, paused, landed (sortie complete) and crashed.
// ?seed=N fixes the world. ?shot=cover|ring|landing|vista stages that
// scene instead of running the loop, paints it and sets window.__shotReady.
import { createWorld, PHASE_TITLE, PHASE_FLYING, PHASE_PAUSED, PHASE_LANDED, PHASE_CRASHED, EV_RING, EV_LANDED, EV_CRASH, EV_HARD, EV_LOWFUEL, EV_FUELOUT } from './world.js';
import { createRenderer, CAM_CHASE } from './render.js';
import { createHud } from './hud.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_CAMERA, ACTION_MUTE } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { terrainHeight } from './terrain.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const BEST_KEY = 'cirrus-run-best';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(THREE, seed);
const { state } = world;
const renderer = createRenderer(THREE, canvas, seed);
const hud = createHud(THREE);
const input = createInput(canvas);
const audio = createAudio();
renderer.rebuildRings(state.rings);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best then lasts this visit only.
  }
}
let best = readBest();
hud.setTitleBest(best);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

function applyEvents(events) {
  for (const ev of events) {
    if (ev === EV_RING) audio.ring();
    else if (ev === EV_LANDED) audio.land();
    else if (ev === EV_HARD) audio.hard();
    else if (ev === EV_CRASH) audio.crash();
    else if (ev === EV_LOWFUEL || ev === EV_FUELOUT) audio.click();
  }
  if (events.includes(EV_LANDED)) {
    const detail = `Sortie ${state.sortie} complete — rings ${state.rings.length}/${state.rings.length} · fuel ${Math.round(state.fuel)}% · time ${Math.round(state.sortieTime)}s`;
    hud.setLanded(state.score, detail);
    hud.showScreen('landed');
    if (state.score > best) { best = state.score; saveBest(best); }
  }
  if (events.includes(EV_CRASH)) {
    hud.setOver(state.score, best, state.crashReason || 'Crashed');
    hud.showScreen('over');
    if (state.score > best) { best = state.score; saveBest(best); }
  }
}

function startGame() {
  audio.unlock();
  audio.click();
  world.resetAll();
  renderer.rebuildRings(state.rings);
  hud.hideScreens();
  status.textContent = 'Flying';
}

function nextSortie() {
  audio.unlock();
  audio.click();
  world.resetSortie(state.sortie + 1);
  renderer.rebuildRings(state.rings);
  hud.hideScreens();
  status.textContent = 'Flying';
}

// ---- Screenshot staging -------------------------------------------------
if (shot) {
  const staged = stageShot(shot, world);
  renderer.rebuildRings(state.rings);
  renderer.setCameraMode(CAM_CHASE);
  hud.hideScreens();
  let painted = 0;
  let t = 0;
  function paint() {
    // Frozen world: render only, camera snapped behind the aircraft.
    renderer.draw(state, 1 / 60, t, true);
    hud.update(state, renderer.camera, 1 / 60);
    t += 1 / 60;
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  if (staged) requestAnimationFrame(paint);
  else document.title = `Unknown shot: ${shot}`;
} else {
  // ---- Normal game loop ---------------------------------------------------
  let last = performance.now();
  let accumulator = 0;
  let simTime = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > MAX_FRAME) dt = MAX_FRAME;
    simTime += dt;

    const actions = input.takePressed();
    if (actions.has(ACTION_MUTE)) {
      const muted = audio.toggleMute();
      state.message = muted ? 'Sound off (M to turn on)' : 'Sound on';
      state.messageUntil = state.time + 2;
    }
    if (actions.has(ACTION_CAMERA)) {
      renderer.cycleCamera();
      audio.click();
    }

    if (state.phase === PHASE_TITLE) {
      if (actions.has(ACTION_CONFIRM)) startGame();
      hud.setVisible(false);
      renderer.drawOrbit(state, dt, simTime);
      hud.update(state, renderer.camera, dt);
      audio.setFlight(0, 0, false);
      return;
    }
    hud.setVisible(true);

    if (state.phase === PHASE_PAUSED) {
      if (actions.has(ACTION_PAUSE) || actions.has(ACTION_CONFIRM)) {
        state.phase = PHASE_FLYING;
        hud.hideScreens();
        audio.click();
      }
      hud.update(state, renderer.camera, dt);
      return;
    }

    if (state.phase === PHASE_LANDED) {
      if (actions.has(ACTION_CONFIRM)) nextSortie();
      renderer.draw(state, dt, simTime);
      hud.update(state, renderer.camera, dt);
      audio.setFlight(0, 0, false);
      return;
    }

    if (state.phase === PHASE_CRASHED) {
      if (actions.has(ACTION_CONFIRM)) startGame();
      // Keep the scene visible behind the game-over panel.
      renderer.draw(state, dt, simTime);
      hud.update(state, renderer.camera, dt);
      audio.setFlight(0, 0, false);
      return;
    }

    // Flying.
    if (actions.has(ACTION_PAUSE)) {
      state.phase = PHASE_PAUSED;
      hud.showScreen('pause');
      audio.click();
      return;
    }
    const stick = input.read();
    renderer.zoom(stick.wheel);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      const events = world.step(STEP, stick);
      applyEvents(events);
      accumulator -= STEP;
      steps += 1;
      if (state.phase !== PHASE_FLYING) {
        accumulator = 0;
        break;
      }
    }
    // Keep the aircraft from sinking below the terrain while parked.
    if (state.speed < 0.5 && state.phase === PHASE_FLYING) {
      const gh = terrainHeight(state.pos.x, state.pos.z);
      if (state.pos.y < gh + 1.4) state.pos.y = gh + 1.4;
    }
    renderer.draw(state, dt, simTime);
    hud.update(state, renderer.camera, dt);
    audio.setFlight(state.throttle, state.speed, state.phase === PHASE_FLYING && !state.engineOut);
  }
  requestAnimationFrame(frame);
}

// First gesture unlocks audio (autoplay policy).
window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
window.addEventListener('keydown', () => audio.unlock(), { once: true });
