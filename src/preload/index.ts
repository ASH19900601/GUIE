import { contextBridge, ipcRenderer } from 'electron';
import type { GuieBridgeApi } from '../shared/ipc';

const api: GuieBridgeApi = {
  getRuntimeInfo: () => ipcRenderer.invoke('guie:getRuntimeInfo'),
  pickDirectory: (title) => ipcRenderer.invoke('guie:pickDirectory', title),
  pickFiles: (options) => ipcRenderer.invoke('guie:pickFiles', options),
  openPathInExplorer: (targetPath) => ipcRenderer.invoke('guie:openPathInExplorer', targetPath),

  listRecentProjects: () => ipcRenderer.invoke('guie:listRecentProjects'),
  removeRecentProject: (projectDir) => ipcRenderer.invoke('guie:removeRecentProject', projectDir),
  createProject: (options) => ipcRenderer.invoke('guie:createProject', options),
  openProject: (projectDir) => ipcRenderer.invoke('guie:openProject', projectDir),
  saveProject: (projectDir, project, revision) =>
    ipcRenderer.invoke('guie:saveProject', projectDir, project, revision),
  flushSaves: (projectDir) => ipcRenderer.invoke('guie:flushSaves', projectDir),

  importAssets: (projectDir, sourcePaths, forcedCategory) =>
    ipcRenderer.invoke('guie:importAssets', projectDir, sourcePaths, forcedCategory),
  checkMissingAssets: (projectDir, project) =>
    ipcRenderer.invoke('guie:checkMissingAssets', projectDir, project),
  getAssetUrl: (projectDir, relativePath) => {
    const encoded = encodeURIComponent(`${projectDir}::${relativePath}`);
    return `guie-asset://local/${encoded}`;
  },

  listSnapshots: (projectDir) => ipcRenderer.invoke('guie:listSnapshots', projectDir),
  createSnapshot: (projectDir, project, label, kind) =>
    ipcRenderer.invoke('guie:createSnapshot', projectDir, project, label, kind),
  restoreSnapshot: (projectDir, snapshotId, currentProject) =>
    ipcRenderer.invoke('guie:restoreSnapshot', projectDir, snapshotId, currentProject),

  runEngineCheck: (projectDir, project) =>
    ipcRenderer.invoke('guie:runEngineCheck', projectDir, project),
  startPlaytest: (options) => ipcRenderer.invoke('guie:startPlaytest', options),
  stopPlaytest: () => ipcRenderer.invoke('guie:stopPlaytest'),
  overrideLiveVar: (pyVarName, value) =>
    ipcRenderer.invoke('guie:overrideLiveVar', pyVarName, value),
  onLiveRenpyState: (cb) => {
    const listener = (_e: unknown, state: Parameters<typeof cb>[0]) => cb(state);
    ipcRenderer.on('guie:liveRenpyState', listener);
    return () => ipcRenderer.removeListener('guie:liveRenpyState', listener);
  },
  getExportTargets: () => ipcRenderer.invoke('guie:getExportTargets'),
  exportGame: (options) => ipcRenderer.invoke('guie:exportGame', options),
  launchExportedExe: (exePath, verifyOnlyMs) =>
    ipcRenderer.invoke('guie:launchExportedExe', exePath, verifyOnlyMs),

  getAiSettings: () => ipcRenderer.invoke('guie:getAiSettings'),
  saveAiSettings: (input) => ipcRenderer.invoke('guie:saveAiSettings', input),
  sendAiPrompt: (options) => ipcRenderer.invoke('guie:sendAiPrompt', options),
  onAiStreamEvent: (cb) => {
    const listener = (_e: unknown, evt: Parameters<typeof cb>[0]) => cb(evt);
    ipcRenderer.on('guie:aiStreamEvent', listener);
    return () => ipcRenderer.removeListener('guie:aiStreamEvent', listener);
  },

  transcribePcm: (options) => ipcRenderer.invoke('guie:transcribePcm', options),
  transcribeWavFile: (options) => ipcRenderer.invoke('guie:transcribeWavFile', options),

  listReuseItems: () => ipcRenderer.invoke('guie:listReuseItems'),
  saveToReuseLibrary: (options) => ipcRenderer.invoke('guie:saveToReuseLibrary', options),
  importFromReuseLibrary: (options) => ipcRenderer.invoke('guie:importFromReuseLibrary', options),
  deleteReuseItem: (itemId) => ipcRenderer.invoke('guie:deleteReuseItem', itemId),

  listAdvancedFiles: (projectDir) => ipcRenderer.invoke('guie:listAdvancedFiles', projectDir),
  readAdvancedFile: (projectDir, relativePath) =>
    ipcRenderer.invoke('guie:readAdvancedFile', projectDir, relativePath),
  writeAdvancedFile: (projectDir, relativePath, content) =>
    ipcRenderer.invoke('guie:writeAdvancedFile', projectDir, relativePath, content),
};

contextBridge.exposeInMainWorld('guie', api);
