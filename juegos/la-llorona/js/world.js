/* La Llorona — mapa: generación con lugares de interés, colisiones, línea de visión y
 * polígono de visibilidad (las sombras que proyectan árboles y paredes). */
"use strict";

let map = new Uint8Array(MW * MH);
let mapCanvas = null;
let riverY = [];
let church = null; // {x, y, w, h} en tiles
let POI = null; // lugares de interés (ver generateMap)
let reachable = [];
let reachSet = new Uint8Array(MW * MH);

const tileAt = (tx, ty) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH ? T.TREE : map[ty * MW + tx]);
const tileAtPx = (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE));
const setTile = (tx, ty, v) => {
  if (tx >= 0 && ty >= 0 && tx < MW && ty < MH) map[ty * MW + tx] = v;
};
const center = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

// ---------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------
function generateMap(seed) {
  srng = mulberry32(seed);
  map = new Uint8Array(MW * MH).fill(T.GRASS);
  const reserved = new Uint8Array(MW * MH); // alrededor de los lugares: sin árboles
  const reserve = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < MW && y < MH) reserved[y * MW + x] = 1;
  };
  POI = { lamps: [], altars: [], candles: [], clotheslines: [], deadTrees: [], houses: [], childSpots: [], noteSpots: {} };

  // --- Río serpenteante ---
  const phase = srand(0, Math.PI * 2);
  riverY = [];
  for (let x = 0; x < MW; x++) {
    const cy = Math.round(38 + Math.sin(x * 0.1 + phase) * 4 + Math.sin(x * 0.045 + phase * 2) * 3);
    riverY[x] = cy;
    for (let y = cy - 1; y <= cy + 2; y++) setTile(x, y, T.WATER);
  }

  // --- Isla de las Muñecas: el río se ensancha y deja un islote con un árbol seco ---
  const ix = srandi(16, MW - 17);
  for (let x = ix - 5; x <= ix + 5; x++) for (let y = riverY[x] - 3; y <= riverY[x] + 4; y++) setTile(x, y, T.WATER);
  const iy = riverY[ix];
  for (let x = ix - 1; x <= ix + 1; x++) for (let y = iy; y <= iy + 1; y++) setTile(x, y, T.GRASS);
  setTile(ix, iy, T.DEADTREE);
  POI.island = { tx: ix, ty: iy, ...center(ix, iy) };
  POI.childSpots.push({ poi: "isla", ...center(ix + 1, iy + 1) });
  POI.noteSpots.island = center(ix - 1, iy + 1);
  reserve(ix - 6, iy - 4, ix + 6, iy + 5);

  // --- Iglesia (refugio) ---
  church = { x: 38, y: 5, w: 8, h: 5 };
  for (let y = church.y - 2; y <= church.y + church.h + 4; y++) for (let x = church.x - 3; x <= church.x + church.w + 2; x++) setTile(x, y, T.PATH);
  for (let y = church.y; y < church.y + church.h; y++) for (let x = church.x; x < church.x + church.w; x++) setTile(x, y, T.CHURCH);
  const doorX = church.x + church.w / 2;
  const doorY = church.y + church.h + 4;
  reserve(church.x - 6, 0, church.x + church.w + 5, doorY + 3);

  // --- Hacienda en ruinas de María, a la orilla del río (lado opuesto a la isla) ---
  const hw = 11;
  const hh = 7;
  const hx = ix < MW / 2 ? srandi(MW - 30, MW - 17) : srandi(6, 17);
  const hy = clamp(Math.min(riverY[hx], riverY[hx + hw - 1], riverY[hx + 5]) - hh - 3, 19, 30);
  for (let y = hy; y < hy + hh; y++)
    for (let x = hx; x < hx + hw; x++) {
      const edge = x === hx || y === hy || x === hx + hw - 1 || y === hy + hh - 1;
      const corner = (x === hx || x === hx + hw - 1) && (y === hy || y === hy + hh - 1);
      setTile(x, y, edge && (corner || srng() > 0.24) ? T.WALL : T.FLOOR);
    }
  const hdx = hx + 5;
  setTile(hdx, hy + hh - 1, T.FLOOR);
  setTile(hdx + 1, hy + hh - 1, T.FLOOR);
  setTile(hdx, hy, T.FLOOR);
  setTile(hdx, hy + 3, T.CRADLE);
  setTile(hx + 1, hy + 1, T.WARDROBE);
  setTile(hx + hw - 2, hy + 1, T.WARDROBE);
  POI.hacienda = { x0: hx, y0: hy, w: hw, h: hh, cradle: center(hdx, hy + 3) };
  POI.childSpots.push({ poi: "hacienda", ...center(hx + 2, hy + 4) });
  POI.noteSpots.hacienda = center(hx + 8, hy + 4);
  reserve(hx - 2, hy - 2, hx + hw + 1, hy + hh + 1);
  // muelle hacia el río con una lancha
  const dockY0 = hy + hh;
  const dockRy = riverY[hdx];
  for (let y = dockY0; y < dockRy - 1; y++) for (let x = hdx; x <= hdx + 1; x++) setTile(x, y, T.PATH);
  for (let y = dockRy - 1; y <= dockRy + 1; y++) for (let x = hdx; x <= hdx + 1; x++) setTile(x, y, T.BRIDGE);
  POI.dock = { tx: hdx, ty: dockRy + 1, ...center(hdx, dockRy + 1) };
  POI.noteSpots.dock = center(hdx + 1, dockRy + 1);
  reserve(hdx - 1, dockY0, hdx + 3, dockRy + 2);

  // --- Caminos y puentes ---
  const avoid = [ix, hdx];
  const pickBridge = (lo, hi) => {
    for (let i = 0; i < 40; i++) {
      const b = srandi(lo, hi);
      if (avoid.every((a) => Math.abs(b - a) >= 8)) return b;
    }
    return lo;
  };
  const bridges = [pickBridge(8, 24), pickBridge(32, 50), pickBridge(58, 76)];
  const KEEP = flagsFor([T.CHURCH, T.WALL, T.FLOOR, T.WARDROBE, T.CRADLE, T.BRIDGE, T.DEADTREE]);
  const carvePath = (x0, y0, x1, y1) => {
    let x = x0;
    let y = y0;
    for (let guard = 0; (x !== x1 || y !== y1) && guard < 600; guard++) {
      const t = tileAt(x, y);
      if (t === T.WATER) setTile(x, y, T.BRIDGE);
      else if (!KEEP[t]) setTile(x, y, T.PATH);
      const dx = x1 - x;
      const dy = y1 - y;
      if (dy !== 0 && (srng() < 0.6 || dx === 0)) y += Math.sign(dy);
      else if (dx !== 0) x += Math.sign(dx);
    }
  };
  bridges.forEach((bx) => {
    const ry = riverY[bx];
    carvePath(doorX, doorY, bx, ry - 5);
    for (let y = ry - 5; y <= ry + 6; y++) for (let x = bx; x <= bx + 1; x++) if (!KEEP[tileAt(x, y)] || tileAt(x, y) === T.BRIDGE) setTile(x, y, tileAt(x, y) === T.WATER ? T.BRIDGE : T.PATH);
    carvePath(bx, ry + 6, clamp(bx + srandi(-10, 10), 4, MW - 5), srandi(50, 58));
  });
  // calle principal con faroles
  const roadY = doorY + 2;
  carvePath(5, roadY, MW - 6, roadY);
  for (let x = 7; x < MW - 6; x += 8) {
    if (tileAt(x, roadY - 1) !== T.GRASS && tileAt(x, roadY - 1) !== T.PATH) continue;
    if (Math.abs(x - doorX) < 5) continue;
    setTile(x, roadY - 1, T.LAMP);
    POI.lamps.push({ tx: x, ty: roadY - 1, x: x * TILE + TILE / 2, y: (roadY - 1) * TILE + 4, broken: srng() < 0.3, dead: false, ph: srng() * 10 });
  }

  // --- Cementerio con cripta (lado opuesto a la hacienda) ---
  const cemLeft = hx > MW / 2;
  const cem = { x: cemLeft ? 4 : MW - 20, y: 50, w: 16, h: 11 };
  const crypt = { x: cem.x + 5, y: cem.y + 1, w: 6, h: 4 };
  for (let y = cem.y; y < cem.y + cem.h; y++)
    for (let x = cem.x; x < cem.x + cem.w; x++) {
      if (tileAt(x, y) === T.WATER) continue;
      const border = x === cem.x || y === cem.y || x === cem.x + cem.w - 1 || y === cem.y + cem.h - 1;
      const inCrypt = x >= crypt.x - 1 && x <= crypt.x + crypt.w && y >= crypt.y - 1 && y <= crypt.y + crypt.h + 1;
      if (border) setTile(x, y, T.PATH);
      else if (inCrypt) setTile(x, y, T.GRASS);
      else if (x % 2 === 0 && y % 2 === 0 && srng() < 0.85) {
        setTile(x, y, T.GRAVE);
        if (srng() < 0.3) POI.candles.push({ x: x * TILE + TILE / 2 + 8, y: y * TILE + TILE / 2 + 6, ph: srng() * 10 });
      } else setTile(x, y, T.GRASS);
    }
  for (let y = crypt.y; y < crypt.y + crypt.h; y++)
    for (let x = crypt.x; x < crypt.x + crypt.w; x++) {
      const edge = x === crypt.x || y === crypt.y || x === crypt.x + crypt.w - 1 || y === crypt.y + crypt.h - 1;
      setTile(x, y, edge ? T.CRYPT : T.FLOOR);
    }
  const cdx = crypt.x + 2;
  setTile(cdx, crypt.y + crypt.h - 1, T.FLOOR);
  setTile(cdx + 1, crypt.y + crypt.h - 1, T.FLOOR);
  for (let y = crypt.y + crypt.h; y < cem.y + cem.h; y++) {
    setTile(cdx, y, T.PATH);
    setTile(cdx + 1, y, T.PATH);
  }
  POI.crypt = { ...crypt, door: center(cdx, crypt.y + crypt.h) };
  POI.cemetery = cem;
  POI.childSpots.push({ poi: "cripta", ...center(cdx, crypt.y + 1) });
  POI.noteSpots.crypt = center(cdx + 2, crypt.y + 2);
  setTile(cem.x + 2, cem.y + 3, T.DEADTREE);
  setTile(cem.x + cem.w - 3, cem.y + cem.h - 3, T.DEADTREE);
  reserve(cem.x - 1, cem.y - 1, cem.x + cem.w, cem.y + cem.h);

  // --- Casas abandonadas (algunas con armario para esconderse y tendedero) ---
  const areaFree = (x0, y0, w, h, m = 1) => {
    for (let y = y0 - m; y < y0 + h + m; y++)
      for (let x = x0 - m; x < x0 + w + m; x++) {
        if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) return false;
        if (tileAt(x, y) !== T.GRASS || reserved[y * MW + x]) return false;
      }
    return true;
  };
  for (let tries = 0; tries < 500 && POI.houses.length < 13; tries++) {
    const w = srandi(4, 6);
    const h = srandi(4, 5);
    const x0 = srandi(3, MW - w - 3);
    const y0 = srandi(3, MH - h - 3);
    if (!areaFree(x0, y0, w, h)) continue;
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
        setTile(x, y, edge ? T.WALL : T.FLOOR);
      }
    const doors = [];
    if (srng() < 0.5) {
      doors.push([x0 + srandi(1, w - 2), y0], [x0 + srandi(1, w - 2), y0 + h - 1]);
    } else {
      doors.push([x0, y0 + srandi(1, h - 2)], [x0 + w - 1, y0 + srandi(1, h - 2)]);
    }
    doors.forEach(([x, y]) => setTile(x, y, T.FLOOR));
    // armario en una esquina interior que no tape una puerta
    if (srng() < 0.6) {
      const corners = [
        [x0 + 1, y0 + 1],
        [x0 + w - 2, y0 + 1],
        [x0 + 1, y0 + h - 2],
        [x0 + w - 2, y0 + h - 2],
      ].filter(([cx, cy]) => doors.every(([dx, dy]) => Math.abs(dx - cx) + Math.abs(dy - cy) > 1));
      if (corners.length) {
        const [cx, cy] = corners[Math.floor(srng() * corners.length)];
        setTile(cx, cy, T.WARDROBE);
      }
    }
    const house = { x0, y0, w, h };
    POI.houses.push(house);
    reserve(x0 - 1, y0 - 1, x0 + w, y0 + h);
    // tendedero con sábanas blancas debajo de la casa
    if (srng() < 0.45 && areaFree(x0, y0 + h + 1, w, 1, 0)) {
      POI.clotheslines.push({ x1: x0 * TILE + 6, x2: (x0 + w) * TILE - 6, y: (y0 + h + 1) * TILE + 10, ph: srng() * 6 });
      reserve(x0, y0 + h + 1, x0 + w - 1, y0 + h + 1);
    }
  }
  if (POI.houses.length) {
    const hs = POI.houses[Math.floor(srng() * POI.houses.length)];
    POI.noteSpots.house = center(hs.x0 + Math.floor(hs.w / 2), hs.y0 + Math.floor(hs.h / 2));
  }

  // --- Pozo y ofrendas en claros ---
  const findClearing = (x0, y0, x1, y1, r) => {
    for (let i = 0; i < 300; i++) {
      const x = srandi(x0, x1);
      const y = srandi(y0, y1);
      if (areaFree(x - r, y - r, r * 2 + 1, r * 2 + 1, 0) && dist(x, y, doorX, doorY) > 12) return [x, y];
    }
    return null;
  };
  const well = findClearing(6, 18, MW - 7, riverY[Math.floor(MW / 2)] - 4, 2) || findClearing(4, 4, MW - 5, MH - 5, 1);
  if (well) {
    setTile(well[0], well[1], T.WELL);
    POI.well = { tx: well[0], ty: well[1], ...center(well[0], well[1]) };
    POI.noteSpots.well = center(well[0], well[1] + 1);
    reserve(well[0] - 2, well[1] - 2, well[0] + 2, well[1] + 2);
  }
  const altarZones = [
    [4, 18, 26, 30],
    [MW - 27, 18, MW - 5, 30],
    [28, 48, MW - 29, MH - 5],
  ];
  altarZones.forEach(([x0, y0, x1, y1]) => {
    const a = findClearing(x0, y0, x1, y1, 1);
    if (!a) return;
    setTile(a[0], a[1], T.ALTAR);
    POI.altars.push({ tx: a[0], ty: a[1], ...center(a[0], a[1]), lit: 0, progress: 0 });
    reserve(a[0] - 2, a[1] - 2, a[0] + 2, a[1] + 2);
  });

  // --- Bosque: pocos árboles sólidos, en manchas; muchos matorrales para esconderse ---
  const n1 = srand(0, 10);
  const n2 = srand(0, 10);
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      if (tileAt(x, y) !== T.GRASS || reserved[y * MW + x]) continue;
      const n = Math.sin(x * 0.17 + n1) * Math.cos(y * 0.21 + n2) + Math.sin((x + y) * 0.07 + n1);
      const density = 0.012 + clamp(n * 0.085, 0, 0.12);
      const r = srng();
      if (r < density) setTile(x, y, T.TREE);
      else if (r < density + 0.006) setTile(x, y, T.DEADTREE);
      else if (r < density + 0.04) setTile(x, y, T.BUSH);
    }
  for (let i = 0; i < 24; i++) {
    const cx = srandi(4, MW - 5);
    const cy = srandi(4, MH - 5);
    for (let k = 0; k < 4; k++) {
      const bx = cx + srandi(-1, 1);
      const by = cy + srandi(-1, 1);
      if (!reserved[by * MW + bx] && (tileAt(bx, by) === T.GRASS || tileAt(bx, by) === T.TREE)) setTile(bx, by, T.BUSH);
    }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) setTile(x, y, T.TREE);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (tileAt(x, y) === T.DEADTREE) POI.deadTrees.push(center(x, y));

  computeReachable(Math.floor(doorX), doorY - 2);
  renderMapCanvas();
}

function computeReachable(sx, sy) {
  reachSet = new Uint8Array(MW * MH);
  const q = [[sx, sy]];
  reachSet[sy * MW + sx] = 1;
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
      if (reachSet[i] || SOLID[map[i]]) continue;
      reachSet[i] = 1;
      q.push([nx, ny]);
    }
  }
}

const isReachablePx = (x, y) => reachSet[Math.floor(y / TILE) * MW + Math.floor(x / TILE)] === 1;

function randomReachable(filter, tries = 400) {
  for (let i = 0; i < tries; i++) {
    const [tx, ty] = reachable[Math.floor(Math.random() * reachable.length)];
    const p = center(tx, ty);
    if (!filter || filter(p.x, p.y, tx, ty)) return p;
  }
  const [tx, ty] = reachable[Math.floor(Math.random() * reachable.length)];
  return center(tx, ty);
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------
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
function inSanctuary(x, y) {
  const c = churchCenter();
  return dist(x, y, c.x, c.y) < SANCTUARY_R;
}

// Polígono de lo que el jugador puede ver: rayos que se detienen en lo opaco
function computeVisibility(px, py, radius, rays) {
  const pts = new Float32Array(rays * 2);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let d = 0;
    while (d < radius) {
      d += 6;
      if (OPAQUE[tileAtPx(px + dx * d, py + dy * d)]) {
        d += 12; // ilumina la cara del obstáculo
        break;
      }
    }
    pts[i * 2] = px + dx * Math.min(d, radius);
    pts[i * 2 + 1] = py + dy * Math.min(d, radius);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Dibujo estático del mapa (una vez por partida)
// ---------------------------------------------------------------------------
function renderMapCanvas() {
  mapCanvas = document.createElement("canvas");
  mapCanvas.width = MW * TILE;
  mapCanvas.height = MH * TILE;
  const m = mapCanvas.getContext("2d");
  const r = mulberry32(1234);

  const base = {
    [T.GRASS]: ["#1d2b1d", "#1a281b", "#202f1f"],
    [T.WATER]: ["#0b2131", "#0c2335"],
    [T.BRIDGE]: ["#4a3420"],
    [T.WALL]: ["#2d2724"],
    [T.PATH]: ["#3a3427", "#373124"],
    [T.CHURCH]: ["#3c3936"],
    [T.FLOOR]: ["#2b2119", "#2e231a"],
    [T.CRYPT]: ["#3a3a3c"],
  };
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const t = tileAt(x, y);
      const cols = base[t] || (t === T.WARDROBE || t === T.CRADLE ? base[T.FLOOR] : base[T.GRASS]);
      m.fillStyle = cols[Math.floor(r() * cols.length)];
      const px = x * TILE;
      const py = y * TILE;
      m.fillRect(px, py, TILE, TILE);
      if (cols === base[T.GRASS]) {
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
      } else if (t === T.WALL || t === T.CRYPT) {
        m.fillStyle = t === T.CRYPT ? "#4a4a4d" : "#3a332e";
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) m.fillRect(px + j * 16 + (i % 2) * 8 + 1, py + i * 8 + 1, 14, 6);
        if (t === T.WALL && r() < 0.3) {
          m.fillStyle = "rgba(20,40,20,0.5)"; // musgo
          m.fillRect(px + r() * 20, py + r() * 20, 10, 8);
        }
      } else if (t === T.FLOOR || t === T.WARDROBE || t === T.CRADLE) {
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
  m.fillStyle = "#3a3633";
  m.fillRect(cx + cw / 2 - 22, cy - 26, 44, 40);
  m.fillStyle = "#8a7a50";
  m.fillRect(cx + cw / 2 - 3, cy - 40, 6, 26);
  m.fillRect(cx + cw / 2 - 11, cy - 33, 22, 6);
  m.fillStyle = "#1c120a";
  m.fillRect(cx + cw / 2 - 16, cy + ch - 24, 32, 24);
  m.fillStyle = "#6b4a28";
  m.fillRect(cx + cw / 2 - 14, cy + ch - 22, 13, 22);
  m.fillRect(cx + cw / 2 + 1, cy + ch - 22, 13, 22);

  // Cripta: techo de piedra con cruz y puerta negra
  const cr = POI.crypt;
  m.fillStyle = "#2c2c2f";
  m.fillRect(cr.x * TILE + 4, cr.y * TILE + 4, cr.w * TILE - 8, 20);
  m.fillStyle = "#77736a";
  m.fillRect(cr.x * TILE + (cr.w * TILE) / 2 - 2, cr.y * TILE - 14, 4, 22);
  m.fillRect(cr.x * TILE + (cr.w * TILE) / 2 - 8, cr.y * TILE - 8, 16, 4);

  // Lancha junto al muelle
  const d = POI.dock;
  m.save();
  m.translate(d.x + 52, d.y - 6);
  m.rotate(0.25);
  m.fillStyle = "#3b2a1a";
  m.beginPath();
  m.ellipse(0, 0, 9, 24, 0, 0, Math.PI * 2);
  m.fill();
  m.fillStyle = "#1c130b";
  m.beginPath();
  m.ellipse(0, 0, 6, 20, 0, 0, Math.PI * 2);
  m.fill();
  m.fillStyle = "#4a3420";
  m.fillRect(-6, -6, 12, 3);
  m.fillRect(-6, 8, 12, 3);
  m.restore();

  // Escombros en la hacienda
  const hz = POI.hacienda;
  for (let i = 0; i < 26; i++) {
    m.fillStyle = r() < 0.5 ? "#3a332e" : "#24201c";
    m.fillRect((hz.x0 - 1 + r() * (hz.w + 2)) * TILE, (hz.y0 - 1 + r() * (hz.h + 2)) * TILE, 3 + r() * 6, 3 + r() * 5);
  }
  m.strokeStyle = "rgba(20,14,10,0.9)"; // vigas caídas del techo
  m.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    m.beginPath();
    m.moveTo((hz.x0 + 1 + r() * 3) * TILE, (hz.y0 + 1 + r() * 2) * TILE);
    m.lineTo((hz.x0 + 6 + r() * 4) * TILE, (hz.y0 + 3 + r() * 3) * TILE);
    m.stroke();
  }

  // Postes de los tendederos
  for (const cl of POI.clotheslines) {
    m.fillStyle = "#3a2a1a";
    m.fillRect(cl.x1 - 2, cl.y - 18, 4, 22);
    m.fillRect(cl.x2 - 2, cl.y - 18, 4, 22);
  }

  // Objetos que sobresalen
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
      } else if (t === T.WELL) {
        m.fillStyle = "rgba(0,0,0,0.4)";
        m.beginPath();
        m.arc(px + 3, py + 4, 15, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#56544e";
        m.beginPath();
        m.arc(px, py, 14, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#020202";
        m.beginPath();
        m.arc(px, py, 9, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#3a2a1a";
        m.fillRect(px - 16, py - 3, 4, 8);
        m.fillRect(px + 12, py - 3, 4, 8);
        m.fillRect(px - 16, py - 2, 32, 3);
      } else if (t === T.ALTAR) {
        m.fillStyle = "rgba(0,0,0,0.4)";
        m.fillRect(px - 14, py - 8, 30, 22);
        m.fillStyle = "#4a3020";
        m.fillRect(px - 15, py - 10, 30, 20);
        m.fillStyle = "#d9d2c0";
        m.fillRect(px - 15, py - 10, 30, 6);
        for (let i = 0; i < 18; i++) {
          m.fillStyle = r() < 0.6 ? "#e08a1e" : "#c9561a"; // pétalos de cempasúchil
          m.fillRect(px - 18 + r() * 36, py - 14 + r() * 30, 2, 2);
        }
        m.fillStyle = "#e8e2d4"; // calaverita
        m.beginPath();
        m.arc(px, py + 2, 4, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#111";
        m.fillRect(px - 2, py + 1, 1, 1);
        m.fillRect(px + 1, py + 1, 1, 1);
        m.fillStyle = "#2a2a2a"; // portarretratos
        m.fillRect(px - 12, py - 2, 6, 7);
        m.fillRect(px + 6, py - 2, 6, 7);
      } else if (t === T.LAMP) {
        m.fillStyle = "rgba(0,0,0,0.4)";
        m.beginPath();
        m.arc(px + 2, py + 3, 5, 0, Math.PI * 2);
        m.fill();
        m.fillStyle = "#2b2b2b";
        m.beginPath();
        m.arc(px, py, 4, 0, Math.PI * 2);
        m.fill();
      } else if (t === T.WARDROBE) {
        m.fillStyle = "rgba(0,0,0,0.45)";
        m.fillRect(px - 12, py - 10, 28, 26);
        m.fillStyle = "#4a2e1a";
        m.fillRect(px - 13, py - 13, 26, 26);
        m.fillStyle = "#2a1a0e";
        m.fillRect(px - 1, py - 12, 2, 24);
        m.fillStyle = "#8a6a3a";
        m.fillRect(px - 4, py - 1, 2, 3);
        m.fillRect(px + 2, py - 1, 2, 3);
      }
    }
  // Árboles (copa) y árboles secos (ramas)
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const t = tileAt(x, y);
      if (t === T.TREE) {
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
      } else if (t === T.DEADTREE) {
        const px = x * TILE + TILE / 2;
        const py = y * TILE + TILE / 2;
        m.strokeStyle = "#2a2118";
        m.lineCap = "round";
        const branch = (bx, by, a, len, w) => {
          if (len < 4) return;
          const ex = bx + Math.cos(a) * len;
          const ey = by + Math.sin(a) * len;
          m.lineWidth = w;
          m.beginPath();
          m.moveTo(bx, by);
          m.lineTo(ex, ey);
          m.stroke();
          branch(ex, ey, a - 0.5 - r() * 0.3, len * 0.66, w * 0.65);
          branch(ex, ey, a + 0.4 + r() * 0.3, len * 0.6, w * 0.65);
        };
        m.fillStyle = "#2a2118";
        m.beginPath();
        m.arc(px, py, 5, 0, Math.PI * 2);
        m.fill();
        for (let k = 0; k < 4; k++) branch(px, py, (k / 4) * Math.PI * 2 + r(), 12 + r() * 6, 3.5);
      }
    }
}
