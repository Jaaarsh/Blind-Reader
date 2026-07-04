// Non-speech audio cues + haptics. Blind users learn these tones quickly and
// they are much faster than words for signalling state changes.

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = AC ? new AC() : null;
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, startIn, duration, { type = 'sine', gain = 0.18 } = {}) {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t0 = ac.currentTime + startIn;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  amp.gain.linearRampToValueAtTime(0, t0 + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

/** Call from the first user gesture so iOS unlocks audio. */
export function unlockAudio() { audio(); }

export function readyChirp()  { tone(660, 0, 0.09); tone(990, 0.1, 0.12); }
export function shutter()     { tone(1400, 0, 0.05, { type: 'square', gain: 0.1 }); vibrate(40); }
export function successDing() { tone(880, 0, 0.1); tone(1320, 0.11, 0.16); vibrate([30, 40, 30]); }
export function errorBuzz()   { tone(220, 0, 0.22, { type: 'sawtooth', gain: 0.12 }); tone(180, 0.24, 0.28, { type: 'sawtooth', gain: 0.12 }); vibrate([80, 60, 80]); }
export function listenCue()   { tone(520, 0, 0.09); tone(780, 0.1, 0.09); vibrate(30); }

// A soft repeating tick while the AI is working, so the user knows the app
// hasn't died during the few seconds of silence.
let tickTimer = null;
export function startWorkingTicks() {
  stopWorkingTicks();
  tickTimer = setInterval(() => tone(740, 0, 0.045, { gain: 0.07 }), 1600);
}
export function stopWorkingTicks() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}
