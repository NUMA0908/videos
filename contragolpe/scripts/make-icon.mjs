// Genera el ícono original de CONTRAGOLPE por código (sin arte de terceros ni dependencias):
// build/icon.png (1024), build/icon.ico (16–256) y build/icon.icns (128–1024).
// Diseño: cuadrado redondeado oscuro, anillo de energía cian y un rayo amarillo con contorno.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const N = 1024;
const SS = 3; // supermuestreo por eje (antialias)

const bolt = [
  [600, 120],
  [330, 560],
  [500, 560],
  [400, 910],
  [720, 430],
  [545, 430],
  [660, 120],
].map(([x, y]) => [x, y]);

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function polyDist(x, y, pts) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, distToSeg(x, y, pts[j], pts[i]));
  return d;
}

function roundRectInside(x, y, r) {
  const m = 40;
  const cx = Math.min(Math.max(x, m + r), N - m - r);
  const cy = Math.min(Math.max(y, m + r), N - m - r);
  return Math.hypot(x - cx, y - cy) <= r && x >= m && x <= N - m && y >= m && y <= N - m;
}

/** Color (RGBA 0..255) de un punto de la imagen. */
function shade(x, y) {
  if (!roundRectInside(x, y, 200)) return [0, 0, 0, 0];
  // Fondo: degradado diagonal violeta oscuro
  const t = (x + y) / (2 * N);
  let c = [16 + 30 * t, 14 + 6 * t, 40 + 50 * t, 255];
  // Rayas diagonales sutiles
  if (((x - y + 4000) % 140) < 46) c = [c[0] + 8, c[1] + 8, c[2] + 14, 255];
  // Anillo de energía
  const r = Math.hypot(x - 512, y - 520);
  if (r > 330 && r < 380) {
    const k = 1 - Math.abs(r - 355) / 25;
    c = [c[0] * (1 - k) + 70 * k, c[1] * (1 - k) + 200 * k, c[2] * (1 - k) + 255 * k, 255];
  }
  // Rayo con contorno negro
  const inside = inPoly(x, y, bolt);
  const d = polyDist(x, y, bolt);
  if (inside || d < 26) {
    if (inside && d >= 26) {
      const g = (y - 120) / 790;
      c = [255, 236 - 60 * g, 110 - 90 * g, 255];
    } else c = [8, 8, 16, 255];
  }
  return c;
}

const img = new Float64Array(N * N * 4);
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        const al = c[3] / 255;
        r += c[0] * al; g += c[1] * al; b += c[2] * al; a += al;
      }
    }
    const i = (y * N + x) * 4;
    const n = SS * SS;
    img[i] = a ? r / a : 0;
    img[i + 1] = a ? g / a : 0;
    img[i + 2] = a ? b / a : 0;
    img[i + 3] = (a / n) * 255;
  }
}

function resize(src, from, to) {
  const out = new Float64Array(to * to * 4);
  const k = from / to;
  for (let y = 0; y < to; y++) {
    for (let x = 0; x < to; x++) {
      const acc = [0, 0, 0, 0];
      let wsum = 0;
      for (let yy = Math.floor(y * k); yy < Math.floor((y + 1) * k); yy++) {
        for (let xx = Math.floor(x * k); xx < Math.floor((x + 1) * k); xx++) {
          const i = (yy * from + xx) * 4;
          const al = src[i + 3] / 255;
          acc[0] += src[i] * al; acc[1] += src[i + 1] * al; acc[2] += src[i + 2] * al; acc[3] += src[i + 3];
          wsum += al;
        }
      }
      const cnt = Math.floor(k) * Math.floor(k);
      const o = (y * to + x) * 4;
      out[o] = wsum ? acc[0] / wsum : 0;
      out[o + 1] = wsum ? acc[1] / wsum : 0;
      out[o + 2] = wsum ? acc[2] / wsum : 0;
      out[o + 3] = acc[3] / cnt;
    }
  }
  return out;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(pix, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size * 4; x++) raw[y * (size * 4 + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(pix[y * size * 4 + x])));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const sizes = {};
for (const s of [1024, 512, 256, 128, 64, 48, 32, 16]) sizes[s] = png(s === N ? img : resize(img, N, s), s);

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", sizes[1024]);
writeFileSync("build/icon-256.png", sizes[256]);

// ICO con imágenes PNG embebidas (Windows Vista+)
const icoSizes = [16, 32, 48, 64, 128, 256];
const header = Buffer.alloc(6 + 16 * icoSizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = header.length;
icoSizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header[e] = s === 256 ? 0 : s;
  header[e + 1] = s === 256 ? 0 : s;
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(sizes[s].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += sizes[s].length;
});
writeFileSync("build/icon.ico", Buffer.concat([header, ...icoSizes.map((s) => sizes[s])]));

// ICNS con PNG (ic07 128, ic08 256, ic09 512, ic10 1024)
const parts = [["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]].map(([t, s]) => {
  const h = Buffer.alloc(8);
  h.write(t, 0, "ascii");
  h.writeUInt32BE(sizes[s].length + 8, 4);
  return Buffer.concat([h, sizes[s]]);
});
const body = Buffer.concat(parts);
const icnsHead = Buffer.alloc(8);
icnsHead.write("icns", 0, "ascii");
icnsHead.writeUInt32BE(body.length + 8, 4);
writeFileSync("build/icon.icns", Buffer.concat([icnsHead, body]));
console.log("Íconos generados en build/: icon.png, icon-256.png, icon.ico, icon.icns");
