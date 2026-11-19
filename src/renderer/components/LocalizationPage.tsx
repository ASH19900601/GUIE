import React, { useMemo, useState } from 'react';
import { Globe, Plus, Trash2, Search, Type, Image as ImageIcon } from 'lucide-react';
import { extractLocalizableStrings } from '@shared/defaults';
import { useAppStore } from '../store/useAppStore';

const PRESET_LANGS = [
  { code: 'en', name: 'English（英语）' },
  { code: 'ja', name: '日本語（日语）' },
  { code: 'ko', name: '한국어（韩语）' },
  { code: 'zh_TW', name: '繁體中文' },
  { code: 'es', name: 'Español（西班牙语）' },
  { code: 'ru', name: 'Русский（俄语）' },
];

export const LocalizationPage: React.FC = () => {
  const { project, mutateProject, pushToast } = useAppStore();
  const [selectedLangCode, setSelectedLangCode] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'untranslated' | 'translated'>('all');
  const [search, setSearch] = useState('');
  const [newLangPreset, setNewLangPreset] = useState('en');

  const strings = useMemo(() => (project ? extractLocalizableStrings(project) : []), [project]);

  if (!project) return null;

  const languages = project.localization.languages;
  const activeLang =
    languages.find((l) => l.code === selectedLangCode) ?? languages[0] ?? null;

  const handleAddLanguage = () => {
    const preset = PRESET_LANGS.find((p) => p.code === newLangPreset) ?? PRESET_LANGS[0];
    if (languages.some((l) => l.code === preset.code)) {
      pushToast('warning', `语言「${preset.name}」已在列表中`);
      return;
    }
    mutateProject((d) => {
      d.localization.languages.push({
        code: preset.code,
        name: preset.name,
        fontAssetId: null,
        imageOverrides: {},
        translations: {},
      });
    });
    setSelectedLangCode(preset.code);
    pushToast('success', `已添加目标语言「${preset.name}」，游戏内设置页将自动支持切换语言`);
  };

  const filteredStrings = useMemo(() => {
    if (!activeLang) return [];
    const q = search.trim().toLowerCase();
    return strings.filter((item) => {
      const tr = activeLang.translations[item.key]?.trim() ?? '';
      if (filterMode === 'untranslated' && tr.length > 0) return false;
      if (filterMode === 'translated' && tr.length === 0) return false;
      if (q && !item.sourceText.toLowerCase().includes(q) && !tr.toLowerCase().includes(q) && !item.context.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [strings, activeLang, filterMode, search]);

  return (
    <div className="h-full w-full flex overflow-hidden bg-[#F3F0E8]">
      {/* Column 1: Language List & Completion Progress (Req 6.2.8) */}
      <aside className="w-[240px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] flex flex-col">
        <div className="p-3.5 border-b border-[#E7E2D8] bg-white">
          <div className="font-bold text-[14.5px] flex items-center gap-1.5 mb-2.5">
            <Globe size={15} className="text-[#FF5A3D]" />
            多语言本地化
          </div>
          <div className="flex gap-1.5">
            <select
              value={newLangPreset}
              onChange={(e) => setNewLangPreset(e.target.value)}
              className="paper-input flex-1 min-w-0 py-1 text-[12px]"
            >
              {PRESET_LANGS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              data-testid="add-language-btn"
              onClick={handleAddLanguage}
              className="paper-btn-primary px-2.5 py-1 text-[12px] inline-flex items-center gap-1 shrink-0"
            >
              <Plus size={13} /> 添加
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto paper-scroll p-2.5 flex flex-col gap-1.5">
          {languages.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[#948D82] px-3">
              尚未添加译文语言，选择上方语言点击「添加」即可开始本地化。
            </div>
          ) : (
            languages.map((lang) => {
              const done = strings.filter((s) => Boolean(lang.translations[s.key]?.trim())).length;
              const pct = strings.length > 0 ? Math.round((done / strings.length) * 100) : 0;
              const isSel = activeLang?.code === lang.code;
              return (
                <div
                  key={lang.code}
                  onClick={() => setSelectedLangCode(lang.code)}
                  className={`p-2.5 rounded-md border cursor-pointer ${
                    isSel
                      ? 'bg-[#FFF1ED] border-[#FF5A3D]'
                      : 'bg-white border-[#E7E2D8] hover:border-[#D7D1C6]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[13px]">{lang.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        mutateProject((d) => {
                          d.localization.languages = d.localization.languages.filter(
                            (l) => l.code !== lang.code
                          );
                        });
                      }}
                      className="p-0.5 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-[#EFECE3] overflow-hidden">
                    <div className="h-full bg-[#FF5A3D]" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11px] text-[#706A60] mt-1 flex justify-between">
                    <span>已完成 {done} / {strings.length}</span>
                    <span>{pct}%</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Column 2: Progress, Filter, Language Font & Image Overrides */}
      <aside className="w-[270px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] overflow-y-auto paper-scroll p-4 flex flex-col gap-4">
        {!activeLang ? (
          <div className="text-[12.5px] text-[#948D82] py-10 text-center">请先在左侧添加语言</div>
        ) : (
          <>
            <div>
              <div className="font-semibold text-[13.5px] mb-2">筛选与搜索</div>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#948D82]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索原文或译文…"
                  className="paper-input w-full pl-8 py-1 text-[12px]"
                />
              </div>
              <div className="grid grid-cols-3 gap-1">
                {[
                  { id: 'all' as const, label: '全部' },
                  { id: 'untranslated' as const, label: '未翻译' },
                  { id: 'translated' as const, label: '已翻译' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterMode(f.id)}
                    className={`py-1 rounded text-[11.5px] border cursor-pointer ${
                      filterMode === f.id
                        ? 'bg-[#FFF1ED] border-[#FF5A3D] text-[#171513] font-medium'
                        : 'bg-white border-[#D7D1C6] text-[#706A60]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[#E7E2D8] pt-3.5">
              <div className="font-semibold text-[13px] mb-1.5 flex items-center gap-1.5">
                <Type size={13} className="text-[#FF5A3D]" /> 该语言专属字体
              </div>
              <select
                value={activeLang.fontAssetId ?? ''}
                onChange={(e) =>
                  mutateProject((d) => {
                    const l = d.localization.languages.find((x) => x.code === activeLang.code);
                    if (l) l.fontAssetId = e.target.value || null;
                  })
                }
                className="paper-input w-full text-[12px]"
              >
                <option value="">沿用内置多语言字体</option>
                {project.assets
                  .filter((a) => a.category === 'font')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="border-t border-[#E7E2D8] pt-3.5">
              <div className="font-semibold text-[13px] mb-1.5 flex items-center gap-1.5">
                <ImageIcon size={13} className="text-[#FF5A3D]" /> 替换含文字的图片素材
              </div>
              <p className="text-[11.5px] text-[#706A60] mb-2">
                当背景图或标题图带有中文文字时，可为当前语言指定替换图片。
              </p>
              {project.assets.filter((a) => a.category === 'background').length === 0 ? (
                <div className="text-[11.5px] text-[#948D82]">暂无背景图片素材</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {project.assets
                    .filter((a) => a.category === 'background')
                    .slice(0, 6)
                    .map((bg) => (
                      <div key={bg.id} className="text-[11.5px]">
                        <div className="text-[#565149] truncate mb-0.5">{bg.name} →</div>
                        <select
                          value={activeLang.imageOverrides[bg.id] ?? ''}
                          onChange={(e) =>
                            mutateProject((d) => {
                              const l = d.localization.languages.find((x) => x.code === activeLang.code);
                              if (!l) return;
                              if (e.target.value) l.imageOverrides[bg.id] = e.target.value;
                              else delete l.imageOverrides[bg.id];
                            })
                          }
                          className="paper-input w-full py-0.5 text-[11.5px]"
                        >
                          <option value="">不替换（使用原图）</option>
                          {project.assets
                            .filter((a) => a.category === 'background' && a.id !== bg.id)
                            .map((alt) => (
                              <option key={alt.id} value={alt.id}>
                                替换为：{alt.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* Column 3: Segmented Source-to-Target Editor */}
      <main id="guie-main-scroll" className="flex-1 min-w-0 overflow-y-auto paper-scroll p-5">
        {!activeLang ? (
          <div className="h-full flex items-center justify-center text-[#706A60] text-[13.5px]">
            在左侧选择或添加一个目标语言以开始分段对照翻译
          </div>
        ) : (
          <div className="max-w-[820px] flex flex-col gap-3">
            <div className="text-[13px] text-[#706A60]">
              当前正在翻译：<strong className="text-[#171513]">{activeLang.name}</strong>（显示{' '}
              {filteredStrings.length} / {strings.length} 条）
            </div>
            {filteredStrings.map((entry) => (
              <div key={entry.key} className="paper-card p-3.5 flex flex-col gap-2">
                <div className="text-[11px] text-[#948D82]">{entry.context}</div>
                <div className="text-[13px] text-[#171513] bg-[#FBFAF5] px-3 py-2 rounded border border-[#EFECE3]">
                  {entry.sourceText}
                </div>
                <textarea
                  rows={2}
                  value={activeLang.translations[entry.key] ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    mutateProject((d) => {
                      const l = d.localization.languages.find((x) => x.code === activeLang.code);
                      if (l) l.translations[entry.key] = val;
                    });
                  }}
                  placeholder={`输入 ${activeLang.name} 译文…`}
                  className="paper-input w-full text-[13px]"
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
