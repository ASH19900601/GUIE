import { create } from 'zustand';
import type {
  AiChatMessage,
  AiOperationRecord,
  AiSettings,
  AppMode,
  LiveRenpyState,
  ProjectData,
  ProjectSnapshotMeta,
  RecentProjectItem,
  SaveStatus,
  StoryViewMode,
  WorkspaceTab,
} from '@shared/types';
import { createId } from '@shared/defaults';

export interface ToastNotice {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

interface RuntimeInfo {
  renpyReady: boolean;
  cjkFontReady: boolean;
  asrReady: boolean;
  asrModelType?: string;
  defaultProjectsDir: string;
}

// Draft flush callbacks registered by active inputs (guarantees zero lost keystrokes before switching!)
const draftFlushers = new Set<() => void>();
export function registerDraftFlusher(fn: () => void): () => void {
  draftFlushers.add(fn);
  return () => draftFlushers.delete(fn);
}

let debounceSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autoSnapshotInterval: ReturnType<typeof setInterval> | null = null;

interface AppState {
  // Runtime & Home
  runtimeInfo: RuntimeInfo | null;
  recentProjects: RecentProjectItem[];

  // Open Project
  projectDir: string | null;
  project: ProjectData | null;
  missingAssetIds: string[];

  // Navigation & Mode
  mode: AppMode;
  activeTab: WorkspaceTab;
  storyViewMode: StoryViewMode;
  activeSceneId: string | null;
  selectedBlockId: string | null;
  selectedCharacterId: string | null;
  selectedAssetId: string | null;
  editingChoiceTarget: { sceneId: string; blockId: string; optionId: string } | null;

  // Save Safety & Global Undo/Redo
  saveStatus: SaveStatus;
  saveRevision: number;
  lastSavedAt: string | null;
  unsavedDraftKeys: Record<string, boolean>;
  undoStack: ProjectData[];
  redoStack: ProjectData[];

  // Snapshots Modal
  snapshotsOpen: boolean;
  snapshots: ProjectSnapshotMeta[];

  // Live Ren'Py Playtest & Mirror
  liveRenpy: LiveRenpyState;
  previewOverrides: Record<string, number | boolean | string>;

  // Built-in AI Drawer
  aiDrawerOpen: boolean;
  aiSettings: AiSettings | null;
  aiMessages: AiChatMessage[];
  aiBusy: boolean;
  aiStreamingReasoning: string;
  aiStreamingContent: string;
  aiStreamingOps: AiOperationRecord[];

  // Offline ASR Modal
  asrModalOpen: boolean;

  // Toasts
  toasts: ToastNotice[];

  // Actions
  initApp: () => Promise<void>;
  refreshRecentProjects: () => Promise<void>;
  createNewProject: (opts: {
    parentDir: string;
    title: string;
    author?: string;
    width?: number;
    height?: number;
    withStarterContent?: boolean;
  }) => Promise<void>;
  openExistingProject: (projectDir: string) => Promise<void>;
  closeProjectToHome: () => Promise<void>;

  // Safe Navigation (ALWAYS flushes pending saves first!)
  setActiveTab: (tab: WorkspaceTab) => Promise<void>;
  setMode: (mode: AppMode) => Promise<void>;
  setActiveSceneId: (sceneId: string | null, focusBlockId?: string | null) => Promise<void>;
  setStoryViewMode: (mode: StoryViewMode) => void;
  setSelectedBlockId: (blockId: string | null) => void;
  setSelectedCharacterId: (characterId: string | null) => void;
  setSelectedAssetId: (assetId: string | null) => void;
  openChoiceOptionEditor: (sceneId: string, blockId: string, optionId: string) => Promise<void>;
  clearChoiceOptionEditor: () => void;

  // Data Mutation, Draft Tracking & Save Barrier
  markDraftDirty: (key: string, dirty: boolean) => void;
  mutateProject: (
    updater: (draft: ProjectData) => void,
    options?: { skipUndo?: boolean; immediateSave?: boolean; milestoneLabel?: string }
  ) => void;
  replaceProjectState: (nextProject: ProjectData, pushUndo?: boolean) => Promise<void>;
  flushPendingSaves: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  refreshMissingAssets: () => Promise<void>;

  // Snapshots
  setSnapshotsOpen: (open: boolean) => Promise<void>;
  createManualSnapshot: (label: string) => Promise<void>;
  restoreProjectSnapshot: (snapshotId: string) => Promise<void>;

  // Playtest & Live Mirror
  startPlaytest: (opts?: { fromCurrentScene?: boolean; mirrorMode?: boolean }) => Promise<void>;
  stopPlaytest: () => Promise<void>;
  setPreviewOverride: (varId: string, val: number | boolean | string) => void;
  resetPreviewOverrides: () => void;

  // AI Drawer
  setAiDrawerOpen: (open: boolean) => void;
  refreshAiSettings: () => Promise<void>;
  updateAiSettings: (input: {
    provider: AiSettings['provider'];
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  }) => Promise<void>;
  sendAiMessage: (prompt: string) => Promise<void>;
  undoAiMessage: (snapshotId: string) => Promise<void>;

  // ASR Modal
  setAsrModalOpen: (open: boolean) => void;

  // Toast
  pushToast: (kind: ToastNotice['kind'], message: string) => void;
  dismissToast: (id: string) => void;
}

const MAX_UNDO_DEPTH = 60;

export const useAppStore = create<AppState>((set, get) => ({
  runtimeInfo: null,
  recentProjects: [],
  projectDir: null,
  project: null,
  missingAssetIds: [],
  mode: 'creator',
  activeTab: 'story',
  storyViewMode: 'cards',
  activeSceneId: null,
  selectedBlockId: null,
  selectedCharacterId: null,
  selectedAssetId: null,
  editingChoiceTarget: null,

  saveStatus: 'saved',
  saveRevision: 0,
  lastSavedAt: null,
  unsavedDraftKeys: {},
  undoStack: [],
  redoStack: [],

  snapshotsOpen: false,
  snapshots: [],

  liveRenpy: {
    running: false,
    mirrorActive: false,
    currentSceneId: null,
    currentBlockId: null,
    variables: {},
    callStack: [],
    frameDataUrl: null,
    revision: 0,
  },
  previewOverrides: {},

  aiDrawerOpen: false,
  aiSettings: null,
  aiMessages: [],
  aiBusy: false,
  aiStreamingReasoning: '',
  aiStreamingContent: '',
  aiStreamingOps: [],

  asrModalOpen: false,
  toasts: [],

  initApp: async () => {
    const [runtimeInfo, recentProjects, aiSettings] = await Promise.all([
      window.guie.getRuntimeInfo(),
      window.guie.listRecentProjects(),
      window.guie.getAiSettings(),
    ]);
    set({ runtimeInfo, recentProjects, aiSettings });

    // Subscribe to Live Ren'Py mirror state
    window.guie.onLiveRenpyState((liveRenpy) => {
      set({ liveRenpy });
    });

    // Subscribe to AI stream events
    window.guie.onAiStreamEvent((evt) => {
      if (evt.type === 'reasoning' && evt.delta) {
        set((s) => ({ aiStreamingReasoning: s.aiStreamingReasoning + evt.delta }));
      } else if (evt.type === 'content' && evt.delta) {
        set((s) => ({ aiStreamingContent: s.aiStreamingContent + evt.delta }));
      } else if (evt.type === 'operation' && evt.operation) {
        set((s) => {
          const ops = [...s.aiStreamingOps];
          const idx = ops.findIndex((o) => o.id === evt.operation!.id);
          if (idx >= 0) ops[idx] = evt.operation!;
          else ops.push(evt.operation!);
          return { aiStreamingOps: ops };
        });
      }
    });
  },

  refreshRecentProjects: async () => {
    const recentProjects = await window.guie.listRecentProjects();
    set({ recentProjects });
  },

  createNewProject: async (opts) => {
    const { projectDir, project } = await window.guie.createProject(opts);
    startAutoSnapshotLoop(get);
    const [recentProjects, snapshots] = await Promise.all([
      window.guie.listRecentProjects(),
      window.guie.listSnapshots(projectDir),
    ]);
    set({
      projectDir,
      project,
      recentProjects,
      snapshots,
      missingAssetIds: [],
      mode: 'creator',
      activeTab: 'story',
      storyViewMode: 'cards',
      activeSceneId: project.meta.startSceneId,
      selectedBlockId: project.scenes[0]?.blocks[0]?.id ?? null,
      selectedCharacterId: project.characters[0]?.id ?? null,
      selectedAssetId: null,
      saveStatus: 'saved',
      saveRevision: 1,
      lastSavedAt: new Date().toISOString(),
      unsavedDraftKeys: {},
      undoStack: [],
      redoStack: [],
      aiMessages: [],
      previewOverrides: {},
    });
    get().pushToast('success', `已创建新游戏「${project.meta.title}」，内置中日韩多语言字体已就绪。`);
  },

  openExistingProject: async (projectDir) => {
    const { projectDir: resolvedDir, project, upgradedCjkFont } = await window.guie.openProject(
      projectDir
    );
    startAutoSnapshotLoop(get);
    const [recentProjects, missingAssetIds, snapshots] = await Promise.all([
      window.guie.listRecentProjects(),
      window.guie.checkMissingAssets(resolvedDir, project),
      window.guie.listSnapshots(resolvedDir),
    ]);
    const startScene =
      project.scenes.find((s) => s.id === project.meta.startSceneId) ?? project.scenes[0];
    set({
      projectDir: resolvedDir,
      project,
      recentProjects,
      missingAssetIds,
      snapshots,
      mode: 'creator',
      activeTab: 'story',
      storyViewMode: 'cards',
      activeSceneId: startScene?.id ?? null,
      selectedBlockId: startScene?.blocks[0]?.id ?? null,
      selectedCharacterId: project.characters[0]?.id ?? null,
      selectedAssetId: project.assets[0]?.id ?? null,
      saveStatus: 'saved',
      saveRevision: 1,
      lastSavedAt: new Date().toISOString(),
      unsavedDraftKeys: {},
      undoStack: [],
      redoStack: [],
      aiMessages: [],
      previewOverrides: {},
    });
    if (upgradedCjkFont) {
      get().pushToast('info', '已自动为旧项目升级支持中日韩文字的开源字体，未覆盖自定义字体。');
    } else {
      get().pushToast('success', `已打开项目「${project.meta.title}」`);
    }
  },

  closeProjectToHome: async () => {
    await get().flushPendingSaves();
    await window.guie.stopPlaytest();
    if (autoSnapshotInterval) {
      clearInterval(autoSnapshotInterval);
      autoSnapshotInterval = null;
    }
    const recentProjects = await window.guie.listRecentProjects();
    set({
      projectDir: null,
      project: null,
      recentProjects,
      activeSceneId: null,
      selectedBlockId: null,
      undoStack: [],
      redoStack: [],
      saveStatus: 'saved',
      unsavedDraftKeys: {},
      aiDrawerOpen: false,
      snapshotsOpen: false,
    });
  },

  setActiveTab: async (tab) => {
    await get().flushPendingSaves();
    set({ activeTab: tab });
    // Requirement 6.2: Auto scroll main workspace back to top on every nav switch!
    requestAnimationFrame(() => {
      const container = document.getElementById('guie-main-scroll');
      if (container) container.scrollTop = 0;
    });
  },

  setMode: async (mode) => {
    await get().flushPendingSaves();
    // When returning from Advanced Mode to Creator Mode, reload cleanly from disk if needed
    const dir = get().projectDir;
    if (mode === 'creator' && dir) {
      try {
        const reopened = await window.guie.openProject(dir);
        set({ project: reopened.project, mode });
        return;
      } catch {}
    }
    set({ mode });
  },

  setActiveSceneId: async (sceneId, focusBlockId) => {
    await get().flushPendingSaves();
    const proj = get().project;
    const sc = proj?.scenes.find((s) => s.id === sceneId);
    set({
      activeSceneId: sceneId,
      selectedBlockId: focusBlockId !== undefined ? focusBlockId : (sc?.blocks[0]?.id ?? null),
    });
  },

  setStoryViewMode: (storyViewMode) => set({ storyViewMode }),
  setSelectedBlockId: (selectedBlockId) => set({ selectedBlockId }),
  setSelectedCharacterId: (selectedCharacterId) => set({ selectedCharacterId }),
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),

  openChoiceOptionEditor: async (sceneId, blockId, optionId) => {
    await get().flushPendingSaves();
    set({
      activeTab: 'story',
      activeSceneId: sceneId,
      selectedBlockId: blockId,
      editingChoiceTarget: { sceneId, blockId, optionId },
    });
  },
  clearChoiceOptionEditor: () => set({ editingChoiceTarget: null }),

  markDraftDirty: (key, dirty) => {
    set((s) => {
      const next = { ...s.unsavedDraftKeys };
      if (dirty) next[key] = true;
      else delete next[key];
      const hasDrafts = Object.keys(next).length > 0;
      return {
        unsavedDraftKeys: next,
        saveStatus: hasDrafts ? 'dirty' : s.saveStatus === 'saving' ? 'saving' : s.saveStatus,
      };
    });
  },

  mutateProject: (updater, options) => {
    const state = get();
    if (!state.project || !state.projectDir) return;
    const before = structuredClone(state.project);
    const next = structuredClone(state.project);
    updater(next);

    const nextRev = state.saveRevision + 1;
    const undoStack = options?.skipUndo
      ? state.undoStack
      : [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), before];

    if (options?.milestoneLabel && state.projectDir) {
      void window.guie.createSnapshot(state.projectDir, before, options.milestoneLabel, 'milestone');
    }

    set({
      project: next,
      saveRevision: nextRev,
      saveStatus: 'dirty',
      undoStack,
      redoStack: options?.skipUndo ? state.redoStack : [],
    });

    if (debounceSaveTimer) clearTimeout(debounceSaveTimer);
    if (options?.immediateSave) {
      void get().flushPendingSaves();
    } else {
      debounceSaveTimer = setTimeout(() => {
        void get().flushPendingSaves();
      }, 450);
    }
  },

  replaceProjectState: async (nextProject, pushUndo = true) => {
    const state = get();
    if (!state.projectDir) return;
    const undoStack =
      pushUndo && state.project
        ? [...state.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), structuredClone(state.project)]
        : state.undoStack;
    const nextRev = state.saveRevision + 1;
    set({
      project: nextProject,
      saveRevision: nextRev,
      saveStatus: 'saving',
      undoStack,
      redoStack: pushUndo ? [] : state.redoStack,
    });
    const res = await window.guie.saveProject(state.projectDir, nextProject, nextRev);
    const missingAssetIds = await window.guie.checkMissingAssets(state.projectDir, nextProject);
    set((s) => ({
      missingAssetIds,
      lastSavedAt: res.savedAt,
      saveStatus:
        s.saveRevision === nextRev && Object.keys(s.unsavedDraftKeys).length === 0
          ? 'saved'
          : 'dirty',
    }));
  },

  flushPendingSaves: async () => {
    // 1. Force every mounted input with local draft state to commit into Zustand first!
    for (const flusher of [...draftFlushers]) {
      try {
        flusher();
      } catch {}
    }

    if (debounceSaveTimer) {
      clearTimeout(debounceSaveTimer);
      debounceSaveTimer = null;
    }

    const state = get();
    if (!state.project || !state.projectDir) return;

    const revToSave = state.saveRevision;
    const snap = structuredClone(state.project);
    set({ saveStatus: 'saving', unsavedDraftKeys: {} });

    try {
      const res = await window.guie.saveProject(state.projectDir, snap, revToSave);
      await window.guie.flushSaves(state.projectDir);
      set((s) => ({
        lastSavedAt: res.savedAt,
        saveStatus:
          s.saveRevision === revToSave && Object.keys(s.unsavedDraftKeys).length === 0
            ? 'saved'
            : 'dirty',
      }));
    } catch {
      set({ saveStatus: 'error' });
      get().pushToast('error', '自动保存时遇到写入错误，请检查磁盘权限或空间。');
    }
  },

  undo: async () => {
    await get().flushPendingSaves();
    const state = get();
    if (!state.project || !state.projectDir || state.undoStack.length === 0) return;
    const prev = state.undoStack[state.undoStack.length - 1];
    const nextUndo = state.undoStack.slice(0, -1);
    const nextRedo = [...state.redoStack, structuredClone(state.project)];
    const nextRev = state.saveRevision + 1;
    set({
      project: prev,
      undoStack: nextUndo,
      redoStack: nextRedo,
      saveRevision: nextRev,
      saveStatus: 'saving',
    });
    const res = await window.guie.saveProject(state.projectDir, prev, nextRev);
    set({ saveStatus: 'saved', lastSavedAt: res.savedAt });
    get().pushToast('info', '已撤销上一步操作');
  },

  redo: async () => {
    await get().flushPendingSaves();
    const state = get();
    if (!state.project || !state.projectDir || state.redoStack.length === 0) return;
    const nextProj = state.redoStack[state.redoStack.length - 1];
    const nextRedo = state.redoStack.slice(0, -1);
    const nextUndo = [...state.undoStack, structuredClone(state.project)];
    const nextRev = state.saveRevision + 1;
    set({
      project: nextProj,
      undoStack: nextUndo,
      redoStack: nextRedo,
      saveRevision: nextRev,
      saveStatus: 'saving',
    });
    const res = await window.guie.saveProject(state.projectDir, nextProj, nextRev);
    set({ saveStatus: 'saved', lastSavedAt: res.savedAt });
    get().pushToast('info', '已重做操作');
  },

  refreshMissingAssets: async () => {
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    const missingAssetIds = await window.guie.checkMissingAssets(projectDir, project);
    set({ missingAssetIds });
  },

  setSnapshotsOpen: async (open) => {
    set({ snapshotsOpen: open });
    const dir = get().projectDir;
    if (open && dir) {
      const snapshots = await window.guie.listSnapshots(dir);
      set({ snapshots });
    }
  },

  createManualSnapshot: async (label) => {
    await get().flushPendingSaves();
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    await window.guie.createSnapshot(projectDir, project, label || '手动保存版本', 'manual');
    const snapshots = await window.guie.listSnapshots(projectDir);
    set({ snapshots });
    get().pushToast('success', `已创建历史版本「${label || '手动保存版本'}」`);
  },

  restoreProjectSnapshot: async (snapshotId) => {
    await get().flushPendingSaves();
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    const restored = await window.guie.restoreSnapshot(projectDir, snapshotId, project);
    const snapshots = await window.guie.listSnapshots(projectDir);
    set({
      project: restored,
      snapshots,
      activeSceneId: restored.scenes[0]?.id ?? null,
      selectedBlockId: restored.scenes[0]?.blocks[0]?.id ?? null,
      saveStatus: 'saved',
    });
    get().pushToast('success', '已成功回退到选定历史版本（回退前状态已自动备份）');
  },

  startPlaytest: async (opts) => {
    await get().flushPendingSaves();
    const { projectDir, project, activeSceneId } = get();
    if (!projectDir || !project) return;
    const startSceneId = opts?.fromCurrentScene && activeSceneId ? activeSceneId : undefined;
    const res = await window.guie.startPlaytest({
      projectDir,
      project,
      startSceneId,
      mirrorMode: opts?.mirrorMode,
    });
    if (!res.started) {
      get().pushToast('error', res.error || '启动试玩失败');
    } else {
      get().pushToast(
        'info',
        opts?.mirrorMode
          ? '已启动实机试玩并开启右侧画面同步镜像'
          : startSceneId
          ? '已从当前场景启动试玩'
          : '已从头启动试玩'
      );
    }
  },

  stopPlaytest: async () => {
    await window.guie.stopPlaytest();
    get().pushToast('info', '已停止试玩');
  },

  setPreviewOverride: (varId, val) => {
    set((s) => ({ previewOverrides: { ...s.previewOverrides, [varId]: val } }));
    const { liveRenpy, project } = get();
    if (liveRenpy.running && project) {
      const v = project.variables.find((item) => item.id === varId);
      if (v) {
        const py = `guie_v_${v.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
        void window.guie.overrideLiveVar(py, val);
      }
    }
  },
  resetPreviewOverrides: () => set({ previewOverrides: {} }),

  setAiDrawerOpen: (aiDrawerOpen) => set({ aiDrawerOpen }),

  refreshAiSettings: async () => {
    const aiSettings = await window.guie.getAiSettings();
    set({ aiSettings });
  },

  updateAiSettings: async (input) => {
    const aiSettings = await window.guie.saveAiSettings(input);
    set({ aiSettings });
    get().pushToast('success', 'AI 连接设置已加密保存，下次打开自动生效。');
  },

  sendAiMessage: async (prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    await get().flushPendingSaves();
    const state = get();
    if (!state.projectDir || !state.project || state.aiBusy) return;

    const userMsg: AiChatMessage = {
      id: createId('msg'),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const activeScene = state.project.scenes.find((s) => s.id === state.activeSceneId);
    const selBlk = activeScene?.blocks.find((b) => b.id === state.selectedBlockId);
    const selSummary =
      selBlk?.type === 'dialogue' ? selBlk.text.slice(0, 40) : selBlk?.type;

    set((s) => ({
      aiMessages: [...s.aiMessages, userMsg],
      aiBusy: true,
      aiStreamingReasoning: '',
      aiStreamingContent: '',
      aiStreamingOps: [],
    }));

    try {
      const history = get()
        .aiMessages.slice(0, -1)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await window.guie.sendAiPrompt({
        projectDir: state.projectDir,
        project: state.project,
        userPrompt: trimmed,
        history,
        context: {
          activeTab: state.activeTab,
          activeSceneId: state.activeSceneId,
          activeSceneName: activeScene?.name ?? null,
          selectedBlockId: state.selectedBlockId,
          selectedBlockSummary: selSummary ?? null,
        },
      });

      if (res.projectMutated) {
        const before = structuredClone(state.project);
        set((s) => ({
          project: res.updatedProject,
          undoStack: [...s.undoStack.slice(-(MAX_UNDO_DEPTH - 1)), before],
          redoStack: [],
          saveStatus: 'saved',
          lastSavedAt: new Date().toISOString(),
        }));
      }

      const assistantMsg: AiChatMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: res.reply,
        reasoning: res.reasoning || undefined,
        reasoningDurationSec: res.reasoning ? res.reasoningDurationSec : undefined,
        operations: res.operations,
        snapshotIdBefore: res.projectMutated ? res.snapshotIdBefore : undefined,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        aiMessages: [...s.aiMessages, assistantMsg],
        aiBusy: false,
        aiStreamingReasoning: '',
        aiStreamingContent: '',
        aiStreamingOps: [],
      }));
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      const assistantMsg: AiChatMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: '',
        error: errText,
        createdAt: new Date().toISOString(),
      };
      set((s) => ({
        aiMessages: [...s.aiMessages, assistantMsg],
        aiBusy: false,
        aiStreamingReasoning: '',
        aiStreamingContent: '',
        aiStreamingOps: [],
      }));
    }
  },

  undoAiMessage: async (snapshotId) => {
    await get().restoreProjectSnapshot(snapshotId);
  },

  setAsrModalOpen: (asrModalOpen) => set({ asrModalOpen }),

  pushToast: (kind, message) => {
    const id = createId('toast');
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 4000);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

function startAutoSnapshotLoop(get: () => AppState): void {
  if (autoSnapshotInterval) clearInterval(autoSnapshotInterval);
  // Requirement 5.2: Automatic snapshot every 2 minutes
  autoSnapshotInterval = setInterval(() => {
    const { projectDir, project } = get();
    if (!projectDir || !project) return;
    void window.guie.createSnapshot(projectDir, project, '定时自动快照', 'auto');
  }, 2 * 60 * 1000);
}
