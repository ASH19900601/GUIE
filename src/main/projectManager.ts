/**
 * Project Manager: Creation, Loading, Atomic Save Queue, CJK Font Auto-Upgrade,
 * Asset Ingestion & Missing Detection, Snapshots (Cross-Restart), and Advanced File Tree.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  AdvancedFileEntry,
  AssetCategory,
  AssetEntry,
  ProjectData,
  ProjectSnapshotMeta,
  RecentProjectItem,
  SnapshotPreviewData,
} from '../shared/types';
import { createDefaultAppearance, createId, createNewProjectData, inferAssetCategory } from '../shared/defaults';
import { compileProjectToRenpy, getBundledFontRelativePath } from './renpyCompiler';
import { clearReadOnlyRecursive, resolveRuntimePaths } from './runtimePaths';

const PROJECT_JSON_FILE = 'guie.project.json';
const SNAPSHOTS_SUBDIR = path.join('.guie', 'snapshots');
const MAX_AUTO_SNAPSHOTS = 40;

const GUI_MANAGED_RPY_FILES = new Set([
  'game/options.rpy',
  'game/gui.rpy',
  'game/screens.rpy',
  'game/guie_definitions.rpy',
  'game/guie_extensions.rpy',
  'game/script.rpy',
]);

export function getAppUserDataDir(): string {
  const appData = process.env.APPDATA || path.join(os.homedir(), '.config');
  const dir = path.join(appData, 'GUIEStudio');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRecentProjectsFilePath(): string {
  return path.join(getAppUserDataDir(), 'recent-projects.json');
}

export function loadRecentProjects(): RecentProjectItem[] {
  const file = getRecentProjectsFilePath();
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item.path === 'string' && fs.existsSync(item.path));
  } catch {
    return [];
  }
}

export function recordRecentProject(projectDir: string, project: ProjectData): RecentProjectItem[] {
  const existing = loadRecentProjects().filter(
    (item) => path.resolve(item.path).toLowerCase() !== path.resolve(projectDir).toLowerCase()
  );
  const entry: RecentProjectItem = {
    path: path.resolve(projectDir),
    title: project.meta.title,
    updatedAt: new Date().toISOString(),
    sceneCount: project.scenes.length,
    characterCount: project.characters.length,
  };
  const next = [entry, ...existing].slice(0, 15);
  atomicWriteText(getRecentProjectsFilePath(), JSON.stringify(next, null, 2));
  return next;
}

export function removeRecentProject(projectDir: string): RecentProjectItem[] {
  const next = loadRecentProjects().filter(
    (item) => path.resolve(item.path).toLowerCase() !== path.resolve(projectDir).toLowerCase()
  );
  atomicWriteText(getRecentProjectsFilePath(), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Atomic file write (write temp file in same directory + rename) to prevent partial/corrupted files.
 */
export function atomicWriteText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.chmodSync(tmpPath, 0o666);
  } catch {}
  try {
    if (fs.existsSync(filePath)) {
      try {
        fs.chmodSync(filePath, 0o666);
      } catch {}
    }
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Windows fallback if rename races with antivirus scanner
    fs.copyFileSync(tmpPath, filePath);
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {}
  }
}

/**
 * Copies bundled open-source CJK font into `game/fonts/SourceHanSansLite.ttf` if missing.
 */
export function ensureProjectCjkFont(projectDir: string, project: ProjectData): boolean {
  const { bundledCjkFontPath } = resolveRuntimePaths();
  const destRel = getBundledFontRelativePath();
  const destFull = path.join(projectDir, destRel);
  fs.mkdirSync(path.dirname(destFull), { recursive: true });

  if (!fs.existsSync(destFull) && bundledCjkFontPath && fs.existsSync(bundledCjkFontPath)) {
    fs.copyFileSync(bundledCjkFontPath, destFull);
    try {
      fs.chmodSync(destFull, 0o666);
    } catch {}
  }

  // Auto-upgrade legacy projects that lacked a CJK font WITHOUT overwriting custom user fonts!
  let upgraded = false;
  if (!project.appearance.font.globalFontAssetId) {
    const cur = project.appearance.font.bundledCjkFont || '';
    if (!cur || cur.toLowerCase().includes('dejavusans')) {
      project.appearance.font.bundledCjkFont = 'fonts/SourceHanSansLite.ttf';
      project.meta.cjkFontAutoUpgraded = true;
      upgraded = true;
    }
  }
  return upgraded;
}

/**
 * Creates a brand-new, immediately runnable Ren'Py project directory.
 */
export function createProject(options: {
  parentDir: string;
  folderName?: string;
  title: string;
  author?: string;
  width?: number;
  height?: number;
  withStarterContent?: boolean;
}): { projectDir: string; project: ProjectData } {
  const safeFolder =
    (options.folderName || options.title)
      .trim()
      .replace(/[<>:"/\\|?*]+/g, '_')
      .slice(0, 60) || `guie_project_${Date.now()}`;
  let projectDir = path.join(options.parentDir, safeFolder);
  if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
    projectDir = `${projectDir}_${Date.now().toString(36)}`;
  }

  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'background'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'sprite'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'bgm'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'se'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'voice'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'video'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'font'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'game', 'assets', 'ui'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, SNAPSHOTS_SUBDIR), { recursive: true });

  const project = createNewProjectData({
    title: options.title,
    author: options.author,
    width: options.width,
    height: options.height,
    withStarterContent: options.withStarterContent,
  });

  ensureProjectCjkFont(projectDir, project);
  saveProjectSync(projectDir, project);
  clearReadOnlyRecursive(projectDir);
  createSnapshot(projectDir, project, '初始创建版本', 'milestone');
  recordRecentProject(projectDir, project);
  return { projectDir, project };
}

/**
 * Opens an existing GUIE project (or gracefully upgrades an existing raw Ren'Py folder!).
 */
export function openProject(projectDir: string): {
  projectDir: string;
  project: ProjectData;
  upgradedCjkFont: boolean;
} {
  const resolved = path.resolve(projectDir);
  if (!fs.existsSync(resolved)) {
    throw new Error(`项目目录不存在：${resolved}`);
  }
  clearReadOnlyRecursive(resolved);

  const jsonPath = path.join(resolved, PROJECT_JSON_FILE);
  let project: ProjectData;
  if (fs.existsSync(jsonPath)) {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Partial<ProjectData>;
    const defaults = createNewProjectData({ title: raw.meta?.title || path.basename(resolved) });
    project = {
      ...defaults,
      ...raw,
      meta: { ...defaults.meta, ...raw.meta },
      appearance: {
        ...createDefaultAppearance(raw.meta?.title || path.basename(resolved)),
        ...raw.appearance,
        theme: { ...defaults.appearance.theme, ...raw.appearance?.theme },
        font: { ...defaults.appearance.font, ...raw.appearance?.font },
        dialogueBox: { ...defaults.appearance.dialogueBox, ...raw.appearance?.dialogueBox },
        buttons: { ...defaults.appearance.buttons, ...raw.appearance?.buttons },
        window: { ...defaults.appearance.window, ...raw.appearance?.window },
      },
      extensions: {
        ...defaults.extensions,
        ...raw.extensions,
      },
      localization: {
        ...defaults.localization,
        ...raw.localization,
      },
      flowLayout: {
        ...defaults.flowLayout,
        ...raw.flowLayout,
      },
    };
  } else {
    // Open an older / raw Ren'Py project cleanly without breaking custom scripts
    project = createNewProjectData({ title: path.basename(resolved) });
  }

  const upgradedCjkFont = ensureProjectCjkFont(resolved, project);
  if (upgradedCjkFont) {
    saveProjectSync(resolved, project);
  }
  recordRecentProject(resolved, project);
  return { projectDir: resolved, project, upgradedCjkFont };
}

/**
 * Serialized Per-Project Save Queue
 * Ensures rapid consecutive edits NEVER race or allow an earlier save to overwrite a newer one!
 */
const saveChains = new Map<string, Promise<void>>();
const latestSeqByDir = new Map<string, number>();

export function saveProjectSync(projectDir: string, project: ProjectData): void {
  const resolved = path.resolve(projectDir);
  project.meta.updatedAt = new Date().toISOString();

  ensureProjectCjkFont(resolved, project);

  // 1. Write canonical project JSON atomically
  atomicWriteText(path.join(resolved, PROJECT_JSON_FILE), JSON.stringify(project, null, 2));

  // 2. Compile & write all GUI-managed Ren'Py scripts atomically (NEVER touching custom_*.rpy)
  const compiled = compileProjectToRenpy(project);
  for (const [relPath, content] of Object.entries(compiled)) {
    const absPath = path.join(resolved, relPath);
    atomicWriteText(absPath, content);
  }
}

export function enqueueProjectSave(
  projectDir: string,
  project: ProjectData,
  clientRevision?: number
): Promise<{ savedAt: string; revision: number }> {
  const key = path.resolve(projectDir).toLowerCase();
  const nextSeq = (latestSeqByDir.get(key) ?? 0) + 1;
  const rev = clientRevision ?? nextSeq;
  latestSeqByDir.set(key, Math.max(latestSeqByDir.get(key) ?? 0, rev));

  // Clone snapshot immediately so further mutations don't tear the serialized payload
  const payloadClone: ProjectData = structuredClone(project);

  const prev = saveChains.get(key) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      // Skip stale queued write if a strictly newer revision is already queued
      const newest = latestSeqByDir.get(key) ?? rev;
      if (rev < newest) return;
      saveProjectSync(projectDir, payloadClone);
      recordRecentProject(projectDir, payloadClone);
    });

  saveChains.set(key, next);
  return next.then(() => ({ savedAt: new Date().toISOString(), revision: rev }));
}

export async function flushProjectSaves(projectDir: string): Promise<void> {
  const key = path.resolve(projectDir).toLowerCase();
  const pending = saveChains.get(key);
  if (pending) await pending;
}

// ==========================================
// Asset Import, Replace & Missing Check
// ==========================================

function guessMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
  };
  return map[ext] || 'application/octet-stream';
}

export function importAssetFiles(
  projectDir: string,
  sourcePaths: string[],
  forcedCategory?: AssetCategory
): AssetEntry[] {
  const added: AssetEntry[] = [];
  for (const src of sourcePaths) {
    if (!fs.existsSync(src)) continue;
    const origName = path.basename(src);
    const category = forcedCategory ?? inferAssetCategory(origName);
    const ext = path.extname(origName).toLowerCase();
    const baseNoExt = path.basename(origName, ext);
    const safeBase = baseNoExt.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_').slice(0, 48) || 'asset';
    const uniqueFile = `${safeBase}_${Date.now().toString(36).slice(-4)}${ext}`;
    const relPath = path.posix.join('game', 'assets', category, uniqueFile);
    const destFull = path.join(projectDir, relPath);

    fs.mkdirSync(path.dirname(destFull), { recursive: true });
    fs.copyFileSync(src, destFull);
    try {
      fs.chmodSync(destFull, 0o666);
    } catch {}
    const stat = fs.statSync(destFull);

    added.push({
      id: createId('ast'),
      name: baseNoExt,
      category,
      relativePath: relPath,
      originalName: origName,
      mimeType: guessMimeType(origName),
      sizeBytes: stat.size,
      isCg: category === 'background' && origName.toLowerCase().includes('cg'),
      createdAt: new Date().toISOString(),
    });
  }
  return added;
}

export function findMissingAssetIds(projectDir: string, project: ProjectData): string[] {
  const missing: string[] = [];
  for (const asset of project.assets) {
    const abs = path.join(projectDir, asset.relativePath);
    if (!fs.existsSync(abs)) {
      missing.push(asset.id);
    }
  }
  return missing;
}

// ==========================================
// Cross-Restart Project Snapshots
// ==========================================

interface SnapshotFilePayload {
  meta: ProjectSnapshotMeta;
  project: ProjectData;
  customFiles: Record<string, string>; // Also preserves custom_*.rpy files!
}

function readAllCustomRpyFiles(projectDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const gameDir = path.join(projectDir, 'game');
  if (!fs.existsSync(gameDir)) return out;
  for (const entry of fs.readdirSync(gameDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith('custom_') && entry.name.endsWith('.rpy')) {
      out[`game/${entry.name}`] = fs.readFileSync(path.join(gameDir, entry.name), 'utf8');
    }
  }
  return out;
}

export function createSnapshot(
  projectDir: string,
  project: ProjectData,
  label: string,
  kind: ProjectSnapshotMeta['kind']
): ProjectSnapshotMeta {
  const dir = path.join(projectDir, SNAPSHOTS_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  const id = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const blockCount = project.scenes.reduce((acc, s) => acc + s.blocks.length, 0);
  const meta: ProjectSnapshotMeta = {
    id,
    label,
    kind,
    createdAt: new Date().toISOString(),
    sceneCount: project.scenes.length,
    blockCount,
  };
  const payload: SnapshotFilePayload = {
    meta,
    project: structuredClone(project),
    customFiles: readAllCustomRpyFiles(projectDir),
  };
  atomicWriteText(path.join(dir, `${id}.json`), JSON.stringify(payload));

  // Prune old auto snapshots only (never delete milestones/manual)
  if (kind === 'auto') {
    const all = listSnapshots(projectDir).filter((s) => s.kind === 'auto');
    if (all.length > MAX_AUTO_SNAPSHOTS) {
      for (const old of all.slice(MAX_AUTO_SNAPSHOTS)) {
        try {
          fs.rmSync(path.join(dir, `${old.id}.json`), { force: true });
        } catch {}
      }
    }
  }
  return meta;
}

export function listSnapshots(projectDir: string): ProjectSnapshotMeta[] {
  const dir = path.join(projectDir, SNAPSHOTS_SUBDIR);
  if (!fs.existsSync(dir)) return [];
  const items: ProjectSnapshotMeta[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as SnapshotFilePayload;
      if (parsed.meta) items.push(parsed.meta);
    } catch {}
  }
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function previewSnapshot(
  projectDir: string,
  snapshotId: string
): SnapshotPreviewData {
  const file = path.join(projectDir, SNAPSHOTS_SUBDIR, `${snapshotId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error('找不到指定的历史版本快照。');
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SnapshotFilePayload;
  const proj = parsed.project;
  return {
    meta: parsed.meta,
    title: proj.meta.title,
    chapters: proj.chapters.map((c) => ({ id: c.id, name: c.name, disabled: c.disabled })),
    scenes: proj.scenes.map((s) => {
      const firstDlg = s.blocks.find((b) => b.type === 'dialogue' && b.text.trim());
      return {
        id: s.id,
        name: s.name,
        blockCount: s.blocks.length,
        sampleLine: firstDlg && firstDlg.type === 'dialogue' ? firstDlg.text.slice(0, 60) : undefined,
      };
    }),
    characters: proj.characters.map((c) => ({
      id: c.id,
      name: c.name,
      expressionCount: c.expressions.length,
    })),
    variableCount: proj.variables.length,
    assetCount: proj.assets.length,
    customFileCount: Object.keys(parsed.customFiles || {}).length,
  };
}

export function restoreSnapshot(
  projectDir: string,
  snapshotId: string,
  currentProject?: ProjectData
): ProjectData {
  const file = path.join(projectDir, SNAPSHOTS_SUBDIR, `${snapshotId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error('找不到指定的历史版本快照。');
  }
  // Protect current state before restoring (Req 5.2)
  if (currentProject) {
    createSnapshot(projectDir, currentProject, '回退前自动保护快照', 'milestone');
  }

  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SnapshotFilePayload;

  // Restore custom_*.rpy files cleanly
  const gameDir = path.join(projectDir, 'game');
  if (fs.existsSync(gameDir)) {
    for (const entry of fs.readdirSync(gameDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.startsWith('custom_') && entry.name.endsWith('.rpy')) {
        if (!parsed.customFiles[`game/${entry.name}`]) {
          fs.rmSync(path.join(gameDir, entry.name), { force: true });
        }
      }
    }
  }
  for (const [rel, content] of Object.entries(parsed.customFiles || {})) {
    atomicWriteText(path.join(projectDir, rel), content);
  }

  saveProjectSync(projectDir, parsed.project);
  return parsed.project;
}

// ==========================================
// Advanced Mode File Tree Operations
// ==========================================

export function listAdvancedProjectFiles(projectDir: string): AdvancedFileEntry[] {
  const gameDir = path.join(projectDir, 'game');
  if (!fs.existsSync(gameDir)) return [];
  const results: AdvancedFileEntry[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'cache' || entry.name === '_guie_bridge.rpy') {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'assets' || entry.name === 'fonts' || entry.name === 'saves') continue;
        walk(full);
      } else if (entry.name.endsWith('.rpy') || entry.name.endsWith('.json')) {
        const rel = path.relative(projectDir, full).replace(/\\/g, '/');
        const stat = fs.statSync(full);
        results.push({
          relativePath: rel,
          name: entry.name,
          size: stat.size,
          isManagedByGui: GUI_MANAGED_RPY_FILES.has(rel),
        });
      }
    }
  };
  walk(gameDir);
  return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function readAdvancedProjectFile(projectDir: string, relativePath: string): string {
  const full = path.resolve(projectDir, relativePath);
  if (!full.startsWith(path.resolve(projectDir))) {
    throw new Error('非法文件路径访问。');
  }
  return fs.readFileSync(full, 'utf8');
}

export function writeAdvancedProjectFile(
  projectDir: string,
  relativePath: string,
  content: string
): void {
  const full = path.resolve(projectDir, relativePath);
  if (!full.startsWith(path.resolve(projectDir))) {
    throw new Error('非法文件路径写入。');
  }
  atomicWriteText(full, content);
}
