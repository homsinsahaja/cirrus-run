// The archipelago: height function, terrain mesh, ocean, sky, clouds,
// runway and rings. All geometry is procedural; nothing is loaded.
import { WORLD, ISLANDS, RUNWAY, RING, COLORS } from './config.js';
import { fbm, smoothstep, clamp, lerp } from './random.js';

const NOISE_SEED = 1337;

/** Terrain height (metres) at (x, z). Below 0 is ocean floor. */
export function terrainHeight(x, z) {
  let h = -26; // ocean floor
  for (const isl of ISLANDS) {
    const dx = x - isl.x;
    const dz = z - isl.z;
    const d = Math.sqrt(dx * dx + dz * dz) / isl.r;
    if (d >= 1) continue;
    // Smooth island profile: flat-ish top, steep rim, beach at the edge.
    const profile = Math.pow(Math.cos(d * Math.PI * 0.5), 1.35);
    const detail = 1 + 0.22 * fbm(x * 0.004 + 7.3, z * 0.004 + 2.9, NOISE_SEED, 3);
    const ridge = 0.35 * Math.max(0, fbm(x * 0.006 + 40, z * 0.006 + 11, NOISE_SEED + 55, 3));
    h = Math.max(h, isl.h * profile * detail + isl.h * 0.22 * ridge * profile);
  }
  // Flatten a shelf for the runway on the main island.
  const rx = x - RUNWAY.x;
  const rz = z - RUNWAY.z;
  const halfL = RUNWAY.length / 2;
  const halfW = RUNWAY.width / 2;
  const dx = Math.max(Math.abs(rx) - halfL, 0);
  const dz = Math.max(Math.abs(rz) - halfW, 0);
  const outside = Math.sqrt(dx * dx + dz * dz);
  const flat = 1 - smoothstep(0, RUNWAY.flatten, outside);
  if (flat > 0) h = lerp(h, RUNWAY.elev, flat);
  return h;
}

/** Colour of terrain at height h with slope s (0 flat .. 1 vertical). */
function terrainColor(h, slope, out) {
  if (h < 2.5) return out.setHex(COLORS.sand);
  if (slope > 0.55) return out.setHex(COLORS.rock);
  if (h > 165) return out.setHex(COLORS.snow);
  if (h > 120) return out.setHex(COLORS.rock).lerp(new (out.constructor)(COLORS.snow), (h - 120) / 45 * 0.5);
  if (h > 55) return out.setHex(COLORS.forest);
  if (h > 18) return out.setHex(COLORS.grassDark);
  return out.setHex(COLORS.grass);
}

/** Build the terrain mesh (displaced plane, vertex colours). */
export function buildTerrain(THREE) {
  const size = WORLD.size;
  const seg = 176;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    // Slope from finite differences (cheap, good enough for colour).
    const hx = terrainHeight(x + 6, z) - terrainHeight(x - 6, z);
    const hz = terrainHeight(x, z + 6) - terrainHeight(x, z - 6);
    const slope = clamp(Math.sqrt(hx * hx + hz * hz) / 12, 0, 1);
    terrainColor(h, slope, c);
    // Subtle variation so the ground does not look flat-shaded.
    const v = 0.92 + 0.16 * fbm(x * 0.02, z * 0.02, NOISE_SEED + 9, 2);
    colors[i * 3] = c.r * v;
    colors[i * 3 + 1] = c.g * v;
    colors[i * 3 + 2] = c.b * v;
    void tmp;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

/** Ocean: a big plane with animated sine waves and a sun glint. */
export function buildOcean(THREE) {
  const geo = new THREE.PlaneGeometry(11000, 11000, 48, 48);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: false,
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(WORLD.sunDir.x, WORLD.sunDir.y, WORLD.sunDir.z).normalize() },
      uDeep: { value: new THREE.Color(WORLD.seaDeep) },
      uShallow: { value: new THREE.Color(WORLD.seaShallow) },
      uFogColor: { value: new THREE.Color(WORLD.skyHorizon) },
      uFogNear: { value: WORLD.fogNear },
      uFogFar: { value: WORLD.fogFar },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 p = position;
        float w = sin(p.x * 0.011 + uTime * 0.9) * 0.55
                + sin(p.z * 0.013 - uTime * 0.7) * 0.45
                + sin((p.x + p.z) * 0.006 + uTime * 0.5) * 0.6;
        p.y += w;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        // Analytic-ish normal from the same waves.
        float ex = cos(p.x * 0.011 + uTime * 0.9) * 0.55 * 0.011
                 + cos((p.x + p.z) * 0.006 + uTime * 0.5) * 0.6 * 0.006;
        float ez = cos(p.z * 0.013 - uTime * 0.7) * 0.45 * 0.013
                 + cos((p.x + p.z) * 0.006 + uTime * 0.5) * 0.6 * 0.006;
        vNormal = normalize(vec3(-ex * 8.0, 1.0, -ez * 8.0));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uSun;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 N = normalize(vNormal);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, fres * 0.85 + 0.08);
        // Sun glint.
        vec3 R = reflect(-uSun, N);
        float spec = pow(max(dot(R, V), 0.0), 90.0);
        col += vec3(1.0, 0.85, 0.6) * spec * 0.9;
        // Distance fog to the horizon colour.
        float d = distance(cameraPosition, vWorld);
        float f = smoothstep(uFogNear, uFogFar, d);
        col = mix(col, uFogColor, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WORLD.waterLevel;
  mesh.name = 'ocean';
  return mesh;
}

/** Sky dome: gradient zenith->horizon with a warm patch around the sun. */
export function buildSky(THREE) {
  const geo = new THREE.SphereGeometry(9000, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(WORLD.skyTop) },
      uHorizon: { value: new THREE.Color(WORLD.skyHorizon) },
      uSun: { value: new THREE.Vector3(WORLD.sunDir.x, WORLD.sunDir.y, WORLD.sunDir.z).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vDir), uSun), 0.0);
        col += vec3(1.0, 0.75, 0.45) * pow(s, 24.0) * 0.55; // warm glow
        col += vec3(1.0, 0.95, 0.8) * pow(s, 350.0) * 1.4;  // sun disc
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  return mesh;
}

/** Soft cloud sprite texture, drawn once on a canvas. */
function cloudTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  const blobs = [
    [70, 78, 52], [120, 66, 62], [175, 80, 50], [100, 88, 46], [150, 90, 42], [205, 88, 34],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.38)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A field of drifting cloud sprites. Returns { group, tick(dt) }. */
export function buildClouds(THREE, random) {
  const tex = cloudTexture(THREE);
  const group = new THREE.Group();
  group.name = 'clouds';
  const clouds = [];
  for (let i = 0; i < 46; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55 + random() * 0.35,
      depthWrite: false,
      fog: false,
    });
    const s = new THREE.Sprite(mat);
    const a = random() * Math.PI * 2;
    const r = 300 + random() * 3200;
    s.position.set(Math.cos(a) * r, 260 + random() * 420, Math.sin(a) * r);
    const w = 260 + random() * 420;
    s.scale.set(w, w * 0.42, 1);
    s.userData.drift = 1.5 + random() * 2.5;
    group.add(s);
    clouds.push(s);
  }
  return {
    group,
    tick(dt) {
      for (const s of clouds) {
        s.position.x += s.userData.drift * dt;
        if (s.position.x > 3600) s.position.x = -3600;
      }
    },
  };
}

/** Runway texture: asphalt with centreline, thresholds and numbers. */
function runwayTexture(THREE) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 96;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#33363b';
  ctx.fillRect(0, 0, 1024, 96);
  // Subtle asphalt noise.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 1024, Math.random() * 96, 2, 2);
  }
  // Edge lines.
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(0, 4, 1024, 3);
  ctx.fillRect(0, 89, 1024, 3);
  // Centreline dashes.
  for (let x = 20; x < 1024; x += 64) ctx.fillRect(x, 45, 34, 6);
  // Threshold bars at both ends.
  for (let x = 8; x < 90; x += 14) {
    ctx.fillRect(x, 18, 8, 60);
    ctx.fillRect(1024 - 8 - (x - 8) - 8, 18, 8, 60);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Runway strip, edge lights, windsock and hangars. Returns a group. */
export function buildAirfield(THREE) {
  const g = new THREE.Group();
  g.name = 'airfield';
  const elev = RUNWAY.elev;
  // Strip.
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.length, RUNWAY.width),
    new THREE.MeshLambertMaterial({ map: runwayTexture(THREE) }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(RUNWAY.x, elev + 0.25, RUNWAY.z);
  g.add(strip);
  // Edge lights (small emissive posts).
  const lightGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  for (const side of [-1, 1]) {
    for (let d = -RUNWAY.length / 2 + 10; d <= RUNWAY.length / 2 - 10; d += 34) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(RUNWAY.x + d, elev + 0.7, RUNWAY.z + side * (RUNWAY.width / 2 + 2));
      g.add(l);
    }
  }
  // Windsock: pole + orange cone, slowly turning in the wind.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 9, 8),
    new THREE.MeshLambertMaterial({ color: 0xd8d8d8 }),
  );
  pole.position.set(RUNWAY.x + 60, elev + 4.5, RUNWAY.z + RUNWAY.width / 2 + 14);
  g.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 4.2, 10, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xff7a1a, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(RUNWAY.x + 62.2, elev + 8.6, RUNWAY.z + RUNWAY.width / 2 + 14);
  sock.name = 'windsock';
  g.add(sock);
  // Two hangars and a fuel drum.
  const hangarMat = new THREE.MeshLambertMaterial({ color: 0x9aa5ad });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5d6b73 });
  for (const [hx, hz] of [[-40, 34], [8, 36]]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 16), hangarMat);
    box.position.set(RUNWAY.x + hx, elev + 4.5, RUNWAY.z + hz);
    g.add(box);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 26, 12, 1, false, 0, Math.PI), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(RUNWAY.x + hx, elev + 9, RUNWAY.z + hz);
    g.add(roof);
  }
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 2.2, 12),
    new THREE.MeshLambertMaterial({ color: 0xc23b2a }),
  );
  drum.position.set(RUNWAY.x + 44, elev + 1.1, RUNWAY.z + 30);
  g.add(drum);
  return g;
}

/** One glowing ring (torus + inner disc glow). Returns { group, setNext(bool) }. */
export function buildRing(THREE, x, y, z, normal) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(RING.radius, RING.tube, 12, 40),
    new THREE.MeshBasicMaterial({ color: COLORS.ringDone, transparent: true, opacity: 0.85 }),
  );
  group.add(torus);
  // Faint disc so the ring reads from the side too.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(RING.radius, 40),
    new THREE.MeshBasicMaterial({ color: COLORS.ringDone, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
  );
  group.add(disc);
  // Beam: a tall additive column marking the next ring from far away.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 500, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: COLORS.ringBeam, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 250;
  beam.name = 'beam';
  group.add(beam);
  // Face the ring along its normal.
  const n = normal.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  group.quaternion.copy(q);
  let pulse = 0;
  return {
    group,
    setNext(isNext) {
      torus.material.color.setHex(isNext ? COLORS.ringNext : COLORS.ringDone);
      disc.material.color.setHex(isNext ? COLORS.ringNext : COLORS.ringDone);
      beam.material.opacity = isNext ? 0.16 : 0;
      torus.material.opacity = isNext ? 1 : 0.7;
    },
    setDone() {
      torus.material.color.setHex(0x3fae7a);
      disc.material.color.setHex(0x3fae7a);
      beam.material.opacity = 0;
      torus.material.opacity = 0.45;
    },
    tick(dt, t) {
      pulse += dt;
      const s = 1 + Math.sin(pulse * 2.2) * 0.03;
      torus.scale.set(s, s, 1);
      void t;
    },
  };
}
