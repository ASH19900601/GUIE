import React, { useState } from 'react';
import { History, RotateCcw, Plus, X, ShieldCheck, Clock, Eye } from 'lucide-react';
import type { SnapshotPreviewData } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

export const SnapshotsModal: React.FC = () => {
  const {
    projectDir,
    snapshotsOpen,
    snapshots,
    setSnapshotsOpen,
    createManualSnapshot,
    restoreProjectSnapshot,
  } = useAppStore();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<SnapshotPreviewData | null>(null);

  if (!snapshotsOpen) return null;

  const handleTogglePreview = async (id: string) => {
    if (previewId === id) {
      setPreviewId(null);
      setPreviewData(null);
      return;
    }
    if (!projectDir) return;
    try {
      const data = await window.guie.previewSnapshot(projectDir, id);
      setPreviewId(id);
      setPreviewData(data);
    } catch {
      setPreviewId(null);
      setPreviewData(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await createManualSnapshot(label.trim() || `手动备份 ${new Date().toLocaleTimeString('zh-CN')}`);
      setLabel('');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    setBusy(true);
    try {
      await restoreProjectSnapshot(id);
      await setSnapshotsOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
      <div className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-xl w-full max-w-[600px] max-h-[82vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[15px] flex items-center gap-2">
              <History size={16} className="text-[#FF5A3D]" />
              项目历史版本（跨重启持久保留）
            </h2>
            <p className="text-[12px] text-[#706A60] mt-0.5">
              系统每 2 分钟自动留存快照，并在删除、排序或 AI 修改前自动生成里程碑；回退前会自动保护当前状态。
            </p>
          </div>
          <button
            onClick={() => void setSnapshotsOpen(false)}
            className="p-1.5 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="px-5 py-3 border-b border-[#E7E2D8] flex gap-2 bg-[#FBFAF5]">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="输入版本备注（如：第一章定稿）…"
            className="paper-input flex-1"
          />
          <button
            type="submit"
            disabled={busy}
            className="paper-btn-primary px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1.5 shrink-0"
          >
            <Plus size={14} />
            保存当前版本
          </button>
        </form>

        <div className="flex-1 overflow-y-auto paper-scroll p-4 flex flex-col gap-2">
          {snapshots.length === 0 ? (
            <div className="py-12 text-center text-[#706A60] text-[13px]">暂无历史快照</div>
          ) : (
            snapshots.map((snap) => (
              <div key={snap.id} className="paper-card p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                          snap.kind === 'milestone'
                            ? 'bg-[#FFF1ED] text-[#FF5A3D] border border-[#FBCBC1]'
                            : snap.kind === 'manual'
                            ? 'bg-[#EDF7F1] text-[#2A7B50] border border-[#C6E6D3]'
                            : 'bg-[#EFECE3] text-[#706A60]'
                        }`}
                      >
                        {snap.kind === 'milestone'
                          ? '里程碑'
                          : snap.kind === 'manual'
                          ? '手动命名'
                          : '自动快照'}
                      </span>
                      <span className="font-medium text-[13px] text-[#171513] truncate">
                        {snap.label}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#706A60] mt-1 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={12} />
                        {new Date(snap.createdAt).toLocaleString('zh-CN')}
                      </span>
                      <span>{snap.sceneCount} 个场景</span>
                      <span>{snap.blockCount} 项剧情卡片</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      data-testid={`preview-snap-${snap.id}`}
                      onClick={() => void handleTogglePreview(snap.id)}
                      className={`paper-btn-secondary px-2.5 py-1.5 text-[12px] inline-flex items-center gap-1 ${
                        previewId === snap.id ? 'border-[#FF5A3D] text-[#FF5A3D]' : ''
                      }`}
                    >
                      <Eye size={13} />
                      {previewId === snap.id ? '收起预览' : '预览内容'}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => void handleRestore(snap.id)}
                      className="paper-btn-secondary px-3 py-1.5 text-[12px] inline-flex items-center gap-1"
                    >
                      <RotateCcw size={13} />
                      回退到此版本
                    </button>
                  </div>
                </div>

                {previewId === snap.id && previewData && (
                  <div className="p-3 rounded bg-[#FBFAF5] border border-[#E7E2D8] text-[12px] flex flex-col gap-2">
                    <div className="flex flex-wrap gap-3 text-[#706A60]">
                      <span>标题：<strong className="text-[#171513]">{previewData.title}</strong></span>
                      <span>章节：{previewData.chapters.length}</span>
                      <span>角色：{previewData.characters.map((c) => c.name).join('、') || '暂无'}</span>
                      <span>状态变量：{previewData.variableCount}</span>
                      <span>素材：{previewData.assetCount}</span>
                      {previewData.customFileCount > 0 && (
                        <span className="text-[#FF5A3D]">含 {previewData.customFileCount} 个 AI 定制扩展模块</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto paper-scroll">
                      {previewData.scenes.map((sc) => (
                        <div key={sc.id} className="text-[11.5px] text-[#565149] flex items-center gap-2">
                          <span className="font-medium text-[#171513] shrink-0">
                            {sc.name} ({sc.blockCount} 项)
                          </span>
                          {sc.sampleLine && (
                            <span className="text-[#706A60] truncate">— {sc.sampleLine}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-[#E7E2D8] bg-white text-[11.5px] text-[#706A60] flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-[#2A7B50]" />
          历史快照保存在项目本地目录中，关闭软件重新打开后依然完整可恢复。
        </div>
      </div>
    </div>
  );
};
