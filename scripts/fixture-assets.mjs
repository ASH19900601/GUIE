/**
 * Programmatic Visual & Audio Fixture Generator for E2E Tests and Showcase Screenshots
 * Produces crisp gradient/architectural scenic PNG backgrounds, distinct stylized character sprites,
 * and valid 16kHz PCM WAV audio files — 100% self-contained with zero external media dependencies.
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, c]);
}

function encodePng(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

function drawScenicBackground(filePath, topRgb, midRgb, botRgb, accentSun = true) {
  const w = 640;
  const h = 360;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const ty = y / h;
    const base =
      ty < 0.55
        ? lerpRgb(topRgb, midRgb, ty / 0.55)
        : lerpRgb(midRgb, botRgb, (ty - 0.55) / 0.45);
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      let [r, g, b] = base;
      if (accentSun) {
        const d = Math.hypot(x - w * 0.72, y - h * 0.34);
        if (d < 85) {
          const glow = Math.pow(1 - d / 85, 1.8);
          r = Math.min(255, Math.round(r + glow * 95));
          g = Math.min(255, Math.round(g + glow * 72));
          b = Math.min(255, Math.round(b + glow * 45));
        }
      }
      // Subtle horizon silhouette
      const hillY = h * 0.68 + Math.sin(x * 0.015) * 14 + Math.cos(x * 0.032) * 7;
      if (y > hillY) {
        r = Math.round(r * 0.48);
        g = Math.round(g * 0.48);
        b = Math.round(b * 0.54);
      }
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = 255;
    }
  }
  fs.writeFileSync(filePath, encodePng(w, h, rgba));
}

function drawCharacterSprite(filePath, hairRgb, outfitRgb, smileVariant = 0) {
  const w = 260;
  const h = 420;
  const rgba = Buffer.alloc(w * h * 4);
  const cx = w / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      // Head
      const headD = Math.hypot((x - cx) * 1.05, y - 108);
      // Hair halo
      const hairD = Math.hypot((x - cx) * 0.92, y - 100);
      // Shoulders & Torso
      const inBody = y > 168 && Math.abs(x - cx) < 34 + (y - 168) * 0.24 && Math.abs(x - cx) < 92;
      // Neck
      const inNeck = y >= 148 && y <= 176 && Math.abs(x - cx) < 16;

      let painted = false;
      let [r, g, b] = [0, 0, 0];

      if (inBody) {
        [r, g, b] = outfitRgb;
        // White collar accent
        if (y < 205 && Math.abs(x - cx) < 26 - (y - 168) * 0.4) {
          [r, g, b] = [248, 245, 238];
        }
        painted = true;
      } else if (inNeck) {
        [r, g, b] = [248, 218, 198];
        painted = true;
      }

      if (hairD < 66 && (y < 145 || Math.abs(x - cx) > 36) && y < 220) {
        [r, g, b] = hairRgb;
        painted = true;
      }
      if (headD < 52) {
        [r, g, b] = [252, 224, 205];
        // Bangs
        if (y < 92 + Math.sin(x * 0.14) * 6) [r, g, b] = hairRgb;
        // Eyes
        const leftEye = Math.hypot(x - (cx - 19), y - 108);
        const rightEye = Math.hypot(x - (cx + 19), y - 108);
        if (leftEye < 5.5 || rightEye < 5.5) [r, g, b] = [42, 36, 44];
        // Expression mouth
        const mouthY = 132 + (smileVariant === 1 ? -2 : 0);
        if (smileVariant === 1 && Math.hypot(x - cx, y - mouthY) < 5) {
          [r, g, b] = [215, 110, 105];
        } else if (Math.abs(y - (mouthY + Math.pow((x - cx) * 0.15, 2))) < 1.8 && Math.abs(x - cx) < 10) {
          [r, g, b] = [205, 105, 95];
        }
        painted = true;
      }

      if (painted) {
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  }
  fs.writeFileSync(filePath, encodePng(w, h, rgba));
}

function writeSineWav(filePath, freqHz = 440, durationSec = 1.2) {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buf = Buffer.alloc(44 + numSamples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + numSamples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const env = Math.min(1, i / 1600, (numSamples - i) / 1600);
    const val = Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 0.25 * env;
    buf.writeInt16LE(Math.round(val * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function lerpRgb(a, b, t) {
  const c = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}

export function createTestFixtures(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  const bgClassroom = path.join(targetDir, 'bg_教室黄昏.png');
  const bgGarden = path.join(targetDir, 'bg_中庭花园.png');
  const bgRooftop = path.join(targetDir, 'bg_秘密天台.png');
  const spLinSmile = path.join(targetDir, '林夏_微笑.png');
  const spLinSurprised = path.join(targetDir, '林夏_惊讶.png');
  const spShenCalm = path.join(targetDir, '沈秋_平静.png');
  const spShenGentle = path.join(targetDir, '沈秋_温柔.png');
  const bgmEvening = path.join(targetDir, 'bgm_黄昏微风.wav');
  const voiceLine1 = path.join(targetDir, 'voice_林夏开场.wav');

  drawScenicBackground(bgClassroom, [52, 68, 108], [218, 128, 86], [248, 195, 132], true);
  drawScenicBackground(bgGarden, [62, 134, 178], [148, 206, 172], [78, 134, 92], true);
  drawScenicBackground(bgRooftop, [28, 38, 76], [116, 76, 128], [224, 132, 106], true);
  drawCharacterSprite(spLinSmile, [74, 46, 42], [216, 92, 74], 0);
  drawCharacterSprite(spLinSurprised, [74, 46, 42], [216, 92, 74], 1);
  drawCharacterSprite(spShenCalm, [36, 48, 72], [58, 118, 96], 0);
  drawCharacterSprite(spShenGentle, [36, 48, 72], [58, 118, 96], 1);
  writeSineWav(bgmEvening, 330, 1.5);
  writeSineWav(voiceLine1, 520, 0.8);

  return {
    bgClassroom,
    bgGarden,
    bgRooftop,
    spLinSmile,
    spLinSurprised,
    spShenCalm,
    spShenGentle,
    bgmEvening,
    voiceLine1,
  };
}
