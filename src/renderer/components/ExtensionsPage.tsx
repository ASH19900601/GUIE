import React from 'react';
import {
  Award,
  Heart,
  Save,
  UserPen,
  ShieldCheck,
  Clapperboard,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const ExtensionsPage: React.FC = () => {
  const { project, mutateProject, pushToast } = useAppStore();
  if (!project) return null;

  const ext = project.extensions;

  const toggleExt = (key: keyof typeof ext, enabled: boolean, name: string) => {
    mutateProject((d) => {
      if (key === 'galleryAndEndings') d.extensions.galleryAndEndings.enabled = enabled;
      else if (key === 'affectionSystem') d.extensions.affectionSystem.enabled = enabled;
      else if (key === 'sixSlotSaveScreen') d.extensions.sixSlotSaveScreen.enabled = enabled;
      else if (key === 'playerCustomName') d.extensions.playerCustomName.enabled = enabled;
      else if (key === 'autoSaveBeforeChoice') d.extensions.autoSaveBeforeChoice.enabled = enabled;
      else if (key === 'chapterTitleCard') d.extensions.chapterTitleCard.enabled = enabled;
    });
    pushToast('success', `${enabled ? '已启用' : '已关闭'}「${name}」`);
  };

  return (
    <div id="guie-main-scroll" className="h-full w-full overflow-y-auto paper-scroll bg-[#F3F0E8] p-6">
      <div className="max-w-[1080px] mx-auto flex flex-col gap-5">
        <div className="flex items-end justify-between flex-wrap gap-3 border-b border-[#D7D1C6] pb-4">
          <div>
            <h1 className="text-[18px] font-bold text-[#171513]">扩展市场（真实可玩系统模板）</h1>
            <p className="text-[13px] text-[#706A60] mt-1">
              每一项扩展均带完整的跨周目解锁、数值联动与游戏内界面，启用即刻生效，随时可安全关闭。
            </p>
          </div>
          <span className="text-[12px] text-[#706A60]">
            需要更复杂的定制玩法（如手机聊天、背包、小游戏）？点击左下角「AI 创作助手」直接描述需求。
          </span>
        </div>

        {/* Smooth deactivation notice for legacy deprecated extensions if present (Req 2.8) */}
        {ext.legacyDeprecatedExtensions && ext.legacyDeprecatedExtensions.some((x) => !x.disabled) && (
          <div className="p-4 rounded-md bg-[#FDF5E6] border border-[#ECD09E] flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 text-[12.5px] text-[#8F5500]">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">检测到旧版已废弃扩展</div>
                <div>
                  为了保证游戏逻辑严谨，您可以一键平滑关闭旧版占位扩展，项目中的所有场景与角色数据不会受到任何影响。
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                mutateProject((d) => {
                  d.extensions.legacyDeprecatedExtensions = d.extensions.legacyDeprecatedExtensions?.map(
                    (x) => ({ ...x, disabled: true })
                  );
                });
                pushToast('success', '已安全关闭旧版扩展，项目剧情数据完好无损');
              }}
              className="paper-btn-secondary px-3 py-1.5 text-[12px] shrink-0"
            >
              平滑关闭旧版扩展
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. CG Gallery, Scene Replay & Ending Collection */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#FFF1ED] border border-[#FBCBC1] text-[#FF5A3D] flex items-center justify-center shrink-0">
                  <Award size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">CG 鉴赏、已读回想与结局收集册</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    玩家在主菜单可打开专属收集册：仅当玩家在正篇中真正看过某张 CG、经历过某个场景或达成结局后才自动跨周目解锁；已软停用的章节和场景自动排除。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-gallery"
                checked={ext.galleryAndEndings.enabled}
                onChange={(v) => toggleExt('galleryAndEndings', v, 'CG 鉴赏与结局收集册')}
              />
            </div>

            {ext.galleryAndEndings.enabled && (
              <div className="pt-2.5 border-t border-[#EFECE3] flex flex-wrap gap-4 text-[12px] text-[#565149]">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.galleryAndEndings.enableCgGallery}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.galleryAndEndings.enableCgGallery = e.target.checked;
                      })
                    }
                    className="accent-[#FF5A3D]"
                  />
                  启用 CG 鉴赏相册
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.galleryAndEndings.enableSceneReplay}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.galleryAndEndings.enableSceneReplay = e.target.checked;
                      })
                    }
                    className="accent-[#FF5A3D]"
                  />
                  启用已读回想
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.galleryAndEndings.enableEndingBook}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.galleryAndEndings.enableEndingBook = e.target.checked;
                      })
                    }
                    className="accent-[#FF5A3D]"
                  />
                  启用结局收集册
                </label>
              </div>
            )}
          </div>

          {/* 2. Character Affection Progress System */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#FFF1ED] border border-[#FBCBC1] text-[#FF5A3D] flex items-center justify-center shrink-0">
                  <Heart size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">角色好感度进度系统</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    为项目中的真实角色绑定独立好感度数值轨道，在游戏中提供可随时打开查看的好感度进度条界面。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-affection"
                checked={ext.affectionSystem.enabled}
                onChange={(v) => toggleExt('affectionSystem', v, '角色好感度进度系统')}
              />
            </div>

            {ext.affectionSystem.enabled && (
              <div className="pt-2.5 border-t border-[#EFECE3] flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-[12px] flex-wrap">
                  <span className="font-medium">已绑定的角色好感度轨道</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      disabled={project.characters.length === 0}
                      onClick={() => {
                        mutateProject((d) => {
                          for (const ch of d.characters) {
                            if (d.extensions.affectionSystem.tracks.some((t) => t.characterId === ch.id)) {
                              continue;
                            }
                            let affVar = d.variables.find(
                              (v) => v.type === 'number' && v.linkedCharacterId === ch.id
                            );
                            if (!affVar) {
                              affVar = {
                                id: `var_aff_${ch.id.slice(-6)}_${Date.now().toString(36).slice(-3)}`,
                                name: `${ch.name}好感度`,
                                type: 'number',
                                initialValue: 0,
                                persistent: true,
                                category: 'affection',
                                linkedCharacterId: ch.id,
                                description: `${ch.name} 的跨周目持久好感度`,
                              };
                              d.variables.push(affVar);
                            }
                            d.extensions.affectionSystem.tracks.push({
                              characterId: ch.id,
                              variableId: affVar.id,
                              maxVal: 10,
                              label: `${ch.name}好感度`,
                            });
                          }
                        });
                        pushToast('success', '已为全部角色自动生成跨周目持久好感度轨道');
                      }}
                      className="paper-btn-secondary px-2 py-0.5 text-[11.5px]"
                    >
                      一键为全部角色生成
                    </button>
                    <button
                      disabled={project.characters.length === 0 || project.variables.filter((v) => v.type === 'number').length === 0}
                      onClick={() => {
                        const ch = project.characters[0];
                        const numVar = project.variables.find((v) => v.type === 'number');
                        if (!ch || !numVar) return;
                        mutateProject((d) => {
                          d.extensions.affectionSystem.tracks.push({
                            characterId: ch.id,
                            variableId: numVar.id,
                            maxVal: 10,
                            label: `${ch.name}好感度`,
                          });
                        });
                      }}
                      className="paper-btn-secondary px-2 py-0.5 text-[11.5px] inline-flex items-center gap-1"
                    >
                      <Plus size={11} /> 添加轨道
                    </button>
                  </div>
                </div>
                {ext.affectionSystem.tracks.length === 0 ? (
                  <div className="text-[11.5px] text-[#948D82]">
                    请先创建角色与数字类故事状态，再点击「添加轨道」。
                  </div>
                ) : (
                  ext.affectionSystem.tracks.map((tr, ti) => (
                    <div key={ti} className="flex items-center gap-1.5 text-[12px]">
                      <select
                        value={tr.characterId}
                        onChange={(e) =>
                          mutateProject((d) => {
                            d.extensions.affectionSystem.tracks[ti].characterId = e.target.value;
                          })
                        }
                        className="paper-input py-0.5 px-1.5 flex-1"
                      >
                        {project.characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={tr.variableId}
                        onChange={(e) =>
                          mutateProject((d) => {
                            d.extensions.affectionSystem.tracks[ti].variableId = e.target.value;
                          })
                        }
                        className="paper-input py-0.5 px-1.5 flex-1"
                      >
                        {project.variables
                          .filter((v) => v.type === 'number')
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={tr.maxVal}
                        onChange={(e) =>
                          mutateProject((d) => {
                            d.extensions.affectionSystem.tracks[ti].maxVal = Number(e.target.value);
                          })
                        }
                        title="满值上限"
                        className="paper-input w-16 py-0.5 px-1 text-center"
                      />
                      <button
                        onClick={() =>
                          mutateProject((d) => {
                            d.extensions.affectionSystem.tracks.splice(ti, 1);
                          })
                        }
                        className="p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 3. Six-Slot Large Thumbnail Save Screen */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#EDF7F1] border border-[#C6E6D3] text-[#2A7B50] flex items-center justify-center shrink-0">
                  <Save size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">六格大图存档页</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    为玩家提供带高清画面缩略图、存档时间与当前章节场景名称的 3×2 大图存档与读档界面。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-save"
                checked={ext.sixSlotSaveScreen.enabled}
                onChange={(v) => toggleExt('sixSlotSaveScreen', v, '六格大图存档页')}
              />
            </div>
          </div>

          {/* 4. Player Custom Name System */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#EDF7F1] border border-[#C6E6D3] text-[#2A7B50] flex items-center justify-center shrink-0">
                  <UserPen size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">玩家自定义名字系统</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    游戏开场或指定剧情处弹出正式输入框让玩家命名主角，并在所有对白中通过「插入玩家名字」动态称呼玩家。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-name"
                checked={ext.playerCustomName.enabled}
                onChange={(v) => toggleExt('playerCustomName', v, '玩家自定义名字系统')}
              />
            </div>
            {ext.playerCustomName.enabled && (
              <div className="pt-2.5 border-t border-[#EFECE3] grid grid-cols-2 gap-2.5 text-[12px]">
                <div>
                  <label className="block text-[11px] text-[#706A60] mb-1">默认主角名字</label>
                  <input
                    type="text"
                    value={ext.playerCustomName.defaultName}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.playerCustomName.defaultName = e.target.value;
                      })
                    }
                    className="paper-input w-full py-1"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#706A60] mb-1">输入提示语</label>
                  <input
                    type="text"
                    value={ext.playerCustomName.promptText}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.playerCustomName.promptText = e.target.value;
                      })
                    }
                    className="paper-input w-full py-1"
                  />
                </div>
                <label className="col-span-2 inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ext.playerCustomName.promptAtStart}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.playerCustomName.promptAtStart = e.target.checked;
                      })
                    }
                    className="accent-[#FF5A3D]"
                  />
                  新游戏开场时自动弹出起名窗口
                </label>
              </div>
            )}
          </div>

          {/* 5. Auto-Save Before Choice */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#FDF5E6] border border-[#ECD09E] text-[#B86E00] flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">选择前自动存档</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    每次剧情推进到玩家分支选择前，自动在后台保存当前进度与画面，方便玩家随时回档体验其他路线。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-autosave"
                checked={ext.autoSaveBeforeChoice.enabled}
                onChange={(v) => toggleExt('autoSaveBeforeChoice', v, '选择前自动存档')}
              />
            </div>
          </div>

          {/* 6. Chapter Title Card */}
          <div className="paper-card p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-[#FDF5E6] border border-[#ECD09E] text-[#B86E00] flex items-center justify-center shrink-0">
                  <Clapperboard size={18} />
                </div>
                <div>
                  <div className="font-semibold text-[14.5px]">章节标题过场卡</div>
                  <p className="text-[12px] text-[#706A60] mt-0.5 leading-relaxed">
                    玩家进入新章节时，自动播放带章节标题的电影感过场画面，增强长篇故事的节奏感。
                  </p>
                </div>
              </div>
              <ToggleSwitch
                testId="ext-toggle-chapter-card"
                checked={ext.chapterTitleCard.enabled}
                onChange={(v) => toggleExt('chapterTitleCard', v, '章节标题过场卡')}
              />
            </div>
            {ext.chapterTitleCard.enabled && (
              <div className="pt-2.5 border-t border-[#EFECE3] flex items-center gap-4 flex-wrap text-[12px]">
                <div className="flex items-center gap-2">
                  <span className="text-[#706A60]">停留时长（秒）：</span>
                  <input
                    type="number"
                    step={0.2}
                    min={0.8}
                    max={6}
                    value={ext.chapterTitleCard.duration}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.chapterTitleCard.duration = Number(e.target.value);
                      })
                    }
                    className="paper-input w-20 py-1"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[#706A60]">画面风格：</span>
                  <select
                    value={ext.chapterTitleCard.style}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.extensions.chapterTitleCard.style = e.target.value as 'minimal' | 'cinematic' | 'ink';
                      })
                    }
                    className="paper-input py-1 text-[12px]"
                  >
                    <option value="minimal">极简深幕</option>
                    <option value="cinematic">电影黑金</option>
                    <option value="ink">素雅暖纸</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  testId?: string;
}> = ({ checked, onChange, testId }) => (
  <button
    type="button"
    data-testid={testId}
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
      checked ? 'bg-[#FF5A3D]' : 'bg-[#D7D1C6]'
    }`}
  >
    <div
      className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
);
