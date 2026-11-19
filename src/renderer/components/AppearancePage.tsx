import React, { useState } from 'react';
import {
  Palette,
  Type,
  MessageSquare,
  MousePointerClick,
  AppWindow,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Save,
  Check,
} from 'lucide-react';
import type { DialogueBoxPreset, ThemePresetId } from '@shared/types';
import { APPEARANCE_PRESETS, createDefaultAppearance, createId } from '@shared/defaults';
import { useAppStore } from '../store/useAppStore';

type AppearanceCategory = 'theme' | 'font' | 'dialogue' | 'buttons' | 'window';

const NAV_ITEMS: Array<{
  id: AppearanceCategory;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'theme', label: '整体主题', icon: Palette },
  { id: 'font', label: '全局字体', icon: Type },
  { id: 'dialogue', label: '对话框样式', icon: MessageSquare },
  { id: 'buttons', label: '选项与按钮', icon: MousePointerClick },
  { id: 'window', label: '窗口与图标', icon: AppWindow },
];

export const AppearancePage: React.FC = () => {
  const { project, projectDir, mutateProject, pushToast } = useAppStore();
  const [cat, setCat] = useState<AppearanceCategory>('theme');
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  if (!project || !projectDir) return null;

  const ap = project.appearance;
  const getAssetUrl = (assetId?: string | null) => {
    if (!assetId) return null;
    const found = project.assets.find((a) => a.id === assetId);
    return found ? window.guie.getAssetUrl(projectDir, found.relativePath) : null;
  };

  const applyThemePreset = (presetId: ThemePresetId) => {
    const preset = APPEARANCE_PRESETS[presetId];
    mutateProject((d) => {
      d.appearance.themePreset = presetId;
      d.appearance.theme = { ...preset.theme };
      d.appearance.dialogueBox = { ...d.appearance.dialogueBox, ...preset.dialogueBox };
      d.appearance.buttons = { ...preset.buttons };
    });
    pushToast('success', `已切换主题风格为「${preset.name}」`);
  };

  // Requirement 6.2.6: Single-category reset without resetting entire project!
  const resetCurrentCategory = () => {
    const def = createDefaultAppearance(project.meta.title);
    mutateProject((d) => {
      if (cat === 'theme') {
        d.appearance.themePreset = def.themePreset;
        d.appearance.theme = { ...def.theme };
      } else if (cat === 'font') {
        d.appearance.font = { ...def.font };
      } else if (cat === 'dialogue') {
        const kept = d.appearance.dialogueBox.savedPresets;
        d.appearance.dialogueBox = { ...def.dialogueBox, savedPresets: kept };
      } else if (cat === 'buttons') {
        d.appearance.buttons = { ...def.buttons };
      } else if (cat === 'window') {
        d.appearance.window = { ...def.window, title: d.meta.title };
      }
    });
    pushToast('info', '已恢复当前分类的默认外观设置');
  };

  const saveDialoguePreset = () => {
    const name = newPresetName.trim();
    if (!name) return;
    const preset: DialogueBoxPreset = {
      id: createId('dpre'),
      name,
      fontSize: ap.dialogueBox.fontSize,
      fontWeight: ap.dialogueBox.fontWeight,
      lineHeight: ap.dialogueBox.lineHeight,
      letterSpacing: ap.dialogueBox.letterSpacing,
      textColor: ap.dialogueBox.textColor,
      nameColor: ap.dialogueBox.nameColor,
      textShadow: ap.dialogueBox.textShadow,
      shadowColor: ap.dialogueBox.shadowColor,
      paddingX: ap.dialogueBox.paddingX,
      paddingY: ap.dialogueBox.paddingY,
      nameFontSize: ap.dialogueBox.nameFontSize,
      boxHeight: ap.dialogueBox.boxHeight,
      boxBgColor: ap.dialogueBox.boxBgColor,
      boxOpacity: ap.dialogueBox.boxOpacity,
      typingCps: ap.dialogueBox.typingCps,
    };
    mutateProject((d) => {
      d.appearance.dialogueBox.savedPresets.push(preset);
    });
    setNewPresetName('');
    pushToast('success', `已保存对话框预设「${name}」`);
  };

  const sampleBg = getAssetUrl(project.assets.find((a) => a.category === 'background')?.id);
  const boxBgImg = getAssetUrl(ap.dialogueBox.backgroundAssetId);

  return (
    <div className="h-full w-full flex overflow-hidden bg-[#F3F0E8]">
      {/* Left 5-Category Nav (Req 6.2.6) */}
      <aside className="w-[186px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] p-3 flex flex-col gap-1">
        <div className="px-2 pb-2 mb-1 border-b border-[#E7E2D8] font-bold text-[15px]">
          游戏外观
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              data-testid={`appearance-cat-${item.id}`}
              onClick={() => setCat(item.id)}
              className={`w-full px-2.5 py-2 rounded-md text-[13px] flex items-center gap-2 cursor-pointer ${
                cat === item.id
                  ? 'bg-[#FFF1ED] text-[#171513] font-semibold'
                  : 'text-[#565149] hover:bg-[#EFECE3]'
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </aside>

      {/* Center Parameter & Preset Editor */}
      <div id="guie-main-scroll" className="flex-1 min-w-0 overflow-y-auto paper-scroll p-6">
        <div className="max-w-[640px] flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-[#171513]">
              {NAV_ITEMS.find((i) => i.id === cat)?.label}
            </h2>
            <button
              onClick={resetCurrentCategory}
              className="paper-btn-secondary px-3 py-1 text-[12px] inline-flex items-center gap-1"
            >
              <RotateCcw size={12} />
              恢复本页默认
            </button>
          </div>

          {cat === 'theme' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(APPEARANCE_PRESETS) as Array<[ThemePresetId, typeof APPEARANCE_PRESETS.paper_warm]>).map(
                  ([id, preset]) => {
                    const active = ap.themePreset === id;
                    return (
                      <button
                        key={id}
                        data-testid={`theme-preset-${id}`}
                        onClick={() => applyThemePreset(id)}
                        className={`text-left p-3.5 rounded-md border cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#FFF1ED] border-[#FF5A3D]'
                            : 'bg-white border-[#D7D1C6] hover:border-[#B8B0A0]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-[13.5px]">{preset.name}</span>
                          <div className="flex items-center gap-1">
                            <span className="w-3.5 h-3.5 rounded-full border border-black/15" style={{ backgroundColor: preset.theme.primaryColor }} />
                            <span className="w-3.5 h-3.5 rounded-full border border-black/15" style={{ backgroundColor: preset.dialogueBox.boxBgColor }} />
                            {active && <Check size={14} className="text-[#FF5A3D] ml-1" />}
                          </div>
                        </div>
                        <p className="text-[11.5px] text-[#706A60] leading-snug">{preset.description}</p>
                      </button>
                    );
                  }
                )}
              </div>

              <div className="paper-card p-4 grid grid-cols-2 gap-4 text-[12.5px]">
                <div>
                  <label className="block font-medium mb-1">主强调色</label>
                  <input
                    type="color"
                    value={ap.theme.primaryColor}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.theme.primaryColor = e.target.value;
                        d.appearance.theme.accentColor = e.target.value;
                      })
                    }
                    className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">菜单背景底色</label>
                  <input
                    type="color"
                    value={ap.theme.menuBgColor}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.theme.menuBgColor = e.target.value;
                      })
                    }
                    className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                  />
                </div>
              </div>
            </>
          )}

          {cat === 'font' && (
            <div className="paper-card p-5 flex flex-col gap-4 text-[12.5px]">
              <div className="p-3 rounded bg-[#EDF7F1] border border-[#C6E6D3] text-[#2A7B50] text-[12px]">
                已默认内置开源多语言字体（思源黑体精简版），完整支持简体中文、繁体中文、日文、韩文与拉丁/西里尔文字，彻底杜绝缺字方框。
              </div>
              <div>
                <label className="block font-medium mb-1">自定义全局字体（可选）</label>
                <select
                  value={ap.font.globalFontAssetId ?? ''}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.font.globalFontAssetId = e.target.value || null;
                    })
                  }
                  className="paper-input w-full"
                >
                  <option value="">使用内置开源多语言字体（推荐）</option>
                  {project.assets
                    .filter((a) => a.category === 'font')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">界面基础字号 ({ap.font.interfaceSize}px)</label>
                  <input
                    type="range"
                    min={18}
                    max={36}
                    value={ap.font.interfaceSize}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.font.interfaceSize = Number(e.target.value);
                      })
                    }
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">默认正文字号 ({ap.font.baseSize}px)</label>
                  <input
                    type="range"
                    min={22}
                    max={44}
                    value={ap.font.baseSize}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.font.baseSize = Number(e.target.value);
                      })
                    }
                    className="w-full accent-[#FF5A3D]"
                  />
                </div>
              </div>
            </div>
          )}

          {cat === 'dialogue' && (
            <>
              <div className="paper-card p-5 flex flex-col gap-4 text-[12.5px]">
                {/* Saved Presets */}
                <div>
                  <label className="block font-medium mb-1.5">快速套用对话框预设</label>
                  <div className="flex flex-wrap gap-2">
                    {ap.dialogueBox.savedPresets.map((pre) => (
                      <button
                        key={pre.id}
                        onClick={() =>
                          mutateProject((d) => {
                            d.appearance.dialogueBox = {
                              ...d.appearance.dialogueBox,
                              ...pre,
                              savedPresets: d.appearance.dialogueBox.savedPresets,
                            };
                          })
                        }
                        className="paper-btn-secondary px-3 py-1 text-[12px]"
                      >
                        {pre.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium mb-1">对话字号 ({ap.dialogueBox.fontSize}px)</label>
                    <input
                      data-testid="dialogue-fontsize-slider"
                      type="range"
                      min={20}
                      max={46}
                      value={ap.dialogueBox.fontSize}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.fontSize = Number(e.target.value);
                        })
                      }
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">角色名字号 ({ap.dialogueBox.nameFontSize}px)</label>
                    <input
                      type="range"
                      min={22}
                      max={48}
                      value={ap.dialogueBox.nameFontSize}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.nameFontSize = Number(e.target.value);
                        })
                      }
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">对话框高度 ({ap.dialogueBox.boxHeight}px)</label>
                    <input
                      type="range"
                      min={170}
                      max={420}
                      step={10}
                      value={ap.dialogueBox.boxHeight}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.boxHeight = Number(e.target.value);
                        })
                      }
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">
                      底框不透明度 ({Math.round(ap.dialogueBox.boxOpacity * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0.35}
                      max={1}
                      step={0.02}
                      value={ap.dialogueBox.boxOpacity}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.boxOpacity = Number(e.target.value);
                        })
                      }
                      className="w-full accent-[#FF5A3D]"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">对话文字颜色</label>
                    <input
                      type="color"
                      value={ap.dialogueBox.textColor}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.textColor = e.target.value;
                        })
                      }
                      className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">对话框底色</label>
                    <input
                      type="color"
                      value={ap.dialogueBox.boxBgColor}
                      onChange={(e) =>
                        mutateProject((d) => {
                          d.appearance.dialogueBox.boxBgColor = e.target.value;
                        })
                      }
                      className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-medium mb-1">自定义对话框背景图（可选）</label>
                  <select
                    value={ap.dialogueBox.backgroundAssetId ?? ''}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.dialogueBox.backgroundAssetId = e.target.value || null;
                      })
                    }
                    className="paper-input w-full"
                  >
                    <option value="">使用半透明纯色底框</option>
                    {project.assets
                      .filter((a) => a.category === 'ui' || a.category === 'background')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Collapsible Fine Tuning (Req 6.2.6) */}
                <div className="border-t border-[#E7E2D8] pt-3">
                  <button
                    onClick={() => setFineTuneOpen(!fineTuneOpen)}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#171513] cursor-pointer"
                  >
                    {fineTuneOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    精细调整（字重、行高、字距、阴影、内边距、打字速度）
                  </button>
                  {fineTuneOpen && (
                    <div className="mt-3 grid grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-[11.5px] text-[#706A60]">字重 ({ap.dialogueBox.fontWeight})</label>
                        <select
                          value={ap.dialogueBox.fontWeight}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.fontWeight = Number(e.target.value);
                            })
                          }
                          className="paper-input w-full py-1"
                        >
                          <option value={400}>常规 (400)</option>
                          <option value={500}>中等 (500)</option>
                          <option value={600}>加粗 (600)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-[#706A60]">行高 ({ap.dialogueBox.lineHeight})</label>
                        <input
                          type="range"
                          min={1.1}
                          max={2.2}
                          step={0.05}
                          value={ap.dialogueBox.lineHeight}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.lineHeight = Number(e.target.value);
                            })
                          }
                          className="w-full accent-[#FF5A3D]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-[#706A60]">字距 ({ap.dialogueBox.letterSpacing}px)</label>
                        <input
                          type="range"
                          min={0}
                          max={6}
                          step={0.5}
                          value={ap.dialogueBox.letterSpacing}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.letterSpacing = Number(e.target.value);
                            })
                          }
                          className="w-full accent-[#FF5A3D]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-[#706A60]">文字播放速度 ({ap.dialogueBox.typingCps} 字/秒)</label>
                        <input
                          type="range"
                          min={12}
                          max={90}
                          value={ap.dialogueBox.typingCps}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.typingCps = Number(e.target.value);
                            })
                          }
                          className="w-full accent-[#FF5A3D]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11.5px] text-[#706A60]">水平内边距 ({ap.dialogueBox.paddingX}px)</label>
                        <input
                          type="range"
                          min={16}
                          max={120}
                          value={ap.dialogueBox.paddingX}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.paddingX = Number(e.target.value);
                            })
                          }
                          className="w-full accent-[#FF5A3D]"
                        />
                      </div>
                      <label className="inline-flex items-center gap-2 text-[12px] self-end pb-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ap.dialogueBox.textShadow}
                          onChange={(e) =>
                            mutateProject((d) => {
                              d.appearance.dialogueBox.textShadow = e.target.checked;
                            })
                          }
                          className="accent-[#FF5A3D]"
                        />
                        开启文字阴影增强对比度
                      </label>
                    </div>
                  )}
                </div>

                {/* Save Custom Preset */}
                <div className="border-t border-[#E7E2D8] pt-3 flex gap-2">
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="将当前对话框样式另存为预设…"
                    className="paper-input flex-1 py-1 text-[12px]"
                  />
                  <button
                    onClick={saveDialoguePreset}
                    className="paper-btn-secondary px-3 py-1 text-[12px] inline-flex items-center gap-1"
                  >
                    <Save size={13} /> 保存预设
                  </button>
                </div>
              </div>
            </>
          )}

          {cat === 'buttons' && (
            <div className="paper-card p-5 grid grid-cols-2 gap-4 text-[12.5px]">
              <div>
                <label className="block font-medium mb-1">按钮外观风格</label>
                <select
                  value={ap.buttons.style}
                  onChange={(e) => {
                    const st = e.target.value as typeof ap.buttons.style;
                    mutateProject((d) => {
                      d.appearance.buttons.style = st;
                      d.appearance.buttons.radius = st === 'pill' ? 999 : st === 'sharp' ? 3 : 8;
                    });
                  }}
                  className="paper-input w-full"
                >
                  <option value="rounded">柔和圆角</option>
                  <option value="sharp">利落方角</option>
                  <option value="pill">胶囊圆边</option>
                  <option value="outline">粗边线框</option>
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1">按钮圆角 ({ap.buttons.radius}px)</label>
                <input
                  type="range"
                  min={0}
                  max={24}
                  value={Math.min(24, ap.buttons.radius)}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.buttons.radius = Number(e.target.value);
                    })
                  }
                  className="w-full accent-[#FF5A3D]"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">按钮底色</label>
                <input
                  type="color"
                  value={ap.buttons.bgColor}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.buttons.bgColor = e.target.value;
                    })
                  }
                  className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">悬停高亮色</label>
                <input
                  type="color"
                  value={ap.buttons.hoverBgColor}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.buttons.hoverBgColor = e.target.value;
                    })
                  }
                  className="h-9 w-full rounded border border-[#D7D1C6] cursor-pointer"
                />
              </div>
            </div>
          )}

          {cat === 'window' && (
            <div className="paper-card p-5 flex flex-col gap-4 text-[12.5px]">
              <div>
                <label className="block font-medium mb-1">游戏窗口标题</label>
                <input
                  type="text"
                  value={ap.window.title}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.window.title = e.target.value;
                      d.meta.title = e.target.value;
                    })
                  }
                  className="paper-input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">画面分辨率</label>
                  <select
                    value={`${ap.window.width}x${ap.window.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      mutateProject((d) => {
                        d.appearance.window.width = w;
                        d.appearance.window.height = h;
                      });
                    }}
                    className="paper-input w-full"
                  >
                    <option value="1920x1080">1920 × 1080（全高清 16:9）</option>
                    <option value="1280x720">1280 × 720（标准宽屏 16:9）</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">应用图标（PNG）</label>
                  <select
                    value={ap.window.iconAssetId ?? ''}
                    onChange={(e) =>
                      mutateProject((d) => {
                        d.appearance.window.iconAssetId = e.target.value || null;
                      })
                    }
                    className="paper-input w-full"
                  >
                    <option value="">默认游戏图标</option>
                    {project.assets
                      .filter((a) => a.category === 'ui' || a.category === 'background')
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ap.window.fullscreenDefault}
                  onChange={(e) =>
                    mutateProject((d) => {
                      d.appearance.window.fullscreenDefault = e.target.checked;
                    })
                  }
                  className="accent-[#FF5A3D]"
                />
                启动游戏时默认全屏显示
              </label>
            </div>
          )}
        </div>
      </div>

      {/* Right Persistent Real-Proportion Live Preview (Req 2.7 & 6.2.6) */}
      <aside
        data-testid="appearance-live-preview"
        className="w-[460px] shrink-0 h-full bg-[#FBFAF5] border-l border-[#D7D1C6] p-5 flex flex-col gap-4 overflow-y-auto paper-scroll"
      >
        <div>
          <div className="font-semibold text-[14px]">实时比例预览</div>
          <div className="text-[12px] text-[#706A60]">
            拖动滑块或切换主题配色时，下方游戏画面立即同步生效
          </div>
        </div>

        <div className="w-full aspect-video rounded-md overflow-hidden border border-[#D7D1C6] relative bg-[#1E1C1A] shadow-sm">
          {sampleBg ? (
            <img src={sampleBg} alt="背景预览" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, ${ap.theme.menuBgColor}, #2B2520)`,
              }}
            />
          )}

          {/* Sample Choice Buttons Preview */}
          <div className="absolute inset-x-0 top-7 flex flex-col items-center gap-2 px-10">
            {['去中庭花园散步', '去天台看日落'].map((lbl, idx) => (
              <div
                key={lbl}
                style={{
                  backgroundColor: idx === 0 ? ap.buttons.hoverBgColor : ap.buttons.bgColor,
                  color: ap.buttons.textColor,
                  borderColor: ap.buttons.borderColor,
                  borderWidth: `${ap.buttons.borderWidth}px`,
                  borderRadius: `${Math.min(18, ap.buttons.radius)}px`,
                }}
                className="w-full max-w-[260px] py-1.5 px-4 text-center text-[11.5px] font-medium border"
              >
                {lbl}
              </div>
            ))}
          </div>

          {/* Sample Dialogue Box Preview */}
          <div
            className="absolute left-0 right-0 bottom-0 flex flex-col justify-start"
            style={{
              height: `${Math.max(24, Math.min(44, Math.round((ap.dialogueBox.boxHeight / 1080) * 100)))}%`,
              backgroundColor: boxBgImg
                ? undefined
                : hexToRgba(ap.dialogueBox.boxBgColor, ap.dialogueBox.boxOpacity),
              backgroundImage: boxBgImg ? `url("${boxBgImg}")` : undefined,
              backgroundSize: 'cover',
              padding: `${Math.max(6, Math.round(ap.dialogueBox.paddingY * 0.3))}px ${Math.max(12, Math.round(ap.dialogueBox.paddingX * 0.35))}px`,
            }}
          >
            <div
              className="font-semibold mb-0.5"
              style={{
                color: ap.dialogueBox.nameColor,
                fontSize: `${Math.max(11, Math.round(ap.dialogueBox.nameFontSize * 0.36))}px`,
                textShadow: ap.dialogueBox.textShadow
                  ? `1px 1px 2px ${ap.dialogueBox.shadowColor}`
                  : undefined,
              }}
            >
              {project.characters[0]?.name || '林夏'}
            </div>
            <div
              data-testid="appearance-preview-dialogue-text"
              style={{
                color: ap.dialogueBox.textColor,
                fontSize: `${Math.max(10.5, Math.round(ap.dialogueBox.fontSize * 0.36))}px`,
                fontWeight: ap.dialogueBox.fontWeight,
                lineHeight: ap.dialogueBox.lineHeight,
                letterSpacing: `${ap.dialogueBox.letterSpacing * 0.3}px`,
                textShadow: ap.dialogueBox.textShadow
                  ? `1px 1px 2px ${ap.dialogueBox.shadowColor}`
                  : undefined,
              }}
            >
              微风吹动窗帘，这句话正在以「{APPEARANCE_PRESETS[ap.themePreset]?.name}」风格实时呈现。
            </div>
          </div>
        </div>

        <div className="paper-card p-3.5 text-[12px] text-[#706A60] flex flex-col gap-1">
          <div className="font-medium text-[#171513]">可读性校验</div>
          <div>
            当前文字色：<code className="font-mono text-[#171513]">{ap.dialogueBox.textColor}</code> ·
            底框色：<code className="font-mono text-[#171513]">{ap.dialogueBox.boxBgColor}</code> ·
            不透明度：{Math.round(ap.dialogueBox.boxOpacity * 100)}%
          </div>
        </div>
      </aside>
    </div>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
