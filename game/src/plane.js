// The aircraft: a small fixed-gear bush plane built from primitives.
// Forward is -Z in the plane's local space (Three.js convention for a
// model that flies toward -Z when its heading is 0).
import { COLORS } from './config.js';

export function buildPlane(THREE) {
  const g = new THREE.Group();
  g.name = 'plane';
  const cream = new THREE.MeshLambertMaterial({ color: COLORS.planeCream });
  const red = new THREE.MeshLambertMaterial({ color: COLORS.planeRed });
  const dark = new THREE.MeshLambertMaterial({ color: COLORS.planeDark });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1c2f45, shininess: 120, specular: 0x88bbdd });

  // Fuselage: nose cone + body + tail cone, all along Z.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.42, 3.4, 12), cream);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.2;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), cream);
  nose.scale.set(1, 1, 1.15);
  nose.position.z = -1.75;
  g.add(nose);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.1, 1.9, 10), cream);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = 2.85;
  g.add(tailCone);
  // Red cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.22, 3.0), red);
  stripe.position.set(0, 0.12, 0.1);
  g.add(stripe);

  // Canopy (cockpit glass).
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
  canopy.scale.set(1, 0.85, 1.5);
  canopy.position.set(0, 0.42, -0.75);
  g.add(canopy);

  // Main wing (low wing) with red tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.14, 1.5), cream);
  wing.position.set(0, -0.28, -0.35);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 1.5), red);
    tip.position.set(s * 3.35, -0.28, -0.35);
    g.add(tip);
  }
  // Tail: horizontal stabiliser + vertical fin.
  const hstab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 0.9), red);
  hstab.position.set(0, 0.12, 3.5);
  g.add(hstab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 1.0), red);
  fin.position.set(0, 0.55, 3.45);
  g.add(fin);

  // Propeller: spinner + two blades, spins around Z.
  const prop = new THREE.Group();
  prop.position.z = -2.35;
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 10), red);
  spinner.rotation.x = -Math.PI / 2;
  prop.add(spinner);
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.3, 0.08), bladeMat);
    blade.rotation.z = a;
    blade.position.z = -0.1;
    prop.add(blade);
  }
  g.add(prop);

  // Fixed landing gear: two main wheels + tail wheel.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.85, 0.09), dark);
    strut.position.set(s * 0.85, -0.75, -0.5);
    g.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 0.85, -1.15, -0.5);
    g.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.14, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.62, 3.3);
  g.add(tailWheel);

  // Navigation lights: red left, green right, white tail (blink in render).
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
  navL.position.set(-3.62, -0.28, -0.35);
  g.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2aff66 }));
  navR.position.set(3.62, -0.28, -0.35);
  g.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navT.position.set(0, 0.15, 3.85);
  navT.name = 'tailLight';
  g.add(navT);

  return { group: g, prop, navT };
}
