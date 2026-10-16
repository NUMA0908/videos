/* La Llorona — dibujo de cada fotograma, HUD, pantallas y bucle principal. */
"use strict";

let renderDt = 0;

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (state === "title") return drawTitle();
  if (!G) return;

  const p = G.player;
  const L = G.llorona;
  const t = G.time;
  const W8 = G.weather;
  const flash = W8.flashT > 0 ? lightningValue(W8.flashT) : 0;
  const shx = (Math.random() - 0.5) * G.shake * 8;
  const shy = (Math.random() - 0.5) * G.shake * 8;
  const ox = Math.round(W / 2 - G.cam.x + shx);
  const oy = Math.round(H / 2 - G.cam.y + shy);

  // --- Mundo ---
  ctx.save();
  ctx.translate(ox, oy);
  ctx.drawImage(mapCanvas, 0, 0);
  drawWater(ox, oy, t);
  drawFootprints(ox, oy);
  drawProps(t);
  for (const n of G.notes) if (!n.taken) drawNote(n, t);
  for (const b of G.batteries) if (!b.taken) drawBattery(b.x, b.y, t);

  const ents = [];
  for (const c of G.children) {
    if (c.state === "safe") continue;
    const shiver = c.state === "lost" ? Math.sin(t * 45 + c.bob) * 0.9 : 0; // los niños de verdad tiemblan
    ents.push({ y: c.y, draw: () => drawPerson(c.x + shiver, c.y, Math.PI / 2, { body: "#7d97b8", head: "#c9a98a", size: 0.72, bob: c.bob }) });
  }
  if (G.decoy) ents.push({ y: G.decoy.y, draw: () => drawDecoy(G.decoy, t) });
  ents.push({
    y: p.y,
    draw: () => {
      if (p.hide) return;
      ctx.globalAlpha = p.hidden ? 0.55 : 1;
      drawPerson(p.x, p.y, p.angle, { body: "#8a5a3c", head: "#d1a77f", bob: p.moving ? t * 14 : 0 });
      ctx.globalAlpha = 1;
    },
  });
  ents.push({ y: L.y, draw: () => drawLlorona(L.x, L.y, 0.95, t, L.state === "chase", L.vx) });
  ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
  if (G.apparition && flash > 0.3) drawLlorona(G.apparition.x, G.apparition.y, flash, t, true, 0);
  drawCrows(t);

  // salpicaduras de lluvia (se ven con luz)
  ctx.strokeStyle = "rgba(170,195,220,0.35)";
  ctx.lineWidth = 1;
  for (const s of W8.splashes) {
    const r = (0.3 - s.t) * 18;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // niebla (más espesa cerca del río)
  const vx0 = -ox;
  const vy0 = -oy;
  for (const f of G.fog) {
    if (f.x + f.r < vx0 || f.x - f.r > vx0 + W || f.y + f.r < vy0 || f.y - f.r > vy0 + H) continue;
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, `rgba(170,180,200,${0.09 + W8.rain * 0.04})`);
    g.addColorStop(1, "rgba(170,180,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
  }
  ctx.restore();

  // --- Oscuridad ---
  drawDarkness(ox, oy, t, flash);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(dark, 0, 0);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // --- Lo que atraviesa la oscuridad ---
  drawRain(flash);
  ctx.save();
  ctx.translate(ox, oy);
  if (W8.rain < 0.45) {
    for (const f of G.fireflies) {
      const fx = f.x + Math.sin(t * f.sp + f.ph) * 20;
      const fy = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * 14;
      const a = (0.35 + Math.sin(t * 3 + f.ph) * 0.35) * (1 - W8.rain * 2);
      if (a <= 0.05) continue;
      ctx.fillStyle = `rgba(200,255,140,${a})`;
      ctx.fillRect(fx, fy, 2, 2);
    }
  }
  const dL = dist(L.x, L.y, p.x, p.y);
  const losL = lineOfSight(p.x, p.y, L.x, L.y);
  if (dL < 300 && losL && flash < 0.3) {
    // su silueta blanca se adivina en la oscuridad
    const flick = Math.random() < 0.85 ? 1 : 0;
    drawLlorona(L.x, L.y, (1 - dL / 300) * 0.22 * flick, t, L.state === "chase", L.vx);
  }
  if (L.state === "chase" && losL) {
    ctx.fillStyle = "rgba(255,40,40,0.9)";
    ctx.fillRect(L.x + 1, L.y - 30 + Math.sin(t * 1.7) * 2.5, 2, 2);
  }
  ctx.restore();

  drawEffects(t, flash);
  drawHUD(ox, oy, t);

  if (state === "caught") drawJumpscare();
  if (state === "paused") drawOverlay("PAUSA", ["Pulsa P / Esc o haz clic para continuar", "M: silenciar"]);
  if (state === "gameover") drawGameOver();
  if (state === "win") drawWin();
}

// ---------------------------------------------------------------------------
// Mundo dinámico
// ---------------------------------------------------------------------------
function drawWater(ox, oy, t) {
  const x0 = Math.max(0, Math.floor(-ox / TILE));
  const x1 = Math.min(MW - 1, Math.ceil((W - ox) / TILE));
  const y0 = Math.max(0, Math.floor(-oy / TILE));
  const y1 = Math.min(MH - 1, Math.ceil((H - oy) / TILE));
  const rain = G.weather.rain;
  ctx.fillStyle = "rgba(120,160,200,0.12)";
  ctx.strokeStyle = "rgba(140,170,200,0.25)";
  ctx.lineWidth = 1;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(tx, ty) !== T.WATER) continue;
      const wx = tx * TILE;
      const wy = ty * TILE;
      const o = Math.sin(t * 1.5 + tx * 0.7 + ty * 1.3) * 8;
      ctx.fillRect(wx + 8 + o, wy + 10, 10, 1);
      ctx.fillRect(wx + 4 - o, wy + 22, 8, 1);
      // gotas de lluvia en el agua
      if (rain > 0.2) {
        const k = (t * 1.7 + tx * 0.37 + ty * 0.71) % 1;
        if ((tx * 7 + ty * 13) % 3 === 0 || rain > 0.6) {
          ctx.beginPath();
          ctx.ellipse(wx + ((tx * 17) % 24) + 4, wy + ((ty * 11) % 24) + 4, k * 7, k * 3.5, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
}

function drawFootprints(ox, oy) {
  for (const f of G.footprints) {
    const age = G.time - f.t;
    if (age > 45 || f.x + ox < -10 || f.x + ox > W + 10 || f.y + oy < -10 || f.y + oy > H + 10) continue;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.a + Math.PI / 2);
    ctx.fillStyle = `rgba(8,18,28,${0.55 * (1 - age / 45)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawProps(t) {
  const W8 = G.weather;
  // faroles
  for (const l of POI.lamps) {
    const on = lampOn(l, t);
    ctx.fillStyle = "#1e1e1e";
    ctx.fillRect(l.x - 1.5, l.y - 4, 3, 14);
    ctx.fillStyle = on ? "#ffe2a0" : "#333";
    ctx.fillRect(l.x - 4, l.y - 8, 8, 5);
  }
  // ofrendas: velas
  for (const a of POI.altars) {
    for (let i = 0; i < 5; i++) {
      const cx = a.x - 12 + i * 6;
      const cy = a.y - 12;
      ctx.fillStyle = "#e8e0c8";
      ctx.fillRect(cx - 1, cy - 4, 2, 5);
      if (a.lit > 0) {
        ctx.fillStyle = `rgba(255,${180 + Math.random() * 50},80,0.95)`;
        ctx.beginPath();
        ctx.ellipse(cx, cy - 6 + Math.random(), 1.4, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  // velas en las tumbas
  for (const c of POI.candles) {
    ctx.fillStyle = "#ddd2b8";
    ctx.fillRect(c.x - 1, c.y - 3, 2, 4);
    ctx.fillStyle = `rgba(255,${170 + Math.random() * 60},70,0.9)`;
    ctx.fillRect(c.x - 1, c.y - 6 + Math.random(), 2, 3);
  }
  // tendederos con sábanas que ondean (de lejos parecen alguien de pie)
  for (const cl of POI.clotheslines) {
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cl.x1, cl.y - 16);
    ctx.quadraticCurveTo((cl.x1 + cl.x2) / 2, cl.y - 10, cl.x2, cl.y - 16);
    ctx.stroke();
    const n = 3;
    for (let i = 0; i < n; i++) {
      const sx = lerp(cl.x1, cl.x2, (i + 0.5) / n) - 9;
      const wv = Math.sin(t * 2.5 + cl.ph + i) * (3 + W8.wind * 9);
      ctx.fillStyle = "rgba(214,214,206,0.9)";
      ctx.beginPath();
      ctx.moveTo(sx, cl.y - 14);
      ctx.lineTo(sx + 18, cl.y - 14);
      ctx.lineTo(sx + 18 + wv, cl.y + 12);
      ctx.lineTo(sx + 9 + wv * 0.6, cl.y + 9);
      ctx.lineTo(sx + wv, cl.y + 13);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Isla de las Muñecas: muñecas colgadas que giran la cabeza hacia ti
  const isl = POI.island;
  const p = G.player;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const r = 15 + (i % 3) * 5;
    const sway = Math.sin(t * 1.3 + i) * (1.5 + W8.wind * 3);
    const dx = isl.x + Math.cos(a) * r + sway;
    const dy = isl.y + Math.sin(a) * r * 0.7 + 6;
    ctx.strokeStyle = "rgba(60,50,40,0.9)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(isl.x + Math.cos(a) * r * 0.6, isl.y + Math.sin(a) * r * 0.4 - 4);
    ctx.lineTo(dx, dy - 5);
    ctx.stroke();
    ctx.fillStyle = i % 2 ? "#b9a68a" : "#a8b0a0";
    ctx.fillRect(dx - 2, dy - 2, 4, 6);
    ctx.fillStyle = "#d8cfc0";
    ctx.beginPath();
    ctx.arc(dx, dy - 4, 2.6, 0, Math.PI * 2);
    ctx.fill();
    const look = Math.atan2(p.y - dy, p.x - dx);
    ctx.fillStyle = "#000";
    ctx.fillRect(dx + Math.cos(look) * 1.2 - 1.2, dy - 4.6 + Math.sin(look) * 0.8, 0.9, 0.9);
    ctx.fillRect(dx + Math.cos(look) * 1.2 + 0.6, dy - 4.6 + Math.sin(look) * 0.8, 0.9, 0.9);
  }
  // cuna que se mece sola
  const cr = POI.hacienda.cradle;
  const rock = Math.sin(t * 3) * (G.cradleRock > 0 ? 0.22 : 0.04);
  ctx.save();
  ctx.translate(cr.x, cr.y);
  ctx.rotate(rock);
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(-11, -6, 24, 16);
  ctx.fillStyle = "#5a3a22";
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#cfc6b4";
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(120,20,20,0.5)";
  ctx.fillRect(-3, -2, 6, 3);
  ctx.restore();
  // mano que sale del pozo
  if (POI.well && G.wellHand > 0) {
    const k = Math.sin((1 - G.wellHand / 2.2) * Math.PI);
    const w = POI.well;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.strokeStyle = "#c9cdc0";
    ctx.lineCap = "round";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(4 * k, -12 * k);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (let f = -2; f <= 2; f++) {
      ctx.beginPath();
      ctx.moveTo(4 * k, -12 * k);
      ctx.lineTo(4 * k + f * 2.5 * k, -18 * k);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function lampOn(l, t) {
  if (l.dead) return false;
  if (l.dying > 0) return Math.random() < 0.4;
  const L = G.llorona;
  const near = dist(L.x, L.y, l.x, l.y) < 260;
  if (near) return Math.random() < 0.35; // interferencia cuando ella pasa cerca
  if (l.broken) return Math.sin(t * 7 + l.ph) + Math.sin(t * 13.3 + l.ph) > -0.6;
  return true;
}

function drawNote(n, t) {
  ctx.save();
  ctx.translate(n.x, n.y);
  ctx.rotate(0.3);
  ctx.fillStyle = "#d8ccaa";
  ctx.fillRect(-5, -6, 10, 12);
  ctx.fillStyle = "rgba(60,40,20,0.6)";
  for (let i = -3; i <= 3; i += 2) ctx.fillRect(-3.5, i, 7, 0.8);
  ctx.restore();
  if ((t * 1.3 + n.x) % 2 < 0.15) {
    ctx.fillStyle = "rgba(255,250,220,0.9)";
    ctx.fillRect(n.x + 3, n.y - 8, 2, 2);
  }
}

// Niño falso: encorvado, sin temblar, con el pelo mojado y goteando
function drawDecoy(D, t) {
  drawPerson(D.x, D.y + 2, Math.PI / 2, { body: "#5f6e7c", head: "#a6aca3", size: 0.72, bob: D.bob * 0.3 });
  ctx.strokeStyle = "#050505";
  ctx.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(D.x + i * 1.4, D.y - 6);
    ctx.lineTo(D.x + i * 2, D.y + 5);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(150,175,200,0.7)";
  for (let i = 0; i < 3; i++) {
    const k = (t * 1.5 + i / 3) % 1;
    ctx.fillRect(D.x - 5 + i * 5, D.y + 4 + k * 10, 1, 2);
  }
}

function drawCrows(t) {
  ctx.fillStyle = "#050505";
  for (const f of G.crows) {
    if (f.state === "gone") continue;
    for (const b of f.birds) {
      let x = f.x + b.ox;
      let y = f.y + b.oy;
      if (f.state === "flying") {
        const k = f.t * 90 * b.sp;
        x += Math.cos(b.a) * k;
        y += Math.sin(b.a) * k - f.t * 30;
        const flap = Math.sin(t * 30 + b.a) * 4;
        ctx.strokeStyle = "#050505";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 5, y - flap);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 5, y - flap);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x, y + Math.sin(t * 2 + b.a) * 0.5, 3, 2, b.a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Oscuridad, luces y sombras
// ---------------------------------------------------------------------------
function drawDarkness(ox, oy, t, flash) {
  const p = G.player;
  const L = G.llorona;
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dctx.globalCompositeOperation = "source-over";
  const dawn = clamp((G.time - NIGHT_SECONDS * 0.88) / (NIGHT_SECONDS * 0.12), 0, 1);
  dctx.fillStyle = `rgba(2,3,9,${0.975 - dawn * 0.3 - flash * 0.72})`;
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = "destination-out";

  const light = (x, y, r, a) => {
    const g = dctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    dctx.fillStyle = g;
    dctx.beginPath();
    dctx.arc(x, y, r, 0, Math.PI * 2);
    dctx.fill();
  };
  const vis = G.vis;
  const tracePoly = () => {
    dctx.beginPath();
    dctx.moveTo(vis[0] + ox, vis[1] + oy);
    for (let i = 2; i < vis.length; i += 2) dctx.lineTo(vis[i] + ox, vis[i + 1] + oy);
    dctx.closePath();
  };
  // lo que está en tu línea de visión se adivina un poco; detrás de árboles y muros, negro
  if (vis) {
    tracePoly();
    dctx.fillStyle = `rgba(0,0,0,${0.07 + flash * 0.55})`;
    dctx.fill();
  }

  const px = p.x + ox;
  const py = p.y + oy;
  dctx.save();
  if (vis) {
    tracePoly();
    dctx.clip();
  }
  light(px, py, p.hide ? 40 : 70, 0.75);
  if (p.flash) {
    const dL = dist(L.x, L.y, p.x, p.y);
    const interference = dL < 240 ? (1 - dL / 240) * 0.4 : 0;
    const low = p.battery < 20;
    const off = (low && Math.random() < 0.15) || Math.random() < interference;
    if (!off) {
      const len = 340 * (low ? 0.65 + p.battery / 60 : 1) * (0.97 + Math.random() * 0.03);
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
  dctx.restore();

  // luces del pueblo
  const door = churchDoor();
  const lampFlick = 0.85 + Math.sin(t * 9) * 0.05 + Math.random() * 0.05;
  light(door.x + ox - 30, door.y + oy - 6, 120 * lampFlick, 0.9);
  light(door.x + ox + 30, door.y + oy - 6, 120 * lampFlick, 0.9);
  light(door.x + ox, door.y + oy - 60, 200, 0.35);
  const warm = [];
  for (const l of POI.lamps) {
    if (!lampOn(l, t)) continue;
    light(l.x + ox, l.y + oy + 14, 115, 0.85);
    warm.push([l.x + ox, l.y + oy + 14, 110]);
  }
  for (const a of POI.altars) {
    if (a.lit <= 0) continue;
    const f = 0.9 + Math.random() * 0.1;
    light(a.x + ox, a.y + oy, ALTAR_R * f, 0.85);
    warm.push([a.x + ox, a.y + oy, ALTAR_R]);
  }
  for (const c of POI.candles) light(c.x + ox, c.y + oy, 34 + Math.random() * 6, 0.7);
  if (G.decoy) light(G.decoy.x + ox, G.decoy.y + oy, 26, 0.25); // un brillo húmedo y frío

  dctx.globalCompositeOperation = "source-over";
  warm.push([door.x + ox, door.y + oy, 150]);
  for (const [x, y, r] of warm) {
    const g = dctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,170,60,0.12)");
    g.addColorStop(1, "rgba(255,170,60,0)");
    dctx.fillStyle = g;
    dctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function drawRain(flash) {
  const W8 = G.weather;
  const want = Math.floor(W8.rain * 340);
  const drops = W8.drops;
  while (drops.length < want) drops.push({ x: Math.random() * W, y: Math.random() * H, len: rand(8, 18), sp: rand(700, 1000) });
  if (drops.length > want) drops.length = want;
  if (!drops.length) return;
  const slant = W8.wind * 0.35;
  ctx.strokeStyle = `rgba(170,190,220,${0.16 + W8.rain * 0.1 + flash * 0.5})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of drops) {
    d.y += d.sp * renderDt;
    d.x += d.sp * slant * renderDt;
    if (d.y > H) {
      d.y = -d.len;
      d.x = Math.random() * (W + 100) - 100;
    }
    if (d.x > W) d.x -= W + 50;
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.len * slant, d.y + d.len);
  }
  ctx.stroke();
}

function drawEffects(t, flash) {
  const B = G.breath;
  if (flash > 0) {
    ctx.fillStyle = `rgba(220,230,255,${flash * 0.22})`;
    ctx.fillRect(0, 0, W, H);
  }
  // viñeta roja según el miedo
  if (G.fear > 0.05) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(80,0,0,0)");
    g.addColorStop(1, `rgba(90,0,0,${G.fear * 0.65})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // grano
  const grains = 120 + Math.floor(G.fear * 400);
  for (let i = 0; i < grains; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.25)";
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  if (G.fear > 0.6 && Math.random() < G.fear * 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + Math.random() * 0.06})`;
    ctx.fillRect(0, Math.random() * H, W, 2 + Math.random() * 6);
  }
  // dentro del armario: miras entre las rendijas
  if (G.player.hide) {
    ctx.fillStyle = "rgba(8,5,3,0.96)";
    ctx.fillRect(0, 0, W, H * 0.3);
    ctx.fillRect(0, H * 0.7, W, H * 0.3);
    for (let y = H * 0.3; y < H * 0.7; y += 22) ctx.fillRect(0, y, W, 15);
    ctx.fillRect(0, 0, W * 0.18, H);
    ctx.fillRect(W * 0.82, 0, W * 0.18, H);
  }
  // aguantando la respiración: túnel oscuro que late
  if (B.holding) {
    const pulse = 0.5 + Math.sin(t * 9) * 0.1;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.12, W / 2, H / 2, Math.max(W, H) * 0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${0.75 + pulse * 0.2})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // su cara asoma en el borde de la pantalla
  if (G.faceFlash) {
    const f = G.faceFlash;
    ctx.save();
    ctx.globalAlpha = clamp(f.t / 0.1, 0, 1) * 0.85;
    drawFace(f.side < 0 ? W * 0.04 : W * 0.96, H * f.y, Math.min(W, H) / 900, t);
    ctx.restore();
  }
  // viñeta base
  const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------
function drawHUD(ox, oy, t) {
  const p = G.player;
  const B = G.breath;
  const pad = 18;
  const bw = Math.min(170, W * 0.32);
  bar(pad, pad + 16, bw, 8, p.battery / 100, p.battery < 20 ? "#c9643a" : "#e6d37a", `Linterna ${Math.ceil(p.battery)}%${p.flash ? "" : " (apagada)"}`);
  bar(pad, pad + 50, bw, 8, p.stamina / STAMINA.max, p.exhausted ? "#7a4a4a" : B.holding ? "#7aa0c9" : "#8fbf8a", B.holding ? "Aguantando la respiración" : p.exhausted ? "Aliento (agotado)" : "Aliento");

  // niños: dorado = a salvo, azul = te sigue, hueco = perdido
  ctx.lineWidth = 1.5;
  G.children.forEach((c, i) => {
    const x = pad + 8 + i * 22;
    const y = pad + 80;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    if (c.state === "safe") {
      ctx.fillStyle = "#e6d37a";
      ctx.fill();
    } else if (c.state === "following") {
      ctx.fillStyle = "#9ac3e6";
      ctx.fill();
    } else {
      ctx.strokeStyle = "#8a8070";
      ctx.stroke();
    }
  });
  ctx.font = "13px Georgia, serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#cfc6b8";
  ctx.fillText(`Notas ${G.notesFound}/${G.notes.length}`, pad + 8 + 4 * 22, pad + 80);
  ctx.textBaseline = "top";
  ctx.font = "14px Georgia, serif";
  if (p.hide) {
    ctx.fillStyle = "#9fc29a";
    ctx.fillText("Escondido en el armario", pad, pad + 96);
  } else if (p.hidden) {
    ctx.fillStyle = "#9fc29a";
    ctx.fillText("Escondido", pad, pad + 96);
  } else if (inSanctuary(p.x, p.y)) {
    ctx.fillStyle = "#e6d37a";
    ctx.fillText("Terreno sagrado: aquí no puede entrar", pad, pad + 96);
  } else if (inSafeZone(p.x, p.y)) {
    ctx.fillStyle = "#ffcf7a";
    ctx.fillText("La luz de la ofrenda te protege", pad, pad + 96);
  }

  // reloj
  const frac = G.time / NIGHT_SECONDS;
  const mins = Math.floor(frac * 300);
  ctx.textAlign = "right";
  ctx.font = "22px Georgia, serif";
  ctx.fillStyle = frac > 0.85 ? "#ffb070" : G.hour === 3 ? "#ff8a7a" : "#e8e0d0";
  ctx.fillText(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")} a. m.`, W - pad, pad);
  ctx.font = "12px Georgia, serif";
  ctx.fillStyle = "#9a9284";
  ctx.fillText("Amanece a las 05:00", W - pad, pad + 28);

  // flechas de guía
  if (G.followers.length) {
    const d = churchDoor();
    edgeArrow(d.x, d.y, ox, oy, "#e6d37a", 0.8);
  }
  const lost = G.children.filter((c) => c.state === "lost").map((c) => ({ x: c.x, y: c.y }));
  if (G.decoy) lost.push(G.decoy); // no se distingue del real
  for (const c of lost) {
    const dd = dist(c.x, c.y, p.x, p.y);
    if (dd < 520) edgeArrow(c.x, c.y, ox, oy, "#bfe0ff", (1 - dd / 520) * (0.5 + Math.sin(t * 4) * 0.3));
  }

  // aguantar la respiración
  if (B.active) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${W < 600 ? 18 : 24}px Georgia, serif`;
    ctx.fillStyle = B.holding ? "#9ac3e6" : `rgba(255,${90 + Math.sin(t * 12) * 60},90,1)`;
    const msg = B.holding ? "No respires..." : isTouch || W < 700 ? "¡AGUANTA LA RESPIRACIÓN!" : "¡AGUANTA LA RESPIRACIÓN! (mantén ESPACIO)";
    const qy = H * 0.34;
    ctx.fillText(msg, W / 2, qy);
    if (!B.holding) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(W / 2 - 80, qy + 22, 160, 6);
      ctx.fillStyle = "#ff5a5a";
      ctx.fillRect(W / 2 - 80, qy + 22, 160 * clamp(B.exposure, 0, 1), 6);
    }
  }

  // nota encontrada
  if (G.notePanel) {
    const n = G.notePanel;
    const a = clamp(n.t / 0.8, 0, 1) * clamp((n.max - n.t) / 0.4, 0, 1);
    const pw = Math.min(460, W - 32);
    ctx.font = `${W < 600 ? 13 : 15}px Georgia, serif`;
    const lines = wrap(n.text, pw - 32);
    const ph = 50 + lines.length * 21;
    const x = W / 2 - pw / 2;
    const y = W < 600 ? 142 : 60;
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(216,204,170,0.95)";
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = "rgba(90,60,30,0.6)";
    ctx.strokeRect(x + 4, y + 4, pw - 8, ph - 8);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#3a2410";
    ctx.font = `italic bold ${W < 600 ? 13 : 15}px Georgia, serif`;
    ctx.fillText(n.title, x + 16, y + 14);
    ctx.font = `${W < 600 ? 13 : 15}px Georgia, serif`;
    lines.forEach((l, i) => ctx.fillText(l, x + 16, y + 38 + i * 21));
    ctx.globalAlpha = 1;
  }

  // mensajes
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const baseY = H - (isTouch ? 200 : 60);
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

  // acción disponible (encima de los mensajes)
  if (G.prompt && !isTouch) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "15px Georgia, serif";
    const text = G.prompt.key ? `[${G.prompt.key}] ${G.prompt.text}` : G.prompt.text;
    const w = ctx.measureText(text).width;
    const y = baseY - rows.length * 28 - 14;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(W / 2 - w / 2 - 12, y - 14, w + 24, 28);
    if (G.prompt.progress > 0) {
      ctx.fillStyle = "rgba(255,200,100,0.35)";
      ctx.fillRect(W / 2 - w / 2 - 12, y - 14, (w + 24) * G.prompt.progress, 28);
    }
    ctx.strokeStyle = "rgba(240,230,208,0.5)";
    ctx.strokeRect(W / 2 - w / 2 - 12, y - 14, w + 24, 28);
    ctx.fillStyle = "#f0e6d0";
    ctx.fillText(text, W / 2, y);
  }

  if (isTouch) drawTouchControls();
}

function drawTouchControls() {
  const p = G.player;
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
  const btn = (c, on, label) => {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = on ? "#8fbf8a" : "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#fff";
    ctx.font = "13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, c.x, c.y);
  };
  btn(b.run, touch.run !== false, G.breath.active ? "Aguantar" : "Correr");
  btn(b.flash, p.flash, "Luz");
  if (G.prompt && G.prompt.key) btn(b.use, touch.use !== false, p.hide ? "Salir" : "Usar");
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------------
function drawGameOver() {
  if (G.endReason === "dawn") {
    drawOverlay(
      "AMANECIÓ",
      ["Los niños que quedaban se perdieron para siempre en la neblina del río.", `Salvaste a ${G.delivered} de ${CHILD_NAMES.length}.`, "Haz clic o pulsa Enter para intentarlo de nuevo"],
      "#ffb070",
    );
  } else {
    drawOverlay(
      "TE ATRAPÓ LA LLORONA",
      ["«Ahora tú serás mi hijo...»", `Salvaste a ${G.delivered} de ${CHILD_NAMES.length} · sobreviviste ${timeLabel()} · notas ${G.notesFound}/${G.notes.length}`, "Haz clic o pulsa Enter para intentarlo de nuevo"],
      "#ff5a5a",
    );
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
    `Tiempo: ${timeLabel()} · Veces que te vio: ${G.chaseCount} · Niños que te quitó: ${G.reclaimed} · Notas: ${G.notesFound}/${G.notes.length}`,
    "Haz clic o pulsa Enter para jugar otra vez",
  ];
  wrapAll(lines, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.36 + 64 + i * 26));
}

function drawTitle() {
  const t = titleTime;
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
  // relámpago ocasional que la revela
  const bolt = (t % 9) > 8.6 ? 1 : 0;
  if (bolt) {
    ctx.fillStyle = "rgba(200,210,240,0.12)";
    ctx.fillRect(0, 0, W, H);
  }
  const lx = W * 0.78 + Math.sin(t * 0.3) * 30;
  ctx.save();
  ctx.translate(lx, H * 0.72);
  ctx.scale(2.2, 2.2);
  ctx.translate(-lx, -H * 0.72);
  drawLlorona(lx, H * 0.72, 0.22 + Math.sin(t * 2) * 0.06 + bolt * 0.6, t, bolt === 1, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const big = Math.min(96, W * 0.14);
  ctx.font = `${big}px Georgia, serif`;
  ctx.fillStyle = "rgba(160,0,0,0.6)";
  ctx.fillText("LA LLORONA", W / 2 + Math.sin(t * 13) * 2, H * 0.2 + 3);
  ctx.fillStyle = "#e8e0d0";
  ctx.fillText("LA LLORONA", W / 2, H * 0.2);

  const small = W < 600 ? 13 : 17;
  ctx.font = `italic ${small}px Georgia, serif`;
  ctx.fillStyle = "#b8b0a2";
  const story = [
    "Cuatro niños del pueblo salieron de noche y no volvieron.",
    "Junto al río se oye un llanto de mujer: «¡Ay, mis hijos!».",
    "Tráelos a la iglesia antes del amanecer. Ella no puede pisar terreno sagrado.",
    "Dicen los viejos: si la oyes lejos, está cerca.",
  ];
  wrapAll(story, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.31 + i * (small + 9)));

  ctx.font = `${small - 1}px Georgia, serif`;
  ctx.fillStyle = "#8f887c";
  const controls = isTouch
    ? ["Joystick: moverse · Correr · Luz · Usar", "Escondido, mantén «Correr» para aguantar la respiración"]
    : [
        "WASD / flechas: moverse · Shift: correr · Ratón: apuntar la linterna",
        "F o clic derecho: linterna · E: esconderse / encender ofrendas",
        "Escondido: mantén ESPACIO para aguantar la respiración · P: pausa · M: silencio",
        "Juega con audífonos.",
      ];
  wrapAll(controls, W - 40).forEach((l, i) => ctx.fillText(l, W / 2, H * 0.57 + i * (small + 7)));

  ctx.font = `${small + 3}px Georgia, serif`;
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.4;
  ctx.fillStyle = "#e8e0d0";
  ctx.fillText(isTouch ? "Toca para empezar" : "Haz clic para empezar", W / 2, H * 0.86);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Bucle principal
// ---------------------------------------------------------------------------
let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  renderDt = dt;
  titleTime += dt;
  if (state === "playing") update(dt);
  else if (state === "caught") {
    G.caughtTimer += dt;
    if (G.caughtTimer > 3.2) state = "gameover";
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
    set state(v) {
      state = v;
    },
    churchDoor,
    Sound,
    POI: () => POI,
    triggerScare,
    lightning,
  };
}
