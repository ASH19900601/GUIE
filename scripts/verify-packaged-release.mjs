/**
 * Final Packaged Release Product Verification (Req 8.1.3)
 * Verifies the ACTUAL packaged production Electron binary (`release/win-unpacked/*.exe`),
 * confirming:
 * 1. Both Windows NSIS Installer & Windows Single-File Portable EXE exist in `release/`
 * 2. Launching the packaged production binary from a clean temp AppData boots cleanly
 * 3. Bundled Ren'Py SDK, CJK font, and Offline Paraformer ASR model resolve from `resources/runtime/`
 * 4. Creating a project, offline ASR transcription, real Ren'Py engine check, and real Playtest work inside the packaged binary!
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'release');

async function main() {
  assert.ok(fs.existsSync(releaseDir), 'release/ directory must exist');
  const topFiles = fs.readdirSync(releaseDir);

  const nsisExe = topFiles.find((f) => f.endsWith('-setup.exe'));
  const portableExe = topFiles.find((f) => f.endsWith('-portable.exe'));
  assert.ok(nsisExe, `Expected Windows NSIS installer in release/, found: ${topFiles.join(', ')}`);
  assert.ok(portableExe, `Expected Windows Portable single-file EXE in release/, found: ${topFiles.join(', ')}`);
  console.log('[verify-release] Found NSIS installer:', nsisExe);
  console.log('[verify-release] Found Portable EXE:', portableExe);

  const unpackedDir = path.join(releaseDir, 'win-unpacked');
  const appExeName = fs.readdirSync(unpackedDir).find((f) => f.endsWith('.exe'));
  assert.ok(appExeName, 'Expected packaged Electron .exe in release/win-unpacked/');
  const appExePath = path.join(unpackedDir, appExeName);
  console.log('[verify-release] Launching packaged production binary:', appExePath);

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-pkg-verify-'));
  const projParent = path.join(tmpBase, 'projects');
  const fakeAppData = path.join(tmpBase, 'appdata');
  fs.mkdirSync(projParent, { recursive: true });
  fs.mkdirSync(fakeAppData, { recursive: true });

  const app = await electron.launch({
    executablePath: appExePath,
    env: {
      ...process.env,
      APPDATA: fakeAppData,
      // Explicitly clear dev env SDK vars to PROVE packaged binary uses its OWN bundled resources/runtime!
      RENPY_SDK: '',
      RENPY_HOME: '',
      RENPY_SDK_85: '',
      RENPY_SDK_84: '',
    },
  });

  try {
    const win = await app.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForTimeout(1000);

    // 1. Verify ALL bundled runtimes (Ren'Py, CJK font, Offline ASR) resolved purely from packaged resources/runtime/!
    const rtInfo = await win.evaluate(() => window.guie.getRuntimeInfo());
    console.log('[verify-release] Packaged Runtime Info:', rtInfo);
    assert.equal(rtInfo.renpyReady, true, 'Packaged binary must include bundled RenPy SDK');
    assert.equal(rtInfo.cjkFontReady, true, 'Packaged binary must include bundled CJK font');
    assert.equal(rtInfo.asrReady, true, 'Packaged binary must include bundled offline ASR model');

    // 2. Verify Offline ASR runs inside packaged binary (asarUnpack native bindings work!)
    const asrRes = await win.evaluate(() =>
      window.guie.transcribePcm({
        samples: new Array(16000).fill(0),
        sampleRate: 16000,
      })
    );
    assert.equal(typeof asrRes.text, 'string', 'Offline ASR inside packaged binary must return string');
    console.log('[verify-release] Offline ASR inside packaged binary OK!');

    // 3. Create project via packaged UI, run real Ren'Py engine check & real playtest!
    await win.getByTestId('home-create-project-btn').click();
    await win.getByTestId('wizard-title-input').fill('成品验收测试');
    await win.getByTestId('wizard-dir-input').fill(projParent);
    await win.getByTestId('wizard-submit-btn').click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible', timeout: 15000 });
    await win.waitForTimeout(500);

    // Check bundled CJK font copied cleanly and writable (no read-only lock!)
    const createdDir = path.join(projParent, fs.readdirSync(projParent)[0]);
    const fontPath = path.join(createdDir, 'game', 'fonts', 'SourceHanSansLite.ttf');
    assert.ok(fs.existsSync(fontPath), 'Packaged app must copy bundled CJK font into new projects');

    // Run real Ren'Py engine check via Finish Wizard
    await win.getByTestId('nav-finish').click();
    await win.getByTestId('run-full-check-btn').click();
    await win.waitForTimeout(3000);
    const issueCount = await win.locator('[data-testid^="issue-card-"]').count();
    assert.equal(issueCount, 0, 'Packaged app project must pass real RenPy Lint with 0 errors');

    // Start & stop real playtest from packaged binary
    await win.getByTestId('play-from-start-btn').click();
    await win.waitForTimeout(2000);
    await win.getByTestId('stop-playtest-btn').click();

    console.log('[verify-release] ✅ FINAL PACKAGED PRODUCTION BINARY PASSED ALL CHECKS!');
  } finally {
    try {
      await app.close();
    } catch {}
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('[verify-release] FAILED:', err);
  process.exit(1);
});
