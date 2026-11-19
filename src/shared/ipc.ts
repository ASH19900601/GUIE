import type {
  AdvancedFileEntry,
  AiEditorContext,
  AiOperationRecord,
  AiProviderPreset,
  AiSettings,
  AssetCategory,
  AssetEntry,
  ExportResult,
  ExportTargetStatus,
  LiveRenpyState,
  ProjectData,
  ProjectIssue,
  ProjectSnapshotMeta,
  RecentProjectItem,
  ReuseItemKind,
  ReuseLibraryItem,
} from './types';

export interface GuieBridgeApi {
  // System & Dialogs
  getRuntimeInfo: () => Promise<{
    renpyReady: boolean;
    cjkFontReady: boolean;
    asrReady: boolean;
    asrModelType?: string;
    defaultProjectsDir: string;
  }>;
  pickDirectory: (title?: string) => Promise<string | null>;
  pickFiles: (options: {
    title?: string;
    multi?: boolean;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => Promise<string[]>;
  openPathInExplorer: (targetPath: string) => Promise<void>;

  // Project Lifecycle & Safe Save Queue
  listRecentProjects: () => Promise<RecentProjectItem[]>;
  removeRecentProject: (projectDir: string) => Promise<RecentProjectItem[]>;
  createProject: (options: {
    parentDir: string;
    title: string;
    author?: string;
    width?: number;
    height?: number;
    withStarterContent?: boolean;
  }) => Promise<{ projectDir: string; project: ProjectData }>;
  openProject: (projectDir: string) => Promise<{
    projectDir: string;
    project: ProjectData;
    upgradedCjkFont: boolean;
  }>;
  saveProject: (
    projectDir: string,
    project: ProjectData,
    revision: number
  ) => Promise<{ savedAt: string; revision: number }>;
  flushSaves: (projectDir: string) => Promise<void>;

  // Assets
  importAssets: (
    projectDir: string,
    sourcePaths: string[],
    forcedCategory?: AssetCategory
  ) => Promise<AssetEntry[]>;
  checkMissingAssets: (projectDir: string, project: ProjectData) => Promise<string[]>;
  getAssetUrl: (projectDir: string, relativePath: string) => string;

  // Snapshots (Cross-restart history)
  listSnapshots: (projectDir: string) => Promise<ProjectSnapshotMeta[]>;
  createSnapshot: (
    projectDir: string,
    project: ProjectData,
    label: string,
    kind: ProjectSnapshotMeta['kind']
  ) => Promise<ProjectSnapshotMeta>;
  restoreSnapshot: (
    projectDir: string,
    snapshotId: string,
    currentProject?: ProjectData
  ) => Promise<ProjectData>;

  // Ren'Py Lint, Playtest, Live Mirror & Export
  runEngineCheck: (
    projectDir: string,
    project: ProjectData
  ) => Promise<{ ok: boolean; rawOutput: string; friendlyIssues: ProjectIssue[] }>;
  startPlaytest: (options: {
    projectDir: string;
    project: ProjectData;
    startSceneId?: string;
    mirrorMode?: boolean;
  }) => Promise<{ started: boolean; error?: string }>;
  stopPlaytest: () => Promise<void>;
  overrideLiveVar: (pyVarName: string, value: number | boolean | string) => Promise<void>;
  onLiveRenpyState: (cb: (state: LiveRenpyState) => void) => () => void;
  getExportTargets: () => Promise<ExportTargetStatus[]>;
  exportGame: (options: {
    projectDir: string;
    outputDir: string;
    target: ExportTargetStatus['target'];
  }) => Promise<ExportResult>;
  launchExportedExe: (
    exePath: string,
    verifyOnlyMs?: number
  ) => Promise<{ launched: boolean; pid?: number; error?: string }>;

  // Built-in AI Creative Assistant
  getAiSettings: () => Promise<AiSettings>;
  saveAiSettings: (input: {
    provider: AiProviderPreset;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  }) => Promise<AiSettings>;
  sendAiPrompt: (options: {
    projectDir: string;
    project: ProjectData;
    userPrompt: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    context: AiEditorContext;
  }) => Promise<{
    reply: string;
    reasoning: string;
    reasoningDurationSec: number;
    operations: AiOperationRecord[];
    updatedProject: ProjectData;
    projectMutated: boolean;
    snapshotIdBefore: string;
  }>;
  onAiStreamEvent: (
    cb: (evt: {
      type: 'reasoning' | 'content' | 'operation';
      delta?: string;
      operation?: AiOperationRecord;
    }) => void
  ) => () => void;

  // Built-in Offline ASR
  transcribePcm: (options: {
    samples: number[];
    sampleRate: number;
    projectDir?: string;
    saveFileName?: string;
  }) => Promise<{ text: string; savedAsset?: AssetEntry }>;
  transcribeWavFile: (options: {
    filePath: string;
  }) => Promise<{ text: string; durationSec: number }>;

  // Cross-Project Reuse Library
  listReuseItems: () => Promise<ReuseLibraryItem[]>;
  saveToReuseLibrary: (options: {
    kind: ReuseItemKind;
    name: string;
    description?: string;
    project: ProjectData;
    sourceId: string;
    blockIds?: string[];
  }) => Promise<ReuseLibraryItem>;
  importFromReuseLibrary: (options: {
    itemId: string;
    project: ProjectData;
    targetSceneId?: string;
  }) => Promise<{ updatedProject: ProjectData; summary: string; cleanedAssetRefs: number }>;
  deleteReuseItem: (itemId: string) => Promise<ReuseLibraryItem[]>;

  // Opt-in Advanced Mode
  listAdvancedFiles: (projectDir: string) => Promise<AdvancedFileEntry[]>;
  readAdvancedFile: (projectDir: string, relativePath: string) => Promise<string>;
  writeAdvancedFile: (
    projectDir: string,
    relativePath: string,
    content: string
  ) => Promise<void>;
}

declare global {
  interface Window {
    guie: GuieBridgeApi;
  }
}
