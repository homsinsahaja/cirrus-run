// The 3D scene: renderer, lights, terrain, ocean, sky, clouds, airfield,
// rings and the aircraft, plus the chase/cockpit camera rig.
import { WORLD, RUNWAY, RING } from './config.js';
import { buildTerrain, buildOcean, buildSky, buildClouds, buildAirfield, buildRing, terrainHeight } from './terrain.js';
import { buildPlane } from './plane.js';
import { createRandom, clamp, lerp } from './random.js';
import { PHASE_FLYING } from './world.js';

export const CAM_CHASE = 0;
export const CAM_COCKPIT = 1;
export const CAM_FAR = 2;

export function createRenderer(THREE, canvas, seed) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(WORLD.skyHorizon, WORLD.fogNear, WORLD.fogFar);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 20000);
  camera.position.set(0, 60, 120);

  // Lights: low warm sun + sky/ground hemisphere.
  const sun = new THREE.DirectionalLight(WORLD.sunColor, 2.0);
  sun.position.set(WORLD.sunDir.x * 1000, WORLD.sunDir.y * 1000, WORLD.sunDir.z * 1000);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9fc8e8, 0x6a7a52, 0.9));

  // World pieces.
  scene.add(buildSky(THREE));
  const ocean = buildOcean(THREE);
  scene.add(ocean);
  scene.add(buildTerrain(THREE));
  const clouds = buildClouds(THREE, createRandom(seed ^ 0x9e3779b9));
  scene.add(clouds.group);
  const airfield = buildAirfield(THREE);
  scene.add(airfield);
  const windsock = airfield.getObjectByName('windsock');

  // Aircraft.
  const plane = buildPlane(THREE);
  plane.group.rotation.order = 'YXZ';
  scene.add(plane.group);

  // Blob shadow under the aircraft.
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Rings (rebuilt per sortie).
  const ringGroup = new THREE.Group();
  ringGroup.name = 'rings';
  scene.add(ringGroup);
  let ringObjs = [];
  function rebuildRings(rings) {
    for (const r of ringObjs) ringGroup.remove(r.group);
    ringObjs = rings.map((r) => {
      const obj = buildRing(THREE, r.x, r.y, r.z, r.normal);
      ringGroup.add(obj.group);
      return obj;
    });
  }
  function updateRings(rings, ringIndex) {
    ringObjs.forEach((obj, i) => {
      if (i < ringIndex) obj.setDone();
      else obj.setNext(i === ringIndex);
    });
  }

  // Camera rig.
  let camMode = CAM_CHASE;
  let camDist = 15;
  let camHeight = 4.5;
  const camPos = new THREE.Vector3(0, 60, 120);
  const camTarget = new THREE.Vector3(0, 30, 0);
  let fov = 62;

  function resize(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  }

  const _fwd = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _desired = new THREE.Vector3();
  const _look = new THREE.Vector3();

  /** Sync the scene from the world state; dt seconds of animation.
   *  snap=true puts the camera straight behind the plane (screenshots). */
  function draw(state, dt, time, snap = false) {
    // Aircraft transform.
    plane.group.position.copy(state.pos);
    plane.group.rotation.set(state.pitch, -state.heading, -state.bank);
    // Propeller spin + nav light blink.
    const spin = 6 + state.throttle * 42 + state.speed * 0.35;
    plane.prop.rotation.z -= spin * dt;
    plane.navT.material.color.setHex((time % 1.4) < 0.18 ? 0xffffff : 0x332211);

    // Blob shadow: follows the ground below, fades and grows with height.
    const gh = terrainHeight(state.pos.x, state.pos.z);
    const alt = Math.max(0, state.pos.y - Math.max(gh, WORLD.waterLevel));
    blob.position.set(state.pos.x, Math.max(gh, WORLD.waterLevel) + 0.35, state.pos.z);
    const bs = clamp(1 + alt * 0.012, 1, 2.2);
    blob.scale.set(bs, bs, 1);
    blob.material.opacity = clamp(0.3 - alt * 0.00045, 0.05, 0.3);

    // Water + clouds + windsock + rings.
    ocean.material.uniforms.uTime.value = time;
    clouds.tick(dt);
    if (windsock) windsock.rotation.y = 0.6 + Math.sin(time * 0.23) * 0.35;
    for (const r of ringObjs) r.tick(dt, time);
    updateRings(state.rings, state.ringIndex);

    // Camera.
    const cp = Math.cos(state.pitch);
    _fwd.set(Math.sin(state.heading) * cp, Math.sin(state.pitch), -Math.cos(state.heading) * cp);
    if (camMode === CAM_COCKPIT) {
      _desired.copy(state.pos).addScaledVector(_fwd, 0.9);
      _desired.y += 0.55;
      camPos.lerp(_desired, 1 - Math.pow(0.0001, dt));
      _look.copy(state.pos).addScaledVector(_fwd, 60);
      _look.y += state.pitch * 18;
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(_look);
      camera.rotateZ(-state.bank * 0.55);
    } else {
      const dist = camMode === CAM_FAR ? camDist + 16 : camDist;
      const height = camMode === CAM_FAR ? camHeight + 5 : camHeight;
      _desired.copy(state.pos).addScaledVector(_fwd, -dist);
      _desired.y += height;
      const minY = terrainHeight(_desired.x, _desired.z) + 2.5;
      if (_desired.y < minY) _desired.y = minY;
      const k = snap ? 1 : 1 - Math.pow(0.00005, dt); // smooth follow
      camPos.lerp(_desired, k);
      _look.copy(state.pos).addScaledVector(_fwd, 14);
      _look.y += 1.2;
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(_look);
      camera.rotateZ(-state.bank * 0.28);
    }
    // Speed feel: widen the field of view as speed grows.
    const targetFov = 62 + clamp((state.speed - 30) * 0.22, 0, 11);
    if (Math.abs(targetFov - fov) > 0.05) {
      fov = lerp(fov, targetFov, Math.min(1, dt * 3));
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  /** Title-screen orbit: slow circle around the parked aircraft. */
  function drawOrbit(state, dt, time) {
    plane.group.position.copy(state.pos);
    plane.group.rotation.set(0, -state.heading, 0);
    plane.prop.rotation.z -= 2 * dt;
    ocean.material.uniforms.uTime.value = time;
    clouds.tick(dt);
    if (windsock) windsock.rotation.y = 0.6 + Math.sin(time * 0.23) * 0.35;
    const a = time * 0.11;
    camera.position.set(
      state.pos.x + Math.cos(a) * 34,
      state.pos.y + 13 + Math.sin(time * 0.21) * 1.5,
      state.pos.z + Math.sin(a) * 34,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(state.pos.x, state.pos.y + 1.2, state.pos.z);
    if (Math.abs(camera.fov - 55) > 0.1) {
      camera.fov = 55;
      camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
  }

  return {
    renderer, scene, camera, draw, drawOrbit, resize, rebuildRings,
    setCameraMode(m) { camMode = m; },
    getCameraMode() { return camMode; },
    cycleCamera() { camMode = (camMode + 1) % 3; return camMode; },
    zoom(delta) { camDist = clamp(camDist + delta * 0.01, 9, 26); },
  };
}
