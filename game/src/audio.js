// Sound: everything is synthesised with WebAudio — an engine hum tied to
// throttle, wind tied to speed, and short cues for rings, landings and
// crashes. No audio files. Starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 31;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  /** Continuous engine + wind, from throttle (0..1) and speed (m/s). */
  function setFlight(throttle, speed, running) {
    if (!started) return;
    const t = ctx.currentTime;
    const rpm = running ? 0.25 + throttle * 0.75 : 0;
    engineOsc.frequency.setTargetAtTime(58 + rpm * 105, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(29 + rpm * 52, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + rpm * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(running ? 0.05 + rpm * 0.075 : 0, t, 0.12);
    windFilter.frequency.setTargetAtTime(500 + speed * 14, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.0016), t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!started) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!started) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    unlock() { if (ensure()) resume(); },
    setFlight,
    ring() { blip(659, 0.16, 'sine', 0.22); blip(880, 0.28, 'sine', 0.22, 0.09); blip(1318, 0.3, 'sine', 0.12, 0.18); },
    land() { blip(82, 0.35, 'sine', 0.3); noiseBurst(0.18, 0.12, 500); },
    hard() { noiseBurst(0.25, 0.25, 900); blip(110, 0.3, 'sawtooth', 0.14); },
    crash() { noiseBurst(0.9, 0.5, 420); blip(55, 0.8, 'sine', 0.35); },
    click() { blip(520, 0.07, 'square', 0.08); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
