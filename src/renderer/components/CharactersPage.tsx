import React, { useState } from 'react';
import {
  Users,
  Sliders,
  Plus,
  Upload,
  Trash2,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
} from 'lucide-react';
import type { Character, StoryVariable, VariableType } from '@shared/types';
import { createId } from '@shared/defaults';
import { useAppStore } from '../store/useAppStore';

const CHAR_PALETTE = ['#FF5A3D', '#2A7B50', '#2563EB', '#B86E00', '#A84E7B', '#0E7490'];

/**
 * Parses `角色名_表情名` or `角色名-表情名` or `角色名 表情名` from sprite filename (Req 2.5)
 */
function parseSpriteFileName(rawName: string): { charName: string; expressionName: string; outfit?: string } {
  const noExt = rawName.replace(/\.[^.]+$/, '').trim();
  const parts = noExt.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length >= 3) {
    return { charName: parts[0], outfit: parts[1], expressionName: parts.slice(2).join('_') };
  }
  if (parts.length === 2) {
    return { charName: parts[0], expressionName: parts[1] };
  }
  return { charName: noExt || '新角色', expressionName: '默认' };
}

export const CharactersPage: React.FC = () => {
  const {
    project,
    projectDir,
    selectedCharacterId,
    setSelectedCharacterId,
    mutateProject,
    pushToast,
  } = useAppStore();

  const [subTab, setSubTab] = useState<'characters' | 'variables'>('characters');
  const [moreOpen, setMoreOpen] = useState(false);

  // New Variable Form
  const [newVarName, setNewVarName] = useState('');
  const [newVarType, setNewVarType] = useState<VariableType>('number');
  const [newVarInit, setNewVarInit] = useState('0');
  const [newVarPersistent, setNewVarPersistent] = useState(false);

  if (!project || !projectDir) return null;

  const selectedChar: Character | null =
    project.characters.find((c) => c.id === selectedCharacterId) ?? project.characters[0] ?? null;

  const getAssetSrc = (assetId?: string | null) => {
    if (!assetId) return null;
    const a = project.assets.find((item) => item.id === assetId);
    return a ? window.guie.getAssetUrl(projectDir, a.relativePath) : null;
  };

  // Requirement 6.2.4: Adding a new character MUST automatically select and switch to it!
  const handleAddCharacter = () => {
    const newId = createId('ch');
    const idx = project.characters.length;
    mutateProject((draft) => {
      draft.characters.push({
        id: newId,
        name: `新角色 ${idx + 1}`,
        color: CHAR_PALETTE[idx % CHAR_PALETTE.length],
        expressions: [],
      });
    });
    setSelectedCharacterId(newId);
    pushToast('success', '已新建角色，请在右侧编辑姓名与表情立绘');
  };

  // Requirement 2.5: Batch import sprites -> auto-infer `角色名_表情名`, append to existing same-name character!
  const handleBatchImportSprites = async (filePaths?: string[]) => {
    const paths =
      filePaths ??
      (await window.guie.pickFiles({
        title: '批量选择角色立绘图片（支持「角色名_表情名.png」自动建角）',
        multi: true,
        filters: [{ name: '立绘图片', extensions: ['png', 'webp', 'jpg', 'jpeg'] }],
      }));
    if (paths.length === 0) return;

    const importedAssets = await window.guie.importAssets(projectDir, paths, 'sprite');
    if (importedAssets.length === 0) return;

    let createdChars = 0;
    let addedExps = 0;
    let firstAffectedCharId: string | null = null;

    mutateProject(
      (draft) => {
        for (const asset of importedAssets) {
          draft.assets.push(asset);
          const { charName, expressionName, outfit } = parseSpriteFileName(asset.originalName);
          let ch = draft.characters.find((c) => c.name === charName);
          if (!ch) {
            ch = {
              id: createId('ch'),
              name: charName,
              color: CHAR_PALETTE[draft.characters.length % CHAR_PALETTE.length],
              avatarAssetId: asset.id,
              expressions: [],
            };
            draft.characters.push(ch);
            createdChars += 1;
          }
          if (!firstAffectedCharId) firstAffectedCharId = ch.id;
          ch.expressions.push({
            id: createId('exp'),
            name: expressionName,
            outfit,
            assetId: asset.id,
            order: ch.expressions.length,
          });
          addedExps += 1;
        }
      },
      { immediateSave: true }
    );

    if (firstAffectedCharId) setSelectedCharacterId(firstAffectedCharId);
    pushToast(
      'success',
      `批量导入完成：新增 ${createdChars} 名角色，共导入 ${addedExps} 张表情立绘`
    );
  };

  const handleAddExpressionForSelected = async () => {
    if (!selectedChar) return;
    const paths = await window.guie.pickFiles({
      title: `为「${selectedChar.name}」选择立绘图片`,
      multi: true,
      filters: [{ name: '立绘图片', extensions: ['png', 'webp', 'jpg', 'jpeg'] }],
    });
    if (paths.length === 0) return;
    const imported = await window.guie.importAssets(projectDir, paths, 'sprite');
    mutateProject(
      (draft) => {
        const ch = draft.characters.find((c) => c.id === selectedChar.id);
        if (!ch) return;
        for (const asset of imported) {
          draft.assets.push(asset);
          const parsed = parseSpriteFileName(asset.originalName);
          const expName =
            parsed.charName === ch.name
              ? parsed.expressionName
              : asset.name;
          ch.expressions.push({
            id: createId('exp'),
            name: expName,
            outfit: parsed.outfit,
            assetId: asset.id,
            order: ch.expressions.length,
          });
          if (!ch.avatarAssetId) ch.avatarAssetId = asset.id;
        }
      },
      { immediateSave: true }
    );
    pushToast('success', `已为「${selectedChar.name}」添加 ${imported.length} 张表情立绘`);
  };

  const updateSelectedChar = (updater: (ch: Character) => void) => {
    if (!selectedChar) return;
    mutateProject((draft) => {
      const ch = draft.characters.find((c) => c.id === selectedChar.id);
      if (ch) updater(ch);
    });
  };

  const handleDeleteSelectedChar = () => {
    if (!selectedChar) return;
    const delId = selectedChar.id;
    const delName = selectedChar.name;
    mutateProject(
      (draft) => {
        draft.characters = draft.characters.filter((c) => c.id !== delId);
      },
      { milestoneLabel: `删除角色「${delName}」前` }
    );
    const next = project.characters.find((c) => c.id !== delId);
    setSelectedCharacterId(next?.id ?? null);
  };

  const handleCreateVariable = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newVarName.trim();
    if (!name) return;
    if (project.variables.some((v) => v.name === name)) {
      pushToast('warning', `已存在名为「${name}」的故事状态`);
      return;
    }
    const initVal: number | boolean | string =
      newVarType === 'number'
        ? Number(newVarInit) || 0
        : newVarType === 'boolean'
        ? newVarInit === 'true'
        : newVarInit;

    const newVar: StoryVariable = {
      id: createId('var'),
      name,
      type: newVarType,
      initialValue: initVal,
      persistent: newVarPersistent,
      category: newVarType === 'number' ? 'affection' : newVarType === 'boolean' ? 'flag' : 'general',
    };
    mutateProject((draft) => {
      draft.variables.push(newVar);
    });
    setNewVarName('');
    setNewVarInit(newVarType === 'number' ? '0' : newVarType === 'boolean' ? 'false' : '');
    pushToast('success', `已添加故事状态「${name}」`);
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-[#F3F0E8]">
      {/* Page Header & Decoupled Sub-Tabs (Req 6.2.4) */}
      <div className="px-6 py-3.5 border-b border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-[16px] font-bold text-[#171513]">角色与故事状态</h1>
          <div className="inline-flex bg-[#EFECE3] p-0.5 rounded-md border border-[#D7D1C6]">
            <button
              data-testid="tab-characters"
              onClick={() => setSubTab('characters')}
              className={`px-3 py-1 rounded text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer ${
                subTab === 'characters'
                  ? 'bg-white text-[#171513] font-semibold shadow-xs'
                  : 'text-[#706A60] hover:text-[#171513]'
              }`}
            >
              <Users size={13} />
              角色阵容 ({project.characters.length})
            </button>
            <button
              data-testid="tab-variables"
              onClick={() => setSubTab('variables')}
              className={`px-3 py-1 rounded text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer ${
                subTab === 'variables'
                  ? 'bg-white text-[#171513] font-semibold shadow-xs'
                  : 'text-[#706A60] hover:text-[#171513]'
              }`}
            >
              <Sliders size={13} />
              故事状态 / 数值 ({project.variables.length})
            </button>
          </div>
        </div>

        {subTab === 'characters' && (
          <div className="flex items-center gap-2">
            <button
              data-testid="batch-import-sprites-btn"
              onClick={() => void handleBatchImportSprites()}
              className="paper-btn-primary px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
            >
              <Upload size={14} />
              批量导入立绘建角
            </button>
            <button
              data-testid="add-character-btn"
              onClick={handleAddCharacter}
              className="paper-btn-secondary px-3 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              新建角色
            </button>
          </div>
        )}
      </div>

      {/* Sub-Tab 1: Character Roster + Focused Detail Pane */}
      {subTab === 'characters' && (
        <div
          className="flex-1 min-h-0 flex overflow-hidden"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const paths = Array.from(e.dataTransfer.files)
              .map((f) => window.guie.getPathForFile(f))
              .filter((p): p is string => Boolean(p));
            if (paths.length > 0) void handleBatchImportSprites(paths);
          }}
        >
          {/* Left Character Roster List */}
          <aside className="w-[270px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] overflow-y-auto paper-scroll p-3 flex flex-col gap-1.5">
            {project.characters.length === 0 ? (
              <div className="py-12 text-center px-3">
                <div className="text-[13px] font-medium text-[#171513] mb-1">还没有角色</div>
                <p className="text-[12px] text-[#706A60] mb-3">
                  可点击「新建角色」，或直接将多张「角色名_表情名.png」立绘拖进此页面自动建角。
                </p>
                <button
                  onClick={handleAddCharacter}
                  className="paper-btn-primary px-3 py-1.5 text-[12px] inline-flex items-center gap-1"
                >
                  <Plus size={13} /> 创建第一位角色
                </button>
              </div>
            ) : (
              project.characters.map((ch) => {
                const isSel = selectedChar?.id === ch.id;
                const thumb = getAssetSrc(ch.avatarAssetId ?? ch.expressions[0]?.assetId);
                return (
                  <button
                    key={ch.id}
                    data-testid={`char-roster-${ch.id}`}
                    onClick={() => setSelectedCharacterId(ch.id)}
                    className={`w-full text-left p-2.5 rounded-md border flex items-center gap-2.5 cursor-pointer transition-colors ${
                      isSel
                        ? 'bg-[#FFF1ED] border-[#FF5A3D]'
                        : 'bg-white border-[#E7E2D8] hover:border-[#D7D1C6]'
                    }`}
                  >
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={ch.name}
                        className="w-10 h-10 rounded object-cover bg-[#F3F0E8] border border-[#E7E2D8] shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded flex items-center justify-center text-white font-bold text-[14px] shrink-0"
                        style={{ backgroundColor: ch.color }}
                      >
                        {ch.name.slice(0, 1)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[13px] text-[#171513] truncate">
                        {ch.name}
                      </div>
                      <div className="text-[11.5px] text-[#706A60]">
                        {ch.expressions.length} 个表情立绘
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </aside>

          {/* Right Focused Character Detail Editor */}
          <div id="guie-main-scroll" className="flex-1 min-w-0 overflow-y-auto paper-scroll p-6">
            {!selectedChar ? (
              <div className="h-full flex items-center justify-center text-[#706A60] text-[13.5px]">
                请在左侧选择或新建一名角色
              </div>
            ) : (
              <div className="max-w-[820px] flex flex-col gap-5">
                {/* Core Identity Card */}
                <div className="paper-card p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-[15px]">角色基础资料</h2>
                    <button
                      onClick={handleDeleteSelectedChar}
                      className="text-[12px] text-[#C93B2B] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 size={13} /> 删除此角色
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[12px] font-medium mb-1">角色姓名</label>
                      <input
                        data-testid="char-name-input"
                        type="text"
                        value={selectedChar.name}
                        onChange={(e) => updateSelectedChar((c) => { c.name = e.target.value; })}
                        className="paper-input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1">名字专属颜色</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedChar.color}
                          onChange={(e) => updateSelectedChar((c) => { c.color = e.target.value; })}
                          className="h-[34px] w-12 rounded border border-[#D7D1C6] cursor-pointer"
                        />
                        <input
                          type="text"
                          value={selectedChar.color}
                          onChange={(e) => updateSelectedChar((c) => { c.color = e.target.value; })}
                          className="paper-input flex-1 font-mono text-[12px]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1">对话框侧边头像</label>
                      <select
                        value={selectedChar.avatarAssetId ?? ''}
                        onChange={(e) =>
                          updateSelectedChar((c) => {
                            c.avatarAssetId = e.target.value || undefined;
                          })
                        }
                        className="paper-input w-full"
                      >
                        <option value="">不显示侧边头像</option>
                        {project.assets
                          .filter((a) => a.category === 'sprite' || a.category === 'ui')
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Visual Expressions & Outfits Manager */}
                <div className="paper-card p-5 flex flex-col gap-3.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="font-semibold text-[15px]">表情与服装立绘</h2>
                      <p className="text-[12px] text-[#706A60]">
                        支持导入多张立绘、自定义表情名与服装标签，并自由调整顺序
                      </p>
                    </div>
                    <button
                      data-testid="add-char-expression-btn"
                      onClick={() => void handleAddExpressionForSelected()}
                      className="paper-btn-primary px-3 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
                    >
                      <Plus size={14} /> 添加表情立绘
                    </button>
                  </div>

                  {selectedChar.expressions.length === 0 ? (
                    <div className="py-10 rounded-md border border-dashed border-[#D7D1C6] bg-[#FBFAF5] text-center text-[#706A60] text-[12.5px]">
                      <ImageIcon size={22} className="mx-auto mb-2 text-[#948D82]" />
                      暂无立绘图片，点击上方「添加表情立绘」或直接拖入多张立绘图片。
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedChar.expressions.map((exp, ei) => {
                        const src = getAssetSrc(exp.assetId);
                        return (
                          <div
                            key={exp.id}
                            className="rounded-md border border-[#E7E2D8] bg-[#FBFAF5] p-2.5 flex flex-col gap-2"
                          >
                            <div className="h-[140px] rounded bg-[#EFECE3] overflow-hidden flex items-center justify-center">
                              {src ? (
                                <img src={src} alt={exp.name} className="h-full w-auto object-contain" />
                              ) : (
                                <span className="text-[11px] text-[#948D82]">图片缺失</span>
                              )}
                            </div>
                            <input
                              type="text"
                              value={exp.name}
                              onChange={(e) =>
                                updateSelectedChar((c) => {
                                  const t = c.expressions.find((x) => x.id === exp.id);
                                  if (t) t.name = e.target.value;
                                })
                              }
                              placeholder="表情名称（如：微笑）"
                              className="paper-input py-1 text-[12px]"
                            />
                            <input
                              type="text"
                              value={exp.outfit ?? ''}
                              onChange={(e) =>
                                updateSelectedChar((c) => {
                                  const t = c.expressions.find((x) => x.id === exp.id);
                                  if (t) t.outfit = e.target.value || undefined;
                                })
                              }
                              placeholder="服装标签（可选，如：校服）"
                              className="paper-input py-1 text-[11.5px]"
                            />
                            <div className="flex items-center justify-between pt-1 border-t border-[#E7E2D8]">
                              <div className="flex gap-1">
                                <button
                                  title="前移"
                                  disabled={ei === 0}
                                  onClick={() =>
                                    updateSelectedChar((c) => {
                                      const [m] = c.expressions.splice(ei, 1);
                                      c.expressions.splice(ei - 1, 0, m);
                                    })
                                  }
                                  className="p-1 rounded hover:bg-[#EFECE3] disabled:opacity-35 cursor-pointer"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button
                                  title="后移"
                                  disabled={ei === selectedChar.expressions.length - 1}
                                  onClick={() =>
                                    updateSelectedChar((c) => {
                                      const [m] = c.expressions.splice(ei, 1);
                                      c.expressions.splice(ei + 1, 0, m);
                                    })
                                  }
                                  className="p-1 rounded hover:bg-[#EFECE3] disabled:opacity-35 cursor-pointer"
                                >
                                  <ArrowDown size={12} />
                                </button>
                              </div>
                              <button
                                onClick={() =>
                                  updateSelectedChar((c) => {
                                    c.expressions = c.expressions.filter((x) => x.id !== exp.id);
                                  })
                                }
                                className="text-[11.5px] text-[#C93B2B] hover:underline cursor-pointer"
                              >
                                移除
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Collapsible More Settings (Req 6.2.4: Low-frequency settings tucked away) */}
                <div className="paper-card overflow-hidden">
                  <button
                    onClick={() => setMoreOpen(!moreOpen)}
                    className="w-full px-5 py-3 flex items-center justify-between bg-[#FBFAF5] text-[13.5px] font-medium cursor-pointer"
                  >
                    <span>更多设置（专属字体、专属对话框、默认全屏独白）</span>
                    {moreOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {moreOpen && (
                    <div className="p-5 border-t border-[#E7E2D8] grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12px] font-medium mb-1">角色专属字体</label>
                        <select
                          value={selectedChar.fontAssetId ?? ''}
                          onChange={(e) =>
                            updateSelectedChar((c) => {
                              c.fontAssetId = e.target.value || undefined;
                            })
                          }
                          className="paper-input w-full"
                        >
                          <option value="">跟随游戏全局字体</option>
                          {project.assets
                            .filter((a) => a.category === 'font')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium mb-1">角色专属对话框底图</label>
                        <select
                          value={selectedChar.dialogueBoxBgAssetId ?? ''}
                          onChange={(e) =>
                            updateSelectedChar((c) => {
                              c.dialogueBoxBgAssetId = e.target.value || undefined;
                            })
                          }
                          className="paper-input w-full"
                        >
                          <option value="">跟随全局对话框样式</option>
                          {project.assets
                            .filter((a) => a.category === 'ui')
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <label className="inline-flex items-center gap-2 text-[12.5px] cursor-pointer sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedChar.nvlDefault)}
                          onChange={(e) =>
                            updateSelectedChar((c) => {
                              c.nvlDefault = e.target.checked;
                            })
                          }
                          className="accent-[#FF5A3D]"
                        />
                        该角色说话时默认使用全屏独白（NVL）模式
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Decoupled Story States (Variables) Management */}
      {subTab === 'variables' && (
        <div id="guie-main-scroll" className="flex-1 overflow-y-auto paper-scroll p-6">
          <div className="max-w-[900px] mx-auto flex flex-col gap-5">
            <form onSubmit={handleCreateVariable} className="paper-card p-5 flex flex-col gap-3">
              <div className="font-semibold text-[14.5px]">新增故事状态（好感度 / 线索开关 / 文本记录）</div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[12px] font-medium mb-1">状态名称</label>
                  <input
                    data-testid="new-var-name-input"
                    type="text"
                    value={newVarName}
                    onChange={(e) => setNewVarName(e.target.value)}
                    placeholder="例如：林夏好感度、获得钥匙"
                    className="paper-input w-full"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[12px] font-medium mb-1">类型</label>
                  <select
                    data-testid="new-var-type-select"
                    value={newVarType}
                    onChange={(e) => {
                      const t = e.target.value as VariableType;
                      setNewVarType(t);
                      setNewVarInit(t === 'number' ? '0' : t === 'boolean' ? 'false' : '');
                    }}
                    className="paper-input w-full"
                  >
                    <option value="number">数字（好感度/积分）</option>
                    <option value="boolean">开关（是否获得线索）</option>
                    <option value="string">文字（称号/职业）</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[12px] font-medium mb-1">初始值</label>
                  {newVarType === 'boolean' ? (
                    <select
                      value={newVarInit}
                      onChange={(e) => setNewVarInit(e.target.value)}
                      className="paper-input w-full"
                    >
                      <option value="false">未开启</option>
                      <option value="true">已开启</option>
                    </select>
                  ) : (
                    <input
                      type={newVarType === 'number' ? 'number' : 'text'}
                      value={newVarInit}
                      onChange={(e) => setNewVarInit(e.target.value)}
                      className="paper-input w-full"
                    />
                  )}
                </div>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <button
                    data-testid="add-var-submit-btn"
                    type="submit"
                    className="paper-btn-primary w-full py-2 text-[12.5px] inline-flex items-center justify-center gap-1"
                  >
                    <Plus size={14} /> 添加状态
                  </button>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-[12px] text-[#706A60] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newVarPersistent}
                  onChange={(e) => setNewVarPersistent(e.target.checked)}
                  className="accent-[#FF5A3D]"
                />
                设为跨周目持久状态（玩家重新开档或通关后依然保留此数值）
              </label>
            </form>

            <div className="paper-card overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E7E2D8] bg-[#FBFAF5] font-semibold text-[13.5px]">
                已有故事状态列表（重命名会自动同步全项目引用）
              </div>
              <div className="divide-y divide-[#EFECE3]">
                {project.variables.map((v) => (
                  <div key={v.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) =>
                        mutateProject((d) => {
                          const t = d.variables.find((x) => x.id === v.id);
                          if (t) t.name = e.target.value;
                        })
                      }
                      className="paper-input w-44 py-1 text-[13px] font-medium"
                    />
                    <span className="text-[11.5px] px-2 py-0.5 rounded bg-[#EFECE3] text-[#706A60]">
                      {v.type === 'number' ? '数字' : v.type === 'boolean' ? '开关' : '文字'}
                    </span>
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="text-[#706A60]">初始值：</span>
                      {v.type === 'boolean' ? (
                        <select
                          value={v.initialValue ? 'true' : 'false'}
                          onChange={(e) =>
                            mutateProject((d) => {
                              const t = d.variables.find((x) => x.id === v.id);
                              if (t) t.initialValue = e.target.value === 'true';
                            })
                          }
                          className="paper-input py-1 text-[12px]"
                        >
                          <option value="false">未开启</option>
                          <option value="true">已开启</option>
                        </select>
                      ) : (
                        <input
                          type={v.type === 'number' ? 'number' : 'text'}
                          value={String(v.initialValue)}
                          onChange={(e) =>
                            mutateProject((d) => {
                              const t = d.variables.find((x) => x.id === v.id);
                              if (t)
                                t.initialValue =
                                  v.type === 'number' ? Number(e.target.value) : e.target.value;
                            })
                          }
                          className="paper-input w-24 py-1 text-[12px]"
                        />
                      )}
                    </div>
                    <label className="inline-flex items-center gap-1.5 text-[12px] text-[#706A60] cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={v.persistent}
                        onChange={(e) =>
                          mutateProject((d) => {
                            const t = d.variables.find((x) => x.id === v.id);
                            if (t) t.persistent = e.target.checked;
                          })
                        }
                        className="accent-[#FF5A3D]"
                      />
                      跨周目持久
                    </label>
                    <button
                      onClick={() =>
                        mutateProject(
                          (d) => {
                            d.variables = d.variables.filter((x) => x.id !== v.id);
                          },
                          { milestoneLabel: `删除故事状态「${v.name}」前` }
                        )
                      }
                      className="p-1.5 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                      title="删除状态"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
