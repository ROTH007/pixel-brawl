// ============================================================
//  Tiny retro sound effects made with code (no audio files)
//  សំឡេង retro បង្កើតដោយកូដ
// ============================================================
let ctx: AudioContext | null = null;
let muted = localStorage.getItem('pixelbrawl_muted') === '1';

export const isMuted = () => muted;
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('pixelbrawl_muted', muted ? '1' : '0');
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.15, slideTo?: number, delay = 0) {
  if (muted) return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

export const sfx = {
  jump: () => tone(320, 0.12, 'square', 0.06, 640),
  swing: () => tone(180, 0.06, 'triangle', 0.05, 90),
  hit: () => { tone(140, 0.12, 'square', 0.12, 60); tone(900, 0.04, 'sawtooth', 0.05, 300); },
  ko: () => { tone(500, 0.5, 'sawtooth', 0.12, 40); tone(80, 0.6, 'square', 0.1, 30, 0.05); },
  count: () => tone(660, 0.12, 'square', 0.08),
  go: () => tone(990, 0.3, 'square', 0.1),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.08, undefined, i * 0.12)),
  click: () => tone(880, 0.04, 'square', 0.04),
  // ---- V2 ----
  block: () => { tone(1200, 0.06, 'square', 0.06, 900); tone(1800, 0.05, 'triangle', 0.04); },
  shieldBreak: () => { tone(1400, 0.25, 'sawtooth', 0.08, 120); tone(700, 0.35, 'square', 0.06, 60, 0.05); },
  dodge: () => tone(600, 0.12, 'triangle', 0.05, 200),
  special: () => tone(200, 0.2, 'sawtooth', 0.07, 900),
  pickup: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.08, 'square', 0.06, undefined, i * 0.06)),
  throw: () => tone(300, 0.15, 'triangle', 0.06, 700),
  explode: () => { tone(120, 0.5, 'sawtooth', 0.14, 30); tone(60, 0.6, 'square', 0.1, 25, 0.03); },
};