// Kestrel Run — tuning constants and the shared palette.
// One place for every number that shapes how the plane feels and how the
// golden-hour valley looks, so balance tweaks never touch game logic.
export const CFG = {
  // Canvas (fixed internal resolution; CSS scales it to the window).
  VIEW_W: 1280,
  VIEW_H: 720,
  // Pseudo-3D projection: focal length in pixels and the horizon line.
  FOCAL: 620,
  HORIZON_Y: 300,
  // World: one terrain segment is 100 m; the camera draws this far ahead.
  SEG_LEN: 100,
  DRAW_SEGMENTS: 55,
  GROUND_HALF: 340,
  // Flight model (metres, seconds, m/s).
  MAX_SPEED: 88, // ~171 kt at full throttle
  MIN_SPEED: 8, // taxi / idle roll
  STALL_SPEED: 26, // below this the nose drops and the stall horn sounds
  TAKEOFF_SPEED: 30,
  ACCEL: 7.0, // m/s^2 toward the throttle's target speed
  CLIMB_RATE: 9.0, // max vertical speed at full power
  DESCEND_RATE: 10.0,
  MAX_BANK_DEG: 52,
  BANK_RATE_DEG: 160, // how fast the wings roll into a turn
  FUEL_MAX: 100,
  FUEL_BURN_IDLE: 0.12, // per second at idle
  FUEL_BURN_FULL: 0.5, // extra per second at full throttle
  RING_RADIUS: 16,
  RUNWAY_HALF: 12,
  RUNWAY_LEN: 600,
  // Scoring.
  RING_POINTS: 100,
  LANDING_POINTS: 150,
  COMPLETE_BONUS: 500,
};

// Golden-hour palette: warm low sun, green-gold fields, cream-and-red plane.
export const PALETTE = {
  skyTop: "#2c4a78",
  skyMid: "#7d90b8",
  skyLow: "#f2b877",
  horizonGlow: "#ffd9a0",
  sun: "#ffdf9e",
  sunCore: "#fff6d8",
  mountainFar: "#6d7a9e",
  mountainNear: "#4d5d80",
  fieldA: "#5d7f3c",
  fieldB: "#6d9046",
  fieldC: "#9c8a4e",
  fieldD: "#7a9a52",
  river: "#3d6a8c",
  road: "#8a8378",
  runway: "#5a5a60",
  runwayMark: "#f4f1e6",
  ring: "#ffc93c",
  ringNext: "#ffd94d",
  ringDone: "#7ee081",
  planeCream: "#f2e7ce",
  planeRed: "#b3392e",
  planeDark: "#3a2e26",
  hudPanel: "rgba(16, 22, 34, 0.62)",
  hudText: "#f2ede0",
  hudAmber: "#ffbf47",
  hudCyan: "#7fd4ff",
  hudRed: "#ff5a4e",
  hudGreen: "#7ee081",
};
