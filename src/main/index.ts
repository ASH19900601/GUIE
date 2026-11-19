import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createProject,
  createSnapshot,
  enqueueProjectSave,
  findMissingAssetIds,
  flushProjectSaves,
  importAssetFiles,
  listAdvancedProjectFiles,
  listSnapshots,
  loadRecentProjects,
  openProject,
  readAdvancedProjectFile,
  removeRecentProject,
  restoreSnapshot,
  writeAdvancedProjectFile,
} from './projectManager';
import {
  exportStandaloneGame,
  getExportTargetsStatus,
  launchExportedExecutable,
  PlaytestSessionManager,
  runRenpyLint,
} from './renpyRunner';
import {
  getAiSettingsPublic,
  runAiAssistantTurn,
  saveAiSettings,
} from './aiAgent';
import {
  getOfflineAsrStatus,
  transcribePcm16k,
  transcribeWavFile,
  writePcmToWavFile,
} from './asrService';
import {
  deleteReuseItem,
  importFromReuseLibrary,
  listReuseItems,
  saveToReuseLibrary,
} from './reuseLibrary';
import { cleanupStalePortableTempDirs, resolveRuntimePaths } from './runtimePaths';
import type { AssetCategory, ProjectData, ProjectSnapshotMeta } from '../shared/types';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'guie-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
const playtestManager = new PlaytestSessionManager();

function getDefaultProjectsDir(): string {
  const dir = path.join(os.homedir(), 'Documents', 'GUIEProjects');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {}
  return dir;
}

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1180,
    minHeight: 740,
    backgroundColor: '#F3F0E8',
    title: 'GUIE — Ren\'Py 零代码视觉小说创作工坊',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow = win;

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
}

function registerIpcHandlers(): void {
  // Forward live Ren'Py playtest/mirror state updates to renderer
  playtestManager.onStateChange((st) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('guie:liveRenpyState', st);
    }
  });

  ipcMain.handle('guie:getRuntimeInfo', () => {
    const rt = resolveRuntimePaths();
    const asr = getOfflineAsrStatus();
    return {
      renpyReady: Boolean(rt.renpyExePath),
      cjkFontReady: Boolean(rt.bundledCjkFontPath),
      asrReady: asr.available,
      asrModelType: asr.modelType,
      defaultProjectsDir: getDefaultProjectsDir(),
    };
  });

  ipcMain.handle('guie:pickDirectory', async (_e, title?: string) => {
    const res = await dialog.showOpenDialog({
      title: title || '选择文件夹',
      properties: ['openDirectory', 'createDirectory'],
    });
    return res.canceled ? null : res.filePaths[0] ?? null;
  });

  ipcMain.handle(
    'guie:pickFiles',
    async (
      _e,
      options: {
        title?: string;
        multi?: boolean;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      const res = await dialog.showOpenDialog({
        title: options?.title || '选择文件',
        properties: options?.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
        filters: options?.filters,
      });
      return res.canceled ? [] : res.filePaths;
    }
  );

  ipcMain.handle('guie:openPathInExplorer', async (_e, targetPath: string) => {
    if (fs.existsSync(targetPath)) {
      const stat = fs.statSync(targetPath);
      if (stat.isDirectory()) {
        await shell.openPath(targetPath);
      } else {
        shell.showItemInFolder(targetPath);
      }
    }
  });

  // Project lifecycle
  ipcMain.handle('guie:listRecentProjects', () => loadRecentProjects());
  ipcMain.handle('guie:removeRecentProject', (_e, dir: string) => removeRecentProject(dir));
  ipcMain.handle('guie:createProject', (_e, opts) => createProject(opts));
  ipcMain.handle('guie:openProject', (_e, dir: string) => openProject(dir));
  ipcMain.handle(
    'guie:saveProject',
    async (_e, projectDir: string, project: ProjectData, revision: number) => {
      const res = await enqueueProjectSave(projectDir, project, revision);
      playtestManager.notifyProjectSaved(projectDir);
      return res;
    }
  );
  ipcMain.handle('guie:flushSaves', (_e, projectDir: string) => flushProjectSaves(projectDir));

  // Assets
  ipcMain.handle(
    'guie:importAssets',
    (_e, projectDir: string, sourcePaths: string[], forcedCategory?: AssetCategory) =>
      importAssetFiles(projectDir, sourcePaths, forcedCategory)
  );
  ipcMain.handle('guie:checkMissingAssets', (_e, projectDir: string, project: ProjectData) =>
    findMissingAssetIds(projectDir, project)
  );

  // Snapshots
  ipcMain.handle('guie:listSnapshots', (_e, projectDir: string) => listSnapshots(projectDir));
  ipcMain.handle(
    'guie:createSnapshot',
    (_e, projectDir: string, project: ProjectData, label: string, kind: ProjectSnapshotMeta['kind']) =>
      createSnapshot(projectDir, project, label, kind)
  );
  ipcMain.handle(
    'guie:restoreSnapshot',
    (_e, projectDir: string, snapshotId: string, currentProject?: ProjectData) =>
      restoreSnapshot(projectDir, snapshotId, currentProject)
  );

  // Ren'Py Lint, Playtest, Mirror & Export
  ipcMain.handle('guie:runEngineCheck', (_e, projectDir: string, project: ProjectData) =>
    runRenpyLint(projectDir, project)
  );
  ipcMain.handle('guie:startPlaytest', (_e, opts) => playtestManager.startPlaytest(opts));
  ipcMain.handle('guie:stopPlaytest', () => playtestManager.stopPlaytest());
  ipcMain.handle('guie:overrideLiveVar', (_e, pyVarName: string, value: number | boolean | string) => {
    playtestManager.overrideLiveVariable(pyVarName, value);
  });
  ipcMain.handle('guie:getExportTargets', () => getExportTargetsStatus());
  ipcMain.handle('guie:exportGame', (_e, opts) => exportStandaloneGame(opts));
  ipcMain.handle('guie:launchExportedExe', (_e, exePath: string, verifyOnlyMs?: number) =>
    launchExportedExecutable(exePath, verifyOnlyMs)
  );

  // Built-in AI Creative Assistant
  ipcMain.handle('guie:getAiSettings', () => getAiSettingsPublic());
  ipcMain.handle('guie:saveAiSettings', (_e, input) => saveAiSettings(input));
  ipcMain.handle('guie:sendAiPrompt', async (_e, opts) => {
    return runAiAssistantTurn({
      ...opts,
      callbacks: {
        onReasoningChunk: (delta) => {
          mainWindow?.webContents.send('guie:aiStreamEvent', { type: 'reasoning', delta });
        },
        onContentChunk: (delta) => {
          mainWindow?.webContents.send('guie:aiStreamEvent', { type: 'content', delta });
        },
        onOperationUpdate: (operation) => {
          mainWindow?.webContents.send('guie:aiStreamEvent', { type: 'operation', operation });
        },
      },
    });
  });

  // Built-in Offline ASR
  ipcMain.handle(
    'guie:transcribePcm',
    (
      _e,
      options: {
        samples: number[];
        sampleRate: number;
        projectDir?: string;
        saveFileName?: string;
      }
    ) => {
      const float32 = Float32Array.from(options.samples);
      const text = transcribePcm16k(float32, options.sampleRate || 16000);
      let savedAsset;
      if (options.projectDir && options.saveFileName) {
        const tmpWav = path.join(os.tmpdir(), `guie_asr_${Date.now()}_${path.basename(options.saveFileName).replace(/\.[^.]+$/, '')}.wav`);
        writePcmToWavFile(float32, options.sampleRate || 16000, tmpWav);
        const imported = importAssetFiles(options.projectDir, [tmpWav], 'voice');
        savedAsset = imported[0];
        try {
          fs.rmSync(tmpWav, { force: true });
        } catch {}
      }
      return { text, savedAsset };
    }
  );
  ipcMain.handle('guie:transcribeWavFile', (_e, options: { filePath: string }) =>
    transcribeWavFile(options.filePath)
  );

  // Reuse Library
  ipcMain.handle('guie:listReuseItems', () => listReuseItems());
  ipcMain.handle('guie:saveToReuseLibrary', (_e, opts) => saveToReuseLibrary(opts));
  ipcMain.handle('guie:importFromReuseLibrary', (_e, opts) => importFromReuseLibrary(opts));
  ipcMain.handle('guie:deleteReuseItem', (_e, itemId: string) => deleteReuseItem(itemId));

  // Advanced Mode
  ipcMain.handle('guie:listAdvancedFiles', (_e, projectDir: string) =>
    listAdvancedProjectFiles(projectDir)
  );
  ipcMain.handle('guie:readAdvancedFile', (_e, projectDir: string, relativePath: string) =>
    readAdvancedProjectFile(projectDir, relativePath)
  );
  ipcMain.handle(
    'guie:writeAdvancedFile',
    (_e, projectDir: string, relativePath: string, content: string) =>
      writeAdvancedProjectFile(projectDir, relativePath, content)
  );
}

app.whenReady().then(() => {
  cleanupStalePortableTempDirs();

  // Register local project asset loader protocol
  protocol.handle('guie-asset', (request) => {
    try {
      const raw = decodeURIComponent(request.url.replace(/^guie-asset:\/\/local\//i, ''));
      const sepIdx = raw.indexOf('::');
      if (sepIdx < 0) return new Response('Not found', { status: 404 });
      const projectDir = raw.slice(0, sepIdx);
      const relPath = raw.slice(sepIdx + 2);
      const fullPath = path.resolve(projectDir, relPath);
      if (!fullPath.startsWith(path.resolve(projectDir)) || !fs.existsSync(fullPath)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(fullPath).toString());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });

  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  playtestManager.dispose();
});

app.on('window-all-closed', () => {
  playtestManager.dispose();
  if (process.platform !== 'darwin') app.quit();
});
