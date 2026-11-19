import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  Search,
  Image as ImageIcon,
  UserSquare2,
  Music,
  Volume2,
  Mic,
  Film,
  Type,
  Layout,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ExternalLink,
  PackageCheck,
  Award,
} from 'lucide-react';
import type { AssetCategory, AssetEntry } from '@shared/types';
import { computeAssetUsageMap, replaceAssetReferences } from '@shared/defaults';
import { useAppStore } from '../store/useAppStore';

const CATEGORIES: Array<{
  id: 'all' | AssetCategory;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'all', label: '全部素材', icon: Layout },
  { id: 'background', label: '背景画面', icon: ImageIcon },
  { id: 'sprite', label: '角色立绘', icon: UserSquare2 },
  { id: 'bgm', label: '背景音乐', icon: Music },
  { id: 'se', label: '音效 (SE)', icon: Volume2 },
  { id: 'voice', label: '角色语音', icon: Mic },
  { id: 'video', label: '视频动画', icon: Film },
  { id: 'font', label: '字体文件', icon: Type },
  { id: 'ui', label: '界面图片', icon: Layout },
];

export const AssetsPage: React.FC = () => {
  const {
    project,
    projectDir,
    missingAssetIds,
    selectedAssetId,
    setSelectedAssetId,
    mutateProject,
    replaceProjectState,
    refreshMissingAssets,
    setActiveTab,
    setActiveSceneId,
    setSelectedCharacterId,
    pushToast,
  } = useAppStore();

  const [category, setCategory] = useState<'all' | AssetCategory>('all');
  const [healthFilter, setHealthFilter] = useState<'all' | 'missing' | 'unused' | 'export_scope'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void refreshMissingAssets();
  }, [refreshMissingAssets]);

  if (!project || !projectDir) return null;

  const missingSet = useMemo(() => new Set(missingAssetIds), [missingAssetIds]);
  const usageMap = useMemo(() => computeAssetUsageMap(project), [project]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return project.assets.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      const usages = usageMap[a.id] ?? [];
      if (healthFilter === 'missing' && !missingSet.has(a.id)) return false;
      if (healthFilter === 'unused' && usages.length > 0) return false;
      if (healthFilter === 'export_scope' && (usages.length === 0 || missingSet.has(a.id))) return false;
      if (q && !a.name.toLowerCase().includes(q) && !a.originalName.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [project.assets, category, healthFilter, search, usageMap, missingSet]);

  const selectedAsset: AssetEntry | null =
    project.assets.find((a) => a.id === selectedAssetId) ?? filteredAssets[0] ?? null;

  const getUrl = (a: AssetEntry) => window.guie.getAssetUrl(projectDir, a.relativePath);

  const handleImportFiles = async (filePaths?: string[]) => {
    const paths =
      filePaths ??
      (await window.guie.pickFiles({
        title: '导入游戏素材（自动识别背景、立绘、音乐、音效、语音、视频、字体）',
        multi: true,
      }));
    if (paths.length === 0) return;

    const forcedCat = category === 'all' ? undefined : category;
    const imported = await window.guie.importAssets(projectDir, paths, forcedCat);
    if (imported.length === 0) return;

    mutateProject(
      (draft) => {
        draft.assets.push(...imported);
      },
      { immediateSave: true }
    );
    setSelectedAssetId(imported[0].id);
    await refreshMissingAssets();
    pushToast('success', `已成功导入 ${imported.length} 项素材并自动归类`);
  };

  // One-click replace missing or existing asset and update ALL references project-wide!
  const handleReplaceAsset = async (oldAsset: AssetEntry) => {
    const paths = await window.guie.pickFiles({
      title: `选择新文件以替换「${oldAsset.name}」`,
      multi: false,
    });
    if (paths.length === 0) return;
    const imported = await window.guie.importAssets(projectDir, paths, oldAsset.category);
    if (!imported[0]) return;
    const newAsset = imported[0];
    const updated = replaceAssetReferences(project, oldAsset.id, newAsset.id);
    updated.assets = updated.assets.filter((a) => a.id !== oldAsset.id);
    updated.assets.push(newAsset);
    await replaceProjectState(updated, true);
    setSelectedAssetId(newAsset.id);
    pushToast('success', `已将全项目对「${oldAsset.name}」的引用全部更新为「${newAsset.name}」`);
  };

  const handleJumpUsage = async (loc: ReturnType<typeof computeAssetUsageMap>[string][number]) => {
    if (loc.kind === 'block' && loc.sceneId && loc.blockId) {
      await setActiveTab('story');
      await setActiveSceneId(loc.sceneId, loc.blockId);
    } else if (loc.kind === 'character' && loc.characterId) {
      setSelectedCharacterId(loc.characterId);
      await setActiveTab('characters');
    } else if (loc.kind === 'appearance') {
      await setActiveTab('appearance');
    } else if (loc.kind === 'localization') {
      await setActiveTab('localization');
    }
  };

  const exportableBytes = project.assets
    .filter((a) => !missingSet.has(a.id) && (usageMap[a.id]?.length ?? 0) > 0)
    .reduce((acc, a) => acc + a.sizeBytes, 0);

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden bg-[#F3F0E8]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => window.guie.getPathForFile(f))
          .filter((p): p is string => Boolean(p));
        if (paths.length > 0) void handleImportFiles(paths);
      }}
    >
      {/* Clean Compact Top Action Bar (Req 6.2.5: Unified Import CTA, NO giant stat cards!) */}
      <div className="px-6 py-3 border-b border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[16px] font-bold text-[#171513]">素材库</h1>
          <div className="relative w-[220px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#948D82]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索素材名称…"
              className="paper-input w-full pl-8 py-1 text-[12px]"
            />
          </div>
          <div className="inline-flex items-center gap-1">
            {[
              { id: 'all' as const, label: `全部 (${project.assets.length})` },
              {
                id: 'missing' as const,
                label: `丢失素材 (${missingAssetIds.length})`,
                warn: missingAssetIds.length > 0,
              },
              {
                id: 'unused' as const,
                label: `未使用 (${project.assets.filter((a) => (usageMap[a.id]?.length ?? 0) === 0).length})`,
              },
              {
                id: 'export_scope' as const,
                label: `预计打包范围 (${(exportableBytes / (1024 * 1024)).toFixed(1)} MB)`,
              },
            ].map((pill) => (
              <button
                key={pill.id}
                onClick={() => setHealthFilter(pill.id)}
                className={`px-2.5 py-1 rounded text-[12px] border cursor-pointer ${
                  healthFilter === pill.id
                    ? 'bg-[#FFF1ED] border-[#FF5A3D] text-[#171513] font-medium'
                    : pill.warn
                    ? 'bg-[#FCEEEC] border-[#F0BEB8] text-[#C93B2B]'
                    : 'bg-white border-[#D7D1C6] text-[#706A60] hover:text-[#171513]'
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <button
          data-testid="import-assets-btn"
          onClick={() => void handleImportFiles()}
          className="paper-btn-primary px-4 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
        >
          <Upload size={14} />
          导入素材（或直接拖入）
        </button>
      </div>

      {/* 3-Column Body: Left Category Nav | Center Visual Grid | Right Inspector */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <aside className="w-[180px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] p-2.5 flex flex-col gap-0.5 overflow-y-auto sidebar-scroll">
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            const count =
              c.id === 'all'
                ? project.assets.length
                : project.assets.filter((a) => a.category === c.id).length;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`w-full px-2.5 py-2 rounded-md text-[12.5px] flex items-center justify-between cursor-pointer ${
                  category === c.id
                    ? 'bg-[#FFF1ED] text-[#171513] font-semibold'
                    : 'text-[#565149] hover:bg-[#EFECE3]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon size={14} />
                  {c.label}
                </span>
                <span className="text-[11px] text-[#948D82]">{count}</span>
              </button>
            );
          })}
        </aside>

        {/* Center Thumbnail Grid */}
        <div id="guie-main-scroll" className="flex-1 min-w-0 overflow-y-auto paper-scroll p-4">
          {filteredAssets.length === 0 ? (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center text-[#706A60]">
              <ImageIcon size={28} className="mb-2 text-[#948D82]" />
              <div className="font-medium text-[14px] text-[#171513] mb-1">暂无匹配的素材</div>
              <p className="text-[12.5px] mb-4">
                点击右上角「导入素材」或直接把图片、音频、视频、字体文件拖到此窗口中。
              </p>
              <button
                onClick={() => void handleImportFiles()}
                className="paper-btn-primary px-4 py-2 text-[12.5px] inline-flex items-center gap-1.5"
              >
                <Upload size={14} /> 选择本地素材文件
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredAssets.map((a) => {
                const isSel = selectedAsset?.id === a.id;
                const isMissing = missingSet.has(a.id);
                const refCount = usageMap[a.id]?.length ?? 0;
                const isImage = ['background', 'sprite', 'ui'].includes(a.category);
                return (
                  <button
                    key={a.id}
                    data-testid={`asset-card-${a.id}`}
                    onClick={() => setSelectedAssetId(a.id)}
                    className={`paper-card p-2 text-left flex flex-col gap-1.5 cursor-pointer transition-colors ${
                      isMissing
                        ? 'border-[#C93B2B] bg-[#FCEEEC]/40'
                        : isSel
                        ? 'border-[#FF5A3D] ring-1 ring-[#FF5A3D]/25'
                        : 'hover:border-[#B8B0A0]'
                    }`}
                  >
                    <div className="aspect-[16/10] rounded bg-[#EFECE3] overflow-hidden flex items-center justify-center relative">
                      {isMissing ? (
                        <div className="text-[#C93B2B] flex flex-col items-center gap-1 text-[11px]">
                          <AlertTriangle size={18} />
                          文件丢失
                        </div>
                      ) : isImage ? (
                        <img src={getUrl(a)} alt={a.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-[#706A60] flex flex-col items-center gap-1 text-[11px]">
                          {['bgm', 'se', 'voice'].includes(a.category) ? (
                            <Music size={20} />
                          ) : a.category === 'video' ? (
                            <Film size={20} />
                          ) : (
                            <Type size={20} />
                          )}
                          <span>
                            {CATEGORIES.find((c) => c.id === a.category)?.label ?? '素材'}
                          </span>
                        </div>
                      )}
                      {a.isCg && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#FF5A3D] text-white text-[10px]">
                          CG
                        </span>
                      )}
                    </div>
                    <div className="font-medium text-[12.5px] text-[#171513] truncate">{a.name}</div>
                    <div className="flex items-center justify-between text-[11px] text-[#706A60]">
                      <span>引用 {refCount} 次</span>
                      <span>{(a.sizeBytes / 1024).toFixed(0)} KB</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Asset Inspector (Preview + Reference List + One-Click Replace) */}
        <aside className="w-[320px] shrink-0 h-full bg-[#FBFAF5] border-l border-[#D7D1C6] overflow-y-auto paper-scroll p-4 flex flex-col gap-4">
          {!selectedAsset ? (
            <div className="h-full flex items-center justify-center text-[12.5px] text-[#948D82]">
              选择任意素材查看详情与引用位置
            </div>
          ) : (
            <>
              <div className="font-semibold text-[14px] text-[#171513]">素材检查器</div>

              {/* Preview Box */}
              <div className="rounded-md border border-[#D7D1C6] bg-[#181614] overflow-hidden flex items-center justify-center min-h-[160px] p-2">
                {missingSet.has(selectedAsset.id) ? (
                  <div className="text-center text-[#FCA5A5] text-[12px] py-6">
                    <AlertTriangle size={22} className="mx-auto mb-1.5" />
                    原文件已丢失，请点击下方一键替换
                  </div>
                ) : ['background', 'sprite', 'ui'].includes(selectedAsset.category) ? (
                  <img
                    src={getUrl(selectedAsset)}
                    alt={selectedAsset.name}
                    className="max-h-[200px] w-auto object-contain"
                  />
                ) : ['bgm', 'se', 'voice'].includes(selectedAsset.category) ? (
                  <audio controls src={getUrl(selectedAsset)} className="w-full" />
                ) : selectedAsset.category === 'video' ? (
                  <video controls src={getUrl(selectedAsset)} className="max-h-[200px] w-full" />
                ) : (
                  <div className="text-white text-center px-3 py-4">
                    <div className="text-[18px] mb-1">永和九年，岁在癸丑</div>
                    <div className="text-[12px] opacity-70">The quick brown fox · 123456</div>
                  </div>
                )}
              </div>

              {/* Name & Category Edit */}
              <div className="flex flex-col gap-2.5 text-[12.5px]">
                <div>
                  <label className="block text-[11.5px] text-[#706A60] mb-1">显示名称</label>
                  <input
                    type="text"
                    value={selectedAsset.name}
                    onChange={(e) =>
                      mutateProject((d) => {
                        const t = d.assets.find((x) => x.id === selectedAsset.id);
                        if (t) t.name = e.target.value;
                      })
                    }
                    className="paper-input w-full py-1"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-[#706A60] mb-1">素材分类</label>
                  <select
                    value={selectedAsset.category}
                    onChange={(e) =>
                      mutateProject((d) => {
                        const t = d.assets.find((x) => x.id === selectedAsset.id);
                        if (t) t.category = e.target.value as AssetCategory;
                      })
                    }
                    className="paper-input w-full py-1 text-[12px]"
                  >
                    {CATEGORIES.filter((c) => c.id !== 'all').map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedAsset.category === 'background' && (
                  <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedAsset.isCg)}
                      onChange={(e) =>
                        mutateProject((d) => {
                          const t = d.assets.find((x) => x.id === selectedAsset.id);
                          if (t) t.isCg = e.target.checked;
                        })
                      }
                      className="accent-[#FF5A3D]"
                    />
                    <Award size={13} className="text-[#FF5A3D]" />
                    标记为 CG 鉴赏插画（玩家在剧情中看到后自动解锁）
                  </label>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => void handleReplaceAsset(selectedAsset)}
                    className="paper-btn-secondary flex-1 py-1.5 text-[12px] inline-flex items-center justify-center gap-1"
                  >
                    <RefreshCw size={13} /> 一键替换素材
                  </button>
                  <button
                    onClick={() => {
                      const delId = selectedAsset.id;
                      mutateProject(
                        (d) => {
                          d.assets = d.assets.filter((x) => x.id !== delId);
                        },
                        { milestoneLabel: `移除素材「${selectedAsset.name}」前` }
                      );
                      setSelectedAssetId(null);
                    }}
                    className="paper-btn-secondary px-2.5 py-1.5 text-[12px] text-[#C93B2B]"
                    title="从素材库移除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Usage Reference List (Clickable -> Jump directly back to story card!) */}
              <div className="border-t border-[#E7E2D8] pt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold">引用统计与使用位置</span>
                  <span className="text-[11.5px] text-[#706A60]">
                    共 {(usageMap[selectedAsset.id] ?? []).length} 处
                  </span>
                </div>

                {(usageMap[selectedAsset.id] ?? []).length === 0 ? (
                  <div className="p-2.5 rounded bg-[#FDF5E6] border border-[#ECD09E] text-[11.5px] text-[#8F5500]">
                    当前尚未在任何场景或角色中使用（游离素材）。
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {(usageMap[selectedAsset.id] ?? []).map((loc, idx) => (
                      <button
                        key={idx}
                        onClick={() => void handleJumpUsage(loc)}
                        className="text-left px-2.5 py-1.5 rounded border border-[#E7E2D8] bg-white hover:border-[#FF5A3D] text-[12px] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">{loc.label}</span>
                        <ExternalLink size={12} className="text-[#948D82] shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-1 p-2.5 rounded bg-[#EDF7F1] border border-[#C6E6D3] text-[11.5px] text-[#2A7B50] flex items-center gap-1.5">
                  <PackageCheck size={14} className="shrink-0" />
                  <span>
                    {(usageMap[selectedAsset.id] ?? []).length > 0
                      ? '导出发布包时将自动包含此素材'
                      : '此素材未被引用，可随时清理以减小体积'}
                  </span>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
};
