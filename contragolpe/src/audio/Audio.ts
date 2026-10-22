/**
 * Audio sintetizado con Web Audio API: ningún archivo externo.
 * Cada golpe se construye por capas (impacto grave + "clack" agudo + ruido), con variaciones
 * para bloqueo, parry, counter hit, proyectil, súper y KO. La música es un secuenciador sencillo.
 */
export type SfxName =
  | "hitLight"
  | "hitHeavy"
  | "hitSuper"
  | "counter"
  | "block"
  | "parry"
  | "redParry"
  | "parryFail"
  | "whiffLight"
  | "whiffHeavy"
  | "projectile"
  | "clash"
  | "super"
  | "ko"
  | "jump"
  | "land"
  | "dash"
  | "throw"
  | "throwHit"
  | "tech"
  | "knockdown"
  | "round"
  | "fight"
  | "win"
  | "select"
  | "confirm"
  | "back";

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  musicBus!: GainNode;
  private noise!: AudioBuffer;
  private echo!: DelayNode;
  private sfxVolume = 0.8;
  private musicVolume = 0.5;
  private music: MusicPlayer | null = null;
  private pendingTheme: string | null = null;
  muted = false;

  /** Los navegadores solo permiten audio tras un gesto del usuario: se llama en la primera tecla/clic. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.55;
    this.musicBus.connect(this.master);
    // Eco corto para el KO y la súper.
    this.echo = ctx.createDelay(0.5);
    this.echo.delayTime.value = 0.16;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.4;
    this.echo.connect(fb).connect(this.echo);
    this.echo.connect(echoOut).connect(this.sfxBus);
    // Ruido blanco precalculado.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    this.music = new MusicPlayer(ctx, this.musicBus, this.noise);
    if (this.pendingTheme) this.music.play(this.pendingTheme);
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.02);
    this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.05);
  }

  /** Bajar el volumen (ventana sin foco) o recuperarlo. */
  duck(on: boolean): void {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(on ? 0.15 : 0.9, this.ctx.currentTime, 0.08);
  }

  playMusic(theme: string | null): void {
    this.pendingTheme = theme;
    if (!this.music) return;
    if (theme) this.music.play(theme);
    else this.music.stop();
  }

  // ---------------------------------------------------------------- primitivas

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private out(pan: number, toEcho = false): AudioNode {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(this.sfxBus);
    if (toEcho) p.connect(this.echo);
    return p;
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, dest: AudioNode, attack = 0.003): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  private noiseBurst(t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, dest: AudioNode, q = 1, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, peak, dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Reproduce un efecto. `pan` −1..1 según la posición en pantalla; `pitch` varía ligeramente para no cansar. */
  play(name: SfxName, pan = 0, pitch = 1): void {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + 0.005;
    const p = pitch * (0.96 + Math.random() * 0.08);
    switch (name) {
      case "hitLight": {
        const o = this.out(pan);
        this.tone("sine", 190 * p, 70, t, 0.08, 0.7, o);
        this.noiseBurst(t, 0.05, 0.5, "highpass", 2500, o);
        this.tone("square", 1400 * p, 900, t, 0.02, 0.12, o);
        break;
      }
      case "hitHeavy": {
        const o = this.out(pan);
        this.tone("sine", 140 * p, 38, t, 0.22, 1.0, o);
        this.tone("triangle", 880 * p, 300, t, 0.05, 0.25, o);
        this.noiseBurst(t, 0.12, 0.7, "lowpass", 2400, o, 0.7, 500);
        this.noiseBurst(t, 0.04, 0.45, "highpass", 3500, o);
        break;
      }
      case "hitSuper": {
        const o = this.out(pan, true);
        this.tone("sine", 120 * p, 32, t, 0.3, 1.0, o);
        this.tone("sawtooth", 600 * p, 200, t, 0.08, 0.18, o);
        this.noiseBurst(t, 0.18, 0.8, "bandpass", 1800, o, 0.8, 400);
        break;
      }
      case "counter": {
        const o = this.out(pan, true);
        this.tone("sine", 1318, 1318, t, 0.28, 0.25, o);
        this.tone("sine", 1975, 1975, t + 0.02, 0.22, 0.18, o);
        break;
      }
      case "block": {
        const o = this.out(pan);
        this.tone("sine", 95 * p, 60, t, 0.07, 0.6, o);
        this.noiseBurst(t, 0.06, 0.5, "bandpass", 900 * p, o, 2);
        this.tone("square", 500 * p, 420, t, 0.015, 0.08, o);
        break;
      }
      case "parry":
      case "redParry": {
        const o = this.out(pan, true);
        const base = name === "redParry" ? 1567 : 2093;
        this.noiseBurst(t, 0.12, 0.35, "highpass", 5000, o, 0.7, 9000);
        this.tone("sine", base, base, t, 0.55, 0.32, o);
        this.tone("sine", base * 1.5, base * 1.5, t, 0.4, 0.2, o);
        this.tone("triangle", base * 2.01, base * 2.01, t + 0.01, 0.3, 0.1, o);
        this.tone("sine", 220, 110, t, 0.12, 0.4, o);
        break;
      }
      case "parryFail": {
        const o = this.out(pan);
        this.tone("triangle", 330, 180, t, 0.12, 0.15, o);
        break;
      }
      case "whiffLight":
      case "whiffHeavy": {
        const o = this.out(pan);
        const heavy = name === "whiffHeavy";
        this.noiseBurst(t, heavy ? 0.16 : 0.08, heavy ? 0.28 : 0.16, "bandpass", heavy ? 500 : 900, o, 1.4, heavy ? 2000 : 2600);
        break;
      }
      case "projectile": {
        const o = this.out(pan, true);
        this.noiseBurst(t, 0.3, 0.4, "bandpass", 400, o, 1, 2400);
        this.tone("sawtooth", 180, 520, t, 0.22, 0.18, o, 0.02);
        this.tone("square", 70, 40, t, 0.1, 0.3, o);
        break;
      }
      case "clash": {
        const o = this.out(pan, true);
        this.noiseBurst(t, 0.25, 0.6, "highpass", 1500, o, 0.6);
        this.tone("square", 900, 200, t, 0.2, 0.15, o);
        break;
      }
      case "super": {
        const o = this.out(pan, true);
        this.tone("sawtooth", 90, 1300, t, 0.7, 0.25, o, 0.05);
        this.tone("sine", 45, 45, t, 0.8, 0.5, o, 0.05);
        this.noiseBurst(t, 0.7, 0.3, "bandpass", 300, o, 1.2, 6000);
        break;
      }
      case "ko": {
        const o = this.out(pan, true);
        this.tone("sine", 90, 26, t, 0.9, 1.0, o);
        this.tone("triangle", 400, 60, t, 0.5, 0.35, o);
        this.noiseBurst(t, 0.6, 0.8, "lowpass", 3000, o, 0.5, 200);
        break;
      }
      case "jump": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.06, 0.12, "bandpass", 700, o, 1, 1600);
        break;
      }
      case "land":
      case "knockdown": {
        const o = this.out(pan);
        const big = name === "knockdown";
        this.tone("sine", big ? 110 : 140, 45, t, big ? 0.25 : 0.08, big ? 0.8 : 0.3, o);
        this.noiseBurst(t, big ? 0.2 : 0.06, big ? 0.4 : 0.15, "lowpass", 800, o);
        break;
      }
      case "dash": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.14, 0.18, "bandpass", 500, o, 1, 1800);
        break;
      }
      case "throw": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.1, 0.4, "bandpass", 1200, o, 0.8);
        this.tone("sine", 160, 90, t, 0.08, 0.4, o);
        break;
      }
      case "throwHit": {
        const o = this.out(pan, true);
        this.tone("sine", 100, 30, t, 0.4, 1.0, o);
        this.noiseBurst(t, 0.3, 0.7, "lowpass", 1500, o, 0.6, 150);
        break;
      }
      case "tech": {
        const o = this.out(pan);
        this.tone("square", 700, 1100, t, 0.06, 0.15, o);
        this.noiseBurst(t, 0.12, 0.3, "highpass", 2000, o);
        break;
      }
      case "round": {
        const o = this.out(0, true);
        for (const [f, a] of [[196, 0.4], [294, 0.25], [466, 0.15], [622, 0.08]] as const) this.tone("sine", f, f * 0.99, t, 1.4, a, o, 0.005);
        break;
      }
      case "fight": {
        const o = this.out(0, true);
        this.tone("sawtooth", 392, 392, t, 0.12, 0.18, o);
        this.tone("sawtooth", 587, 587, t + 0.13, 0.35, 0.2, o);
        this.noiseBurst(t + 0.13, 0.3, 0.2, "highpass", 3000, o);
        break;
      }
      case "win": {
        const o = this.out(0, true);
        [523, 659, 784, 1046].forEach((f, i) => this.tone("square", f, f, t + i * 0.11, 0.25, 0.12, o));
        break;
      }
      case "select": {
        const o = this.out(0);
        this.tone("square", 880, 880, t, 0.04, 0.08, o);
        break;
      }
      case "confirm": {
        const o = this.out(0);
        this.tone("square", 660, 660, t, 0.05, 0.1, o);
        this.tone("square", 990, 990, t + 0.05, 0.08, 0.1, o);
        break;
      }
      case "back": {
        const o = this.out(0);
        this.tone("square", 520, 330, t, 0.08, 0.08, o);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Música
// ---------------------------------------------------------------------------

interface Theme {
  bpm: number;
  /** Raíz MIDI de cada compás (progresión de 4 u 8 compases). */
  roots: number[];
  /** Escala (intervalos) para el arpegio. */
  scale: number[];
  /** Patrón de batería de 16 pasos: k = bombo, s = caja, h = güira/hi-hat, x = nada. */
  drums: string;
  /** Patrón de bajo (1 = nota en ese paso). */
  bass: string;
  /** Patrón del arpegio (índice en la escala o "."). */
  lead: string;
  leadWave: OscillatorType;
  swing: number;
}

/** Temas originales. "muelle" tiene un aire de merengue (güira constante y bajo saltarín). */
export const THEMES: Record<string, Theme> = {
  menu: {
    bpm: 112,
    roots: [45, 45, 41, 43],
    scale: [0, 3, 5, 7, 10, 12],
    drums: "k.h.s.h.k.hks.h.",
    bass: "1..1..1.1..1..1.",
    lead: "0.2.3.4.5.4.3.2.",
    leadWave: "triangle",
    swing: 0.08,
  },
  muelle: {
    bpm: 140,
    roots: [50, 50, 45, 45, 43, 43, 45, 45],
    scale: [0, 2, 4, 5, 7, 9, 12],
    drums: "khhhshhhkhhhshhh",
    bass: "1.1.1.1.1.1.1.11",
    lead: "4.5.6.5.4.2.1.2.",
    leadWave: "square",
    swing: 0,
  },
  azotea: {
    bpm: 124,
    roots: [40, 40, 36, 38],
    scale: [0, 3, 7, 10, 12, 15],
    drums: "k.h.s.h.k.h.s.hh",
    bass: "11.11.1.11.11.1.",
    lead: "0.1.2.3.4.3.2.1.",
    leadWave: "sawtooth",
    swing: 0,
  },
  plaza: {
    bpm: 128,
    roots: [52, 52, 57, 57, 55, 55, 52, 52],
    scale: [0, 2, 3, 5, 7, 8, 12],
    drums: "k..hs.h.k.hhs.h.",
    bass: "1..1..1.1..1..1.",
    lead: "0.2.4.2.5.4.2.1.",
    leadWave: "triangle",
    swing: 0.1,
  },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class MusicPlayer {
  private theme: Theme | null = null;
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly bus: GainNode,
    private readonly noise: AudioBuffer,
  ) {}

  play(name: string): void {
    const th = THEMES[name] ?? THEMES.menu;
    if (this.theme === th && this.timer !== null) return;
    this.theme = th;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    if (this.timer === null) this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.theme = null;
  }

  private schedule(): void {
    const th = this.theme;
    if (!th) return;
    const stepDur = 60 / th.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const i = this.step % 16;
      const bar = Math.floor(this.step / 16) % th.roots.length;
      const swing = i % 2 === 1 ? stepDur * th.swing : 0;
      this.note(th, i, bar, this.nextTime + swing, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private note(th: Theme, i: number, bar: number, t: number, dur: number): void {
    const root = th.roots[bar];
    const d = th.drums[i];
    if (d === "k") this.drum(t, "k");
    if (d === "s") this.drum(t, "s");
    if (d === "h" || d === "s" || d === "k") this.drum(t, "h", d === "h" ? 1 : 0.5);
    if (th.bass[i] === "1") this.synth("triangle", midi(root - 12 + (i % 8 === 6 ? 7 : 0)), t, dur * 1.6, 0.32, 600);
    const l = th.lead[i];
    if (l !== ".") {
      const deg = th.scale[Number(l) % th.scale.length];
      // El arpegio solo suena la mitad de los compases: deja aire.
      if (bar % 2 === 0 || i % 4 === 0) this.synth(th.leadWave, midi(root + 12 + deg), t, dur * 0.9, 0.07, 2800);
    }
    // Acorde de fondo al inicio de cada compás
    if (i === 0) for (const iv of [0, th.scale[2] ?? 4, 7]) this.synth("sine", midi(root + iv), t, dur * 14, 0.045, 1200, 0.15);
  }

  private synth(type: OscillatorType, f: number, t: number, dur: number, vol: number, cutoff: number, attack = 0.005): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const flt = this.ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(flt).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private drum(t: number, kind: "k" | "s" | "h", vol = 1): void {
    const ctx = this.ctx;
    if (kind === "k") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.2);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === "s" ? "bandpass" : "highpass";
    f.frequency.value = kind === "s" ? 1800 : 7000;
    const g = ctx.createGain();
    const len = kind === "s" ? 0.12 : 0.035;
    g.gain.setValueAtTime((kind === "s" ? 0.28 : 0.08) * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  }
}
