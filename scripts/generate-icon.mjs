/**
 * Generates crisp editorial coral-vermilion Windows app icon (`build-resources/icon.ico` & `icon.png`)
 * and realistic test image/audio fixtures for E2E & screenshot automation — zero external downloads!
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function encodeRgbaPng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function drawAppIconPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const r = size * 0.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Rounded square mask
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const dist = Math.hypot(dx, dy);
      if (dist > r) {
        rgba[idx + 3] = 0;
        continue;
      }
      // Warm coral-vermilion card background (#FF5A3D -> #E5482C subtle vertical tone)
      const t = y / size;
      let R = Math.round(255 - t * 20);
      let G = Math.round(90 - t * 18);
      let B = Math.round(61 - t * 15);

      // Draw crisp editorial paper page + stylized 'G' mark in warm white (#FBFAF5)
      const nx = (x / size) * 2 - 1;
      const ny = (y / size) * 2 - 1;
      const rad = Math.hypot(nx, ny);
      const inRing = rad >= 0.34 && rad <= 0.56;
      const inGap = nx > 0.05 && ny < 0.02 && ny > -0.34;
      const inBar = nx >= 0.0 && nx <= 0.56 && ny >= 0.0 && ny <= 0.17;
      if ((inRing && !inGap) || inBar) {
        R = 251;
        G = 250;
        B = 245;
      }
      rgba[idx] = R;
      rgba[idx + 1] = G;
      rgba[idx + 2] = B;
      rgba[idx + 3] = 255;
    }
  }
  return encodeRgbaPng(size, size, rgba);
}

function buildIcoFromPng(pngBuf) {
  // Single 256x256 PNG-compressed Vista+ ICO container (natively supported by Windows & NSIS)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // ICO
  header.writeUInt16LE(1, 4); // 1 image
  const dir = Buffer.alloc(16);
  dir[0] = 0; // 256px
  dir[1] = 0; // 256px
  dir[2] = 0;
  dir[3] = 0;
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(22, 12);
  return Buffer.concat([header, dir, pngBuf]);
}

const outDir = path.join(rootDir, 'build-resources');
fs.mkdirSync(outDir, { recursive: true });
const png256 = drawAppIconPng(256);
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);
fs.writeFileSync(path.join(outDir, 'icon.ico'), buildIcoFromPng(png256));
console.log('[generate-icon] Generated build-resources/icon.png & icon.ico');
