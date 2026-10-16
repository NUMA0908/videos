/* La Llorona — juego de terror 2D (vista cenital).
 * Sin dependencias: canvas 2D + Web Audio. Abre index.html en el navegador.
 */
(() => {
  "use strict";

  // ---------------------------------------------------------------------------
  // Configuración
  // ---------------------------------------------------------------------------
  const TILE = 32;
  const MW = 80;
  const MH = 60;
  const NIGHT_SECONDS = 480; // 00:00 → 05:00 (amanecer)
  const CHILD_NAMES = ["Lucía", "Mateo", "Rosita", "Pedrito"];

  const T = { GRASS: 0, TREE: 1, WATER: 2, BRIDGE: 3, WALL: 4, PATH: 5, CHURCH: 6, BUSH: 7, GRAVE: 8, FLOOR: 9 };
  const SOLID = [false, true, false, false, true, false, true, false, true, false];
  const OPAQUE = [false, true, false, false, true, false, true, false, false, false];

  const SURFACE = { [T.GRASS]: "grass", [T.BUSH]: "bush", [T.WATER]: "water", [T.BRIDGE]: "wood", [T.FLOOR]: "wood", [T.PATH]: "dirt" };
  const PLAYER = { walk: 95, run: 158, radius: 9 };
  const STAMINA = { max: 160, drain: 16, regen: 24, recover: 35 };
  const BATTERY_DRAIN = 0.9; // % por segundo
  const LLORONA = { wander: 52, investigate: 78, chase: 102, perChild: 9, catchDist: 20 };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const dark = document.createElement("canvas");
  const dctx = dark.getContext("2d");
  let W = 0;
  let H = 0;
  let DPR = 1;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = dark.width = Math.floor(W * DPR);
    canvas.height = dark.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = Math.random;
  const rand = (a, b) => a + rng() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------------------------------------------------------------------------
  // Audio (todo sintetizado)
  // ---------------------------------------------------------------------------
  const Sound = {
    ctx: null,
    master: null,
    muted: false,
    noiseBuf: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.startAmbient();
    },

    setLevels(river, dread) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.riverGain.gain.setTargetAtTime(river * 0.16, t, 0.3);
      this.dreadGain.gain.setTargetAtTime(dread * 0.09, t, 0.4);
    },

    // Utilidades de síntesis
    burst(start, len, type, freq, q, gain, out) {
      const c = this.ctx;
      const n = this.noise();
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(gain, start + Math.min(0.012, len * 0.25));
      g.gain.exponentialRampToValueAtTime(0.001, start + len);
      n.connect(f).connect(g).connect(out || this.master);
      n.start(start, Math.random() * 1.5);
      n.stop(start + len + 0.03);
      return f;
    },
    tone(start, len, f0, f1, type, gain, out) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, start);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + len);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(gain, start + Math.min(0.01, len * 0.2));
      g.gain.exponentialRampToValueAtTime(0.001, start + len);
      o.connect(g).connect(out || this.master);
      o.start(start);
      o.stop(start + len + 0.03);
      return o;
    },

    toggleMute() {
      this.muted = !this.muted;
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
    },

    out(pan) {
      if (this.ctx.createStereoPanner) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = clamp(pan || 0, -1, 1);
        p.connect(this.master);
        return p;
      }
      return this.master;
    },

    noise() {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      return src;
    },

    startAmbient() {
      const c = this.ctx;
      // Viento
      const wind = this.noise();
      wind.loop = true;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 380;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(lp.frequency);
      const g = c.createGain();
      g.gain.value = 0.07;
      wind.connect(lp).connect(g).connect(this.master);
      wind.start();
      lfo.start();
      // Corriente del río (volumen según la distancia al agua)
      const river = this.noise();
      river.loop = true;
      const rbp = c.createBiquadFilter();
      rbp.type = "bandpass";
      rbp.frequency.value = 700;
      rbp.Q.value = 0.6;
      const rlfo = c.createOscillator();
      rlfo.frequency.value = 0.3;
      const rlfoG = c.createGain();
      rlfoG.gain.value = 180;
      rlfo.connect(rlfoG).connect(rbp.frequency);
      this.riverGain = c.createGain();
      this.riverGain.gain.value = 0;
      river.connect(rbp).connect(this.riverGain).connect(this.master);
      river.start(0, 0.7);
      rlfo.start();
      // Pavor: cuerdas disonantes que suben cuando ella está cerca
      this.dreadGain = c.createGain();
      this.dreadGain.gain.value = 0;
      const dlp = c.createBiquadFilter();
      dlp.type = "lowpass";
      dlp.frequency.value = 900;
      dlp.connect(this.dreadGain).connect(this.master);
      [110, 116.5, 164.8, 233].forEach((f) => {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        const v = c.createOscillator();
        v.frequency.value = rand(3, 6);
        const vg = c.createGain();
        vg.gain.value = f * 0.012;
        v.connect(vg).connect(o.frequency);
        const og = c.createGain();
        og.gain.value = 0.25;
        o.connect(og).connect(dlp);
        o.start();
        v.start();
      });
      // Zumbido grave
      [
        [49, 0.025],
        [73.4, 0.012],
      ].forEach(([f, v]) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        const og = c.createGain();
        og.gain.value = v;
        o.connect(og).connect(this.master);
        o.start();
      });
    },

    wail(vol, pan) {
      if (!this.ctx || vol < 0.02) return;
      const c = this.ctx;
      const t = c.currentTime;
      const out = this.out(pan);
      const env = c.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol * 0.32, t + 0.5);
      env.gain.linearRampToValueAtTime(vol * 0.25, t + 1.8);
      env.gain.linearRampToValueAtTime(0, t + 3.2);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 2.5;
      bp.connect(env).connect(out);
      const vib = c.createOscillator();
      vib.frequency.value = 5.5;
      const vibG = c.createGain();
      vibG.gain.value = 16;
      vib.connect(vibG);
      [
        ["sawtooth", 1],
        ["triangle", 1.012],
      ].forEach(([type, mul]) => {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(480 * mul, t);
        o.frequency.linearRampToValueAtTime(760 * mul, t + 0.7);
        o.frequency.linearRampToValueAtTime(700 * mul, t + 1.5);
        o.frequency.exponentialRampToValueAtTime(280 * mul, t + 3.2);
        vibG.connect(o.frequency);
        o.connect(bp);
        o.start(t);
        o.stop(t + 3.3);
      });
      vib.start(t);
      vib.stop(t + 3.3);
    },

    scream(vol = 1) {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      const env = c.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.55 * vol, t + 0.05);
      env.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      env.connect(this.master);
      [900, 1340, 1810].forEach((f, i) => {
        const o = c.createOscillator();
        o.type = i === 0 ? "sawtooth" : "square";
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 1.5, t + 0.25);
        o.frequency.exponentialRampToValueAtTime(f * 0.4, t + 1.6);
        const g = c.createGain();
        g.gain.value = 0.12;
        o.connect(g).connect(env);
        o.start(t);
        o.stop(t + 1.7);
      });
      const n = this.noise();
      const hp = c.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1500;
      const ng = c.createGain();
      ng.gain.value = 0.4;
      n.connect(hp).connect(ng).connect(env);
      n.start(t);
      n.stop(t + 1.7);
    },

    heartbeat(vol) {
      if (!this.ctx || vol < 0.03) return;
      const c = this.ctx;
      const t = c.currentTime;
      [
        [0, 1],
        [0.24, 0.7],
      ].forEach(([dt, v]) => {
        const o = c.createOscillator();
        o.frequency.setValueAtTime(60, t + dt);
        o.frequency.exponentialRampToValueAtTime(32, t + dt + 0.16);
        const g = c.createGain();
        g.gain.setValueAtTime(0, t + dt);
        g.gain.linearRampToValueAtTime(vol * v * 0.9, t + dt + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.2);
        o.connect(g).connect(this.master);
        o.start(t + dt);
        o.stop(t + dt + 0.25);
      });
    },

    // Pasos según la superficie: grass | wood | dirt | bush | water
    step(vol, surface) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const v = vol * rand(0.8, 1.15);
      if (surface === "wood") {
        // tabla hueca: golpe grave + chasquido, a veces cruje
        this.tone(t, 0.14, rand(150, 190), 70, "sine", v * 1.5);
        this.burst(t, 0.05, "bandpass", rand(800, 1100), 7, v * 1.1);
        if (Math.random() < 0.3) {
          const out = this.ctx.createBiquadFilter();
          out.type = "bandpass";
          out.frequency.value = 600;
          out.Q.value = 4;
          out.connect(this.master);
          this.tone(t + 0.04, 0.3, rand(170, 220), rand(120, 150), "sawtooth", v * 0.5, out);
        }
      } else if (surface === "water") {
        // chapoteo + burbujas
        const f = this.burst(t, 0.3, "bandpass", 1600, 0.9, v * 1.4);
        f.frequency.exponentialRampToValueAtTime(450, t + 0.3);
        this.burst(t + 0.02, 0.22, "highpass", 3200, 0.5, v * 0.45);
        for (let i = 0; i < 3; i++) {
          const st = t + 0.05 + Math.random() * 0.2;
          const f0 = rand(350, 600);
          this.tone(st, 0.06, f0, f0 * 2.2, "sine", v * 0.35);
        }
      } else if (surface === "grass") {
        // hierba: roce suave y amortiguado
        this.burst(t, 0.14, "highpass", rand(2500, 3800), 0.4, v * 0.45);
        this.burst(t, 0.09, "lowpass", 260, 1, v * 0.7);
      } else if (surface === "bush") {
        // hojas: varios roces seguidos
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.04 + Math.random() * 0.02, 0.11, "bandpass", rand(2800, 5200), 1.2, v * 0.6);
      } else {
        // tierra/grava: crujido granular
        for (let i = 0; i < 5; i++) this.burst(t + i * 0.011 + Math.random() * 0.01, 0.025, "bandpass", rand(1400, 3200), 2, v * 0.65);
        this.burst(t, 0.07, "lowpass", 240, 1, v * 0.8);
      }
    },

    // Susurro con formantes (suena a voz sin palabras)
    whisper(vol, pan) {
      if (!this.ctx || vol < 0.02) return;
      const c = this.ctx;
      const out = this.out(pan);
      let t = c.currentTime;
      const vowels = [
        [300, 2300],
        [500, 900],
        [700, 1200],
        [350, 2000],
      ];
      const syll = randi(3, 6);
      for (let i = 0; i < syll; i++) {
        const [f1, f2] = pick(vowels);
        const len = rand(0.12, 0.3);
        [f1, f2].forEach((f, k) => {
          this.burst(t, len, "bandpass", f, 9, vol * (k ? 0.5 : 0.8), out);
        });
        if (Math.random() < 0.4) this.burst(t + len, 0.12, "highpass", 5000, 0.7, vol * 0.35, out); // "sss"
        t += len + rand(0.03, 0.12);
      }
    },

    // Grito ahogado / quejido grave y distorsionado
    moan(vol, pan) {
      if (!this.ctx || vol < 0.02) return;
      const c = this.ctx;
      const t = c.currentTime;
      const out = this.out(pan);
      const env = c.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(vol * 0.35, t + 0.6);
      env.gain.linearRampToValueAtTime(0, t + 2.6);
      const ws = c.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * 2 - 1;
        curve[i] = Math.tanh(x * 4);
      }
      ws.curve = curve;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1400;
      ws.connect(lp).connect(env).connect(out);
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(260, t);
      o.frequency.linearRampToValueAtTime(330, t + 0.8);
      o.frequency.exponentialRampToValueAtTime(110, t + 2.6);
      const vib = c.createOscillator();
      vib.frequency.value = 7;
      const vg = c.createGain();
      vg.gain.value = 25;
      vib.connect(vg).connect(o.frequency);
      const og = c.createGain();
      og.gain.value = 0.3;
      o.connect(og).connect(ws);
      o.start(t);
      vib.start(t);
      o.stop(t + 2.7);
      vib.stop(t + 2.7);
    },

    // Llanto entrecortado de mujer
    cry(vol, pan) {
      if (!this.ctx || vol < 0.02) return;
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1300;
      bp.Q.value = 1.5;
      bp.connect(out);
      const n = randi(4, 7);
      for (let i = 0; i < n; i++) {
        const st = t + i * rand(0.28, 0.4);
        const f0 = rand(620, 780) - i * 12;
        this.tone(st, rand(0.2, 0.32), f0, f0 * 0.72, "sawtooth", vol * 0.25, bp);
        this.burst(st + 0.22, 0.12, "bandpass", 1800, 2, vol * 0.18, out); // inspiración
      }
    },

    // Golpe orquestal disonante cuando te ve
    stinger(vol) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [98, 104, 147, 208, 415, 440].forEach((f) => this.tone(t, 2.2, f, f * 0.94, "sawtooth", vol * 0.07));
      this.tone(t, 0.6, 70, 35, "sine", vol * 0.7);
      this.burst(t, 0.5, "lowpass", 400, 1, vol * 0.4);
    },

    // Eventos del ambiente nocturno
    owl(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      [0, 0.45, 0.75].forEach((d, i) => this.tone(t + d, i ? 0.25 : 0.4, 400, 340, "sine", vol * 0.25, out));
    },
    crickets(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      const f = rand(4200, 5200);
      for (let k = 0; k < randi(3, 6); k++)
        for (let i = 0; i < 4; i++) this.tone(t + k * 0.35 + i * 0.035, 0.025, f, f, "square", vol * 0.04, out);
    },
    frog(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      const f = rand(90, 140);
      for (let i = 0; i < randi(2, 4); i++) {
        const st = t + i * 0.32;
        for (let k = 0; k < 6; k++) this.tone(st + k * 0.025, 0.03, f * 2, f, "square", vol * 0.12, out);
      }
    },
    branch(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      this.burst(t, 0.05, "highpass", 1800, 1, vol * 0.9, out);
      this.burst(t + 0.04, 0.04, "bandpass", 2500, 2, vol * 0.5, out);
      this.tone(t, 0.12, 120, 60, "sine", vol * 0.5, out);
    },
    howl(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1100;
      lp.connect(out);
      const o = this.tone(t, 2.4, 480, 380, "triangle", vol * 0.18, lp);
      o.frequency.cancelScheduledValues(t);
      o.frequency.setValueAtTime(420, t);
      o.frequency.linearRampToValueAtTime(700, t + 0.7);
      o.frequency.linearRampToValueAtTime(640, t + 1.6);
      o.frequency.exponentialRampToValueAtTime(380, t + 2.4);
    },
    gust(vol) {
      const t = this.ctx.currentTime;
      const f = this.burst(t, 3, "bandpass", 300, 0.8, vol * 0.35);
      f.frequency.linearRampToValueAtTime(900, t + 1.5);
      f.frequency.linearRampToValueAtTime(250, t + 3);
    },
    sniff(vol, pan) {
      const t = this.ctx.currentTime;
      const out = this.out(pan);
      this.burst(t, 0.12, "highpass", 2500, 0.8, vol * 0.25, out);
      this.burst(t + 0.18, 0.1, "highpass", 2500, 0.8, vol * 0.2, out);
    },

    sob(vol, pan, voice = 560) {
      if (!this.ctx || vol < 0.02) return;
      const c = this.ctx;
      const t = c.currentTime;
      const out = this.out(pan);
      if (Math.random() < 0.3) {
        this.sniff(vol, pan);
        return;
      }
      const n = randi(2, 4);
      for (let i = 0; i < n; i++) {
        const st = t + i * rand(0.22, 0.32);
        const o = c.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(voice - i * 30 + rand(-20, 20), st);
        o.frequency.exponentialRampToValueAtTime(voice * 0.68 - i * 25, st + 0.2);
        const g = c.createGain();
        g.gain.setValueAtTime(0, st);
        g.gain.linearRampToValueAtTime(vol * 0.22, st + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
        o.connect(g).connect(out);
        o.start(st);
        o.stop(st + 0.25);
      }
    },

    chime() {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      [660, 990, 1320].forEach((f, i) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t + i * 0.08);
        g.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.9);
        o.connect(g).connect(this.master);
        o.start(t + i * 0.08);
        o.stop(t + i * 0.08 + 1);
      });
    },

    click() {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = 1800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.04);
    },

    bell() {
      if (!this.ctx) return;
      const c = this.ctx;
      const t = c.currentTime;
      [220, 440, 553, 880].forEach((f, i) => {
        const o = c.createOscillator();
        o.frequency.value = f;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.14 / (i + 1), t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 3);
        o.connect(g).connect(this.master);
        o.start(t);
        o.stop(t + 3.1);
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Mapa
  // ---------------------------------------------------------------------------
  let map = new Uint8Array(MW * MH);
  let mapCanvas = null;
  let riverY = [];
  let church = null; // {x, y, w, h} en tiles
  let reachable = [];

  const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH ? T.TREE : map[ty * MW + tx]);
  const tileAtPx = (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
  const setTile = (tx, ty, v) => {
    if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) map[ty * MW + tx] = v;
  };

  function generateMap(seed) {
    rng = mulberry32(seed);
    map = new Uint8Array(MW * MH).fill(T.GRASS);

    // Río serpenteante que cruza el pueblo
    const phase = rand(0, Math.PI * 2);
    riverY = [];
    for (let x = 0; x < MW; x++) {
      const cy = Math.round(34 + Math.sin(x * 0.11 + phase) * 4 + Math.sin(x * 0.047 + phase * 2) * 3);
      riverY[x] = cy;
      for (let y = cy - 1; y <= cy + 2; y++) setTile(x, y, T.WATER);
    }

    // Iglesia (refugio) arriba al centro
    church = { x: 36, y: 5, w: 8, h: 5 };
    for (let y = church.y - 2; y <= church.y + church.h + 4; y++)
      for (let x = church.x - 3; x <= church.x + church.w + 2; x++) setTile(x, y, T.PATH);
    for (let y = church.y; y < church.y + church.h; y++)
      for (let x = church.x; x < church.x + church.w; x++) setTile(x, y, T.CHURCH);

    // Caminos y puentes
    const doorX = church.x + church.w / 2;
    const doorY = church.y + church.h + 4;
    const bridges = [randi(10, 18), randi(36, 44), randi(60, 68)];
    const carvePath = (x0, y0, x1, y1) => {
      let x = x0;
      let y = y0;
      let guard = 0;
      while ((x !== x1 || y !== y1) && guard++ < 500) {
        const t = tileAt(x, y);
        if (t === T.WATER) setTile(x, y, T.BRIDGE);
        else if (t !== T.CHURCH && t !== T.BRIDGE) setTile(x, y, T.PATH);
        if (t === T.WATER || tileAt(x + 1, y) === T.WATER) {
          // atraviesa el río en vertical con puente de 2 de ancho
          if (tileAt(x + 1, y) === T.WATER) setTile(x + 1, y, T.BRIDGE);
        }
        const dx = x1 - x;
        const dy = y1 - y;
        if (Math.abs(dy) > 0 && (rng() < 0.6 || dx === 0)) y += Math.sign(dy);
        else if (dx !== 0) x += Math.sign(dx);
      }
    };
    bridges.forEach((bx) => {
      const ry = riverY[bx];
      // camino iglesia → puente en tramos: primero horizontal a la altura del pueblo
      carvePath(doorX, doorY, bx, ry - 5);
      // cruza el río en línea recta
      for (let y = ry - 5; y <= ry + 6; y++) {
        for (let x = bx; x <= bx + 1; x++) {
          setTile(x, y, tileAt(x, y) === T.WATER ? T.BRIDGE : T.PATH);
        }
      }
      carvePath(bx, ry + 6, clamp(bx + randi(-10, 10), 4, MW - 5), randi(48, 55));
    });
    // Camino horizontal del pueblo
    carvePath(5, doorY + 2, MW - 6, doorY + 2);

    // Cementerio (abajo a la derecha o izquierda)
    const cemLeft = rng() < 0.5;
    const cem = { x: cemLeft ? 4 : MW - 18, y: 46, w: 14, h: 10 };
    for (let y = cem.y; y < cem.y + cem.h; y++)
      for (let x = cem.x; x < cem.x + cem.w; x++) {
        if (tileAt(x, y) === T.WATER) continue;
        const border = x === cem.x || y === cem.y || x === cem.x + cem.w - 1 || y === cem.y + cem.h - 1;
        if (border) setTile(x, y, T.PATH);
        else if (x % 2 === 0 && y % 2 === 0 && rng() < 0.85) setTile(x, y, T.GRAVE);
        else setTile(x, y, T.GRASS);
      }

    // Casas abandonadas
    const areaFree = (x0, y0, w, h) => {
      for (let y = y0 - 1; y <= y0 + h; y++)
        for (let x = x0 - 1; x <= x0 + w; x++) {
          if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) return false;
          if (tileAt(x, y) !== T.GRASS) return false;
        }
      return true;
    };
    let houses = 0;
    for (let tries = 0; tries < 400 && houses < 16; tries++) {
      const w = randi(4, 6);
      const h = randi(4, 5);
      const x0 = randi(3, MW - w - 3);
      const y0 = randi(3, MH - h - 3);
      if (!areaFree(x0, y0, w, h)) continue;
      for (let y = y0; y < y0 + h; y++)
        for (let x = x0; x < x0 + w; x++) {
          const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
          setTile(x, y, edge ? T.WALL : T.FLOOR);
        }
      // dos puertas en lados opuestos para no quedar acorralado
      const side = randi(0, 1);
      if (side === 0) {
        setTile(x0 + randi(1, w - 2), y0, T.FLOOR);
        setTile(x0 + randi(1, w - 2), y0 + h - 1, T.FLOOR);
      } else {
        setTile(x0, y0 + randi(1, h - 2), T.FLOOR);
        setTile(x0 + w - 1, y0 + randi(1, h - 2), T.FLOOR);
      }
      houses++;
    }

    // Bosque: densidad variable con "ruido" de senos
    const n1 = rand(0, 10);
    const n2 = rand(0, 10);
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        if (tileAt(x, y) !== T.GRASS) continue;
        const n = Math.sin(x * 0.17 + n1) * Math.cos(y * 0.21 + n2) + Math.sin((x + y) * 0.07 + n1);
        const density = 0.04 + clamp(n * 0.16, 0, 0.26);
        const nearChurch = dist(x, y, doorX, church.y + 3) < 10;
        const r = rng();
        if (!nearChurch && r < density) setTile(x, y, T.TREE);
        else if (r < density + 0.035) setTile(x, y, T.BUSH);
      }
    // Matorrales en grupos (escondites)
    for (let i = 0; i < 26; i++) {
      const cx = randi(4, MW - 5);
      const cy = randi(4, MH - 5);
      if (dist(cx, cy, doorX, church.y + 3) < 9) continue;
      for (let k = 0; k < 4; k++) {
        const bx = cx + randi(-1, 1);
        const by = cy + randi(-1, 1);
        if (tileAt(bx, by) === T.GRASS || tileAt(bx, by) === T.TREE) setTile(bx, by, T.BUSH);
      }
    }
    // Borde de árboles
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) setTile(x, y, T.TREE);

    computeReachable(Math.floor(doorX), doorY - 2);
    renderMapCanvas();
  }

  function computeReachable(sx, sy) {
    const seen = new Uint8Array(MW * MH);
    const q = [[sx, sy]];
    seen[sy * MW + sx] = 1;
    reachable = [];
    while (q.length) {
      const [x, y] = q.pop();
      reachable.push([x, y]);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const i = ny * MW + nx;
        if (seen[i] || SOLID[map[i]]) continue;
        seen[i] = 1;
        q.push([nx, ny]);
      }
    }
  }

  function randomReachable(filter, tries = 400) {
    for (let i = 0; i < tries; i++) {
      const [tx, ty] = reachable[Math.floor(Math.random() * reachable.length)];
      const x = tx * TILE + TILE / 2;
      const y = ty * TILE + TILE / 2;
      if (!filter || filter(x, y, tx, ty)) return { x, y };
    }
    const [tx, ty] = reachable[Math.floor(Math.random() * reachable.length)];
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  function renderMapCanvas() {
    mapCanvas = document.createElement("canvas");
    mapCanvas.width = MW * TILE;
    mapCanvas.height = MH * TILE;
    const m = mapCanvas.getContext("2d");
    const r = mulberry32(1234);

    const base = {
      [T.GRASS]: ["#1d2b1d", "#1a281b", "#202f1f"],
      [T.TREE]: ["#1a271a"],
      [T.WATER]: ["#0b2131", "#0c2335"],
      [T.BRIDGE]: ["#4a3420"],
      [T.WALL]: ["#2d2724"],
      [T.PATH]: ["#3a3427", "#373124"],
      [T.CHURCH]: ["#3c3936"],
      [T.BUSH]: ["#1d2b1d"],
      [T.GRAVE]: ["#1d2b1d"],
      [T.FLOOR]: ["#2b2119", "#2e231a"],
    };
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const t = tileAt(x, y);
        const cols = base[t];
        m.fillStyle = cols[Math.floor(r() * cols.length)];
        m.fillRect(x * TILE, y * TILE, TILE, TILE);
        const px = x * TILE;
        const py = y * TILE;
        if (t === T.GRASS || t === T.BUSH || t === T.GRAVE) {
          m.fillStyle = "rgba(60,90,50,0.25)";
          for (let i = 0; i < 5; i++) m.fillRect(px + r() * TILE, py + r() * TILE, 1, 3);
        } else if (t === T.PATH) {
          m.fillStyle = "rgba(0,0,0,0.18)";
          for (let i = 0; i < 4; i++) m.fillRect(px + r() * TILE, py + r() * TILE, 2, 2);
        } else if (t === T.BRIDGE) {
          m.fillStyle = "rgba(0,0,0,0.35)";
          for (let i = 0; i < TILE; i += 8) m.fillRect(px, py + i, TILE, 1);
          m.fillStyle = "#2a1c10";
          m.fillRect(px, py, 2, TILE);
          m.fillRect(px + TILE - 2, py, 2, TILE);
        } else if (t === T.WALL) {
          m.fillStyle = "#3a332e";
          for (let i = 0; i < 4; i++)
            for (let j = 0; j < 2; j++) m.fillRect(px + j * 16 + (i % 2) * 8 + 1, py + i * 8 + 1, 14, 6);
        } else if (t === T.FLOOR) {
          m.fillStyle = "rgba(0,0,0,0.25)";
          for (let i = 0; i < TILE; i += 6) m.fillRect(px, py + i, TILE, 1);
        }
      }

    // Iglesia
    const cx = church.x * TILE;
    const cy = church.y * TILE;
    const cw = church.w * TILE;
    const ch = church.h * TILE;
    m.fillStyle = "#2a2522";
    m.fillRect(cx, cy, cw, ch);
    m.fillStyle = "#4a2f2a";
    m.fillRect(cx + 6, cy + 6, cw - 12, ch - 30);
    m.fillStyle = "#5b3a33";
    m.fillRect(cx + 6, cy + 6, cw - 12, (ch - 30) / 2);
    m.fillStyle = "#1a1412";
    m.fillRect(cx + cw / 2 - 2, cy + 6, 4, ch - 30);
    // campanario
    m.fillStyle = "#3a3633";
    m.fillRect(cx + cw / 2 - 22, cy - 26, 44, 40);
    m.fillStyle = "#8a7a50";
    m.fillRect(cx + cw / 2 - 3, cy - 40, 6, 26);
    m.fillRect(cx + cw / 2 - 11, cy - 33, 22, 6);
    // puerta
    m.fillStyle = "#1c120a";
    m.fillRect(cx + cw / 2 - 16, cy + ch - 24, 32, 24);
    m.fillStyle = "#6b4a28";
    m.fillRect(cx + cw / 2 - 14, cy + ch - 22, 13, 22);
    m.fillRect(cx + cw / 2 + 1, cy + ch - 22, 13, 22);

    // Objetos que sobresalen (tumbas, arbustos, árboles)
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const t = tileAt(x, y);
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        if (t === T.GRAVE) {
          m.fillStyle = "rgba(0,0,0,0.4)";
          m.fillRect(px - 8, py + 6, 18, 6);
          m.fillStyle = "#5d5d5a";
          m.beginPath();
          m.moveTo(px - 8, py + 8);
          m.lineTo(px - 8, py - 6);
          m.arc(px, py - 6, 8, Math.PI, 0);
          m.lineTo(px + 8, py + 8);
          m.fill();
          m.fillStyle = "#3a3a38";
          m.fillRect(px - 1, py - 9, 2, 12);
          m.fillRect(px - 4, py - 5, 8, 2);
        } else if (t === T.BUSH) {
          for (let i = 0; i < 4; i++) {
            m.fillStyle = i % 2 ? "#1f3b22" : "#25472a";
            m.beginPath();
            m.arc(px + (r() - 0.5) * 14, py + (r() - 0.5) * 14, 9 + r() * 4, 0, Math.PI * 2);
            m.fill();
          }
        }
      }
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        if (tileAt(x, y) !== T.TREE) continue;
        const px = x * TILE + TILE / 2 + (r() - 0.5) * 6;
        const py = y * TILE + TILE / 2 + (r() - 0.5) * 6;
        const rad = 15 + r() * 6;
        m.fillStyle = "rgba(0,0,0,0.35)";
        m.beginPath();
        m.arc(px + 4, py + 5, rad, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = r() < 0.5 ? "#112014" : "#0f1c12";
        m.beginPath();
        m.arc(px, py, rad, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "rgba(60,90,55,0.25)";
        m.beginPath();
        m.arc(px - rad * 0.3, py - rad * 0.3, rad * 0.55, 0, Math.PI * 2);
        m.fill();
      }
  }

  function solidAt(x, y) {
    return SOLID[tileAtPx(x, y)];
  }
  function collides(x, y, r) {
    return solidAt(x - r, y - r) || solidAt(x + r, y - r) || solidAt(x - r, y + r) || solidAt(x + r, y + r);
  }
  function lineOfSight(ax, ay, bx, by) {
    const d = dist(ax, ay, bx, by);
    const steps = Math.ceil(d / 10);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (OPAQUE[tileAtPx(ax + (bx - ax) * t, ay + (by - ay) * t)]) return false;
    }
    return true;
  }
  function churchDoor() {
    return { x: (church.x + church.w / 2) * TILE, y: (church.y + church.h) * TILE + 14 };
  }
  function churchCenter() {
    return { x: (church.x + church.w / 2) * TILE, y: (church.y + church.h / 2) * TILE + 40 };
  }
  const SANCTUARY_R = 210;
  function inSanctuary(x, y) {
    const c = churchCenter();
    return dist(x, y, c.x, c.y) < SANCTUARY_R;
  }

  // ---------------------------------------------------------------------------
  // Estado del juego
  // ---------------------------------------------------------------------------
  const keys = {};
  const mouse = { x: 0, y: 0 };
  let state = "title"; // title | playing | paused | caught | gameover | win
  let G = null;
  let titleTime = 0;

  function newGame() {
    generateMap((Math.random() * 1e9) | 0);
    const door = churchDoor();
    const player = {
      x: door.x,
      y: door.y + 30,
      angle: Math.PI / 2,
      stamina: STAMINA.max,
      exhausted: false,
      battery: 100,
      flash: true,
      moving: false,
      running: false,
      hidden: false,
      stepTimer: 0,
    };

    const children = [];
    const across = CHILD_NAMES.map((_, i) => i % 2 === 1); // la mitad al otro lado del río
    CHILD_NAMES.forEach((name, i) => {
      let tolerance = 0;
      const pos = randomReachable((x, y, tx, ty) => {
        tolerance += 0.002;
        const farFromChurch = dist(x, y, door.x, door.y) > 950 * (1 - Math.min(tolerance, 0.5));
        const sideOk = across[i] ? ty > riverY[tx] + 3 : ty < riverY[tx] - 2;
        const apart = children.every((c) => dist(c.x, c.y, x, y) > 520 * (1 - Math.min(tolerance, 0.6)));
        const t = tileAt(tx, ty);
        return farFromChurch && apart && t !== T.WATER && t !== T.BRIDGE && (sideOk || tolerance > 0.6);
      }, 2000);
      children.push({ name, x: pos.x, y: pos.y, state: "lost", sobTimer: rand(0, 3), bob: rand(0, 6), voice: 500 + i * 45 });
    });

    const batteries = [];
    for (let i = 0; i < 8; i++) {
      const p = randomReachable((x, y) => dist(x, y, door.x, door.y) > 350 && batteries.every((b) => dist(b.x, b.y, x, y) > 300));
      batteries.push({ x: p.x, y: p.y, taken: false });
    }

    const lloronaStart = randomReachable((x, y, tx, ty) => Math.abs(ty - riverY[tx]) < 4 && dist(x, y, door.x, door.y) > 1100, 1000);
    const llorona = {
      x: lloronaStart.x,
      y: lloronaStart.y,
      state: "wander",
      target: null,
      lastSeen: null,
      loseTimer: 0,
      farTimer: 0,
      wailTimer: rand(6, 10),
      vx: 0,
      vy: 0,
    };

    const fireflies = [];
    for (let i = 0; i < 40; i++) {
      const tx = randi(2, MW - 3);
      fireflies.push({ x: tx * TILE, y: (riverY[tx] + rand(-3, 4)) * TILE, ph: rand(0, 6), sp: rand(0.5, 1.5) });
    }
    const fog = [];
    for (let i = 0; i < 40; i++) fog.push({ x: rand(0, MW * TILE), y: rand(0, MH * TILE), r: rand(80, 200), vx: rand(4, 14) });

    G = {
      player,
      children,
      followers: [],
      delivered: 0,
      batteries,
      llorona,
      fireflies,
      fog,
      trail: [],
      time: 0,
      fear: 0,
      heartTimer: 0,
      cam: { x: player.x, y: player.y },
      shake: 0,
      messages: [],
      caughtTimer: 0,
      endReason: "",
      hintedBush: false,
      chaseCount: 0,
      reclaimed: 0,
      ambTimer: 2,
      whisperTimer: 5,
    };
    say("Encuentra a los 4 niños perdidos y tráelos a la iglesia antes del amanecer.", 6);
    say("Escucha su llanto... y no dejes que ELLA te vea.", 5);
  }

  function say(text, dur = 4, color = "#e8e0d0") {
    G.messages.push({ text, t: dur, max: dur, color });
    if (G.messages.length > 4) G.messages.shift();
  }

  // ---------------------------------------------------------------------------
  // Entrada
  // ---------------------------------------------------------------------------
  // Se decide por la última entrada usada (hay portátiles con pantalla táctil y ratón)
  let isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const touch = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0, run: false };

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    if (state === "title" && (k === "enter" || k === " ")) start();
    else if ((state === "gameover" || state === "win") && (k === "enter" || k === " ")) start();
    else if (state === "playing" && (k === "f" || k === "e")) toggleFlash();
    else if (k === "escape" || k === "p") togglePause();
    if (k === "m") Sound.toggleMute();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  window.addEventListener("blur", () => {
    for (const k in keys) keys[k] = false;
    if (state === "playing") state = "paused";
  });
  canvas.addEventListener("mousemove", (e) => {
    isTouch = false;
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  canvas.addEventListener("mousedown", (e) => {
    if (state === "title" || state === "gameover" || state === "win") start();
    else if (state === "paused") togglePause();
    else if (state === "playing" && e.button === 2) toggleFlash();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  function touchButtons() {
    const r = Math.min(W, H) * 0.09 + 10;
    return {
      run: { x: W - r * 1.3, y: H - r * 1.3, r },
      flash: { x: W - r * 3.4, y: H - r * 1.0, r: r * 0.8 },
    };
  }
  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      isTouch = true;
      if (state !== "playing") {
        if (state === "paused") togglePause();
        else start();
        return;
      }
      const b = touchButtons();
      for (const t of e.changedTouches) {
        const x = t.clientX;
        const y = t.clientY;
        if (dist(x, y, b.flash.x, b.flash.y) < b.flash.r * 1.2) toggleFlash();
        else if (dist(x, y, b.run.x, b.run.y) < b.run.r * 1.2) touch.run = t.identifier;
        else if (x < W * 0.6 && !touch.active) {
          touch.active = true;
          touch.id = t.identifier;
          touch.sx = touch.x = x;
          touch.sy = touch.y = y;
        }
      }
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches)
        if (t.identifier === touch.id) {
          touch.x = t.clientX;
          touch.y = t.clientY;
        }
    },
    { passive: false },
  );
  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) {
        touch.active = false;
        touch.id = null;
      }
      if (t.identifier === touch.run) touch.run = false;
    }
  };
  canvas.addEventListener("touchend", endTouch);
  canvas.addEventListener("touchcancel", endTouch);

  function start() {
    Sound.init();
    newGame();
    state = "playing";
    Sound.bell();
  }
  function togglePause() {
    if (state === "playing") state = "paused";
    else if (state === "paused") state = "playing";
  }
  function toggleFlash() {
    const p = G.player;
    if (!p.flash && p.battery <= 0) {
      say("La linterna no tiene batería.", 2, "#c9a27a");
      return;
    }
    p.flash = !p.flash;
    Sound.click();
  }

  // ---------------------------------------------------------------------------
  // Actualización
  // ---------------------------------------------------------------------------
  function update(dt) {
    const p = G.player;
    const L = G.llorona;
    G.time += dt;

    // --- Jugador ---
    let ix = 0;
    let iy = 0;
    if (keys.w || keys.arrowup) iy -= 1;
    if (keys.s || keys.arrowdown) iy += 1;
    if (keys.a || keys.arrowleft) ix -= 1;
    if (keys.d || keys.arrowright) ix += 1;
    if (touch.active) {
      const dx = touch.x - touch.sx;
      const dy = touch.y - touch.sy;
      const m = Math.hypot(dx, dy);
      if (m > 8) {
        ix = dx / Math.max(m, 50);
        iy = dy / Math.max(m, 50);
      }
    }
    const im = Math.hypot(ix, iy);
    if (im > 1) {
      ix /= im;
      iy /= im;
    }
    p.moving = im > 0.1;
    const wantRun = (keys.shift || touch.run !== false) && p.moving;
    p.running = wantRun && !p.exhausted && p.stamina > 0;
    if (p.running) {
      p.stamina = Math.max(0, p.stamina - STAMINA.drain * dt);
      if (p.stamina <= 0) {
        p.exhausted = true;
        say("¡Estás agotado!", 2, "#c9a27a");
      }
    } else {
      p.stamina = Math.min(STAMINA.max, p.stamina + STAMINA.regen * dt * (p.moving ? 0.6 : 1));
      if (p.exhausted && p.stamina >= STAMINA.recover) p.exhausted = false;
    }
    const tile = tileAtPx(p.x, p.y);
    let speed = p.running ? PLAYER.run : PLAYER.walk;
    if (p.exhausted) speed *= 0.8;
    if (tile === T.WATER) speed *= 0.5;
    if (tile === T.BUSH) speed *= 0.75;
    const nx = p.x + ix * speed * dt;
    const ny = p.y + iy * speed * dt;
    if (!collides(nx, p.y, PLAYER.radius)) p.x = nx;
    if (!collides(p.x, ny, PLAYER.radius)) p.y = ny;

    // Puntería: ratón en PC; dirección de movimiento en táctil
    if (isTouch && touch.active && p.moving) {
      p.angle = Math.atan2(iy, ix);
    } else if (!isTouch) {
      const sx = p.x - G.cam.x + W / 2;
      const sy = p.y - G.cam.y + H / 2;
      p.angle = Math.atan2(mouse.y - sy, mouse.x - sx);
    }

    // Pasos
    if (p.moving) {
      p.stepTimer -= dt;
      if (p.stepTimer <= 0) {
        p.stepTimer = p.running ? 0.27 : 0.45;
        Sound.step(p.running ? 0.2 : 0.1, SURFACE[tile] || "dirt");
      }
    }

    // Rastro para los niños que te siguen
    const last = G.trail[G.trail.length - 1];
    if (!last || dist(last.x, last.y, p.x, p.y) > 4) {
      G.trail.push({ x: p.x, y: p.y });
      if (G.trail.length > 300) G.trail.shift();
    }

    // Linterna
    if (p.flash) {
      p.battery = Math.max(0, p.battery - BATTERY_DRAIN * dt);
      if (p.battery <= 0) {
        p.flash = false;
        say("La linterna se apagó...", 3, "#c9a27a");
        Sound.click();
      }
    }

    p.hidden = tile === T.BUSH && !p.running && !p.flash;
    if (tile === T.BUSH && !G.hintedBush) {
      G.hintedBush = true;
      say("Entre los arbustos, quieto y sin luz, ella no te ve.", 4, "#9fc29a");
    }

    // Baterías
    for (const b of G.batteries) {
      if (!b.taken && dist(b.x, b.y, p.x, p.y) < 22) {
        b.taken = true;
        p.battery = Math.min(100, p.battery + 45);
        Sound.chime();
        say("Pilas encontradas (+45% de batería).", 2.5, "#e6d37a");
      }
    }

    // --- Niños ---
    for (const c of G.children) {
      c.bob += dt * 6;
      if (c.state === "lost") {
        if (dist(c.x, c.y, p.x, p.y) < 24) {
          c.state = "following";
          G.followers.push(c);
          Sound.chime();
          say(`Encontraste a ${c.name}. «${pick(CHILD_LINES)}»`, 4.5, "#bfe0ff");
          continue;
        }
        c.sobTimer -= dt;
        if (c.sobTimer <= 0) {
          c.sobTimer = rand(2.5, 4.5);
          const d = dist(c.x, c.y, p.x, p.y);
          const vol = clamp(1 - d / 750, 0, 1);
          Sound.sob(vol * vol, (c.x - p.x) / 400, c.voice);
        }
      }
    }
    G.followers.forEach((c, i) => {
      const idx = Math.max(0, G.trail.length - 1 - (i + 1) * 9);
      const tgt = G.trail[idx];
      if (tgt) {
        c.x = lerp(c.x, tgt.x, Math.min(1, dt * 8));
        c.y = lerp(c.y, tgt.y, Math.min(1, dt * 8));
      }
    });
    const door = churchDoor();
    if (G.followers.length && dist(p.x, p.y, door.x, door.y) < 60) {
      const names = G.followers.map((c) => c.name).join(", ");
      for (const c of G.followers) c.state = "safe";
      G.delivered += G.followers.length;
      G.followers = [];
      Sound.bell();
      if (G.delivered >= CHILD_NAMES.length) {
        win();
        return;
      }
      say(`${names} ${names.includes(",") ? "están" : "está"} a salvo en la iglesia. Faltan ${CHILD_NAMES.length - G.delivered}.`, 4.5, "#e6d37a");
      L.state = "wander";
      L.target = null;
    }

    updateLlorona(dt);
    if (state !== "playing") return;

    // --- Miedo y latidos ---
    const dL = dist(L.x, L.y, p.x, p.y);
    const targetFear = clamp(1 - dL / 420, 0, 1) * 0.85 + (L.state === "chase" ? 0.3 : 0);
    G.fear = lerp(G.fear, clamp(targetFear, 0, 1), Math.min(1, dt * 2));
    G.heartTimer -= dt;
    if (G.heartTimer <= 0 && G.fear > 0.08) {
      G.heartTimer = 1.15 - G.fear * 0.72;
      Sound.heartbeat(G.fear * 0.8);
    }
    // Ambiente: río, pavor y sonidos de la noche
    const ptx = Math.floor(p.x / TILE);
    const riverDist = Math.abs(p.y / TILE - (riverY[clamp(ptx, 0, MW - 1)] + 0.5));
    Sound.setLevels(clamp(1 - riverDist / 12, 0, 1), clamp(G.fear * 1.2 - 0.15, 0, 1));
    G.ambTimer -= dt;
    if (G.ambTimer <= 0 && Sound.ctx) {
      G.ambTimer = rand(3, 8);
      const pan = rand(-1, 1);
      const r = Math.random();
      if (riverDist < 8 && r < 0.3) Sound.frog(rand(0.4, 0.8), pan);
      else if (r < 0.45) Sound.crickets(rand(0.5, 1), pan);
      else if (r < 0.6) Sound.owl(rand(0.4, 0.8), pan);
      else if (r < 0.72) Sound.branch(rand(0.3, 0.7), pan);
      else if (r < 0.82) Sound.gust(rand(0.5, 1));
      else if (r < 0.9) Sound.howl(rand(0.3, 0.6), pan);
    }
    // Con mucho miedo oyes susurros a tu alrededor
    G.whisperTimer -= dt;
    if (G.whisperTimer <= 0) {
      G.whisperTimer = rand(4, 9);
      if (G.fear > 0.45) Sound.whisper(G.fear * 0.6, rand(-1, 1));
    }
    G.shake = Math.max(G.shake - dt * 3, G.fear > 0.7 ? (G.fear - 0.7) * 6 : 0);

    // Cámara
    G.cam.x = lerp(G.cam.x, p.x, Math.min(1, dt * 6));
    G.cam.y = lerp(G.cam.y, p.y, Math.min(1, dt * 6));
    G.cam.x = clamp(G.cam.x, W / 2, MW * TILE - W / 2);
    G.cam.y = clamp(G.cam.y, H / 2, MH * TILE - H / 2);
    if (MW * TILE < W) G.cam.x = (MW * TILE) / 2;
    if (MH * TILE < H) G.cam.y = (MH * TILE) / 2;

    // Ambiente
    for (const f of G.fog) {
      f.x += f.vx * dt;
      if (f.x - f.r > MW * TILE) f.x = -f.r;
    }
    for (const m of G.messages) m.t -= dt;
    G.messages = G.messages.filter((m) => m.t > 0);

    if (G.time >= NIGHT_SECONDS) lose("dawn");
  }

  const CHILD_LINES = [
    "Tengo miedo... la oí llorar en el río.",
    "¡Llévame con mi mamá, por favor!",
    "Ella me llamaba 'mijo'... pero no es mi mamá.",
    "No apagues la luz... o mejor sí, para que no nos vea.",
  ];
  const WAILS = ["¡Aaay, mis hijos!", "¿Dónde están mis hijos?", "Aaaaay...", "¡Mis hijooos!"];

  function updateLlorona(dt) {
    const p = G.player;
    const L = G.llorona;
    const d = dist(L.x, L.y, p.x, p.y);
    const playerSafe = inSanctuary(p.x, p.y);

    // ¿Te ve?
    let sightRange = p.flash ? 340 : 175;
    if (p.running) sightRange += 40;
    let canSee = !p.hidden && d < sightRange && lineOfSight(L.x, L.y, p.x, p.y);
    if (p.hidden && d < 30) canSee = true;
    if (playerSafe) canSee = false;

    // ¿Te oye?
    let noise = 0;
    if (p.moving) noise = p.running ? 280 : 95;
    if (p.moving && tileAtPx(p.x, p.y) === T.WATER) noise += 80;
    if (p.hidden) noise = 0;
    const hears = !playerSafe && d < noise;

    if (canSee) {
      if (L.state !== "chase") {
        G.chaseCount++;
        Sound.stinger(1);
        Sound.scream(clamp(1 - d / 500, 0.3, 0.75));
        say("¡TE VIO! ¡Corre!", 2.5, "#ff6b6b");
        G.shake = 1.2;
      }
      L.state = "chase";
      L.lastSeen = { x: p.x, y: p.y };
      L.loseTimer = 0;
    } else if (L.state === "chase") {
      L.loseTimer += dt;
      if (L.loseTimer > 2.2 || playerSafe) {
        L.state = "investigate";
        L.target = L.lastSeen;
        if (playerSafe) L.target = null;
        say("Te perdió de vista...", 2, "#9fc29a");
      }
    } else if (hears) {
      L.state = "investigate";
      L.target = { x: p.x + rand(-50, 50), y: p.y + rand(-50, 50) };
    }

    // Objetivo según estado
    let tx;
    let ty;
    let spd;
    const rescueBonus = (G.delivered + G.followers.length) * LLORONA.perChild;
    if (L.state === "chase") {
      const tgt = canSee ? p : L.lastSeen;
      tx = tgt.x;
      ty = tgt.y;
      spd = LLORONA.chase + rescueBonus;
    } else if (L.state === "investigate" && L.target) {
      tx = L.target.x;
      ty = L.target.y;
      spd = LLORONA.investigate + rescueBonus * 0.5;
      if (dist(L.x, L.y, tx, ty) < 16) {
        L.state = "wander";
        L.target = null;
      }
    } else {
      L.state = "wander";
      if (!L.target || dist(L.x, L.y, L.target.x, L.target.y) < 20) L.target = wanderTarget();
      tx = L.target.x;
      ty = L.target.y;
      spd = LLORONA.wander + rescueBonus * 0.4;
    }
    if (tileAtPx(L.x, L.y) === T.WATER) spd *= 1.25; // el río es su terreno

    // Movimiento suave (flota, atraviesa árboles y muros)
    if (tx !== undefined) {
      const ddx = tx - L.x;
      const ddy = ty - L.y;
      const m = Math.hypot(ddx, ddy) || 1;
      const desiredX = (ddx / m) * spd;
      const desiredY = (ddy / m) * spd;
      L.vx = lerp(L.vx, desiredX, Math.min(1, dt * 4));
      L.vy = lerp(L.vy, desiredY, Math.min(1, dt * 4));
      L.x += L.vx * dt;
      L.y += L.vy * dt;
    }
    // No puede entrar a terreno sagrado
    const c = churchCenter();
    const dc = dist(L.x, L.y, c.x, c.y);
    if (dc < SANCTUARY_R + 10) {
      const k = (SANCTUARY_R + 10) / (dc || 1);
      L.x = c.x + (L.x - c.x) * k;
      L.y = c.y + (L.y - c.y) * k;
    }

    // Se teletransporta si te alejas mucho
    if (L.state === "wander" && d > 750) L.farTimer += dt;
    else L.farTimer = 0;
    if (L.farTimer > 14 && !playerSafe) {
      const pos = randomReachable((x, y) => {
        const dd = dist(x, y, p.x, p.y);
        if (dd < 380 || dd > 560 || inSanctuary(x, y)) return false;
        const a = Math.atan2(y - p.y, x - p.x);
        const diff = Math.abs(Math.atan2(Math.sin(a - p.angle), Math.cos(a - p.angle)));
        return diff > 1.2; // fuera del haz de la linterna
      });
      L.x = pos.x;
      L.y = pos.y;
      L.farTimer = 0;
      L.target = null;
      L.wailTimer = 0.5;
    }

    // Lamento
    L.wailTimer -= dt;
    if (L.wailTimer <= 0) {
      L.wailTimer = rand(9, 16);
      const vol = clamp(1 - d / 950, 0, 1);
      const pan = (L.x - p.x) / 450;
      const kind = Math.random();
      if (kind < 0.4) Sound.wail(vol, pan);
      else if (kind < 0.65) Sound.cry(vol, pan);
      else if (kind < 0.85) Sound.moan(vol, pan);
      else Sound.whisper(vol * 1.4, pan);
      if (d < 650) say(`«${pick(WAILS)}»`, 3, "#d8d8ff");
    }

    // Se lleva a los niños que te siguen
    for (let i = G.followers.length - 1; i >= 0; i--) {
      const ch = G.followers[i];
      if (dist(ch.x, ch.y, L.x, L.y) < 18) {
        G.followers.splice(i, 1);
        const pos = randomReachable((x, y) => dist(x, y, p.x, p.y) > 800 && !inSanctuary(x, y));
        ch.x = pos.x;
        ch.y = pos.y;
        ch.state = "lost";
        G.reclaimed++;
        Sound.wail(0.9, 0);
        say(`¡La Llorona se llevó a ${ch.name}! Búscalo otra vez...`, 4, "#ff6b6b");
      }
    }

    // ¡Te atrapó!
    if (d < LLORONA.catchDist && !playerSafe) {
      state = "caught";
      G.caughtTimer = 0;
      G.endReason = "caught";
      Sound.scream(1);
    }
  }

  function wanderTarget() {
    const p = G.player;
    const r = Math.random();
    let pos;
    if (r < 0.35) {
      // acecha cerca de ti
      pos = { x: p.x + rand(-380, 380), y: p.y + rand(-380, 380) };
    } else if (r < 0.75) {
      // vaga por la orilla del río
      const tx = randi(3, MW - 4);
      pos = { x: tx * TILE, y: (riverY[tx] + rand(-1, 3)) * TILE };
    } else {
      pos = { x: rand(3, MW - 3) * TILE, y: rand(3, MH - 3) * TILE };
    }
    if (inSanctuary(pos.x, pos.y)) pos.y += SANCTUARY_R * 1.4;
    pos.x = clamp(pos.x, 2 * TILE, (MW - 2) * TILE);
    pos.y = clamp(pos.y, 2 * TILE, (MH - 2) * TILE);
    return pos;
  }

  function lose(reason) {
    Sound.setLevels(0, 0);
    G.endReason = reason;
    state = "gameover";
  }
  function win() {
    Sound.setLevels(0, 0);
    state = "win";
  }

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------
  function drawPerson(x, y, angle, opts) {
    const { body, head, size = 1, bob = 0 } = opts;
    ctx.save();
    ctx.translate(x, y + Math.sin(bob) * 1.2);
    ctx.scale(size, size);
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, 9, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 2, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 2, -6 + Math.sin(angle) * 2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // La Llorona: alta, encorvada, vestido de novia podrido y empapado, pelo mojado sobre la cara
  function drawLlorona(x, y, alpha, t, chasing, vx = 0) {
    const glitch = Math.random() < (chasing ? 0.08 : 0.03);
    ctx.save();
    ctx.translate(x + (glitch ? rand(-5, 5) : 0), y + Math.sin(t * 1.7) * 2.5 - 10);
    ctx.globalAlpha = alpha;
    const sway = clamp(-vx / 60, -1, 1); // el vestido y el pelo quedan atrás al moverse

    // niebla negra a sus pies
    const mist = ctx.createRadialGradient(0, 30, 2, 0, 30, 30);
    mist.addColorStop(0, "rgba(0,0,0,0.6)");
    mist.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = mist;
    ctx.fillRect(-30, 0, 60, 60);

    // vestido: harapos largos con manchas de agua y lodo
    const grad = ctx.createLinearGradient(0, -14, 0, 36);
    grad.addColorStop(0, "rgba(214,214,206,0.97)");
    grad.addColorStop(0.55, "rgba(160,162,152,0.9)");
    grad.addColorStop(1, "rgba(40,44,40,0.25)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-5, -12);
    ctx.quadraticCurveTo(-13, 6, -15 + sway * 4, 26);
    const strips = 9;
    for (let i = 0; i <= strips; i++) {
      const hx = -15 + sway * 4 + i * (30 / strips);
      const long = (i * 7) % 3 === 0 ? 12 : i % 2 ? 2 : 7; // jirones de distinto largo
      const hy = 26 + long + Math.sin(t * 6 + i * 1.7) * 3;
      ctx.lineTo(hx + sway * long * 0.6, hy);
      ctx.lineTo(hx + 1.6 + sway * 2, 24 + Math.sin(t * 5 + i) * 2);
    }
    ctx.quadraticCurveTo(13, 6, 5, -12);
    ctx.closePath();
    ctx.fill();
    // manchas y desgarros
    ctx.fillStyle = "rgba(30,24,18,0.45)";
    ctx.beginPath();
    ctx.ellipse(-5, 18, 4, 7, 0.3, 0, Math.PI * 2);
    ctx.ellipse(6, 13, 3, 5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(1, 2, 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // gotas que caen del vestido
    ctx.fillStyle = "rgba(150,170,190,0.5)";
    for (let i = 0; i < 3; i++) {
      const dy = ((t * 40 + i * 13) % 18);
      ctx.fillRect(-10 + i * 9, 28 + dy, 1, 2);
    }

    // brazos larguísimos y huesudos con garras
    const reach = chasing ? 1 : 0;
    ctx.strokeStyle = "rgba(196,200,190,0.95)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    [-1, 1].forEach((side) => {
      const tw = Math.sin(t * (chasing ? 11 : 2.5) + side) * (chasing ? 2.5 : 1.5);
      const ex = side * (11 + reach * 6);
      const ey = 6 - reach * 10 + tw;
      const hx = side * (14 + reach * 12);
      const hy = 22 - reach * 26 + tw;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(side * 6, -7);
      ctx.lineTo(ex, ey);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      // dedos
      ctx.lineWidth = 1;
      for (let f = -1; f <= 1; f++) {
        const a = Math.atan2(hy - ey, hx - ex) + f * 0.35;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6);
        ctx.stroke();
      }
    });

    // cabeza ladeada, con tirones bruscos
    const twitch = Math.sin(t * 0.9) > 0.92 ? Math.sin(t * 40) * 0.5 : 0;
    ctx.save();
    ctx.translate(0, -18);
    ctx.rotate(0.35 + twitch);
    // cara gris verdosa
    ctx.fillStyle = "#b9bfb2";
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // ojo hueco que asoma entre el pelo
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(1.8, -1.2, 1.8, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    if (chasing) {
      ctx.shadowColor = "#ff1a1a";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#ff3030";
    } else ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(1.4, -1.6, 1, 1);
    ctx.shadowBlur = 0;
    // boca estirada
    ctx.fillStyle = "#0a0000";
    ctx.beginPath();
    ctx.ellipse(0.8, 3.6, 1.5, chasing ? 3.4 : 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // lágrima negra
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(1.8, 1);
    ctx.lineTo(2.2, 6);
    ctx.stroke();
    // pelo negro mojado: mechones que caen sobre la cara hasta la cintura
    ctx.fillStyle = "#040404";
    ctx.beginPath();
    ctx.ellipse(-0.5, -3, 6.5, 5, 0, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = "#050505";
    ctx.lineCap = "round";
    const locks = [-6, -4.5, -3, -1.5, -0.3, 4.2, 5.6, 6.6];
    locks.forEach((lx, i) => {
      const len = 14 + ((i * 5) % 4) * 4;
      const w = Math.sin(t * 3 + i) * 1.5 + sway * 3;
      ctx.lineWidth = i === 4 ? 1.4 : 2;
      ctx.beginPath();
      ctx.moveTo(lx * 0.8, -5);
      ctx.quadraticCurveTo(lx + w * 0.5, len * 0.45, lx * 1.2 + w, len);
      ctx.stroke();
    });
    ctx.restore();

    // velo roto
    ctx.fillStyle = "rgba(220,225,230,0.14)";
    ctx.beginPath();
    ctx.moveTo(-8, -26);
    ctx.quadraticCurveTo(0, -32, 8, -26);
    ctx.lineTo(13 + sway * 6, 4);
    ctx.lineTo(4, -2);
    ctx.lineTo(-2, 6);
    ctx.lineTo(-13 + sway * 6, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // interferencia: franjas desplazadas de su silueta
    if (glitch && alpha > 0.3) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.8)";
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 16 + rand(-6, 6), y - 40 + Math.random() * 70, 32, rand(1, 3));
      ctx.restore();
    }
  }

  function drawBattery(x, y, t) {
    ctx.save();
    ctx.translate(x, y + Math.sin(t * 3) * 1.5);
    ctx.fillStyle = "#c9b23a";
    ctx.fillRect(-4, -7, 8, 13);
    ctx.fillStyle = "#222";
    ctx.fillRect(-4, 1, 8, 5);
    ctx.fillStyle = "#ddd";
    ctx.fillRect(-2, -9, 4, 2);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (state === "title") return drawTitle();
    if (!G) return;

    const p = G.player;
    const L = G.llorona;
    const t = G.time;
    const shx = (Math.random() - 0.5) * G.shake * 8;
    const shy = (Math.random() - 0.5) * G.shake * 8;
    const ox = Math.round(W / 2 - G.cam.x + shx);
    const oy = Math.round(H / 2 - G.cam.y + shy);

    // --- Mundo ---
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(mapCanvas, 0, 0);

    // Agua animada
    const x0 = Math.max(0, Math.floor(-ox / TILE));
    const x1 = Math.min(MW - 1, Math.ceil((W - ox) / TILE));
    const y0 = Math.max(0, Math.floor(-oy / TILE));
    const y1 = Math.min(MH - 1, Math.ceil((H - oy) / TILE));
    ctx.fillStyle = "rgba(120,160,200,0.12)";
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        if (tileAt(tx, ty) !== T.WATER) continue;
        const wx = tx * TILE;
        const wy = ty * TILE;
        const o = Math.sin(t * 1.5 + tx * 0.7 + ty * 1.3) * 8;
        ctx.fillRect(wx + 8 + o, wy + 10, 10, 1);
        ctx.fillRect(wx + 4 - o, wy + 22, 8, 1);
      }

    for (const b of G.batteries) if (!b.taken) drawBattery(b.x, b.y, t);

    // Entidades ordenadas por Y
    const ents = [];
    for (const c of G.children)
      if (c.state !== "safe") ents.push({ y: c.y, draw: () => drawPerson(c.x, c.y, Math.PI / 2, { body: "#7d97b8", head: "#c9a98a", size: 0.72, bob: c.bob }) });
    ents.push({
      y: p.y,
      draw: () => {
        ctx.globalAlpha = p.hidden ? 0.55 : 1;
        drawPerson(p.x, p.y, p.angle, { body: "#8a5a3c", head: "#d1a77f", bob: p.moving ? t * 14 : 0 });
        ctx.globalAlpha = 1;
      },
    });
    ents.push({ y: L.y, draw: () => drawLlorona(L.x, L.y, 0.95, t, L.state === "chase", L.vx) });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());

    // Niebla (se ilumina con la linterna)
    for (const f of G.fog) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, "rgba(170,180,200,0.10)");
      g.addColorStop(1, "rgba(170,180,200,0)");
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
    ctx.restore();

    // --- Oscuridad ---
    drawDarkness(ox, oy, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(dark, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Brillos que atraviesan la oscuridad
    ctx.save();
    ctx.translate(ox, oy);
    for (const f of G.fireflies) {
      const fx = f.x + Math.sin(t * f.sp + f.ph) * 20;
      const fy = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * 14;
      const a = 0.35 + Math.sin(t * 3 + f.ph) * 0.35;
      if (a <= 0.05) continue;
      ctx.fillStyle = `rgba(200,255,140,${a})`;
      ctx.fillRect(fx, fy, 2, 2);
    }
    // Silueta de la Llorona apenas visible en la oscuridad
    const dL = dist(L.x, L.y, p.x, p.y);
    if (dL < 320) {
      const flick = Math.random() < 0.85 ? 1 : 0;
      drawLlorona(L.x, L.y, (1 - dL / 320) * 0.22 * flick, t, L.state === "chase", L.vx);
    }
    if (L.state === "chase") {
      ctx.fillStyle = "rgba(255,40,40,0.9)";
      ctx.fillRect(L.x + 1, L.y - 30 + Math.sin(t * 1.7) * 2.5, 2, 2);
    }
    ctx.restore();

    drawEffects(t);
    drawHUD(ox, oy, t);

    if (state === "caught") drawJumpscare();
    if (state === "paused") drawOverlay("PAUSA", ["Pulsa P / Esc o haz clic para continuar", "M: silenciar"]);
    if (state === "gameover") drawGameOver();
    if (state === "win") drawWin();
  }

  function drawDarkness(ox, oy, t) {
    const p = G.player;
    dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    dctx.globalCompositeOperation = "source-over";
    const dawn = clamp((G.time - NIGHT_SECONDS * 0.85) / (NIGHT_SECONDS * 0.15), 0, 1);
    dctx.fillStyle = `rgba(2,3,9,${0.965 - dawn * 0.35})`;
    dctx.fillRect(0, 0, W, H);
    dctx.globalCompositeOperation = "destination-out";

    const px = p.x + ox;
    const py = p.y + oy;
    const light = (x, y, r, a) => {
      const g = dctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g;
      dctx.beginPath();
      dctx.arc(x, y, r, 0, Math.PI * 2);
      dctx.fill();
    };

    // Halo propio
    light(px, py, 70, 0.75);

    // Linterna
    if (p.flash) {
      const low = p.battery < 20;
      const flicker = (low && Math.random() < 0.15) || (G.fear > 0.75 && Math.random() < 0.12);
      if (!flicker) {
        const len = 330 * (low ? 0.65 + p.battery / 60 : 1);
        const spread = 0.42;
        const g = dctx.createRadialGradient(px, py, 10, px, py, len);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(0.7, "rgba(0,0,0,0.85)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        dctx.fillStyle = g;
        dctx.beginPath();
        dctx.moveTo(px, py);
        dctx.arc(px, py, len, p.angle - spread, p.angle + spread);
        dctx.closePath();
        dctx.fill();
        light(px, py, 95, 0.6);
      }
    }

    // Faroles de la iglesia
    const door = churchDoor();
    const lampFlick = 0.85 + Math.sin(t * 9) * 0.05 + Math.random() * 0.05;
    light(door.x + ox - 30, door.y + oy - 6, 120 * lampFlick, 0.9);
    light(door.x + ox + 30, door.y + oy - 6, 120 * lampFlick, 0.9);
    light(door.x + ox, door.y + oy - 60, 200, 0.35);

    dctx.globalCompositeOperation = "source-over";
    // Tinte cálido de los faroles
    const warm = dctx.createRadialGradient(door.x + ox, door.y + oy, 0, door.x + ox, door.y + oy, 150);
    warm.addColorStop(0, "rgba(255,170,60,0.12)");
    warm.addColorStop(1, "rgba(255,170,60,0)");
    dctx.fillStyle = warm;
    dctx.fillRect(door.x + ox - 150, door.y + oy - 150, 300, 300);
  }

  function drawEffects(t) {
    // Viñeta roja según el miedo
    if (G.fear > 0.05) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(80,0,0,0)");
      g.addColorStop(1, `rgba(90,0,0,${G.fear * 0.65})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // Grano
    const grains = 120 + Math.floor(G.fear * 400);
    for (let i = 0; i < grains; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.25)";
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // Interferencia cuando está muy cerca
    if (G.fear > 0.6 && Math.random() < G.fear * 0.3) {
      const y = Math.random() * H;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.06})`;
      ctx.fillRect(0, y, W, 2 + Math.random() * 6);
    }
    // Viñeta base
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    void t;
  }

  function bar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
    ctx.fillStyle = "#cfc6b8";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, x, y - 4);
  }

  function edgeArrow(wx, wy, ox, oy, color, alpha) {
    const sx = wx + ox;
    const sy = wy + oy;
    const margin = 40;
    if (sx > margin && sx < W - margin && sy > margin && sy < H - margin) return;
    const cx = W / 2;
    const cy = H / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const rx = W / 2 - margin;
    const ry = H / 2 - margin;
    const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHUD(ox, oy, t) {
    const p = G.player;
    const pad = 18;
    const bw = Math.min(170, W * 0.32);
    bar(pad, pad + 16, bw, 8, p.battery / 100, p.battery < 20 ? "#c9643a" : "#e6d37a", `Linterna ${Math.ceil(p.battery)}%${p.flash ? "" : " (apagada)"}`);
    bar(pad, pad + 50, bw, 8, p.stamina / STAMINA.max, p.exhausted ? "#7a4a4a" : "#8fbf8a", p.exhausted ? "Aliento (agotado)" : "Aliento");

    ctx.font = "15px Georgia, serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#e8e0d0";
    const following = G.followers.length ? `  ·  te siguen: ${G.followers.length}` : "";
    ctx.fillText(`Niños a salvo: ${G.delivered} / ${CHILD_NAMES.length}${following}`, pad, pad + 72);

    if (p.hidden) {
      ctx.fillStyle = "#9fc29a";
      ctx.fillText("Escondido", pad, pad + 94);
    } else if (inSanctuary(p.x, p.y)) {
      ctx.fillStyle = "#e6d37a";
      ctx.fillText("Terreno sagrado: aquí no puede entrar", pad, pad + 94);
    }

    // Reloj
    const frac = G.time / NIGHT_SECONDS;
    const mins = Math.floor(frac * 300);
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    ctx.textAlign = "right";
    ctx.font = "22px Georgia, serif";
    ctx.fillStyle = frac > 0.85 ? "#ffb070" : "#e8e0d0";
    ctx.fillText(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} a. m.`, W - pad, pad);
    ctx.font = "12px Georgia, serif";
    ctx.fillStyle = "#9a9284";
    ctx.fillText("Amanece a las 05:00", W - pad, pad + 28);

    // Flechas de guía
    if (G.followers.length) {
      const d = churchDoor();
      edgeArrow(d.x, d.y, ox, oy, "#e6d37a", 0.8);
    }
    for (const c of G.children) {
      if (c.state !== "lost") continue;
      const dd = dist(c.x, c.y, p.x, p.y);
      if (dd < 520) edgeArrow(c.x, c.y, ox, oy, "#bfe0ff", (1 - dd / 520) * (0.5 + Math.sin(t * 4) * 0.3));
    }

    // Mensajes
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const baseY = H - (isTouch ? 190 : 60);
    ctx.font = `${W < 600 ? 14 : 18}px Georgia, serif`;
    const rows = [];
    for (const m of G.messages) {
      const a = clamp(m.t / 0.6, 0, 1) * clamp((m.max - m.t) / 0.3, 0, 1);
      for (const text of wrap(m.text, W - 60)) rows.push({ text, a, color: m.color });
    }
    rows.forEach((r, i) => {
      const y = baseY - (rows.length - 1 - i) * 28;
      ctx.globalAlpha = r.a;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      const w = ctx.measureText(r.text).width;
      ctx.fillRect(W / 2 - w / 2 - 10, y - 12, w + 20, 24);
      ctx.fillStyle = r.color;
      ctx.fillText(r.text, W / 2, y);
      ctx.globalAlpha = 1;
    });

    // Controles táctiles
    if (isTouch) {
      const b = touchButtons();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#e8e0d0";
      ctx.lineWidth = 2;
      if (touch.active) {
        ctx.beginPath();
        ctx.arc(touch.sx, touch.sy, 50, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#e8e0d0";
        const dx = touch.x - touch.sx;
        const dy = touch.y - touch.sy;
        const m = Math.min(50, Math.hypot(dx, dy));
        const a = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.arc(touch.sx + Math.cos(a) * m, touch.sy + Math.sin(a) * m, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = touch.run !== false ? "#8fbf8a" : "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(b.run.x, b.run.y, b.run.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.flash ? "#e6d37a" : "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.arc(b.flash.x, b.flash.y, b.flash.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#fff";
      ctx.font = "13px Georgia, serif";
      ctx.fillText("Correr", b.run.x, b.run.y);
      ctx.fillText("Luz", b.flash.x, b.flash.y);
      ctx.globalAlpha = 1;
    }
  }

  // Cara del susto final: piel agrietada, cuencas negras que gotean, boca desencajada con dientes
  const faceRng = mulberry32(666);
  const CRACKS = Array.from({ length: 14 }, () => {
    const pts = [[(faceRng() - 0.5) * 140, (faceRng() - 0.5) * 190]];
    for (let k = 0; k < 4; k++) {
      const [px, py] = pts[pts.length - 1];
      pts.push([px + (faceRng() - 0.5) * 30, py + (faceRng() - 0.3) * 24]);
    }
    return pts;
  });
  const LOCKS = Array.from({ length: 26 }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    // la mayoría cae por los lados; unos pocos cruzan la cara
    const x = i < 4 ? side * (12 + faceRng() * 25) : side * (55 + faceRng() * 55);
    return { x, len: 170 + faceRng() * 130, w: 1.5 + faceRng() * 4, ph: faceRng() * 6, bend: (faceRng() - 0.5) * 50 };
  });

  function drawFace(cx, cy, s, t) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.rotate(0.12 + Math.sin(t * 50) * 0.03);
    // pelo detrás
    ctx.fillStyle = "#020202";
    ctx.beginPath();
    ctx.ellipse(0, 30, 135, 200, 0, 0, Math.PI * 2);
    ctx.fill();
    // cara alargada y demacrada
    const g = ctx.createRadialGradient(-10, -30, 10, 0, 10, 130);
    g.addColorStop(0, "#d9dccf");
    g.addColorStop(0.6, "#9aa197");
    g.addColorStop(1, "#4a514b");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -120);
    ctx.bezierCurveTo(70, -120, 85, -40, 70, 30);
    ctx.bezierCurveTo(60, 110, 25, 150, 0, 155);
    ctx.bezierCurveTo(-25, 150, -60, 110, -70, 30);
    ctx.bezierCurveTo(-85, -40, -70, -120, 0, -120);
    ctx.fill();
    // mejillas hundidas
    ctx.fillStyle = "rgba(30,36,32,0.45)";
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.ellipse(sd * 45, 40, 16, 34, sd * -0.2, 0, Math.PI * 2);
      ctx.fill();
    });
    // grietas y venas
    ctx.strokeStyle = "rgba(40,20,30,0.55)";
    ctx.lineWidth = 1.5;
    for (const pts of CRACKS) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
      ctx.stroke();
    }
    // cuencas negras enormes, con un punto de luz al fondo
    [-1, 1].forEach((sd) => {
      const ex = sd * 32;
      ctx.fillStyle = "rgba(20,10,10,0.6)";
      ctx.beginPath();
      ctx.ellipse(ex, -30, 30, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(ex, -28, 20 + Math.sin(t * 40) * 1.5, 26, sd * 0.15, 0, Math.PI * 2);
      ctx.fill();
      // goteo negro
      ctx.beginPath();
      ctx.moveTo(ex - 4, -6);
      ctx.quadraticCurveTo(ex - 5, 30, ex - 1.5, 50 + t * 50);
      ctx.lineTo(ex + 1.5, 50 + t * 50);
      ctx.quadraticCurveTo(ex + 3, 25, ex + 5, -6);
      ctx.fill();
      ctx.shadowColor = "#ff2020";
      ctx.shadowBlur = 15;
      ctx.fillStyle = "#ff4a3a";
      ctx.beginPath();
      ctx.arc(ex + sd * 2, -30, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
    // boca desencajada
    const open = 55 + Math.sin(t * 28) * 8 + Math.min(t * 40, 25);
    ctx.fillStyle = "#1a0303";
    ctx.beginPath();
    ctx.ellipse(0, 70, 26, open, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a0606";
    ctx.beginPath();
    ctx.ellipse(0, 70 + open * 0.35, 14, open * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    // dientes irregulares arriba y abajo
    ctx.fillStyle = "#cfc6a8";
    for (let i = -4; i <= 4; i++) {
      const tx = i * 5.5;
      const w = Math.cos((i / 4) * 1.2);
      const top = 70 - open * Math.sqrt(Math.max(0, 1 - (tx / 26) ** 2));
      const bot = 70 + open * Math.sqrt(Math.max(0, 1 - (tx / 26) ** 2));
      ctx.beginPath();
      ctx.moveTo(tx - 2.6, top);
      ctx.lineTo(tx + 2.6, top);
      ctx.lineTo(tx + 0.5, top + 10 * w + (i % 2 ? 4 : 0));
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(tx - 2.6, bot);
      ctx.lineTo(tx + 2.6, bot);
      ctx.lineTo(tx - 0.5, bot - 8 * w - (i % 2 ? 0 : 3));
      ctx.fill();
    }
    // mechones mojados cayendo sobre la cara
    ctx.strokeStyle = "#030303";
    ctx.lineCap = "round";
    for (const l of LOCKS) {
      const wv = Math.sin(t * 5 + l.ph) * 5;
      ctx.lineWidth = l.w;
      ctx.beginPath();
      ctx.moveTo(l.x * 0.5, -128);
      ctx.bezierCurveTo(l.x + l.bend + wv, -50, l.x - l.bend * 0.6 - wv, 40, l.x * 1.15 + l.bend * 0.4 + wv, -125 + l.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawJumpscare() {
    const k = G.caughtTimer;
    ctx.fillStyle = Math.random() < 0.3 ? "rgba(120,0,0,0.9)" : "rgba(0,0,0,0.85)";
    ctx.fillRect(0, 0, W, H);
    const s = (Math.min(W, H) / 300) * (0.6 + Math.min(k * 3, 0.9));
    drawFace(W / 2 + (Math.random() - 0.5) * 30, H / 2 + (Math.random() - 0.5) * 30, s, k);
    // franjas desplazadas (interferencia de video)
    for (let i = 0; i < 6; i++) {
      const sy = Math.random() * canvas.height;
      const sh = rand(4, 30) * DPR;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(canvas, 0, sy, canvas.width, sh, rand(-40, 40) * DPR, sy, canvas.width, sh);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    if (k < 0.1) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Parte un texto en líneas que quepan en maxW (con la fuente actual de ctx)
  function wrap(text, maxW) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function wrapAll(lines, maxW) {
    return lines.flatMap((l) => wrap(l, maxW));
  }

  function drawOverlay(title, lines, color = "#e8e0d0") {
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    ctx.font = `${Math.min(64, W * 0.075)}px Georgia, serif`;
    ctx.fillText(title, W / 2, H * 0.38);
    ctx.font = `${W < 600 ? 14 : 18}px Georgia, serif`;
    ctx.fillStyle = "#cfc6b8";
    wrapAll(lines, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.38 + 60 + i * 26));
  }

  function timeLabel() {
    const s = Math.floor(G.time);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function drawGameOver() {
    if (G.endReason === "dawn") {
      drawOverlay("AMANECIÓ", [
        "Los niños que quedaban se perdieron para siempre en la neblina del río.",
        `Salvaste a ${G.delivered} de ${CHILD_NAMES.length}.`,
        "Haz clic o pulsa Enter para intentarlo de nuevo",
      ], "#ffb070");
    } else {
      drawOverlay("TE ATRAPÓ LA LLORONA", [
        "«Ahora tú serás mi hijo...»",
        `Salvaste a ${G.delivered} de ${CHILD_NAMES.length} · sobreviviste ${timeLabel()}`,
        "Haz clic o pulsa Enter para intentarlo de nuevo",
      ], "#ff5a5a");
    }
  }

  function drawWin() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(40,30,60,0.85)");
    g.addColorStop(1, "rgba(200,120,60,0.85)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff4dc";
    ctx.font = `${Math.min(60, W * 0.06)}px Georgia, serif`;
    ctx.fillText("LOS NIÑOS ESTÁN A SALVO", W / 2, H * 0.36);
    ctx.font = `${W < 600 ? 14 : 18}px Georgia, serif`;
    const lines = [
      "Las campanas suenan. El llanto del río se apaga... por esta noche.",
      `Tiempo: ${timeLabel()} · Veces que te vio: ${G.chaseCount} · Niños que te quitó: ${G.reclaimed}`,
      "Haz clic o pulsa Enter para jugar otra vez",
    ];
    wrapAll(lines, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.36 + 64 + i * 26));
  }

  function drawTitle() {
    const t = titleTime;
    // río y niebla de fondo
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#020308");
    g.addColorStop(1, "#06121c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      const fx = ((t * 20 + i * 260) % (W + 400)) - 200;
      const fy = H * 0.7 + Math.sin(t * 0.5 + i) * 30;
      const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 220);
      fg.addColorStop(0, "rgba(150,160,180,0.10)");
      fg.addColorStop(1, "rgba(150,160,180,0)");
      ctx.fillStyle = fg;
      ctx.fillRect(fx - 220, fy - 220, 440, 440);
    }
    // silueta lejana
    const lx = W * 0.75 + Math.sin(t * 0.3) * 30;
    ctx.save();
    ctx.translate(lx, H * 0.72);
    ctx.scale(2.2, 2.2);
    ctx.translate(-lx, -H * 0.72);
    drawLlorona(lx, H * 0.72, 0.25 + Math.sin(t * 2) * 0.08, t, false);
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const big = Math.min(96, W * 0.14);
    ctx.font = `${big}px Georgia, serif`;
    ctx.fillStyle = "rgba(160,0,0,0.6)";
    ctx.fillText("LA LLORONA", W / 2 + Math.sin(t * 13) * 2, H * 0.22 + 3);
    ctx.fillStyle = "#e8e0d0";
    ctx.fillText("LA LLORONA", W / 2, H * 0.22);

    const small = W < 600 ? 13 : 17;
    ctx.font = `italic ${small}px Georgia, serif`;
    ctx.fillStyle = "#b8b0a2";
    const story = [
      "Cuatro niños del pueblo salieron de noche y no volvieron.",
      "Junto al río se oye un llanto de mujer: «¡Ay, mis hijos!».",
      "Tráelos a la iglesia antes del amanecer. Ella no puede pisar terreno sagrado.",
    ];
    wrapAll(story, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.34 + i * (small + 9)));

    ctx.font = `${small - 1}px Georgia, serif`;
    ctx.fillStyle = "#8f887c";
    const controls = isTouch
      ? ["Joystick: moverse · Correr · Luz: linterna", "Escóndete en los arbustos con la luz apagada"]
      : [
          "WASD / flechas: moverse · Shift: correr · Ratón: apuntar la linterna",
          "F o clic derecho: encender/apagar linterna · P: pausa · M: silencio",
          "Escóndete en los arbustos, quieto y con la luz apagada. Usa audífonos.",
        ];
    wrapAll(controls, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.58 + i * (small + 7)));

    ctx.font = `${small + 3}px Georgia, serif`;
    ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.4;
    ctx.fillStyle = "#e8e0d0";
    ctx.fillText(isTouch ? "Toca para empezar" : "Haz clic para empezar", W / 2, H * 0.84);
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // Bucle principal
  // ---------------------------------------------------------------------------
  let lastTs = 0;
  function frame(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    titleTime += dt;
    if (state === "playing") update(dt);
    else if (state === "caught") {
      G.caughtTimer += dt;
      if (G.caughtTimer > 1.7) {
        Sound.setLevels(0, 0);
        state = "gameover";
      }
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Gancho para pruebas: abre index.html#debug
  if (location.hash === "#debug") {
    window.__llorona = {
      get G() {
        return G;
      },
      get state() {
        return state;
      },
      churchDoor,
      Sound,
    };
  }
})();
