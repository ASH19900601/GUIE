/**
 * Pure Deterministic Stage & Timeline Preview Engine
 * Computes exact live game stage state for any (sceneId, blockId), supports interactive
 * choice branching, story state interpolation, live variable overrides, and step-by-step
 * timeline snapshots without side effects or reload loops.
 */

import { applyStateEffect, evaluateConditionGroup } from './defaults';
import type {
  ActiveSpriteState,
  ChoiceOption,
  PreviewStageState,
  ProjectData,
  StoryBlock,
  TimelineStep,
} from './types';

export function getInitialVariables(
  project: ProjectData,
  overrides?: Record<string, number | boolean | string>
): Record<string, number | boolean | string> {
  const vars: Record<string, number | boolean | string> = {
    __player_name__: project.extensions.playerCustomName.defaultName || '主角',
  };
  for (const v of project.variables) {
    vars[v.id] = v.initialValue;
  }
  if (overrides) {
    for (const [k, val] of Object.entries(overrides)) {
      vars[k] = val;
    }
  }
  return vars;
}

export function createEmptyStage(
  project: ProjectData,
  vars: Record<string, number | boolean | string>
): PreviewStageState {
  return {
    backgroundAssetId: null,
    backgroundColor: '#161412',
    multilayerLayers: [],
    isolatedLayerId: null,
    sprites: [],
    camera: {
      panX: 0,
      panY: 0,
      zoom: 1,
      shake: 'none',
      blur: 0,
      vignette: 0,
      lutPreset: 'none',
      particles: 'none',
      particleIntensity: 1,
    },
    bgmAssetId: null,
    videoOverlay: null,
    speakerName: null,
    speakerColor: project.appearance.dialogueBox.nameColor || '#FFB399',
    speakerAvatarAssetId: null,
    text: '',
    nvlMode: false,
    nvlHistory: [],
    activeChoice: null,
    activeEnding: null,
    activeNameInput: null,
    activeChapterCard: null,
    variables: { ...vars },
  };
}

/**
 * Interpolates rich inline placeholders like `{状态:好感度}` or `{玩家名字}` or `[player_name]`
 */
export function interpolateDialogueText(
  rawText: string,
  project: ProjectData,
  vars: Record<string, number | boolean | string>
): string {
  let out = rawText;
  const playerName = String(vars.__player_name__ ?? project.extensions.playerCustomName.defaultName ?? '主角');
  out = out.replace(/\{玩家名字\}|\[player_name\]/g, playerName);

  out = out.replace(/\{状态:([^}]+)\}/g, (_match, name: string) => {
    const found = project.variables.find((v) => v.name === name.trim());
    if (!found) return name;
    const val = vars[found.id] ?? found.initialValue;
    if (found.type === 'boolean') return val ? '是' : '否';
    return String(val);
  });

  return out;
}

function findCharacterSpriteAsset(
  project: ProjectData,
  characterId: string,
  expression?: string,
  outfit?: string
): string | undefined {
  const ch = project.characters.find((c) => c.id === characterId);
  if (!ch) return undefined;
  if (expression || outfit) {
    const exact = ch.expressions.find(
      (e) =>
        (!expression || e.name === expression) &&
        (!outfit || e.outfit === outfit)
    );
    if (exact) return exact.assetId;
    const byName = ch.expressions.find((e) => e.name === expression);
    if (byName) return byName.assetId;
  }
  return ch.expressions[0]?.assetId ?? ch.avatarAssetId;
}

export function applyBlockToStage(
  stage: PreviewStageState,
  block: StoryBlock,
  project: ProjectData
): PreviewStageState {
  const next: PreviewStageState = {
    ...stage,
    sprites: stage.sprites.map((s) => ({ ...s })),
    multilayerLayers: stage.multilayerLayers.map((l) => ({ ...l })),
    camera: { ...stage.camera },
    nvlHistory: [...stage.nvlHistory],
    variables: { ...stage.variables },
    activeChoice: null,
    activeEnding: null,
    activeNameInput: null,
    activeChapterCard: null,
    videoOverlay: null,
  };

  switch (block.type) {
    case 'background': {
      next.backgroundAssetId = block.assetId;
      next.backgroundColor = block.color || '#161412';
      next.multilayerLayers = [];
      next.isolatedLayerId = null;
      break;
    }
    case 'multilayer_stage': {
      next.multilayerLayers = block.layers.map((l) => ({ ...l }));
      next.isolatedLayerId = block.isolatedLayerId ?? null;
      break;
    }
    case 'sprite': {
      if (block.action === 'hide') {
        next.sprites = next.sprites.filter((s) => s.characterId !== block.characterId);
      } else {
        const assetId = findCharacterSpriteAsset(
          project,
          block.characterId,
          block.expression,
          block.outfit
        );
        const existingIdx = next.sprites.findIndex((s) => s.characterId === block.characterId);
        const entry: ActiveSpriteState = {
          characterId: block.characterId,
          expression: block.expression,
          outfit: block.outfit,
          assetId,
          slot: block.slot,
          x: block.x,
          y: block.y,
          scale: block.scale ?? 1,
          rotation: block.rotation ?? 0,
          alpha: block.alpha ?? 1,
          zOrder: block.zOrder ?? 10,
        };
        if (existingIdx >= 0) next.sprites[existingIdx] = entry;
        else next.sprites.push(entry);
      }
      break;
    }
    case 'camera_fx': {
      if (block.reset) {
        next.camera = {
          panX: 0,
          panY: 0,
          zoom: 1,
          shake: 'none',
          blur: 0,
          vignette: 0,
          lutPreset: 'none',
          particles: 'none',
          particleIntensity: 1,
        };
      } else {
        next.camera = {
          panX: block.panX,
          panY: block.panY,
          zoom: block.zoom,
          shake: block.shake,
          blur: block.blur,
          vignette: block.vignette,
          lutPreset: block.lutPreset,
          particles: block.particles,
          particleIntensity: block.particleIntensity,
        };
      }
      break;
    }
    case 'audio': {
      if (block.channel === 'bgm') {
        next.bgmAssetId = block.action === 'stop' ? null : (block.assetId ?? next.bgmAssetId);
      }
      break;
    }
    case 'video': {
      next.videoOverlay = { assetId: block.assetId, mode: block.mode };
      break;
    }
    case 'state_change': {
      for (const eff of block.effects) {
        next.variables = applyStateEffect(eff, project.variables, next.variables);
      }
      break;
    }
    case 'dialogue': {
      const char = block.speakerId
        ? project.characters.find((c) => c.id === block.speakerId)
        : null;
      const speakerName = block.dynamicName?.trim() || char?.name || null;
      const speakerColor = char?.color || project.appearance.dialogueBox.nameColor || '#FFB399';
      const interpolated = interpolateDialogueText(block.text, project, next.variables);

      // If speaker has an expression override and is on stage, update their expression
      if (char && (block.expression || block.outfit)) {
        const spIdx = next.sprites.findIndex((s) => s.characterId === char.id);
        const newAsset = findCharacterSpriteAsset(project, char.id, block.expression, block.outfit);
        if (spIdx >= 0 && newAsset) {
          next.sprites[spIdx] = {
            ...next.sprites[spIdx],
            expression: block.expression ?? next.sprites[spIdx].expression,
            outfit: block.outfit ?? next.sprites[spIdx].outfit,
            assetId: newAsset,
          };
        }
      }

      next.speakerName = speakerName;
      next.speakerColor = speakerColor;
      next.speakerAvatarAssetId = char?.avatarAssetId ?? null;
      next.text = interpolated;
      const useNvl = Boolean(block.nvlMode ?? char?.nvlDefault);
      next.nvlMode = useNvl;
      if (useNvl) {
        next.nvlHistory = [...next.nvlHistory.slice(-6), { speaker: speakerName, text: interpolated, color: speakerColor }];
      } else {
        next.nvlHistory = [];
      }
      break;
    }
    case 'choice': {
      const char = block.speakerId
        ? project.characters.find((c) => c.id === block.speakerId)
        : null;
      if (block.prompt) {
        next.speakerName = char?.name ?? null;
        next.speakerColor = char?.color ?? project.appearance.dialogueBox.nameColor;
        next.text = interpolateDialogueText(block.prompt, project, next.variables);
      }
      next.activeChoice = {
        blockId: block.id,
        prompt: block.prompt,
        options: block.options.map((opt) => {
          const passed = evaluateConditionGroup(opt.condition, project.variables, next.variables);
          const visible = passed || opt.lockedBehavior === 'disable';
          return {
            option: opt,
            visible,
            enabled: passed,
            disabledHint: passed ? undefined : opt.disabledHint || '条件未满足',
          };
        }),
      };
      break;
    }
    case 'player_name_input': {
      next.activeNameInput = {
        prompt: block.prompt || '请输入你的名字',
        defaultName: block.defaultName || '主角',
      };
      break;
    }
    case 'cg_unlock': {
      if (block.showFullscreen && block.assetId) {
        next.backgroundAssetId = block.assetId;
        next.sprites = [];
      }
      next.text = `【已解锁鉴赏画面：${block.title || '特别插画'}】`;
      next.speakerName = null;
      break;
    }
    case 'flow': {
      if (block.action === 'ending') {
        next.activeEnding = {
          title: block.endingTitle || '故事终章',
          subtitle: block.endingSubtitle,
          cgAssetId: block.cgAssetId,
        };
        if (block.cgAssetId) {
          next.backgroundAssetId = block.cgAssetId;
          next.sprites = [];
        }
      }
      break;
    }
    case 'condition_branch': {
      break;
    }
  }

  return next;
}

/**
 * Reconstructs the exact visual stage & story state at a target block inside a scene.
 * Works smoothly even for standalone / unconnected scenes!
 */
export function simulateStageAtBlock(
  project: ProjectData,
  sceneId: string,
  targetBlockId?: string | null,
  variableOverrides?: Record<string, number | boolean | string>
): { stage: PreviewStageState; steps: TimelineStep[] } {
  const vars = getInitialVariables(project, variableOverrides);
  let stage = createEmptyStage(project, vars);
  const scene = project.scenes.find((s) => s.id === sceneId);
  const steps: TimelineStep[] = [];
  if (!scene) return { stage, steps };

  const targetIdx = targetBlockId
    ? scene.blocks.findIndex((b) => b.id === targetBlockId)
    : scene.blocks.length - 1;
  const limit = targetIdx >= 0 ? targetIdx : scene.blocks.length - 1;

  for (let i = 0; i <= limit && i < scene.blocks.length; i += 1) {
    const blk = scene.blocks[i];
    stage = applyBlockToStage(stage, blk, project);
    steps.push({
      index: i,
      sceneId: scene.id,
      sceneName: scene.name,
      blockId: blk.id,
      summary: summarizeBlockForTimeline(blk, project),
      variablesSnapshot: { ...stage.variables },
      callStack: [scene.name],
      stageSnapshot: structuredClone(stage),
    });
  }

  return { stage, steps };
}

export function summarizeBlockForTimeline(block: StoryBlock, project: ProjectData): string {
  switch (block.type) {
    case 'dialogue': {
      const sp = block.dynamicName || (block.speakerId ? project.characters.find((c) => c.id === block.speakerId)?.name : '旁白') || '旁白';
      return `${sp}：${block.text.slice(0, 22)}${block.text.length > 22 ? '…' : ''}`;
    }
    case 'choice':
      return `分支选择（${block.options.length} 项）`;
    case 'background':
      return '切换背景画面';
    case 'sprite': {
      const ch = project.characters.find((c) => c.id === block.characterId)?.name ?? '角色';
      return block.action === 'hide' ? `隐藏立绘 · ${ch}` : `显示立绘 · ${ch}`;
    }
    case 'multilayer_stage':
      return `多层场景（${block.layers.length} 层）`;
    case 'camera_fx':
      return block.reset ? '重置镜头与特效' : '镜头与环境特效';
    case 'audio':
      return `${block.channel === 'bgm' ? '音乐' : block.channel === 'se' ? '音效' : '语音'} · ${block.action === 'stop' ? '停止' : '播放'}`;
    case 'video':
      return '播放视频演出';
    case 'state_change':
      return `故事状态变更（${block.effects.length} 项）`;
    case 'condition_branch':
      return '自动条件分支判断';
    case 'flow':
      if (block.action === 'ending') return `达成结局：${block.endingTitle || '终章'}`;
      if (block.action === 'jump_scene') return '跳转至后续场景';
      if (block.action === 'call_scene') return '调用公共剧情段';
      if (block.action === 'return_from_call') return '返回主线剧情';
      if (block.action === 'pause') return `停顿 ${block.pauseSeconds ?? 1} 秒`;
      return '等待玩家点击';
    case 'player_name_input':
      return '玩家输入自定义姓名';
    case 'cg_unlock':
      return `解锁鉴赏 CG：${block.title || '插画'}`;
  }
}

export function resolveChoiceNavigation(
  project: ProjectData,
  currentSceneId: string,
  choiceBlockId: string,
  option: ChoiceOption,
  currentVars: Record<string, number | boolean | string>
): {
  nextVars: Record<string, number | boolean | string>;
  nextSceneId: string | null;
  nextBlockId: string | null;
  ending?: { title: string; subtitle?: string };
} {
  let nextVars = { ...currentVars };
  for (const eff of option.effects) {
    nextVars = applyStateEffect(eff, project.variables, nextVars);
  }
  if (option.targetType === 'ending') {
    return {
      nextVars,
      nextSceneId: null,
      nextBlockId: null,
      ending: { title: option.endingTitle || '故事终章', subtitle: option.endingSubtitle },
    };
  }
  if (option.targetType === 'continue') {
    const sc = project.scenes.find((s) => s.id === currentSceneId);
    if (sc) {
      const idx = sc.blocks.findIndex((b) => b.id === choiceBlockId);
      if (idx >= 0 && idx + 1 < sc.blocks.length) {
        return { nextVars, nextSceneId: sc.id, nextBlockId: sc.blocks[idx + 1].id };
      }
      if (sc.nextSceneId) {
        const target = project.scenes.find((s) => s.id === sc.nextSceneId);
        return { nextVars, nextSceneId: target?.id ?? null, nextBlockId: target?.blocks[0]?.id ?? null };
      }
    }
    return { nextVars, nextSceneId: null, nextBlockId: null };
  }
  if (option.targetSceneId) {
    const target = project.scenes.find((s) => s.id === option.targetSceneId);
    return {
      nextVars,
      nextSceneId: target?.id ?? null,
      nextBlockId: target?.blocks[0]?.id ?? null,
    };
  }
  return { nextVars, nextSceneId: null, nextBlockId: null };
}
