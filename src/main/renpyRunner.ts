/**
 * Ren'Py Engine Runner, Real Lint Engine, Playtest & Live Window Mirror Bridge,
 * and Multi-Platform Standalone Exporter.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import type {
  ExportResult,
  ExportTargetStatus,
  LiveRenpyState,
  ProjectData,
  ProjectIssue,
} from '../shared/types';
import { generateLiveBridgeRpy, sceneLabelName } from './renpyCompiler';
import { clearReadOnlyRecursive, resolveRuntimePaths } from './runtimePaths';
import { atomicWriteText, flushProjectSaves } from './projectManager';

export interface LintReport {
  ok: boolean;
  rawOutput: string;
  friendlyIssues: ProjectIssue[];
}

function runRenpyCli(
  args: string[],
  timeoutMs = 120000
): Promise<{ code: number; stdout: string; stderr: string }> {
  const { renpyExePath, renpySdkDir } = resolveRuntimePaths();
  if (!renpyExePath || !renpySdkDir) {
    return Promise.resolve({
      code: -1,
      stdout: '',
      stderr: '未检测到内置运行引擎，请先确保引擎运行组件已准备完毕。',
    });
  }

  return new Promise((resolve) => {
    const child = spawn(renpyExePath, args, {
      cwd: renpySdkDir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        SDL_AUDIODRIVER: process.env.GUIE_HEADLESS ? 'dummy' : process.env.SDL_AUDIODRIVER,
      },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {}
        resolve({ code: -2, stdout, stderr: `${stderr}\n运行检查超时` });
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: err.message });
      }
    });
    child.on('close', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      }
    });
  });
}

/**
 * Runs genuine `renpy.exe <projectDir> lint` and translates any engine errors into
 * plain-language Chinese creator issues (while preserving raw output for Advanced Mode!).
 */
export async function runRenpyLint(
  projectDir: string,
  project?: ProjectData
): Promise<LintReport> {
  await flushProjectSaves(projectDir);
  // Remove temporary preview bridge before linting so lint checks true game files
  removeBridgeFiles(projectDir);

  const res = await runRenpyCli([projectDir, 'lint'], 90000);
  const combined = [res.stdout, res.stderr].filter(Boolean).join('\n').trim();
  const hasRealErrors =
    res.code !== 0 ||
    /\b(Exception|SyntaxError|ParseError|Could not parse|is not defined|is not a known|Line \d+:.*error)/i.test(
      combined
    );

  const friendlyIssues: ProjectIssue[] = [];
  if (hasRealErrors) {
    const lines = combined.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const errorLines = lines
      .filter((l) => /error|exception|could not|not defined|missing|invalid|line \d+/i.test(l))
      .slice(0, 6);

    const summary = errorLines[0] || lines[0] || '检测到项目脚本存在需要修复的问题。';
    friendlyIssues.push({
      id: `issue_engine_check_${Date.now()}`,
      severity: 'error',
      code: 'ENGINE_CHECK_FAILED',
      title: '运行前引擎校验发现异常',
      whatHappened: translateEngineErrorToChinese(summary),
      impact: '游戏试玩或导出时可能在此处中断，需要修复后再发布。',
      howToFix: '点击前往第一个场景排查相关剧情项，或在内置 AI 助手中点击一键修复。',
      sceneId: project?.meta.startSceneId,
      fixAction: project?.meta.startSceneId && project.scenes[0]?.blocks[0]
        ? {
            type: 'jump_to_block',
            sceneId: project.meta.startSceneId,
            blockId: project.scenes.find((s) => s.id === project.meta.startSceneId)?.blocks[0]?.id ?? project.scenes[0].blocks[0].id,
          }
        : { type: 'open_appearance' },
    });
  }

  return {
    ok: !hasRealErrors,
    rawOutput: combined || '检查通过，未发现错误。',
    friendlyIssues,
  };
}

function translateEngineErrorToChinese(rawLine: string): string {
  const lower = rawLine.toLowerCase();
  if (lower.includes('could not find font') || lower.includes('font')) {
    return '部分文字所使用的字体文件不存在或无法读取。';
  }
  if (lower.includes('image') || lower.includes('couldn\'t find file')) {
    return '剧情中引用了已丢失的图片或音频文件，请在素材库检查并一键替换。';
  }
  if (lower.includes('label') && lower.includes('not')) {
    return '存在剧情跳转或选项指向了不存在的场景，请重新连接目标场景。';
  }
  if (lower.includes('syntax') || lower.includes('parse') || lower.includes('expected')) {
    return '扩展定制脚本中存在语法格式问题（可交由 AI 助手自动修复或在高级模式查看）。';
  }
  return '游戏内容校验未通过，存在无效引用或定制脚本异常。';
}

// ==========================================
// Playtest & Real Ren'Py Live Window Mirror
// ==========================================

export class PlaytestSessionManager {
  private child: ChildProcess | null = null;
  private bridgeServer: http.Server | null = null;
  private bridgePort = 0;
  private activeProjectDir: string | null = null;
  private revision = 1;
  private pendingReloadRev = 0;
  private pendingSetVars: Record<string, number | boolean | string> = {};
  private captureTimer: NodeJS.Timeout | null = null;
  private state: LiveRenpyState = {
    running: false,
    mirrorActive: false,
    currentSceneId: null,
    currentBlockId: null,
    variables: {},
    callStack: [],
    frameDataUrl: null,
    revision: 1,
  };
  private listeners = new Set<(st: LiveRenpyState) => void>();
  private sceneByLabel = new Map<string, string>();
  private varIdByPyName = new Map<string, string>();

  onStateChange(cb: (st: LiveRenpyState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  getState(): LiveRenpyState {
    return { ...this.state };
  }

  private emit(): void {
    const snap = this.getState();
    for (const cb of this.listeners) cb(snap);
  }

  private async ensureBridgeServer(): Promise<number> {
    if (this.bridgeServer && this.bridgePort > 0) return this.bridgePort;
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/event') {
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const evt = JSON.parse(body) as {
                type: string;
                label?: string;
                variables?: Record<string, number | boolean | string>;
              };
              if (evt.label && this.sceneByLabel.has(evt.label)) {
                this.state.currentSceneId = this.sceneByLabel.get(evt.label)!;
              }
              if (evt.variables) {
                const mapped: Record<string, number | boolean | string> = {};
                for (const [pyKey, val] of Object.entries(evt.variables)) {
                  const id = this.varIdByPyName.get(pyKey) ?? pyKey;
                  mapped[id] = val;
                }
                this.state.variables = mapped;
              }
              this.emit();
            } catch {}
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
          });
          return;
        }
        if (req.method === 'GET' && req.url?.startsWith('/poll')) {
          const payload = {
            reloadRev: this.pendingReloadRev,
            setVars: Object.keys(this.pendingSetVars).length > 0 ? this.pendingSetVars : undefined,
          };
          this.pendingSetVars = {};
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(payload));
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this.bridgeServer = server;
          this.bridgePort = addr.port;
          resolve(addr.port);
        } else {
          reject(new Error('Failed to bind bridge server'));
        }
      });
    });
  }

  async startPlaytest(options: {
    projectDir: string;
    project: ProjectData;
    startSceneId?: string;
    mirrorMode?: boolean;
  }): Promise<{ started: boolean; error?: string }> {
    await this.stopPlaytest();
    await flushProjectSaves(options.projectDir);

    const { renpyExePath, renpySdkDir } = resolveRuntimePaths();
    if (!renpyExePath || !renpySdkDir) {
      return { started: false, error: '未检测到内置游戏运行引擎，请检查运行组件。' };
    }

    // Build reverse lookup maps for live debugger sync
    this.sceneByLabel.clear();
    for (const sc of options.project.scenes) {
      this.sceneByLabel.set(sceneLabelName(sc.id), sc.id);
    }
    this.varIdByPyName.clear();
    for (const v of options.project.variables) {
      const py = `guie_v_${v.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
      this.varIdByPyName.set(py, v.id);
    }
    this.varIdByPyName.set('guie_player_name', '__player_name__');

    const port = await this.ensureBridgeServer();
    this.revision += 1;
    this.pendingReloadRev = this.revision;
    this.activeProjectDir = options.projectDir;

    // Write temporary live bridge file (excluded from exports & cleaned on stop)
    const bridgeCode = generateLiveBridgeRpy(port, this.revision);
    atomicWriteText(path.join(options.projectDir, 'game', '_guie_bridge.rpy'), bridgeCode);

    const args = [options.projectDir, 'run'];
    if (options.startSceneId) {
      args.unshift('--warp', sceneLabelName(options.startSceneId));
    }

    const child = spawn(renpyExePath, args, {
      cwd: renpySdkDir,
      windowsHide: false,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
    });

    this.child = child;
    this.state = {
      running: true,
      mirrorActive: Boolean(options.mirrorMode),
      currentSceneId: options.startSceneId ?? options.project.meta.startSceneId,
      currentBlockId: null,
      variables: {},
      callStack: [],
      frameDataUrl: null,
      revision: this.revision,
    };
    this.emit();

    child.on('close', () => {
      this.cleanupAfterExit();
    });

    if (options.mirrorMode && process.platform === 'win32') {
      this.startWindowMirrorCapture(child.pid ?? 0);
    }

    return { started: true };
  }

  /**
   * Notifies running Ren'Py playtest to perform a single clean hot-reload after a user save
   * (strictly guarded by monotonic revision so it NEVER triggers infinite reload loops!).
   */
  notifyProjectSaved(projectDir: string): void {
    if (!this.child || !this.activeProjectDir) return;
    if (path.resolve(projectDir).toLowerCase() !== path.resolve(this.activeProjectDir).toLowerCase()) {
      return;
    }
    this.revision += 1;
    this.pendingReloadRev = this.revision;
    const bridgeCode = generateLiveBridgeRpy(this.bridgePort, this.revision);
    atomicWriteText(path.join(this.activeProjectDir, 'game', '_guie_bridge.rpy'), bridgeCode);
    this.state.revision = this.revision;
    this.emit();
  }

  overrideLiveVariable(pyVarName: string, value: number | boolean | string): void {
    this.pendingSetVars[pyVarName] = value;
  }

  private startWindowMirrorCapture(rootPid: number): void {
    if (this.captureTimer) clearInterval(this.captureTimer);
    let busy = false;
    this.captureTimer = setInterval(() => {
      if (busy || !this.state.running || !this.state.mirrorActive) return;
      busy = true;
      captureRenpyWindowBase64(rootPid)
        .then((dataUrl) => {
          if (dataUrl && this.state.running) {
            this.state.frameDataUrl = dataUrl;
            this.emit();
          }
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, 900);
  }

  async stopPlaytest(): Promise<void> {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    if (this.child && this.child.pid) {
      const pid = this.child.pid;
      this.child = null;
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () =>
            resolve()
          );
        });
      } else {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {}
      }
    }
    this.cleanupAfterExit();
  }

  private cleanupAfterExit(): void {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    if (this.activeProjectDir) {
      removeBridgeFiles(this.activeProjectDir);
    }
    this.child = null;
    this.state.running = false;
    this.state.mirrorActive = false;
    this.state.frameDataUrl = null;
    this.emit();
  }

  dispose(): void {
    void this.stopPlaytest();
    try {
      this.bridgeServer?.close();
    } catch {}
    this.bridgeServer = null;
  }
}

function removeBridgeFiles(projectDir: string): void {
  for (const name of ['_guie_bridge.rpy', '_guie_bridge.rpyc']) {
    const p = path.join(projectDir, 'game', name);
    try {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    } catch {}
  }
}

/**
 * Captures the native Ren'Py game window into a JPEG base64 Data URL via Win32 PrintWindow
 * (works even when the Ren'Py window is partially occluded!).
 */
function captureRenpyWindowBase64(pid: number): Promise<string | null> {
  if (process.platform !== 'win32' || !pid) return Promise.resolve(null);
  const psScript = `
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinCap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.Id -eq ${pid} -or $_.ProcessName -match "python|renpy") }
$p = $procs | Select-Object -First 1
if (-not $p) { exit 0 }
$hwnd = $p.MainWindowHandle
$rect = New-Object WinCap+RECT
[WinCap]::GetWindowRect($hwnd, [ref]$rect) | Out-Null
$w = $rect.Right - $rect.Left
$h = $rect.Bottom - $rect.Top
if ($w -lt 80 -or $h -lt 80) { exit 0 }
$bmp = New-Object System.Drawing.Bitmap($w, $h)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $gfx.GetHdc()
[WinCap]::PrintWindow($hwnd, $hdc, 2) | Out-Null
$gfx.ReleaseHdc($hdc)
$gfx.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
[Convert]::ToBase64String($ms.ToArray())
`;
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', psScript],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 4000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const b64 = stdout.trim();
        if (b64.length > 200) resolve(`data:image/jpeg;base64,${b64}`);
        else resolve(null);
      }
    );
  });
}

// ==========================================
// Multi-Platform Standalone Exporter
// ==========================================

export function getExportTargetsStatus(): ExportTargetStatus[] {
  const { renpySdkDir } = resolveRuntimePaths();
  const hasSdk = Boolean(renpySdkDir);
  const hasWeb = Boolean(renpySdkDir && fs.existsSync(path.join(renpySdkDir, 'web')));
  const hasAndroid = Boolean(renpySdkDir && fs.existsSync(path.join(renpySdkDir, 'rapt')));
  const hasMac = Boolean(renpySdkDir && fs.existsSync(path.join(renpySdkDir, 'renpy.app')));

  return [
    {
      target: 'win',
      label: 'Windows 独立游戏包（推荐）',
      available: hasSdk,
      reason: hasSdk ? undefined : '内置运行引擎尚未就绪。',
    },
    {
      target: 'pc',
      label: 'PC 双平台通用包（Windows + Linux）',
      available: hasSdk,
      reason: hasSdk ? undefined : '内置运行引擎尚未就绪。',
    },
    {
      target: 'linux',
      label: 'Linux 独立发行包',
      available: hasSdk,
      reason: hasSdk ? undefined : '内置运行引擎尚未就绪。',
    },
    {
      target: 'mac',
      label: 'macOS 应用包',
      available: hasMac,
      reason: hasMac ? undefined : '当前精简运行包未内置 macOS 打包组件。',
    },
    {
      target: 'web',
      label: 'Web 网页版',
      available: hasWeb,
      reason: hasWeb
        ? undefined
        : '本机未安装官方 Web 网页构建支持包（体积较大，未随基础安装包捆绑）。如需导出网页版，可在官方网站下载对应网页构建扩展包。',
    },
    {
      target: 'android',
      label: 'Android 安卓安装包（APK）',
      available: hasAndroid,
      reason: hasAndroid
        ? undefined
        : '本机未安装 Android 构建环境（需官方移动构建套件、Android 开发套件与签名环境，未随基础安装包捆绑）。',
    },
  ];
}

export async function exportStandaloneGame(options: {
  projectDir: string;
  outputDir: string;
  target: ExportTargetStatus['target'];
}): Promise<ExportResult> {
  const statuses = getExportTargetsStatus();
  const targetInfo = statuses.find((t) => t.target === options.target);
  if (!targetInfo || !targetInfo.available) {
    return {
      success: false,
      target: options.target,
      message: targetInfo?.reason || '当前目标平台暂不可用。',
    };
  }

  await flushProjectSaves(options.projectDir);
  removeBridgeFiles(options.projectDir);
  fs.mkdirSync(options.outputDir, { recursive: true });

  const packageArgMap: Record<string, string[]> = {
    win: ['--package', 'win'],
    pc: ['--package', 'pc'],
    linux: ['--package', 'linux'],
    mac: ['--package', 'mac'],
  };
  const pkgFlags = packageArgMap[options.target] ?? ['--package', 'win'];

  // Run genuine Ren'Py distribute!
  const { renpyExePath, renpySdkDir } = resolveRuntimePaths();
  if (!renpyExePath || !renpySdkDir) {
    return { success: false, target: options.target, message: '未找到内置游戏构建引擎。' };
  }

  const distArgs = [
    path.join(renpySdkDir, 'launcher'),
    'distribute',
    '--destination',
    options.outputDir,
    '--no-update',
    ...pkgFlags,
    options.projectDir,
  ];

  const res = await runRenpyCli(distArgs, 240000);

  if (res.code !== 0) {
    return {
      success: false,
      target: options.target,
      message: `导出过程遇到问题：${translateEngineErrorToChinese(res.stderr || res.stdout)}`,
    };
  }

  // Unzip Windows package automatically into a ready-to-double-click playable folder!
  let executablePath: string | undefined;
  let finalFolder = options.outputDir;

  const files = fs.readdirSync(options.outputDir);
  const zipFile = files.find((f) => f.endsWith(`-${options.target}.zip`) || f.endsWith('.zip'));

  if (options.target === 'win' || options.target === 'pc') {
    if (zipFile) {
      const zipFull = path.join(options.outputDir, zipFile);
      const unpackDir = path.join(options.outputDir, path.basename(zipFile, '.zip'));
      fs.mkdirSync(unpackDir, { recursive: true });
      await new Promise<void>((resolve) => {
        execFile('tar', ['-xf', zipFull, '-C', options.outputDir], { windowsHide: true }, () =>
          resolve()
        );
      });
      if (fs.existsSync(unpackDir)) {
        clearReadOnlyRecursive(unpackDir);
        finalFolder = unpackDir;
        const exes = fs
          .readdirSync(unpackDir)
          .filter((f) => f.toLowerCase().endsWith('.exe') && !f.toLowerCase().includes('python'));
        if (exes[0]) {
          executablePath = path.join(unpackDir, exes[0]);
        }
      }
    }
  }

  return {
    success: true,
    target: options.target,
    outputDir: finalFolder,
    executablePath,
    verifiedLaunchable: Boolean(executablePath && fs.existsSync(executablePath)),
    message: executablePath
      ? `导出成功！已生成可直接双击运行的 Windows 独立游戏程序。`
      : `导出成功！发行包已保存到：${finalFolder}`,
  };
}

/**
 * Verifies a built Windows standalone executable can launch cleanly (used by finish wizard & E2E verification).
 */
export function launchExportedExecutable(
  exePath: string,
  verifyOnlyMs?: number
): Promise<{ launched: boolean; pid?: number; error?: string }> {
  if (!fs.existsSync(exePath)) {
    return Promise.resolve({ launched: false, error: '找不到导出的可执行文件。' });
  }
  return new Promise((resolve) => {
    const child = spawn(exePath, [], {
      cwd: path.dirname(exePath),
      detached: !verifyOnlyMs,
      stdio: 'ignore',
    });

    child.on('error', (err) => {
      resolve({ launched: false, error: err.message });
    });

    if (verifyOnlyMs) {
      let exitedEarly = false;
      child.on('exit', (code) => {
        if (code !== 0 && code !== null) exitedEarly = true;
      });
      setTimeout(() => {
        const pid = child.pid;
        if (pid && process.platform === 'win32') {
          execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
            resolve({ launched: !exitedEarly, pid });
          });
        } else {
          try {
            child.kill();
          } catch {}
          resolve({ launched: !exitedEarly, pid });
        }
      }, verifyOnlyMs);
    } else {
      child.unref();
      resolve({ launched: true, pid: child.pid });
    }
  });
}
