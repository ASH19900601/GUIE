import React, { useEffect, useRef, useState } from 'react';
import {
  GripVertical,
  Trash2,
  Copy,
  Plus,
  Bold,
  Italic,
  Palette,
  Type,
  Gauge,
  Variable,
  UserPen,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Volume2,
  Film,
  Image as ImageIcon,
  Layers,
  Camera,
  GitFork,
  GitBranch,
  CornerDownRight,
  Flag,
  Clock,
  Sliders,
  Award,
  UserSquare2,
  MessageSquare,
} from 'lucide-react';
import type {
  ChoiceOption,
  ProjectData,
  SpriteKeyframe,
  SpriteSlot,
  StageLayer,
  StoryBlock,
  TransitionType,
} from '@shared/types';
import { TRANSITION_OPTIONS } from '@shared/types';
import { createId, formatConditionNatural, formatEffectNatural } from '@shared/defaults';
import { ConditionEditor, StateEffectsEditor } from './ConditionAndEffectEditors';
import { registerDraftFlusher, useAppStore } from '../../store/useAppStore';

interface BlockCardProps {
  block: StoryBlock;
  index: number;
  totalBlocks: number;
  sceneId: string;
  project: ProjectData;
  isSelected: boolean;
  hasError?: boolean;
  autoFocusTrigger?: boolean;
  onSelect: () => void;
  onUpdate: (next: StoryBlock, coalesceKey?: string) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveToIndex: (targetZeroBasedIndex: number) => void;
  onEnterContinueDialogue?: (speakerId: string | null, nvlMode?: boolean) => void;
  onMultiLinePaste?: (lines: string[]) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

export const BlockCard: React.FC<BlockCardProps> = ({
  block,
  index,
  totalBlocks,
  project,
  isSelected,
  hasError,
  autoFocusTrigger,
  onSelect,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveToIndex,
  onEnterContinueDialogue,
  onMultiLinePaste,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  const { markDraftDirty } = useAppStore();
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderInput, setOrderInput] = useState(String(index + 1));
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);

  // Local buffered text for ultra-responsive dialogue typing + strict zero-data-loss draft flushing!
  const [localText, setLocalText] = useState(block.type === 'dialogue' ? block.text : '');
  const [richColor, setRichColor] = useState('#FF5A3D');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirtyRef = useRef(false);
  const latestLocalTextRef = useRef(localText);
  const latestBlockRef = useRef(block);
  const latestOnUpdateRef = useRef(onUpdate);
  latestLocalTextRef.current = localText;
  latestBlockRef.current = block;
  latestOnUpdateRef.current = onUpdate;

  useEffect(() => {
    if (block.type === 'dialogue' && !dirtyRef.current) {
      setLocalText(block.text);
    }
  }, [block.type === 'dialogue' ? block.text : null, block.id]);

  useEffect(() => {
    if (autoFocusTrigger && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [autoFocusTrigger]);

  // Register draft flusher using latestBlockRef (NEVER overwrites speaker/expression/voice with stale closure!)
  useEffect(() => {
    if (block.type !== 'dialogue') return;
    const key = `dlg_${block.id}`;
    const unregister = registerDraftFlusher(() => {
      if (dirtyRef.current && latestBlockRef.current.type === 'dialogue') {
        dirtyRef.current = false;
        markDraftDirty(key, false);
        latestOnUpdateRef.current(
          { ...latestBlockRef.current, text: latestLocalTextRef.current },
          key
        );
      }
    });
    return () => {
      unregister();
      markDraftDirty(key, false);
    };
  }, [block.id, block.type, markDraftDirty]);

  const commitDialogueText = (val: string) => {
    if (block.type !== 'dialogue') return;
    dirtyRef.current = false;
    markDraftDirty(`dlg_${block.id}`, false);
    if (val !== block.text) {
      onUpdate({ ...block, text: val }, `dlg_${block.id}`);
    }
  };

  const handleOrderCommit = () => {
    setEditingOrder(false);
    const num = parseInt(orderInput, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= totalBlocks && num - 1 !== index) {
      onMoveToIndex(num - 1);
    } else {
      setOrderInput(String(index + 1));
    }
  };

  const insertRichMarkup = (prefix: string, suffix: string) => {
    if (block.type !== 'dialogue') return;
    const el = textareaRef.current;
    const start = el?.selectionStart ?? localText.length;
    const end = el?.selectionEnd ?? localText.length;
    const selected = localText.slice(start, end) || '文字';
    const next = `${localText.slice(0, start)}${prefix}${selected}${suffix}${localText.slice(end)}`;
    setLocalText(next);
    commitDialogueText(next);
    requestAnimationFrame(() => el?.focus());
  };

  const insertInlineToken = (token: string) => {
    if (block.type !== 'dialogue') return;
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? localText.length;
    const next = `${localText.slice(0, pos)}${token}${localText.slice(pos)}`;
    setLocalText(next);
    commitDialogueText(next);
    requestAnimationFrame(() => el?.focus());
  };

  const meta = getBlockHeaderMeta(block);
  const HeaderIcon = meta.icon;

  return (
    <div
      data-testid={`story-card-${block.id}`}
      data-block-type={block.type}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`paper-card transition-colors ${
        hasError
          ? 'border-[#C93B2B] bg-[#FCEEEC]/30'
          : isSelected
          ? 'border-[#FF5A3D] ring-1 ring-[#FF5A3D]/25 bg-white'
          : 'border-[#D7D1C6] bg-white hover:border-[#BDB6A8]'
      }`}
    >
      {/* Compact Card Header */}
      <div className="px-3 py-1.5 border-b border-[#EFECE3] flex items-center justify-between gap-2 bg-[#FBFAF5]/70 rounded-t-[7px]">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="cursor-grab active:cursor-grabbing text-[#948D82] hover:text-[#171513]"
            title="拖拽调整顺序"
          >
            <GripVertical size={14} />
          </span>

          {editingOrder ? (
            <input
              type="number"
              min={1}
              max={totalBlocks}
              autoFocus
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              onBlur={handleOrderCommit}
              onKeyDown={(e) => e.key === 'Enter' && handleOrderCommit()}
              onClick={(e) => e.stopPropagation()}
              className="w-12 text-center text-[11px] border border-[#FF5A3D] rounded px-1 py-0 bg-white"
            />
          ) : (
            <button
              type="button"
              title="点击输入序号，快速移动到任意位置"
              onClick={(e) => {
                e.stopPropagation();
                setOrderInput(String(index + 1));
                setEditingOrder(true);
              }}
              className="px-1.5 py-0.5 rounded bg-[#EFECE3] hover:bg-[#FFF1ED] hover:text-[#FF5A3D] text-[11px] font-mono text-[#706A60] cursor-pointer"
            >
              #{index + 1}
            </button>
          )}

          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#171513]">
            <HeaderIcon size={13} className={meta.colorClass} />
            {meta.title}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title="复制此卡片"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1 rounded hover:bg-[#EFECE3] text-[#706A60] hover:text-[#171513] cursor-pointer"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            title="删除此卡片"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 rounded hover:bg-[#FCEEEC] text-[#706A60] hover:text-[#C93B2B] cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Card Body by Type (100% Secondary Editable!) */}
      <div className="p-3">
        {block.type === 'dialogue' && (
          <div className="flex flex-col gap-2">
            {/* Speaker, Expression, Voice, NVL Row */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                data-testid={`dlg-speaker-${block.id}`}
                value={block.speakerId ?? ''}
                onChange={(e) =>
                  onUpdate({
                    ...block,
                    speakerId: e.target.value || null,
                    expression: undefined,
                    outfit: undefined,
                  })
                }
                className="paper-input py-1 px-2 text-[12px] min-w-[110px]"
              >
                <option value="">旁白（无角色）</option>
                {project.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {block.speakerId && (() => {
                const ch = project.characters.find((c) => c.id === block.speakerId);
                if (!ch || ch.expressions.length === 0) return null;
                return (
                  <select
                    value={block.expression ?? ''}
                    onChange={(e) => onUpdate({ ...block, expression: e.target.value || undefined })}
                    className="paper-input py-1 px-2 text-[12px]"
                  >
                    <option value="">保持表情</option>
                    {ch.expressions.map((exp) => (
                      <option key={exp.id} value={exp.name}>
                        {exp.name}
                        {exp.outfit ? ` · ${exp.outfit}` : ''}
                      </option>
                    ))}
                  </select>
                );
              })()}

              <select
                value={block.voiceAssetId ?? ''}
                onChange={(e) => onUpdate({ ...block, voiceAssetId: e.target.value || undefined })}
                className="paper-input py-1 px-2 text-[12px] max-w-[140px]"
                title="绑定单句角色配音"
              >
                <option value="">无配音</option>
                {project.assets
                  .filter((a) => a.category === 'voice')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      语音：{a.name}
                    </option>
                  ))}
              </select>

              <label className="inline-flex items-center gap-1 text-[11.5px] text-[#706A60] cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={Boolean(block.nvlMode)}
                  onChange={(e) => onUpdate({ ...block, nvlMode: e.target.checked })}
                  className="accent-[#FF5A3D]"
                />
                全屏独白
              </label>

              <button
                type="button"
                onClick={() => setExpandedAdvanced(!expandedAdvanced)}
                className="text-[11.5px] text-[#706A60] hover:text-[#171513] inline-flex items-center gap-0.5 cursor-pointer"
              >
                样式与插值
                {expandedAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Visual Rich-Text & State Interpolation Toolbar (Zero code tags required!) */}
            {expandedAdvanced && (
              <div className="p-2 rounded bg-[#FBFAF5] border border-[#E7E2D8] flex items-center gap-1.5 flex-wrap text-[11.5px]">
                <button
                  type="button"
                  onClick={() => insertRichMarkup('{b}', '{/b}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                  title="加粗选中文字"
                >
                  <Bold size={12} /> 加粗
                </button>
                <button
                  type="button"
                  onClick={() => insertRichMarkup('{i}', '{/i}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                >
                  <Italic size={12} /> 斜体
                </button>
                <div className="inline-flex items-center gap-1">
                  <input
                    type="color"
                    value={richColor}
                    onChange={(e) => setRichColor(e.target.value)}
                    title="选择文字颜色"
                    className="w-5 h-5 rounded border border-[#D7D1C6] cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => insertRichMarkup(`{color=${richColor}}`, '{/color}')}
                    className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                  >
                    <Palette size={12} /> 套用颜色
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => insertRichMarkup('{size=+8}', '{/size}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                >
                  <Type size={12} /> 放大字号
                </button>
                <button
                  type="button"
                  onClick={() => insertRichMarkup('{size=-6}', '{/size}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                >
                  缩小字号
                </button>
                <button
                  type="button"
                  onClick={() => insertRichMarkup('{cps=14}', '{/cps}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                  title="让选中的片段缓慢打字显示"
                >
                  <Gauge size={12} /> 慢速强调
                </button>
                <button
                  type="button"
                  onClick={() => insertInlineToken('{玩家名字}')}
                  className="paper-btn-secondary px-2 py-0.5 inline-flex items-center gap-1"
                >
                  <UserPen size={12} /> 插入玩家名字
                </button>
                {project.variables.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        insertInlineToken(`{状态:${e.target.value}}`);
                        e.target.value = '';
                      }
                    }}
                    className="paper-input py-0.5 px-1.5 text-[11.5px]"
                  >
                    <option value="">+ 插入故事状态数值…</option>
                    {project.variables.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <Gauge size={12} className="text-[#706A60]" />
                  <span>整句语速</span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={block.typingSpeed ?? 0}
                    onChange={(e) => onUpdate({ ...block, typingSpeed: Number(e.target.value) })}
                    className="paper-input w-14 py-0.5 px-1 text-[11.5px] text-center"
                    title="0 表示使用全局默认打字速度"
                  />
                </div>
                {block.voiceAssetId && (
                  <div className="flex items-center gap-1">
                    <Volume2 size={12} className="text-[#706A60]" />
                    <span>语音音量 {Math.round((block.voiceVolume ?? 1) * 100)}%</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={block.voiceVolume ?? 1}
                      onChange={(e) => onUpdate({ ...block, voiceVolume: Number(e.target.value) })}
                      className="w-16 accent-[#FF5A3D]"
                    />
                  </div>
                )}
                <div className="w-full flex items-center gap-2 pt-1 border-t border-[#E7E2D8]">
                  <span className="text-[#706A60]">临时动态说话名：</span>
                  <input
                    type="text"
                    value={block.dynamicName ?? ''}
                    onChange={(e) => onUpdate({ ...block, dynamicName: e.target.value || undefined })}
                    placeholder="例如：神秘声音（留空使用所选角色名）"
                    className="paper-input flex-1 py-0.5 px-2 text-[11.5px]"
                  />
                </div>
              </div>
            )}

            {/* Main Dialogue Input (Enter -> seamless forward continuation!) */}
            <textarea
              ref={textareaRef}
              data-testid={`dlg-textarea-${block.id}`}
              rows={2}
              value={localText}
              placeholder="输入对白或旁白内容…（按 Enter 自动新建下一句，Shift+Enter 换行，支持粘贴多行剧本自动拆分）"
              onChange={(e) => {
                const v = e.target.value;
                setLocalText(v);
                dirtyRef.current = true;
                markDraftDirty(`dlg_${block.id}`, true);
                onUpdate({ ...block, text: v }, `dlg_${block.id}`);
              }}
              onBlur={() => commitDialogueText(localText)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  commitDialogueText(localText);
                  onEnterContinueDialogue?.(block.speakerId, block.nvlMode);
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                const lines = pasted
                  .split(/\r?\n/)
                  .map((s) => s.trim())
                  .filter(Boolean);
                if (lines.length > 1 && onMultiLinePaste) {
                  e.preventDefault();
                  commitDialogueText(localText);
                  onMultiLinePaste(lines);
                }
              }}
              className="paper-input w-full resize-y min-h-[54px] text-[13.5px] leading-relaxed"
            />
          </div>
        )}

        {block.type === 'choice' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-[#706A60] shrink-0">选择提示语：</span>
              <select
                value={block.speakerId ?? ''}
                onChange={(e) => onUpdate({ ...block, speakerId: e.target.value || null })}
                className="paper-input py-1 px-2 text-[12px] max-w-[120px]"
                title="提问角色（可选）"
              >
                <option value="">旁白提问</option>
                {project.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={block.prompt ?? ''}
                onChange={(e) => onUpdate({ ...block, prompt: e.target.value })}
                placeholder="例如：放学后你要去哪里？"
                className="paper-input flex-1 text-[12.5px]"
              />
            </div>

            <div className="flex flex-col gap-2">
              {block.options.map((opt, oi) => (
                <ChoiceOptionRow
                  key={opt.id}
                  option={opt}
                  index={oi}
                  project={project}
                  onChange={(nextOpt) => {
                    const nextOpts = block.options.map((o) => (o.id === opt.id ? nextOpt : o));
                    onUpdate({ ...block, options: nextOpts });
                  }}
                  onRemove={() => {
                    onUpdate({
                      ...block,
                      options: block.options.filter((o) => o.id !== opt.id),
                    });
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              data-testid={`add-choice-option-${block.id}`}
              onClick={() =>
                onUpdate({
                  ...block,
                  options: [
                    ...block.options,
                    {
                      id: createId('opt'),
                      label: `新选项 ${block.options.length + 1}`,
                      lockedBehavior: 'hide',
                      effects: [],
                      targetType: 'continue',
                    },
                  ],
                })
              }
              className="paper-btn-secondary px-3 py-1.5 text-[12px] inline-flex items-center gap-1 self-start"
            >
              <Plus size={13} />
              新增选项
            </button>
          </div>
        )}

        {block.type === 'background' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11.5px] text-[#706A60] mb-1">背景画面</label>
              <select
                value={block.assetId ?? ''}
                onChange={(e) => onUpdate({ ...block, assetId: e.target.value || null })}
                className="paper-input w-full text-[12px]"
              >
                <option value="">纯色底幕</option>
                {project.assets
                  .filter((a) => a.category === 'background')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            {!block.assetId && (
              <div>
                <label className="block text-[11.5px] text-[#706A60] mb-1">底幕颜色</label>
                <input
                  type="color"
                  value={block.color || '#1A1816'}
                  onChange={(e) => onUpdate({ ...block, color: e.target.value })}
                  className="h-[32px] w-full rounded border border-[#D7D1C6] cursor-pointer"
                />
              </div>
            )}
            <div>
              <label className="block text-[11.5px] text-[#706A60] mb-1">画面转场效果</label>
              <select
                value={block.transition}
                onChange={(e) =>
                  onUpdate({ ...block, transition: e.target.value as TransitionType })
                }
                className="paper-input w-full text-[12px]"
              >
                {TRANSITION_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] text-[#706A60] mb-1">转场时长（秒）</label>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={5}
                value={block.transitionDuration}
                onChange={(e) => onUpdate({ ...block, transitionDuration: Number(e.target.value) })}
                className="paper-input w-full text-[12px]"
              />
            </div>
          </div>
        )}

        {block.type === 'sprite' && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[11.5px] text-[#706A60] mb-1">动作</label>
                <select
                  value={block.action}
                  onChange={(e) =>
                    onUpdate({ ...block, action: e.target.value as 'show' | 'hide' })
                  }
                  className="paper-input w-full text-[12px]"
                >
                  <option value="show">显示 / 更换立绘</option>
                  <option value="hide">隐藏立绘</option>
                </select>
              </div>
              <div>
                <label className="block text-[11.5px] text-[#706A60] mb-1">角色</label>
                <select
                  value={block.characterId}
                  onChange={(e) => onUpdate({ ...block, characterId: e.target.value, expression: undefined })}
                  className="paper-input w-full text-[12px]"
                >
                  <option value="">选择角色</option>
                  {project.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              {block.action === 'show' && (
                <>
                  <div>
                    <label className="block text-[11.5px] text-[#706A60] mb-1">表情 / 服装</label>
                    <select
                      value={block.expression ?? ''}
                      onChange={(e) => onUpdate({ ...block, expression: e.target.value || undefined })}
                      className="paper-input w-full text-[12px]"
                    >
                      <option value="">默认表情</option>
                      {(project.characters.find((c) => c.id === block.characterId)?.expressions ?? []).map((exp) => (
                        <option key={exp.id} value={exp.name}>
                          {exp.name}{exp.outfit ? ` (${exp.outfit})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11.5px] text-[#706A60] mb-1">同屏位置槽位</label>
                    <select
                      value={block.slot}
                      onChange={(e) => onUpdate({ ...block, slot: e.target.value as SpriteSlot })}
                      className="paper-input w-full text-[12px]"
                    >
                      <option value="farleft">最左</option>
                      <option value="left">左侧</option>
                      <option value="center">居中</option>
                      <option value="right">右侧</option>
                      <option value="farright">最右</option>
                      <option value="custom">自由坐标</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="block text-[11.5px] text-[#706A60] mb-1">出现/消失转场</label>
                <select
                  value={block.transition}
                  onChange={(e) => onUpdate({ ...block, transition: e.target.value as TransitionType })}
                  className="paper-input w-full text-[12px]"
                >
                  {TRANSITION_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {block.action === 'show' && (
                <>
                  <div>
                    <label className="block text-[11.5px] text-[#706A60] mb-1">
                      缩放 ({(block.scale ?? 1).toFixed(2)}x)
                    </label>
                    <input
                      type="range"
                      min={0.4}
                      max={2}
                      step={0.05}
                      value={block.scale ?? 1}
                      onChange={(e) => onUpdate({ ...block, scale: Number(e.target.value) })}
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11.5px] text-[#706A60] mb-1">
                      透明度 ({Math.round((block.alpha ?? 1) * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={block.alpha ?? 1}
                      onChange={(e) => onUpdate({ ...block, alpha: Number(e.target.value) })}
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedAdvanced(!expandedAdvanced)}
                    className="paper-btn-secondary py-1.5 px-2 text-[11.5px]"
                  >
                    {expandedAdvanced ? '收起变换与关键帧' : '坐标 / 旋转 / 关键帧'}
                  </button>
                </>
              )}
            </div>

            {block.action === 'show' && expandedAdvanced && (
              <div className="p-2.5 rounded bg-[#FBFAF5] border border-[#E7E2D8] flex flex-col gap-2">
                <div className="grid grid-cols-4 gap-2 text-[12px]">
                  <div>
                    <label className="block text-[11px] text-[#706A60]">横坐标 (0-1)</label>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={block.x ?? 0.5}
                      onChange={(e) => onUpdate({ ...block, slot: 'custom', x: Number(e.target.value) })}
                      className="paper-input w-full py-1 text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#706A60]">纵坐标 (0-1)</label>
                    <input
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      value={block.y ?? 1}
                      onChange={(e) => onUpdate({ ...block, slot: 'custom', y: Number(e.target.value) })}
                      className="paper-input w-full py-1 text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#706A60]">旋转角度 (°)</label>
                    <input
                      type="number"
                      value={block.rotation ?? 0}
                      onChange={(e) => onUpdate({ ...block, rotation: Number(e.target.value) })}
                      className="paper-input w-full py-1 text-[12px]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#706A60]">前后层级</label>
                    <input
                      type="number"
                      value={block.zOrder ?? 10}
                      onChange={(e) => onUpdate({ ...block, zOrder: Number(e.target.value) })}
                      className="paper-input w-full py-1 text-[12px]"
                    />
                  </div>
                </div>
                <div className="border-t border-[#E7E2D8] pt-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11.5px] font-medium text-[#171513]">精灵关键帧动画</span>
                    <button
                      type="button"
                      onClick={() => {
                        const kf: SpriteKeyframe = {
                          id: createId('kf'),
                          timeSec: 0.6,
                          x: block.x ?? 0.5,
                          y: block.y ?? 1.0,
                          scale: block.scale ?? 1.05,
                          rotation: 0,
                          alpha: 1,
                          easing: 'ease',
                        };
                        onUpdate({ ...block, keyframes: [...(block.keyframes ?? []), kf] });
                      }}
                      className="paper-btn-secondary px-2 py-0.5 text-[11px] inline-flex items-center gap-1"
                    >
                      <Plus size={11} /> 添加关键帧
                    </button>
                  </div>
                  {(block.keyframes ?? []).map((kf, ki) => (
                    <div key={kf.id} className="flex items-center flex-wrap gap-1.5 text-[11px] mb-1.5 pb-1 border-b border-[#EFECE3] last:border-none">
                      <span className="text-[#948D82] font-medium">帧{ki + 1}</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0.05}
                        value={kf.timeSec}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, timeSec: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                        title="持续秒数"
                      />
                      <span>秒 X:</span>
                      <input
                        type="number"
                        step={0.05}
                        value={kf.x}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, x: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                      />
                      <span>Y:</span>
                      <input
                        type="number"
                        step={0.05}
                        value={kf.y}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, y: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                      />
                      <span>缩放:</span>
                      <input
                        type="number"
                        step={0.05}
                        value={kf.scale}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, scale: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                      />
                      <span>旋转:</span>
                      <input
                        type="number"
                        step={5}
                        value={kf.rotation}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, rotation: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                      />
                      <span>透明:</span>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={1}
                        value={kf.alpha}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id ? { ...k, alpha: Number(e.target.value) } : k
                            ),
                          })
                        }
                        className="paper-input w-12 py-0.5 px-1"
                      />
                      <select
                        value={kf.easing}
                        onChange={(e) =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).map((k) =>
                              k.id === kf.id
                                ? { ...k, easing: e.target.value as SpriteKeyframe['easing'] }
                                : k
                            ),
                          })
                        }
                        className="paper-input py-0.5 px-1 text-[11px]"
                        title="缓动曲线"
                      >
                        <option value="ease">平滑</option>
                        <option value="linear">匀速</option>
                        <option value="easein">缓入</option>
                        <option value="easeout">缓出</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdate({
                            ...block,
                            keyframes: (block.keyframes ?? []).filter((k) => k.id !== kf.id),
                          })
                        }
                        className="p-0.5 text-[#948D82] hover:text-[#C93B2B] cursor-pointer ml-auto"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {block.type === 'multilayer_stage' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#706A60]">
                多图层前景/背景叠加（支持单层隔离预览与视差深度）
              </span>
              <button
                type="button"
                onClick={() => {
                  const newLayer: StageLayer = {
                    id: createId('ly'),
                    name: `图层 ${block.layers.length + 1}`,
                    group: block.layers.length === 0 ? 'background' : 'foreground',
                    assetId: project.assets.find((a) => a.category === 'background')?.id ?? '',
                    offsetX: 0,
                    offsetY: 0,
                    parallaxDepth: 0.5,
                    scale: 1,
                    alpha: 1,
                    visible: true,
                    zIndex: block.layers.length + 1,
                  };
                  onUpdate({ ...block, layers: [...block.layers, newLayer] });
                }}
                className="paper-btn-secondary px-2 py-0.5 text-[11.5px] inline-flex items-center gap-1"
              >
                <Plus size={12} /> 新增图层
              </button>
            </div>
            {block.layers.map((ly) => (
              <div
                key={ly.id}
                className="p-2 rounded bg-[#FBFAF5] border border-[#E7E2D8] flex flex-col gap-1.5 text-[11.5px]"
              >
                <div className="grid grid-cols-12 gap-1.5 items-center">
                  <input
                    type="text"
                    value={ly.name}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) => (x.id === ly.id ? { ...x, name: e.target.value } : x)),
                      })
                    }
                    className="paper-input col-span-3 py-0.5 px-1.5"
                    placeholder="图层名"
                  />
                  <select
                    value={ly.group}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, group: e.target.value as StageLayer['group'] } : x
                        ),
                      })
                    }
                    className="paper-input col-span-2 py-0.5 px-1"
                  >
                    <option value="background">远景组</option>
                    <option value="midground">中景组</option>
                    <option value="foreground">前景组</option>
                  </select>
                  <select
                    value={ly.assetId}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) => (x.id === ly.id ? { ...x, assetId: e.target.value } : x)),
                      })
                    }
                    className="paper-input col-span-4 py-0.5 px-1"
                  >
                    <option value="">选择图片</option>
                    {project.assets
                      .filter((a) => a.category === 'background' || a.category === 'ui')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                  <label className="col-span-1 inline-flex items-center justify-center cursor-pointer" title="图层可见性">
                    <input
                      type="checkbox"
                      checked={ly.visible}
                      onChange={(e) =>
                        onUpdate({
                          ...block,
                          layers: block.layers.map((x) =>
                            x.id === ly.id ? { ...x, visible: e.target.checked } : x
                          ),
                        })
                      }
                      className="accent-[#FF5A3D]"
                    />
                  </label>
                  <button
                    type="button"
                    title="单层隔离预览"
                    onClick={() =>
                      onUpdate({
                        ...block,
                        isolatedLayerId: block.isolatedLayerId === ly.id ? null : ly.id,
                      })
                    }
                    className={`col-span-1 p-1 rounded border flex items-center justify-center cursor-pointer ${
                      block.isolatedLayerId === ly.id
                        ? 'bg-[#FFF1ED] border-[#FF5A3D] text-[#FF5A3D]'
                        : 'border-[#D7D1C6] text-[#706A60]'
                    }`}
                  >
                    {block.isolatedLayerId === ly.id ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdate({ ...block, layers: block.layers.filter((x) => x.id !== ly.id) })
                    }
                    className="col-span-1 p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer flex justify-center"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#706A60]">
                  <span>X偏移</span>
                  <input
                    type="number"
                    value={ly.offsetX}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, offsetX: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-14 py-0 px-1 text-center text-[11px]"
                  />
                  <span>Y偏移</span>
                  <input
                    type="number"
                    value={ly.offsetY}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, offsetY: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-14 py-0 px-1 text-center text-[11px]"
                  />
                  <span>视差</span>
                  <input
                    type="number"
                    step={0.1}
                    value={ly.parallaxDepth}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, parallaxDepth: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-12 py-0 px-1 text-center text-[11px]"
                  />
                  <span>缩放</span>
                  <input
                    type="number"
                    step={0.05}
                    min={0.2}
                    max={3}
                    value={ly.scale}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, scale: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-12 py-0 px-1 text-center text-[11px]"
                  />
                  <span>透明</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0}
                    max={1}
                    value={ly.alpha}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, alpha: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-12 py-0 px-1 text-center text-[11px]"
                  />
                  <span>层级</span>
                  <input
                    type="number"
                    value={ly.zIndex}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        layers: block.layers.map((x) =>
                          x.id === ly.id ? { ...x, zIndex: Number(e.target.value) } : x
                        ),
                      })
                    }
                    className="paper-input w-12 py-0 px-1 text-center text-[11px]"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {block.type === 'camera_fx' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(block.reset)}
                  onChange={(e) => onUpdate({ ...block, reset: e.target.checked })}
                  className="accent-[#FF5A3D]"
                />
                重置镜头与所有氛围特效
              </label>
            </div>
            {!block.reset && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
                <div>
                  <label className="block text-[11px] text-[#706A60]">缩放 ({block.zoom}x)</label>
                  <input
                    type="range"
                    min={0.6}
                    max={2}
                    step={0.05}
                    value={block.zoom}
                    onChange={(e) => onUpdate({ ...block, zoom: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">水平平移 ({block.panX})</label>
                  <input
                    type="range"
                    min={-200}
                    max={200}
                    step={10}
                    value={block.panX}
                    onChange={(e) => onUpdate({ ...block, panX: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">垂直平移 ({block.panY})</label>
                  <input
                    type="range"
                    min={-150}
                    max={150}
                    step={10}
                    value={block.panY}
                    onChange={(e) => onUpdate({ ...block, panY: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">震屏强度</label>
                  <select
                    value={block.shake}
                    onChange={(e) =>
                      onUpdate({ ...block, shake: e.target.value as typeof block.shake })
                    }
                    className="paper-input w-full py-1 text-[12px]"
                  >
                    <option value="none">无震动</option>
                    <option value="light">轻微震动</option>
                    <option value="medium">中等冲击</option>
                    <option value="heavy">剧烈震屏</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">色彩滤镜</label>
                  <select
                    value={block.lutPreset}
                    onChange={(e) =>
                      onUpdate({ ...block, lutPreset: e.target.value as typeof block.lutPreset })
                    }
                    className="paper-input w-full py-1 text-[12px]"
                  >
                    <option value="none">原色</option>
                    <option value="warm">暖阳滤镜</option>
                    <option value="cool">清冷蓝调</option>
                    <option value="sepia">复古回忆</option>
                    <option value="noir">悬疑暗调</option>
                    <option value="sunset">黄昏晚霞</option>
                    <option value="dreamy">柔光梦境</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">环境粒子</label>
                  <select
                    value={block.particles}
                    onChange={(e) =>
                      onUpdate({ ...block, particles: e.target.value as typeof block.particles })
                    }
                    className="paper-input w-full py-1 text-[12px]"
                  >
                    <option value="none">无天气粒子</option>
                    <option value="rain">细雨绵绵</option>
                    <option value="snow">飘雪漫天</option>
                    <option value="petals">樱花花瓣</option>
                    <option value="leaves">秋日落叶</option>
                    <option value="sparkles">萤火光点</option>
                  </select>
                </div>
                {block.particles !== 'none' && (
                  <div>
                    <label className="block text-[11px] text-[#706A60]">
                      粒子密度 ({block.particleIntensity.toFixed(1)}x)
                    </label>
                    <input
                      type="range"
                      min={0.3}
                      max={2}
                      step={0.1}
                      value={block.particleIntensity}
                      onChange={(e) => onUpdate({ ...block, particleIntensity: Number(e.target.value) })}
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-[11px] text-[#706A60]">景深模糊 ({block.blur})</label>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={block.blur}
                    onChange={(e) => onUpdate({ ...block, blur: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">焦平面 ({Math.round((block.dofFocus ?? 0.5) * 100)}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={block.dofFocus ?? 0.5}
                    onChange={(e) => onUpdate({ ...block, dofFocus: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">暗角 ({Math.round(block.vignette * 100)}%)</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={block.vignette}
                    onChange={(e) => onUpdate({ ...block, vignette: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60]">推拉时长（秒）</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={5}
                    value={block.duration}
                    onChange={(e) => onUpdate({ ...block, duration: Number(e.target.value) })}
                    className="paper-input w-full py-1 text-[12px]"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {block.type === 'audio' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">音轨类型</label>
              <select
                value={block.channel}
                onChange={(e) =>
                  onUpdate({ ...block, channel: e.target.value as 'bgm' | 'se' | 'voice' })
                }
                className="paper-input w-full py-1"
              >
                <option value="bgm">背景音乐</option>
                <option value="se">音效</option>
                <option value="voice">角色语音</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">控制动作</label>
              <select
                value={block.action}
                onChange={(e) =>
                  onUpdate({ ...block, action: e.target.value as 'play' | 'stop' | 'queue' })
                }
                className="paper-input w-full py-1"
              >
                <option value="play">开始播放</option>
                <option value="stop">停止播放</option>
                <option value="queue">排队接续播放</option>
              </select>
            </div>
            {block.action !== 'stop' && (
              <div>
                <label className="block text-[11px] text-[#706A60] mb-1">音频素材</label>
                <select
                  value={block.assetId ?? ''}
                  onChange={(e) => onUpdate({ ...block, assetId: e.target.value || undefined })}
                  className="paper-input w-full py-1"
                >
                  <option value="">选择音频</option>
                  {project.assets
                    .filter((a) => ['bgm', 'se', 'voice'].includes(a.category))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">
                {block.action === 'stop' ? '淡出时间（秒）' : '淡入时间（秒）'}
              </label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={10}
                value={block.action === 'stop' ? (block.fadeOut ?? 0.8) : (block.fadeIn ?? 0.5)}
                onChange={(e) =>
                  onUpdate(
                    block.action === 'stop'
                      ? { ...block, fadeOut: Number(e.target.value) }
                      : { ...block, fadeIn: Number(e.target.value) }
                  )
                }
                className="paper-input w-full py-1"
              />
            </div>
            {block.action !== 'stop' && (
              <>
                <div>
                  <label className="block text-[11px] text-[#706A60]">
                    音量 ({Math.round((block.volume ?? 0.85) * 100)}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={block.volume ?? 0.85}
                    onChange={(e) => onUpdate({ ...block, volume: Number(e.target.value) })}
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 text-[12px] self-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={block.channel === 'bgm' ? block.loop !== false : Boolean(block.loop)}
                    onChange={(e) => onUpdate({ ...block, loop: e.target.checked })}
                    className="accent-[#FF5A3D]"
                  />
                  循环播放
                </label>
              </>
            )}
          </div>
        )}

        {block.type === 'video' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">播放模式</label>
              <select
                value={block.mode}
                onChange={(e) =>
                  onUpdate({ ...block, mode: e.target.value as typeof block.mode })
                }
                className="paper-input w-full py-1"
              >
                <option value="fullscreen">全屏片头 / 过场动画</option>
                <option value="background_loop">循环视频背景</option>
                <option value="sprite_video">视频动态立绘</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">视频文件</label>
              <select
                value={block.assetId}
                onChange={(e) => onUpdate({ ...block, assetId: e.target.value })}
                className="paper-input w-full py-1"
              >
                <option value="">选择视频素材</option>
                {project.assets
                  .filter((a) => a.category === 'video')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            {block.mode === 'sprite_video' && (
              <div>
                <label className="block text-[11px] text-[#706A60] mb-1">关联角色（可选）</label>
                <select
                  value={block.characterId ?? ''}
                  onChange={(e) => onUpdate({ ...block, characterId: e.target.value || undefined })}
                  className="paper-input w-full py-1"
                >
                  <option value="">独立画面</option>
                  {project.characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-3 self-end pb-1.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={block.mode === 'background_loop' ? block.loop !== false : Boolean(block.loop)}
                  onChange={(e) => onUpdate({ ...block, loop: e.target.checked })}
                  className="accent-[#FF5A3D]"
                />
                循环播放
              </label>
              {block.mode === 'fullscreen' && (
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={block.skippable !== false}
                    onChange={(e) => onUpdate({ ...block, skippable: e.target.checked })}
                    className="accent-[#FF5A3D]"
                  />
                  可点击跳过
                </label>
              )}
            </div>
          </div>
        )}

        {block.type === 'state_change' && (
          <StateEffectsEditor
            effects={block.effects}
            variables={project.variables}
            onChange={(effects) => onUpdate({ ...block, effects })}
            title="执行以下故事状态变更"
          />
        )}

        {block.type === 'condition_branch' && (
          <div className="flex flex-col gap-2">
            <ConditionEditor
              value={block.condition}
              variables={project.variables}
              onChange={(condition) =>
                onUpdate({ ...block, condition: condition ?? { logic: 'all', rules: [] } })
              }
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
              <div className="p-2 rounded bg-[#EDF7F1]/60 border border-[#C6E6D3]">
                <div className="font-medium text-[#2A7B50] mb-1">条件满足时：</div>
                <div className="flex gap-1.5">
                  <select
                    value={block.trueTargetType}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        trueTargetType: e.target.value as typeof block.trueTargetType,
                      })
                    }
                    className="paper-input py-1 text-[12px]"
                  >
                    <option value="scene">前往场景</option>
                    <option value="call_scene">调用公共剧情</option>
                    <option value="ending">达成结局</option>
                  </select>
                  {block.trueTargetType === 'ending' ? (
                    <input
                      type="text"
                      value={block.trueEndingTitle ?? ''}
                      onChange={(e) => onUpdate({ ...block, trueEndingTitle: e.target.value })}
                      placeholder="结局标题"
                      className="paper-input flex-1 py-1"
                    />
                  ) : (
                    <select
                      value={block.trueTargetSceneId ?? ''}
                      onChange={(e) => onUpdate({ ...block, trueTargetSceneId: e.target.value })}
                      className="paper-input flex-1 py-1"
                    >
                      <option value="">选择目标场景</option>
                      {project.scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="p-2 rounded bg-[#FBFAF5] border border-[#E7E2D8]">
                <div className="font-medium text-[#706A60] mb-1">否则（条件不满足）：</div>
                <div className="flex gap-1.5">
                  <select
                    value={block.falseTargetType}
                    onChange={(e) =>
                      onUpdate({
                        ...block,
                        falseTargetType: e.target.value as typeof block.falseTargetType,
                      })
                    }
                    className="paper-input py-1 text-[12px]"
                  >
                    <option value="continue">继续往下执行</option>
                    <option value="scene">前往场景</option>
                    <option value="ending">达成结局</option>
                  </select>
                  {block.falseTargetType === 'scene' && (
                    <select
                      value={block.falseTargetSceneId ?? ''}
                      onChange={(e) => onUpdate({ ...block, falseTargetSceneId: e.target.value })}
                      className="paper-input flex-1 py-1"
                    >
                      <option value="">选择目标场景</option>
                      {project.scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {block.falseTargetType === 'ending' && (
                    <input
                      type="text"
                      value={block.falseEndingTitle ?? ''}
                      onChange={(e) => onUpdate({ ...block, falseEndingTitle: e.target.value })}
                      placeholder="否则分支结局标题"
                      className="paper-input flex-1 py-1"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {block.type === 'flow' && (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <select
              value={block.action}
              onChange={(e) =>
                onUpdate({ ...block, action: e.target.value as typeof block.action })
              }
              className="paper-input py-1"
            >
              <option value="jump_scene">前往指定场景</option>
              <option value="call_scene">调用可复用公共剧情段</option>
              <option value="return_from_call">返回主线调用处</option>
              <option value="pause">剧情停顿（秒）</option>
              <option value="wait_click">等待玩家点击</option>
              <option value="ending">达成结局</option>
            </select>

            {(block.action === 'jump_scene' || block.action === 'call_scene') && (
              <select
                value={block.targetSceneId ?? ''}
                onChange={(e) => onUpdate({ ...block, targetSceneId: e.target.value })}
                className="paper-input flex-1 py-1"
              >
                <option value="">选择目标场景</option>
                {project.scenes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            {block.action === 'pause' && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  max={30}
                  value={block.pauseSeconds ?? 1}
                  onChange={(e) => onUpdate({ ...block, pauseSeconds: Number(e.target.value) })}
                  className="paper-input w-20 py-1"
                />
                <span className="text-[#706A60]">秒</span>
              </div>
            )}

            {block.action === 'ending' && (
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
                <input
                  type="text"
                  value={block.endingTitle ?? ''}
                  onChange={(e) => onUpdate({ ...block, endingTitle: e.target.value })}
                  placeholder="结局名称（如：真结局 · 星光约定）"
                  className="paper-input py-1"
                />
                <input
                  type="text"
                  value={block.endingSubtitle ?? ''}
                  onChange={(e) => onUpdate({ ...block, endingSubtitle: e.target.value })}
                  placeholder="结局寄语（可选）"
                  className="paper-input py-1"
                />
                <select
                  value={block.cgAssetId ?? ''}
                  onChange={(e) => onUpdate({ ...block, cgAssetId: e.target.value || undefined })}
                  className="paper-input py-1"
                  title="结局专属 CG 插画（可选，达成后自动解锁）"
                >
                  <option value="">无结局专属 CG</option>
                  {project.assets
                    .filter((a) => a.category === 'background')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        结局 CG：{a.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        {block.type === 'player_name_input' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px]">
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">输入框提示语</label>
              <input
                type="text"
                value={block.prompt}
                onChange={(e) => onUpdate({ ...block, prompt: e.target.value })}
                className="paper-input w-full py-1"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">默认名字</label>
              <input
                type="text"
                value={block.defaultName}
                onChange={(e) => onUpdate({ ...block, defaultName: e.target.value })}
                className="paper-input w-full py-1"
              />
            </div>
          </div>
        )}

        {block.type === 'cg_unlock' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[12px]">
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">CG 标题</label>
              <input
                type="text"
                value={block.title}
                onChange={(e) => onUpdate({ ...block, title: e.target.value })}
                className="paper-input w-full py-1"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[#706A60] mb-1">插画图片</label>
              <select
                value={block.assetId}
                onChange={(e) => onUpdate({ ...block, assetId: e.target.value })}
                className="paper-input w-full py-1"
              >
                <option value="">选择背景/插画素材</option>
                {project.assets
                  .filter((a) => a.category === 'background')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <label className="inline-flex items-center gap-1.5 self-end pb-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={block.showFullscreen}
                onChange={(e) => onUpdate({ ...block, showFullscreen: e.target.checked })}
                className="accent-[#FF5A3D]"
              />
              同时全屏展示此 CG
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

const ChoiceOptionRow: React.FC<{
  option: ChoiceOption;
  index: number;
  project: ProjectData;
  onChange: (next: ChoiceOption) => void;
  onRemove: () => void;
}> = ({ option, index, project, onChange, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const condText = formatConditionNatural(option.condition, project.variables);
  const effText = option.effects.map((e) => formatEffectNatural(e, project.variables)).join('，');

  return (
    <div className="p-2.5 rounded-md border border-[#E7E2D8] bg-[#FBFAF5] flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[#FF5A3D] bg-[#FFF1ED] px-1.5 py-0.5 rounded">
          选项 {index + 1}
        </span>
        <input
          data-testid={`choice-opt-label-${index}`}
          type="text"
          value={option.label}
          onChange={(e) => onChange({ ...option, label: e.target.value })}
          placeholder="玩家看到的选项文字"
          className="paper-input flex-1 min-w-[140px] py-1 text-[12.5px]"
        />
        <select
          data-testid={`choice-opt-target-type-${index}`}
          value={option.targetType}
          onChange={(e) =>
            onChange({ ...option, targetType: e.target.value as ChoiceOption['targetType'] })
          }
          className="paper-input py-1 text-[12px]"
        >
          <option value="scene">前往场景</option>
          <option value="continue">继续本场景</option>
          <option value="call_scene">调用公共剧情</option>
          <option value="ending">直接结局</option>
        </select>

        {(option.targetType === 'scene' || option.targetType === 'call_scene') && (
          <select
            data-testid={`choice-opt-target-scene-${index}`}
            value={option.targetSceneId ?? ''}
            onChange={(e) => onChange({ ...option, targetSceneId: e.target.value || undefined })}
            className="paper-input py-1 text-[12px] max-w-[150px]"
          >
            <option value="">选择目标场景…</option>
            {project.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}

        {option.targetType === 'ending' && (
          <>
            <input
              type="text"
              value={option.endingTitle ?? ''}
              onChange={(e) => onChange({ ...option, endingTitle: e.target.value })}
              placeholder="结局名称"
              className="paper-input py-1 text-[12px] w-28"
            />
            <input
              type="text"
              value={option.endingSubtitle ?? ''}
              onChange={(e) => onChange({ ...option, endingSubtitle: e.target.value })}
              placeholder="结局寄语（可选）"
              className="paper-input py-1 text-[12px] w-32"
            />
          </>
        )}

        <button
          type="button"
          data-testid={`choice-opt-rules-btn-${index}`}
          onClick={() => setExpanded(!expanded)}
          className="paper-btn-secondary px-2 py-1 text-[11.5px] inline-flex items-center gap-1"
        >
          <Variable size={12} />
          条件与数值
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {(condText || effText) && !expanded && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {condText && (
            <span className="px-2 py-0.5 rounded bg-[#EDF7F1] text-[#2A7B50]">
              条件：{condText}
            </span>
          )}
          {effText && (
            <span className="px-2 py-0.5 rounded bg-[#FDF5E6] text-[#B86E00]">
              效果：{effText}
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div className="flex flex-col gap-2 pt-1.5 border-t border-[#E7E2D8]">
          <ConditionEditor
            value={option.condition}
            variables={project.variables}
            onChange={(condition) => onChange({ ...option, condition })}
          />
          {option.condition && option.condition.rules.length > 0 && (
            <div className="flex items-center gap-2 text-[12px] flex-wrap">
              <span className="text-[#706A60]">不满足条件时：</span>
              <select
                value={option.lockedBehavior}
                onChange={(e) =>
                  onChange({ ...option, lockedBehavior: e.target.value as 'hide' | 'disable' })
                }
                className="paper-input py-1 text-[12px]"
              >
                <option value="hide">隐藏该选项</option>
                <option value="disable">灰显并展示提示文字</option>
              </select>
              {option.lockedBehavior === 'disable' && (
                <input
                  type="text"
                  value={option.disabledHint ?? ''}
                  onChange={(e) => onChange({ ...option, disabledHint: e.target.value })}
                  placeholder="例如：好感度达到 2 解锁"
                  className="paper-input flex-1 py-1 text-[12px]"
                />
              )}
            </div>
          )}
          <StateEffectsEditor
            effects={option.effects}
            variables={project.variables}
            onChange={(effects) => onChange({ ...option, effects })}
            title="玩家选择此项后触发的状态变更（可多条）"
          />
        </div>
      )}
    </div>
  );
};

function getBlockHeaderMeta(block: StoryBlock): {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  colorClass: string;
} {
  switch (block.type) {
    case 'dialogue':
      return {
        title: block.nvlMode ? '全屏独白' : block.speakerId ? '角色对白' : '旁白叙述',
        icon: MessageSquare,
        colorClass: 'text-[#FF5A3D]',
      };
    case 'choice':
      return { title: '玩家选择分支', icon: GitFork, colorClass: 'text-[#B86E00]' };
    case 'background':
      return { title: '切换背景与转场', icon: ImageIcon, colorClass: 'text-[#2A7B50]' };
    case 'sprite':
      return {
        title: block.action === 'hide' ? '隐藏角色立绘' : '显示角色立绘',
        icon: UserSquare2,
        colorClass: 'text-[#2A7B50]',
      };
    case 'multilayer_stage':
      return { title: '多层场景舞台', icon: Layers, colorClass: 'text-[#2A7B50]' };
    case 'camera_fx':
      return { title: '镜头与氛围特效', icon: Camera, colorClass: 'text-[#B86E00]' };
    case 'audio':
      return { title: '音频控制', icon: Volume2, colorClass: 'text-[#565149]' };
    case 'video':
      return { title: '视频演出', icon: Film, colorClass: 'text-[#565149]' };
    case 'state_change':
      return { title: '故事状态变更', icon: Sliders, colorClass: 'text-[#B86E00]' };
    case 'condition_branch':
      return { title: '自动条件分支', icon: GitBranch, colorClass: 'text-[#B86E00]' };
    case 'flow':
      return {
        title: block.action === 'ending' ? '达成结局' : block.action === 'pause' ? '剧情停顿' : '剧情流程控制',
        icon: block.action === 'ending' ? Flag : block.action === 'pause' ? Clock : CornerDownRight,
        colorClass: block.action === 'ending' ? 'text-[#C93B2B]' : 'text-[#565149]',
      };
    case 'player_name_input':
      return { title: '玩家自定义姓名', icon: UserPen, colorClass: 'text-[#FF5A3D]' };
    case 'cg_unlock':
      return { title: '解锁鉴赏 CG', icon: Award, colorClass: 'text-[#FF5A3D]' };
  }
}
