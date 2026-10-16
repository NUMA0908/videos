/* La Llorona — estado y lógica del juego.
 *
 * Ideas tomadas de juegos de terror establecidos:
 * - Alien: Isolation: un «director» mide la tensión (menace). Si llevas mucho tiempo tranquilo,
 *   la manda «casualmente» hacia ti; si la presión dura demasiado, la retira para dejarte respirar.
 * - Darkwood: solo ves lo que está en tu línea de visión; árboles y paredes proyectan sombras.
 * - Slender: cada niño rescatado la vuelve más rápida, empeora la tormenta y suma capas a la música.
 * - Amnesia / Outlast / Alien: escóndete en armarios o arbustos y aguanta la respiración cuando
 *   se acerca. Aguantar cuesta aliento: si llegas agotado, no aguantas.
 * - Phasmophobia: cerca de ella fallan la linterna y los faroles.
 * - La leyenda: «si la oyes lejos, está cerca; si la oyes cerca, está lejos».
 */
"use strict";

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

const keys = {};
const mouse = { x: 0, y: 0 };
let state = "title"; // title | playing | paused | caught | gameover | win
let G = null;
let titleTime = 0;

const CHILD_LINES = [
  "Tengo miedo... la oí llorar en el río.",
  "¡Llévame con mi mamá, por favor!",
  "Ella me llamaba «mijo»... pero no es mi mamá.",
  "Me escondí y aguanté la respiración. Así no te oye.",
];
const LLORONA_LINES = ["¡Aaay, mis hijos!", "¿Dónde están mis hijos?", "¡Aaaay, mis hijooos!"];
const NOTES = {
  hacienda: {
    title: "Diario de María — 1 de noviembre",
    text: "Él no volvió. Lo vi en la plaza del brazo de otra. Los niños preguntan por su papá y yo ya no sé qué decirles.",
  },
  dock: {
    title: "Diario de María — última página",
    text: "Llueve como nunca. Los llevé al río para que no lloraran más. El agua estaba tan fría... ¿Dónde están? ¿Dónde están mis hijos?",
  },
  crypt: {
    title: "Inscripción en la cripta",
    text: "Aquí debían descansar los hijos de María. Sus cuerpos nunca aparecieron. Ella sigue buscándolos... y se lleva a los que encuentra.",
  },
  well: {
    title: "Tallado en el pozo",
    text: "Dicen los viejos: si la oyes lejos, está cerca. Si la oyes cerca... está lejos.",
  },
  island: {
    title: "Nota mojada entre las muñecas",
    text: "Imita el llanto de los niños para atraerte. Los niños de verdad tiemblan. Lo que ella imita... gotea agua.",
  },
  house: {
    title: "Recado del padre Tomás",
    text: "Enciendan las velas de las ofrendas: la luz de los muertos la aleja, pero el viento las apaga. Si te escondes, aguanta la respiración.",
  },
};

// ---------------------------------------------------------------------------
// Partida nueva
// ---------------------------------------------------------------------------
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
    hidden: null, // null | "bush" | "full"
    spotted: 0, // si ella te acaba de ver, esconderte no sirve
    hide: null, // armario donde está metido
    stepTimer: 0,
    breathTimer: 0,
  };

  // Niños: en la isla, la cripta, la hacienda y uno perdido en el bosque
  const spots = POI.childSpots.filter((s) => isReachablePx(s.x, s.y));
  while (spots.length < CHILD_NAMES.length) {
    let tol = 0;
    const p = randomReachable((x, y, tx, ty) => {
      tol += 0.0005;
      const far = dist(x, y, door.x, door.y) > 900 * (1 - Math.min(tol, 0.5));
      return far && tileAt(tx, ty) !== T.WATER && spots.every((s) => dist(s.x, s.y, x, y) > 520 * (1 - Math.min(tol, 0.6)));
    }, 3000);
    spots.push({ poi: "bosque", x: p.x, y: p.y });
  }
  const names = CHILD_NAMES.slice().sort(() => Math.random() - 0.5);
  const children = names.map((name, i) => ({
    name,
    x: spots[i].x,
    y: spots[i].y,
    home: spots[i].poi,
    state: "lost",
    sobTimer: rand(1, 3),
    bob: rand(0, 6),
    voice: 520 + i * 40,
  }));

  const notes = Object.keys(NOTES).map((key) => {
    let p = POI.noteSpots[key];
    if (!p || !isReachablePx(p.x, p.y)) p = randomReachable((x, y) => dist(x, y, door.x, door.y) > 400);
    return { key, x: p.x, y: p.y + 6, taken: false };
  });

  const batteries = [];
  for (let i = 0; i < 8; i++) {
    const p = randomReachable((x, y) => dist(x, y, door.x, door.y) > 350 && batteries.every((b) => dist(b.x, b.y, x, y) > 300));
    batteries.push({ x: p.x, y: p.y, taken: false });
  }

  const start = randomReachable((x, y, tx, ty) => Math.abs(ty - riverY[tx]) < 4 && dist(x, y, door.x, door.y) > 1100, 1000);
  const llorona = {
    x: start.x,
    y: start.y,
    vx: 0,
    vy: 0,
    state: "wander",
    target: null,
    lastSeen: null,
    loseTimer: 0,
    pauseT: 0,
    searchPts: [],
    retreatT: 0,
    revealT: 0,
    farTimer: 0,
    blinkT: rand(3, 6),
    wailTimer: rand(5, 8),
    dripT: 1,
    dragT: 2,
    raspT: 2,
    stepAcc: 0,
    foot: 1,
  };

  const crows = POI.deadTrees
    .filter((t) => dist(t.x, t.y, door.x, door.y) > 400)
    .sort(() => Math.random() - 0.5)
    .slice(0, 6)
    .map((t) => ({ x: t.x, y: t.y, state: "perched", t: 0, birds: Array.from({ length: randi(3, 5) }, () => ({ ox: rand(-14, 14), oy: rand(-14, 14), a: rand(0, 6), sp: rand(0.8, 1.3) })) }));

  const fireflies = [];
  for (let i = 0; i < 40; i++) {
    const tx = randi(2, MW - 3);
    fireflies.push({ x: tx * TILE, y: (riverY[tx] + rand(-3, 4)) * TILE, ph: rand(0, 6), sp: rand(0.5, 1.5) });
  }
  const fog = [];
  for (let i = 0; i < 46; i++) fog.push({ x: rand(0, MW * TILE), y: rand(0, MH * TILE), r: rand(90, 220) });

  G = {
    player,
    children,
    followers: [],
    delivered: 0,
    notes,
    notesFound: 0,
    batteries,
    llorona,
    decoy: null,
    decoyTimer: rand(60, 90),
    crows,
    footprints: [],
    fireflies,
    fog,
    trail: [],
    time: 0,
    fear: 0,
    heartTimer: 0,
    cam: { x: player.x, y: player.y },
    shake: 0,
    messages: [],
    notePanel: null,
    caughtTimer: 0,
    endReason: "",
    hints: {},
    chaseCount: 0,
    reclaimed: 0,
    ambTimer: 2,
    whisperTimer: 8,
    giggleTimer: 10,
    musicBoxTimer: 6,
    cradleRock: 0,
    chaseBeatT: 0,
    chaseBeat: 0,
    hour: 0,
    huntUntil: 0,
    silenceT: 0,
    pending: [],
    apparition: null,
    faceFlash: null,
    wellHand: 0,
    useQueued: false,
    prompt: null,
    breath: { active: false, holding: false, exposure: 0 },
    weather: { rain: 0.05, target: 0.08, wind: 0.2, flashT: 0, nextLightning: 25, thunders: [], splashes: [], drops: [] },
    director: { menace: 0, calm: 0, eventCD: 30 },
    vis: null,
  };
  say("Encuentra a los 4 niños perdidos y tráelos a la iglesia antes del amanecer.", 6);
  say("Escucha su llanto... y no dejes que ELLA te vea.", 5);
}

function say(text, dur = 4, color = "#e8e0d0") {
  if (G.messages.some((m) => m.text === text)) return;
  G.messages.push({ text, t: dur, max: dur, color });
  if (G.messages.length > 4) G.messages.shift();
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
let isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
const touch = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0, run: false, use: false };

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  if ((state === "title" || state === "gameover" || state === "win") && k === "enter") start();
  else if (state === "playing" && k === "f" && !e.repeat) toggleFlash();
  else if (state === "playing" && k === "e" && !e.repeat) G.useQueued = true;
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
  const r = Math.min(W, H) * 0.085 + 10;
  return {
    run: { x: W - r * 1.3, y: H - r * 1.3, r },
    flash: { x: W - r * 3.4, y: H - r * 1.0, r: r * 0.8 },
    use: { x: W - r * 1.3, y: H - r * 3.6, r: r * 0.8 },
  };
}
canvas.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    isTouch = true;
    if (state !== "playing") {
      if (state === "paused") togglePause();
      else if (state !== "caught") start();
      return;
    }
    const b = touchButtons();
    for (const t of e.changedTouches) {
      const x = t.clientX;
      const y = t.clientY;
      if (dist(x, y, b.flash.x, b.flash.y) < b.flash.r * 1.2) toggleFlash();
      else if (G.prompt && dist(x, y, b.use.x, b.use.y) < b.use.r * 1.2) {
        touch.use = t.identifier;
        G.useQueued = true;
      } else if (dist(x, y, b.run.x, b.run.y) < b.run.r * 1.2) touch.run = t.identifier;
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
    if (t.identifier === touch.use) touch.use = false;
  }
};
canvas.addEventListener("touchend", endTouch);
canvas.addEventListener("touchcancel", endTouch);

function start() {
  Sound.init();
  newGame();
  state = "playing";
  Sound.bell(0.8, churchCenter());
}
function togglePause() {
  if (state === "playing") {
    state = "paused";
    Sound.setMuffle(0.7);
  } else if (state === "paused") {
    state = "playing";
    Sound.setMuffle(0);
  }
}
function toggleFlash() {
  const p = G.player;
  if (p.hide) return;
  if (!p.flash && p.battery <= 0) {
    say("La linterna no tiene batería.", 2, "#c9a27a");
    return;
  }
  p.flash = !p.flash;
  Sound.click();
}
const useHeld = () => keys.e || touch.use !== false;
const breathHeld = () => keys[" "] || keys.shift || touch.run !== false;

// ---------------------------------------------------------------------------
// Consultas de juego
// ---------------------------------------------------------------------------
function inSafeZone(x, y) {
  if (inSanctuary(x, y)) return true;
  return POI.altars.some((a) => a.lit > 0 && dist(x, y, a.x, a.y) < ALTAR_R);
}
// ¿Hay luz en este punto? (faroles, ofrendas, velas, relámpago)
function litAt(x, y) {
  if (G.weather.flashT > 0.2) return true;
  if (POI.lamps.some((l) => !l.dead && dist(x, y, l.x, l.y) < 120)) return true;
  if (POI.altars.some((a) => a.lit > 0 && dist(x, y, a.x, a.y) < ALTAR_R + 20)) return true;
  return POI.candles.some((c) => dist(x, y, c.x, c.y) < 50);
}
// Ruido que ella puede oír
function makeNoise(x, y, radius) {
  const L = G.llorona;
  if (L.state === "chase" || L.revealT > 0 || inSafeZone(G.player.x, G.player.y)) return;
  if (L.state === "retreat" && radius < 400) return;
  if (dist(L.x, L.y, x, y) < radius) {
    L.state = "investigate";
    L.target = { x: x + rand(-40, 40), y: y + rand(-40, 40) };
    L.pauseT = 0;
  }
}
function escalation() {
  return Math.min(3, G.delivered + (G.hour >= 3 ? 1 : 0));
}

// ---------------------------------------------------------------------------
// Actualización
// ---------------------------------------------------------------------------
function update(dt) {
  G.time += dt;
  updateClock();
  updatePlayer(dt);
  if (state !== "playing") return;
  updatePickups(dt);
  if (state !== "playing") return;
  updateAltars(dt);
  updateLlorona(dt);
  if (state !== "playing") return;
  updateDecoy(dt);
  updateCrows(dt);
  updateWeather(dt);
  updateDirector(dt);
  updateAtmosphere(dt);

  // Cámara y visibilidad
  const p = G.player;
  G.cam.x = lerp(G.cam.x, p.x, Math.min(1, dt * 6));
  G.cam.y = lerp(G.cam.y, p.y, Math.min(1, dt * 6));
  G.cam.x = MW * TILE < W ? (MW * TILE) / 2 : clamp(G.cam.x, W / 2, MW * TILE - W / 2);
  G.cam.y = MH * TILE < H ? (MH * TILE) / 2 : clamp(G.cam.y, H / 2, MH * TILE - H / 2);
  G.vis = computeVisibility(p.x, p.y, Math.max(W, H) * 0.75, 300);

  for (const m of G.messages) m.t -= dt;
  G.messages = G.messages.filter((m) => m.t > 0);
  if (G.notePanel && (G.notePanel.t -= dt) <= 0) G.notePanel = null;
  if (G.time >= NIGHT_SECONDS) lose("dawn");
}

function updateClock() {
  const hour = Math.floor((G.time / NIGHT_SECONDS) * 5);
  if (hour === G.hour) return;
  G.hour = hour;
  const W8 = G.weather;
  if (hour === 1) {
    W8.target = 0.3;
    say("01:00. Empieza a llover.", 3, "#9fb4c9");
  } else if (hour === 2) {
    W8.target = 0.5;
  } else if (hour === 3) {
    // La hora muerta: tres campanadas, se apagan los faroles y ella sale a cazar
    W8.target = 0.95;
    G.huntUntil = G.time + 50;
    say("03:00. La hora muerta. Las campanas suenan solas...", 5, "#ff9a7a");
    [0, 2.6, 5.2].forEach((d) => G.pending.push({ at: G.time + d, fn: () => Sound.bell(1, churchCenter()) }));
    POI.lamps.forEach((l, i) => G.pending.push({ at: G.time + 6 + i * 0.35, fn: () => killLamp(l) }));
    const L = G.llorona;
    if (L.state !== "chase") {
      L.state = "hunt";
      L.target = null;
    }
  } else if (hour === 4) {
    W8.target = 0.6;
    say("04:00. Falta una hora para el amanecer.", 3, "#ffcf9a");
  }
  W8.target = Math.min(1, W8.target + G.delivered * 0.1);
}

function killLamp(l) {
  if (l.dead) return;
  l.dead = true;
  Sound.pop(0.6, l);
}

function updatePlayer(dt) {
  const p = G.player;
  const B = G.breath;

  // Interacción: armarios y ofrendas
  G.prompt = null;
  let nearAltar = null;
  if (p.hide) {
    G.prompt = { text: "Salir del armario", key: "E" };
    if (G.useQueued) {
      p.x = p.hide.exitX;
      p.y = p.hide.exitY;
      p.hide = null;
      Sound.creak(0.5);
    }
  } else {
    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor(p.y / TILE);
    let wardrobe = null;
    for (let y = pty - 1; y <= pty + 1; y++)
      for (let x = ptx - 1; x <= ptx + 1; x++) {
        const c = center(x, y);
        if (tileAt(x, y) === T.WARDROBE && dist(c.x, c.y, p.x, p.y) < 40) wardrobe = c;
      }
    nearAltar = POI.altars.find((a) => dist(a.x, a.y, p.x, p.y) < 46) || null;
    if (wardrobe) {
      G.prompt = { text: "Esconderse en el armario", key: "E" };
      if (!G.hints.wardrobe) {
        G.hints.wardrobe = true;
        say("Un armario. Dentro no te ve... pero puede oírte respirar.", 4, "#9fc29a");
      }
      if (G.useQueued) {
        p.hide = { x: wardrobe.x, y: wardrobe.y, exitX: p.x, exitY: p.y };
        p.x = wardrobe.x;
        p.y = wardrobe.y;
        p.flash = false;
        Sound.creak(0.5);
      }
    } else if (nearAltar) {
      G.prompt = nearAltar.lit > 0 ? { text: `Ofrenda encendida (${Math.ceil(nearAltar.lit)} s)`, key: "" } : { text: "Mantén para encender las velas", key: "E", progress: nearAltar.progress };
    }
  }
  G.useQueued = false;
  if (nearAltar && nearAltar.lit <= 0 && useHeld()) {
    nearAltar.progress += dt / 1.4;
    if (nearAltar.progress >= 1) {
      nearAltar.lit = ALTAR_SECONDS;
      nearAltar.progress = 0;
      Sound.chime();
      say("Las velas de la ofrenda arden. Aquí no se acerca... mientras duren.", 4, "#ffcf7a");
    }
  } else
    POI.altars.forEach((a) => {
      if (a !== nearAltar || !useHeld()) a.progress = Math.max(0, a.progress - dt);
    });

  // Movimiento
  let ix = 0;
  let iy = 0;
  if (!p.hide) {
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
  } else if (!B.holding) {
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
  if (isTouch) {
    if (touch.active && p.moving) p.angle = Math.atan2(iy, ix);
  } else {
    const sx = p.x - G.cam.x + W / 2;
    const sy = p.y - G.cam.y + H / 2;
    p.angle = Math.atan2(mouse.y - sy, mouse.x - sx);
  }

  // Pasos y ruido
  if (p.moving) {
    p.stepTimer -= dt;
    if (p.stepTimer <= 0) {
      p.stepTimer = p.running ? 0.27 : 0.45;
      let surface = SURFACE[tile] || "dirt";
      if (surface === "dirt" && G.weather.rain > 0.4) surface = "mud";
      Sound.step(p.running ? 0.2 : 0.1, surface);
      let radius = p.running ? 270 : 90;
      if (tile === T.WATER) radius += 120;
      if (surface === "wood" && chance(0.3)) radius += 120; // tabla que cruje
      makeNoise(p.x, p.y, radius);
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
    p.battery = Math.max(0, p.battery - BATTERY.drain * dt);
    if (p.battery <= 0) {
      p.flash = false;
      say("La linterna se apagó...", 3, "#c9a27a");
      Sound.click();
    }
  }

  if (p.spotted > 0) p.spotted -= dt;
  p.hidden = p.spotted > 0 ? null : p.hide ? "full" : tile === T.BUSH && !p.running && !p.flash ? "bush" : null;
  if (tile === T.BUSH && !G.hints.bush) {
    G.hints.bush = true;
    say("Entre los arbustos, quieto y sin luz, no te ve.", 4, "#9fc29a");
  }

  // Aguantar la respiración cuando ella está encima de tu escondite
  const L = G.llorona;
  const dL = dist(L.x, L.y, p.x, p.y);
  const wasActive = B.active;
  B.active = !!p.hidden && dL < 100 && L.state !== "retreat" && L.revealT <= 0 && !inSafeZone(p.x, p.y);
  if (B.active && !wasActive && !G.hints.breath) {
    G.hints.breath = true;
    say(isTouch ? "¡Mantén «Correr» para aguantar la respiración!" : "¡Mantén ESPACIO para aguantar la respiración!", 3, "#ff9a7a");
  }
  if (B.active) {
    if (breathHeld() && p.stamina > 0) {
      B.holding = true;
      p.stamina = Math.max(0, p.stamina - STAMINA.holdBreath * dt);
      if (p.stamina <= 0) {
        Sound.breath(0.9, "gasp");
        say("¡No aguantaste más!", 2, "#ff6b6b");
        discovered();
        return;
      }
    } else {
      B.holding = false;
      B.exposure += dt * (dL < 55 ? 1.5 : 0.75) * (p.hidden === "full" ? 0.85 : 1);
      if (B.exposure >= 1) {
        say("¡Te oyó respirar!", 2, "#ff6b6b");
        discovered();
        return;
      }
    }
  } else {
    if (B.holding) Sound.breath(0.3, "exhale");
    B.holding = false;
    B.exposure = Math.max(0, B.exposure - dt * 0.4);
  }
  Sound.setMuffle(B.holding ? 0.85 : 0);
}

// Ella encuentra tu escondite
function discovered() {
  const p = G.player;
  const L = G.llorona;
  G.breath.active = false;
  G.breath.holding = false;
  G.breath.exposure = 0;
  Sound.setMuffle(0);
  if (p.hide) {
    // en un armario no hay escapatoria: abre la puerta
    caught();
    return;
  }
  p.spotted = 2.5;
  L.state = "chase";
  L.lastSeen = { x: p.x, y: p.y };
  L.revealT = 0.7;
  L.loseTimer = 0;
  G.chaseCount++;
  Sound.stopVoice();
  Sound.scream(0.9, L);
  Sound.stinger(1);
  G.shake = 1.4;
}

function caught() {
  state = "caught";
  G.caughtTimer = 0;
  G.endReason = "caught";
  Sound.silenceAll();
  Sound.deathScream();
}

function updatePickups(dt) {
  const p = G.player;
  for (const b of G.batteries) {
    if (!b.taken && dist(b.x, b.y, p.x, p.y) < 22) {
      b.taken = true;
      p.battery = Math.min(100, p.battery + BATTERY.pickup);
      Sound.chime();
      say(`Pilas encontradas (+${BATTERY.pickup}% de batería).`, 2.5, "#e6d37a");
    }
  }
  for (const n of G.notes) {
    if (!n.taken && dist(n.x, n.y, p.x, p.y) < 24) {
      n.taken = true;
      G.notesFound++;
      Sound.page();
      G.notePanel = { ...NOTES[n.key], t: 11, max: 11 };
    }
  }

  for (const c of G.children) {
    c.bob += dt * 6;
    if (c.state !== "lost") continue;
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
      const vol = clamp(1 - d / 800, 0, 1);
      Sound.sob(vol * vol, c, c.voice, false);
    }
  }
  G.followers.forEach((c, i) => {
    const tgt = G.trail[Math.max(0, G.trail.length - 1 - (i + 1) * 9)];
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
    Sound.bell(0.9, churchCenter());
    if (G.delivered >= CHILD_NAMES.length) {
      win();
      return;
    }
    say(`${names} ${names.includes(",") ? "están" : "está"} a salvo. Faltan ${CHILD_NAMES.length - G.delivered}.`, 4.5, "#e6d37a");
    say(["La tormenta empeora. Ella está furiosa.", "Se oye más cerca... y más rápida.", "Solo falta uno. Ahora va en serio."][Math.min(2, G.delivered - 1)], 4, "#ff9a7a");
    G.weather.target = Math.min(1, G.weather.target + 0.12);
    const L = G.llorona;
    L.state = "wander";
    L.target = null;
  }
}

function updateAltars(dt) {
  for (const a of POI.altars) {
    if (a.lit <= 0) continue;
    // con viento fuerte las velas duran menos
    a.lit -= dt * (1 + G.weather.wind * 0.6);
    if (a.lit <= 0) {
      a.lit = 0;
      if (dist(a.x, a.y, G.player.x, G.player.y) < 500) say("El viento apagó las velas de la ofrenda.", 3, "#c9a27a");
    }
  }
}

// ---------------------------------------------------------------------------
// La Llorona
// ---------------------------------------------------------------------------
// Volumen del lamento según la leyenda: lejos suena fuerte, cerca suena débil
function folkloreVolume(d) {
  return 0.2 + 0.72 * clamp((d - 120) / 800, 0, 1);
}

function farPoint(minD) {
  const p = G.player;
  return randomReachable((x, y) => dist(x, y, p.x, p.y) > minD && !inSafeZone(x, y), 600);
}

function nearPlayerPoint(spread) {
  const p = G.player;
  return randomReachable((x, y) => dist(x, y, p.x, p.y) < spread && dist(x, y, p.x, p.y) > spread * 0.3 && !inSafeZone(x, y), 600);
}

function buildSearch(around) {
  // revisa primero escondites cercanos (arbustos y armarios), como el alien olfateando taquillas
  const pts = [];
  const tx0 = Math.floor(around.x / TILE);
  const ty0 = Math.floor(around.y / TILE);
  for (let y = ty0 - 5; y <= ty0 + 5; y++)
    for (let x = tx0 - 5; x <= tx0 + 5; x++) {
      const t = tileAt(x, y);
      if (t === T.BUSH || t === T.WARDROBE) pts.push(center(x, y));
    }
  pts.sort((a, b) => dist(a.x, a.y, around.x, around.y) - dist(b.x, b.y, around.x, around.y));
  const out = pts.slice(0, 3);
  for (let i = 0; i < 2; i++) out.push({ x: around.x + rand(-130, 130), y: around.y + rand(-130, 130) });
  return out.sort(() => Math.random() - 0.4);
}

function updateLlorona(dt) {
  const p = G.player;
  const L = G.llorona;
  const d = dist(L.x, L.y, p.x, p.y);
  const playerSafe = inSafeZone(p.x, p.y);
  const W8 = G.weather;

  // Revelación: se queda gritando un instante antes de lanzarse
  if (L.revealT > 0) {
    L.revealT -= dt;
    proximitySounds(dt, d);
    return;
  }

  // --- Sentidos ---
  let range = p.flash ? 330 : 150;
  if (litAt(p.x, p.y)) range += 120;
  if (p.running) range += 40;
  const inBeam = p.flash && d < 380 && angleDiff(Math.atan2(L.y - p.y, L.x - p.x), p.angle) < 0.45;
  let canSee = !p.hidden && (d < range || inBeam) && lineOfSight(L.x, L.y, p.x, p.y);
  if (p.hidden === "bush" && d < 24 && !G.breath.holding && !playerSafe) {
    say("¡Te encontró entre los arbustos!", 2, "#ff6b6b");
    discovered();
    return;
  }
  if (playerSafe) canSee = false;
  if (L.state === "retreat" && d > 170) canSee = false;

  if (canSee) {
    if (L.state !== "chase") {
      G.chaseCount++;
      Sound.stopVoice();
      Sound.stinger(1);
      Sound.scream(clamp(1 - d / 500, 0.3, 0.75), L);
      say("¡TE VIO! ¡Corre!", 2.5, "#ff6b6b");
      G.shake = 1.2;
      L.blinkT = rand(2.5, 4);
    }
    L.state = "chase";
    L.lastSeen = { x: p.x, y: p.y };
    L.loseTimer = 0;
    p.spotted = 1.2; // te vio entrar: esconderte delante de ella no sirve
  } else if (L.state === "chase") {
    L.loseTimer += dt;
    if (L.loseTimer > 2.5 || playerSafe) {
      L.state = "search";
      L.searchPts = buildSearch(L.lastSeen);
      L.pauseT = 0;
      say(playerSafe ? "No puede entrar aquí..." : "Te perdió de vista... te está buscando.", 2.5, "#9fc29a");
    }
  }

  // --- Objetivo según el estado ---
  const bonus = G.delivered * LLORONA.perChild + G.followers.length * 4;
  let tgt = null;
  let spd = LLORONA.wander;
  if (L.pauseT > 0) {
    L.pauseT -= dt;
  } else if (L.state === "chase") {
    tgt = canSee ? p : L.lastSeen;
    spd = LLORONA.chase + bonus;
    // a veces «salta» hacia ti con un parpadeo
    L.blinkT -= dt;
    if (canSee && L.blinkT <= 0 && d > 110) {
      L.blinkT = rand(3, 6) - G.delivered * 0.5;
      const a = Math.atan2(p.y - L.y, p.x - L.x);
      L.x += Math.cos(a) * 48;
      L.y += Math.sin(a) * 48;
      L.glitch = 0.25;
      Sound.whisper(0.35, L);
    }
  } else if (L.state === "search") {
    const sp = L.searchPts[0];
    if (!sp) {
      L.state = "wander";
      L.target = null;
    } else {
      tgt = sp;
      spd = LLORONA.search + bonus * 0.5;
      if (dist(L.x, L.y, sp.x, sp.y) < 14) {
        L.searchPts.shift();
        L.pauseT = rand(1, 1.8); // se detiene a «olfatear»
      }
    }
  } else if (L.state === "investigate" && L.target) {
    tgt = L.target;
    spd = LLORONA.investigate + bonus * 0.5;
    if (dist(L.x, L.y, tgt.x, tgt.y) < 16) {
      L.pauseT = 1.4;
      L.state = "search";
      L.searchPts = buildSearch(L.target).slice(0, 3);
    }
  } else if (L.state === "hunt") {
    // la hora muerta / empujón del director: va hacia tu zona, sin saber exactamente dónde estás
    if (!L.target || dist(L.x, L.y, L.target.x, L.target.y) < 20) L.target = nearPlayerPoint(220);
    tgt = L.target;
    spd = 84 + bonus * 0.5;
    if (G.time > G.huntUntil && G.director.calm >= 0) {
      L.state = "search";
      L.searchPts = buildSearch(p);
    }
  } else if (L.state === "retreat") {
    if (!L.target) L.target = farPoint(900);
    tgt = L.target;
    spd = 90;
    L.retreatT -= dt;
    if (L.retreatT <= 0 || dist(L.x, L.y, tgt.x, tgt.y) < 20) {
      L.state = "wander";
      L.target = null;
    }
  } else {
    L.state = "wander";
    if (!L.target || dist(L.x, L.y, L.target.x, L.target.y) < 20) L.target = wanderTarget();
    tgt = L.target;
    spd = LLORONA.wander + bonus * 0.4;
  }
  if (tileAtPx(L.x, L.y) === T.WATER) spd *= 1.2; // el río es su terreno

  // --- Movimiento (flota y atraviesa todo, salvo terreno sagrado y ofrendas encendidas) ---
  const ox = L.x;
  const oy = L.y;
  if (tgt) {
    const ddx = tgt.x - L.x;
    const ddy = tgt.y - L.y;
    const m = Math.hypot(ddx, ddy) || 1;
    L.vx = lerp(L.vx, (ddx / m) * spd, Math.min(1, dt * 4));
    L.vy = lerp(L.vy, (ddy / m) * spd, Math.min(1, dt * 4));
  } else {
    L.vx = lerp(L.vx, 0, Math.min(1, dt * 5));
    L.vy = lerp(L.vy, 0, Math.min(1, dt * 5));
  }
  L.x += L.vx * dt;
  L.y += L.vy * dt;
  const pushOut = (cx, cy, r) => {
    const dc = dist(L.x, L.y, cx, cy);
    if (dc < r) {
      const k = r / (dc || 1);
      L.x = cx + (L.x - cx) * k;
      L.y = cy + (L.y - cy) * k;
    }
  };
  const cc = churchCenter();
  pushOut(cc.x, cc.y, SANCTUARY_R + 10);
  POI.altars.forEach((a) => a.lit > 0 && pushOut(a.x, a.y, ALTAR_R + 6));
  if (L.glitch > 0) L.glitch -= dt;

  // Huellas mojadas (se ven con la linterna)
  if (tileAtPx(L.x, L.y) !== T.WATER) {
    L.stepAcc += dist(ox, oy, L.x, L.y);
    if (L.stepAcc > 24) {
      L.stepAcc = 0;
      L.foot = -L.foot;
      const a = Math.atan2(L.vy, L.vx);
      G.footprints.push({ x: L.x + Math.cos(a + Math.PI / 2) * 4 * L.foot, y: L.y + Math.sin(a + Math.PI / 2) * 4 * L.foot + 18, a, t: G.time });
      if (G.footprints.length > 180) G.footprints.shift();
    }
  }

  // Si te alejas mucho, aparece cerca (fuera de tu luz)
  if (L.state === "wander" && d > 800) L.farTimer += dt;
  else L.farTimer = 0;
  if (L.farTimer > 16 && !playerSafe && G.time > 45) {
    const pos = randomReachable((x, y) => {
      const dd = dist(x, y, p.x, p.y);
      if (dd < 380 || dd > 560 || inSafeZone(x, y)) return false;
      return angleDiff(Math.atan2(y - p.y, x - p.x), p.angle) > 1.3;
    });
    L.x = pos.x;
    L.y = pos.y;
    L.farTimer = 0;
    L.target = null;
    L.wailTimer = 0.5;
  }

  // --- Su voz: el lamento grabado mientras te busca ---
  const searching = L.state !== "chase";
  if (searching) {
    L.wailTimer -= dt;
    if (L.wailTimer <= 0 && !Sound.voice) {
      L.wailTimer = rand(9, 15) - G.delivered;
      Sound.lloronaVoice(folkloreVolume(d), L);
      say(`«${pick(LLORONA_LINES)}»`, 3, "#d8d8ff");
    }
    Sound.updateVoice(L, folkloreVolume(d));
  } else Sound.stopVoice();
  proximitySounds(dt, d);

  // Se lleva a los niños que te siguen
  for (let i = G.followers.length - 1; i >= 0; i--) {
    const ch = G.followers[i];
    if (dist(ch.x, ch.y, L.x, L.y) < 18) {
      G.followers.splice(i, 1);
      const pos = randomReachable((x, y, tx) => dist(x, y, p.x, p.y) > 800 && !inSafeZone(x, y) && tileAt(tx, Math.floor(y / TILE)) !== T.WATER);
      ch.x = pos.x;
      ch.y = pos.y;
      ch.state = "lost";
      G.reclaimed++;
      Sound.scream(0.6, L);
      say(`¡La Llorona se llevó a ${ch.name}! Búscalo otra vez...`, 4, "#ff6b6b");
    }
  }

  // ¡Te atrapó!
  if (d < LLORONA.catchDist && !playerSafe && !p.hidden) caught();
  void W8;
}

function proximitySounds(dt, d) {
  const L = G.llorona;
  if (d > 320) return;
  L.dripT -= dt;
  if (L.dripT <= 0) {
    L.dripT = rand(0.4, 1.1);
    Sound.drip(0.5, L);
  }
  L.dragT -= dt;
  if (L.dragT <= 0) {
    L.dragT = rand(2.5, 4);
    Sound.drag(0.6, L);
  }
  if (d < 170) {
    L.raspT -= dt;
    if (L.raspT <= 0) {
      L.raspT = rand(2, 3.2);
      Sound.rasp(0.8, L);
    }
  }
}

function wanderTarget() {
  const p = G.player;
  // al principio de la noche solo ronda el río: la tensión va subiendo poco a poco
  const r = G.time < 45 ? 0.3 + Math.random() * 0.7 : Math.random();
  let pos;
  if (r < 0.3) pos = { x: p.x + rand(-420, 420), y: p.y + rand(-420, 420) }; // acecha cerca de ti
  else if (r < 0.75) {
    const tx = randi(3, MW - 4); // vaga por la orilla del río
    pos = { x: tx * TILE, y: (riverY[tx] + rand(-1, 3)) * TILE };
  } else pos = { x: rand(3, MW - 3) * TILE, y: rand(3, MH - 3) * TILE };
  if (inSafeZone(pos.x, pos.y)) pos.y += SANCTUARY_R * 1.4;
  pos.x = clamp(pos.x, 2 * TILE, (MW - 2) * TILE);
  pos.y = clamp(pos.y, 2 * TILE, (MH - 2) * TILE);
  return pos;
}

// ---------------------------------------------------------------------------
// Niño falso: ella imita el llanto para atraerte
// ---------------------------------------------------------------------------
function updateDecoy(dt) {
  const p = G.player;
  const L = G.llorona;
  const lost = G.children.some((c) => c.state === "lost");
  G.decoyTimer -= dt;
  if (!G.decoy && G.delivered >= 1 && lost && G.decoyTimer <= 0 && L.state !== "chase") {
    const pos = randomReachable((x, y, tx, ty) => {
      const dd = dist(x, y, p.x, p.y);
      return dd > 480 && dd < 900 && !inSafeZone(x, y) && tileAt(tx, ty) !== T.WATER;
    });
    G.decoy = { x: pos.x, y: pos.y, sobTimer: 1, life: 120, bob: 0 };
    G.decoyTimer = rand(75, 110);
  }
  const D = G.decoy;
  if (!D) return;
  D.bob += dt * 4;
  D.life -= dt;
  const d = dist(D.x, D.y, p.x, p.y);
  D.sobTimer -= dt;
  if (D.sobTimer <= 0) {
    D.sobTimer = rand(3, 5);
    const vol = clamp(1 - d / 800, 0, 1);
    Sound.sob(vol * vol, D, 520, true);
  }
  if (d < 62) {
    // ¡era ella!
    G.decoy = null;
    L.x = D.x;
    L.y = D.y;
    L.vx = L.vy = 0;
    L.state = "chase";
    L.lastSeen = { x: p.x, y: p.y };
    L.loseTimer = 0;
    L.revealT = 0.9;
    G.chaseCount++;
    Sound.stopVoice();
    Sound.scream(1, D);
    Sound.stinger(1);
    G.shake = 2;
    say("¡NO ERA UN NIÑO!", 3, "#ff6b6b");
  } else if (D.life <= 0) G.decoy = null;
}

// ---------------------------------------------------------------------------
// Cuervos: si pasas corriendo, salen volando y la alertan
// ---------------------------------------------------------------------------
function updateCrows(dt) {
  const p = G.player;
  for (const f of G.crows) {
    f.t += dt;
    if (f.state === "perched") {
      const trigger = p.running ? 150 : p.moving ? 45 : 0;
      if (dist(f.x, f.y, p.x, p.y) < trigger) {
        f.state = "flying";
        f.t = 0;
        Sound.caw(0.8, f);
        makeNoise(f.x, f.y, 520);
        if (!G.hints.crows) {
          G.hints.crows = true;
          say("¡Los cuervos te delataron! Cerca de ellos, no corras.", 4, "#c9a27a");
        }
      }
    } else if (f.state === "flying" && f.t > 4) {
      f.state = "gone";
      f.t = 0;
    } else if (f.state === "gone" && f.t > 70) {
      f.state = "perched";
    }
  }
}

// ---------------------------------------------------------------------------
// Clima: lluvia, viento, relámpagos y truenos
// ---------------------------------------------------------------------------
function lightning(apparitionAhead) {
  const W8 = G.weather;
  W8.flashT = 0.55;
  const delay = rand(0.15, 2.8);
  W8.thunders.push({ t: delay, vol: rand(0.6, 1), near: delay < 0.8 });
  if (apparitionAhead) {
    // aparece de pie en la distancia, solo mientras dura el destello
    const p = G.player;
    for (let i = 0; i < 20; i++) {
      const a = p.angle + rand(-0.5, 0.5);
      const r = rand(220, 330);
      const x = p.x + Math.cos(a) * r;
      const y = p.y + Math.sin(a) * r;
      if (lineOfSight(p.x, p.y, x, y) && !inSafeZone(x, y)) {
        G.apparition = { x, y, t: 0.55 };
        break;
      }
    }
  }
}

function lightningValue(t) {
  // destello: blanco, oscuro, blanco, y se apaga
  if (t > 0.47) return 1;
  if (t > 0.4) return 0.15;
  if (t > 0.33) return 0.85;
  return Math.max(0, t / 0.33) * 0.6;
}

function updateWeather(dt) {
  const W8 = G.weather;
  W8.rain = lerp(W8.rain, W8.target, Math.min(1, dt * 0.06));
  W8.wind = clamp(0.2 + W8.rain * 0.6 + Math.sin(G.time * 0.13) * 0.2, 0, 1);
  if (W8.rain > 0.45) {
    W8.nextLightning -= dt;
    if (W8.nextLightning <= 0) {
      W8.nextLightning = rand(10, 26) * (1.5 - W8.rain);
      lightning(false);
    }
  }
  if (W8.flashT > 0) W8.flashT = Math.max(0, W8.flashT - dt);
  for (const th of W8.thunders) {
    th.t -= dt;
    if (th.t <= 0) Sound.thunder(th.vol, th.near);
  }
  W8.thunders = W8.thunders.filter((th) => th.t > 0);
  if (G.apparition && (G.apparition.t -= dt) <= 0) G.apparition = null;

  // salpicaduras en el suelo (se ven con luz)
  const n = Math.floor(W8.rain * 14 * (dt * 60));
  for (let i = 0; i < n; i++) W8.splashes.push({ x: G.cam.x + rand(-W / 2, W / 2), y: G.cam.y + rand(-H / 2, H / 2), t: 0.3 });
  for (const s of W8.splashes) s.t -= dt;
  W8.splashes = W8.splashes.filter((s) => s.t > 0);
  if (W8.splashes.length > 260) W8.splashes.splice(0, W8.splashes.length - 260);
}

// ---------------------------------------------------------------------------
// Director de tensión
// ---------------------------------------------------------------------------
function updateDirector(dt) {
  const D = G.director;
  const L = G.llorona;
  const p = G.player;
  const d = dist(L.x, L.y, p.x, p.y);
  const near = d < 380;
  if (L.state === "chase") D.menace += dt * 16;
  else if (near) D.menace += dt * 10 * (1 - d / 380) * (lineOfSight(L.x, L.y, p.x, p.y) ? 1.6 : 1);
  else D.menace = Math.max(0, D.menace - dt * 5);

  // Alivio: tanta presión cansa; se retira un rato
  if (D.menace > 110 && L.state !== "chase" && L.revealT <= 0 && G.time > G.huntUntil) {
    L.state = "retreat";
    L.target = farPoint(900);
    L.retreatT = rand(16, 28) - G.delivered * 3;
    D.menace = 15;
  }
  // Empujón: si llevas mucho rato tranquilo, ella viene «por casualidad»
  if (!near && L.state === "wander") D.calm += dt;
  else D.calm = 0;
  if (D.calm > 48 - G.delivered * 9) {
    D.calm = 0;
    L.state = "investigate";
    L.target = nearPlayerPoint(200);
  }
  // Sustos cuando la tensión está baja
  D.eventCD -= dt;
  if (D.eventCD <= 0 && D.menace < 35 && L.state !== "chase" && !G.breath.active) {
    D.eventCD = rand(24, 40) - G.delivered * 3;
    triggerScare();
  }
  // tareas programadas (campanadas, faroles...)
  G.pending = G.pending.filter((ev) => {
    if (G.time >= ev.at) {
      ev.fn();
      return false;
    }
    return true;
  });
}

function behindPlayer(r) {
  const p = G.player;
  const a = p.angle + Math.PI + rand(-0.6, 0.6);
  return { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
}

function triggerScare() {
  const p = G.player;
  const W8 = G.weather;
  const options = [];
  const visibleLamp = POI.lamps.find((l) => !l.dead && dist(l.x, l.y, p.x, p.y) < 420);
  if (W8.rain > 0.35) options.push(["aparicion", 3]);
  if (visibleLamp) options.push(["farol", 2]);
  options.push(["susurro", 2], ["huellas", 2], ["campana", 1], ["risa", 2], ["silencio", 2]);
  if (G.delivered >= 1) options.push(["cara", 2]);
  if (POI.well && dist(POI.well.x, POI.well.y, p.x, p.y) < 420) options.push(["pozo", 4]);
  if (dist(POI.hacienda.cradle.x, POI.hacienda.cradle.y, p.x, p.y) < 900) options.push(["cuna", 3]);
  const total = options.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * total;
  let kind = options[0][0];
  for (const [k, w] of options) {
    if ((r -= w) <= 0) {
      kind = k;
      break;
    }
  }
  const later = (t, fn) => G.pending.push({ at: G.time + t, fn });
  switch (kind) {
    case "aparicion":
      // silencio... y en el relámpago está ella, de pie, mirándote
      G.silenceT = 1.8;
      later(1.8, () => lightning(true));
      break;
    case "farol":
      visibleLamp.dying = 1.4;
      later(1.4, () => killLamp(visibleLamp));
      break;
    case "susurro":
      Sound.whisper(0.55, behindPlayer(70));
      break;
    case "huellas": {
      // huellas recién hechas que llegan hasta ti
      const from = behindPlayer(320);
      const a = Math.atan2(p.y - from.y, p.x - from.x);
      for (let i = 0; i < 12; i++) {
        const k = i / 12;
        const side = i % 2 ? 1 : -1;
        G.footprints.push({ x: lerp(from.x, p.x, k * 0.85) + Math.cos(a + Math.PI / 2) * 4 * side, y: lerp(from.y, p.y, k * 0.85) + Math.sin(a + Math.PI / 2) * 4 * side, a, t: G.time });
      }
      Sound.drip(0.6, behindPlayer(40));
      break;
    }
    case "campana":
      Sound.bell(0.7, churchCenter());
      break;
    case "risa":
      Sound.giggle(0.5, behindPlayer(90));
      break;
    case "silencio":
      G.silenceT = 3;
      later(3, () => Sound.branch(0.9, behindPlayer(60)));
      break;
    case "cara":
      G.faceFlash = { t: 0.28, side: chance(0.5) ? -1 : 1, y: rand(0.25, 0.75) };
      Sound.stinger(0.35);
      break;
    case "pozo":
      G.wellHand = 2.2;
      Sound.whisper(0.6, POI.well);
      break;
    case "cuna":
      G.cradleRock = 9;
      Sound.musicBox(0.7, POI.hacienda.cradle);
      break;
  }
}

// ---------------------------------------------------------------------------
// Ambiente: miedo, latidos, música y sonidos de la noche
// ---------------------------------------------------------------------------
function updateAtmosphere(dt) {
  const p = G.player;
  const L = G.llorona;
  const W8 = G.weather;
  const dL = dist(L.x, L.y, p.x, p.y);
  const targetFear = clamp(1 - dL / 420, 0, 1) * 0.85 + (L.state === "chase" ? 0.3 : 0) + (G.breath.active ? 0.25 : 0);
  G.fear = lerp(G.fear, clamp(targetFear, 0, 1), Math.min(1, dt * 2));
  G.heartTimer -= dt;
  if (G.heartTimer <= 0 && G.fear > 0.08) {
    G.heartTimer = 1.15 - G.fear * 0.72;
    Sound.heartbeat(G.fear * (G.breath.holding ? 1.2 : 0.8));
  }
  G.shake = Math.max(G.shake - dt * 3, G.fear > 0.7 ? (G.fear - 0.7) * 6 : 0);

  // jadeo con poco aliento
  if (p.stamina < STAMINA.max * 0.3 && !G.breath.holding) {
    p.breathTimer -= dt;
    if (p.breathTimer <= 0) {
      p.breathTimer = 0.8;
      Sound.breath(0.2 + (1 - p.stamina / (STAMINA.max * 0.3)) * 0.25, "pant");
    }
  }

  // persecución: tambores
  if (L.state === "chase" && L.revealT <= 0) {
    G.chaseBeatT -= dt;
    if (G.chaseBeatT <= 0) {
      G.chaseBeatT = dL < 200 ? 0.32 : 0.42;
      Sound.chasePulse(0.55, G.chaseBeat++);
    }
  }

  if (G.silenceT > 0) G.silenceT -= dt;
  const ptx = clamp(Math.floor(p.x / TILE), 0, MW - 1);
  const riverDist = Math.abs(p.y / TILE - (riverY[ptx] + 0.5));
  Sound.mix({
    river: clamp(1 - riverDist / 12, 0, 1),
    rain: W8.rain,
    wind: W8.wind,
    dread: clamp(G.fear * 1.2 - 0.15, 0, 1),
    esc: escalation(),
    silence: G.silenceT > 0,
  });

  // sonidos de la noche
  G.ambTimer -= dt;
  if (G.ambTimer <= 0 && Sound.ctx && G.silenceT <= 0) {
    G.ambTimer = rand(3, 8);
    const at = { x: p.x + rand(-500, 500), y: p.y + rand(-500, 500) };
    const r = Math.random();
    if (riverDist < 8 && r < 0.3) Sound.frog(rand(0.4, 0.8), at);
    else if (r < 0.45 && W8.rain < 0.6) Sound.crickets(rand(0.5, 1), at);
    else if (r < 0.58) Sound.owl(rand(0.4, 0.8), at);
    else if (r < 0.7) Sound.branch(rand(0.3, 0.7), at);
    else if (r < 0.82) Sound.gust(0.4 + W8.wind * 0.6);
    else if (r < 0.9) Sound.howl(rand(0.3, 0.6), at);
  }
  // susurros cuando tienes mucho miedo
  G.whisperTimer -= dt;
  if (G.whisperTimer <= 0) {
    G.whisperTimer = rand(4, 9);
    if (G.fear > 0.45) Sound.whisper(G.fear * 0.5, behindPlayer(rand(40, 120)));
  }
  // risitas de las muñecas de la isla
  const isl = POI.island;
  G.giggleTimer -= dt;
  if (G.giggleTimer <= 0) {
    G.giggleTimer = rand(9, 16);
    if (dist(isl.x, isl.y, p.x, p.y) < 380) Sound.giggle(0.45, isl);
  }
  // cajita de música en la cuna de la hacienda
  const cr = POI.hacienda.cradle;
  G.musicBoxTimer -= dt;
  if (G.musicBoxTimer <= 0) {
    G.musicBoxTimer = rand(22, 32);
    if (dist(cr.x, cr.y, p.x, p.y) < 520) {
      G.cradleRock = 8;
      Sound.musicBox(0.6, cr);
    }
  }
  if (G.cradleRock > 0) G.cradleRock -= dt;
  if (G.wellHand > 0) G.wellHand -= dt;
  if (G.faceFlash && (G.faceFlash.t -= dt) <= 0) G.faceFlash = null;
  for (const l of POI.lamps) if (l.dying > 0) l.dying -= dt;
  for (const f of G.fog) {
    f.x += (6 + W8.wind * 22) * dt;
    if (f.x - f.r > MW * TILE) f.x = -f.r;
  }
}

function lose(reason) {
  Sound.silenceAll();
  G.endReason = reason;
  state = "gameover";
}
function win() {
  Sound.silenceAll();
  Sound.bell(1, churchCenter());
  state = "win";
}
