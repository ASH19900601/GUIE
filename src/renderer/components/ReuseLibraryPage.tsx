import React, { useEffect, useState } from 'react';
import { Library, Users, Folder, FileText, Scissors, Download, Trash2, Plus } from 'lucide-react';
import type { ReuseItemKind, ReuseLibraryItem } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

const KIND_TABS: Array<{
  id: ReuseItemKind;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}> = [
  { id: 'character', label: '角色设定', icon: Users },
  { id: 'chapter', label: '完整章节', icon: Folder },
  { id: 'scene', label: '独立场景', icon: FileText },
  { id: 'snippet', label: '常用剧情片段', icon: Scissors },
];

export const ReuseLibraryPage: React.FC = () => {
  const { project, activeSceneId, replaceProjectState, pushToast } = useAppStore();
  const [kind, setKind] = useState<ReuseItemKind>('character');
  const [items, setItems] = useState<ReuseLibraryItem[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [saveName, setSaveName] = useState('');

  const reload = async () => {
    const list = await window.guie.listReuseItems();
    setItems(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  if (!project) return null;

  const sourceOptions =
    kind === 'character'
      ? project.characters.map((c) => ({ id: c.id, name: c.name }))
      : kind === 'chapter'
      ? project.chapters.map((c) => ({ id: c.id, name: c.name }))
      : project.scenes.map((s) => ({ id: s.id, name: s.name }));

  const effectiveSourceId = sourceId && sourceOptions.some((o) => o.id === sourceId)
    ? sourceId
    : sourceOptions[0]?.id ?? '';

  const handleSave = async () => {
    if (!effectiveSourceId) {
      pushToast('warning', '当前项目中没有可保存的对应内容');
      return;
    }
    const chosen = sourceOptions.find((o) => o.id === effectiveSourceId);
    await window.guie.saveToReuseLibrary({
      kind,
      name: saveName.trim() || chosen?.name || '未命名模板',
      project,
      sourceId: effectiveSourceId,
    });
    setSaveName('');
    await reload();
    pushToast('success', '已保存到本地跨项目复用库，可在任何其他项目中一键导入');
  };

  const handleImport = async (itemId: string) => {
    const res = await window.guie.importFromReuseLibrary({
      itemId,
      project,
      targetSceneId: activeSceneId ?? undefined,
    });
    await replaceProjectState(res.updatedProject, true);
    pushToast('success', res.summary);
  };

  const handleDelete = async (itemId: string) => {
    const next = await window.guie.deleteReuseItem(itemId);
    setItems(next);
    pushToast('info', '已从复用库移除该项');
  };

  const filtered = items.filter((i) => i.kind === kind);

  return (
    <div id="guie-main-scroll" className="h-full w-full overflow-y-auto paper-scroll bg-[#F3F0E8] p-6">
      <div className="max-w-[1060px] mx-auto flex flex-col gap-5">
        <div className="border-b border-[#D7D1C6] pb-4 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[18px] font-bold text-[#171513] flex items-center gap-2">
              <Library size={18} className="text-[#FF5A3D]" />
              跨项目复用库
            </h1>
            <p className="text-[13px] text-[#706A60] mt-1">
              将角色、完整章节、场景或剧情片段存入个人复用库；导入其他项目时自动匹配角色与故事状态，并自动清理不存在的素材引用防报错。
            </p>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {KIND_TABS.map((t) => {
            const Icon = t.icon;
            const count = items.filter((i) => i.kind === t.id).length;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setKind(t.id);
                  setSourceId('');
                }}
                className={`px-3.5 py-2 rounded-md text-[13px] border inline-flex items-center gap-2 cursor-pointer ${
                  kind === t.id
                    ? 'bg-[#FFF1ED] border-[#FF5A3D] text-[#171513] font-semibold'
                    : 'bg-white border-[#D7D1C6] text-[#706A60] hover:text-[#171513]'
                }`}
              >
                <Icon size={14} />
                {t.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Save From Current Project Bar */}
        <div className="paper-card p-4 flex items-center gap-3 flex-wrap">
          <span className="text-[12.5px] font-medium shrink-0">从当前项目保存：</span>
          <select
            value={effectiveSourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="paper-input py-1.5 min-w-[180px]"
          >
            {sourceOptions.length === 0 ? (
              <option value="">当前项目暂无可保存项</option>
            ) : (
              sourceOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))
            )}
          </select>
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="自定义模板名称（留空则沿用原名）"
            className="paper-input flex-1 min-w-[180px] py-1.5"
          />
          <button
            data-testid="save-to-reuse-btn"
            onClick={() => void handleSave()}
            disabled={!effectiveSourceId}
            className="paper-btn-primary px-4 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> 存入复用库
          </button>
        </div>

        {/* Saved Items Grid */}
        {filtered.length === 0 ? (
          <div className="paper-card py-14 text-center text-[#706A60] text-[13px]">
            该分类下还没有已保存的复用模板，使用上方操作栏即可从当前项目保存。
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <div key={item.id} className="paper-card p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="font-semibold text-[14px] text-[#171513]">{item.name}</div>
                  <div className="text-[11.5px] text-[#706A60] mt-1">
                    来源项目：{item.sourceProjectTitle} ·{' '}
                    {new Date(item.createdAt).toLocaleDateString('zh-CN')}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-[#EFECE3]">
                  <button
                    onClick={() => void handleImport(item.id)}
                    className="paper-btn-primary flex-1 py-1.5 text-[12px] inline-flex items-center justify-center gap-1"
                  >
                    <Download size={13} /> 导入当前项目
                  </button>
                  <button
                    onClick={() => void handleDelete(item.id)}
                    className="paper-btn-secondary px-2.5 py-1.5 text-[#C93B2B]"
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
