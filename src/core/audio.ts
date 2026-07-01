/**
 * Tiny WebAudio SFX synth — no asset files. Each sound is a short oscillator
 * blip with an envelope. Kept intentionally minimal (v1 scope) but juicy.
 */

type SfxName = "jump" | "flip" | "land" | "death" | "win" | "click" | "warn";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  // Browsers start the context suspended until a user gesture.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface Blip {
  type: OscillatorType;
  from: number;
  to: number;
  dur: number;
  gain?: number;
  glideTo?: number; // frequency slide target
}

const BLIPS: Record<SfxName, Blip> = {
  jump: { type: "triangle", from: 420, to: 660, dur: 0.12, glideTo: 660 },
  flip: { type: "sawtooth", from: 220, to: 880, dur: 0.16, glideTo: 880, gain: 0.35 },
  land: { type: "sine", from: 180, to: 120, dur: 0.08, glideTo: 90, gain: 0.4 },
  death: { type: "sawtooth", from: 300, to: 60, dur: 0.35, glideTo: 40, gain: 0.5 },
  win: { type: "triangle", from: 523, to: 1046, dur: 0.5, glideTo: 1046, gain: 0.5 },
  click: { type: "square", from: 660, to: 660, dur: 0.05, gain: 0.25 },
  warn: { type: "square", from: 880, to: 660, dur: 0.09, glideTo: 620, gain: 0.2 },
};

export function playSfx(name: SfxName): void {
  if (muted) return;
  const ac = ensure();
  if (!ac || !master) return;

  const b = BLIPS[name];
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const now = ac.currentTime;

  osc.type = b.type;
  osc.frequency.setValueAtTime(b.from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, b.glideTo ?? b.to), now + b.dur);

  const peak = b.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + b.dur);

  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + b.dur + 0.02);
}

/** "win" fanfare: a small arpeggio. */
export function playWin(): void {
  if (muted) return;
  const ac = ensure();
  if (!ac || !master) return;
  [523, 659, 784, 1046].forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const t = ac.currentTime + i * 0.08;
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(g);
    g.connect(master!);
    osc.start(t);
    osc.stop(t + 0.28);
  });
}

export function setMuted(m: boolean): void {
  muted = m;
}
export function isMuted(): boolean {
  return muted;
}
export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}
