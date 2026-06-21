/**
 * sound.js — synthesized sound effects via the Web Audio API. No audio files:
 * every effect is generated from oscillators / filtered noise, so it stays tiny
 * and fully offline. Real recordings could be dropped in behind this same `sound`
 * map later.
 *
 * iOS/Chrome require audio to start from a user gesture, so the AudioContext is
 * created and resumed lazily via unlockAudio() (call it on the first tap).
 */

let ctx = null;
let muted = false;

export function setMuted(value) {
  muted = !!value;
}

export function isMuted() {
  return muted;
}

/** Create/resume the AudioContext from within a user gesture (iOS-safe). */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tone({ freq, type = 'sine', dur = 0.12, gain = 0.16, slideTo, delay = 0 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function noise({ dur = 0.09, gain = 0.16, filterFreq = 2200 }) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n); // decaying
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(lp).connect(g).connect(ctx.destination);
  src.start(t);
}

export const sound = {
  deal: () => noise({ dur: 0.09, gain: 0.18, filterFreq: 2200 }), // card flick
  chip: () => tone({ freq: 880, type: 'square', dur: 0.06, gain: 0.1, slideTo: 1250 }),
  shuffle: () => noise({ dur: 0.5, gain: 0.12, filterFreq: 1500 }),
  win: () => [660, 880, 1320].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.16, delay: i * 0.09 })),
  lose: () => tone({ freq: 320, type: 'sawtooth', dur: 0.42, gain: 0.14, slideTo: 120 }),
  push: () => tone({ freq: 440, type: 'sine', dur: 0.18, gain: 0.1 }),
};
