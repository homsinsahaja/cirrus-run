// Cirrus Run — game rules and state. No drawing and no browser in here:
// the flight model, rings, fuel, damage, scoring and sorties. step()
// advances one fixed step and returns events for the caller to react to.
import { WORLD, ISLANDS, RUNWAY, PLANE, RING, SCORE } from './config.js';
import { terrainHeight } from './terrain.js';
import { createRandom, clamp, lerp } from './random.js';

export const PHASE_TITLE = 'title';
export const PHASE_FLYING = 'flying';
export const PHASE_PAUSED = 'paused';
export const PHASE_LANDED = 'landed';
export const PHASE_CRASHED = 'crashed';

export const EV_RING = 'ring';
export const EV_LANDED = 'landed';
export const EV_CRASH = 'crash';
export const EV_HARD = 'hard';
export const EV_LOWFUEL = 'lowfuel';
export const EV_FUELOUT = 'fuelout';
export const EV_SORTIE = 'sortie';

const LAND_MAX_VS = 4.5; // m/s sink allowed for a gentle landing
const LAND_HARD_VS = 8; // m/s sink: above this on the runway is a crash
const LAND_MAX_SPEED = 48; // m/s on touchdown
const LAND_HARD_SPEED = 62;

function ringNormal(from, to, THREE) {
  const n = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
  if (n.lengthSq() < 1) n.set(0, 0, 1);
  return n.normalize();
}

/** A ring course for a sortie: hand-placed for sortie 1, generated after. */
function makeCourse(sortie, random, THREE) {
  const count = Math.min(5 + sortie, 10);
  if (sortie === 1) {
    const pts = RING.course1;
    return pts.map((p, i) => {
      const from = i === 0 ? { x: RUNWAY.x, y: RUNWAY.elev + 30, z: RUNWAY.z } : pts[i - 1];
      return { x: p.x, y: p.y, z: p.z, normal: ringNormal(from, p, THREE), passed: false };
    });
  }
  // Generated course: hop between islands at varied altitudes.
  const pts = [];
  let px = RUNWAY.x;
  let py = RUNWAY.elev + 40;
  let pz = RUNWAY.z;
  for (let i = 0; i < count; i++) {
    const isl = ISLANDS[Math.floor(random() * ISLANDS.length)];
    const a = random() * Math.PI * 2;
    const r = isl.r * (0.35 + random() * 0.8);
    const x = clamp(isl.x + Math.cos(a) * r, -1900, 1900);
    const z = clamp(isl.z + Math.sin(a) * r, -1900, 1900);
    const y = clamp(55 + random() * 190, 50, 300);
    pts.push({ x, y, z });
    px = x; py = y; pz = z;
  }
  return pts.map((p, i) => {
    const from = i === 0 ? { x: RUNWAY.x, y: RUNWAY.elev + 30, z: RUNWAY.z } : pts[i - 1];
    return { x: p.x, y: p.y, z: p.z, normal: ringNormal(from, p, THREE), passed: false };
  });
}

function onRunway(x, z) {
  // Runway is axis-aligned (heading 90 deg = along X).
  return Math.abs(x - RUNWAY.x) <= RUNWAY.length / 2 && Math.abs(z - RUNWAY.z) <= RUNWAY.width / 2;
}

export function createWorld(THREE, seed) {
  const random = createRandom(seed);
  const state = {
    phase: PHASE_TITLE,
    pos: new THREE.Vector3(RUNWAY.x - RUNWAY.length / 2 + 20, RUNWAY.elev + 1.4, RUNWAY.z),
    heading: Math.PI / 2, // east, down runway 09
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    score: 0,
    combo: 0,
    sortie: 1,
    rings: [],
    ringIndex: 0,
    time: 0,
    sortieTime: 0,
    landedAt: 0,
    crashReason: '',
    message: '',
    messageUntil: 0,
    lowFuelWarned: false,
    engineOut: false,
    verticalSpeed: 0,
    groundSpeed: 0,
    grounded: true, // on the runway; the ground holds the plane up
  };
  state.rings = makeCourse(1, random, THREE);

  function resetSortie(sortie) {
    state.sortie = sortie;
    state.rings = makeCourse(sortie, random, THREE);
    state.ringIndex = 0;
    state.combo = 0;
    state.fuel = PLANE.fuelCapacity;
    state.damage = 0;
    state.sortieTime = 0;
    state.lowFuelWarned = false;
    state.engineOut = false;
    // Start at the west threshold so the whole strip is ahead.
    state.pos.set(RUNWAY.x - RUNWAY.length / 2 + 20, RUNWAY.elev + 1.4, RUNWAY.z);
    state.heading = Math.PI / 2;
    state.pitch = 0;
    state.bank = 0;
    state.speed = 0;
    state.throttle = 0;
    state.grounded = true;
    state.message = sortie === 1 ? 'Take off — fly through the rings, then land on runway 09' : `Sortie ${sortie} — ${state.rings.length} rings, then land`;
    state.messageUntil = state.time + 5;
  }

  function resetAll() {
    state.score = 0;
    state.time = 0;
    resetSortie(1);
    state.phase = PHASE_FLYING;
  }

  function setMessage(text, seconds = 3) {
    state.message = text;
    state.messageUntil = state.time + seconds;
  }

  /** Advance one fixed step. input: { pitch, bank, throttle, brake }. */
  function step(dt, input) {
    const events = [];
    if (state.phase !== PHASE_FLYING) return events;
    state.time += dt;
    state.sortieTime += dt;

    // Throttle (Shift/Ctrl), clamped; engine out forces idle.
    if (!state.engineOut) {
      state.throttle = clamp(state.throttle + input.throttle * dt * 0.55, 0, 1);
    } else {
      state.throttle = Math.max(0, state.throttle - dt * 0.5);
    }
    // Fuel burn; empty tank kills the engine.
    const burn = (PLANE.fuelDrainBase + PLANE.fuelDrainThrottle * state.throttle) * dt;
    state.fuel = Math.max(0, state.fuel - burn);
    if (state.fuel <= 0 && !state.engineOut) {
      state.engineOut = true;
      events.push(EV_FUELOUT);
      setMessage('FUEL EMPTY — engine out! Glide to the runway', 4);
    }
    if (state.fuel < 20 && !state.lowFuelWarned && !state.engineOut) {
      state.lowFuelWarned = true;
      events.push(EV_LOWFUEL);
      setMessage('LOW FUEL — find the runway soon', 4);
    }

    // Speed toward the throttle's target; brake drags hard.
    let target = PLANE.minSpeed + state.throttle * (PLANE.maxSpeed - PLANE.minSpeed);
    if (input.brake) target *= PLANE.brakeFactor;
    const rate = target > state.speed ? PLANE.accelRate : PLANE.accelRate * 1.6;
    state.speed += clamp(target - state.speed, -rate * dt * 10, rate * dt * 10);
    state.speed = clamp(state.speed, 0, PLANE.maxSpeed);

    // Bank and pitch ease toward the stick.
    const stalled = state.speed < PLANE.stallSpeed;
    const authority = stalled ? 0.45 : 1;
    const targetBank = clamp(input.bank, -1, 1) * PLANE.maxBank;
    const targetPitch = clamp(input.pitch, -1, 1) * (input.pitch >= 0 ? PLANE.maxPitchUp : PLANE.maxPitchDown);
    state.bank += clamp(targetBank - state.bank, -PLANE.bankRate * dt, PLANE.bankRate * dt);
    state.pitch += clamp(targetPitch * authority - state.pitch, -PLANE.pitchRate * dt, PLANE.pitchRate * dt);

    // Coordinated turn: bank turns the nose.
    if (state.speed > 4) {
      state.heading += state.bank * PLANE.turnFactor * dt * clamp(state.speed / 40, 0.35, 1);
    }

    // Move along the nose.
    const prev = state.pos.clone();
    const cp = Math.cos(state.pitch);
    const fwd = new THREE.Vector3(
      Math.sin(state.heading) * cp,
      Math.sin(state.pitch),
      -Math.cos(state.heading) * cp,
    );
    state.pos.addScaledVector(fwd, state.speed * dt);
    // Sink when stalled — but only once airborne. On the ground the
    // runway holds the plane up, so a standing start never "crashes".
    let sink = 0;
    if (!state.grounded && stalled) {
      sink = (PLANE.stallSpeed - state.speed) * 0.55;
      state.pos.y -= sink * dt;
    }
    state.verticalSpeed = fwd.y * state.speed - sink;
    state.groundSpeed = state.speed * cp;

    // Ring crossings (segment from prev to pos through the ring plane).
    if (state.ringIndex < state.rings.length) {
      const ring = state.rings[state.ringIndex];
      const c = new THREE.Vector3(ring.x, ring.y, ring.z);
      const d0 = prev.clone().sub(c).dot(ring.normal);
      const d1 = state.pos.clone().sub(c).dot(ring.normal);
      if ((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0)) {
        const t = Math.abs(d0) / (Math.abs(d0) + Math.abs(d1) + 1e-9);
        const cross = prev.clone().lerp(state.pos, t);
        if (cross.distanceTo(c) < RING.radius) {
          ring.passed = true;
          state.ringIndex += 1;
          const pts = Math.round(SCORE.ring * (1 + SCORE.ringComboStep * Math.min(state.combo, 6)));
          state.score += pts;
          state.combo += 1;
          state.fuel = Math.min(PLANE.fuelCapacity, state.fuel + PLANE.fuelPerRing);
          events.push(EV_RING);
          setMessage(state.ringIndex >= state.rings.length
            ? `All rings clear! Land on runway 09 (+${pts})`
            : `Ring ${state.ringIndex}/${state.rings.length}  +${pts}  (fuel +${PLANE.fuelPerRing})`, 2.5);
        }
      }
    }

    // Ground / water contact.
    const gh = terrainHeight(state.pos.x, state.pos.z);
    // wasAirborne gates the landing/crash checks: the step the plane
    // lifts off (or rolls off the island) must not count as a touchdown.
    const wasAirborne = !state.grounded;
    if (state.grounded) {
      if (gh <= WORLD.waterLevel) {
        // Rolled off the island into the sea: nothing left to roll on.
        state.grounded = false;
      } else {
        // Rolling on the ground: stay on it, no sink, no crash.
        state.pos.y = gh + PLANE.clearance;
        state.verticalSpeed = 0;
        // Lift off once fast enough with the nose up.
        if (state.speed > PLANE.stallSpeed && state.pitch > 0.02) {
          state.grounded = false;
        }
      }
    }
    if (wasAirborne && gh <= WORLD.waterLevel) {
      // Over open water the surface is the water itself, not the ocean
      // floor: touch it and the sortie is over.
      if (state.pos.y <= WORLD.waterLevel + 0.4) {
        state.crashReason = 'Ditched in the sea';
        state.phase = PHASE_CRASHED;
        events.push(EV_CRASH);
        return events;
      }
    }
    if (wasAirborne && gh > WORLD.waterLevel && state.pos.y <= gh + PLANE.clearance) {
      const vs = state.verticalSpeed;
      const onRw = onRunway(state.pos.x, state.pos.z);
      const gentle = Math.abs(vs) <= LAND_MAX_VS && state.speed <= LAND_MAX_SPEED;
      if (onRw && gentle) {
        // Landed.
        state.pos.y = gh + PLANE.clearance;
        state.speed = 0;
        state.phase = PHASE_LANDED;
        state.landedAt = state.time;
        const fuelBonus = Math.round(state.fuel * SCORE.fuelBonusPerUnit);
        const timeBonus = Math.max(0, Math.round((240 - state.sortieTime) * SCORE.timeBonusPerSecond));
        const gained = SCORE.landing + fuelBonus + timeBonus;
        state.score += gained;
        events.push(EV_LANDED);
        setMessage(`Landed! +${SCORE.landing} + fuel ${fuelBonus} + time ${timeBonus}`, 5);
      } else if (onRw && Math.abs(vs) <= LAND_HARD_VS && state.speed <= LAND_HARD_SPEED) {
        // Hard landing: damage and a bounce.
        state.damage += PLANE.damageHardLanding;
        state.pos.y = gh + PLANE.clearance + 3;
        state.pitch = 0.08;
        state.speed *= 0.62;
        events.push(EV_HARD);
        setMessage(`Hard landing! Airframe damage ${Math.round(state.damage)}%`, 3);
        if (state.damage >= 100) {
          state.crashReason = 'Airframe failed after a hard landing';
          state.phase = PHASE_CRASHED;
          events.push(EV_CRASH);
        }
      } else {
        state.crashReason = onRw ? 'Crashed on the runway' : 'Crashed into terrain';
        state.phase = PHASE_CRASHED;
        events.push(EV_CRASH);
        return events;
      }
    }

    // Soft ceiling and soft boundary.
    if (state.pos.y > WORLD.maxAltitude) {
      state.pos.y = WORLD.maxAltitude;
      state.pitch = Math.min(state.pitch, 0);
    }
    const far = Math.max(Math.abs(state.pos.x), Math.abs(state.pos.z));
    if (far > 2300 && state.time - (state._boundWarn || 0) > 6) {
      state._boundWarn = state.time;
      setMessage('You are leaving the archipelago — turn back', 3);
    }
    return events;
  }

  return { state, resetAll, resetSortie, step, setMessage, onRunway };
}
