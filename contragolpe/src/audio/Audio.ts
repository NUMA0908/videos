/**
 * Audio con Web Audio API. Dos fuentes, con la misma interfaz:
 *  1. **Archivos propios** en `assets/audio/` (ver ASSETS_NEEDED.md): si existen, se usan. Varias variantes
 *     por sonido (`hitPunchL_1.ogg`, `hitPunchL_2.ogg`…), voces por personaje y música por escenario.
 *  2. **Síntesis** (lo que suena hoy): cada golpe se construye por capas (impacto grave + "clack" agudo + ruido),
 *     con 3–4 variantes por sonido y un ligero cambio de tono para que no suene repetido.
 * Capas de un golpe (las decide FightScene): swing al lanzar → impacto al conectar → voz (solo con archivos).
 */
export type SfxName =
  | "swingPunchL"
  | "swingPunchH"
  | "swingKickL"
  | "swingKickH"
  | "swingSpecial"
  | "hitPunchL"
  | "hitPunchH"
  | "hitKickL"
  | "hitKickH"
  | "hitSpecial"
  | "hitSuper"
  | "counter"
  | "block"
  | "blockHeavy"
  | "parry"
  | "redParry"
  | "parryFail"
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
  | "back"
  // Nombres antiguos (equivalen a los de arriba).
  | "hitLight"
  | "hitHeavy"
  | "whiffLight"
  | "whiffHeavy";

/** Voces cortas por personaje (solo con archivos: no se sintetizan voces). */
export type VoiceName = "attack" | "heavy" | "special" | "super" | "hurt" | "ko" | "win";

const ALIASES: Partial<Record<SfxName, SfxName>> = {
  hitLight: "hitPunchL",
  hitHeavy: "hitPunchH",
  whiffLight: "swingPunchL",
  whiffHeavy: "swingPunchH",
};

/** Variantes sintetizadas por sonido (los no listados tienen 1: menús y anuncios deben sonar siempre igual). */
const SYNTH_VARIANTS: Partial<Record<SfxName, number>> = {
  swingPunchL: 4,
  swingPunchH: 4,
  swingKickL: 4,
  swingKickH: 4,
  swingSpecial: 3,
  hitPunchL: 4,
  hitPunchH: 4,
  hitKickL: 4,
  hitKickH: 4,
  hitSpecial: 3,
  hitSuper: 3,
  block: 4,
  blockHeavy: 3,
  parry: 3,
  projectile: 3,
  land: 3,
  jump: 3,
  dash: 3,
  knockdown: 3,
  throwHit: 3,
};

/** Multiplicadores de cada variante sintetizada: tono, filtro y duración. */
const VARIANT = [
  { f: 1, flt: 1, d: 1 },
  { f: 0.89, flt: 1.25, d: 1.1 },
  { f: 1.12, flt: 0.82, d: 0.92 },
  { f: 0.95, flt: 1.1, d: 1.05 },
];

/** Sonidos que también van al eco (se distinguen sobre la música). */
const ECHO = new Set<SfxName>(["hitSuper", "counter", "parry", "redParry", "projectile", "clash", "super", "ko", "throwHit", "round", "fight", "win"]);

/**
 * Archivos de audio encontrados al compilar (Vite los descubre: si la carpeta está vacía no se carga nada
 * y no hay peticiones fallidas). Clave → URLs ordenadas por número de variante.
 */
const FILES = import.meta.glob("/assets/audio/**/*.{ogg,mp3,wav}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

/** "/assets/audio/sfx/hitPunchL_2.ogg" → { key: "sfx/hitPunchL", n: 2 }. Exportado para los tests. */
export function sampleKey(path: string): { key: string; n: number } | null {
  const m = /^\/?assets\/audio\/(.+?)(?:_(\d+))?\.(?:ogg|mp3|wav)$/i.exec(path);
  return m ? { key: m[1], n: m[2] ? Number(m[2]) : 0 } : null;
}

export function groupSamples(files: Record<string, string>): Map<string, string[]> {
  const tmp = new Map<string, { n: number; url: string }[]>();
  for (const [path, url] of Object.entries(files)) {
    const k = sampleKey(path);
    if (!k) continue;
    const list = tmp.get(k.key) ?? [];
    list.push({ n: k.n, url });
    tmp.set(k.key, list);
  }
  const out = new Map<string, string[]>();
  for (const [key, list] of tmp) out.set(key, list.sort((a, b) => a.n - b.n).map((x) => x.url));
  return out;
}

/** Elige una variante al azar sin repetir la anterior (presentación: puede usar Math.random). */
export function pickVariant(n: number, last: number | undefined, rnd: () => number = Math.random): number {
  if (n <= 1) return 0;
  let v = Math.floor(rnd() * n);
  if (v === last) v = (v + 1 + Math.floor(rnd() * (n - 1))) % n;
  return v;
}

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
  /** Sonidos cargados desde archivos (clave "sfx/hitPunchL", "voice/rayo/hurt", "music/muelle"). */
  private samples = new Map<string, AudioBuffer[]>();
  private lastVariant = new Map<string, number>();
  private voiceUntil = new Map<string, number>();
  private musicFile: AudioBufferSourceNode | null = null;
  private musicFileName: string | null = null;
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
    this.startMusic();
    void this.loadSamples();
  }

  /** Carga y decodifica los archivos de `assets/audio/` (si los hay). Un archivo roto se ignora con un aviso. */
  private async loadSamples(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const groups = groupSamples(FILES);
    await Promise.all(
      [...groups].map(async ([key, urls]) => {
        const bufs: AudioBuffer[] = [];
        for (const url of urls) {
          try {
            const data = await (await fetch(url)).arrayBuffer();
            bufs.push(await ctx.decodeAudioData(data));
          } catch (e) {
            console.warn(`Audio: no se pudo cargar ${url}: ${String(e)}`);
          }
        }
        if (bufs.length) this.samples.set(key, bufs);
      }),
    );
    // Si llegó la música de archivo del escenario actual, sustituye al secuenciador.
    this.startMusic();
  }

  /** Cuántos archivos hay cargados para una clave (para el menú de depuración y los tests). */
  sampleCount(key: string): number {
    return this.samples.get(key)?.length ?? 0;
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
    this.startMusic();
  }

  /** Música de archivo (`assets/audio/music/<tema>.ogg`, en bucle) si existe; si no, el secuenciador. */
  private startMusic(): void {
    if (!this.ctx || !this.music) return;
    const theme = this.pendingTheme;
    const buf = theme ? this.samples.get(`music/${theme}`)?.[0] : undefined;
    if (buf) {
      if (this.musicFileName === theme && this.musicFile) return;
      this.stopMusicFile();
      this.music.stop();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(this.musicBus);
      src.start();
      this.musicFile = src;
      this.musicFileName = theme;
      return;
    }
    this.stopMusicFile();
    if (theme) this.music.play(theme);
    else this.music.stop();
  }

  private stopMusicFile(): void {
    if (!this.musicFile) return;
    try {
      this.musicFile.stop();
    } catch {
      // ya estaba parada
    }
    this.musicFile.disconnect();
    this.musicFile = null;
    this.musicFileName = null;
  }

  private playBuffer(buf: AudioBuffer, pan: number, rate: number, toEcho: boolean, gain = 1): number {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.out(pan, toEcho));
    src.start();
    return buf.duration / rate;
  }

  /**
   * Voz corta de un personaje. Solo suena si hay archivos (`assets/audio/voice/<personaje>/<voz>_N.ogg`);
   * `chance` evita que grite en cada golpe y nunca se pisan dos voces del mismo personaje.
   */
  voice(char: string, name: VoiceName, pan = 0, chance = 1): void {
    if (!this.ctx || this.muted) return;
    const key = `voice/${char}/${name}`;
    const bufs = this.samples.get(key);
    if (!bufs?.length || Math.random() > chance) return;
    const now = this.ctx.currentTime;
    if ((this.voiceUntil.get(char) ?? 0) > now) return;
    const v = pickVariant(bufs.length, this.lastVariant.get(key));
    this.lastVariant.set(key, v);
    const dur = this.playBuffer(bufs[v], pan, 0.98 + Math.random() * 0.04, false, 0.9);
    this.voiceUntil.set(char, now + dur * 0.8);
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
    const key = ALIASES[name] ?? name;
    const files = this.samples.get(`sfx/${key}`);
    const n = files?.length ?? SYNTH_VARIANTS[key] ?? 1;
    const v = pickVariant(n, this.lastVariant.get(key));
    this.lastVariant.set(key, v);
    const p = pitch * (0.97 + Math.random() * 0.06);
    if (files?.length) {
      this.playBuffer(files[v], pan, p, ECHO.has(key));
      return;
    }
    this.synth(key, v, pan, p);
  }

  private synth(name: SfxName, variant: number, pan: number, pitch: number): void {
    const t = this.ctx!.currentTime + 0.005;
    const V = VARIANT[variant % VARIANT.length];
    const p = pitch * V.f;
    const d = V.d;
    const flt = V.flt;
    switch (name) {
      // ---- Swing (capa 1: al lanzar el golpe, conecte o no). Ruido filtrado que barre hacia arriba.
      case "swingPunchL": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.07 * d, 0.16, "bandpass", 1000 * flt, o, 1.4, 2900 * flt);
        break;
      }
      case "swingPunchH": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.13 * d, 0.27, "bandpass", 620 * flt, o, 1.5, 2300 * flt);
        this.tone("sine", 130 * p, 90, t, 0.1 * d, 0.08, o, 0.03);
        break;
      }
      case "swingKickL": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.1 * d, 0.18, "bandpass", 520 * flt, o, 1.2, 1700 * flt);
        break;
      }
      case "swingKickH": {
        const o = this.out(pan);
        // Más largo y grave: la pierna mueve más aire.
        this.noiseBurst(t, 0.19 * d, 0.3, "bandpass", 340 * flt, o, 1.8, 1500 * flt);
        this.tone("sine", 95 * p, 60, t, 0.16 * d, 0.1, o, 0.04);
        break;
      }
      case "swingSpecial": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.16 * d, 0.22, "bandpass", 500 * flt, o, 1.2, 3200 * flt);
        this.tone("triangle", 300 * p, 760 * p, t, 0.14 * d, 0.09, o, 0.02);
        break;
      }
      // ---- Impacto (capa 2: al conectar). Puño = seco y agudo; patada = más grave y "carnoso".
      case "hitPunchL": {
        const o = this.out(pan);
        this.tone("sine", 190 * p, 70, t, 0.08 * d, 0.7, o);
        this.noiseBurst(t, 0.05 * d, 0.5, "highpass", 2500 * flt, o);
        this.tone("square", 1400 * p, 900, t, 0.02, 0.12, o);
        break;
      }
      case "hitPunchH": {
        const o = this.out(pan);
        this.tone("sine", 140 * p, 38, t, 0.22 * d, 1.0, o);
        this.tone("triangle", 880 * p, 300, t, 0.05, 0.25, o);
        this.noiseBurst(t, 0.12 * d, 0.7, "lowpass", 2400 * flt, o, 0.7, 500);
        this.noiseBurst(t, 0.04, 0.45, "highpass", 3500 * flt, o);
        break;
      }
      case "hitKickL": {
        const o = this.out(pan);
        this.tone("sine", 150 * p, 55, t, 0.1 * d, 0.75, o);
        this.noiseBurst(t, 0.07 * d, 0.55, "bandpass", 1300 * flt, o, 1.4);
        this.tone("triangle", 700 * p, 420, t, 0.03, 0.12, o);
        break;
      }
      case "hitKickH": {
        const o = this.out(pan);
        this.tone("sine", 112 * p, 32, t, 0.28 * d, 1.0, o);
        this.noiseBurst(t, 0.16 * d, 0.75, "bandpass", 950 * flt, o, 0.9, 260);
        this.tone("triangle", 600 * p, 190, t, 0.07, 0.22, o);
        this.noiseBurst(t, 0.03, 0.35, "highpass", 3000 * flt, o);
        break;
      }
      case "hitSpecial": {
        const o = this.out(pan, true);
        this.tone("sine", 130 * p, 36, t, 0.24 * d, 1.0, o);
        // Capa de energía: chasquido eléctrico que distingue un especial de un normal.
        this.tone("sawtooth", 420 * p, 1300 * p, t, 0.06 * d, 0.12, o);
        this.noiseBurst(t, 0.14 * d, 0.6, "bandpass", 2200 * flt, o, 1.1, 600);
        break;
      }
      case "hitSuper": {
        const o = this.out(pan, true);
        this.tone("sine", 120 * p, 32, t, 0.3 * d, 1.0, o);
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
        this.tone("sine", 95 * p, 60, t, 0.07 * d, 0.6, o);
        this.noiseBurst(t, 0.06 * d, 0.5, "bandpass", 900 * p * flt, o, 2);
        this.tone("square", 500 * p, 420, t, 0.015, 0.08, o);
        break;
      }
      case "blockHeavy": {
        const o = this.out(pan);
        this.tone("sine", 78 * p, 44, t, 0.13 * d, 0.85, o);
        this.noiseBurst(t, 0.1 * d, 0.6, "bandpass", 650 * p * flt, o, 1.6);
        this.tone("square", 380 * p, 300, t, 0.02, 0.1, o);
        break;
      }
      case "parry":
      case "redParry": {
        const o = this.out(pan, true);
        // El parry es una nota limpia: solo varía un poco el brillo, no la afinación.
        const base = name === "redParry" ? 1567 : 2093 * (1 + (V.f - 1) * 0.15);
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
      case "projectile": {
        const o = this.out(pan, true);
        this.noiseBurst(t, 0.3 * d, 0.4, "bandpass", 400 * flt, o, 1, 2400 * flt);
        this.tone("sawtooth", 180 * p, 520 * p, t, 0.22, 0.18, o, 0.02);
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
        this.noiseBurst(t, 0.06 * d, 0.12, "bandpass", 700 * flt, o, 1, 1600 * flt);
        break;
      }
      case "land":
      case "knockdown": {
        const o = this.out(pan);
        const big = name === "knockdown";
        this.tone("sine", (big ? 110 : 140) * p, 45, t, (big ? 0.25 : 0.08) * d, big ? 0.8 : 0.3, o);
        this.noiseBurst(t, (big ? 0.2 : 0.06) * d, big ? 0.4 : 0.15, "lowpass", 800 * flt, o);
        break;
      }
      case "dash": {
        const o = this.out(pan);
        this.noiseBurst(t, 0.14 * d, 0.18, "bandpass", 500 * flt, o, 1, 1800 * flt);
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
        this.tone("sine", 100 * p, 30, t, 0.4 * d, 1.0, o);
        this.noiseBurst(t, 0.3 * d, 0.7, "lowpass", 1500 * flt, o, 0.6, 150);
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
