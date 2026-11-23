// main.ts — news-image-20261122, version 2 (built fresh in this session).
// Draws "THE WORLD IN ONE DAY — Sunday 22 November 2026" as one 1024x1024 PNG.
// Variant A (NI_VARIANT=A, default): one planet, seven scenes around it, story rows below.
// Variant B (NI_VARIANT=B): editorial front page, unequal panels, 24h timeline strip.
// Node 22 stdlib only (node:fs, node:zlib). No network, no randomness, no Date:
// two runs write byte-identical files. All drawing is code: polygons, discs,
// arcs, and a hand-designed 5x7 bitmap font (9-row cell with descenders).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ---------- PNG encoding (deterministic) ----------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePng(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 6 });
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------- Canvas: supersampled RGB buffer, logical 1024x1024 coords ----------
type RGB = [number, number, number];
type Pt = [number, number];
const SS = 2; // supersample factor; downsampled with a 2x2 box filter
const W = 1024;
const H = 1024;

class Canvas {
  buf: Uint8Array;
  constructor() {
    this.buf = new Uint8Array(W * SS * H * SS * 3);
  }
  fill(c: RGB): void {
    for (let i = 0; i < this.buf.length; i += 3) {
      this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
    }
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const ax = Math.max(0, Math.round(x0 * SS));
    const bx = Math.min(W * SS, Math.round(x1 * SS));
    const ay = Math.max(0, Math.round(y0 * SS));
    const by = Math.min(H * SS, Math.round(y1 * SS));
    for (let y = ay; y < by; y++) {
      let i = (y * W * SS + ax) * 3;
      for (let x = ax; x < bx; x++, i += 3) {
        this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor((cx - r) * SS));
    const x1 = Math.min(W * SS, Math.ceil((cx + r) * SS));
    const y0 = Math.max(0, Math.floor((cy - r) * SS));
    const y1 = Math.min(H * SS, Math.ceil((cy + r) * SS));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = (x + 0.5) / SS - cx;
        const dy = (y + 0.5) / SS - cy;
        if (dx * dx + dy * dy <= r * r) {
          const i = (y * W * SS + x) * 3;
          this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
        }
      }
    }
  }
  ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
    const lo = r - w / 2;
    const hi = r + w / 2;
    const x0 = Math.max(0, Math.floor((cx - hi) * SS));
    const x1 = Math.min(W * SS, Math.ceil((cx + hi) * SS));
    const y0 = Math.max(0, Math.floor((cy - hi) * SS));
    const y1 = Math.min(H * SS, Math.ceil((cy + hi) * SS));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = (x + 0.5) / SS - cx;
        const dy = (y + 0.5) / SS - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= lo && d <= hi) {
          const i = (y * W * SS + x) * 3;
          this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
        }
      }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const x0 = Math.max(0, Math.floor((cx - rx) * SS));
    const x1 = Math.min(W * SS, Math.ceil((cx + rx) * SS));
    const y0 = Math.max(0, Math.floor((cy - ry) * SS));
    const y1 = Math.min(H * SS, Math.ceil((cy + ry) * SS));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const dx = ((x + 0.5) / SS - cx) / rx;
        const dy = ((y + 0.5) / SS - cy) / ry;
        if (dx * dx + dy * dy <= 1) {
          const i = (y * W * SS + x) * 3;
          this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
        }
      }
    }
  }
  ellipseRing(cx: number, cy: number, rx: number, ry: number, w: number, c: RGB): void {
    const steps = 720;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      this.disc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, w / 2, c);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil((len * SS) / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, w / 2, c);
    }
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number, c: RGB): void {
    const span = a1 - a0;
    const steps = Math.max(8, Math.ceil((Math.abs(span) * r * SS) / 2));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (span * i) / steps;
      this.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w / 2, c);
    }
  }
  // Scanline polygon fill, logical coordinates.
  poly(pts: Pt[], c: RGB): void {
    if (pts.length < 3) return;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const y0 = Math.max(0, Math.floor(minY * SS));
    const y1 = Math.min(H * SS, Math.ceil(maxY * SS));
    for (let sy = y0; sy < y1; sy++) {
      const y = (sy + 0.5) / SS;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1p] = pts[i];
        const [x2, y2p] = pts[(i + 1) % pts.length];
        if ((y1p <= y && y2p > y) || (y2p <= y && y1p > y)) {
          xs.push(x1 + ((y - y1p) * (x2 - x1)) / (y2p - y1p));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ax = Math.max(0, Math.round(xs[k] * SS));
        const bx = Math.min(W * SS, Math.round(xs[k + 1] * SS));
        for (let x = ax; x < bx; x++) {
          const i = (sy * W * SS + x) * 3;
          this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
        }
      }
    }
  }
  // Polygon rotated by angle (radians) around (cx, cy): rotate each point's
  // offset from the centre, not its absolute coordinates.
  polyRot(pts: Pt[], cx: number, cy: number, ang: number, c: RGB): void {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    this.poly(
      pts.map(([x, y]): Pt => [
        cx + (x - cx) * ca - (y - cy) * sa,
        cy + (x - cx) * sa + (y - cy) * ca,
      ]),
      c,
    );
  }
  down(): Uint8Array {
    const out = new Uint8Array(W * H * 3);
    const n = SS * SS;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = 0; dy < SS; dy++) {
          for (let dx = 0; dx < SS; dx++) {
            const i = ((y * SS + dy) * W * SS + (x * SS + dx)) * 3;
            r += this.buf[i]; g += this.buf[i + 1]; b += this.buf[i + 2];
          }
        }
        const o = (y * W + x) * 3;
        out[o] = Math.round(r / n);
        out[o + 1] = Math.round(g / n);
        out[o + 2] = Math.round(b / n);
      }
    }
    return out;
  }
}

// ---------- Hand-designed 5x7 bitmap font ----------
// Each glyph is rows of 5 cells ("#" ink, "." empty), joined by "/".
// The cell is 9 rows tall: rows 0-6 cap height, rows 7-8 descenders.
// Capitals/digits occupy rows 0-6; lowercase x-height sits on rows 2-6.
// Lowercase "g" is drawn with its loop low and a left-curving tail, clearly
// different from digit "9", whose loop sits at the top with a straight stem.
const GLYPHS: Record<string, string> = {
  A: "01110/10001/10001/11111/10001/10001/10001",
  B: "11110/10001/10001/11110/10001/10001/11110",
  C: "01110/10001/10000/10000/10000/10001/01110",
  D: "11110/10001/10001/10001/10001/10001/11110",
  E: "11111/10000/10000/11110/10000/10000/11111",
  F: "11111/10000/10000/11110/10000/10000/10000",
  G: "01110/10001/10000/10111/10001/10001/01111",
  H: "10001/10001/10001/11111/10001/10001/10001",
  I: "01110/00100/00100/00100/00100/00100/01110",
  J: "00111/00010/00010/00010/00010/10010/01100",
  K: "10001/10010/10100/11000/10100/10010/10001",
  L: "10000/10000/10000/10000/10000/10000/11111",
  M: "10001/11011/10101/10101/10001/10001/10001",
  N: "10001/11001/10101/10011/10001/10001/10001",
  O: "01110/10001/10001/10001/10001/10001/01110",
  P: "11110/10001/10001/11110/10000/10000/10000",
  Q: "01110/10001/10001/10001/10101/10010/01101",
  R: "11110/10001/10001/11110/10100/10010/10001",
  S: "01111/10000/10000/01110/00001/00001/11110",
  T: "11111/00100/00100/00100/00100/00100/00100",
  U: "10001/10001/10001/10001/10001/10001/01110",
  V: "10001/10001/10001/10001/10001/01010/00100",
  W: "10001/10001/10001/10101/10101/11011/10001",
  X: "10001/10001/01010/00100/01010/10001/10001",
  Y: "10001/10001/01010/00100/00100/00100/00100",
  Z: "11111/00001/00010/00100/01000/10000/11111",
  a: "...../...../01110/00001/01111/10001/01111",
  b: "10000/10000/11110/10001/10001/10001/11110",
  c: "...../...../01110/10001/10000/10001/01110",
  d: "00001/00001/01111/10001/10001/10001/01111",
  e: "...../...../01110/10001/11111/10000/01110",
  f: "00110/01000/01000/11110/01000/01000/01000",
  g: "...../...../01110/10001/10001/01111/00001/00001/01110",
  h: "10000/10000/11110/10001/10001/10001/10001",
  i: "00100/...../01100/00100/00100/00100/01110",
  j: "00010/...../00110/00010/00010/00010/10010/10010/01100",
  k: "10000/10000/10010/10100/11000/10100/10010",
  l: "01100/00100/00100/00100/00100/00100/01110",
  m: "...../...../11010/10101/10101/10101/10101",
  n: "...../...../11110/10001/10001/10001/10001",
  o: "...../...../01110/10001/10001/10001/01110",
  p: "...../...../11110/10001/10001/11110/10000/10000/10000",
  q: "...../...../01111/10001/10001/01111/00001/00001/00001",
  r: "...../...../10110/11001/10000/10000/10000",
  s: "...../...../01111/10000/01110/00001/11110",
  t: "00100/00100/11110/00100/00100/00100/00110",
  u: "...../...../10001/10001/10001/10011/01111",
  v: "...../...../10001/10001/10001/01010/00100",
  w: "...../...../10001/10101/10101/10101/01010",
  x: "...../...../10001/01010/00100/01010/10001",
  y: "...../...../10001/10001/01010/00100/00100/00100/01100",
  z: "...../...../11111/00010/00100/01000/11111",
};

// Digits and punctuation (same 9-row cell; "0" is "1" in the table strings).
Object.assign(GLYPHS, {
  "0": "01110/10001/10011/10101/11001/10001/01110",
  "1": "00100/01100/00100/00100/00100/00100/01110",
  "2": "01110/10001/00001/00110/01000/10000/11111",
  "3": "11110/00001/00001/01110/00001/00001/11110",
  "4": "00010/00110/01010/10010/11111/00010/00010",
  "5": "11111/10000/11110/00001/00001/10001/01110",
  "6": "00110/01000/10000/11110/10001/10001/01110",
  "7": "11111/00001/00010/00100/01000/01000/01000",
  "8": "01110/10001/10001/01110/10001/10001/01110",
  "9": "01110/10001/10001/01111/00001/00001/01110",
  " ": "...../...../...../...../...../...../.....",
  ".": "...../...../...../...../...../...../01100",
  ",": "...../...../...../...../...../...../01100/01100/01000",
  "'": "01100/01100/00100/...../...../...../.....",
  '"': "01010/01010/01010/...../...../...../.....",
  "–": "...../...../...../01110/...../...../.....",
  "—": "...../...../...../11111/...../...../.....",
  "-": "...../...../...../01110/...../...../.....",
  ":": "...../...../01100/...../...../01100/.....",
  ";": "...../...../01100/...../...../01100/01100/01100/01000",
  "(": "00010/00100/01000/01000/01000/00100/00010",
  ")": "01000/00100/00010/00010/00010/00100/01000",
  "!": "00100/00100/00100/00100/00100/...../01100",
  "?": "01110/10001/00001/00010/00100/...../01100",
  "/": "00001/00010/00010/00100/01000/01000/10000",
  "%": "11001/11010/00100/01000/10000/01011/10011",
  "&": "01110/10001/10001/01100/10101/10010/01101",
  "+": "...../00100/00100/11111/00100/00100/.....",
  "•": "...../...../...../01100/01100/...../.....",
});

function glyphRows(ch: string): string[] {
  const s = GLYPHS[ch];
  if (s === undefined) throw new Error("missing glyph for " + JSON.stringify(ch));
  const rows = s.split("/");
  while (rows.length < 9) rows.push(".....");
  return rows;
}

const ADV = 6; // glyph advance, in font units (5 cells + 1 gap)
function textWidth(s: string, scale: number): number {
  let w = 0;
  for (const _ch of s) w += ADV * scale;
  return w - scale; // no trailing gap after the last glyph
}
type Align = "l" | "c" | "r";
function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB, align: Align = "l"): void {
  const w = textWidth(s, scale);
  let cx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
  for (const ch of s) {
    if (ch !== " ") {
      const rows = glyphRows(ch);
      for (let r = 0; r < 9; r++) {
        for (let col = 0; col < 5; col++) {
          if (rows[r][col] === "1") {
            cv.rect(cx + col * scale, y + r * scale, cx + (col + 1) * scale, y + (r + 1) * scale, c);
          }
        }
      }
    }
    cx += ADV * scale;
  }
}
// Greedy word wrap; never splits a word in two.
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, scale) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- Palette: 6 chromatic colours + neutrals ----------
const PAPER: RGB = [246, 241, 227];
const INK: RGB = [22, 35, 63];
const RED: RGB = [193, 39, 45];
const TEAL: RGB = [31, 122, 109];
const GOLD: RGB = [217, 164, 65];
const SKY: RGB = [62, 124, 177];
const ORANGE: RGB = [224, 120, 64];
const WHITE: RGB = [255, 255, 255];
const MUT: RGB = [90, 100, 114];
const HAIR: RGB = [216, 210, 192];
const CARD: RGB = [255, 252, 244];

// ---------- The seven stories: exact text from the brief ----------
interface Story {
  n: number;
  region: string;
  headline: string;
  support: string;
  source: string;
  color: RGB;
}
const STORIES: Story[] = [
  { n: 1, region: "ANTALYA", headline: "COP31 talks collapse in Antalya", support: "UN climate summit ends with no deal; draft dropped any mention of fossil fuels", source: "Reuters, CNN", color: RED },
  { n: 2, region: "BENGHAZI", headline: "Sea drones hit Russian warship", support: "Corvette Merkury capsizes at Benghazi; suspected Ukrainian strike, no deaths reported", source: "AP, Reuters", color: SKY },
  { n: 3, region: "DYMER", headline: "Drone destroys Dymer apartment block", support: "At least 14 missing, feared trapped under rubble near Kyiv", source: "Reuters, AP", color: ORANGE },
  { n: 4, region: "WEST BANK", headline: "Settlers torch West Bank vehicles", support: "About a dozen Palestinian vehicles burned; Eisenkot calls it 'Jewish terrorism'", source: "Reuters, CNN", color: GOLD },
  { n: 5, region: "SEOUL", headline: "Korean minister resigns over exam chaos", support: "Education minister quits after AI anti-cheating confusion around the CSAT exam", source: "Seoul Economic Daily, Korea JoongAng Daily", color: TEAL },
  { n: 6, region: "KHARTOUM", headline: "Drones hit Khartoum, UN building damaged", support: "Strikes on residential areas early Sunday; four reported killed", source: "UN ReliefWeb, Al Jazeera", color: INK },
  { n: 7, region: "ANFIELD", headline: "Liverpool thrash Man United 4–0", support: "Pochettino's first match as Man Utd manager ends in heavy Anfield defeat", source: "Reuters, NBC Sports", color: RED },
];
const TITLE = "THE WORLD IN ONE DAY";
const DATE_LINE = "Sunday 22 November 2026";

// ---------- Small helpers ----------
function numChip(cv: Canvas, cx: number, cy: number, r: number, n: number, fill: RGB): void {
  cv.disc(cx, cy, r, fill);
  cv.ring(cx, cy, r, 1.5, WHITE);
  drawText(cv, String(n), cx, cy - 5.5, 1.6, WHITE, "c");
}
function header(cv: Canvas, titleScale: number, dateScale: number, ruleY: number): void {
  drawText(cv, TITLE, W / 2, 16, titleScale, INK, "c");
  drawText(cv, DATE_LINE, W / 2, 16 + 7 * titleScale + 8, dateScale, RED, "c");
  cv.rect(150, ruleY, W - 150, ruleY + 2, INK);
  cv.disc(W / 2, ruleY + 1, 4, RED);
}

// ---------- The seven mini illustrations ----------
// Each scene draws inside a 100x100 local box centred on (cx, cy),
// scaled by s (box edge in logical pixels). Flat, symbolic, no people.
function drawScene(cv: Canvas, idx: number, cx: number, cy: number, s: number, showScore: boolean): void {
  const X = (u: number) => cx + (u * s) / 100;
  const Y = (v: number) => cy + (v * s) / 100;
  const R = (x0: number, y0: number, x1: number, y1: number, c: RGB) => cv.rect(X(x0), Y(y0), X(x1), Y(y1), c);
  const D = (x: number, y: number, r: number, c: RGB) => cv.disc(X(x), Y(y), (r * s) / 100, c);
  const P = (pts: Pt[], c: RGB) => cv.poly(pts.map(([x, y]): Pt => [X(x), Y(y)]), c);
  const PR = (pts: Pt[], ang: number, c: RGB) =>
    cv.polyRot(pts.map(([x, y]): Pt => [X(x), Y(y)]), X(0), Y(0), ang, c);
  const L = (x0: number, y0: number, x1: number, y1: number, w: number, c: RGB) =>
    cv.line(X(x0), Y(y0), X(x1), Y(y1), (w * s) / 100, c);
  const ring = (x: number, y: number, r: number, w: number, c: RGB) =>
    cv.ring(X(x), Y(y), (r * s) / 100, (w * s) / 100, c);

  if (idx === 0) {
    // COP31: empty chairs behind a summit table, small globe, red X = no deal.
    R(-34, -30, -22, -6, TEAL); R(-34, -8, -22, -2, TEAL);
    R(-6, -30, 6, -6, TEAL); R(-6, -8, 6, -2, TEAL);
    R(22, -30, 34, -6, TEAL); R(22, -8, 34, -2, TEAL);
    P([[-44, 4], [-36, -10], [36, -10], [44, 4]], INK);
    R(-38, 4, -34, 28, INK); R(34, 4, 38, 28, INK);
    D(0, -20, 11, SKY); ring(0, -20, 11, 1.5, WHITE);
    P([[-6, -24], [-2, -28], [4, -24], [2, -16], [-4, -16]], GOLD);
    L(26, -42, 42, -26, 5, RED); L(42, -42, 26, -26, 5, RED);
  } else if (idx === 1) {
    // Benghazi: corvette heeled over at sea, drones above.
    const heel = -0.35;
    PR([[-42, 8], [-34, 24], [30, 24], [42, 6]], heel, INK);
    PR([[-2, -24], [2, -24], [2, 8], [-2, 8]], heel, INK);
    PR([[10, -12], [20, -12], [20, 4], [10, 4]], heel, RED);
    PR([[-30, -24], [30, -24], [30, -20], [-30, -20]], heel, WHITE);
    D(-28, -36, 3, INK); D(-16, -40, 3, INK);
    L(-28, -36, -16, -40, 1.5, INK);
    L(-32, -38, -24, -38, 1.5, INK); L(-20, -42, -12, -42, 1.5, INK);
    cv.arc(X(-24), Y(32), (13 * s) / 100, Math.PI, Math.PI * 2, 2.5, SKY);
    cv.arc(X(2), Y(38), (13 * s) / 100, Math.PI, Math.PI * 2, 2.5, SKY);
    cv.arc(X(26), Y(32), (13 * s) / 100, Math.PI, Math.PI * 2, 2.5, SKY);
  } else if (idx === 2) {
    // Dymer: five-storey block, top-right corner collapsed, rubble, drone above.
    R(-34, -42, 34, 32, INK);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        R(-28 + col * 18, -36 + row * 14, -18 + col * 18, -28 + row * 14, WHITE);
      }
    }
    P([[12, -42], [34, -42], [34, -2], [22, -2], [18, -18], [12, -18]], PAPER);
    P([[-2, 32], [10, 32], [4, 20]], MUT);
    P([[12, 32], [24, 32], [18, 22]], HAIR);
    P([[24, 32], [34, 32], [30, 24]], MUT);
    D(-24, -44, 4, RED);
    L(-32, -47, -16, -47, 2, INK);
  } else if (idx === 3) {
    // West Bank: car on a hill road, small flame above the hood.
    cv.ellipse(X(-12), Y(28), (46 * s) / 100, (18 * s) / 100, GOLD);
    cv.ellipse(X(22), Y(30), (38 * s) / 100, (15 * s) / 100, TEAL);
    P([[-40, 18], [-38, 2], [-20, -4], [12, -4], [26, 6], [40, 8], [40, 18]], RED);
    P([[-18, -1], [8, -1], [14, 4], [-20, 4]], WHITE);
    D(-22, 18, 7, INK); D(22, 18, 7, INK);
    D(-22, 18, 3, WHITE); D(22, 18, 3, WHITE);
    P([[28, -32], [38, -12], [33, -2], [24, -2], [20, -12]], ORANGE);
    P([[28, -24], [33, -12], [30, -4], [26, -4], [24, -12]], RED);
    L(-46, 27, 46, 27, 2, INK);
  } else if (idx === 4) {
    // Korea: exam paper, pencil, resignation envelope with a red seal.
    // Paper and envelope use a tinted fill so they read on the white medal.
    const TINT: RGB = [233, 229, 214];
    PR([[-30, -26], [24, -30], [30, 24], [-24, 28]], -0.14, INK);
    PR([[-28, -24], [22, -28], [28, 22], [-22, 26]], -0.14, TINT);
    PR([[-22, -16], [16, -16], [16, -12], [-22, -12]], -0.14, INK);
    PR([[-22, -4], [16, -4], [16, 0], [-22, 0]], -0.14, INK);
    PR([[-22, 8], [8, 8], [8, 12], [-22, 12]], -0.14, RED);
    L(-38, 32, 28, -34, 7, GOLD);
    P([[28, -34], [40, -42], [34, -28]], INK);
    D(-38, 32, 4, RED);
    R(10, 14, 40, 34, INK);
    R(12, 16, 38, 32, TINT);
    L(12, 16, 25, 25, 1.5, INK); L(38, 16, 25, 25, 1.5, INK);
    D(25, 25, 4, RED);
  } else if (idx === 5) {
    // Khartoum: skyline, one tower carrying a UN-blue emblem, thin smoke.
    R(-44, -2, -26, 34, INK);
    R(-22, -24, -2, 34, INK);
    R(2, -12, 20, 34, INK);
    R(24, 2, 44, 34, TEAL);
    R(-40, 4, -32, 12, PAPER); R(-40, 18, -32, 26, PAPER);
    R(-18, -18, -10, -10, PAPER); R(-18, -4, -10, 4, PAPER); R(-18, 10, -10, 18, PAPER);
    R(6, -6, 14, 2, PAPER); R(6, 8, 14, 16, PAPER);
    D(-12, -32, 9, SKY); ring(-12, -32, 9, 1.5, WHITE); D(-12, -32, 2.5, WHITE);
    D(12, -20, 5, MUT); D(18, -30, 6, HAIR); D(25, -40, 7, MUT);
    L(-46, 34, 46, 34, 2, INK);
  } else {
    // Anfield: goal frame, net, ball — and the 4–0 scoreline.
    R(-32, -26, 32, -20, INK); R(-32, -22, -24, 22, INK); R(24, -22, 32, 22, INK);
    R(-30, -24, 30, -20, WHITE); R(-30, -20, -26, 22, WHITE); R(26, -20, 30, 22, WHITE);
    for (const gx of [-18, -6, 6, 18]) L(gx, -20, gx, 22, 1, HAIR);
    for (const gy of [-10, 0, 10]) L(-24, gy, 24, gy, 1, HAIR);
    D(0, 32, 9, WHITE); ring(0, 32, 9, 1.5, INK);
    D(-3, 30, 2, INK); D(3, 34, 2, INK);
    if (showScore) drawText(cv, "4–0", cx, cy - (46 * s) / 100, (2.3 * s) / 100, RED, "c");
  }
}

// ---------- Globe ----------
function drawGlobe(cv: Canvas, cx: number, cy: number, r: number): void {
  cv.disc(cx, cy, r, SKY);
  const land = (pts: Pt[]) =>
    cv.poly(pts.map(([u, v]): Pt => [cx + u * r, cy + v * r]), GOLD);
  land([[-0.78, -0.3], [-0.6, -0.55], [-0.38, -0.42], [-0.42, -0.12], [-0.58, 0.12], [-0.72, 0.38], [-0.82, 0.08]]);
  land([[-0.08, -0.62], [0.22, -0.58], [0.3, -0.22], [0.14, 0.08], [0.04, 0.48], [-0.16, 0.3], [-0.22, -0.12]]);
  land([[0.36, -0.52], [0.72, -0.46], [0.76, -0.1], [0.56, 0.16], [0.4, -0.06]]);
  cv.ellipse(cx + 0.55 * r, cy + 0.52 * r, 0.14 * r, 0.09 * r, GOLD);
  cv.line(cx - r, cy, cx + r, cy, 1.5, WHITE);
  cv.ellipseRing(cx, cy, r * 0.55, r, 1.5, WHITE);
  cv.ellipseRing(cx, cy, r * 0.22, r, 1.5, WHITE);
  cv.ellipseRing(cx, cy, r, r * 0.35, 1.5, WHITE);
  cv.ring(cx, cy, r, 3, WHITE);
  cv.ring(cx, cy, r + 3, 1.5, INK);
}

// ---------- Concept A: one planet, seven scenes ----------
function layoutA(cv: Canvas): void {
  cv.fill(PAPER);
  cv.rect(0, 0, W, 4, INK); cv.rect(0, H - 4, W, H, INK);
  cv.rect(0, 0, 4, H, INK); cv.rect(W - 4, 0, W, H, INK);
  header(cv, 5.0, 2.4, 92);
  const gx = 512, gy = 295, gr = 100;
  drawGlobe(cv, gx, gy, gr);
  const angles = [245, 295, 345, 35, 85, 135, 185];
  const mr = 165, medalR = 42;
  const medalPos: Pt[] = angles.map((a) => {
    const t = (a * Math.PI) / 180;
    return [gx + mr * Math.cos(t), gy + mr * Math.sin(t)];
  });
  medalPos.forEach(([mx, my], i) => {
    const st = STORIES[i];
    const t = Math.atan2(my - gy, mx - gx);
    const x1 = gx + (gr - 2) * Math.cos(t);
    const y1 = gy + (gr - 2) * Math.sin(t);
    const x0 = mx - (medalR + 2) * Math.cos(t);
    const y0 = my - (medalR + 2) * Math.sin(t);
    cv.line(x0, y0, x1, y1, 2.5, st.color);
    cv.disc(x1, y1, 3.5, st.color);
  });
  medalPos.forEach(([mx, my], i) => {
    const st = STORIES[i];
    cv.disc(mx, my, medalR, CARD);
    cv.ring(mx, my, medalR, 4, st.color);
    drawScene(cv, i, mx, my + 2, medalR * 1.7, i === 6);
    numChip(cv, mx + medalR * 0.72, my - medalR * 0.72, 12, st.n, st.color);
  });
  // Legend rows: headline, then support with the source appended (" — Reuters, CNN")
  // and re-inked in red on the last line. Smallest text is 14 px cap height.
  let y = 518;
  const xNum = 30, xTxt = 66, xRight = W - 18;
  for (const st of STORIES) {
    const headScale = 2.4;
    const supScale = 2.0;
    const full = st.support + " — " + st.source;
    const supLines = wrapText(full, xRight - xTxt, supScale);
    const headH = 7 * headScale;
    const rowH = 6 + headH + 4 + supLines.length * 10 * supScale + 6;
    numChip(cv, xNum, y + 6 + headH / 2, 13, st.n, st.color);
    drawText(cv, st.headline, xTxt, y + 6, headScale, INK);
    supLines.forEach((ln, k) => {
      const yLine = y + 6 + headH + 4 + k * 10 * supScale;
      drawText(cv, ln, xTxt, yLine, supScale, MUT);
      if (k === supLines.length - 1) {
        const sep = ln.lastIndexOf(" — ");
        if (sep >= 0) {
          const prefix = ln.slice(0, sep + 3);
          drawText(cv, ln.slice(sep + 3), xTxt + prefix.length * ADV * supScale, yLine, supScale, RED);
        }
      }
    });
    if (st.n < 7) cv.rect(18, y + rowH - 1, W - 18, y + rowH, HAIR);
    y += rowH;
  }
}

// ---------- Concept B: editorial front page ----------
function kickerRow(cv: Canvas, x: number, y: number, w: number, st: Story, sourceOnKicker: boolean): void {
  cv.disc(x + 11, y + 11, 10, st.color);
  cv.ring(x + 11, y + 11, 10, 1.5, WHITE);
  drawText(cv, String(st.n), x + 11, y + 11 - 5.5, 1.6, WHITE, "c");
  drawText(cv, st.region, x + 26, y + 4, 2.0, st.color);
  if (sourceOnKicker) drawText(cv, st.source, x + w, y + 4, 2.0, MUT, "r");
}
function panelVertical(cv: Canvas, x: number, y: number, w: number, h: number, st: Story, headScale: number): void {
  cv.rect(x, y, x + w, y + h, CARD);
  cv.rect(x, y, x + w, y + 1.5, HAIR); cv.rect(x, y + h - 1.5, x + w, y + h, HAIR);
  cv.rect(x, y, x + 1.5, y + h, HAIR); cv.rect(x + w - 1.5, y, x + w, y + h, HAIR);
  cv.rect(x, y, x + w, y + 6, st.color);
  const pad = 12;
  const tw = w - 2 * pad;
  const headLines = wrapText(st.headline, tw, headScale);
  const supLines = wrapText(st.support, tw, 2.0);
  const srcLines = wrapText(st.source, tw, 2.0);
  const srcOnKicker = textWidth(st.source, 2.0) + textWidth(st.region, 2.0) + 44 <= tw;
  const kickerH = 22;
  const textH = kickerH + 4 + headLines.length * 10 * headScale + 4 + supLines.length * 20
    + (srcOnKicker ? 0 : 4 + srcLines.length * 20);
  const availH = h - 6 - 2 * pad;
  const illH = Math.max(30, availH - textH - 4);
  kickerRow(cv, x + pad, y + 6 + pad, tw, st, srcOnKicker);
  const illY = y + 6 + pad + kickerH + 4;
  drawScene(cv, st.n - 1, x + w / 2, illY + illH / 2, Math.min(tw, illH) * 0.95, st.n === 7);
  let cy = illY + illH + 4;
  for (const ln of headLines) { drawText(cv, ln, x + pad, cy, headScale, INK); cy += 10 * headScale; }
  cy += 4;
  for (const ln of supLines) { drawText(cv, ln, x + pad, cy, 2.0, MUT); cy += 20; }
  if (!srcOnKicker) {
    cy += 4;
    for (const ln of srcLines) { drawText(cv, ln, x + pad, cy, 2.0, RED); cy += 20; }
  }
}
function panelWide(cv: Canvas, x: number, y: number, w: number, h: number, st: Story): void {
  cv.rect(x, y, x + w, y + h, CARD);
  cv.rect(x, y, x + w, y + 1.5, HAIR); cv.rect(x, y + h - 1.5, x + w, y + h, HAIR);
  cv.rect(x, y, x + 1.5, y + h, HAIR); cv.rect(x + w - 1.5, y, x + w, y + h, HAIR);
  cv.rect(x, y, x + w, y + 6, st.color);
  const pad = 12;
  const illW = 104;
  const tx = x + pad + illW + pad;
  const tw = w - illW - 3 * pad;
  const illH = h - 6 - 2 * pad;
  drawScene(cv, st.n - 1, x + pad + illW / 2, y + 6 + pad + illH / 2, Math.min(illW, illH) * 0.95, false);
  kickerRow(cv, tx, y + 6 + pad, tw, st, true);
  let cy = y + 6 + pad + 22 + 4;
  for (const ln of wrapText(st.headline, tw, 2.4)) { drawText(cv, ln, tx, cy, 2.4, INK); cy += 24; }
  cy += 4;
  for (const ln of wrapText(st.support, tw, 2.0)) { drawText(cv, ln, tx, cy, 2.0, MUT); cy += 20; }
}
function panelStrip(cv: Canvas, x: number, y: number, w: number, h: number, st: Story): void {
  cv.rect(x, y, x + w, y + h, CARD);
  cv.rect(x, y, x + w, y + 1.5, HAIR); cv.rect(x, y + h - 1.5, x + w, y + h, HAIR);
  cv.rect(x, y, x + 1.5, y + h, HAIR); cv.rect(x + w - 1.5, y, x + w, y + h, HAIR);
  cv.rect(x, y, x + w, y + 6, st.color);
  const pad = 12;
  const illW = 150;
  const scoreW = 200;
  const tx = x + pad + illW + pad;
  const tw = w - illW - scoreW - 4 * pad;
  const illH = h - 6 - 2 * pad;
  drawScene(cv, st.n - 1, x + pad + illW / 2, y + 6 + pad + illH / 2, Math.min(illW, illH) * 0.92, false);
  kickerRow(cv, tx, y + 6 + pad, tw, st, true);
  let cy = y + 6 + pad + 22 + 4;
  for (const ln of wrapText(st.headline, tw, 3.2)) { drawText(cv, ln, tx, cy, 3.2, INK); cy += 32; }
  cy += 4;
  for (const ln of wrapText(st.support, tw, 2.2)) { drawText(cv, ln, tx, cy, 2.2, MUT); cy += 22; }
  const sx = x + w - pad - scoreW / 2;
  drawText(cv, "4–0", sx, y + h / 2 - 28, 8.0, RED, "c");
  cv.rect(sx - 60, y + h / 2 + 34, sx + 60, y + h / 2 + 37, RED);
}
function layoutB(cv: Canvas): void {
  cv.fill(PAPER);
  cv.rect(0, 0, W, 4, INK); cv.rect(0, H - 4, W, H, INK);
  cv.rect(0, 0, 4, H, INK); cv.rect(W - 4, 0, W, H, INK);
  drawText(cv, TITLE, W / 2, 12, 6.0, INK, "c");
  drawText(cv, DATE_LINE, W / 2, 60, 2.6, RED, "c");
  cv.rect(150, 96, W - 150, 98, INK);
  cv.rect(150, 102, W - 150, 104, INK);
  // 24-hour timeline strip: seven numbered dots, one per story.
  const dotX = [60, 211, 361, 512, 663, 813, 964];
  cv.line(60, 140, 964, 140, 2, HAIR);
  dotX.forEach((dx, i) => {
    const st = STORIES[i];
    cv.disc(dx, 140, 10, st.color);
    cv.ring(dx, 140, 10, 1.5, WHITE);
    drawText(cv, String(st.n), dx, 140 - 5.5, 1.6, WHITE, "c");
    drawText(cv, st.region, dx, 154, 2.0, INK, "c");
  });
  // Grid: big COP31 panel, two wide panels, three small panels, Anfield strip.
  panelVertical(cv, 10, 170, 490, 350, STORIES[0], 2.8);
  panelWide(cv, 510, 170, 504, 170, STORIES[1]);
  panelWide(cv, 510, 350, 504, 170, STORIES[2]);
  panelVertical(cv, 10, 530, 330, 270, STORIES[3], 2.4);
  panelVertical(cv, 350, 530, 330, 270, STORIES[4], 2.4);
  panelVertical(cv, 690, 530, 324, 270, STORIES[5], 2.4);
  panelStrip(cv, 10, 810, 1004, 202, STORIES[6]);
}

// ---------- Entry point ----------
function main(): void {
  const variant = (process.env.NI_VARIANT || "A").toUpperCase();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
  mkdirSync(outDir, { recursive: true });
  const cv = new Canvas();
  if (variant === "B") layoutB(cv);
  else layoutA(cv);
  writeFileSync(outDir + "/entry.png", encodePng(W, H, cv.down()));
}
main();
