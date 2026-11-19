import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  X,
  Settings,
  Send,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  CheckCircle2,
  Loader2,
  XCircle,
  Clock,
  FileEdit,
  Eye,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import type { AiOperationRecord, AiProviderPreset } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

const PRESET_LIST: Array<{ id: AiProviderPreset; label: string; url: string; model: string }> = [
  { id: 'deepseek', label: 'DeepSeek（官方推荐）', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'moonshot', label: 'Kimi (Moonshot)', url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
  { id: 'qwen', label: '通义千问', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'siliconflow', label: '硅基流动', url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { id: 'custom', label: '其他兼容服务', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
];

const TAB_LABELS: Record<string, string> = {
  story: '故事工作台',
  characters: '角色与状态',
  assets: '素材库',
  appearance: '游戏外观',
  extensions: '扩展市场',
  reuse: '跨项目复用',
  localization: '多语言本地化',
  finish: '完成与发布',
};

const QUICK_TASKS = [
  { label: '续写 5 句对白', prompt: '请根据当前场景的氛围，续写 5 句自然生动的对白或旁白。' },
  { label: '润色选中台词', prompt: '请把当前选中的对白台词润色得更有画面感与人物性格，并直接更新到卡片中。' },
  {
    label: '设计三分支并汇合',
    prompt: '请设计花园、天台、回家三条分支，去天台需要好感度达到 2，三条路线之后能自然汇合或通向不同结局。',
  },
  { label: '检查剧情矛盾', prompt: '请通读当前项目的场景与条件分支，帮我检查是否存在逻辑矛盾或人物设定冲突。' },
  {
    label: '定制手机聊天界面',
    prompt: '帮我制作一个可在游戏中随时打开查看的定制手机聊天消息界面（高级定制功能），并自动完成校验确保游戏可正常运行。',
  },
];

export const AiAssistantDrawer: React.FC = () => {
  const {
    aiDrawerOpen,
    setAiDrawerOpen,
    aiSettings,
    aiMessages,
    aiBusy,
    aiStreamingReasoning,
    aiStreamingContent,
    aiStreamingOps,
    activeTab,
    activeSceneId,
    project,
    updateAiSettings,
    sendAiMessage,
    undoAiMessage,
  } = useAppStore();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<AiProviderPreset>('deepseek');
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/v1');
  const [model, setModel] = useState('deepseek-chat');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [promptInput, setPromptInput] = useState('');

  // Collapsed reasoning toggles (Req 4.3: ALWAYS collapsed to a single line by default!)
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const [liveReasoningExpanded, setLiveReasoningExpanded] = useState(false);

  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (aiSettings) {
      setProvider(aiSettings.provider);
      setBaseUrl(aiSettings.baseUrl);
      setModel(aiSettings.model);
    }
  }, [aiSettings]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages.length, aiStreamingContent, aiStreamingOps.length]);

  if (!aiDrawerOpen) return null;

  const activeScene = project?.scenes.find((s) => s.id === activeSceneId);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateAiSettings({
      provider,
      baseUrl: provider === 'custom' ? baseUrl : PRESET_LIST.find((p) => p.id === provider)?.url ?? baseUrl,
      model,
      apiKey: apiKeyInput.trim() || undefined,
    });
    setApiKeyInput('');
    setSettingsOpen(false);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!promptInput.trim() || aiBusy) return;
    const text = promptInput;
    setPromptInput('');
    setLiveReasoningExpanded(false);
    await sendAiMessage(text);
  };

  return (
    <aside
      data-testid="ai-assistant-drawer"
      className="fixed right-0 top-[48px] bottom-0 w-[410px] z-40 bg-[#FBFAF5] border-l border-[#D7D1C6] shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#E7E2D8] bg-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#FFF1ED] border border-[#FBCBC1] text-[#FF5A3D] flex items-center justify-center">
            <Bot size={15} />
          </div>
          <div>
            <div className="font-semibold text-[13.5px] text-[#171513]">内置 AI 创作助手</div>
            <div className="text-[11px] text-[#706A60]">
              {aiSettings?.hasApiKey
                ? `已连接 ${PRESET_LIST.find((p) => p.id === aiSettings.provider)?.label.split('（')[0] || 'AI 服务'}`
                : '只需填写 API Key 即可使用'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid="ai-settings-toggle-btn"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`px-2 py-1 rounded text-[12px] inline-flex items-center gap-1 cursor-pointer border ${
              settingsOpen
                ? 'bg-[#FFF1ED] border-[#FF5A3D] text-[#FF5A3D]'
                : 'bg-white border-[#D7D1C6] text-[#565149] hover:bg-[#EFECE3]'
            }`}
          >
            <Settings size={13} />
            连接设置
          </button>
          <button
            onClick={() => setAiDrawerOpen(false)}
            className="p-1.5 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Minimalist Connection Setup Panel (Req 4.1: Only API Key for preset, + URL for custom!) */}
      {(settingsOpen || !aiSettings?.hasApiKey) && (
        <form
          onSubmit={handleSaveSettings}
          className="p-4 border-b border-[#E7E2D8] bg-[#FFF1ED]/35 flex flex-col gap-2.5 text-[12px]"
        >
          <div className="font-semibold text-[#171513]">快速连接 AI 服务</div>
          <div>
            <label className="block text-[11.5px] text-[#706A60] mb-1">选择服务商</label>
            <select
              value={provider}
              onChange={(e) => {
                const p = e.target.value as AiProviderPreset;
                setProvider(p);
                const found = PRESET_LIST.find((x) => x.id === p);
                if (found) {
                  setBaseUrl(found.url);
                  setModel(found.model);
                }
              }}
              className="paper-input w-full py-1 text-[12px]"
            >
              {PRESET_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11.5px] text-[#706A60] mb-1">
              API Key（本机加密保存，打开即用）
            </label>
            <input
              data-testid="ai-apikey-input"
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={
                aiSettings?.hasApiKey
                  ? `已保存密钥 (${aiSettings.maskedKey})，留空保持不变`
                  : '粘贴你的 API Key…'
              }
              className="paper-input w-full py-1 text-[12px]"
            />
          </div>

          {provider === 'custom' && (
            <div>
              <label className="block text-[11.5px] text-[#706A60] mb-1">服务地址</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="paper-input w-full py-1 text-[12px]"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {aiSettings?.hasApiKey && (
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="paper-btn-secondary px-3 py-1 text-[12px]"
              >
                收起
              </button>
            )}
            <button
              data-testid="ai-save-settings-btn"
              type="submit"
              className="paper-btn-primary px-3.5 py-1 text-[12px]"
            >
              保存连接设置
            </button>
          </div>
        </form>
      )}

      {/* Context Awareness Pill */}
      <div className="px-4 py-2 border-b border-[#EFECE3] bg-[#FBFAF5] text-[11.5px] text-[#706A60] flex items-center justify-between gap-2">
        <span className="truncate">
          当前上下文：{TAB_LABELS[activeTab] || '工作台'}
          {activeScene ? ` · 场景「${activeScene.name}」` : ''}
        </span>
        <span className="text-[11px] text-[#2A7B50] shrink-0">修改支持一键撤销</span>
      </div>

      {/* Chat Stream Area */}
      <div className="flex-1 overflow-y-auto paper-scroll p-4 flex flex-col gap-3">
        {aiMessages.length === 0 && !aiBusy && (
          <div className="flex flex-col gap-3">
            <div className="p-3.5 rounded-md bg-white border border-[#E7E2D8] text-[12.5px] text-[#565149] leading-relaxed">
              直接用自然语言告诉我你想创作或修改什么：
              <ul className="list-disc pl-4 mt-1.5 space-y-1 text-[#706A60]">
                <li>常规剧情、对白、角色、多分支与条件，我会生成标准卡片供你随时继续编辑。</li>
                <li>复杂定制界面或小游戏（如手机聊天系统），我会在后台直接完成并自动校验，后续想改颜色或加功能继续对我说即可。</li>
              </ul>
            </div>
            <div className="text-[11.5px] font-medium text-[#706A60]">一键快捷任务</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TASKS.map((qt) => (
                <button
                  key={qt.label}
                  onClick={() => void sendAiMessage(qt.prompt)}
                  className="px-2.5 py-1.5 rounded-md bg-white border border-[#D7D1C6] hover:border-[#FF5A3D] hover:bg-[#FFF1ED]/50 text-[12px] text-[#171513] cursor-pointer text-left"
                >
                  {qt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {aiMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[88%] px-3.5 py-2.5 rounded-lg bg-[#171513] text-white text-[13px] leading-relaxed">
                {msg.content}
              </div>
            ) : (
              <div className="w-full flex flex-col gap-2">
                {/* Collapsed Single-Line Reasoning Drawer (Req 4.3) */}
                {msg.reasoning && (
                  <div className="rounded-md border border-[#E7E2D8] bg-[#F8F6F0] overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedReasoningIds((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="w-full px-3 py-1.5 text-[11.5px] text-[#706A60] flex items-center gap-1.5 cursor-pointer hover:text-[#171513]"
                    >
                      {expandedReasoningIds[msg.id] ? (
                        <ChevronDown size={13} />
                      ) : (
                        <ChevronRight size={13} />
                      )}
                      <span>
                        已思考推理（{msg.reasoningDurationSec ?? 1} 秒）· 点击
                        {expandedReasoningIds[msg.id] ? '收起' : '展开'}过程
                      </span>
                    </button>
                    {expandedReasoningIds[msg.id] && (
                      <div className="px-3 py-2 border-t border-[#E7E2D8] text-[11.5px] text-[#706A60] whitespace-pre-wrap leading-relaxed max-h-[180px] overflow-y-auto paper-scroll">
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Merged Operation Log Cards (Req 4.3) */}
                {msg.operations && msg.operations.length > 0 && (
                  <OperationLogList ops={msg.operations} />
                )}

                {/* Assistant Final Reply or Friendly Error */}
                {msg.error ? (
                  <div className="p-3 rounded-md bg-[#FCEEEC] border border-[#F0BEB8] text-[12.5px] text-[#A82C1E]">
                    {msg.error}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-md bg-white border border-[#D7D1C6] text-[13px] text-[#171513] whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </div>
                )}

                {/* One-Click Global Undo for AI Mutation */}
                {msg.snapshotIdBefore && (
                  <button
                    data-testid={`undo-ai-${msg.id}`}
                    onClick={() => void undoAiMessage(msg.snapshotIdBefore!)}
                    className="self-start paper-btn-secondary px-2.5 py-1 text-[11.5px] inline-flex items-center gap-1 text-[#706A60] hover:text-[#171513]"
                  >
                    <RotateCcw size={12} /> 撤销本次 AI 修改
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Live In-Progress Streaming Bubble (Reasoning strictly collapsed to single line!) */}
        {aiBusy && (
          <div className="w-full flex flex-col gap-2">
            <div className="rounded-md border border-[#E7E2D8] bg-[#F8F6F0] overflow-hidden">
              <button
                onClick={() => setLiveReasoningExpanded(!liveReasoningExpanded)}
                className="w-full px-3 py-1.5 text-[11.5px] text-[#706A60] flex items-center gap-1.5 cursor-pointer"
              >
                <Loader2 size={12} className="animate-spin text-[#FF5A3D]" />
                <span>正在推理…（点击{liveReasoningExpanded ? '收起' : '查看'}详细思路）</span>
              </button>
              {liveReasoningExpanded && aiStreamingReasoning && (
                <div className="px-3 py-2 border-t border-[#E7E2D8] text-[11.5px] text-[#706A60] whitespace-pre-wrap max-h-[150px] overflow-y-auto paper-scroll">
                  {aiStreamingReasoning}
                </div>
              )}
            </div>

            {aiStreamingOps.length > 0 && <OperationLogList ops={aiStreamingOps} />}

            {aiStreamingContent && (
              <div className="p-3.5 rounded-md bg-white border border-[#D7D1C6] text-[13px] text-[#171513] whitespace-pre-wrap leading-relaxed">
                {aiStreamingContent}
              </div>
            )}
          </div>
        )}
        <div ref={listEndRef} />
      </div>

      {/* Input Composer */}
      <form onSubmit={handleSend} className="p-3 border-t border-[#D7D1C6] bg-white flex flex-col gap-2">
        {aiMessages.length > 0 && !aiBusy && (
          <div className="flex items-center gap-1 overflow-x-auto sidebar-scroll pb-0.5">
            {QUICK_TASKS.map((qt) => (
              <button
                key={qt.label}
                type="button"
                onClick={() => void sendAiMessage(qt.prompt)}
                className="px-2 py-0.5 rounded bg-[#FBFAF5] border border-[#E7E2D8] hover:border-[#FF5A3D] text-[11px] text-[#565149] hover:text-[#171513] shrink-0 cursor-pointer"
              >
                {qt.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          data-testid="ai-prompt-input"
          rows={3}
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="输入你的创作指令（Enter 发送，Shift+Enter 换行）…"
          className="paper-input w-full resize-none text-[13px]"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#948D82]">
            {aiBusy ? '正在处理中，请稍候…' : '支持续写对白、设计分支、定制玩法'}
          </span>
          <button
            data-testid="ai-send-btn"
            type="submit"
            disabled={aiBusy || !promptInput.trim()}
            className="paper-btn-primary px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Send size={13} /> 发送
          </button>
        </div>
      </form>
    </aside>
  );
};

const OperationLogList: React.FC<{ ops: AiOperationRecord[] }> = ({ ops }) => {
  const actionLabel: Record<AiOperationRecord['action'], { text: string; icon: React.ComponentType<{ size?: number }> }> = {
    read: { text: '读取', icon: Eye },
    write: { text: '写入', icon: FileEdit },
    edit: { text: '修改', icon: FileEdit },
    delete: { text: '删除', icon: Trash2 },
    check: { text: '检查', icon: ShieldCheck },
  };

  return (
    <div className="rounded-md border border-[#E7E2D8] bg-[#FBFAF5] divide-y divide-[#EFECE3] overflow-hidden">
      {ops.map((op) => {
        const meta = actionLabel[op.action] ?? actionLabel.edit;
        const ActionIcon = meta.icon;
        return (
          <div key={op.id} className="px-3 py-2 flex items-center justify-between gap-2 text-[11.5px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EFECE3] text-[#565149] font-medium shrink-0">
                <ActionIcon size={11} />
                {meta.text}
              </span>
              <span className="font-medium text-[#171513] shrink-0">{op.target}</span>
              <span className="text-[#706A60] truncate">{op.summary}</span>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1">
              {op.status === 'pending' && <Clock size={12} className="text-[#948D82]" />}
              {op.status === 'running' && <Loader2 size={12} className="animate-spin text-[#B86E00]" />}
              {op.status === 'done' && <CheckCircle2 size={12} className="text-[#2A7B50]" />}
              {op.status === 'failed' && <XCircle size={12} className="text-[#C93B2B]" />}
              <span
                className={
                  op.status === 'done'
                    ? 'text-[#2A7B50]'
                    : op.status === 'failed'
                    ? 'text-[#C93B2B]'
                    : op.status === 'running'
                    ? 'text-[#B86E00]'
                    : 'text-[#948D82]'
                }
              >
                {op.status === 'pending'
                  ? '等待中'
                  : op.status === 'running'
                  ? '进行中'
                  : op.status === 'done'
                  ? '已完成'
                  : '失败'}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
