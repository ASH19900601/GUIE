/**
 * Zero-Config Runtime Path Resolver & Portable Temp Directory Hygiene
 * Finds bundled Ren'Py SDK, CJK fonts, and Offline ASR model seamlessly across:
 * 1. Packaged Electron production app (`process.resourcesPath/runtime/...`)
 * 2. Local development workspace (`<repo>/vendor/runtime/...`)
 * 3. Optional local system fallback (environment variables for developer machines)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface RuntimePaths {
  runtimeRoot: string;
  renpySdkDir: string | null;
  renpyExePath: string | null;
  bundledCjkFontPath: string | null;
  asrModelDir: string | null;
}

function getAppRootDir(): string {
  // Packaged Electron puts extraResources under process.resourcesPath
  const resPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resPath && fs.existsSync(path.join(resPath, 'runtime'))) {
    return path.join(resPath, 'runtime');
  }
  // Dev mode: resolve from repo root
  const candidates = [
    path.resolve(process.cwd(), 'vendor', 'runtime'),
    path.resolve(__dirname, '..', '..', 'vendor', 'runtime'),
    path.resolve(__dirname, '..', '..', '..', 'vendor', 'runtime'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

export function resolveRuntimePaths(): RuntimePaths {
  const runtimeRoot = getAppRootDir();

  // 1. Ren'Py SDK
  const sdkCandidates = [
    path.join(runtimeRoot, 'renpy-sdk'),
    process.env.RENPY_SDK,
    process.env.RENPY_HOME,
    process.env.RENPY_SDK_85,
    process.env.RENPY_SDK_84,
  ].filter((x): x is string => Boolean(x));

  let renpySdkDir: string | null = null;
  let renpyExePath: string | null = null;
  for (const dir of sdkCandidates) {
    const exe = path.join(dir, process.platform === 'win32' ? 'renpy.exe' : 'renpy.sh');
    if (fs.existsSync(exe)) {
      renpySdkDir = dir;
      renpyExePath = exe;
      break;
    }
  }

  // 2. Bundled open-source CJK Font (SourceHanSansLite.ttf)
  const fontCandidates = [
    path.join(runtimeRoot, 'fonts', 'SourceHanSansLite.ttf'),
    renpySdkDir ? path.join(renpySdkDir, 'sdk-fonts', 'SourceHanSansLite.ttf') : null,
  ].filter((x): x is string => Boolean(x));

  let bundledCjkFontPath: string | null = null;
  for (const fp of fontCandidates) {
    if (fs.existsSync(fp)) {
      bundledCjkFontPath = fp;
      break;
    }
  }

  // 3. Bundled Offline ASR model directory
  const asrDir = path.join(runtimeRoot, 'asr-model');
  const hasAsrModel =
    fs.existsSync(asrDir) &&
    (fs.existsSync(path.join(asrDir, 'model.int8.onnx')) ||
      fs.existsSync(path.join(asrDir, 'model.onnx')) ||
      fs.existsSync(path.join(asrDir, 'encoder.int8.onnx')));

  return {
    runtimeRoot,
    renpySdkDir,
    renpyExePath,
    bundledCjkFontPath,
    asrModelDir: hasAsrModel ? asrDir : null,
  };
}

/**
 * Portable EXE Hygiene (Req 8.3.2):
 * Cleans stale `guie-studio-portable-*` or orphaned temp directories older than 24h
 * that may remain if the portable build was forcibly killed, preventing system drive bloat.
 */
export function cleanupStalePortableTempDirs(): void {
  try {
    const tmpRoot = os.tmpdir();
    const currentExecDir = path.dirname(process.execPath).toLowerCase();
    const entries = fs.readdirSync(tmpRoot, { withFileTypes: true });
    const cutoff = Date.now() - 12 * 60 * 60 * 1000;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const lower = entry.name.toLowerCase();
      if (!lower.startsWith('guie-studio-portable') && !lower.startsWith('guie-export-tmp-')) {
        continue;
      }
      const fullPath = path.join(tmpRoot, entry.name);
      if (currentExecDir.startsWith(fullPath.toLowerCase())) continue;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch {
        // Ignore in-use directories
      }
    }
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Recursively clears Windows read-only attributes on a project directory so newly
 * created or copied project templates are always writable (Req 8.3.2).
 */
export function clearReadOnlyRecursive(targetDir: string): void {
  if (!fs.existsSync(targetDir)) return;
  const walk = (dir: string) => {
    try {
      fs.chmodSync(dir, 0o777);
    } catch {}
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(full);
        } else {
          fs.chmodSync(full, 0o666);
        }
      } catch {}
    }
  };
  walk(targetDir);
}
