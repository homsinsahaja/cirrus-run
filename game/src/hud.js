// The HUD: a DOM overlay with a compass tape, an attitude indicator,
// speed/altitude, throttle and fuel, the mission line and an edge arrow
// pointing at the next objective. Screens (title / pause / over / landed)
// are overlay divs in index.html, shown and hidden here.
import { RUNWAY, PLANE } from './config.js';
import { clamp } from './random.js';

const KT = 1.94384; // m/s -> knots
const M_TO_FT = 3.28084;

function headingDeg(heading) {
  let d = (heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}

function compassLabel(deg) {
  const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  if (deg % 90 === 0) return labels[Math.round(deg / 45) % 8];
  if (deg % 45 === 0) return labels[Math.round(deg / 45) % 8];
  return String(Math.round(deg / 10) * 10);
}

export function createHud(THREE) {
  const el = (id) => document.getElementById(id);
  const compass = el('compass');
  const compassCtx = compass.getContext('2d');
  const attitude = el('attitude');
  const attCtx = attitude.getContext('2d');
  const scoreEl = el('hud-score');
  const objEl = el('hud-objective');
  const sortieEl = el('hud-sortie');
  const spdEl = el('hud-speed');
  const altEl = el('hud-alt');
  const vsiEl = el('hud-vsi');
  const hdgEl = el('hud-hdg');
  const thrEl = el('hud-throttle');
  const fuelEl = el('hud-fuel');
  const fuelBar = el('hud-fuelbar');
  const dmgEl = el('hud-damage');
  const msgEl = el('hud-message');
  const arrowEl = el('hud-arrow');
  const warnEl = el('hud-warn');
  const statusEl = el('status');

  const screens = {
    title: el('screen-title'),
    pause: el('screen-pause'),
    over: el('screen-over'),
    landed: el('screen-landed'),
  };
  const overScore = el('over-score');
  const overBest = el('over-best');
  const overReason = el('over-reason');
  const landedScore = el('landed-score');
  const landedDetail = el('landed-detail');
  const titleBest = el('title-best');

  let lastMsg = '';

  function showScreen(name) {
    for (const [k, node] of Object.entries(screens)) {
      if (node) node.style.display = k === name ? 'flex' : 'none';
    }
  }
  function hideScreens() {
    for (const node of Object.values(screens)) if (node) node.style.display = 'none';
  }

  function drawCompass(heading) {
    const w = compass.width;
    const h = compass.height;
    const deg = headingDeg(heading);
    compassCtx.clearRect(0, 0, w, h);
    compassCtx.fillStyle = 'rgba(8, 14, 24, 0.55)';
    compassCtx.fillRect(0, 0, w, h);
    compassCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    compassCtx.strokeRect(0.5, 0.5, w - 1, h - 1);
    // 10 degrees per 18 px.
    const pxPerDeg = 1.8;
    const centre = w / 2;
    compassCtx.font = 'bold 13px system-ui, sans-serif';
    compassCtx.textAlign = 'center';
    compassCtx.textBaseline = 'middle';
    for (let d = Math.floor((deg - 100) / 10) * 10; d <= deg + 100; d += 10) {
      const dd = ((d % 360) + 360) % 360;
      const rel = ((dd - deg + 540) % 360) - 180;
      const px = centre + rel * pxPerDeg;
      if (px < -20 || px > w + 20) continue;
      const major = dd % 30 === 0;
      compassCtx.strokeStyle = 'rgba(255,255,255,0.85)';
      compassCtx.beginPath();
      compassCtx.moveTo(px, h - 6);
      compassCtx.lineTo(px, h - (major ? 16 : 11));
      compassCtx.stroke();
      if (major) {
        compassCtx.fillStyle = '#fff';
        compassCtx.fillText(compassLabel(dd), px, 13);
      }
    }
    // Centre caret + heading readout.
    compassCtx.fillStyle = '#37e6a8';
    compassCtx.beginPath();
    compassCtx.moveTo(centre - 7, 0);
    compassCtx.lineTo(centre + 7, 0);
    compassCtx.lineTo(centre, 9);
    compassCtx.closePath();
    compassCtx.fill();
    compassCtx.fillStyle = '#37e6a8';
    compassCtx.font = 'bold 15px system-ui, sans-serif';
    compassCtx.fillText(`${String(Math.round(deg)).padStart(3, '0')}°`, centre, h - 24);
  }

  function drawAttitude(pitch, bank) {
    const s = attitude.width;
    const c = s / 2;
    const r = c - 4;
    attCtx.clearRect(0, 0, s, s);
    attCtx.save();
    attCtx.beginPath();
    attCtx.arc(c, c, r, 0, Math.PI * 2);
    attCtx.clip();
    // Sky / ground, rotated by bank and shifted by pitch.
    attCtx.translate(c, c);
    attCtx.rotate(-bank);
    const py = clamp(pitch, -0.6, 0.6) * r * 1.6;
    attCtx.fillStyle = '#2f6fb8';
    attCtx.fillRect(-r - 2, -r - 2 - py, (r + 2) * 2, r + 2 + py);
    attCtx.fillStyle = '#7a5a34';
    attCtx.fillRect(-r - 2, py, (r + 2) * 2, r + 2 - py + 2);
    attCtx.strokeStyle = '#fff';
    attCtx.lineWidth = 2;
    attCtx.beginPath();
    attCtx.moveTo(-r - 2, py);
    attCtx.lineTo(r + 2, py);
    attCtx.stroke();
    attCtx.restore();
    // Fixed aircraft symbol + ring.
    attCtx.strokeStyle = 'rgba(255,255,255,0.9)';
    attCtx.lineWidth = 2;
    attCtx.beginPath();
    attCtx.arc(c, c, r, 0, Math.PI * 2);
    attCtx.stroke();
    attCtx.fillStyle = '#ffd23e';
    attCtx.beginPath();
    attCtx.moveTo(c - 16, c);
    attCtx.lineTo(c + 16, c);
    attCtx.lineTo(c + 16, c + 3);
    attCtx.lineTo(c - 16, c + 3);
    attCtx.closePath();
    attCtx.fill();
    attCtx.beginPath();
    attCtx.arc(c, c, 3.5, 0, Math.PI * 2);
    attCtx.fill();
  }

  const _v = new (THREE.Vector3)();
  const _target = new (THREE.Vector3)();

  /** Update every HUD element from the world state. */
  function update(state, camera, dt) {
    void dt;
    const deg = headingDeg(state.heading);
    drawCompass(state.heading);
    drawAttitude(state.pitch, state.bank);

    scoreEl.textContent = `SCORE ${state.score.toLocaleString('en-US')}`;
    sortieEl.textContent = `SORTIE ${state.sortie}`;
    const left = state.rings.length - state.ringIndex;
    objEl.textContent = left > 0
      ? `Fly through ring ${state.ringIndex + 1}/${state.rings.length}`
      : 'All rings clear — land on runway 09';
    spdEl.textContent = `${Math.round(state.speed * KT)}`;
    altEl.textContent = `${Math.round(state.pos.y)}`;
    const vs = state.verticalSpeed;
    vsiEl.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`;
    vsiEl.style.color = Math.abs(vs) < 0.5 ? '#cfe3ff' : vs > 0 ? '#7ee2a8' : '#ffb04a';
    hdgEl.textContent = `${String(Math.round(deg)).padStart(3, '0')}°`;

    thrEl.style.width = `${Math.round(state.throttle * 100)}%`;
    const fuelPct = Math.round(state.fuel);
    fuelBar.style.width = `${fuelPct}%`;
    fuelBar.style.background = fuelPct > 40 ? '#37e6a8' : fuelPct > 15 ? '#ffb04a' : '#ff5340';
    fuelEl.textContent = `FUEL ${fuelPct}%`;
    dmgEl.textContent = state.damage > 0 ? `DAMAGE ${Math.round(state.damage)}%` : '';
    dmgEl.style.display = state.damage > 0 ? 'block' : 'none';

    // Warnings (only while actually flying).
    let warn = '';
    if (state.phase === 'flying') {
      if (state.engineOut) warn = 'ENGINE OUT — GLIDE TO THE RUNWAY';
      else if (state.fuel < 20) warn = 'LOW FUEL';
      else if (state.speed < PLANE.stallSpeed && state.pos.y > 10) warn = 'STALL — NOSE DOWN, ADD POWER';
      else if (state.damage >= 60) warn = 'AIRFRAME CRITICAL';
    }
    warnEl.textContent = warn;
    warnEl.style.display = warn ? 'block' : 'none';

    // Flash message.
    const msg = state.time < state.messageUntil ? state.message : '';
    if (msg !== lastMsg) {
      msgEl.textContent = msg;
      msgEl.style.opacity = msg ? '1' : '0';
      lastMsg = msg;
    }

    // Edge arrow toward the next objective.
    const tgt = state.ringIndex < state.rings.length
      ? state.rings[state.ringIndex]
      : { x: RUNWAY.x, y: RUNWAY.elev + 4, z: RUNWAY.z };
    _target.set(tgt.x, tgt.y, tgt.z);
    _v.copy(_target).project(camera);
    const behind = _v.z > 1;
    let nx = _v.x;
    let ny = _v.y;
    if (behind) { nx = -nx; ny = -ny; }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 74;
    const sx = (nx * 0.5 + 0.5) * w;
    const sy = (-ny * 0.5 + 0.5) * h;
    const cx = w / 2;
    const cy = h / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const dist = Math.hypot(dx, dy);
    const onScreen = !behind && dist < Math.min(w, h) * 0.42 && _v.z < 1;
    if (onScreen || state.phase !== 'flying') {
      arrowEl.style.display = 'none';
    } else {
      const ang = Math.atan2(dy, dx);
      const ex = cx + Math.cos(ang) * (Math.min(w, h) / 2 - margin);
      const ey = cy + Math.sin(ang) * (Math.min(w, h) / 2 - margin);
      arrowEl.style.display = 'flex';
      arrowEl.style.left = `${ex}px`;
      arrowEl.style.top = `${ey}px`;
      arrowEl.style.transform = `translate(-50%, -50%) rotate(${ang * 180 / Math.PI + 90}deg)`;
      const d = Math.round(_target.distanceTo(state.pos));
      arrowEl.querySelector('.arrow-dist').textContent = `${d}m`;
    }

    statusEl.textContent = `Cirrus Run — alt ${Math.round(state.pos.y)} m · ${Math.round(state.speed * KT)} kt · hdg ${String(Math.round(deg)).padStart(3, '0')} · score ${state.score}`;
  }

  return {
    update, showScreen, hideScreens,
    setVisible(visible) {
      const hudEl = document.getElementById('hud');
      if (hudEl) hudEl.style.display = visible ? 'block' : 'none';
    },
    setTitleBest(best) { titleBest.textContent = best > 0 ? `Best score: ${best.toLocaleString('en-US')}` : 'No flights yet — be the first to land one.'; },
    setOver(score, best, reason) {
      overScore.textContent = `Score ${score.toLocaleString('en-US')}`;
      overBest.textContent = `Best ${best.toLocaleString('en-US')}`;
      overReason.textContent = reason;
    },
    setLanded(score, detail) {
      landedScore.textContent = `Score ${score.toLocaleString('en-US')}`;
      landedDetail.textContent = detail;
    },
  };
}
