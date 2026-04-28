#!/usr/bin/env node
// Generates mobile/web/public/icons/{icon-192,icon-512,maskable-512}.png
// using only Node built-ins (no image deps). Run with `node generate-icons.mjs`.
//
// Design: dark navy rounded square background, accent-blue inner rounded
// square, white right-pointing chevron. Anti-aliased edges. The maskable
// variant has extra inner padding so iOS / Android can crop without clipping.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "public", "icons");
await mkdir(outDir, { recursive: true });

const VARIANTS = [
  { name: "icon-192.png", size: 192, padding: 0, transparentCorners: true },
  { name: "icon-512.png", size: 512, padding: 0, transparentCorners: true },
  // iOS apple-touch-icon: must be opaque, no transparent corners (iOS adds rounding).
  { name: "apple-touch-icon.png", size: 180, padding: 0, transparentCorners: false },
  // maskable: opaque, extra inner safe-zone for OS-side cropping.
  { name: "maskable-512.png", size: 512, padding: 64, transparentCorners: false },
];

for (const v of VARIANTS) {
  const png = renderIcon(v);
  await writeFile(resolve(outDir, v.name), png);
  // eslint-disable-next-line no-console
  console.log("wrote", v.name);
}

function renderIcon({ size, padding, transparentCorners }) {
  const W = size;
  const H = size;
  const buf = Buffer.alloc(W * H * 4);

  const NAVY = [0x0b, 0x0f, 0x17];
  const ACCENT = [0x6a, 0xa3, 0xff];
  const WHITE = [0xff, 0xff, 0xff];

  const innerSize = (size - 2 * padding) * 0.62;
  const cx = W / 2;
  const cy = H / 2;
  const outerR = (size - 2 * padding) * 0.22;
  const innerR = innerSize * 0.20;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;

      // Outer rounded square (alpha mask determines transparent corners or not).
      const ox = x - padding;
      const oy = y - padding;
      const sw = size - 2 * padding;
      const sh = size - 2 * padding;
      const outerCoverage = roundedRectCoverage(ox, oy, sw, sh, outerR);

      let r, g, b, a;
      if (transparentCorners) {
        r = NAVY[0]; g = NAVY[1]; b = NAVY[2];
        a = Math.round(0xff * outerCoverage);
      } else {
        // opaque: NAVY everywhere, then use outerCoverage to blend in inner art
        r = NAVY[0]; g = NAVY[1]; b = NAVY[2];
        a = 0xff;
      }

      // Inner accent rounded square.
      const innerLeft = cx - innerSize / 2;
      const innerTop = cy - innerSize / 2;
      const innerCov = roundedRectCoverage(x - innerLeft, y - innerTop, innerSize, innerSize, innerR);
      ({ r, g, b } = blendRGB({ r, g, b }, ACCENT, innerCov * outerCoverage));

      // White ">" chevron, centered inside the accent square.
      const chevCov = chevronCoverage(x, y, cx, cy, innerSize);
      ({ r, g, b } = blendRGB({ r, g, b }, WHITE, chevCov * innerCov * outerCoverage));

      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }

  return encodePng(buf, W, H);
}

// Coverage of a rounded-rect mask at integer pixel (px, py). Uses 4x supersampling
// near the boundary for smooth edges; interior pixels short-circuit to 1.
function roundedRectCoverage(px, py, w, h, r) {
  if (px < -1 || py < -1 || px > w || py > h) return 0;
  // Quick interior test: well inside the rect and away from corners.
  if (px >= 1 && py >= 1 && px <= w - 2 && py <= h - 2) {
    const dx = Math.max(0, r - px, px - (w - 1 - r));
    const dy = Math.max(0, r - py, py - (h - 1 - r));
    if (dx === 0 || dy === 0) return 1;
    const d2 = dx * dx + dy * dy;
    if (d2 <= (r - 1) * (r - 1)) return 1;
    if (d2 >= (r + 1) * (r + 1)) return 0;
  }
  // Supersample 4x.
  let acc = 0;
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const fx = px + (sx + 0.5) / 4;
      const fy = py + (sy + 0.5) / 4;
      if (fx < 0 || fy < 0 || fx >= w || fy >= h) continue;
      const dx = Math.max(0, r - fx, fx - (w - r));
      const dy = Math.max(0, r - fy, fy - (h - r));
      if (dx === 0 || dy === 0) {
        acc += 1;
        continue;
      }
      if (Math.hypot(dx, dy) <= r) acc += 1;
    }
  }
  return acc / 16;
}

function chevronCoverage(x, y, cx, cy, innerSize) {
  // Two stroked segments forming ">".
  const stroke = innerSize * 0.10;
  const half = innerSize * 0.22;
  const tip = { x: cx + innerSize * 0.10, y: cy };
  const top = { x: cx - innerSize * 0.16, y: cy - half };
  const bot = { x: cx - innerSize * 0.16, y: cy + half };
  const d = Math.min(distToSegment(x, y, top, tip), distToSegment(x, y, bot, tip));
  // 1px wide AA falloff.
  return clamp01(stroke / 2 + 0.5 - d);
}

function distToSegment(px, py, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = px - a.x;
  const apy = py - a.y;
  const ab2 = abx * abx + aby * aby || 1;
  const t = clamp01((apx * abx + apy * aby) / ab2);
  return Math.hypot(px - (a.x + t * abx), py - (a.y + t * aby));
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function blendRGB(base, top, alpha) {
  return {
    r: Math.round(base.r * (1 - alpha) + top[0] * alpha),
    g: Math.round(base.g * (1 - alpha) + top[1] * alpha),
    b: Math.round(base.b * (1 - alpha) + top[2] * alpha),
  };
}

// ---- PNG encoder (8-bit RGBA, no interlace) -----------------------------

function encodePng(rgba, W, H) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = W * 4;
  const raw = Buffer.alloc(H * (stride + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const payload = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(payload) >>> 0, 0);
  return Buffer.concat([len, payload, crc]);
}
