// Kestrel Run — synthesized sound, no audio files.
// Engine drone, wind rush, ring chimes and impacts are all built from
// oscillators and filtered noise, so the game stays a zero-network,
// zero-asset download. Audio only starts after a user gesture.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    engineOsc1: null,
    engineOsc2: null,
    engineGain: null,
    engineFilter: null,
    windSource: null,
    windGain: null,
    windFilter: null,
    muted: false,
    stallBeeping: false,
    _stallTimer: null,
  };

  audio.ensure = function () {
    if (audio.ctx) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      const ctx = new AC();
      audio.ctx = ctx;
      audio.master = ctx.createGain();
      audio.master.gain.value = audio.muted ? 0 : 0.5;
      audio.master.connect(ctx.destination);

      // Engine: two detuned saws through a low-pass, pitch follows RPM.
      audio.engineOsc1 = ctx.createOscillator();
      audio.engineOsc1.type = "sawtooth";
      audio.engineOsc1.frequency.value = 52;
      audio.engineOsc2 = ctx.createOscillator();
      audio.engineOsc2.type = "square";
      audio.engineOsc2.frequency.value = 104;
      audio.engineFilter = ctx.createBiquadFilter();
      audio.engineFilter.type = "lowpass";
      audio.engineFilter.frequency.value = 420;
      audio.engineGain = ctx.createGain();
      audio.engineGain.gain.value = 0;
      audio.engineOsc1.connect(audio.engineFilter);
      audio.engineOsc2.connect(audio.engineFilter);
      audio.engineFilter.connect(audio.engineGain);
      audio.engineGain.connect(audio.master);
      audio.engineOsc1.start();
      audio.engineOsc2.start();

      // Wind: looped white noise through a band-pass, gain follows speed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      audio.windSource = ctx.createBufferSource();
      audio.windSource.buffer = buf;
      audio.windSource.loop = true;
      audio.windFilter = ctx.createBiquadFilter();
      audio.windFilter.type = "bandpass";
      audio.windFilter.frequency.value = 700;
      audio.windFilter.Q.value = 0.6;
      audio.windGain = ctx.createGain();
      audio.windGain.gain.value = 0;
      audio.windSource.connect(audio.windFilter);
      audio.windFilter.connect(audio.windGain);
      audio.windGain.connect(audio.master);
      audio.windSource.start();
      return true;
    } catch {
      return false;
    }
  };

  // Called every frame while flying: engine pitch from throttle, wind from speed.
  audio.setFlight = function (throttle, speed, flying) {
    if (!audio.ctx || audio.muted) return;
    const t = audio.ctx.currentTime;
    const rpm = 46 + throttle * 62;
    audio.engineOsc1.frequency.setTargetAtTime(rpm, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(rpm * 2.02, t, 0.08);
    audio.engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
    audio.engineGain.gain.setTargetAtTime(flying ? 0.05 + throttle * 0.075 : 0, t, 0.1);
    const wind = Math.max(0, speed - 12) / 76;
    audio.windGain.gain.setTargetAtTime(flying ? wind * 0.12 : 0, t, 0.15);
    audio.windFilter.frequency.setTargetAtTime(500 + speed * 14, t, 0.15);
  };

  audio._tone = function (freq, at, dur, type, vol) {
    if (!audio.ctx) return;
    const t0 = audio.ctx.currentTime + at;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(audio.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  };

  // Three-note chime when a ring is flown.
  audio.ring = function () {
    if (!audio.ctx || audio.muted) return;
    audio.ensure();
    audio._tone(880, 0, 0.35, "sine", 0.22);
    audio._tone(1318, 0.07, 0.35, "sine", 0.18);
    audio._tone(1760, 0.14, 0.5, "sine", 0.16);
  };

  // Soft thud on a good touchdown.
  audio.thud = function () {
    if (!audio.ctx || audio.muted) return;
    audio.ensure();
    audio._tone(70, 0, 0.25, "sine", 0.4);
    audio._tone(140, 0, 0.12, "triangle", 0.2);
  };

  // Noise burst + low boom on a crash.
  audio.crash = function () {
    if (!audio.ctx || audio.muted) return;
    audio.ensure();
    const ctx = audio.ctx;
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f);
    f.connect(g);
    g.connect(audio.master);
    src.start();
    audio._tone(55, 0, 0.6, "sine", 0.45);
  };

  audio.click = function () {
    if (!audio.ctx || audio.muted) return;
    audio.ensure();
    audio._tone(660, 0, 0.08, "square", 0.08);
  };

  // Short stall warning beeps while the stall flag is on.
  audio.stallBeep = function (on) {
    if (!audio.ctx || on === audio.stallBeeping) return;
    audio.stallBeeping = on;
    if (on) {
      audio._stallTimer = setInterval(() => {
        if (!audio.muted) audio._tone(440, 0, 0.12, "square", 0.1);
      }, 350);
    } else if (audio._stallTimer) {
      clearInterval(audio._stallTimer);
      audio._stallTimer = null;
    }
  };

  audio.setMuted = function (m) {
    audio.muted = m;
    if (audio.master && audio.ctx) {
      audio.master.gain.setTargetAtTime(m ? 0 : 0.5, audio.ctx.currentTime, 0.05);
    }
    if (m) audio.stallBeep(false);
  };

  return audio;
}
