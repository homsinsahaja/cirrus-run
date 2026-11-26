// Cirrus Run — shared constants and the archipelago layout.
// Units are metres and seconds; the world is 4000 x 4000 m of ocean with islands.

export const WORLD = {
  size: 4000, // x and z span [-2000, 2000]
  waterLevel: 0,
  maxAltitude: 700,
  fogNear: 900,
  fogFar: 5200,
  sunDir: { x: -0.55, y: 0.42, z: -0.72 }, // low golden-hour sun (west-southwest)
  sunColor: 0xffe3b3,
  skyTop: 0x2f6fb8,
  skyHorizon: 0xf6c98a,
  seaDeep: 0x0d4d7a,
  seaShallow: 0x2a7f9e,
};

// Islands: centre, radius, peak height. The height function blends them.
export const ISLANDS = [
  { x: -600, z: -400, r: 950, h: 195 }, // main island (big mountain)
  { x: 800, z: 600, r: 520, h: 128 }, // green island
  { x: 1250, z: -950, r: 420, h: 96 }, // rocky island
  { x: -1450, z: 950, r: 470, h: 108 }, // forested island
  { x: 250, z: 1350, r: 340, h: 64 }, // low island
  { x: -1500, z: -1300, r: 260, h: 52 }, // islet
  { x: 1500, z: 1200, r: 230, h: 44 }, // islet
  { x: -300, z: 850, r: 300, h: 32 }, // airfield island (flat lagoon strip)
];

// The runway: a flattened shelf on the airfield island, heading east-west.
// It sits in open lagoon water, so both the takeoff and the final approach
// for runway 09 are over the sea — no mountain in the way.
export const RUNWAY = {
  x: -300,
  z: 850,
  elev: 28,
  headingDeg: 90, // runway 09 / 27
  length: 340,
  width: 26,
  flatten: 90, // metres of blend around the strip
};

// The aircraft (a small fixed-gear bush plane, ~7 m wingspan).
export const PLANE = {
  wingspan: 7.2,
  length: 5.4,
  stallSpeed: 26, // m/s; below this the wing stops flying and the nose drops
  minSpeed: 18,
  maxSpeed: 88,
  cruiseSpeed: 56,
  maxBank: 1.05, // rad (~60 deg)
  maxPitchUp: 0.42,
  maxPitchDown: 0.36,
  turnFactor: 0.52, // yaw rate per radian of bank
  pitchRate: 2.0,
  bankRate: 2.4,
  accelRate: 0.55,
  brakeFactor: 0.42,
  clearance: 1.4, // metres above terrain before contact counts
  fuelCapacity: 100,
  fuelDrainBase: 0.1, // per second
  fuelDrainThrottle: 0.45, // per second at full throttle
  fuelPerRing: 6,
  damageHardLanding: 30,
};

// Rings: radius of the torus the pilot must fly through.
export const RING = {
  radius: 16,
  tube: 1.1,
  // Sortie 1 course (hand-placed tour of the archipelago). Every ring was
  // checked against terrainHeight: each one clears the ground or sea below
  // by at least ~45 m. The last ring sits on the runway 09 extended
  // centreline, so it is also the final-approach fix.
  course1: [
    { x: 350, y: 95, z: 700 },
    { x: 800, y: 170, z: 520 },
    { x: 1250, y: 140, z: -720 },
    { x: 400, y: 85, z: -1250 },
    { x: -620, y: 240, z: -950 },
    { x: -900, y: 80, z: 850 },
  ],
};

// Scoring.
export const SCORE = {
  ring: 100,
  ringComboStep: 0.5, // each consecutive ring adds 50% of base
  landing: 500,
  fuelBonusPerUnit: 5,
  timeBonusPerSecond: 2,
};

// Colours.
export const COLORS = {
  sand: 0xd9c48a,
  grass: 0x5da24a,
  grassDark: 0x4a8a3e,
  forest: 0x3f7a37,
  rock: 0x8a7f74,
  snow: 0xf2f2ec,
  asphalt: 0x3a3d42,
  planeCream: 0xf2e8d5,
  planeRed: 0xd23c2e,
  planeDark: 0x2b2f36,
  ringNext: 0x37e6a8,
  ringDone: 0x5a7d6e,
  ringBeam: 0x37e6a8,
};
