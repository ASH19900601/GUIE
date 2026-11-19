/**
 * Runtime Dependency Manager (GitHub <100MB Compliance + Zero-Setup Packaging)
 *
 * Manages bundled Ren'Py runtime, CJK fonts, and Offline ASR model:
 * - `--pack`: Compresses local Ren'Py runtime & ASR model into <85MB split archives
 *   under `vendor/archives/` with SHA-256 checksums in `manifest.json` so every file
 *   committed to Git stays well under GitHub's 100MB single-file limit.
 * - `--ensure`: Verifies `vendor/runtime/` is extracted and matches manifest checksums;
 *   automatically reassembles & extracts from `vendor/archives/` if missing or stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const archivesDir = path.join(rootDir, 'vendor', 'archives');
const runtimeDir = path.join(rootDir, 'vendor', 'runtime');
const manifestPath = path.join(archivesDir, 'manifest.json');
const markerPath = path.join(runtimeDir, '.runtime-manifest.json');

const CHUNK_LIMIT = 80 * 1024 * 1024; // 80 MB per chunk (< 100 MB GitHub limit)

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(1024 * 1024);
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function splitFileIntoChunks(srcFile, baseName) {
  const stat = fs.statSync(srcFile);
  const parts = [];
  const fd = fs.openSync(srcFile, 'r');
  try {
    let offset = 0;
    let index = 0;
    while (offset < stat.size) {
      const len = Math.min(CHUNK_LIMIT, stat.size - offset);
      const partName = `${baseName}.part${String(index).padStart(3, '0')}`;
      const partPath = path.join(archivesDir, partName);
      const outFd = fs.openSync(partPath, 'w');
      try {
        let written = 0;
        const buf = Buffer.alloc(4 * 1024 * 1024);
        while (written < len) {
          const toRead = Math.min(buf.length, len - written);
          const n = fs.readSync(fd, buf, 0, toRead, offset + written);
          if (n <= 0) break;
          fs.writeSync(outFd, buf, 0, n);
          written += n;
        }
      } finally {
        fs.closeSync(outFd);
      }
      parts.push({
        file: partName,
        size: len,
        sha256: sha256File(partPath),
      });
      offset += len;
      index += 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return parts;
}

function reassembleChunks(parts, destFile) {
  const outFd = fs.openSync(destFile, 'w');
  try {
    for (const part of parts) {
      const partPath = path.join(archivesDir, part.file);
      if (!fs.existsSync(partPath)) {
        throw new Error(`Missing runtime archive chunk: ${part.file}`);
      }
      const actualHash = sha256File(partPath);
      if (actualHash !== part.sha256) {
        throw new Error(`Checksum mismatch on ${part.file}: expected ${part.sha256}, got ${actualHash}`);
      }
      const inFd = fs.openSync(partPath, 'r');
      const buf = Buffer.alloc(4 * 1024 * 1024);
      try {
        let n;
        while ((n = fs.readSync(inFd, buf, 0, buf.length, null)) > 0) {
          fs.writeSync(outFd, buf, 0, n);
        }
      } finally {
        fs.closeSync(inFd);
      }
    }
  } finally {
    fs.closeSync(outFd);
  }
}

function copyFilteredRenpySdk(sdkDir, stagingDir) {
  // Exclude large docs/tutorials/examples not needed for compilation, lint, playtest, or distribution
  const excludeTop = new Set(['doc', 'tutorial', 'the_question', 'tmp', 'log.txt', 'update']);
  fs.mkdirSync(stagingDir, { recursive: true });
  for (const entry of fs.readdirSync(sdkDir, { withFileTypes: true })) {
    if (excludeTop.has(entry.name)) continue;
    const src = path.join(sdkDir, entry.name);
    const dst = path.join(stagingDir, entry.name);
    fs.cpSync(src, dst, { recursive: true, force: true });
  }
}

function packRuntime() {
  fs.mkdirSync(archivesDir, { recursive: true });
  fs.mkdirSync(runtimeDir, { recursive: true });

  // Clean previous chunk files
  for (const f of fs.readdirSync(archivesDir)) {
    if (f.includes('.part') || f.endsWith('.tar.gz') || f.endsWith('.tar.xz')) {
      fs.rmSync(path.join(archivesDir, f), { force: true });
    }
  }

  const bundles = [];

  // 1. Pack Ren'Py SDK if present in vendor/runtime/renpy-sdk or env RENPY_SDK
  const renpyRuntimeTarget = path.join(runtimeDir, 'renpy-sdk');
  const envSdk = process.env.RENPY_SDK || process.env.RENPY_HOME || process.env.RENPY_SDK_85;
  if (!fs.existsSync(path.join(renpyRuntimeTarget, 'renpy.exe')) && envSdk && fs.existsSync(path.join(envSdk, 'renpy.exe'))) {
    console.log(`[prepare-runtime] Staging Ren'Py SDK from ${envSdk}...`);
    fs.rmSync(renpyRuntimeTarget, { recursive: true, force: true });
    copyFilteredRenpySdk(envSdk, renpyRuntimeTarget);
  }

  // Also ensure bundled CJK font exists in vendor/runtime/fonts/SourceHanSansLite.ttf
  const fontsDir = path.join(runtimeDir, 'fonts');
  fs.mkdirSync(fontsDir, { recursive: true });
  const sdkFont = path.join(renpyRuntimeTarget, 'sdk-fonts', 'SourceHanSansLite.ttf');
  const targetFont = path.join(fontsDir, 'SourceHanSansLite.ttf');
  if (fs.existsSync(sdkFont) && !fs.existsSync(targetFont)) {
    fs.copyFileSync(sdkFont, targetFont);
  }

  if (fs.existsSync(path.join(renpyRuntimeTarget, 'renpy.exe'))) {
    const tarTmp = path.join(rootDir, '.guie-tmp', 'renpy-sdk.tar.gz');
    fs.mkdirSync(path.dirname(tarTmp), { recursive: true });
    console.log('[prepare-runtime] Compressing Ren\'Py runtime...');
    execFileSync('tar', ['-czf', tarTmp, '-C', runtimeDir, 'renpy-sdk', 'fonts'], { stdio: 'inherit' });
    const fullHash = sha256File(tarTmp);
    const parts = splitFileIntoChunks(tarTmp, 'renpy-sdk.tar.gz');
    fs.rmSync(tarTmp, { force: true });
    bundles.push({
      id: 'renpy-sdk',
      archiveSha256: fullHash,
      extractSubdir: '.',
      parts,
    });
    console.log(`[prepare-runtime] Packed renpy-sdk into ${parts.length} chunk(s).`);
  } else {
    console.warn('[prepare-runtime] Warning: No Ren\'Py SDK found to pack.');
  }

  // 2. Pack Offline ASR model if present in vendor/runtime/asr-model
  const asrDir = path.join(runtimeDir, 'asr-model');
  if (fs.existsSync(asrDir) && fs.readdirSync(asrDir).length > 0) {
    const tarTmp = path.join(rootDir, '.guie-tmp', 'asr-model.tar.gz');
    fs.mkdirSync(path.dirname(tarTmp), { recursive: true });
    console.log('[prepare-runtime] Compressing Offline ASR model...');
    execFileSync('tar', ['-czf', tarTmp, '-C', runtimeDir, 'asr-model'], { stdio: 'inherit' });
    const fullHash = sha256File(tarTmp);
    const parts = splitFileIntoChunks(tarTmp, 'asr-model.tar.gz');
    fs.rmSync(tarTmp, { force: true });
    bundles.push({
      id: 'asr-model',
      archiveSha256: fullHash,
      extractSubdir: '.',
      parts,
    });
    console.log(`[prepare-runtime] Packed asr-model into ${parts.length} chunk(s).`);
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    bundles,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(markerPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('[prepare-runtime] Manifest written:', manifestPath);
}

function ensureRuntime() {
  fs.mkdirSync(runtimeDir, { recursive: true });

  // If manifest exists, verify whether extracted runtime matches manifest
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let upToDate = false;
    if (fs.existsSync(markerPath)) {
      try {
        const installed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
        const sameHashes =
          manifest.bundles.length === installed.bundles?.length &&
          manifest.bundles.every((b, idx) => b.archiveSha256 === installed.bundles?.[idx]?.archiveSha256);
        const renpyOk = !manifest.bundles.some((b) => b.id === 'renpy-sdk') ||
          fs.existsSync(path.join(runtimeDir, 'renpy-sdk', 'renpy.exe'));
        const asrOk = !manifest.bundles.some((b) => b.id === 'asr-model') ||
          fs.existsSync(path.join(runtimeDir, 'asr-model'));
        upToDate = sameHashes && renpyOk && asrOk;
      } catch {
        upToDate = false;
      }
    }

    if (upToDate) {
      console.log('[prepare-runtime] Runtime is up-to-date.');
      return;
    }

    // Reassemble & extract each bundle
    const tmpDir = path.join(rootDir, '.guie-tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    for (const bundle of manifest.bundles) {
      const tarFile = path.join(tmpDir, `${bundle.id}.tar.gz`);
      console.log(`[prepare-runtime] Verifying & extracting ${bundle.id}...`);
      reassembleChunks(bundle.parts, tarFile);
      const actualHash = sha256File(tarFile);
      if (actualHash !== bundle.archiveSha256) {
        throw new Error(`Reassembled archive checksum mismatch for ${bundle.id}`);
      }
      execFileSync('tar', ['-xzf', tarFile, '-C', runtimeDir], { stdio: 'inherit' });
      fs.rmSync(tarFile, { force: true });
    }
    fs.writeFileSync(markerPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log('[prepare-runtime] All runtime bundles extracted and verified.');
    return;
  }

  // Fallback for fresh dev machine before packing: copy from env RENPY_SDK if available
  const renpyTarget = path.join(runtimeDir, 'renpy-sdk');
  const envSdk = process.env.RENPY_SDK || process.env.RENPY_HOME || process.env.RENPY_SDK_85;
  if (!fs.existsSync(path.join(renpyTarget, 'renpy.exe')) && envSdk && fs.existsSync(path.join(envSdk, 'renpy.exe'))) {
    console.log(`[prepare-runtime] Bootstrapping Ren'Py runtime from local SDK...`);
    copyFilteredRenpySdk(envSdk, renpyTarget);
    const fontsDir = path.join(runtimeDir, 'fonts');
    fs.mkdirSync(fontsDir, { recursive: true });
    const sdkFont = path.join(renpyTarget, 'sdk-fonts', 'SourceHanSansLite.ttf');
    if (fs.existsSync(sdkFont)) {
      fs.copyFileSync(sdkFont, path.join(fontsDir, 'SourceHanSansLite.ttf'));
    }
  }
}

const mode = process.argv.includes('--pack') ? 'pack' : 'ensure';
if (mode === 'pack') {
  packRuntime();
} else {
  ensureRuntime();
}
