// Kestrel Run — the valley: terrain, rings, runways, scenery, projection.
// Everything is derived from the seed, so ?seed=1 always renders the same
// course. The ground is a strip of 100 m segments drawn far-to-near; the
// camera looks down the valley with a proper yaw projection, so turns feel
// like turns instead of slides.
import { CFG, PALETTE } from "./config.js";
import { hash1, mulberry32 } from "./random.js";

// The river meanders down the valley; its centre x at a given z.
export function riverX(z) {
  return 120 * Math.sin(z * 0.00012) + 46 * Math.sin(z * 0.000043 + 2.1);
}

export function buildWorld(seed, missionId) {
  const rng = mulberry32(seed * 7919 + 13);

  // Rings: a gentle slalom down the valley. Ring Run needs all ten;
  // Courier Dash has six time-bonus rings; Island Hop has four optional ones.
  const rings = [];
  const ringSpec =
    missionId === "ring-run"
      ? { n: 10, z0: 900, dz: 800, required: true }
      : missionId === "courier-dash"
        ? { n: 6, z0: 1500, dz: 1600, required: false }
        : { n: 4, z0: 1200, dz: 2100, required: false };
  for (let i = 0; i < ringSpec.n; i++) {
    const wobble = (hash1(seed + i * 31, 5) - 0.5) * 34;
    rings.push({
      x: 55 * Math.sin(i * 1.1) + wobble,
      y: 34 + 42 * (0.5 + 0.5 * Math.sin(i * 1.7 + 0.5)),
      z: ringSpec.z0 + i * ringSpec.dz,
      r: CFG.RING_RADIUS,
      required: ringSpec.required,
      passed: false,
      missed: false,
      passedAt: -1,
    });
  }

  // Runways: home strip at the start, then the mission's strips.
  const runways = [{ z0: 0, z1: CFG.RUNWAY_LEN, name: "HOME" }];
  if (missionId === "island-hop") {
    runways.push(
      { z0: 2500, z1: 3100, name: "STRIP 1" },
      { z0: 5500, z1: 6100, name: "STRIP 2" },
      { z0: 9000, z1: 9600, name: "STRIP 3" },
    );
  } else if (missionId === "courier-dash") {
    runways.push({ z0: 5200, z1: 5800, name: "REFUEL" });
  } else {
    runways.push({ z0: 4200, z1: 4800, name: "REFUEL" });
  }

  const beacon =
    missionId === "courier-dash" ? { x: 0, y: 0, z: 11000 } : null;

  // Clouds: fixed seeded puffs high over the valley.
  const clouds = [];
  for (let i = 0; i < 16; i++) {
    clouds.push({
      x: (rng() - 0.5) * 900,
      y: 170 + rng() * 170,
      z: 400 + rng() * 13500,
      s: 60 + rng() * 110,
    });
  }

  // Mountain ridges: two smooth silhouettes for the horizon, far and near.
  const ridge = (base, amp, step) => {
    const pts = [];
    let h = base;
    for (let x = -400; x <= 2200; x += step) {
      h += (rng() - 0.5) * amp;
      h = Math.max(base * 0.4, Math.min(base * 1.6, h));
      pts.push({ x, h });
    }
    return pts;
  };
  const ridgeFar = ridge(120, 70, 90);
  const ridgeNear = ridge(70, 46, 70);

  return { seed, rings, runways, beacon, clouds, ridgeFar, ridgeNear };
}

// Trees for one segment, derived from the segment index alone.
export function treesAt(seg) {
  const out = [];
  const r = hash1(seg, 11);
  if (r >= 0.62) return out;
  const n = 1 + Math.floor(hash1(seg, 12) * 2);
  for (let k = 0; k < n; k++) {
    const side = hash1(seg, 20 + k) < 0.5 ? -1 : 1;
    out.push({
      x: side * (30 + hash1(seg, 30 + k) * 150),
      z: seg * CFG.SEG_LEN + hash1(seg, 40 + k) * CFG.SEG_LEN,
      h: 9 + hash1(seg, 50 + k) * 9,
      pine: hash1(seg, 60 + k) < 0.55,
    });
  }
  return out;
}

// Houses cluster near runway ends.
export function housesAt(seg, world) {
  const out = [];
  for (const rw of world.runways) {
    const seg0 = Math.floor(rw.z0 / CFG.SEG_LEN) - 2;
    const seg1 = Math.floor(rw.z1 / CFG.SEG_LEN) + 2;
    if (seg >= seg0 && seg <= seg1 && hash1(seg, 71) < 0.5) {
      const side = hash1(seg, 72) < 0.5 ? -1 : 1;
      out.push({
        x: side * (34 + hash1(seg, 73) * 40),
        z: seg * CFG.SEG_LEN + hash1(seg, 74) * CFG.SEG_LEN,
        w: 10 + hash1(seg, 75) * 6,
        h: 6 + hash1(seg, 76) * 3,
        roof: hash1(seg, 77) < 0.5 ? "#a34a3a" : "#5d6b7a",
      });
    }
  }
  return out;
}

// Project a world point into screen space with yaw (heading).
// Never returns null: points behind the camera are clamped to the near
// plane and flagged `behind`, so ground quads still fill the screen while
// sprites and rings can choose to skip themselves.
export function project(cam, x, y, z) {
  const dx = x - cam.x;
  const dz = z - cam.z;
  const sin = Math.sin(cam.heading);
  const cos = Math.cos(cam.heading);
  const fwdRaw = dx * sin + dz * cos;
  const behind = fwdRaw < 2;
  const fwd = Math.max(fwdRaw, 2);
  const right = dx * cos - dz * sin;
  const s = CFG.FOCAL / fwd;
  return {
    sx: CFG.VIEW_W / 2 + right * s,
    sy: cam.horizonY - (y - cam.y) * s,
    s,
    fwd,
    behind,
  };
}

// Field colour variant for a segment index.
export function fieldColor(seg) {
  const h = hash1(seg, 3);
  if (h < 0.28) return PALETTE.fieldA;
  if (h < 0.52) return PALETTE.fieldB;
  if (h < 0.74) return PALETTE.fieldC;
  return PALETTE.fieldD;
}
