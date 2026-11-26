// Keyboard + mouse input. Keys are the primary stick; the mouse steers
// gently toward the pointer (a virtual stick) and the wheel zooms the
// chase camera. Returns a fresh input object every frame.
import { clamp } from './random.js';

export const ACTION_CONFIRM = 'confirm';
export const ACTION_PAUSE = 'pause';
export const ACTION_CAMERA = 'camera';
export const ACTION_MUTE = 'mute';

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // edge-triggered, consumed by takePressed()
  let mouseX = 0; // -1..1 across the canvas
  let mouseY = 0;
  let mouseActive = false;
  let mouseMovedAt = 0;
  let wheelDelta = 0;
  let clicked = false;

  function code(e) {
    return e.code;
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(code(e));
    pressed.add(code(e));
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code(e))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(code(e)));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouseX = clamp(((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1, -1, 1);
    mouseY = clamp(((e.clientY - r.top) / Math.max(r.height, 1)) * 2 - 1, -1, 1);
    mouseActive = true;
    mouseMovedAt = performance.now();
  });
  canvas.addEventListener('pointerdown', () => { clicked = true; });
  canvas.addEventListener('wheel', (e) => {
    wheelDelta += e.deltaY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function has(...codes) {
    return codes.some((c) => keys.has(c));
  }

  /** One frame of stick input. */
  function read() {
    const now = performance.now();
    const mouseFresh = mouseActive && now - mouseMovedAt < 2500;
    let pitch = 0;
    let bank = 0;
    if (has('ArrowUp', 'KeyW')) pitch += 1;
    if (has('ArrowDown', 'KeyS')) pitch -= 1;
    if (has('ArrowLeft', 'KeyA')) bank -= 1;
    if (has('ArrowRight', 'KeyD')) bank += 1;
    // Mouse as a gentle virtual stick (dead zone in the middle).
    if (mouseFresh) {
      const dead = 0.12;
      const mx = Math.abs(mouseX) > dead ? (mouseX - Math.sign(mouseX) * dead) / (1 - dead) : 0;
      const my = Math.abs(mouseY) > dead ? (mouseY - Math.sign(mouseY) * dead) / (1 - dead) : 0;
      bank += clamp(mx * 0.85, -1, 1);
      pitch += clamp(-my * 0.7, -1, 1);
    }
    let throttle = 0;
    if (has('ShiftLeft', 'ShiftRight')) throttle += 1;
    if (has('ControlLeft', 'ControlRight')) throttle -= 1;
    const out = {
      pitch: clamp(pitch, -1, 1),
      bank: clamp(bank, -1, 1),
      throttle,
      brake: has('Space'),
      wheel: wheelDelta,
    };
    wheelDelta = 0;
    return out;
  }

  /** Consume edge-triggered actions pressed since the last call. */
  function takePressed() {
    const out = new Set();
    for (const c of pressed) {
      if (c === 'Enter' || c === 'NumpadEnter') out.add(ACTION_CONFIRM);
      if (c === 'KeyP' || c === 'Escape') out.add(ACTION_PAUSE);
      if (c === 'KeyC') out.add(ACTION_CAMERA);
      if (c === 'KeyM') out.add(ACTION_MUTE);
    }
    pressed.clear();
    if (clicked) {
      out.add(ACTION_CAMERA);
      clicked = false;
    }
    return out;
  }

  return { read, takePressed };
}
