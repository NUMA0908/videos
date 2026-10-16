/* La Llorona — sprites y utilidades de dibujo (personas, la Llorona, su cara, textos, barras). */
"use strict";

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
