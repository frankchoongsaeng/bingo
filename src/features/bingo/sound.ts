// Tiny synthesized sound engine — no audio assets. Retro bingo-hall blips,
// chimes and a little win jingle, all built from Web Audio oscillators and
// gain envelopes. The AudioContext is created lazily and resumed on the first
// user gesture (browser autoplay policy), so early sounds simply no-op.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

const MUTE_KEY = "chota:bingo:muted";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  // storage unavailable — default to sound on
}

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {
    // ignore
  }
  if (!m) ensure(); // warm up the context on unmute (this runs from a click)
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  slideTo?: number;
  delay?: number;
}

function tone(o: ToneOpts): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + o.dur);
  const peak = o.gain ?? 0.3;
  const atk = o.attack ?? 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.03);
}

// A short filtered-noise thump — the felt-tip "stamp" of a dauber.
function thud(dur: number, gain = 0.18, delay = 0): void {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(t0);
}

export const sfx = {
  /** Soft tick when a square is picked. */
  pick(): void {
    tone({ freq: 640, dur: 0.05, type: "triangle", gain: 0.14 });
  },
  /** The dauber stamp — a low pitched thump. */
  daub(): void {
    tone({ freq: 220, slideTo: 90, dur: 0.14, type: "sine", gain: 0.32 });
    thud(0.06, 0.14);
  },
  /** A bright two-note chime as a new ball is called. */
  call(): void {
    tone({ freq: 784, dur: 0.18, type: "triangle", gain: 0.2 });
    tone({ freq: 1175, dur: 0.3, type: "sine", gain: 0.16, delay: 0.09 });
  },
  /** A rising cue when the turn comes to you. */
  turn(): void {
    tone({ freq: 587, dur: 0.12, type: "sine", gain: 0.18 });
    tone({ freq: 880, dur: 0.22, type: "sine", gain: 0.18, delay: 0.1 });
  },
  /** Little whistle to kick off the game. */
  start(): void {
    tone({ freq: 523, dur: 0.1, type: "square", gain: 0.13 });
    tone({ freq: 784, dur: 0.16, type: "square", gain: 0.13, delay: 0.1 });
  },
  /** Low buzz — a rejected claim or an error. */
  buzz(): void {
    tone({ freq: 150, dur: 0.2, type: "sawtooth", gain: 0.18 });
  },
  /** Triumphant arpeggio with a sparkle on a BINGO. */
  win(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.34, type: "triangle", gain: 0.24, delay: i * 0.11 }),
    );
    tone({ freq: 1568, dur: 0.5, type: "sine", gain: 0.14, delay: 0.48 });
    tone({ freq: 2093, dur: 0.4, type: "sine", gain: 0.1, delay: 0.6 });
  },
  /** Generic soft press. */
  click(): void {
    tone({ freq: 300, dur: 0.045, type: "square", gain: 0.1 });
  },
};
