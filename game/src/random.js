// Kestrel Run — deterministic random numbers.
// The valley, the rings and the scenery are all derived from a seed, so a
// screenshot pose (?seed=1) renders the exact same world every time and a
// player can replay the same course by sharing the seed.

// mulberry32: small, fast, good enough for terrain and decoration.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Stable 0..1 hash of one integer (segment index, tree slot, ...).
export function hash1(n, salt = 0) {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function deg2rad(d) {
  return (d * Math.PI) / 180;
}
