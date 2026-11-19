/**
 * Cross-Project Reuse Library (Req 2.9)
 * Stores reusable Characters (with expression metadata), Chapters (with internal scene links),
 * Scenes, and Story Snippets in user AppData.
 * When importing into a target project:
 * - Automatically matches existing characters & story variables by name (or creates missing ones)
 * - Automatically strips dangling asset references that do not exist in the target project
 *   so imported content NEVER causes broken-asset errors!
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  Chapter,
  Character,
  ProjectData,
  ReuseItemKind,
  ReuseLibraryItem,
  Scene,
  StoryBlock,
  StoryVariable,
} from '../shared/types';
import { createId } from '../shared/defaults';
import { atomicWriteText, getAppUserDataDir } from './projectManager';

function getReuseLibraryFile(): string {
  return path.join(getAppUserDataDir(), 'reuse-library.json');
}

export function listReuseItems(): ReuseLibraryItem[] {
  const file = getReuseLibraryFile();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveReuseItems(items: ReuseLibraryItem[]): void {
  atomicWriteText(getReuseLibraryFile(), JSON.stringify(items, null, 2));
}

export function deleteReuseItem(itemId: string): ReuseLibraryItem[] {
  const next = listReuseItems().filter((i) => i.id !== itemId);
  saveReuseItems(next);
  return next;
}

interface CharacterReusePayload {
  character: Character;
}

interface ChapterReusePayload {
  chapter: Chapter;
  scenes: Scene[];
  referencedCharacters: Array<{ id: string; name: string; color: string }>;
  referencedVariables: StoryVariable[];
}

interface SceneReusePayload {
  scene: Scene;
  referencedCharacters: Array<{ id: string; name: string; color: string }>;
  referencedVariables: StoryVariable[];
}

interface SnippetReusePayload {
  blocks: StoryBlock[];
  referencedCharacters: Array<{ id: string; name: string; color: string }>;
  referencedVariables: StoryVariable[];
}

export function saveToReuseLibrary(options: {
  kind: ReuseItemKind;
  name: string;
  description?: string;
  project: ProjectData;
  sourceId: string; // characterId / chapterId / sceneId
  blockIds?: string[]; // for snippet
}): ReuseLibraryItem {
  const { kind, project, sourceId } = options;
  let payload: unknown;

  const refChars = project.characters.map((c) => ({ id: c.id, name: c.name, color: c.color }));
  const refVars = structuredClone(project.variables);

  if (kind === 'character') {
    const ch = project.characters.find((c) => c.id === sourceId);
    if (!ch) throw new Error('找不到要保存的角色。');
    payload = { character: structuredClone(ch) } satisfies CharacterReusePayload;
  } else if (kind === 'chapter') {
    const chapter = project.chapters.find((c) => c.id === sourceId);
    if (!chapter) throw new Error('找不到要保存的章节。');
    const scenes = project.scenes.filter((s) => s.chapterId === chapter.id);
    payload = {
      chapter: structuredClone(chapter),
      scenes: structuredClone(scenes),
      referencedCharacters: refChars,
      referencedVariables: refVars,
    } satisfies ChapterReusePayload;
  } else if (kind === 'scene') {
    const scene = project.scenes.find((s) => s.id === sourceId);
    if (!scene) throw new Error('找不到要保存的场景。');
    payload = {
      scene: structuredClone(scene),
      referencedCharacters: refChars,
      referencedVariables: refVars,
    } satisfies SceneReusePayload;
  } else {
    const scene = project.scenes.find((s) => s.id === sourceId);
    if (!scene) throw new Error('找不到片段所在场景。');
    const blocks = options.blockIds?.length
      ? scene.blocks.filter((b) => options.blockIds!.includes(b.id))
      : scene.blocks.slice(0, 10);
    payload = {
      blocks: structuredClone(blocks),
      referencedCharacters: refChars,
      referencedVariables: refVars,
    } satisfies SnippetReusePayload;
  }

  const item: ReuseLibraryItem = {
    id: createId('reuse'),
    kind,
    name: options.name.trim() || '未命名复用项',
    description: options.description?.trim() || '',
    createdAt: new Date().toISOString(),
    sourceProjectTitle: project.meta.title,
    payload,
  };

  const all = [item, ...listReuseItems()];
  saveReuseItems(all);
  return item;
}

export function importFromReuseLibrary(options: {
  itemId: string;
  project: ProjectData;
  targetSceneId?: string;
}): {
  updatedProject: ProjectData;
  summary: string;
  cleanedAssetRefs: number;
} {
  const item = listReuseItems().find((i) => i.id === options.itemId);
  if (!item) throw new Error('找不到指定的复用素材项。');

  const next: ProjectData = structuredClone(options.project);
  const existingAssetIds = new Set(next.assets.map((a) => a.id));
  let cleanedAssetRefs = 0;

  const sanitizeAsset = (assetId?: string | null): string | undefined => {
    if (!assetId) return undefined;
    if (existingAssetIds.has(assetId)) return assetId;
    cleanedAssetRefs += 1;
    return undefined;
  };

  const buildCharRemap = (
    refs: Array<{ id: string; name: string; color: string }>
  ): Map<string, string> => {
    const map = new Map<string, string>();
    for (const r of refs) {
      const existing = next.characters.find((c) => c.name === r.name);
      if (existing) {
        map.set(r.id, existing.id);
      } else {
        const created: Character = {
          id: createId('ch'),
          name: r.name,
          color: r.color,
          expressions: [],
        };
        next.characters.push(created);
        map.set(r.id, created.id);
      }
    }
    return map;
  };

  const buildVarRemap = (refs: StoryVariable[]): Map<string, string> => {
    const map = new Map<string, string>();
    for (const r of refs) {
      const existing = next.variables.find((v) => v.name === r.name && v.type === r.type);
      if (existing) {
        map.set(r.id, existing.id);
      } else {
        const created: StoryVariable = { ...structuredClone(r), id: createId('var') };
        next.variables.push(created);
        map.set(r.id, created.id);
      }
    }
    return map;
  };

  const remapBlock = (
    blk: StoryBlock,
    charMap: Map<string, string>,
    varMap: Map<string, string>,
    sceneMap: Map<string, string>
  ): StoryBlock => {
    const clone = structuredClone(blk);
    clone.id = createId('blk');
    if (clone.type === 'dialogue') {
      if (clone.speakerId) clone.speakerId = charMap.get(clone.speakerId) ?? null;
      clone.voiceAssetId = sanitizeAsset(clone.voiceAssetId);
    } else if (clone.type === 'background') {
      clone.assetId = sanitizeAsset(clone.assetId) ?? null;
    } else if (clone.type === 'sprite') {
      clone.characterId = charMap.get(clone.characterId) ?? clone.characterId;
    } else if (clone.type === 'multilayer_stage') {
      clone.layers = clone.layers.filter((l) => {
        const ok = sanitizeAsset(l.assetId);
        return Boolean(ok);
      });
    } else if (clone.type === 'audio') {
      clone.assetId = sanitizeAsset(clone.assetId);
    } else if (clone.type === 'video') {
      clone.assetId = sanitizeAsset(clone.assetId) ?? '';
    } else if (clone.type === 'cg_unlock') {
      clone.assetId = sanitizeAsset(clone.assetId) ?? '';
    } else if (clone.type === 'state_change') {
      clone.effects = clone.effects.map((e) => ({
        ...e,
        id: createId('eff'),
        variableId: varMap.get(e.variableId) ?? e.variableId,
      }));
    } else if (clone.type === 'choice') {
      if (clone.speakerId) clone.speakerId = charMap.get(clone.speakerId) ?? null;
      clone.options = clone.options.map((o) => ({
        ...o,
        id: createId('opt'),
        targetSceneId: o.targetSceneId ? sceneMap.get(o.targetSceneId) : undefined,
        effects: o.effects.map((e) => ({
          ...e,
          id: createId('eff'),
          variableId: varMap.get(e.variableId) ?? e.variableId,
        })),
        condition: o.condition
          ? {
              ...o.condition,
              rules: o.condition.rules.map((r) => ({
                ...r,
                id: createId('rule'),
                variableId: varMap.get(r.variableId) ?? r.variableId,
              })),
            }
          : undefined,
      }));
    } else if (clone.type === 'condition_branch') {
      clone.condition = {
        ...clone.condition,
        rules: clone.condition.rules.map((r) => ({
          ...r,
          id: createId('rule'),
          variableId: varMap.get(r.variableId) ?? r.variableId,
        })),
      };
      if (clone.trueTargetSceneId) clone.trueTargetSceneId = sceneMap.get(clone.trueTargetSceneId);
      if (clone.falseTargetSceneId) clone.falseTargetSceneId = sceneMap.get(clone.falseTargetSceneId);
    } else if (clone.type === 'flow') {
      if (clone.targetSceneId) clone.targetSceneId = sceneMap.get(clone.targetSceneId);
      clone.cgAssetId = sanitizeAsset(clone.cgAssetId);
    }
    return clone;
  };

  if (item.kind === 'character') {
    const p = item.payload as CharacterReusePayload;
    const ch = structuredClone(p.character);
    ch.id = createId('ch');
    ch.avatarAssetId = sanitizeAsset(ch.avatarAssetId);
    ch.fontAssetId = sanitizeAsset(ch.fontAssetId);
    ch.dialogueBoxBgAssetId = sanitizeAsset(ch.dialogueBoxBgAssetId);
    ch.expressions = ch.expressions
      .map((e) => ({ ...e, id: createId('exp'), assetId: sanitizeAsset(e.assetId) ?? '' }))
      .filter((e) => Boolean(e.assetId));
    next.characters.push(ch);
    return {
      updatedProject: next,
      summary: `已导入角色「${ch.name}」${cleanedAssetRefs > 0 ? `（已自动清理 ${cleanedAssetRefs} 处本项目缺失素材引用）` : ''}`,
      cleanedAssetRefs,
    };
  }

  if (item.kind === 'chapter') {
    const p = item.payload as ChapterReusePayload;
    const charMap = buildCharRemap(p.referencedCharacters);
    const varMap = buildVarRemap(p.referencedVariables);
    const newChId = createId('ch');
    next.chapters.push({
      ...structuredClone(p.chapter),
      id: newChId,
      order: next.chapters.length,
    });
    const sceneMap = new Map<string, string>();
    for (const sc of p.scenes) sceneMap.set(sc.id, createId('sc'));

    for (const sc of p.scenes) {
      next.scenes.push({
        ...structuredClone(sc),
        id: sceneMap.get(sc.id)!,
        chapterId: newChId,
        order: next.scenes.length,
        nextSceneId: sc.nextSceneId ? sceneMap.get(sc.nextSceneId) ?? null : null,
        blocks: sc.blocks.map((b) => remapBlock(b, charMap, varMap, sceneMap)),
      });
    }
    return {
      updatedProject: next,
      summary: `已导入章节「${p.chapter.name}」（共 ${p.scenes.length} 个场景，保持章内连接）`,
      cleanedAssetRefs,
    };
  }

  if (item.kind === 'scene') {
    const p = item.payload as SceneReusePayload;
    const charMap = buildCharRemap(p.referencedCharacters);
    const varMap = buildVarRemap(p.referencedVariables);
    const newSceneId = createId('sc');
    const sceneMap = new Map([[p.scene.id, newSceneId]]);
    next.scenes.push({
      ...structuredClone(p.scene),
      id: newSceneId,
      chapterId: next.chapters[0]?.id ?? null,
      order: next.scenes.length,
      nextSceneId: null,
      blocks: p.scene.blocks.map((b) => remapBlock(b, charMap, varMap, sceneMap)),
    });
    return {
      updatedProject: next,
      summary: `已导入场景「${p.scene.name}」`,
      cleanedAssetRefs,
    };
  }

  // snippet
  const p = item.payload as SnippetReusePayload;
  const charMap = buildCharRemap(p.referencedCharacters);
  const varMap = buildVarRemap(p.referencedVariables);
  const target =
    next.scenes.find((s) => s.id === options.targetSceneId) ??
    next.scenes.find((s) => s.id === next.meta.startSceneId) ??
    next.scenes[0];
  if (!target) throw new Error('目标项目中还没有场景。');
  const remapped = p.blocks.map((b) => remapBlock(b, charMap, varMap, new Map()));
  target.blocks.push(...remapped);
  return {
    updatedProject: next,
    summary: `已将 ${remapped.length} 项剧情片段导入到场景「${target.name}」`,
    cleanedAssetRefs,
  };
}
