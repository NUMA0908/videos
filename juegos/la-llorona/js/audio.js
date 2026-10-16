/* La Llorona — motor de audio (Web Audio).
 * - Dos grabaciones reales (audio-data.js): el lamento de la Llorona y el grito de muerte.
 * - Todo lo demás se sintetiza: pasos por superficie, lluvia, truenos, animales, música.
 * - Cada sonido con posición pasa por bus(): volumen por distancia, paneo, filtro si hay
 *   paredes/árboles de por medio (oclusión) y un envío a la reverberación.
 */
"use strict";

// Frases dentro de llorona-busca.mp3 (segundos): tres «¡Ay, mis hijos!» distintos
const LLORONA_SEGMENTS = [
  [0.1, 6.2],
  [6.25, 11.95],
  [12.0, 15.7],
];

const Sound = {
  ctx: null,
  muted: false,
  buffers: {},
  voice: null,

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // compresor final: truenos y gritos no saturan
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master.connect(comp).connect(c.destination);
    // filtro general: se cierra al aguantar la respiración
    this.muffle = c.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 20000;
    this.muffle.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(this.muffle);
    this.music = c.createGain();
    this.music.gain.value = 0.8;
    this.music.connect(this.muffle);
    // reverberación de noche abierta (respuesta al impulso sintética)
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(3.4, 2.4);
    const ret = c.createGain();
    ret.gain.value = 0.6;
    this.reverb.connect(ret).connect(this.muffle);

    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startLoops();
    this.loadSamples();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
  },

  impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    const pre = Math.floor(c.sampleRate * 0.03);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = pre; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  },

  loadSamples() {
    const data = window.LLORONA_AUDIO;
    if (!data) return;
    for (const [key, b64] of Object.entries(data)) {
      try {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const p = this.ctx.decodeAudioData(
          bytes.buffer,
          (buf) => (this.buffers[key] = buf),
          () => {},
        );
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        // sin la grabación se usa el sonido sintetizado
      }
    }
  },

  noise() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    return src;
  },

  // -------------------------------------------------------------------------
  // Salida posicional
  // -------------------------------------------------------------------------
  bus(vol, opts = {}) {
    const c = this.ctx;
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    g.connect(lp);
    let tail = lp;
    let pn = null;
    if (c.createStereoPanner) {
      pn = c.createStereoPanner();
      lp.connect(pn);
      tail = pn;
    }
    tail.connect(opts.music ? this.music : this.sfx);
    const rev = opts.rev === undefined ? 0.15 : opts.rev;
    if (rev > 0) {
      const send = c.createGain();
      send.gain.value = rev;
      tail.connect(send).connect(this.reverb);
    }
    const h = { g, lp, pn, vol, range: opts.range || 900, falloff: opts.falloff !== false };
    this.place(h, opts.at, true);
    return opts.handle ? h : g;
  },

  place(h, at, instant) {
    let gain = h.vol;
    let pan = 0;
    let cutoff = 18000;
    const p = typeof G !== "undefined" && G ? G.player : null;
    if (at && p) {
      const d = dist(p.x, p.y, at.x, at.y);
      if (h.falloff) gain *= Math.pow(clamp(1 - d / h.range, 0, 1), 1.4);
      pan = clamp((at.x - p.x) / 380, -0.95, 0.95);
      cutoff = 16000 - Math.min(d, 1200) * 9;
      // detrás de ti suena más apagado: ayuda a saber si está delante o detrás
      if (angleDiff(Math.atan2(at.y - p.y, at.x - p.x), p.angle) > 2.2) cutoff *= 0.55;
      if (!lineOfSight(p.x, p.y, at.x, at.y)) cutoff = Math.min(cutoff, 1100);
    }
    if (instant) {
      h.g.gain.value = gain;
      h.lp.frequency.value = cutoff;
      if (h.pn) h.pn.pan.value = pan;
    } else {
      const t = this.ctx.currentTime;
      h.g.gain.setTargetAtTime(gain, t, 0.08);
      h.lp.frequency.setTargetAtTime(cutoff, t, 0.1);
      if (h.pn) h.pn.pan.setTargetAtTime(pan, t, 0.08);
    }
  },

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
    n.connect(f).connect(g).connect(out || this.sfx);
    n.start(start, Math.random() * 1.5);
    n.stop(start + len + 0.03);
    return f;
  },

  tone(start, len, f0, f1, type, gain, out, attack) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), start + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + (attack || Math.min(0.01, len * 0.2)));
    g.gain.exponentialRampToValueAtTime(0.001, start + len);
    o.connect(g).connect(out || this.sfx);
    o.start(start);
    o.stop(start + len + 0.03);
    return o;
  },

  sample(key, vol, opts, offset, duration) {
    const buf = this.buffers[key];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate || 1;
    const h = this.bus(vol, Object.assign({}, opts, { handle: true }));
    src.connect(h.g);
    src.start(this.ctx.currentTime, offset || 0, duration);
    h.src = src;
    return h;
  },

  // -------------------------------------------------------------------------
  // Capas continuas: viento, río, lluvia y música
  // -------------------------------------------------------------------------
  loopNoise(type, freq, q, out) {
    const n = this.noise();
    n.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    n.connect(f).connect(out);
    n.start(0, Math.random() * 1.9);
    return f;
  },

  gainNode(v, out) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(out);
    return g;
  },

  startLoops() {
    const c = this.ctx;
    // viento con ráfagas lentas
    this.windGain = this.gainNode(0.06, this.sfx);
    const wf = this.loopNoise("lowpass", 380, 0.7, this.windGain);
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = c.createGain();
    lg.gain.value = 240;
    lfo.connect(lg).connect(wf.frequency);
    lfo.start();
    // corriente del río
    this.riverGain = this.gainNode(0, this.sfx);
    const rf = this.loopNoise("bandpass", 700, 0.6, this.riverGain);
    const rl = c.createOscillator();
    rl.frequency.value = 0.3;
    const rlg = c.createGain();
    rlg.gain.value = 180;
    rl.connect(rlg).connect(rf.frequency);
    rl.start();
    // lluvia: siseo agudo + rumor grave
    this.rainGain = this.gainNode(0, this.sfx);
    const rainHi = this.loopNoise("highpass", 1100, 0.5, this.rainGain);
    void rainHi;
    this.rainLowGain = this.gainNode(0, this.sfx);
    this.loopNoise("lowpass", 420, 0.5, this.rainLowGain);

    // zumbido grave de fondo
    this.droneGain = this.gainNode(0.7, this.music);
    [
      [49, 0.035],
      [73.4, 0.016],
    ].forEach(([f, v]) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.connect(this.gainNode(v, this.droneGain));
      o.start();
    });

    // cuerdas disonantes de pavor (suben con la cercanía)
    this.dreadGain = this.gainNode(0, this.music);
    const dlp = c.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 1000;
    dlp.connect(this.dreadGain);
    [110, 116.5, 164.8, 233, 311].forEach((f) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      const v = c.createOscillator();
      v.frequency.value = rand(3, 6);
      const vg = c.createGain();
      vg.gain.value = f * 0.012;
      v.connect(vg).connect(o.frequency);
      o.connect(this.gainNode(0.2, dlp));
      o.start();
      v.start();
    });

    // capas de escalada: se suman con cada niño rescatado
    this.esc = [];
    // 1) coro grave que respira
    const choir = this.gainNode(0, this.music);
    const clp = c.createBiquadFilter();
    clp.type = "lowpass";
    clp.frequency.value = 600;
    clp.connect(choir);
    [55, 82.4, 110, 130.8].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f * (1 + (i - 1.5) * 0.003);
      const trem = c.createGain();
      trem.gain.value = 0.18;
      const l = c.createOscillator();
      l.frequency.value = 0.12 + i * 0.05;
      const lgn = c.createGain();
      lgn.gain.value = 0.12;
      l.connect(lgn).connect(trem.gain);
      o.connect(trem).connect(clp);
      o.start();
      l.start();
    });
    this.esc.push(choir);
    // 2) vidrio agudo que bate (dos senos casi iguales)
    const glass = this.gainNode(0, this.music);
    [1244, 1251, 1662].forEach((f) => {
      const o = c.createOscillator();
      o.frequency.value = f;
      o.connect(this.gainNode(0.035, glass));
      o.start();
    });
    this.esc.push(glass);
    // 3) pulso grave como un tambor lejano
    const pulse = this.gainNode(0, this.music);
    const po = c.createOscillator();
    po.type = "square";
    po.frequency.value = 41;
    const plp = c.createBiquadFilter();
    plp.type = "lowpass";
    plp.frequency.value = 140;
    const am = c.createGain();
    am.gain.value = 0;
    const al = c.createOscillator();
    al.frequency.value = 1.3;
    const alg = c.createGain();
    alg.gain.value = 0.5;
    al.connect(alg).connect(am.gain);
    po.connect(plp).connect(am).connect(pulse);
    po.start();
    al.start();
    this.esc.push(pulse);
  },

  // Ajusta todas las capas de una vez (valores de 0 a 1)
  mix(m) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (node, v, tc = 0.4) => node.gain.setTargetAtTime(v, t, tc);
    set(this.riverGain, m.river * 0.16, 0.3);
    set(this.rainGain, m.rain * 0.11, 0.8);
    set(this.rainLowGain, m.rain * m.rain * 0.12, 0.8);
    set(this.windGain, 0.04 + m.wind * 0.1, 0.6);
    set(this.dreadGain, m.dread * 0.1);
    set(this.droneGain, m.silence ? 0.1 : 0.7, m.silence ? 0.15 : 1.2);
    this.esc.forEach((g, i) => set(g, i < m.esc ? [0.5, 0.45, 0.6][i] * (m.silence ? 0.1 : 1) : 0, 1.5));
  },

  silenceAll() {
    if (!this.ctx) return;
    this.mix({ river: 0, rain: 0, wind: 0, dread: 0, esc: 0, silence: true });
    this.setMuffle(0);
    this.stopVoice();
  },

  setMuffle(amount) {
    if (!this.ctx) return;
    this.muffle.frequency.setTargetAtTime(lerp(20000, 420, amount), this.ctx.currentTime, 0.12);
  },

  // -------------------------------------------------------------------------
  // La Llorona
  // -------------------------------------------------------------------------
  // Lamento grabado mientras te busca. El volumen lo decide el juego (leyenda invertida).
  lloronaVoice(vol, at) {
    if (!this.ctx) return;
    this.stopVoice();
    const [a, b] = pick(LLORONA_SEGMENTS);
    const h = this.sample("lloronaBusca", vol, { at, falloff: false, rev: 0.45, rate: rand(0.94, 1.03) }, a, b - a);
    if (h) {
      this.voice = h;
      h.until = this.ctx.currentTime + (b - a) + 0.2;
    } else this.wail(vol, at);
  },

  updateVoice(at, vol) {
    const h = this.voice;
    if (!h) return;
    if (this.ctx.currentTime > h.until) {
      this.voice = null;
      return;
    }
    h.vol = vol;
    this.place(h, at, false);
  },

  stopVoice() {
    const h = this.voice;
    if (!h) return;
    this.voice = null;
    const t = this.ctx.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setTargetAtTime(0, t, 0.15);
    try {
      h.src.stop(t + 0.8);
    } catch (e) {
      // ya se detuvo
    }
  },

  // Grito grabado cuando te mata
  deathScream() {
    if (!this.ctx) return;
    this.stopVoice();
    const h = this.sample("gritoMuerte", 1.1, { rev: 0.35 });
    if (!h) this.scream(1);
    const t = this.ctx.currentTime;
    this.tone(t, 1.4, 60, 28, "sine", 0.9);
    this.burst(t, 0.6, "lowpass", 300, 1, 0.5);
  },

  // Lamento sintético (respaldo si no cargó la grabación)
  wail(vol, at) {
    if (!this.ctx || vol < 0.02) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.5 });
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.32, t + 0.5);
    env.gain.linearRampToValueAtTime(0.25, t + 1.8);
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
    ["sawtooth", "triangle"].forEach((type, i) => {
      const mul = 1 + i * 0.012;
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(480 * mul, t);
      o.frequency.linearRampToValueAtTime(760 * mul, t + 0.7);
      o.frequency.exponentialRampToValueAtTime(280 * mul, t + 3.2);
      vibG.connect(o.frequency);
      o.connect(bp);
      o.start(t);
      o.stop(t + 3.3);
    });
    vib.start(t);
    vib.stop(t + 3.3);
  },

  // Chillido cuando se revela o te descubre
  scream(vol, at) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.4 });
    const env = c.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    env.connect(out);
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
    this.burst(t, 1.5, "highpass", 1500, 0.7, 0.35, env);
  },

  // Golpe orquestal disonante
  stinger(vol) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { rev: 0.5, music: true });
    [98, 104, 147, 208, 415, 440].forEach((f) => this.tone(t, 2.4, f, f * 0.94, "sawtooth", 0.07, out));
    this.tone(t, 0.7, 70, 32, "sine", 0.8, out);
    this.burst(t, 0.6, "lowpass", 400, 1, 0.4, out);
  },

  // Pulso de la persecución (tambor + chirrido de violín)
  chasePulse(vol, beat) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { rev: 0.2, music: true });
    this.tone(t, 0.25, 90, 40, "sine", 0.9, out);
    this.burst(t, 0.08, "lowpass", 900, 1, 0.3, out);
    if (beat % 4 === 2) {
      const f = rand(1400, 2200);
      this.tone(t + 0.05, 0.5, f, f * rand(0.6, 1.4), "sawtooth", 0.035, out, 0.05);
    }
  },

  // Respiración ronca cuando está muy cerca
  rasp(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, range: 320, rev: 0.1 });
    const f = this.burst(t, 1.1, "bandpass", 700, 3, 0.5, out);
    f.frequency.linearRampToValueAtTime(1100, t + 1);
    this.tone(t, 1.0, 95, 80, "sawtooth", 0.05, out, 0.3);
  },

  // Agua que gotea de su vestido
  drip(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, range: 380, rev: 0.25 });
    const f = rand(900, 1500);
    this.tone(t, 0.07, f, f * 2.3, "sine", 0.5, out);
  },

  // Tela mojada arrastrándose
  drag(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, range: 340, rev: 0.1 });
    const f = this.burst(t, 0.9, "bandpass", 500, 0.8, 0.6, out);
    f.frequency.linearRampToValueAtTime(260, t + 0.9);
  },

  // Susurro con formantes (suena a voz sin palabras)
  whisper(vol, at) {
    if (!this.ctx || vol < 0.02) return;
    const out = this.bus(vol, { at, falloff: false, rev: 0.35 });
    let t = this.ctx.currentTime;
    const vowels = [
      [300, 2300],
      [500, 900],
      [700, 1200],
      [350, 2000],
    ];
    for (let i = randi(3, 6); i > 0; i--) {
      const [f1, f2] = pick(vowels);
      const len = rand(0.12, 0.3);
      this.burst(t, len, "bandpass", f1, 9, 0.8, out);
      this.burst(t, len, "bandpass", f2, 9, 0.5, out);
      if (chance(0.4)) this.burst(t + len, 0.12, "highpass", 5000, 0.7, 0.35, out);
      t += len + rand(0.03, 0.12);
    }
  },

  // -------------------------------------------------------------------------
  // Niños
  // -------------------------------------------------------------------------
  // Sollozo; si es falso (ella imitando) es más grave, lento y con gorgoteo de agua
  sob(vol, at, voice, fake) {
    if (!this.ctx || vol < 0.02) return;
    const c = this.ctx;
    const t = c.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: fake ? 0.5 : 0.2 });
    if (!fake && chance(0.25)) {
      this.burst(t, 0.12, "highpass", 2500, 0.8, 0.25, out);
      this.burst(t + 0.18, 0.1, "highpass", 2500, 0.8, 0.2, out);
      return;
    }
    const base = fake ? voice * 0.82 : voice;
    const n = randi(2, 4);
    for (let i = 0; i < n; i++) {
      const st = t + i * (fake ? rand(0.38, 0.5) : rand(0.22, 0.32));
      this.tone(st, fake ? 0.32 : 0.2, base - i * 30 + rand(-20, 20), base * 0.66 - i * 25, "triangle", 0.22, out);
      if (fake) this.tone(st + 0.1, 0.08, rand(300, 500), rand(800, 1100), "sine", 0.12, out); // gorgoteo
    }
  },

  giggle(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.5 });
    let st = t;
    for (let i = 0; i < 6; i++) {
      const f = rand(950, 1250) - i * 25;
      this.tone(st, 0.09, f, f * 0.85, "triangle", 0.18, out);
      st += 0.11 - i * 0.008;
    }
  },

  // Cajita de música: canción de cuna desafinada que se va frenando
  musicBox(vol, at) {
    if (!this.ctx) return 0;
    const out = this.bus(vol, { at, range: 1300, rev: 0.45 });
    const notes = [
      [76, 1],
      [72, 1],
      [69, 1],
      [72, 1],
      [71, 2],
      [68, 2],
      [64, 1],
      [66, 1],
      [68, 1],
      [71, 1],
      [69, 3],
    ];
    let t = this.ctx.currentTime + 0.05;
    let beat = 0.36;
    notes.forEach(([m, len]) => {
      const f = 440 * Math.pow(2, (m - 69) / 12) * (1 + rand(-0.006, 0.006));
      [
        [1, 0.3],
        [2, 0.08],
        [3.01, 0.05],
      ].forEach(([mul, g]) => this.tone(t, 1.4, f * mul, f * mul * 0.998, "sine", g, out, 0.004));
      t += beat * len;
      beat *= 1.035; // la cuerda se acaba
    });
    return t - this.ctx.currentTime;
  },

  // -------------------------------------------------------------------------
  // Jugador
  // -------------------------------------------------------------------------
  // Pasos según la superficie: grass | wood | dirt | mud | bush | water
  step(vol, surface) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol * rand(0.8, 1.15), { rev: 0.04 });
    if (surface === "wood") {
      this.tone(t, 0.14, rand(150, 190), 70, "sine", 1.5, out);
      this.burst(t, 0.05, "bandpass", rand(800, 1100), 7, 1.1, out);
      if (chance(0.3)) {
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 600;
        bp.Q.value = 4;
        bp.connect(out);
        this.tone(t + 0.04, 0.3, rand(170, 220), rand(120, 150), "sawtooth", 0.5, bp);
      }
    } else if (surface === "water") {
      const f = this.burst(t, 0.3, "bandpass", 1600, 0.9, 1.4, out);
      f.frequency.exponentialRampToValueAtTime(450, t + 0.3);
      this.burst(t + 0.02, 0.22, "highpass", 3200, 0.5, 0.45, out);
      for (let i = 0; i < 3; i++) {
        const f0 = rand(350, 600);
        this.tone(t + 0.05 + Math.random() * 0.2, 0.06, f0, f0 * 2.2, "sine", 0.35, out);
      }
    } else if (surface === "grass") {
      this.burst(t, 0.14, "highpass", rand(2500, 3800), 0.4, 0.45, out);
      this.burst(t, 0.09, "lowpass", 260, 1, 0.7, out);
    } else if (surface === "bush") {
      for (let i = 0; i < 4; i++) this.burst(t + i * 0.04 + Math.random() * 0.02, 0.11, "bandpass", rand(2800, 5200), 1.2, 0.6, out);
    } else if (surface === "mud") {
      // lodo: chapoteo grave y pegajoso
      const f = this.burst(t, 0.18, "bandpass", 500, 1.5, 1.2, out);
      f.frequency.exponentialRampToValueAtTime(1300, t + 0.16);
      this.tone(t + 0.02, 0.08, 200, 420, "sine", 0.4, out);
    } else {
      for (let i = 0; i < 5; i++) this.burst(t + i * 0.011 + Math.random() * 0.01, 0.025, "bandpass", rand(1400, 3200), 2, 0.65, out);
      this.burst(t, 0.07, "lowpass", 240, 1, 0.8, out);
    }
  },

  heartbeat(vol) {
    if (!this.ctx || vol < 0.03) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { rev: 0 });
    this.tone(t, 0.2, 60, 32, "sine", 0.9, out, 0.015);
    this.tone(t + 0.24, 0.2, 60, 32, "sine", 0.63, out, 0.015);
  },

  // pant: jadeo · gasp: bocanada al no aguantar · exhale: soltar el aire
  breath(vol, kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { rev: 0.03 });
    if (kind === "gasp") {
      const f = this.burst(t, 0.55, "bandpass", 900, 1.2, 1.2, out);
      f.frequency.linearRampToValueAtTime(1900, t + 0.5);
      this.tone(t, 0.4, 320, 520, "sawtooth", 0.05, out, 0.05);
    } else if (kind === "exhale") {
      const f = this.burst(t, 0.7, "bandpass", 1200, 0.8, 0.6, out);
      f.frequency.linearRampToValueAtTime(600, t + 0.7);
    } else {
      this.burst(t, 0.22, "bandpass", 1500, 1, 0.5, out);
      this.burst(t + 0.3, 0.28, "bandpass", 1000, 1, 0.45, out);
    }
  },

  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 0.03, 1800, 1700, "square", 0.06);
  },

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(1, { rev: 0.3 });
    [660, 990, 1320].forEach((f, i) => this.tone(t + i * 0.08, 0.9, f, f, "sine", 0.12, out));
  },

  page() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.burst(t + i * 0.07, 0.12, "bandpass", rand(2500, 4000), 1.5, 0.25);
  },

  creak(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, rev: 0.2 });
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 800;
    bp.Q.value = 6;
    bp.connect(out);
    const o = this.tone(t, 0.6, rand(200, 260), rand(140, 180), "sawtooth", 0.5, bp, 0.05);
    const l = this.ctx.createOscillator();
    l.frequency.value = 22;
    const lg = this.ctx.createGain();
    lg.gain.value = 30;
    l.connect(lg).connect(o.frequency);
    l.start(t);
    l.stop(t + 0.65);
  },

  // -------------------------------------------------------------------------
  // Mundo
  // -------------------------------------------------------------------------
  bell(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.7 });
    [220, 440, 553, 659, 880].forEach((f, i) => this.tone(t, 4, f, f * 0.998, "sine", 0.16 / (i + 1), out, 0.005));
  },

  thunder(vol, near) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { rev: 0.5 });
    if (near) this.burst(t, 0.25, "highpass", 1200, 0.5, 0.9, out);
    for (let i = 0; i < 5; i++) {
      const st = t + (near ? 0.05 : 0.2) + i * rand(0.25, 0.6);
      this.burst(st, rand(1.5, 3), "lowpass", rand(90, 260), 0.8, rand(0.4, 0.9), out);
    }
  },

  pop(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, rev: 0.2 });
    this.burst(t, 0.06, "highpass", 2000, 0.7, 1, out);
    this.tone(t, 0.3, 120, 60, "square", 0.08, out);
  },

  caw(vol, at) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.35 });
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1300;
    bp.Q.value = 2;
    bp.connect(out);
    for (let i = 0; i < randi(3, 5); i++) {
      const st = t + i * rand(0.2, 0.32);
      this.tone(st, 0.2, rand(600, 720), rand(420, 500), "sawtooth", 0.4, bp);
    }
    for (let i = 0; i < 14; i++) this.burst(t + i * 0.06, 0.05, "lowpass", 900, 1, 0.35, out); // aleteo
  },

  owl(vol, at) {
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.4 });
    [0, 0.45, 0.75].forEach((d, i) => this.tone(t + d, i ? 0.25 : 0.4, 400, 340, "sine", 0.25, out, 0.04));
  },

  crickets(vol, at) {
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.15 });
    const f = rand(4200, 5200);
    for (let k = randi(3, 6); k > 0; k--) for (let i = 0; i < 4; i++) this.tone(t + k * 0.35 + i * 0.035, 0.025, f, f, "square", 0.04, out);
  },

  frog(vol, at) {
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.2 });
    const f = rand(90, 140);
    for (let i = randi(2, 4); i > 0; i--) for (let k = 0; k < 6; k++) this.tone(t + i * 0.32 + k * 0.025, 0.03, f * 2, f, "square", 0.12, out);
  },

  branch(vol, at) {
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.3 });
    this.burst(t, 0.05, "highpass", 1800, 1, 0.9, out);
    this.burst(t + 0.04, 0.04, "bandpass", 2500, 2, 0.5, out);
    this.tone(t, 0.12, 120, 60, "sine", 0.5, out);
  },

  howl(vol, at) {
    const t = this.ctx.currentTime;
    const out = this.bus(vol, { at, falloff: false, rev: 0.6 });
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    lp.connect(out);
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(420, t);
    o.frequency.linearRampToValueAtTime(700, t + 0.7);
    o.frequency.linearRampToValueAtTime(640, t + 1.6);
    o.frequency.exponentialRampToValueAtTime(380, t + 2.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
    o.connect(g).connect(lp);
    o.start(t);
    o.stop(t + 2.5);
  },

  gust(vol) {
    const t = this.ctx.currentTime;
    const f = this.burst(t, 3, "bandpass", 300, 0.8, vol * 0.35);
    f.frequency.linearRampToValueAtTime(900, t + 1.5);
    f.frequency.linearRampToValueAtTime(250, t + 3);
  },
};
