// Staged scenes for screenshots: each one puts the aircraft somewhere
// photogenic, aims it at the next objective and freezes the simulation
// (the render loop still animates water, clouds and the propeller).
// ?shot=cover|ring|landing|vista with &seed=N stages that scene and sets
// window.__shotReady once it has been painted.
import { RUNWAY } from './config.js';
import { clamp } from './random.js';

function headingTo(from, to) {
  return Math.atan2(to.x - from.x, -(to.z - from.z));
}
function pitchTo(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  return clamp(Math.atan2(to.y - from.y, dist), -0.3, 0.3);
}

const SHOTS = {
  // Hero: chase view, the aircraft climbing out over the lagoon toward
  // the first ring, airfield island behind, green island ahead.
  cover(state) {
    const ring = state.rings[0];
    state.pos.set(-100, 115, 830);
    state.heading = headingTo(state.pos, ring);
    state.pitch = pitchTo(state.pos, ring) + 0.04;
    state.bank = 0.1;
    state.speed = 56;
    state.throttle = 0.68;
    state.fuel = 82;
    state.score = 250;
    state.combo = 1;
    state.ringIndex = 0;
    state.sortieTime = 42;
  },
  // Through the gate: the aircraft 70 m out from ring 2, the ring big
  // in frame, green island and sea beyond.
  ring(state) {
    const ring = state.rings[1];
    const from = { x: 640, y: 175, z: 420 };
    state.pos.set(from.x, from.y, from.z);
    state.heading = headingTo(from, ring);
    state.pitch = pitchTo(from, ring);
    state.bank = -0.18;
    state.speed = 62;
    state.throttle = 0.75;
    state.fuel = 78;
    state.score = 480;
    state.combo = 2;
    state.ringIndex = 1;
    state.sortieTime = 95;
  },
  // Final approach: low over the sea toward runway 09, all rings done,
  // edge lights and hangars ahead, fuel low enough to matter.
  landing(state) {
    state.pos.set(-600, 55, 850);
    state.heading = Math.PI / 2; // east, down runway 09
    state.pitch = -0.07;
    state.bank = 0.02;
    state.speed = 39;
    state.throttle = 0.28;
    state.fuel = 34;
    state.score = 1250;
    state.combo = 6;
    state.ringIndex = state.rings.length;
    state.sortieTime = 210;
  },
  // High banking turn over the archipelago: islands, sea, clouds, sun.
  vista(state) {
    const ring = state.rings[2];
    state.pos.set(280, 335, 520);
    state.heading = headingTo(state.pos, ring);
    state.pitch = 0.02;
    state.bank = 0.38;
    state.speed = 64;
    state.throttle = 0.72;
    state.fuel = 71;
    state.score = 1420;
    state.combo = 3;
    state.ringIndex = 2;
    state.sortieTime = 150;
  },
};

export function stageShot(name, world) {
  const fn = SHOTS[name];
  if (!fn) return null;
  const { state } = world;
  state.phase = 'flying';
  state.damage = 0;
  state.engineOut = false;
  state.lowFuelWarned = false;
  state.verticalSpeed = 0;
  state.message = '';
  state.messageUntil = 0;
  fn(state);
  // Recompute vertical speed from the staged pitch/speed.
  state.verticalSpeed = Math.sin(state.pitch) * state.speed;
  return name;
}

export const SHOT_NAMES = Object.keys(SHOTS);
