/**
 * Built-in Zero-External-Binary AI Creative Assistant Runtime
 *
 * - Runs completely in-process (Node.js 22 native fetch + OS root certs, ZERO external CLI, ZERO popup terminals)
 * - Encrypts API Key locally via Electron safeStorage (DPAPI on Windows) with AES-256-GCM machine fallback
 * - Dual-layer editing:
 *   1. Structured Story/Project tools -> keeps cards, characters, choices & flowcharts 100% GUI-editable
 *   2. Direct `game/custom_*.rpy` source tools -> builds & iteratively modifies advanced custom UI/minigames
 *      with automatic Ren'Py lint check & self-repair while strictly protecting GUI-managed scripts!
 * - Separates reasoning tokens into collapsible `reasoning` channel (never pollutes final reply!)
 * - Merges operation status updates by `toolCallId`
 * - Creates an automatic pre-AI snapshot so every AI edit supports one-click Global Undo!
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {
  AiEditorContext,
  AiOperationRecord,
  AiProviderPreset,
  AiSettings,
  AssetCategory,
  AudioBlock,
  BackgroundBlock,
  CameraFxBlock,
  CgUnlockBlock,
  ChoiceBlock,
  ChoiceOption,
  ConditionBranchBlock,
  ConditionGroup,
  ConditionOperator,
  DialogueBlock,
  FlowBlock,
  LutPreset,
  MultilayerStageBlock,
  ParticlePreset,
  PlayerNameInputBlock,
  ProjectData,
  ReuseItemKind,
  SpriteBlock,
  SpriteSlot,
  StateChangeBlock,
  StateEffect,
  StoryBlock,
  StoryVariable,
  ThemePresetId,
  TransitionType,
  VideoBlock,
} from '../shared/types';
import {
  APPEARANCE_PRESETS,
  analyzeProjectIssues,
  buildNarrativeFlowGraph,
  computeAssetUsageMap,
  createId,
  extractLocalizableStrings,
} from '../shared/defaults';
import {
  atomicWriteText,
  createSnapshot,
  findMissingAssetIds,
  getAppUserDataDir,
  saveProjectSync,
} from './projectManager';
import {
  importFromReuseLibrary,
  listReuseItems,
  saveToReuseLibrary,
} from './reuseLibrary';
import { runRenpyLint } from './renpyRunner';

export const PROVIDER_PRESETS: Record<
  AiProviderPreset,
  { label: string; baseUrl: string; defaultModel: string; models: string[] }
> = {
  deepseek: {
    label: 'DeepSeek（官方推荐，开箱即用）',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  openai: {
    label: 'OpenAI 兼容服务',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o'],
  },
  moonshot: {
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
  },
  qwen: {
    label: '通义千问 (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo'],
  },
  siliconflow: {
    label: '硅基流动 (SiliconFlow)',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: ['deepseek-ai/DeepSeek-V3', 'deepseek-ai/DeepSeek-R1'],
  },
  custom: {
    label: '其他兼容服务',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat'],
  },
};

interface StoredAiConfig {
  provider: AiProviderPreset;
  baseUrl: string;
  model: string;
  encryptedKeyB64?: string;
  encScheme?: 'safeStorage' | 'aes256gcm';
}

function getAiConfigPath(): string {
  return path.join(getAppUserDataDir(), 'ai-config.json');
}

function getMachineSecretKey(): Buffer {
  const seed = `${os.hostname()}|${os.userInfo().username}|guie-studio-local-v1`;
  return crypto.createHash('sha256').update(seed).digest();
}

function tryGetElectronSafeStorage(): {
  isEncryptionAvailable: () => boolean;
  encryptString: (plain: string) => Buffer;
  decryptString: (buf: Buffer) => string;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    if (electron?.safeStorage?.isEncryptionAvailable?.()) {
      return electron.safeStorage;
    }
  } catch {}
  return null;
}

function encryptSecret(plain: string): { b64: string; scheme: 'safeStorage' | 'aes256gcm' } {
  const ss = tryGetElectronSafeStorage();
  if (ss) {
    return { b64: ss.encryptString(plain).toString('base64'), scheme: 'safeStorage' };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getMachineSecretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { b64: Buffer.concat([iv, tag, enc]).toString('base64'), scheme: 'aes256gcm' };
}

function decryptSecret(b64: string, scheme?: 'safeStorage' | 'aes256gcm'): string {
  const buf = Buffer.from(b64, 'base64');
  if (scheme === 'safeStorage') {
    const ss = tryGetElectronSafeStorage();
    if (ss) return ss.decryptString(buf);
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', getMachineSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function loadStoredAiConfig(): StoredAiConfig {
  const file = getAiConfigPath();
  if (fs.existsSync(file)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<StoredAiConfig>;
      const provider: AiProviderPreset = parsed.provider && PROVIDER_PRESETS[parsed.provider] ? parsed.provider : 'deepseek';
      return {
        provider,
        baseUrl: parsed.baseUrl || PROVIDER_PRESETS[provider].baseUrl,
        model: parsed.model || PROVIDER_PRESETS[provider].defaultModel,
        encryptedKeyB64: parsed.encryptedKeyB64,
        encScheme: parsed.encScheme,
      };
    } catch {}
  }
  return {
    provider: 'deepseek',
    baseUrl: PROVIDER_PRESETS.deepseek.baseUrl,
    model: PROVIDER_PRESETS.deepseek.defaultModel,
  };
}

export function getResolvedApiKey(): string {
  const cfg = loadStoredAiConfig();
  if (cfg.encryptedKeyB64) {
    try {
      const decrypted = decryptSecret(cfg.encryptedKeyB64, cfg.encScheme);
      if (decrypted.trim()) return decrypted.trim();
    } catch {}
  }
  // Fallback to environment variable if present (useful for pre-provisioned workstation / CI)
  if (cfg.provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return process.env.DEEPSEEK_API_KEY.trim();
  }
  return (process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '').trim();
}

export function getAiSettingsPublic(): AiSettings {
  const cfg = loadStoredAiConfig();
  const key = getResolvedApiKey();
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    hasApiKey: Boolean(key),
    maskedKey: key ? maskKey(key) : undefined,
  };
}

export function saveAiSettings(input: {
  provider: AiProviderPreset;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}): AiSettings {
  const current = loadStoredAiConfig();
  const preset = PROVIDER_PRESETS[input.provider] ?? PROVIDER_PRESETS.deepseek;
  const next: StoredAiConfig = {
    provider: input.provider,
    baseUrl: (input.baseUrl || preset.baseUrl).replace(/\/+$/, ''),
    model: input.model || preset.defaultModel,
    encryptedKeyB64: current.encryptedKeyB64,
    encScheme: current.encScheme,
  };
  if (typeof input.apiKey === 'string') {
    const trimmed = input.apiKey.trim();
    if (trimmed) {
      const { b64, scheme } = encryptSecret(trimmed);
      next.encryptedKeyB64 = b64;
      next.encScheme = scheme;
    } else {
      delete next.encryptedKeyB64;
      delete next.encScheme;
    }
  }
  atomicWriteText(getAiConfigPath(), JSON.stringify(next, null, 2));
  return getAiSettingsPublic();
}

export function translateAiErrorToChinese(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('401') || lower.includes('invalid_api_key') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return '连接密钥无效或已过期，请点击右上角连接设置检查并重新填入正确的 API Key。';
  }
  if (lower.includes('402') || lower.includes('insufficient') || lower.includes('balance') || lower.includes('quota')) {
    return '当前账号余额不足或额度已用完，请先前往服务商控制台充值后再试。';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'AI 服务当前请求过多、暂时繁忙，请稍等几秒后重试。';
  }
  if (lower.includes('timeout') || lower.includes('abort') || lower.includes('etimedout')) {
    return '连接 AI 服务超时，请检查网络连接是否畅通后重试。';
  }
  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('fetch failed') || lower.includes('network')) {
    return '无法连接到 AI 服务地址，请检查网络或确认服务地址填写正确。';
  }
  if (lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return 'AI 服务端暂时出现波动，请稍后再试。';
  }
  return `AI 助手暂时未能完成本次请求，请稍后重试。（原因简述：${msg.slice(0, 80)}）`;
}

// ==========================================
// Tool Definitions for Dual-Layer Editing
// ==========================================

export const AI_TOOLS = [
  // 1. Project Overview & Meta
  {
    type: 'function',
    function: {
      name: 'get_project_overview',
      description:
        '读取当前游戏的完整概览：基本信息、章节、场景、角色、故事状态、素材清单、多语言本地化及翻译进度、当前外观主题、六大系统扩展状态及自定义扩展脚本清单。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project_meta',
      description: '修改游戏的基本信息（标题、作者、版本号、开场场景、窗口分辨率宽高）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '游戏标题' },
          author: { type: 'string', description: '创作者署名' },
          version: { type: 'string', description: '版本号，如 1.0.0' },
          startSceneId: { type: 'string', description: '开场场景 ID 或场景名称' },
          width: { type: 'number', description: '画面宽度，如 1920' },
          height: { type: 'number', description: '画面高度，如 1080' },
        },
      },
    },
  },

  // 2. Chapters & Scenes Structure
  {
    type: 'function',
    function: {
      name: 'manage_chapter',
      description: '创建、修改（重命名、描述、软停用/启用、排序）或删除章节（删除章节时下属场景会安全保留）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'update', 'delete'] },
          chapterId: { type: 'string', description: '修改或删除时的章节 ID 或章节名称' },
          name: { type: 'string', description: '章节名称' },
          description: { type: 'string', description: '章节简介' },
          disabled: { type: 'boolean', description: '是否临时软停用' },
          order: { type: 'number', description: '排序序号（从 0 开始）' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_scene',
      description: '创建一个新场景，可指定其所属章节（ID 或名称）、初始对白、结局以及后续自动衔接的场景。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          chapterId: { type: 'string', description: '所属章节 ID 或章节名称' },
          nextSceneId: { type: 'string', description: '可选：该场景结束后自动连接的后续场景 ID 或名称' },
          summary: { type: 'string', description: '可选：场景简介' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speakerName: { type: 'string' },
                text: { type: 'string' },
                expression: { type: 'string' },
              },
              required: ['text'],
            },
          },
          endingTitle: { type: 'string', description: '可选：如果该场景以结局收尾，填写结局标题' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_or_delete_scene',
      description: '修改场景（重命名、移动章节、设置结束后前往的下一场景 nextSceneId、软停用/启用、简介、排序）或删除场景。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['update', 'delete'], description: '默认 update' },
          sceneId: { type: 'string', description: '目标场景 ID 或场景名称' },
          name: { type: 'string', description: '新场景名称' },
          chapterId: { type: 'string', description: '移动到章节 ID 或章节名称' },
          nextSceneId: { type: 'string', description: '结束后前往的场景 ID 或名称；传空字符串 "" 表示本场景结束不再自动跳转' },
          disabled: { type: 'boolean', description: '是否临时软停用' },
          summary: { type: 'string' },
          order: { type: 'number' },
          setAsStartScene: { type: 'boolean', description: '是否将该场景设为游戏开场场景' },
        },
        required: ['sceneId'],
      },
    },
  },

  // 3. Full 13-Type Story Block CRUD
  {
    type: 'function',
    function: {
      name: 'read_scene_blocks',
      description: '读取指定场景中的所有 13 类剧情卡片详情（对白、选项、背景、立绘、多层舞台、镜头特效、音频、视频、状态变更、条件分支、流程/结局、主角起名、CG 解锁）。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '场景 ID 或场景名称（可省略，默认读取当前场景）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_dialogue_lines',
      description: '向指定场景批量添加连续的对白或旁白卡片（结构化数据，用户可在 GUI 中继续编辑）。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '目标场景 ID 或名称' },
          insertAfterBlockId: { type: 'string', description: '可选：插在某张卡片之后；省略则追加到末尾' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speakerName: { type: 'string', description: '说话角色名；留空或 null 表示旁白' },
                dynamicName: { type: 'string', description: '可选：临时角色称呼（如“神秘声音”）' },
                text: { type: 'string', description: '对白或旁白内容' },
                expression: { type: 'string', description: '可选：表情名' },
                outfit: { type: 'string', description: '可选：服装名' },
                nvlMode: { type: 'boolean', description: '可选：是否使用全屏独白模式' },
                voiceAssetName: { type: 'string', description: '可选：绑定语音素材 ID 或名称' },
                typingSpeed: { type: 'number', description: '可选：单句打字速度 cps' },
              },
              required: ['text'],
            },
          },
        },
        required: ['sceneId', 'lines'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_story_blocks',
      description:
        '向场景任意位置批量插入任意 13 类标准剧情卡片（background 背景、sprite 立绘、multilayer_stage 多层舞台、camera_fx 镜头滤镜粒子、audio 音乐音效、video 视频、state_change 状态变更、condition_branch 条件判断跳转、flow 场景跳转/调用/停顿/结局、player_name_input 玩家起名、cg_unlock 解锁 CG、dialogue 对白、choice 玩家选项）。所有素材、角色、状态、目标场景均支持传 ID 或名称自动匹配。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '目标场景 ID 或名称（默认当前场景）' },
          insertAfterBlockId: { type: 'string', description: '可选：插在某张卡片 ID 之后' },
          insertAtIndex: { type: 'number', description: '可选：插入位置索引（0 表示开头）' },
          blocks: {
            type: 'array',
            description: '要插入的结构化卡片列表',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'dialogue',
                    'choice',
                    'background',
                    'sprite',
                    'multilayer_stage',
                    'camera_fx',
                    'audio',
                    'video',
                    'state_change',
                    'condition_branch',
                    'flow',
                    'player_name_input',
                    'cg_unlock',
                  ],
                },
                // dialogue
                speakerName: { type: 'string' },
                dynamicName: { type: 'string' },
                text: { type: 'string' },
                expression: { type: 'string' },
                outfit: { type: 'string' },
                nvlMode: { type: 'boolean' },
                voiceAssetName: { type: 'string' },
                // background / audio / video / cg_unlock
                assetName: { type: 'string', description: '素材 ID 或名称' },
                color: { type: 'string', description: '背景纯色 HEX，如 #000000' },
                transition: {
                  type: 'string',
                  enum: ['none', 'dissolve', 'fade', 'wipeleft', 'wiperight', 'slideleft', 'slideright', 'blinds', 'pixellate', 'irisout', 'vpunch', 'hpunch'],
                },
                transitionDuration: { type: 'number' },
                // sprite
                action: { type: 'string', description: 'sprite: show/hide; audio: play/stop/queue; flow: jump_scene/call_scene/return_from_call/pause/wait_click/ending' },
                characterName: { type: 'string', description: '角色 ID 或名称' },
                slot: { type: 'string', enum: ['farleft', 'left', 'center', 'right', 'farright', 'custom'] },
                scale: { type: 'number' },
                alpha: { type: 'number' },
                // camera_fx
                panX: { type: 'number' },
                panY: { type: 'number' },
                zoom: { type: 'number' },
                duration: { type: 'number' },
                shake: { type: 'string', enum: ['none', 'light', 'medium', 'heavy'] },
                blur: { type: 'number' },
                vignette: { type: 'number' },
                lutPreset: { type: 'string', enum: ['none', 'warm', 'cool', 'sepia', 'noir', 'sunset', 'dreamy'] },
                particles: { type: 'string', enum: ['none', 'rain', 'snow', 'petals', 'leaves', 'sparkles'] },
                particleIntensity: { type: 'number' },
                reset: { type: 'boolean' },
                // audio / video
                channel: { type: 'string', enum: ['bgm', 'se', 'voice'] },
                loop: { type: 'boolean' },
                volume: { type: 'number' },
                fadeIn: { type: 'number' },
                fadeOut: { type: 'number' },
                videoMode: { type: 'string', enum: ['fullscreen', 'background_loop', 'sprite_video'] },
                skippable: { type: 'boolean' },
                // state_change
                effects: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      variableName: { type: 'string' },
                      op: { type: 'string', enum: ['set', 'add', 'sub'] },
                      value: {},
                    },
                    required: ['variableName'],
                  },
                },
                // condition_branch
                conditionLogic: { type: 'string', enum: ['all', 'any', 'not'] },
                rules: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      variableName: { type: 'string' },
                      operator: { type: 'string', enum: ['==', '!=', '>', '>=', '<', '<=', 'contains', 'is_true', 'is_false'] },
                      value: {},
                    },
                    required: ['variableName'],
                  },
                },
                trueTargetType: { type: 'string', enum: ['scene', 'ending', 'call_scene'] },
                trueTargetSceneId: { type: 'string', description: '满足条件前往的场景 ID 或名称' },
                trueEndingTitle: { type: 'string' },
                falseTargetType: { type: 'string', enum: ['continue', 'scene', 'ending'] },
                falseTargetSceneId: { type: 'string', description: '不满足条件前往的场景 ID 或名称' },
                falseEndingTitle: { type: 'string' },
                // flow & player_name_input & cg_unlock
                targetSceneId: { type: 'string', description: '跳转或调用的目标场景 ID 或名称' },
                pauseSeconds: { type: 'number' },
                endingTitle: { type: 'string' },
                endingSubtitle: { type: 'string' },
                prompt: { type: 'string' },
                defaultName: { type: 'string' },
                title: { type: 'string' },
                showFullscreen: { type: 'boolean' },
                // choice
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string' },
                      targetType: { type: 'string', enum: ['scene', 'ending', 'continue', 'call_scene'] },
                      targetSceneId: { type: 'string' },
                      endingTitle: { type: 'string' },
                      endingSubtitle: { type: 'string' },
                      conditionVariableName: { type: 'string' },
                      conditionOperator: { type: 'string' },
                      conditionValue: {},
                      lockedBehavior: { type: 'string', enum: ['hide', 'disable'] },
                      disabledHint: { type: 'string' },
                      effectVariableName: { type: 'string' },
                      effectOp: { type: 'string', enum: ['set', 'add', 'sub'] },
                      effectValue: {},
                    },
                  },
                },
              },
              required: ['type'],
            },
          },
        },
        required: ['blocks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_story_block',
      description: '修改场景中任意已有卡片（对白、选项分支、背景、立绘、镜头特效、音频、状态变更、条件分支、流程结局、主角起名、CG解锁）。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '场景 ID 或名称（默认当前场景）' },
          blockId: { type: 'string', description: '要修改的卡片 ID' },
          patch: {
            type: 'object',
            description: '要更新的字段键值对（字段同 insert_story_blocks 中的卡片属性）',
          },
        },
        required: ['blockId', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_dialogue_block',
      description: '润色或修改场景中指定对白卡片的文字、说话人、表情、服装、全屏独白或配音。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          blockId: { type: 'string' },
          text: { type: 'string' },
          speakerName: { type: 'string' },
          dynamicName: { type: 'string' },
          expression: { type: 'string' },
          outfit: { type: 'string' },
          nvlMode: { type: 'boolean' },
          voiceAssetName: { type: 'string' },
        },
        required: ['blockId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_choice_branch',
      description: '在指定场景中插入玩家多选项分支卡片，支持条件判断规则、状态变更效果和跳转目标场景（ID或名称）、调用子场景或结局。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          insertAfterBlockId: { type: 'string' },
          prompt: { type: 'string', description: '选择前的提示语' },
          speakerName: { type: 'string', description: '可选：提问时的说话角色' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                targetType: { type: 'string', enum: ['scene', 'ending', 'continue', 'call_scene'] },
                targetSceneId: { type: 'string', description: '目标场景 ID 或场景名称' },
                endingTitle: { type: 'string' },
                endingSubtitle: { type: 'string' },
                conditionVariableName: { type: 'string', description: '可选：条件判断的故事状态名称' },
                conditionOperator: { type: 'string', enum: ['>=', '>', '==', '!=', '<=', '<', 'contains', 'is_true', 'is_false'] },
                conditionValue: {},
                lockedBehavior: { type: 'string', enum: ['hide', 'disable'] },
                disabledHint: { type: 'string' },
                effectVariableName: { type: 'string', description: '可选：选中后修改的状态名' },
                effectOp: { type: 'string', enum: ['set', 'add', 'sub'] },
                effectValue: {},
              },
              required: ['label', 'targetType'],
            },
          },
        },
        required: ['options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_or_reorder_blocks',
      description: '从场景中删除一张或多张剧情卡片，或将指定卡片移动到新位置。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '场景 ID 或名称（默认当前场景）' },
          deleteBlockIds: {
            type: 'array',
            items: { type: 'string' },
            description: '要删除的卡片 ID 列表',
          },
          moveBlockId: { type: 'string', description: '要调整顺序的卡片 ID' },
          moveToIndex: { type: 'number', description: '移动到的目标位置索引（从 0 开始）' },
        },
      },
    },
  },

  // 4. Characters & Story Variables
  {
    type: 'function',
    function: {
      name: 'create_character',
      description: '在项目中创建一名新角色（若同名已存在则更新该角色属性）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'HEX 颜色，如 #E06D53' },
          description: { type: 'string' },
          nvlDefault: { type: 'boolean', description: '是否默认全屏独白模式' },
          avatarAssetName: { type: 'string', description: '可选：头像素材 ID 或名称' },
          dialogueBoxBgAssetName: { type: 'string', description: '可选：角色专属对话框底图素材 ID 或名称' },
          fontAssetName: { type: 'string', description: '可选：角色专属字体素材 ID 或名称' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_or_delete_character',
      description: '修改已有角色（改名、改代表色、简介、绑定头像/专属对话框/字体、添加或删除表情立绘映射）或删除角色。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['update', 'delete'], description: '默认 update' },
          characterId: { type: 'string', description: '角色 ID 或角色当前名称' },
          name: { type: 'string', description: '新角色名' },
          color: { type: 'string' },
          description: { type: 'string' },
          nvlDefault: { type: 'boolean' },
          avatarAssetName: { type: 'string' },
          dialogueBoxBgAssetName: { type: 'string' },
          fontAssetName: { type: 'string' },
          addExpressions: {
            type: 'array',
            description: '为角色新增或更新表情绑定',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '表情名，如 微笑、惊讶' },
                outfit: { type: 'string', description: '可选服装名' },
                assetName: { type: 'string', description: '立绘素材 ID 或名称' },
              },
              required: ['name', 'assetName'],
            },
          },
          removeExpressionNames: {
            type: 'array',
            items: { type: 'string' },
            description: '要移除的表情名称列表',
          },
        },
        required: ['characterId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_story_variable',
      description: '创建故事状态（变量），如好感度、线索开关、记录文字等。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['number', 'boolean', 'string'] },
          initialValue: { description: '初始值' },
          persistent: { type: 'boolean', description: '是否跨周目持久' },
          category: { type: 'string', enum: ['affection', 'flag', 'general'] },
          linkedCharacterName: { type: 'string', description: '可选：关联的角色 ID 或名称' },
          description: { type: 'string' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_or_delete_variable',
      description: '修改已有故事状态（改名、改类型、初始值、跨周目持久、关联角色、备注说明）或删除故事状态。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['update', 'delete'], description: '默认 update' },
          variableId: { type: 'string', description: '状态 ID 或状态当前名称' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['number', 'boolean', 'string'] },
          initialValue: {},
          persistent: { type: 'boolean' },
          category: { type: 'string', enum: ['affection', 'flag', 'general'] },
          linkedCharacterName: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['variableId'],
      },
    },
  },

  // 5. Assets Library Inspection & Metadata Management
  {
    type: 'function',
    function: {
      name: 'list_assets',
      description: '查询项目素材库中的背景、立绘、音乐、音效、配音、视频、字体与界面图片，包含引用统计与 CG 标记。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['all', 'background', 'sprite', 'bgm', 'se', 'voice', 'video', 'font', 'ui'],
          },
          unusedOnly: { type: 'boolean', description: '仅查看尚未被任何剧情引用的素材' },
          search: { type: 'string', description: '按名称关键词筛选' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_asset_metadata',
      description: '修改素材库中指定素材的显示名称、素材分类，或将其标记/取消标记为 CG 鉴赏插画。',
      parameters: {
        type: 'object',
        properties: {
          assetId: { type: 'string', description: '素材 ID 或当前素材名称' },
          name: { type: 'string', description: '新的显示名称' },
          category: {
            type: 'string',
            enum: ['background', 'sprite', 'bgm', 'se', 'voice', 'video', 'font', 'ui'],
          },
          isCg: { type: 'boolean', description: '是否标记为 CG 鉴赏插画' },
          cgTitle: { type: 'string', description: 'CG 鉴赏相册中显示的标题' },
        },
        required: ['assetId'],
      },
    },
  },

  // 6. Game Appearance & Built-in Extensions Marketplace
  {
    type: 'function',
    function: {
      name: 'get_appearance_and_extensions',
      description: '读取当前游戏的完整「游戏外观」配置（主题预设、配色、字体、对话框、按钮、窗口）及「扩展市场」六大系统的详细设置。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_appearance',
      description:
        '修改「游戏外观」：可一键切换 5 套内置主题预设（paper_warm 暖纸书卷、bright_fresh 明亮清爽、midnight_velvet 午夜剧场、sakura_soft 樱庭物语、classic_vn 经典Galgame），或细调主题颜色、字体与字号、对话框样式（字号/字重/行高/字距/颜色/阴影/边距/高度/透明度/打字速度/底图）、按钮样式与窗口配置。',
      parameters: {
        type: 'object',
        properties: {
          themePreset: {
            type: 'string',
            enum: ['paper_warm', 'bright_fresh', 'midnight_velvet', 'sakura_soft', 'classic_vn'],
            description: '可选：先切换并应用一套内置主题预设',
          },
          theme: {
            type: 'object',
            properties: {
              primaryColor: { type: 'string' },
              accentColor: { type: 'string' },
              idleColor: { type: 'string' },
              hoverColor: { type: 'string' },
              menuBgColor: { type: 'string' },
              overlayOpacity: { type: 'number' },
            },
          },
          font: {
            type: 'object',
            properties: {
              globalFontAssetName: { type: 'string', description: '全局字体素材 ID 或名称；传空字符串恢复内置多语言字体' },
              baseSize: { type: 'number' },
              interfaceSize: { type: 'number' },
            },
          },
          dialogueBox: {
            type: 'object',
            properties: {
              fontAssetName: { type: 'string' },
              backgroundAssetName: { type: 'string' },
              fontSize: { type: 'number' },
              fontWeight: { type: 'number' },
              lineHeight: { type: 'number' },
              letterSpacing: { type: 'number' },
              textColor: { type: 'string' },
              nameColor: { type: 'string' },
              textShadow: { type: 'boolean' },
              shadowColor: { type: 'string' },
              paddingX: { type: 'number' },
              paddingY: { type: 'number' },
              nameFontSize: { type: 'number' },
              boxHeight: { type: 'number' },
              boxBgColor: { type: 'string' },
              boxOpacity: { type: 'number' },
              typingCps: { type: 'number' },
            },
          },
          buttons: {
            type: 'object',
            properties: {
              style: { type: 'string', enum: ['rounded', 'sharp', 'pill', 'outline'] },
              bgColor: { type: 'string' },
              hoverBgColor: { type: 'string' },
              textColor: { type: 'string' },
              borderColor: { type: 'string' },
              borderWidth: { type: 'number' },
              radius: { type: 'number' },
            },
          },
          window: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
              fullscreenDefault: { type: 'boolean' },
              showWindowTitle: { type: 'boolean' },
              iconAssetName: { type: 'string' },
            },
          },
          saveAsPresetName: { type: 'string', description: '可选：将当前对话框配置另存为新预设的名称' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_extensions',
      description:
        '开启、关闭或配置「扩展市场」中的六大真实可玩系统：CG鉴赏/已读回想/结局收集册、角色好感度进度系统（支持一键为全部角色生成轨道）、六格大图存档页、玩家自定义名字系统、选择前自动存档、章节标题过场卡。',
      parameters: {
        type: 'object',
        properties: {
          galleryAndEndings: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              enableCgGallery: { type: 'boolean' },
              enableSceneReplay: { type: 'boolean' },
              enableEndingBook: { type: 'boolean' },
            },
          },
          affectionSystem: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              autoGenerateForAllCharacters: {
                type: 'boolean',
                description: '设为 true 时自动为项目中所有角色创建跨周目持久好感度状态并绑定进度条轨道',
              },
              tracks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    characterName: { type: 'string', description: '角色 ID 或名称' },
                    variableName: { type: 'string', description: '好感度状态 ID 或名称' },
                    maxVal: { type: 'number' },
                    label: { type: 'string' },
                  },
                  required: ['characterName'],
                },
              },
            },
          },
          sixSlotSaveScreen: {
            type: 'object',
            properties: { enabled: { type: 'boolean' } },
          },
          playerCustomName: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              defaultName: { type: 'string' },
              promptAtStart: { type: 'boolean' },
              promptText: { type: 'string' },
            },
          },
          autoSaveBeforeChoice: {
            type: 'object',
            properties: { enabled: { type: 'boolean' } },
          },
          chapterTitleCard: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              duration: { type: 'number' },
              style: { type: 'string', enum: ['minimal', 'cinematic', 'ink'] },
            },
          },
        },
      },
    },
  },

  // 7. Multi-language Localization (Reading strings, Managing languages, Batch filling translations)
  {
    type: 'function',
    function: {
      name: 'get_localization_strings',
      description:
        '读取「多语言本地化」中已配置的语言列表，并提取项目中所有可翻译词条（游戏标题、章节名、角色名、全部场景对白、分支提示与选项、结局标题等），返回每条词条的 key、原文 sourceText、上下文 context 及当前目标语言译文 translatedText。',
      parameters: {
        type: 'object',
        properties: {
          langCode: {
            type: 'string',
            description: '目标语言代码或名称（如 en、English、英语、ja、日语、ko、韩语、zh_TW、es、ru；省略则默认取当前选中或第一个语言）',
          },
          sceneId: { type: 'string', description: '可选：仅读取指定场景 ID 或名称下的词条' },
          onlyUntranslated: { type: 'boolean', description: '设为 true 时仅返回尚未填写译文的词条' },
          offset: { type: 'number', description: '分页起始位置，默认 0' },
          limit: { type: 'number', description: '单次返回最大条数，默认 120' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_language',
      description: '在「多语言本地化」中添加新目标语言（如 en 英语、ja 日语、ko 韩语、zh_TW 繁体中文、es 西班牙语、ru 俄语）、修改语言专属字体或图片替换映射、或删除语言。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'update', 'delete'], description: '默认 add' },
          langCode: { type: 'string', description: '语言代码或名称，如 en、ja、ko、zh_TW、es、ru' },
          name: { type: 'string', description: '语言显示名称，如 English（英语）、日本語（日语）' },
          fontAssetName: { type: 'string', description: '可选：该语言专属字体素材 ID 或名称；传空字符串恢复内置多语言字体' },
          imageOverrides: {
            type: 'object',
            description: '可选：含文字图片的替换映射（键为原素材 ID 或名称，值为替换素材 ID 或名称）',
          },
        },
        required: ['langCode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_localization_translations',
      description:
        '向「多语言本地化」中的指定语言批量填入或修改译文（如英文对白、日文对白、选项译文等）。若该语言尚未创建，会自动创建该语言并填入译文。注意：若原文含有 {玩家名字} 或 {状态:xxx} 占位符，译文中请原样保留该占位符！',
      parameters: {
        type: 'object',
        properties: {
          langCode: {
            type: 'string',
            description: '目标语言代码或名称（如 en、English、英语、ja、日语、ko、韩语、zh_TW、es、ru）',
          },
          languageName: {
            type: 'string',
            description: '可选：当自动新建该语言时的显示名称',
          },
          entries: {
            type: 'array',
            description: '要写入的译文列表（推荐传入 get_localization_strings 返回的 key；若未传 key 也可传 sourceText 自动匹配）',
            items: {
              type: 'object',
              properties: {
                key: { type: 'string', description: '词条 key，例如 blk.xxx.text、opt.xxx.label、char.xxx.name、meta.title' },
                sourceText: { type: 'string', description: '可选：原文文本（当未提供准确 key 时用于自动匹配所有相同原文的词条）' },
                text: { type: 'string', description: '翻译后的目标语言文本' },
              },
              required: ['text'],
            },
          },
        },
        required: ['langCode', 'entries'],
      },
    },
  },

  // 8. Flowchart Layout, Cross-Project Reuse Library & Project Health Check
  {
    type: 'function',
    function: {
      name: 'update_flow_layout',
      description: '调整选线流程图布局方向（TB 纵向 / LR 横向）、开关叙事因果连线显示、或重置节点自动排列。',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', enum: ['TB', 'LR'] },
          showCausalLinks: { type: 'boolean' },
          resetAutoLayout: { type: 'boolean', description: '设为 true 时清除手动拖拽坐标，恢复自动整齐排列' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'manage_reuse_library',
      description: '管理「跨项目复用库」：查看复用库清单（list）、将当前项目的角色/章节/场景/片段保存到复用库（save）、或从复用库导入到当前项目（import）。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'save', 'import'] },
          kind: { type: 'string', enum: ['character', 'chapter', 'scene', 'snippet'], description: 'save 时的复用项类型' },
          sourceId: { type: 'string', description: 'save 时的来源角色/章节/场景 ID 或名称' },
          blockIds: { type: 'array', items: { type: 'string' }, description: 'save snippet 时可选的卡片 ID 列表' },
          name: { type: 'string', description: 'save 时保存在复用库中的名称' },
          description: { type: 'string', description: 'save 时的描述' },
          itemId: { type: 'string', description: 'import 时复用库条目的 ID 或名称' },
          targetSceneId: { type: 'string', description: 'import snippet 时导入到的目标场景 ID 或名称' },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_project_check',
      description: '运行全面项目诊断与真实 Ren\'Py 引擎校验（包含孤立未接入场景、未连接选项、空白分支、缺失素材、多语言字体及自定义脚本语法检查），并可选一键自动修复孤立场景等问题。',
      parameters: {
        type: 'object',
        properties: {
          autoFixOrphanScenes: {
            type: 'boolean',
            description: '可选：设为 true 时自动将所有孤立未接入的场景串联到主线末尾',
          },
        },
      },
    },
  },

  // 9. Protected Custom .rpy Extension Fallback
  {
    type: 'function',
    function: {
      name: 'read_custom_rpy',
      description: '读取项目中已存在的自定义扩展脚本文件（game/custom_*.rpy）以进行二次修改。',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: '文件名，例如 custom_phone.rpy' },
        },
        required: ['fileName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_custom_rpy',
      description:
        '【高级定制兜底】当用户要求 GUI 表单之外的高级功能（如自定义手机聊天系统、复杂背包、小游戏、特殊界面/动画）时，直接写入或更新 game/custom_<name>.rpy，并自动执行语法校验！严禁覆盖普通 GUI 管理的 script.rpy/gui.rpy。',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string', description: '必须以 custom_ 开头并以 .rpy 结尾，例如 custom_phone_chat.rpy' },
          content: { type: 'string', description: '完整有效的 Ren\'Py 脚本内容' },
          summary: { type: 'string', description: '用零基础创作者能看懂的中文简述本次定制内容' },
        },
        required: ['fileName', 'content', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_custom_rpy',
      description: '删除不再需要的自定义扩展脚本文件（仅限 game/custom_*.rpy）。',
      parameters: {
        type: 'object',
        properties: {
          fileName: { type: 'string' },
        },
        required: ['fileName'],
      },
    },
  },
];

export interface AiStreamCallbacks {
  onReasoningChunk?: (delta: string) => void;
  onContentChunk?: (delta: string) => void;
  onOperationUpdate?: (op: AiOperationRecord) => void;
}

export interface AiTurnResult {
  reply: string;
  reasoning: string;
  reasoningDurationSec: number;
  operations: AiOperationRecord[];
  updatedProject: ProjectData;
  projectMutated: boolean;
  snapshotIdBefore: string;
}

interface ChatMessageInternal {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export async function runAiAssistantTurn(options: {
  projectDir: string;
  project: ProjectData;
  userPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  context: AiEditorContext;
  callbacks?: AiStreamCallbacks;
}): Promise<AiTurnResult> {
  const cfg = loadStoredAiConfig();
  const apiKey = getResolvedApiKey();
  if (!apiKey) {
    throw new Error('请先点击右上角「连接设置」，填入你的 API Key 即可开始使用 AI 创作助手。');
  }

  // Create automatic milestone snapshot before AI executes (enables 1-click Global Undo!)
  const snap = createSnapshot(options.projectDir, options.project, 'AI 助手修改前自动保护', 'milestone');

  const workingProject: ProjectData = structuredClone(options.project);
  let projectMutated = false;
  let customRpyTouched = false;
  const operations: AiOperationRecord[] = [];
  const upsertOp = (op: AiOperationRecord) => {
    const idx = operations.findIndex((x) => x.id === op.id);
    if (idx >= 0) operations[idx] = op;
    else operations.push(op);
    options.callbacks?.onOperationUpdate?.(op);
  };

  const activeScene = workingProject.scenes.find((s) => s.id === options.context.activeSceneId);
  const localizableCount = extractLocalizableStrings(workingProject).length;
  const langSummary =
    workingProject.localization.languages
      .map((l) => {
        const done = Object.values(l.translations).filter((v) => Boolean(v?.trim())).length;
        return `${l.name}[${l.code}](已译${done}/${localizableCount})`;
      })
      .join('、') || '尚未添加译文语言';

  const systemPrompt = `你是 GUIE 视觉小说创作工坊的内置全能 AI 创作助手，服务于完全零编程基础的视觉小说创作者。

核心原则：
1. 始终使用自然、亲切、零技术术语的中文向用户汇报（不要提 .rpy、label、jump、Lint、JSON、AST、Diff 等底层词）。
2. 全模块结构化工具优先：
   - 剧情与全部 13 类演出卡片（对白、分支选项、背景、立绘登场/退场、多层舞台、镜头推拉震屏/滤镜/雨雪花瓣粒子、音乐音效配音、视频、状态变更、条件分支、场景跳转/子场景调用/结局、玩家起名、CG解锁）：调用 read_scene_blocks、add_dialogue_lines、insert_story_blocks、update_story_block、update_dialogue_block、add_choice_branch、delete_or_reorder_blocks。
   - 章节、场景与项目信息：调用 manage_chapter、create_scene、update_or_delete_scene、update_project_meta。
   - 角色、表情与故事状态变量：调用 create_character、update_or_delete_character、create_story_variable、update_or_delete_variable。
   - 多语言本地化翻译（如填入英语/日语/韩语对白与选项译文、新增语言、配置语言字体或替图）：先调用 get_localization_strings 读取待翻译词条列表与 key，再调用 set_localization_translations 批量写入译文（或调用 manage_language 管理语种）！若原文包含 {玩家名字} 或 {状态:xxx}，译文中必须保留相同的 {玩家名字} 或 {状态:xxx} 占位符。
   - 素材库、游戏外观、扩展市场、流程图布局、跨项目复用库、全面检查与修复：分别调用 list_assets、update_asset_metadata、get_appearance_and_extensions、update_appearance、update_extensions、update_flow_layout、manage_reuse_library、run_project_check。
3. 高级定制兜底：当用户需要超出常规图形界面的定制玩法（如手机聊天系统、背包、小游戏、特殊动态界面）时，调用 write_custom_rpy 在 game/custom_*.rpy 中实现并自动校验；用户后续要求修改时先 read_custom_rpy 再更新。
4. 当前创作上下文：
   - 游戏标题：${workingProject.meta.title}（开场场景ID: ${workingProject.meta.startSceneId}）
   - 当前所在页面：${options.context.activeTab}
   - 当前打开的场景：${activeScene ? `${activeScene.name} (ID: ${activeScene.id})` : '无'}
   - 当前选中卡片：${options.context.selectedBlockId ? `${options.context.selectedBlockSummary || options.context.selectedBlockId} (ID: ${options.context.selectedBlockId})` : '无'}
   - 当前选中角色：${options.context.selectedCharacterName || '无'}
   - 当前选中素材：${options.context.selectedAssetName || '无'}
   - 当前选中的多语言版本：${options.context.activeLanguageCode ? `${options.context.activeLanguageName || options.context.activeLanguageCode} (${options.context.activeLanguageCode})` : '无'}
   - 已有章节：${workingProject.chapters.map((c) => `${c.name}(${c.id})`).join('、') || '暂无'}
   - 已有场景：${workingProject.scenes.map((s) => `${s.name}(${s.id})`).join('、')}
   - 已有角色：${workingProject.characters.map((c) => `${c.name}(${c.id})`).join('、') || '暂无'}
   - 已有故事状态：${workingProject.variables.map((v) => `${v.name}[${v.type}](${v.id})`).join('、') || '暂无'}
   - 已有素材数：${workingProject.assets.length} 个
   - 多语言本地化进度：${langSummary}
5. 完成后给出简洁清晰的中文总结，说明已完成哪些创作修改，无需贴出代码。`;

  const messages: ChatMessageInternal[] = [
    { role: 'system', content: systemPrompt },
    ...options.history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: options.userPrompt },
  ];

  let fullReasoning = '';
  let finalReply = '';
  const reasoningStart = Date.now();
  let reasoningElapsedMs = 0;

  // Agentic multi-step loop (up to 14 rounds for multi-batch translations, complex scene building & auto lint self-repair)
  for (let round = 0; round < 14; round += 1) {
    const resp = await callOpenAiCompatibleStream({
      baseUrl: cfg.baseUrl,
      apiKey,
      model: cfg.model,
      messages,
      tools: AI_TOOLS,
      onReasoning: (d) => {
        fullReasoning += d;
        reasoningElapsedMs = Date.now() - reasoningStart;
        options.callbacks?.onReasoningChunk?.(d);
      },
      onContent: (d) => {
        finalReply += d;
        options.callbacks?.onContentChunk?.(d);
      },
    });

    if (resp.toolCalls.length === 0) {
      if (!finalReply.trim() && resp.content.trim()) {
        finalReply = resp.content;
      }
      break;
    }

    // Record assistant tool call turn
    messages.push({
      role: 'assistant',
      content: resp.content || null,
      tool_calls: resp.toolCalls,
    });

    // Execute each tool call with merged operation log updates
    for (const tc of resp.toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || '{}');
      } catch {}

      const meta = describeToolAction(tc.function.name, args, workingProject);
      upsertOp({
        id: tc.id,
        action: meta.action,
        status: 'running',
        target: meta.target,
        summary: meta.summary,
      });

      try {
        const toolResult = await executeToolCall(
          tc.function.name,
          args,
          workingProject,
          options.projectDir,
          options.context
        );
        if (toolResult.mutated) projectMutated = true;
        if (toolResult.touchedCustomRpy) customRpyTouched = true;

        upsertOp({
          id: tc.id,
          action: meta.action,
          status: toolResult.ok ? 'done' : 'failed',
          target: toolResult.target || meta.target,
          summary: toolResult.summary || meta.summary,
        });

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult.output),
        });
      } catch (err) {
        upsertOp({
          id: tc.id,
          action: meta.action,
          status: 'failed',
          target: meta.target,
          summary: `执行失败：${err instanceof Error ? err.message : String(err)}`,
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        });
      }
    }

    // Persist immediately after tool mutations so Ren'Py lint checks actual disk files
    if (projectMutated) {
      saveProjectSync(options.projectDir, workingProject);
    }

    // Automatic lint check after custom rpy edits if the model hasn't checked yet
    if (customRpyTouched && !resp.toolCalls.some((t) => t.function.name === 'run_project_check')) {
      const checkId = `auto_check_${round}`;
      upsertOp({
        id: checkId,
        action: 'check',
        status: 'running',
        target: '定制扩展内容',
        summary: '正在自动校验游戏脚本完整性',
      });
      const lintRes = await runRenpyLint(options.projectDir, workingProject);
      upsertOp({
        id: checkId,
        action: 'check',
        status: lintRes.ok ? 'done' : 'failed',
        target: '定制扩展内容',
        summary: lintRes.ok ? '引擎校验全部通过' : '发现脚本问题，正由 AI 自动修复',
      });
      if (!lintRes.ok) {
        messages.push({
          role: 'user',
          content: `自动运行校验发现以下错误，请立即修复对应的 custom_*.rpy 文件并再次校验：\n${lintRes.rawOutput.slice(0, 1800)}`,
        });
      }
      customRpyTouched = false;
    }

    // Clear intermediate content if we're going into another round after tool calls
    finalReply = '';
  }

  if (projectMutated) {
    saveProjectSync(options.projectDir, workingProject);
  }

  // Strip any accidental <think>...</think> blocks out of finalReply and fold them into reasoning!
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  finalReply = finalReply.replace(thinkRegex, (_m, inner: string) => {
    fullReasoning += (fullReasoning ? '\n' : '') + inner.trim();
    return '';
  }).trim();

  return {
    reply: finalReply || '已完成你的创作请求，左侧工作区已同步更新。',
    reasoning: fullReasoning.trim(),
    reasoningDurationSec: Math.max(1, Math.round(reasoningElapsedMs / 1000)),
    operations,
    updatedProject: workingProject,
    projectMutated,
    snapshotIdBefore: snap.id,
  };
}

function describeToolAction(
  name: string,
  args: Record<string, unknown>,
  project: ProjectData
): { action: AiOperationRecord['action']; target: string; summary: string } {
  const sceneName = (sid?: unknown) =>
    project.scenes.find((s) => s.id === sid || s.name === sid)?.name || '当前场景';

  switch (name) {
    case 'get_project_overview':
      return { action: 'read', target: project.meta.title, summary: '读取游戏全局结构与设定' };
    case 'update_project_meta':
      return { action: 'edit', target: String(args.title || project.meta.title), summary: '更新游戏基本信息与画幅设置' };
    case 'manage_chapter': {
      const act = String(args.action || 'create');
      const chName = String(args.name || args.chapterId || '章节');
      return {
        action: act === 'delete' ? 'delete' : act === 'create' ? 'write' : 'edit',
        target: chName,
        summary: act === 'delete' ? '删除章节分组' : act === 'create' ? '创建新章节' : '更新章节设置',
      };
    }
    case 'create_scene':
      return { action: 'write', target: String(args.name || '新场景'), summary: '创建新剧情场景' };
    case 'update_or_delete_scene':
      return {
        action: args.action === 'delete' ? 'delete' : 'edit',
        target: sceneName(args.sceneId),
        summary: args.action === 'delete' ? '删除场景' : '更新场景信息与路线衔接',
      };
    case 'read_scene_blocks':
      return { action: 'read', target: sceneName(args.sceneId), summary: '读取场景内全部剧情与演出卡片' };
    case 'add_dialogue_lines':
      return {
        action: 'write',
        target: sceneName(args.sceneId),
        summary: `新增 ${Array.isArray(args.lines) ? args.lines.length : 1} 句对白/旁白`,
      };
    case 'insert_story_blocks':
      return {
        action: 'write',
        target: sceneName(args.sceneId),
        summary: `插入 ${Array.isArray(args.blocks) ? args.blocks.length : 1} 张剧情/演出卡片`,
      };
    case 'update_story_block':
      return { action: 'edit', target: sceneName(args.sceneId), summary: '修改剧情/演出卡片参数' };
    case 'update_dialogue_block':
      return { action: 'edit', target: sceneName(args.sceneId), summary: '润色并修改选中对白' };
    case 'add_choice_branch':
      return { action: 'write', target: sceneName(args.sceneId), summary: '设计多选项剧情分支' };
    case 'delete_or_reorder_blocks':
      return {
        action: Array.isArray(args.deleteBlockIds) && args.deleteBlockIds.length > 0 ? 'delete' : 'edit',
        target: sceneName(args.sceneId),
        summary:
          Array.isArray(args.deleteBlockIds) && args.deleteBlockIds.length > 0
            ? `移除 ${args.deleteBlockIds.length} 张剧情卡片`
            : '调整场景卡片顺序',
      };
    case 'create_character':
      return { action: 'write', target: String(args.name || '新角色'), summary: '创建角色设定' };
    case 'update_or_delete_character':
      return {
        action: args.action === 'delete' ? 'delete' : 'edit',
        target: String(args.name || args.characterId || '角色'),
        summary: args.action === 'delete' ? '删除角色' : '修改角色设定与表情立绘',
      };
    case 'create_story_variable':
      return { action: 'write', target: String(args.name || '故事状态'), summary: '新增故事状态' };
    case 'update_or_delete_variable':
      return {
        action: args.action === 'delete' ? 'delete' : 'edit',
        target: String(args.name || args.variableId || '故事状态'),
        summary: args.action === 'delete' ? '删除故事状态' : '更新故事状态配置',
      };
    case 'list_assets':
      return { action: 'read', target: '素材库', summary: '查询项目素材与引用统计' };
    case 'update_asset_metadata':
      return { action: 'edit', target: String(args.name || args.assetId || '素材'), summary: '更新素材分类与 CG 鉴赏标记' };
    case 'get_appearance_and_extensions':
      return { action: 'read', target: '游戏外观与扩展', summary: '读取游戏外观与扩展市场设置' };
    case 'update_appearance':
      return { action: 'edit', target: '游戏外观', summary: '更新游戏主题、字体或对话框外观' };
    case 'update_extensions':
      return { action: 'edit', target: '扩展市场', summary: '配置内置可玩系统扩展' };
    case 'get_localization_strings':
      return {
        action: 'read',
        target: `多语言本地化${args.langCode ? ` · ${String(args.langCode)}` : ''}`,
        summary: '读取待翻译词条与本地化进度',
      };
    case 'manage_language':
      return {
        action: args.action === 'delete' ? 'delete' : args.action === 'update' ? 'edit' : 'write',
        target: `多语言 · ${String(args.name || args.langCode || '')}`,
        summary: args.action === 'delete' ? '移除语言版本' : args.action === 'update' ? '更新语言专属字体与替图' : '添加目标语言版本',
      };
    case 'set_localization_translations':
      return {
        action: 'write',
        target: `多语言 · ${String(args.langCode || '译文')}`,
        summary: `批量填入 ${Array.isArray(args.entries) ? args.entries.length : 0} 条多语言译文`,
      };
    case 'update_flow_layout':
      return { action: 'edit', target: '选线流程图', summary: '更新流程图布局与因果连线设置' };
    case 'manage_reuse_library':
      return {
        action: args.action === 'list' ? 'read' : 'write',
        target: '跨项目复用库',
        summary: args.action === 'list' ? '查询可复用资产清单' : args.action === 'save' ? '保存到跨项目复用库' : '从复用库导入资产',
      };
    case 'read_custom_rpy': {
      const cleanName = String(args.fileName || '扩展功能').replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return { action: 'read', target: `自定义扩展 · ${cleanName}`, summary: '读取自定义功能模块' };
    }
    case 'write_custom_rpy': {
      const cleanName = String(args.fileName || '扩展功能').replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return {
        action: 'write',
        target: `自定义扩展 · ${cleanName}`,
        summary: String(args.summary || '编写高级定制功能'),
      };
    }
    case 'delete_custom_rpy': {
      const cleanName = String(args.fileName || '扩展功能').replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return { action: 'delete', target: `自定义扩展 · ${cleanName}`, summary: '移除自定义功能模块' };
    }
    case 'run_project_check':
      return { action: 'check', target: project.meta.title, summary: '执行全面诊断与运行前完整性检查' };
    default:
      return { action: 'edit', target: project.meta.title, summary: `处理创作任务` };
  }
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  project: ProjectData,
  projectDir: string,
  context: AiEditorContext
): Promise<{
  ok: boolean;
  mutated: boolean;
  touchedCustomRpy?: boolean;
  target?: string;
  summary?: string;
  output: unknown;
}> {
  const findScene = (idOrName?: unknown) => {
    if (!idOrName || typeof idOrName !== 'string' || !idOrName.trim()) {
      return (
        project.scenes.find((s) => s.id === context.activeSceneId) ??
        project.scenes.find((s) => s.id === project.meta.startSceneId) ??
        project.scenes[0]
      );
    }
    const q = idOrName.trim();
    return (
      project.scenes.find((s) => s.id === q) ??
      project.scenes.find((s) => s.name === q) ??
      project.scenes.find((s) => s.name.includes(q))
    );
  };

  const findChapter = (idOrName?: unknown) => {
    if (!idOrName || typeof idOrName !== 'string' || !idOrName.trim()) return undefined;
    const q = idOrName.trim();
    return (
      project.chapters.find((c) => c.id === q) ??
      project.chapters.find((c) => c.name === q) ??
      project.chapters.find((c) => c.name.includes(q))
    );
  };

  const findAsset = (idOrName?: unknown, category?: AssetCategory) => {
    if (!idOrName || typeof idOrName !== 'string' || !idOrName.trim()) return undefined;
    const q = idOrName.trim().toLowerCase();
    const pool = category ? project.assets.filter((a) => a.category === category) : project.assets;
    return (
      pool.find((a) => a.id === idOrName.trim()) ??
      pool.find((a) => a.name.toLowerCase() === q) ??
      pool.find((a) => a.originalName.toLowerCase() === q) ??
      pool.find((a) => a.name.toLowerCase().includes(q) || a.originalName.toLowerCase().includes(q)) ??
      project.assets.find((a) => a.id === idOrName.trim() || a.name.toLowerCase() === q || a.name.toLowerCase().includes(q))
    );
  };

  const findOrCreateCharByName = (speakerName?: string | null): string | null => {
    if (!speakerName || !speakerName.trim() || speakerName.trim() === '旁白') return null;
    const trimmed = speakerName.trim();
    const existing = project.characters.find((c) => c.id === trimmed || c.name === trimmed);
    if (existing) return existing.id;
    const palette = ['#D9534F', '#2E7D6B', '#C97B18', '#3B6EA5', '#A84E7B'];
    const ch = {
      id: createId('ch'),
      name: trimmed,
      color: palette[project.characters.length % palette.length],
      expressions: [],
    };
    project.characters.push(ch);
    return ch.id;
  };

  const findOrCreateVarByName = (
    varName: string,
    type: 'number' | 'boolean' | 'string' = 'number'
  ): StoryVariable => {
    const q = varName.trim();
    const existing = project.variables.find((v) => v.id === q || v.name === q);
    if (existing) return existing;
    const created: StoryVariable = {
      id: createId('var'),
      name: q,
      type,
      initialValue: type === 'number' ? 0 : type === 'boolean' ? false : '',
      persistent: false,
    };
    project.variables.push(created);
    return created;
  };

  const buildChoiceOptionsFromRaw = (rawOpts: Array<Record<string, unknown>>): ChoiceOption[] =>
    rawOpts.map((o) => {
      let condition: ConditionGroup | undefined;
      if (typeof o.conditionVariableName === 'string' && o.conditionVariableName.trim()) {
        const isBoolOp = o.conditionOperator === 'is_true' || o.conditionOperator === 'is_false';
        const v = findOrCreateVarByName(o.conditionVariableName, isBoolOp ? 'boolean' : 'number');
        condition = {
          logic: 'all',
          rules: [
            {
              id: createId('rule'),
              variableId: v.id,
              operator: (o.conditionOperator as ConditionOperator) || '>=',
              value: o.conditionValue !== undefined ? (o.conditionValue as number | boolean | string) : 1,
            },
          ],
        };
      }
      const effects: StateEffect[] = [];
      if (typeof o.effectVariableName === 'string' && o.effectVariableName.trim()) {
        const v = findOrCreateVarByName(
          o.effectVariableName,
          typeof o.effectValue === 'boolean' ? 'boolean' : typeof o.effectValue === 'string' ? 'string' : 'number'
        );
        effects.push({
          id: createId('eff'),
          variableId: v.id,
          op: (o.effectOp as StateEffect['op']) || 'add',
          value: o.effectValue !== undefined ? (o.effectValue as number | boolean | string) : 1,
        });
      }
      const targetSc =
        typeof o.targetSceneId === 'string' && o.targetSceneId.trim()
          ? findScene(o.targetSceneId)?.id ?? o.targetSceneId
          : undefined;
      const tType = (['scene', 'ending', 'continue', 'call_scene'].includes(String(o.targetType))
        ? o.targetType
        : 'continue') as ChoiceOption['targetType'];
      return {
        id: typeof o.id === 'string' ? o.id : createId('opt'),
        label: String(o.label || '选项'),
        condition,
        lockedBehavior: (o.lockedBehavior === 'disable' ? 'disable' : 'hide') as 'hide' | 'disable',
        disabledHint: typeof o.disabledHint === 'string' ? o.disabledHint : undefined,
        effects,
        targetType: tType,
        targetSceneId: targetSc,
        endingId: tType === 'ending' ? createId('end') : undefined,
        endingTitle: typeof o.endingTitle === 'string' ? o.endingTitle : undefined,
        endingSubtitle: typeof o.endingSubtitle === 'string' ? o.endingSubtitle : undefined,
      };
    });

  const buildBlockFromSpec = (spec: Record<string, unknown>): StoryBlock => {
    const bType = String(spec.type || 'dialogue');
    const id = createId('blk');
    switch (bType) {
      case 'background': {
        const ast = findAsset(spec.assetName ?? spec.assetId, 'background');
        return {
          id,
          type: 'background',
          assetId: ast?.id ?? null,
          color: typeof spec.color === 'string' ? spec.color : '#1E1B18',
          transition: (spec.transition as TransitionType) || 'dissolve',
          transitionDuration: Number(spec.transitionDuration) || 0.6,
        } satisfies BackgroundBlock;
      }
      case 'sprite': {
        const charId =
          findOrCreateCharByName(String(spec.characterName || spec.speakerName || spec.characterId || '角色')) ??
          (project.characters[0]?.id || createId('ch'));
        return {
          id,
          type: 'sprite',
          action: spec.action === 'hide' ? 'hide' : 'show',
          characterId: charId,
          expression: typeof spec.expression === 'string' ? spec.expression : undefined,
          outfit: typeof spec.outfit === 'string' ? spec.outfit : undefined,
          slot: (spec.slot as SpriteSlot) || 'center',
          scale: spec.scale !== undefined ? Number(spec.scale) : 1,
          alpha: spec.alpha !== undefined ? Number(spec.alpha) : 1,
          transition: (spec.transition as TransitionType) || 'dissolve',
          transitionDuration: Number(spec.transitionDuration) || 0.4,
        } satisfies SpriteBlock;
      }
      case 'multilayer_stage': {
        const rawLayers = Array.isArray(spec.layers) ? (spec.layers as Array<Record<string, unknown>>) : [];
        return {
          id,
          type: 'multilayer_stage',
          layers: rawLayers.map((l, idx) => ({
            id: createId('lyr'),
            name: String(l.name || `图层 ${idx + 1}`),
            group: (['background', 'midground', 'foreground'].includes(String(l.group))
              ? l.group
              : 'midground') as 'background' | 'midground' | 'foreground',
            assetId: findAsset(l.assetName ?? l.assetId)?.id ?? '',
            offsetX: Number(l.offsetX) || 0,
            offsetY: Number(l.offsetY) || 0,
            parallaxDepth: l.parallaxDepth !== undefined ? Number(l.parallaxDepth) : 1,
            scale: l.scale !== undefined ? Number(l.scale) : 1,
            alpha: l.alpha !== undefined ? Number(l.alpha) : 1,
            visible: l.visible !== false,
            zIndex: idx,
          })),
          transition: (spec.transition as TransitionType) || 'dissolve',
          transitionDuration: Number(spec.transitionDuration) || 0.6,
        } satisfies MultilayerStageBlock;
      }
      case 'camera_fx': {
        return {
          id,
          type: 'camera_fx',
          panX: Number(spec.panX) || 0,
          panY: Number(spec.panY) || 0,
          zoom: spec.zoom !== undefined ? Number(spec.zoom) : 1,
          duration: spec.duration !== undefined ? Number(spec.duration) : 0.6,
          shake: (['none', 'light', 'medium', 'heavy'].includes(String(spec.shake)) ? spec.shake : 'none') as CameraFxBlock['shake'],
          blur: Number(spec.blur) || 0,
          dofFocus: spec.dofFocus !== undefined ? Number(spec.dofFocus) : 0.5,
          vignette: Number(spec.vignette) || 0,
          lutPreset: (spec.lutPreset as LutPreset) || 'none',
          particles: (spec.particles as ParticlePreset) || 'none',
          particleIntensity: spec.particleIntensity !== undefined ? Number(spec.particleIntensity) : 1,
          reset: Boolean(spec.reset),
        } satisfies CameraFxBlock;
      }
      case 'audio': {
        const ch = (['bgm', 'se', 'voice'].includes(String(spec.channel)) ? spec.channel : 'bgm') as AudioBlock['channel'];
        const ast = findAsset(spec.assetName ?? spec.assetId, ch);
        return {
          id,
          type: 'audio',
          channel: ch,
          action: (['play', 'stop', 'queue'].includes(String(spec.action)) ? spec.action : 'play') as AudioBlock['action'],
          assetId: ast?.id,
          loop: spec.loop !== undefined ? Boolean(spec.loop) : ch === 'bgm',
          volume: spec.volume !== undefined ? Number(spec.volume) : 0.85,
          fadeIn: Number(spec.fadeIn) || 0,
          fadeOut: Number(spec.fadeOut) || 0,
        } satisfies AudioBlock;
      }
      case 'video': {
        const ast = findAsset(spec.assetName ?? spec.assetId, 'video');
        return {
          id,
          type: 'video',
          mode: (['fullscreen', 'background_loop', 'sprite_video'].includes(String(spec.videoMode || spec.mode))
            ? (spec.videoMode || spec.mode)
            : 'fullscreen') as VideoBlock['mode'],
          assetId: ast?.id ?? '',
          characterId: spec.characterName ? findOrCreateCharByName(String(spec.characterName)) ?? undefined : undefined,
          loop: Boolean(spec.loop),
          skippable: spec.skippable !== false,
        } satisfies VideoBlock;
      }
      case 'state_change': {
        const rawEffs = Array.isArray(spec.effects) ? (spec.effects as Array<Record<string, unknown>>) : [];
        return {
          id,
          type: 'state_change',
          effects: rawEffs.map((e) => {
            const vType =
              typeof e.value === 'boolean' ? 'boolean' : typeof e.value === 'string' ? 'string' : 'number';
            const v = findOrCreateVarByName(String(e.variableName || '好感度'), vType);
            return {
              id: createId('eff'),
              variableId: v.id,
              op: (['set', 'add', 'sub'].includes(String(e.op)) ? e.op : 'add') as StateEffect['op'],
              value: e.value !== undefined ? (e.value as number | boolean | string) : 1,
            };
          }),
        } satisfies StateChangeBlock;
      }
      case 'condition_branch': {
        const rawRules = Array.isArray(spec.rules) ? (spec.rules as Array<Record<string, unknown>>) : [];
        const rules = rawRules.map((r) => {
          const op = (r.operator as ConditionOperator) || '>=';
          const isBool = op === 'is_true' || op === 'is_false' || typeof r.value === 'boolean';
          const v = findOrCreateVarByName(String(r.variableName || '好感度'), isBool ? 'boolean' : 'number');
          return {
            id: createId('rule'),
            variableId: v.id,
            operator: op,
            value: r.value !== undefined ? (r.value as number | boolean | string) : 1,
          };
        });
        const trueSc = spec.trueTargetSceneId ? findScene(spec.trueTargetSceneId)?.id ?? String(spec.trueTargetSceneId) : undefined;
        const falseSc = spec.falseTargetSceneId ? findScene(spec.falseTargetSceneId)?.id ?? String(spec.falseTargetSceneId) : undefined;
        return {
          id,
          type: 'condition_branch',
          condition: {
            logic: (['all', 'any', 'not'].includes(String(spec.conditionLogic)) ? spec.conditionLogic : 'all') as ConditionGroup['logic'],
            rules,
          },
          trueTargetType: (['scene', 'ending', 'call_scene'].includes(String(spec.trueTargetType))
            ? spec.trueTargetType
            : 'scene') as ConditionBranchBlock['trueTargetType'],
          trueTargetSceneId: trueSc,
          trueEndingId: spec.trueTargetType === 'ending' ? createId('end') : undefined,
          trueEndingTitle: typeof spec.trueEndingTitle === 'string' ? spec.trueEndingTitle : undefined,
          falseTargetType: (['continue', 'scene', 'ending'].includes(String(spec.falseTargetType))
            ? spec.falseTargetType
            : 'continue') as ConditionBranchBlock['falseTargetType'],
          falseTargetSceneId: falseSc,
          falseEndingId: spec.falseTargetType === 'ending' ? createId('end') : undefined,
          falseEndingTitle: typeof spec.falseEndingTitle === 'string' ? spec.falseEndingTitle : undefined,
        } satisfies ConditionBranchBlock;
      }
      case 'flow': {
        const act = (['jump_scene', 'call_scene', 'return_from_call', 'pause', 'wait_click', 'ending'].includes(String(spec.action))
          ? spec.action
          : 'ending') as FlowBlock['action'];
        const targetSc = spec.targetSceneId ? findScene(spec.targetSceneId)?.id ?? String(spec.targetSceneId) : undefined;
        const cgAst = findAsset(spec.assetName ?? spec.cgAssetId, 'background');
        return {
          id,
          type: 'flow',
          action: act,
          targetSceneId: targetSc,
          pauseSeconds: spec.pauseSeconds !== undefined ? Number(spec.pauseSeconds) : 1.0,
          endingId: act === 'ending' ? createId('end') : undefined,
          endingTitle: typeof spec.endingTitle === 'string' ? spec.endingTitle : undefined,
          endingSubtitle: typeof spec.endingSubtitle === 'string' ? spec.endingSubtitle : undefined,
          cgAssetId: cgAst?.id,
        } satisfies FlowBlock;
      }
      case 'player_name_input': {
        return {
          id,
          type: 'player_name_input',
          prompt: String(spec.prompt || '请输入你的名字：'),
          defaultName: String(spec.defaultName || project.extensions.playerCustomName.defaultName || '主角'),
        } satisfies PlayerNameInputBlock;
      }
      case 'cg_unlock': {
        const ast = findAsset(spec.assetName ?? spec.assetId, 'background');
        if (ast) {
          ast.isCg = true;
          if (typeof spec.title === 'string' && spec.title.trim()) ast.cgTitle = spec.title.trim();
        }
        return {
          id,
          type: 'cg_unlock',
          cgId: ast?.id || createId('cg'),
          title: String(spec.title || ast?.cgTitle || ast?.name || '纪念插画'),
          assetId: ast?.id ?? '',
          showFullscreen: spec.showFullscreen !== false,
          transition: (spec.transition as TransitionType) || 'dissolve',
        } satisfies CgUnlockBlock;
      }
      case 'choice': {
        const rawOpts = Array.isArray(spec.options) ? (spec.options as Array<Record<string, unknown>>) : [];
        return {
          id,
          type: 'choice',
          prompt: typeof spec.prompt === 'string' ? spec.prompt : undefined,
          speakerId: spec.speakerName ? findOrCreateCharByName(String(spec.speakerName)) : null,
          options: buildChoiceOptionsFromRaw(rawOpts),
        } satisfies ChoiceBlock;
      }
      case 'dialogue':
      default: {
        const voiceAst = findAsset(spec.voiceAssetName ?? spec.voiceAssetId, 'voice');
        return {
          id,
          type: 'dialogue',
          speakerId: findOrCreateCharByName(typeof spec.speakerName === 'string' ? spec.speakerName : null),
          dynamicName: typeof spec.dynamicName === 'string' ? spec.dynamicName : undefined,
          text: String(spec.text || ''),
          expression: typeof spec.expression === 'string' ? spec.expression : undefined,
          outfit: typeof spec.outfit === 'string' ? spec.outfit : undefined,
          nvlMode: Boolean(spec.nvlMode),
          voiceAssetId: voiceAst?.id,
          typingSpeed: spec.typingSpeed !== undefined ? Number(spec.typingSpeed) : undefined,
        } satisfies DialogueBlock;
      }
    }
  };

  switch (name) {
    case 'get_project_overview': {
      const gameDir = path.join(projectDir, 'game');
      const customFiles = fs.existsSync(gameDir)
        ? fs.readdirSync(gameDir).filter((f) => f.startsWith('custom_') && f.endsWith('.rpy'))
        : [];
      const localizable = extractLocalizableStrings(project);
      return {
        ok: true,
        mutated: false,
        output: {
          meta: project.meta,
          window: { width: project.appearance.window.width, height: project.appearance.window.height },
          chapters: project.chapters.map((c) => ({ id: c.id, name: c.name, disabled: c.disabled, order: c.order })),
          scenes: project.scenes.map((s) => ({
            id: s.id,
            name: s.name,
            chapterId: s.chapterId,
            disabled: s.disabled,
            blockCount: s.blocks.length,
            nextSceneId: s.nextSceneId,
          })),
          characters: project.characters.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            description: c.description,
            expressions: c.expressions.map((e) => e.name),
          })),
          variables: project.variables,
          assets: project.assets.map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            isCg: Boolean(a.isCg),
          })),
          appearancePreset: project.appearance.themePreset,
          extensions: {
            galleryAndEndings: project.extensions.galleryAndEndings.enabled,
            affectionSystem: project.extensions.affectionSystem.enabled,
            sixSlotSaveScreen: project.extensions.sixSlotSaveScreen.enabled,
            playerCustomName: project.extensions.playerCustomName.enabled,
            autoSaveBeforeChoice: project.extensions.autoSaveBeforeChoice.enabled,
            chapterTitleCard: project.extensions.chapterTitleCard.enabled,
          },
          localization: {
            totalLocalizableStrings: localizable.length,
            languages: project.localization.languages.map((l) => {
              const translatedCount = localizable.filter((item) => Boolean(l.translations[item.key]?.trim())).length;
              return {
                code: l.code,
                name: l.name,
                translatedCount,
                totalCount: localizable.length,
              };
            }),
          },
          customFiles,
        },
      };
    }

    case 'update_project_meta': {
      if (typeof args.title === 'string' && args.title.trim()) {
        project.meta.title = args.title.trim();
        project.appearance.window.title = args.title.trim();
      }
      if (typeof args.author === 'string') project.meta.author = args.author.trim();
      if (typeof args.version === 'string') project.meta.version = args.version.trim();
      if (typeof args.startSceneId === 'string' && args.startSceneId.trim()) {
        const sc = findScene(args.startSceneId);
        if (sc) project.meta.startSceneId = sc.id;
      }
      if (args.width !== undefined && Number(args.width) >= 640) {
        project.appearance.window.width = Math.round(Number(args.width));
      }
      if (args.height !== undefined && Number(args.height) >= 480) {
        project.appearance.window.height = Math.round(Number(args.height));
      }
      return {
        ok: true,
        mutated: true,
        target: project.meta.title,
        summary: `已更新游戏信息「${project.meta.title}」`,
        output: { meta: project.meta, window: project.appearance.window },
      };
    }

    case 'manage_chapter': {
      const act = String(args.action || 'create');
      if (act === 'create') {
        const ch = {
          id: createId('ch'),
          name: String(args.name || '新章节').trim(),
          order: args.order !== undefined ? Number(args.order) : project.chapters.length,
          collapsed: false,
          disabled: Boolean(args.disabled),
          description: typeof args.description === 'string' ? args.description : undefined,
        };
        project.chapters.push(ch);
        return {
          ok: true,
          mutated: true,
          target: ch.name,
          summary: `已创建章节「${ch.name}」`,
          output: ch,
        };
      }
      const ch = findChapter(args.chapterId ?? args.name);
      if (!ch) return { ok: false, mutated: false, output: { error: '未找到指定章节' } };
      if (act === 'delete') {
        for (const sc of project.scenes) {
          if (sc.chapterId === ch.id) sc.chapterId = project.chapters.find((c) => c.id !== ch.id)?.id ?? null;
        }
        project.chapters = project.chapters.filter((c) => c.id !== ch.id);
        return {
          ok: true,
          mutated: true,
          target: ch.name,
          summary: `已删除章节「${ch.name}」（下属场景已保留）`,
          output: { deletedChapterId: ch.id },
        };
      }
      if (typeof args.name === 'string' && args.name.trim()) ch.name = args.name.trim();
      if (typeof args.description === 'string') ch.description = args.description;
      if (typeof args.disabled === 'boolean') ch.disabled = args.disabled;
      if (args.order !== undefined) ch.order = Number(args.order);
      return {
        ok: true,
        mutated: true,
        target: ch.name,
        summary: `已更新章节「${ch.name}」`,
        output: ch,
      };
    }

    case 'read_scene_blocks': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到该场景' } };
      const charName = (cid?: string | null) =>
        cid ? project.characters.find((c) => c.id === cid)?.name ?? cid : '旁白';
      const assetName = (aid?: string | null) =>
        aid ? project.assets.find((a) => a.id === aid)?.name ?? aid : null;
      const varName = (vid?: string) =>
        vid ? project.variables.find((v) => v.id === vid)?.name ?? vid : '';
      const scName = (sid?: string | null) =>
        sid ? project.scenes.find((s) => s.id === sid)?.name ?? sid : null;

      return {
        ok: true,
        mutated: false,
        target: sc.name,
        output: {
          sceneId: sc.id,
          sceneName: sc.name,
          chapterId: sc.chapterId,
          disabled: sc.disabled,
          nextSceneId: sc.nextSceneId,
          nextSceneName: scName(sc.nextSceneId),
          blocks: sc.blocks.map((b, idx) => {
            const base = { index: idx, id: b.id, type: b.type };
            switch (b.type) {
              case 'dialogue':
                return {
                  ...base,
                  speaker: b.dynamicName || charName(b.speakerId),
                  speakerId: b.speakerId,
                  expression: b.expression,
                  outfit: b.outfit,
                  nvlMode: b.nvlMode,
                  voice: assetName(b.voiceAssetId),
                  text: b.text,
                };
              case 'choice':
                return {
                  ...base,
                  prompt: b.prompt,
                  speaker: b.speakerId ? charName(b.speakerId) : undefined,
                  options: b.options.map((o) => ({
                    id: o.id,
                    label: o.label,
                    targetType: o.targetType,
                    targetSceneId: o.targetSceneId,
                    targetSceneName: scName(o.targetSceneId),
                    endingTitle: o.endingTitle,
                    lockedBehavior: o.lockedBehavior,
                    disabledHint: o.disabledHint,
                    condition: o.condition?.rules.map((r) => ({
                      variable: varName(r.variableId),
                      operator: r.operator,
                      value: r.value,
                    })),
                    effects: o.effects.map((e) => ({
                      variable: varName(e.variableId),
                      op: e.op,
                      value: e.value,
                    })),
                  })),
                };
              case 'background':
                return { ...base, assetName: assetName(b.assetId), color: b.color, transition: b.transition };
              case 'sprite':
                return {
                  ...base,
                  action: b.action,
                  character: charName(b.characterId),
                  expression: b.expression,
                  slot: b.slot,
                  transition: b.transition,
                };
              case 'camera_fx':
                return {
                  ...base,
                  panX: b.panX,
                  panY: b.panY,
                  zoom: b.zoom,
                  shake: b.shake,
                  lutPreset: b.lutPreset,
                  particles: b.particles,
                };
              case 'audio':
                return { ...base, channel: b.channel, action: b.action, assetName: assetName(b.assetId), loop: b.loop };
              case 'video':
                return { ...base, mode: b.mode, assetName: assetName(b.assetId), loop: b.loop };
              case 'state_change':
                return {
                  ...base,
                  effects: b.effects.map((e) => ({ variable: varName(e.variableId), op: e.op, value: e.value })),
                };
              case 'condition_branch':
                return {
                  ...base,
                  logic: b.condition.logic,
                  rules: b.condition.rules.map((r) => ({
                    variable: varName(r.variableId),
                    operator: r.operator,
                    value: r.value,
                  })),
                  trueTargetType: b.trueTargetType,
                  trueTargetSceneName: scName(b.trueTargetSceneId),
                  falseTargetType: b.falseTargetType,
                  falseTargetSceneName: scName(b.falseTargetSceneId),
                };
              case 'flow':
                return {
                  ...base,
                  action: b.action,
                  targetSceneName: scName(b.targetSceneId),
                  endingTitle: b.endingTitle,
                  endingSubtitle: b.endingSubtitle,
                };
              case 'player_name_input':
                return { ...base, prompt: b.prompt, defaultName: b.defaultName };
              case 'cg_unlock':
                return { ...base, title: b.title, assetName: assetName(b.assetId) };
              default:
                return base;
            }
          }),
        },
      };
    }

    case 'add_dialogue_lines': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const lines = Array.isArray(args.lines) ? args.lines : [];
      const newBlocks: DialogueBlock[] = lines.map((l: Record<string, unknown>) => ({
        id: createId('blk'),
        type: 'dialogue',
        speakerId: findOrCreateCharByName(typeof l.speakerName === 'string' ? l.speakerName : null),
        dynamicName: typeof l.dynamicName === 'string' ? l.dynamicName : undefined,
        text: String(l.text || ''),
        expression: typeof l.expression === 'string' ? l.expression : undefined,
        outfit: typeof l.outfit === 'string' ? l.outfit : undefined,
        nvlMode: Boolean(l.nvlMode),
        voiceAssetId: l.voiceAssetName ? findAsset(l.voiceAssetName, 'voice')?.id : undefined,
        typingSpeed: l.typingSpeed !== undefined ? Number(l.typingSpeed) : undefined,
      }));

      if (typeof args.insertAfterBlockId === 'string') {
        const idx = sc.blocks.findIndex((b) => b.id === args.insertAfterBlockId);
        if (idx >= 0) sc.blocks.splice(idx + 1, 0, ...newBlocks);
        else sc.blocks.push(...newBlocks);
      } else {
        sc.blocks.push(...newBlocks);
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已在「${sc.name}」新增 ${newBlocks.length} 句对白`,
        output: { addedCount: newBlocks.length, blockIds: newBlocks.map((b) => b.id) },
      };
    }

    case 'insert_story_blocks': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const rawBlocks = Array.isArray(args.blocks) ? (args.blocks as Array<Record<string, unknown>>) : [];
      const built = rawBlocks.map((spec) => buildBlockFromSpec(spec));
      if (typeof args.insertAfterBlockId === 'string') {
        const idx = sc.blocks.findIndex((b) => b.id === args.insertAfterBlockId);
        if (idx >= 0) sc.blocks.splice(idx + 1, 0, ...built);
        else sc.blocks.push(...built);
      } else if (args.insertAtIndex !== undefined) {
        const idx = Math.max(0, Math.min(sc.blocks.length, Number(args.insertAtIndex) || 0));
        sc.blocks.splice(idx, 0, ...built);
      } else {
        sc.blocks.push(...built);
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已在「${sc.name}」插入 ${built.length} 张剧情/演出卡片`,
        output: { addedCount: built.length, blockIds: built.map((b) => b.id) },
      };
    }

    case 'update_story_block': {
      const sc =
        project.scenes.find((s) => s.blocks.some((b) => b.id === String(args.blockId))) ??
        findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const idx = sc.blocks.findIndex((b) => b.id === String(args.blockId));
      if (idx < 0) return { ok: false, mutated: false, output: { error: '未找到指定卡片' } };
      const cur = sc.blocks[idx];
      const patch = (args.patch && typeof args.patch === 'object' ? args.patch : {}) as Record<string, unknown>;
      const mergedSpec: Record<string, unknown> = { ...cur, ...patch, type: patch.type || cur.type };
      const rebuilt = buildBlockFromSpec(mergedSpec);
      rebuilt.id = cur.id;
      sc.blocks[idx] = rebuilt;
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已更新「${sc.name}」第 ${idx + 1} 张卡片`,
        output: { blockId: rebuilt.id, type: rebuilt.type },
      };
    }

    case 'update_dialogue_block': {
      const sc =
        project.scenes.find((s) => s.blocks.some((b) => b.id === String(args.blockId))) ??
        findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const blk = sc.blocks.find((b) => b.id === String(args.blockId));
      if (!blk || blk.type !== 'dialogue') {
        return { ok: false, mutated: false, output: { error: '未找到指定对白卡片' } };
      }
      if (typeof args.text === 'string') blk.text = args.text;
      if (typeof args.speakerName === 'string') blk.speakerId = findOrCreateCharByName(args.speakerName);
      if (typeof args.dynamicName === 'string') blk.dynamicName = args.dynamicName || undefined;
      if (typeof args.expression === 'string') blk.expression = args.expression || undefined;
      if (typeof args.outfit === 'string') blk.outfit = args.outfit || undefined;
      if (typeof args.nvlMode === 'boolean') blk.nvlMode = args.nvlMode;
      if (typeof args.voiceAssetName === 'string') {
        blk.voiceAssetId = findAsset(args.voiceAssetName, 'voice')?.id;
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已更新「${sc.name}」中的对白内容`,
        output: { blockId: blk.id, text: blk.text },
      };
    }

    case 'delete_or_reorder_blocks': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      let removed = 0;
      if (Array.isArray(args.deleteBlockIds) && args.deleteBlockIds.length > 0) {
        const delSet = new Set(args.deleteBlockIds.map(String));
        const beforeLen = sc.blocks.length;
        sc.blocks = sc.blocks.filter((b) => !delSet.has(b.id));
        removed = beforeLen - sc.blocks.length;
      }
      if (typeof args.moveBlockId === 'string' && args.moveToIndex !== undefined) {
        const fromIdx = sc.blocks.findIndex((b) => b.id === args.moveBlockId);
        if (fromIdx >= 0) {
          const [moved] = sc.blocks.splice(fromIdx, 1);
          const toIdx = Math.max(0, Math.min(sc.blocks.length, Number(args.moveToIndex) || 0));
          sc.blocks.splice(toIdx, 0, moved);
        }
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: removed > 0 ? `已从「${sc.name}」移除 ${removed} 张卡片` : `已调整「${sc.name}」卡片顺序`,
        output: { removedCount: removed, remainingBlockCount: sc.blocks.length },
      };
    }

    case 'create_character': {
      const charName = String(args.name || '').trim();
      if (!charName) return { ok: false, mutated: false, output: { error: '角色名称不能为空' } };
      const existing = project.characters.find((c) => c.name === charName);
      if (existing) {
        if (typeof args.color === 'string') existing.color = args.color;
        if (typeof args.description === 'string') existing.description = args.description;
        if (typeof args.nvlDefault === 'boolean') existing.nvlDefault = args.nvlDefault;
        if (args.avatarAssetName) existing.avatarAssetId = findAsset(args.avatarAssetName)?.id;
        if (args.dialogueBoxBgAssetName) existing.dialogueBoxBgAssetId = findAsset(args.dialogueBoxBgAssetName, 'ui')?.id;
        if (args.fontAssetName) existing.fontAssetId = findAsset(args.fontAssetName, 'font')?.id;
        return { ok: true, mutated: true, target: charName, output: { id: existing.id, updatedExisting: true } };
      }
      const ch = {
        id: createId('ch'),
        name: charName,
        color: String(args.color || '#C96442'),
        description: typeof args.description === 'string' ? args.description : undefined,
        nvlDefault: typeof args.nvlDefault === 'boolean' ? args.nvlDefault : undefined,
        avatarAssetId: args.avatarAssetName ? findAsset(args.avatarAssetName)?.id : undefined,
        dialogueBoxBgAssetId: args.dialogueBoxBgAssetName ? findAsset(args.dialogueBoxBgAssetName, 'ui')?.id : undefined,
        fontAssetId: args.fontAssetName ? findAsset(args.fontAssetName, 'font')?.id : undefined,
        expressions: [],
      };
      project.characters.push(ch);
      return {
        ok: true,
        mutated: true,
        target: charName,
        summary: `已创建角色「${charName}」`,
        output: { id: ch.id, name: ch.name },
      };
    }

    case 'update_or_delete_character': {
      const q = String(args.characterId || args.name || '').trim();
      const ch = project.characters.find((c) => c.id === q || c.name === q);
      if (!ch) return { ok: false, mutated: false, output: { error: `未找到角色：${q}` } };
      if (args.action === 'delete') {
        project.characters = project.characters.filter((c) => c.id !== ch.id);
        for (const sc of project.scenes) {
          for (const b of sc.blocks) {
            if (b.type === 'dialogue' && b.speakerId === ch.id) b.speakerId = null;
          }
        }
        return {
          ok: true,
          mutated: true,
          target: ch.name,
          summary: `已删除角色「${ch.name}」`,
          output: { deletedCharacterId: ch.id },
        };
      }
      if (typeof args.name === 'string' && args.name.trim()) ch.name = args.name.trim();
      if (typeof args.color === 'string') ch.color = args.color;
      if (typeof args.description === 'string') ch.description = args.description;
      if (typeof args.nvlDefault === 'boolean') ch.nvlDefault = args.nvlDefault;
      if (args.avatarAssetName !== undefined) {
        ch.avatarAssetId = args.avatarAssetName ? findAsset(args.avatarAssetName)?.id : undefined;
      }
      if (args.dialogueBoxBgAssetName !== undefined) {
        ch.dialogueBoxBgAssetId = args.dialogueBoxBgAssetName ? findAsset(args.dialogueBoxBgAssetName, 'ui')?.id : undefined;
      }
      if (args.fontAssetName !== undefined) {
        ch.fontAssetId = args.fontAssetName ? findAsset(args.fontAssetName, 'font')?.id : undefined;
      }
      if (Array.isArray(args.removeExpressionNames)) {
        const rm = new Set(args.removeExpressionNames.map(String));
        ch.expressions = ch.expressions.filter((e) => !rm.has(e.name));
      }
      if (Array.isArray(args.addExpressions)) {
        for (const rawExp of args.addExpressions as Array<Record<string, unknown>>) {
          const ast = findAsset(rawExp.assetName, 'sprite');
          if (!ast) continue;
          const expName = String(rawExp.name || '默认').trim();
          const existExp = ch.expressions.find((e) => e.name === expName);
          if (existExp) {
            existExp.assetId = ast.id;
            if (typeof rawExp.outfit === 'string') existExp.outfit = rawExp.outfit;
          } else {
            ch.expressions.push({
              id: createId('exp'),
              name: expName,
              outfit: typeof rawExp.outfit === 'string' ? rawExp.outfit : undefined,
              assetId: ast.id,
              order: ch.expressions.length,
            });
          }
        }
      }
      return {
        ok: true,
        mutated: true,
        target: ch.name,
        summary: `已更新角色「${ch.name}」`,
        output: ch,
      };
    }

    case 'create_story_variable': {
      const vName = String(args.name || '').trim();
      const vType = (['number', 'boolean', 'string'].includes(String(args.type)) ? args.type : 'number') as
        | 'number'
        | 'boolean'
        | 'string';
      const v = findOrCreateVarByName(vName, vType);
      v.type = vType;
      if (args.initialValue !== undefined) {
        v.initialValue =
          vType === 'number'
            ? Number(args.initialValue) || 0
            : vType === 'boolean'
            ? Boolean(args.initialValue)
            : String(args.initialValue);
      }
      if (typeof args.persistent === 'boolean') v.persistent = args.persistent;
      if (['affection', 'flag', 'general'].includes(String(args.category))) {
        v.category = args.category as 'affection' | 'flag' | 'general';
      }
      if (typeof args.linkedCharacterName === 'string' && args.linkedCharacterName.trim()) {
        v.linkedCharacterId = findOrCreateCharByName(args.linkedCharacterName) ?? undefined;
      }
      if (typeof args.description === 'string') v.description = args.description;
      return {
        ok: true,
        mutated: true,
        target: v.name,
        summary: `已配置故事状态「${v.name}」`,
        output: v,
      };
    }

    case 'update_or_delete_variable': {
      const q = String(args.variableId || args.name || '').trim();
      const v = project.variables.find((x) => x.id === q || x.name === q);
      if (!v) return { ok: false, mutated: false, output: { error: `未找到故事状态：${q}` } };
      if (args.action === 'delete') {
        project.variables = project.variables.filter((x) => x.id !== v.id);
        return {
          ok: true,
          mutated: true,
          target: v.name,
          summary: `已删除故事状态「${v.name}」`,
          output: { deletedVariableId: v.id },
        };
      }
      if (typeof args.name === 'string' && args.name.trim()) v.name = args.name.trim();
      if (['number', 'boolean', 'string'].includes(String(args.type))) {
        v.type = args.type as 'number' | 'boolean' | 'string';
      }
      if (args.initialValue !== undefined) {
        v.initialValue =
          v.type === 'number'
            ? Number(args.initialValue) || 0
            : v.type === 'boolean'
            ? Boolean(args.initialValue)
            : String(args.initialValue);
      }
      if (typeof args.persistent === 'boolean') v.persistent = args.persistent;
      if (['affection', 'flag', 'general'].includes(String(args.category))) {
        v.category = args.category as 'affection' | 'flag' | 'general';
      }
      if (typeof args.linkedCharacterName === 'string') {
        v.linkedCharacterId = args.linkedCharacterName.trim()
          ? findOrCreateCharByName(args.linkedCharacterName) ?? undefined
          : undefined;
      }
      if (typeof args.description === 'string') v.description = args.description;
      return {
        ok: true,
        mutated: true,
        target: v.name,
        summary: `已更新故事状态「${v.name}」`,
        output: v,
      };
    }

    case 'create_scene': {
      const nameStr = String(args.name || '新场景').trim();
      const ch = findChapter(args.chapterId);
      const chapterId = ch?.id ?? project.chapters[0]?.id ?? null;
      const blocks: StoryBlock[] = [];
      if (Array.isArray(args.lines)) {
        for (const l of args.lines as Array<Record<string, unknown>>) {
          blocks.push({
            id: createId('blk'),
            type: 'dialogue',
            speakerId: findOrCreateCharByName(typeof l.speakerName === 'string' ? l.speakerName : null),
            expression: typeof l.expression === 'string' ? l.expression : undefined,
            text: String(l.text || ''),
          });
        }
      }
      if (typeof args.endingTitle === 'string' && args.endingTitle.trim()) {
        blocks.push({
          id: createId('blk'),
          type: 'flow',
          action: 'ending',
          endingId: createId('end'),
          endingTitle: args.endingTitle.trim(),
        });
      }
      const nextSc =
        typeof args.nextSceneId === 'string' && args.nextSceneId.trim()
          ? findScene(args.nextSceneId)?.id ?? args.nextSceneId.trim()
          : null;
      const newScene = {
        id: createId('sc'),
        chapterId,
        name: nameStr,
        order: project.scenes.length,
        disabled: false,
        summary: typeof args.summary === 'string' ? args.summary : undefined,
        nextSceneId: nextSc,
        blocks,
      };
      project.scenes.push(newScene);
      return {
        ok: true,
        mutated: true,
        target: nameStr,
        summary: `已创建场景「${nameStr}」（含 ${blocks.length} 项内容）`,
        output: { sceneId: newScene.id, name: newScene.name },
      };
    }

    case 'update_or_delete_scene': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到指定场景' } };
      if (args.action === 'delete') {
        if (project.scenes.length <= 1) {
          return { ok: false, mutated: false, output: { error: '项目中至少需要保留一个场景' } };
        }
        project.scenes = project.scenes.filter((s) => s.id !== sc.id);
        if (project.meta.startSceneId === sc.id) {
          project.meta.startSceneId = project.scenes[0].id;
        }
        for (const s of project.scenes) {
          if (s.nextSceneId === sc.id) s.nextSceneId = null;
        }
        return {
          ok: true,
          mutated: true,
          target: sc.name,
          summary: `已删除场景「${sc.name}」`,
          output: { deletedSceneId: sc.id },
        };
      }
      if (typeof args.name === 'string' && args.name.trim()) sc.name = args.name.trim();
      if (typeof args.chapterId === 'string') {
        const ch = findChapter(args.chapterId);
        sc.chapterId = ch ? ch.id : null;
      }
      if (args.nextSceneId !== undefined) {
        if (!args.nextSceneId || String(args.nextSceneId).trim() === '') {
          sc.nextSceneId = null;
        } else {
          const nextSc = findScene(args.nextSceneId);
          sc.nextSceneId = nextSc ? nextSc.id : String(args.nextSceneId);
        }
      }
      if (typeof args.disabled === 'boolean') sc.disabled = args.disabled;
      if (typeof args.summary === 'string') sc.summary = args.summary;
      if (args.order !== undefined) sc.order = Number(args.order);
      if (args.setAsStartScene === true) project.meta.startSceneId = sc.id;
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已更新场景「${sc.name}」`,
        output: { sceneId: sc.id, name: sc.name, nextSceneId: sc.nextSceneId, disabled: sc.disabled },
      };
    }

    case 'add_choice_branch': {
      const sc = findScene(args.sceneId);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const rawOpts = Array.isArray(args.options) ? (args.options as Array<Record<string, unknown>>) : [];
      const builtOptions = buildChoiceOptionsFromRaw(rawOpts);
      const choiceBlock: ChoiceBlock = {
        id: createId('blk'),
        type: 'choice',
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
        speakerId: typeof args.speakerName === 'string' ? findOrCreateCharByName(args.speakerName) : null,
        options: builtOptions,
      };
      if (typeof args.insertAfterBlockId === 'string') {
        const idx = sc.blocks.findIndex((b) => b.id === args.insertAfterBlockId);
        if (idx >= 0) sc.blocks.splice(idx + 1, 0, choiceBlock);
        else sc.blocks.push(choiceBlock);
      } else {
        sc.blocks.push(choiceBlock);
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已在「${sc.name}」添加 ${builtOptions.length} 项分支选择`,
        output: { blockId: choiceBlock.id, optionCount: builtOptions.length },
      };
    }

    case 'list_assets': {
      const usageMap = computeAssetUsageMap(project);
      const missingSet = new Set(findMissingAssetIds(projectDir, project));
      const catFilter = typeof args.category === 'string' && args.category !== 'all' ? args.category : null;
      const q = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
      const filtered = project.assets.filter((a) => {
        if (catFilter && a.category !== catFilter) return false;
        if (args.unusedOnly && (usageMap[a.id]?.length ?? 0) > 0) return false;
        if (q && !a.name.toLowerCase().includes(q) && !a.originalName.toLowerCase().includes(q)) return false;
        return true;
      });
      return {
        ok: true,
        mutated: false,
        target: '素材库',
        summary: `已查询到 ${filtered.length} 个素材`,
        output: {
          totalAssets: project.assets.length,
          matchedCount: filtered.length,
          assets: filtered.map((a) => ({
            id: a.id,
            name: a.name,
            category: a.category,
            isCg: Boolean(a.isCg),
            cgTitle: a.cgTitle,
            usageCount: usageMap[a.id]?.length ?? 0,
            missingOnDisk: missingSet.has(a.id),
          })),
        },
      };
    }

    case 'update_asset_metadata': {
      const ast = findAsset(args.assetId ?? args.name);
      if (!ast) return { ok: false, mutated: false, output: { error: '未找到指定素材' } };
      if (typeof args.name === 'string' && args.name.trim()) ast.name = args.name.trim();
      if (
        typeof args.category === 'string' &&
        ['background', 'sprite', 'bgm', 'se', 'voice', 'video', 'font', 'ui'].includes(args.category)
      ) {
        ast.category = args.category as AssetCategory;
      }
      if (typeof args.isCg === 'boolean') ast.isCg = args.isCg;
      if (typeof args.cgTitle === 'string') ast.cgTitle = args.cgTitle.trim() || undefined;
      return {
        ok: true,
        mutated: true,
        target: ast.name,
        summary: `已更新素材「${ast.name}」属性`,
        output: ast,
      };
    }

    case 'get_appearance_and_extensions': {
      return {
        ok: true,
        mutated: false,
        target: '游戏外观与扩展',
        output: {
          appearance: project.appearance,
          availableThemePresets: Object.entries(APPEARANCE_PRESETS).map(([id, p]) => ({
            id,
            name: p.name,
            description: p.description,
          })),
          extensions: project.extensions,
        },
      };
    }

    case 'update_appearance': {
      const app = project.appearance;
      if (
        typeof args.themePreset === 'string' &&
        args.themePreset in APPEARANCE_PRESETS
      ) {
        const pid = args.themePreset as ThemePresetId;
        const preset = APPEARANCE_PRESETS[pid];
        app.themePreset = pid;
        app.theme = { ...preset.theme };
        app.dialogueBox = { ...app.dialogueBox, ...preset.dialogueBox };
        app.buttons = { ...preset.buttons };
      }
      if (args.theme && typeof args.theme === 'object') {
        Object.assign(app.theme, args.theme);
      }
      if (args.font && typeof args.font === 'object') {
        const f = args.font as Record<string, unknown>;
        if (f.globalFontAssetName !== undefined) {
          app.font.globalFontAssetId = f.globalFontAssetName
            ? findAsset(f.globalFontAssetName, 'font')?.id ?? null
            : null;
        }
        if (f.baseSize !== undefined) app.font.baseSize = Number(f.baseSize);
        if (f.interfaceSize !== undefined) app.font.interfaceSize = Number(f.interfaceSize);
      }
      if (args.dialogueBox && typeof args.dialogueBox === 'object') {
        const db = { ...(args.dialogueBox as Record<string, unknown>) };
        if (db.fontAssetName !== undefined) {
          app.dialogueBox.fontAssetId = db.fontAssetName
            ? findAsset(db.fontAssetName, 'font')?.id ?? null
            : null;
          delete db.fontAssetName;
        }
        if (db.backgroundAssetName !== undefined) {
          app.dialogueBox.backgroundAssetId = db.backgroundAssetName
            ? findAsset(db.backgroundAssetName, 'ui')?.id ?? null
            : null;
          delete db.backgroundAssetName;
        }
        Object.assign(app.dialogueBox, db);
      }
      if (args.buttons && typeof args.buttons === 'object') {
        Object.assign(app.buttons, args.buttons);
      }
      if (args.window && typeof args.window === 'object') {
        const w = { ...(args.window as Record<string, unknown>) };
        if (w.iconAssetName !== undefined) {
          app.window.iconAssetId = w.iconAssetName ? findAsset(w.iconAssetName)?.id ?? null : null;
          delete w.iconAssetName;
        }
        Object.assign(app.window, w);
      }
      if (typeof args.saveAsPresetName === 'string' && args.saveAsPresetName.trim()) {
        app.dialogueBox.savedPresets.push({
          id: createId('dbp'),
          name: args.saveAsPresetName.trim(),
          fontSize: app.dialogueBox.fontSize,
          fontWeight: app.dialogueBox.fontWeight,
          lineHeight: app.dialogueBox.lineHeight,
          letterSpacing: app.dialogueBox.letterSpacing,
          textColor: app.dialogueBox.textColor,
          nameColor: app.dialogueBox.nameColor,
          textShadow: app.dialogueBox.textShadow,
          shadowColor: app.dialogueBox.shadowColor,
          paddingX: app.dialogueBox.paddingX,
          paddingY: app.dialogueBox.paddingY,
          nameFontSize: app.dialogueBox.nameFontSize,
          boxHeight: app.dialogueBox.boxHeight,
          boxBgColor: app.dialogueBox.boxBgColor,
          boxOpacity: app.dialogueBox.boxOpacity,
          typingCps: app.dialogueBox.typingCps,
        });
      }
      return {
        ok: true,
        mutated: true,
        target: '游戏外观',
        summary: '已更新游戏外观配置',
        output: project.appearance,
      };
    }

    case 'update_extensions': {
      const ext = project.extensions;
      if (args.galleryAndEndings && typeof args.galleryAndEndings === 'object') {
        Object.assign(ext.galleryAndEndings, args.galleryAndEndings);
      }
      if (args.sixSlotSaveScreen && typeof args.sixSlotSaveScreen === 'object') {
        Object.assign(ext.sixSlotSaveScreen, args.sixSlotSaveScreen);
      }
      if (args.playerCustomName && typeof args.playerCustomName === 'object') {
        Object.assign(ext.playerCustomName, args.playerCustomName);
      }
      if (args.autoSaveBeforeChoice && typeof args.autoSaveBeforeChoice === 'object') {
        Object.assign(ext.autoSaveBeforeChoice, args.autoSaveBeforeChoice);
      }
      if (args.chapterTitleCard && typeof args.chapterTitleCard === 'object') {
        Object.assign(ext.chapterTitleCard, args.chapterTitleCard);
      }
      if (args.affectionSystem && typeof args.affectionSystem === 'object') {
        const aff = args.affectionSystem as Record<string, unknown>;
        if (typeof aff.enabled === 'boolean') ext.affectionSystem.enabled = aff.enabled;
        if (aff.autoGenerateForAllCharacters === true) {
          ext.affectionSystem.enabled = true;
          for (const ch of project.characters) {
            const vName = `${ch.name}好感度`;
            const v = findOrCreateVarByName(vName, 'number');
            v.persistent = true;
            v.category = 'affection';
            v.linkedCharacterId = ch.id;
            if (!ext.affectionSystem.tracks.some((t) => t.characterId === ch.id)) {
              ext.affectionSystem.tracks.push({
                characterId: ch.id,
                variableId: v.id,
                maxVal: 10,
                label: vName,
              });
            }
          }
        }
        if (Array.isArray(aff.tracks)) {
          ext.affectionSystem.tracks = (aff.tracks as Array<Record<string, unknown>>).map((tr) => {
            const cid =
              findOrCreateCharByName(String(tr.characterName || '角色')) ??
              project.characters[0]?.id ??
              createId('ch');
            const cName = project.characters.find((c) => c.id === cid)?.name ?? '角色';
            const v = findOrCreateVarByName(String(tr.variableName || `${cName}好感度`), 'number');
            v.persistent = true;
            return {
              characterId: cid,
              variableId: v.id,
              maxVal: Number(tr.maxVal) || 10,
              label: String(tr.label || v.name),
            };
          });
        }
      }
      return {
        ok: true,
        mutated: true,
        target: '扩展市场',
        summary: '已更新扩展市场系统配置',
        output: project.extensions,
      };
    }

    case 'get_localization_strings':
    case 'manage_language':
    case 'set_localization_translations': {
      const LANG_ALIASES: Record<string, { code: string; name: string }> = {
        en: { code: 'en', name: 'English（英语）' },
        english: { code: 'en', name: 'English（英语）' },
        英语: { code: 'en', name: 'English（英语）' },
        英文: { code: 'en', name: 'English（英语）' },
        ja: { code: 'ja', name: '日本語（日语）' },
        jp: { code: 'ja', name: '日本語（日语）' },
        japanese: { code: 'ja', name: '日本語（日语）' },
        日语: { code: 'ja', name: '日本語（日语）' },
        日文: { code: 'ja', name: '日本語（日语）' },
        日本語: { code: 'ja', name: '日本語（日语）' },
        ko: { code: 'ko', name: '한국어（韩语）' },
        kr: { code: 'ko', name: '한국어（韩语）' },
        korean: { code: 'ko', name: '한국어（韩语）' },
        韩语: { code: 'ko', name: '한국어（韩语）' },
        韩文: { code: 'ko', name: '한국어（韩语）' },
        한국어: { code: 'ko', name: '한국어（韩语）' },
        zh_tw: { code: 'zh_TW', name: '繁體中文' },
        'zh-tw': { code: 'zh_TW', name: '繁體中文' },
        cht: { code: 'zh_TW', name: '繁體中文' },
        繁体: { code: 'zh_TW', name: '繁體中文' },
        繁体中文: { code: 'zh_TW', name: '繁體中文' },
        繁體中文: { code: 'zh_TW', name: '繁體中文' },
        es: { code: 'es', name: 'Español（西班牙语）' },
        spanish: { code: 'es', name: 'Español（西班牙语）' },
        西班牙语: { code: 'es', name: 'Español（西班牙语）' },
        ru: { code: 'ru', name: 'Русский（俄语）' },
        russian: { code: 'ru', name: 'Русский（俄语）' },
        俄语: { code: 'ru', name: 'Русский（俄语）' },
      };

      const resolveLanguageInfo = (rawInput?: unknown, customName?: unknown) => {
        const raw = typeof rawInput === 'string' && rawInput.trim() ? rawInput.trim() : context.activeLanguageCode || 'en';
        const lower = raw.toLowerCase();
        const existing =
          project.localization.languages.find(
            (l) =>
              l.code.toLowerCase() === lower ||
              l.name.toLowerCase() === lower ||
              l.name.toLowerCase().includes(lower)
          ) ??
          (LANG_ALIASES[lower]
            ? project.localization.languages.find((l) => l.code === LANG_ALIASES[lower].code)
            : undefined);
        if (existing) return { entry: existing, code: existing.code, name: existing.name };
        const preset = LANG_ALIASES[lower] ?? {
          code: raw.replace(/[^a-zA-Z0-9_]/g, '_') || 'en',
          name: typeof customName === 'string' && customName.trim() ? customName.trim() : raw,
        };
        return {
          entry: undefined,
          code: preset.code,
          name: typeof customName === 'string' && customName.trim() ? customName.trim() : preset.name,
        };
      };

      if (name === 'get_localization_strings') {
        const allStrings = extractLocalizableStrings(project);
        const info = resolveLanguageInfo(args.langCode ?? project.localization.languages[0]?.code);
        const langEntry = info.entry ?? project.localization.languages[0];
        const targetSc = args.sceneId ? findScene(args.sceneId) : undefined;

        const filtered = allStrings.filter((s) => {
          if (targetSc && s.sceneId && s.sceneId !== targetSc.id) return false;
          const tr = langEntry?.translations[s.key]?.trim() ?? '';
          if (args.onlyUntranslated && tr.length > 0) return false;
          return true;
        });

        const offset = Math.max(0, Number(args.offset) || 0);
        const limit = Math.max(1, Math.min(300, Number(args.limit) || 120));
        const page = filtered.slice(offset, offset + limit);

        return {
          ok: true,
          mutated: false,
          target: langEntry ? `多语言 · ${langEntry.name}` : '多语言本地化',
          summary: `已读取 ${page.length} 条可翻译词条`,
          output: {
            configuredLanguages: project.localization.languages.map((l) => {
              const done = allStrings.filter((s) => Boolean(l.translations[s.key]?.trim())).length;
              return {
                code: l.code,
                name: l.name,
                translatedCount: done,
                totalCount: allStrings.length,
                completionPercent: allStrings.length > 0 ? Math.round((done / allStrings.length) * 100) : 100,
              };
            }),
            activeLanguage: langEntry ? { code: langEntry.code, name: langEntry.name } : null,
            totalMatched: filtered.length,
            offset,
            limit,
            strings: page.map((s) => ({
              key: s.key,
              sourceText: s.sourceText,
              context: s.context,
              translatedText: langEntry?.translations[s.key] ?? '',
            })),
          },
        };
      }

      if (name === 'manage_language') {
        const act = String(args.action || 'add');
        const info = resolveLanguageInfo(args.langCode, args.name);
        if (act === 'delete') {
          if (!info.entry) {
            return { ok: false, mutated: false, output: { error: `未找到语言：${info.code}` } };
          }
          project.localization.languages = project.localization.languages.filter((l) => l.code !== info.entry!.code);
          return {
            ok: true,
            mutated: true,
            target: `多语言 · ${info.entry.name}`,
            summary: `已移除语言「${info.entry.name}」`,
            output: { deletedCode: info.entry.code },
          };
        }

        let targetLang = info.entry;
        if (!targetLang) {
          targetLang = {
            code: info.code,
            name: info.name,
            fontAssetId: null,
            imageOverrides: {},
            translations: {},
          };
          project.localization.languages.push(targetLang);
        } else if (typeof args.name === 'string' && args.name.trim()) {
          targetLang.name = args.name.trim();
        }

        if (args.fontAssetName !== undefined) {
          targetLang.fontAssetId = args.fontAssetName
            ? findAsset(args.fontAssetName, 'font')?.id ?? null
            : null;
        }
        if (args.imageOverrides && typeof args.imageOverrides === 'object') {
          for (const [origKey, replKey] of Object.entries(args.imageOverrides as Record<string, unknown>)) {
            const origAst = findAsset(origKey);
            const replAst = findAsset(replKey);
            if (origAst && replAst) {
              targetLang.imageOverrides[origAst.id] = replAst.id;
            }
          }
        }
        return {
          ok: true,
          mutated: true,
          target: `多语言 · ${targetLang.name}`,
          summary: `已配置目标语言「${targetLang.name} (${targetLang.code})」`,
          output: { code: targetLang.code, name: targetLang.name, fontAssetId: targetLang.fontAssetId },
        };
      }

      // set_localization_translations
      const info = resolveLanguageInfo(args.langCode, args.languageName);
      let targetLang = info.entry;
      if (!targetLang) {
        targetLang = {
          code: info.code,
          name: info.name,
          fontAssetId: null,
          imageOverrides: {},
          translations: {},
        };
        project.localization.languages.push(targetLang);
      }

      const allStrings = extractLocalizableStrings(project);
      const validKeySet = new Set(allStrings.map((s) => s.key));
      const rawEntries = Array.isArray(args.entries) ? (args.entries as Array<Record<string, unknown>>) : [];
      let updatedCount = 0;

      for (const item of rawEntries) {
        const text = typeof item.text === 'string' ? item.text.trim() : '';
        if (!text) continue;
        const rawKey = typeof item.key === 'string' ? item.key.trim() : '';
        const rawSource = typeof item.sourceText === 'string' ? item.sourceText.trim() : '';

        if (rawKey && validKeySet.has(rawKey)) {
          targetLang.translations[rawKey] = text;
          updatedCount += 1;
          continue;
        }

        // Tolerant fallback: match by sourceText or partial key if model omitted/mistyped exact key
        const matchedBySource = allStrings.filter(
          (s) =>
            (rawSource && s.sourceText.trim() === rawSource) ||
            (rawKey && (s.sourceText.trim() === rawKey || s.key.endsWith(rawKey)))
        );
        if (matchedBySource.length > 0) {
          for (const m of matchedBySource) {
            targetLang.translations[m.key] = text;
            updatedCount += 1;
          }
        } else if (rawKey) {
          targetLang.translations[rawKey] = text;
          updatedCount += 1;
        }
      }

      const doneCount = allStrings.filter((s) => Boolean(targetLang!.translations[s.key]?.trim())).length;
      const pct = allStrings.length > 0 ? Math.round((doneCount / allStrings.length) * 100) : 100;
      return {
        ok: true,
        mutated: true,
        target: `多语言 · ${targetLang.name}`,
        summary: `已为「${targetLang.name}」填入 ${updatedCount} 条译文（总进度 ${doneCount}/${allStrings.length}，${pct}%）`,
        output: {
          code: targetLang.code,
          name: targetLang.name,
          updatedCount,
          translatedCount: doneCount,
          totalCount: allStrings.length,
          completionPercent: pct,
        },
      };
    }

    case 'update_flow_layout': {
      if (args.direction === 'TB' || args.direction === 'LR') {
        project.flowLayout.direction = args.direction;
      }
      if (typeof args.showCausalLinks === 'boolean') {
        project.flowLayout.showCausalLinks = args.showCausalLinks;
      }
      if (args.resetAutoLayout === true) {
        project.flowLayout.nodePositions = {};
      }
      return {
        ok: true,
        mutated: true,
        target: '选线流程图',
        summary: '已更新选线流程图布局设置',
        output: project.flowLayout,
      };
    }

    case 'manage_reuse_library': {
      const act = String(args.action || 'list');
      if (act === 'list') {
        const items = listReuseItems();
        return {
          ok: true,
          mutated: false,
          target: '跨项目复用库',
          summary: `已读取 ${items.length} 个复用项`,
          output: items.map((i) => ({
            id: i.id,
            kind: i.kind,
            name: i.name,
            description: i.description,
            sourceProjectTitle: i.sourceProjectTitle,
            createdAt: i.createdAt,
          })),
        };
      }
      if (act === 'save') {
        const kind = (['character', 'chapter', 'scene', 'snippet'].includes(String(args.kind))
          ? args.kind
          : 'character') as ReuseItemKind;
        let resolvedSourceId = String(args.sourceId || '');
        if (kind === 'character') {
          const ch = project.characters.find((c) => c.id === resolvedSourceId || c.name === resolvedSourceId) ?? project.characters[0];
          resolvedSourceId = ch?.id ?? '';
        } else if (kind === 'chapter') {
          const ch = findChapter(resolvedSourceId) ?? project.chapters[0];
          resolvedSourceId = ch?.id ?? '';
        } else {
          const sc = findScene(resolvedSourceId);
          resolvedSourceId = sc?.id ?? '';
        }
        const saved = saveToReuseLibrary({
          kind,
          name: String(args.name || '复用模板'),
          description: typeof args.description === 'string' ? args.description : undefined,
          project,
          sourceId: resolvedSourceId,
          blockIds: Array.isArray(args.blockIds) ? args.blockIds.map(String) : undefined,
        });
        return {
          ok: true,
          mutated: false,
          target: saved.name,
          summary: `已将「${saved.name}」保存到跨项目复用库`,
          output: { id: saved.id, kind: saved.kind, name: saved.name },
        };
      }
      // import
      const allItems = listReuseItems();
      const q = String(args.itemId || args.name || '').trim();
      const targetItem = allItems.find((i) => i.id === q || i.name === q || i.name.includes(q));
      if (!targetItem) {
        return { ok: false, mutated: false, output: { error: `复用库中未找到：${q}` } };
      }
      const targetSc = args.targetSceneId ? findScene(args.targetSceneId) : findScene();
      const imported = importFromReuseLibrary({
        itemId: targetItem.id,
        project,
        targetSceneId: targetSc?.id,
      });
      Object.assign(project, imported.updatedProject);
      return {
        ok: true,
        mutated: true,
        target: targetItem.name,
        summary: imported.summary,
        output: { importedItemId: targetItem.id, summary: imported.summary },
      };
    }

    case 'read_custom_rpy': {
      const fn = path.basename(String(args.fileName || ''));
      if (!fn.startsWith('custom_') || !fn.endsWith('.rpy')) {
        return { ok: false, mutated: false, output: { error: '仅允许读写 custom_*.rpy 文件' } };
      }
      const full = path.join(projectDir, 'game', fn);
      if (!fs.existsSync(full)) {
        return { ok: false, mutated: false, output: { error: `文件不存在：${fn}` } };
      }
      const cleanName = fn.replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return {
        ok: true,
        mutated: false,
        target: `自定义扩展 · ${cleanName}`,
        output: { fileName: fn, content: fs.readFileSync(full, 'utf8') },
      };
    }

    case 'write_custom_rpy': {
      let fn = path.basename(String(args.fileName || 'custom_feature.rpy'));
      if (!fn.startsWith('custom_')) fn = `custom_${fn}`;
      if (!fn.endsWith('.rpy')) fn = `${fn}.rpy`;
      const content = String(args.content || '');
      const full = path.join(projectDir, 'game', fn);
      atomicWriteText(full, content);
      const cleanName = fn.replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return {
        ok: true,
        mutated: true,
        touchedCustomRpy: true,
        target: `自定义扩展 · ${cleanName}`,
        summary: String(args.summary || `已写入自定义功能模块 ${cleanName}`),
        output: { fileName: fn, bytes: Buffer.byteLength(content, 'utf8') },
      };
    }

    case 'delete_custom_rpy': {
      const fn = path.basename(String(args.fileName || ''));
      if (!fn.startsWith('custom_') || !fn.endsWith('.rpy')) {
        return { ok: false, mutated: false, output: { error: '仅允许删除 custom_*.rpy 文件' } };
      }
      const full = path.join(projectDir, 'game', fn);
      if (fs.existsSync(full)) fs.rmSync(full, { force: true });
      const cleanName = fn.replace(/^custom_/, '').replace(/\.rpy$/i, '');
      return {
        ok: true,
        mutated: true,
        target: `自定义扩展 · ${cleanName}`,
        summary: `已移除自定义模块 ${cleanName}`,
        output: { deleted: fn },
      };
    }

    case 'run_project_check': {
      let mutated = false;
      if (args.autoFixOrphanScenes === true) {
        const preIssues = analyzeProjectIssues(project, new Set(findMissingAssetIds(projectDir, project)));
        for (const iss of preIssues) {
          if (iss.code === 'ORPHAN_SCENE' && iss.sceneId) {
            const orphanId = iss.sceneId;
            const anchor =
              project.scenes.find(
                (s) =>
                  s.id !== orphanId &&
                  !s.disabled &&
                  !s.nextSceneId &&
                  !s.blocks.some((b) => b.type === 'flow' && b.action === 'ending')
              ) ?? project.scenes.find((s) => s.id === project.meta.startSceneId);
            if (anchor && anchor.id !== orphanId) {
              anchor.nextSceneId = orphanId;
              mutated = true;
            }
          }
        }
      }
      saveProjectSync(projectDir, project);
      const missingIds = findMissingAssetIds(projectDir, project);
      const issues = analyzeProjectIssues(project, new Set(missingIds));
      const flowGraph = buildNarrativeFlowGraph(project);
      const report = await runRenpyLint(projectDir, project);
      return {
        ok: report.ok && issues.filter((i) => i.severity === 'error').length === 0,
        mutated,
        target: project.meta.title,
        summary:
          report.ok && issues.length === 0
            ? '项目结构与引擎校验全部通过'
            : `检查完成（发现 ${issues.length} 项结构提醒，引擎校验${report.ok ? '通过' : '需修复'}）`,
        output: {
          ok: report.ok,
          structuralIssues: issues.map((i) => ({
            severity: i.severity,
            code: i.code,
            title: i.title,
            whatHappened: i.whatHappened,
            howToFix: i.howToFix,
            sceneId: i.sceneId,
            blockId: i.blockId,
          })),
          flowSummary: {
            segmentNodeCount: flowGraph.nodes.length,
            routeEdgeCount: flowGraph.edges.length,
            mergePointCount: flowGraph.mergeNodeIds.size,
            causalLinkCount: flowGraph.causalEdges.length,
          },
          engineCheckDetails: report.rawOutput.slice(0, 2000),
        },
      };
    }

    default:
      return { ok: false, mutated: false, output: { error: `未知操作：${name}` } };
  }
}

async function callOpenAiCompatibleStream(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessageInternal[];
  tools: unknown[];
  onReasoning?: (delta: string) => void;
  onContent?: (delta: string) => void;
}): Promise<{
  content: string;
  reasoning: string;
  toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>;
}> {
  const endpoint = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        tool_choice: 'auto',
        stream: true,
        temperature: 0.65,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new Error(translateAiErrorToChinese(err));
  }

  if (!response.ok) {
    clearTimeout(timeout);
    const body = await response.text().catch(() => '');
    throw new Error(translateAiErrorToChinese(`HTTP ${response.status} ${body}`));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    clearTimeout(timeout);
    throw new Error('AI 服务未返回有效数据流，请稍后重试。');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let reasoning = '';
  const toolCallAcc = new Map<
    number,
    { id: string; type: 'function'; function: { name: string; arguments: string } }
  >();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                reasoning_content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;
          if (delta.reasoning_content) {
            reasoning += delta.reasoning_content;
            options.onReasoning?.(delta.reasoning_content);
          }
          if (delta.content) {
            content += delta.content;
            options.onContent?.(delta.content);
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const cur = toolCallAcc.get(tc.index) ?? {
                id: tc.id || createId('tc'),
                type: 'function' as const,
                function: { name: '', arguments: '' },
              };
              if (tc.id) cur.id = tc.id;
              if (tc.function?.name) cur.function.name += tc.function.name;
              if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
              toolCallAcc.set(tc.index, cur);
            }
          }
        } catch {}
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  const toolCalls = [...toolCallAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, val]) => val)
    .filter((tc) => tc.function.name);

  return { content, reasoning, toolCalls };
}
