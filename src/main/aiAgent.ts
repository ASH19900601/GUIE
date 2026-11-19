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
  ChoiceBlock,
  ConditionGroup,
  DialogueBlock,
  ProjectData,
  StateEffect,
  StoryBlock,
} from '../shared/types';
import { createId } from '../shared/defaults';
import {
  atomicWriteText,
  createSnapshot,
  getAppUserDataDir,
  saveProjectSync,
} from './projectManager';
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

const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_project_overview',
      description: '读取当前游戏的章节、场景、角色、故事状态变量及已存在的自定义扩展文件清单。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_scene_blocks',
      description: '读取指定场景中的所有剧情卡片内容（对白、选项、背景、立绘、状态变更等）。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string', description: '场景 ID（可省略，默认读取当前场景）' },
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
          sceneId: { type: 'string', description: '目标场景 ID' },
          insertAfterBlockId: { type: 'string', description: '可选：插在某张卡片之后；省略则追加到末尾' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speakerName: { type: 'string', description: '说话角色名；留空或 null 表示旁白' },
                text: { type: 'string', description: '对白或旁白内容' },
                expression: { type: 'string', description: '可选：表情名' },
                nvlMode: { type: 'boolean', description: '可选：是否使用全屏独白模式' },
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
      name: 'update_dialogue_block',
      description: '润色或修改场景中指定对白卡片的文字、说话人或表情。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          blockId: { type: 'string' },
          text: { type: 'string' },
          speakerName: { type: 'string' },
        },
        required: ['sceneId', 'blockId', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_character',
      description: '在项目中创建一名新角色（若同名角色已存在则直接返回该角色）。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          color: { type: 'string', description: 'HEX 颜色，如 #E06D53' },
          description: { type: 'string' },
        },
        required: ['name'],
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
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_scene',
      description: '创建一个新场景，可指定其所属章节、初始对白、以及后续自动衔接的场景 ID。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          chapterId: { type: 'string' },
          nextSceneId: { type: 'string', description: '可选：该场景结束后自动连接的后续场景（如路线汇合点）' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                speakerName: { type: 'string' },
                text: { type: 'string' },
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
      name: 'add_choice_branch',
      description: '在指定场景中插入玩家多选项分支卡片，支持句子式条件规则、状态变更效果和跳转目标场景或结局。',
      parameters: {
        type: 'object',
        properties: {
          sceneId: { type: 'string' },
          prompt: { type: 'string', description: '选择前的提示语' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                targetType: { type: 'string', enum: ['scene', 'ending', 'continue'] },
                targetSceneId: { type: 'string' },
                endingTitle: { type: 'string' },
                conditionVariableName: { type: 'string', description: '可选：条件判断的故事状态名称' },
                conditionOperator: { type: 'string', enum: ['>=', '>', '==', '!=', '<=', '<', 'is_true', 'is_false'] },
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
        required: ['sceneId', 'options'],
      },
    },
  },
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
  {
    type: 'function',
    function: {
      name: 'run_project_check',
      description: '运行真实 Ren\'Py 引擎校验，检查当前项目及所有自定义扩展脚本是否存在语法或引用错误。',
      parameters: { type: 'object', properties: {}, required: [] },
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
  const systemPrompt = `你是 GUIE 视觉小说创作工坊的内置 AI 创作助手，服务于完全零编程基础的视觉小说创作者。

核心原则：
1. 始终使用自然、亲切、零技术术语的中文向用户汇报（不要提 .rpy、label、jump、Lint、JSON、AST、Diff 等底层词）。
2. 基础剧情需求（写对白、润色台词、创建角色、设计选择分支与条件、路线汇合、创建新场景、修改状态变量）必须优先调用结构化工具（add_dialogue_lines、update_dialogue_block、create_character、create_story_variable、create_scene、add_choice_branch），确保结果在可视化卡片与流程图中完全可继续编辑！
3. 高级定制需求（如手机聊天系统、复杂背包、小游戏、特殊动态界面等超出常规表单的功能）直接调用 write_custom_rpy 在 game/custom_*.rpy 中实现完整可用的功能，并在写完后调用 run_project_check 自动检查与自修复，用户以后再提出“改颜色/加按钮”时先 read_custom_rpy 再更新！
4. 当前创作上下文：
   - 游戏标题：${workingProject.meta.title}
   - 当前页面：${options.context.activeTab}
   - 当前打开的场景：${activeScene ? `${activeScene.name} (ID: ${activeScene.id})` : '无'}
   - 当前选中卡片：${options.context.selectedBlockId ? `${options.context.selectedBlockSummary || options.context.selectedBlockId} (ID: ${options.context.selectedBlockId})` : '无'}
   - 已有角色：${workingProject.characters.map((c) => `${c.name}(${c.id})`).join('、') || '暂无'}
   - 已有故事状态：${workingProject.variables.map((v) => `${v.name}[${v.type}]`).join('、') || '暂无'}
   - 已有场景：${workingProject.scenes.map((s) => `${s.name}(${s.id})`).join('、')}
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

  // Agentic multi-step loop (up to 8 rounds for tool calls + auto lint self-repair)
  for (let round = 0; round < 8; round += 1) {
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
    project.scenes.find((s) => s.id === sid)?.name || '当前场景';

  switch (name) {
    case 'get_project_overview':
      return { action: 'read', target: project.meta.title, summary: '读取游戏结构与角色设定' };
    case 'read_scene_blocks':
      return { action: 'read', target: sceneName(args.sceneId), summary: '读取场景剧情内容' };
    case 'add_dialogue_lines':
      return {
        action: 'write',
        target: sceneName(args.sceneId),
        summary: `新增 ${Array.isArray(args.lines) ? args.lines.length : 1} 句对白/旁白`,
      };
    case 'update_dialogue_block':
      return { action: 'edit', target: sceneName(args.sceneId), summary: '润色并修改选中对白' };
    case 'create_character':
      return { action: 'write', target: String(args.name || '新角色'), summary: '创建角色设定' };
    case 'create_story_variable':
      return { action: 'write', target: String(args.name || '故事状态'), summary: '新增故事状态' };
    case 'create_scene':
      return { action: 'write', target: String(args.name || '新场景'), summary: '创建新剧情场景' };
    case 'add_choice_branch':
      return { action: 'write', target: sceneName(args.sceneId), summary: '设计多选项剧情分支' };
    case 'read_custom_rpy':
      return { action: 'read', target: String(args.fileName || '扩展功能'), summary: '读取自定义功能模块' };
    case 'write_custom_rpy':
      return {
        action: 'write',
        target: String(args.fileName || '扩展功能'),
        summary: String(args.summary || '编写高级定制功能'),
      };
    case 'delete_custom_rpy':
      return { action: 'delete', target: String(args.fileName || '扩展功能'), summary: '移除自定义功能模块' };
    case 'run_project_check':
      return { action: 'check', target: project.meta.title, summary: '执行运行前完整性检查' };
    default:
      return { action: 'edit', target: project.meta.title, summary: `处理创作任务` };
  }
}

async function executeToolCall(
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
  const findOrCreateCharByName = (speakerName?: string | null): string | null => {
    if (!speakerName || !speakerName.trim() || speakerName.trim() === '旁白') return null;
    const trimmed = speakerName.trim();
    const existing = project.characters.find((c) => c.name === trimmed);
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

  const findOrCreateVarByName = (varName: string, type: 'number' | 'boolean' | 'string' = 'number') => {
    const existing = project.variables.find((v) => v.name === varName.trim());
    if (existing) return existing;
    const created = {
      id: createId('var'),
      name: varName.trim(),
      type,
      initialValue: type === 'number' ? 0 : type === 'boolean' ? false : '',
      persistent: false,
    };
    project.variables.push(created);
    return created;
  };

  switch (name) {
    case 'get_project_overview': {
      const gameDir = path.join(projectDir, 'game');
      const customFiles = fs.existsSync(gameDir)
        ? fs.readdirSync(gameDir).filter((f) => f.startsWith('custom_') && f.endsWith('.rpy'))
        : [];
      return {
        ok: true,
        mutated: false,
        output: {
          title: project.meta.title,
          startSceneId: project.meta.startSceneId,
          chapters: project.chapters.map((c) => ({ id: c.id, name: c.name, disabled: c.disabled })),
          scenes: project.scenes.map((s) => ({
            id: s.id,
            name: s.name,
            chapterId: s.chapterId,
            blockCount: s.blocks.length,
            nextSceneId: s.nextSceneId,
          })),
          characters: project.characters.map((c) => ({
            id: c.id,
            name: c.name,
            expressions: c.expressions.map((e) => e.name),
          })),
          variables: project.variables,
          customFiles,
        },
      };
    }

    case 'read_scene_blocks': {
      const sid = String(args.sceneId || context.activeSceneId || project.meta.startSceneId);
      const sc = project.scenes.find((s) => s.id === sid);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到该场景' } };
      return {
        ok: true,
        mutated: false,
        target: sc.name,
        output: {
          sceneId: sc.id,
          sceneName: sc.name,
          nextSceneId: sc.nextSceneId,
          blocks: sc.blocks.map((b, idx) => ({
            index: idx,
            id: b.id,
            type: b.type,
            ...(b.type === 'dialogue'
              ? {
                  speaker: b.speakerId ? project.characters.find((c) => c.id === b.speakerId)?.name : '旁白',
                  text: b.text,
                }
              : b.type === 'choice'
              ? { prompt: b.prompt, options: b.options.map((o) => ({ id: o.id, label: o.label, targetType: o.targetType, targetSceneId: o.targetSceneId })) }
              : {}),
          })),
        },
      };
    }

    case 'add_dialogue_lines': {
      const sid = String(args.sceneId || context.activeSceneId || project.meta.startSceneId);
      const sc = project.scenes.find((s) => s.id === sid);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const lines = Array.isArray(args.lines) ? args.lines : [];
      const newBlocks: DialogueBlock[] = lines.map((l: Record<string, unknown>) => ({
        id: createId('blk'),
        type: 'dialogue',
        speakerId: findOrCreateCharByName(typeof l.speakerName === 'string' ? l.speakerName : null),
        text: String(l.text || ''),
        expression: typeof l.expression === 'string' ? l.expression : undefined,
        nvlMode: Boolean(l.nvlMode),
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

    case 'update_dialogue_block': {
      const sc = project.scenes.find((s) => s.id === String(args.sceneId || context.activeSceneId));
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const blk = sc.blocks.find((b) => b.id === String(args.blockId));
      if (!blk || blk.type !== 'dialogue') {
        return { ok: false, mutated: false, output: { error: '未找到指定对白卡片' } };
      }
      blk.text = String(args.text || blk.text);
      if (typeof args.speakerName === 'string') {
        blk.speakerId = findOrCreateCharByName(args.speakerName);
      }
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已更新「${sc.name}」中的对白内容`,
        output: { blockId: blk.id, text: blk.text },
      };
    }

    case 'create_character': {
      const charName = String(args.name || '').trim();
      if (!charName) return { ok: false, mutated: false, output: { error: '角色名称不能为空' } };
      const existing = project.characters.find((c) => c.name === charName);
      if (existing) {
        return { ok: true, mutated: false, target: charName, output: { id: existing.id, alreadyExisted: true } };
      }
      const ch = {
        id: createId('ch'),
        name: charName,
        color: String(args.color || '#FF5A3D'),
        description: typeof args.description === 'string' ? args.description : undefined,
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

    case 'create_story_variable': {
      const vName = String(args.name || '').trim();
      const vType = (['number', 'boolean', 'string'].includes(String(args.type)) ? args.type : 'number') as
        | 'number'
        | 'boolean'
        | 'string';
      const v = findOrCreateVarByName(vName, vType);
      if (args.initialValue !== undefined) {
        v.initialValue =
          vType === 'number'
            ? Number(args.initialValue) || 0
            : vType === 'boolean'
            ? Boolean(args.initialValue)
            : String(args.initialValue);
      }
      if (typeof args.persistent === 'boolean') v.persistent = args.persistent;
      return {
        ok: true,
        mutated: true,
        target: v.name,
        summary: `已配置故事状态「${v.name}」`,
        output: v,
      };
    }

    case 'create_scene': {
      const nameStr = String(args.name || '新场景').trim();
      const chapterId =
        typeof args.chapterId === 'string' && project.chapters.some((c) => c.id === args.chapterId)
          ? args.chapterId
          : project.chapters[0]?.id ?? null;
      const blocks: StoryBlock[] = [];
      if (Array.isArray(args.lines)) {
        for (const l of args.lines as Array<Record<string, unknown>>) {
          blocks.push({
            id: createId('blk'),
            type: 'dialogue',
            speakerId: findOrCreateCharByName(typeof l.speakerName === 'string' ? l.speakerName : null),
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
      const newScene = {
        id: createId('sc'),
        chapterId,
        name: nameStr,
        order: project.scenes.length,
        disabled: false,
        nextSceneId: typeof args.nextSceneId === 'string' ? args.nextSceneId : null,
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

    case 'add_choice_branch': {
      const sid = String(args.sceneId || context.activeSceneId || project.meta.startSceneId);
      const sc = project.scenes.find((s) => s.id === sid);
      if (!sc) return { ok: false, mutated: false, output: { error: '未找到目标场景' } };
      const rawOpts = Array.isArray(args.options) ? (args.options as Array<Record<string, unknown>>) : [];

      const builtOptions = rawOpts.map((o) => {
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
                operator: (o.conditionOperator as ConditionGroup['rules'][0]['operator']) || '>=',
                value: o.conditionValue !== undefined ? (o.conditionValue as number | boolean | string) : 1,
              },
            ],
          };
        }
        const effects: StateEffect[] = [];
        if (typeof o.effectVariableName === 'string' && o.effectVariableName.trim()) {
          const v = findOrCreateVarByName(o.effectVariableName, typeof o.effectValue === 'boolean' ? 'boolean' : 'number');
          effects.push({
            id: createId('eff'),
            variableId: v.id,
            op: (o.effectOp as StateEffect['op']) || 'add',
            value: o.effectValue !== undefined ? (o.effectValue as number | boolean | string) : 1,
          });
        }
        return {
          id: createId('opt'),
          label: String(o.label || '选项'),
          condition,
          lockedBehavior: (o.lockedBehavior === 'disable' ? 'disable' : 'hide') as 'hide' | 'disable',
          disabledHint: typeof o.disabledHint === 'string' ? o.disabledHint : undefined,
          effects,
          targetType: (o.targetType as 'scene' | 'ending' | 'continue') || 'continue',
          targetSceneId: typeof o.targetSceneId === 'string' ? o.targetSceneId : undefined,
          endingId: o.targetType === 'ending' ? createId('end') : undefined,
          endingTitle: typeof o.endingTitle === 'string' ? o.endingTitle : undefined,
        };
      });

      const choiceBlock: ChoiceBlock = {
        id: createId('blk'),
        type: 'choice',
        prompt: typeof args.prompt === 'string' ? args.prompt : undefined,
        options: builtOptions,
      };
      sc.blocks.push(choiceBlock);
      return {
        ok: true,
        mutated: true,
        target: sc.name,
        summary: `已在「${sc.name}」添加 ${builtOptions.length} 项分支选择`,
        output: { blockId: choiceBlock.id, optionCount: builtOptions.length },
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
      return {
        ok: true,
        mutated: false,
        target: fn,
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
      return {
        ok: true,
        mutated: true,
        touchedCustomRpy: true,
        target: fn,
        summary: String(args.summary || `已写入自定义功能模块 ${fn}`),
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
      return {
        ok: true,
        mutated: true,
        target: fn,
        summary: `已移除自定义模块 ${fn}`,
        output: { deleted: fn },
      };
    }

    case 'run_project_check': {
      saveProjectSync(projectDir, project);
      const report = await runRenpyLint(projectDir, project);
      return {
        ok: report.ok,
        mutated: false,
        target: project.meta.title,
        summary: report.ok ? '项目引擎校验通过' : '引擎校验发现问题',
        output: { ok: report.ok, details: report.rawOutput.slice(0, 2000) },
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
