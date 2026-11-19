import React, { useEffect } from 'react';
import {
  BookOpen,
  Users,
  Image as ImageIcon,
  Palette,
  Puzzle,
  Library,
  Globe,
  Rocket,
  Bot,
  Code2,
  Home,
  Undo2,
  Redo2,
  History,
  Play,
  PlayCircle,
  Square,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react';
import type { WorkspaceTab } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

interface NavGroup {
  label: string;
  items: Array<{ id: WorkspaceTab; label: string; icon: React.ComponentType<{ size?: number }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: '核心创作',
    items: [
      { id: 'story', label: '故事工作台', icon: BookOpen },
      { id: 'characters', label: '角色与状态', icon: Users },
      { id: 'assets', label: '素材库', icon: ImageIcon },
      { id: 'appearance', label: '游戏外观', icon: Palette },
    ],
  },
  {
    label: '能力扩展',
    items: [
      { id: 'extensions', label: '扩展市场', icon: Puzzle },
      { id: 'reuse', label: '跨项目复用', icon: Library },
      { id: 'localization', label: '多语言本地化', icon: Globe },
    ],
  },
  {
    label: '试玩与发布',
    items: [{ id: 'finish', label: '完成与发布', icon: Rocket }],
  },
];

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    project,
    activeTab,
    mode,
    saveStatus,
    undoStack,
    redoStack,
    liveRenpy,
    aiDrawerOpen,
    toasts,
    setActiveTab,
    setMode,
    closeProjectToHome,
    flushPendingSaves,
    undo,
    redo,
    setSnapshotsOpen,
    startPlaytest,
    stopPlaytest,
    setAiDrawerOpen,
    dismissToast,
  } = useAppStore();

  // Global keyboard shortcuts: Ctrl+Z / Ctrl+Y / Ctrl+S
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flushPendingSaves();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z' &&
        !e.shiftKey &&
        !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        void undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z')) &&
        !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushPendingSaves, undo, redo]);

  if (!project) return null;

  return (
    <div className="h-full w-full flex overflow-hidden bg-[#F3F0E8] text-[#171513]">
      {/* Left Full-Height Light Sidebar (Req 6.1: Warm-white same color family, hidden scrollbar, 1px border) */}
      <aside className="w-[216px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] flex flex-col select-none">
        {/* Project Header */}
        <div className="px-4 py-3.5 border-b border-[#E7E2D8]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#FF5A3D] text-white flex items-center justify-center font-bold text-[12px] shrink-0">
              G
            </div>
            <div className="font-semibold text-[13.5px] text-[#171513] truncate" title={project.meta.title}>
              {project.meta.title}
            </div>
          </div>
          <div className="text-[11px] text-[#706A60] mt-1.5 flex items-center gap-2.5">
            <span>{project.scenes.length} 场景</span>
            <span>·</span>
            <span>{project.characters.length} 角色</span>
            <span>·</span>
            <span>{project.assets.length} 素材</span>
          </div>
        </div>

        {/* Navigation Groups — Hidden Scrollbar */}
        <nav className="flex-1 sidebar-scroll py-3 px-2.5 flex flex-col gap-4">
          {mode === 'creator' ? (
            NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2.5 mb-1.5 text-[11px] font-semibold tracking-wider text-[#948D82]">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        data-testid={`nav-${item.id}`}
                        onClick={() => void setActiveTab(item.id)}
                        className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#FFF1ED] text-[#171513] font-semibold'
                            : 'text-[#565149] hover:bg-[#EFECE3] hover:text-[#171513]'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#FF5A3D]" />
                        )}
                        <Icon size={15} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="px-2.5 py-2">
              <div className="p-3 rounded-md bg-[#FFF1ED] border border-[#FBCBC1] text-[12px] text-[#171513]">
                <div className="font-semibold mb-1">当前处于高级模式</div>
                <p className="text-[#706A60] leading-relaxed mb-2.5">
                  可直接浏览与编辑底层工程文件并查看完整诊断。随时可安全返回创作模式。
                </p>
                <button
                  data-testid="exit-advanced-mode-btn"
                  onClick={() => void setMode('creator')}
                  className="paper-btn-primary w-full py-1.5 text-[12px]"
                >
                  返回创作模式
                </button>
              </div>
            </div>
          )}
        </nav>

        {/* Bottom Dock: Prominent AI Assistant + Advanced Mode + Home */}
        <div className="p-2.5 border-t border-[#E7E2D8] flex flex-col gap-1.5 bg-[#FBFAF5]">
          <button
            data-testid="toggle-ai-drawer-btn"
            onClick={() => setAiDrawerOpen(!aiDrawerOpen)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[13px] font-medium border transition-colors cursor-pointer ${
              aiDrawerOpen
                ? 'bg-[#FF5A3D] text-white border-[#FF5A3D]'
                : 'bg-[#FFF1ED] text-[#171513] border-[#FBCBC1] hover:border-[#FF5A3D]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Bot size={15} />
              AI 创作助手
            </span>
            <span
              className={`text-[10.5px] px-1.5 py-0.5 rounded ${
                aiDrawerOpen ? 'bg-white/20 text-white' : 'bg-white text-[#FF5A3D]'
              }`}
            >
              {aiDrawerOpen ? '已展开' : '打开'}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              data-testid="toggle-advanced-mode-btn"
              onClick={() => void setMode(mode === 'creator' ? 'advanced' : 'creator')}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] text-[#706A60] hover:bg-[#EFECE3] hover:text-[#171513] border border-transparent hover:border-[#D7D1C6] cursor-pointer"
            >
              <Code2 size={13} />
              {mode === 'creator' ? '高级模式' : '创作模式'}
            </button>
            <button
              data-testid="back-to-home-btn"
              onClick={() => void closeProjectToHome()}
              className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[12px] text-[#706A60] hover:bg-[#EFECE3] hover:text-[#171513] border border-transparent hover:border-[#D7D1C6] cursor-pointer"
            >
              <Home size={13} />
              返回首页
            </button>
          </div>
        </div>
      </aside>

      {/* Right Main Area: Top Global Command Bar + Workspace */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden">
        {/* Top Global Toolbar (Req 6.2.2) */}
        <header className="h-[48px] shrink-0 bg-[#FBFAF5] border-b border-[#D7D1C6] px-4 flex items-center justify-between gap-3">
          {/* Left: Truthful Save Indicator + Undo/Redo + Snapshots */}
          <div className="flex items-center gap-2">
            <button
              data-testid="save-status-indicator"
              onClick={() => void flushPendingSaves()}
              title="点击立即同步保存所有修改"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12px] border cursor-pointer transition-colors ${
                saveStatus === 'saved'
                  ? 'bg-[#EDF7F1] border-[#C6E6D3] text-[#2A7B50]'
                  : saveStatus === 'saving'
                  ? 'bg-[#FDF5E6] border-[#F0D9B1] text-[#B86E00]'
                  : saveStatus === 'error'
                  ? 'bg-[#FCEEEC] border-[#F2C7C2] text-[#C93B2B]'
                  : 'bg-[#FFF1ED] border-[#FBCBC1] text-[#D94B30]'
              }`}
            >
              {saveStatus === 'saved' && <CheckCircle2 size={13} />}
              {saveStatus === 'saving' && <Loader2 size={13} className="animate-spin" />}
              {(saveStatus === 'dirty' || saveStatus === 'error') && <AlertCircle size={13} />}
              <span>
                {saveStatus === 'saved'
                  ? '所有修改已保存'
                  : saveStatus === 'saving'
                  ? '正在保存到磁盘…'
                  : saveStatus === 'error'
                  ? '保存遇到问题，点此重试'
                  : '有未保存的更改'}
              </span>
            </button>

            <div className="h-4 w-[1px] bg-[#D7D1C6] mx-1" />

            <button
              data-testid="undo-btn"
              onClick={() => void undo()}
              disabled={undoStack.length === 0}
              title="撤销 (Ctrl+Z)"
              className="paper-btn-secondary px-2 py-1 text-[12px] inline-flex items-center gap-1"
            >
              <Undo2 size={13} />
              撤销
            </button>
            <button
              data-testid="redo-btn"
              onClick={() => void redo()}
              disabled={redoStack.length === 0}
              title="重做 (Ctrl+Y)"
              className="paper-btn-secondary px-2 py-1 text-[12px] inline-flex items-center gap-1"
            >
              <Redo2 size={13} />
              重做
            </button>
            <button
              data-testid="snapshots-btn"
              onClick={() => void setSnapshotsOpen(true)}
              className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1"
            >
              <History size={13} />
              历史版本
            </button>
          </div>

          {/* Right: Playtest Controls */}
          <div className="flex items-center gap-2">
            {liveRenpy.running ? (
              <button
                data-testid="stop-playtest-btn"
                onClick={() => void stopPlaytest()}
                className="px-3 py-1.5 rounded-md text-[12.5px] font-medium bg-[#FCEEEC] text-[#C93B2B] border border-[#F2C7C2] hover:bg-[#F9DDD9] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Square size={12} fill="currentColor" />
                停止试玩
              </button>
            ) : (
              <>
                <button
                  data-testid="play-from-scene-btn"
                  onClick={() => void startPlaytest({ fromCurrentScene: true })}
                  className="paper-btn-secondary px-3 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
                >
                  <PlayCircle size={14} className="text-[#FF5A3D]" />
                  从当前场景试玩
                </button>
                <button
                  data-testid="play-from-start-btn"
                  onClick={() => void startPlaytest({ fromCurrentScene: false })}
                  className="paper-btn-primary px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1.5"
                >
                  <Play size={13} fill="currentColor" />
                  从头试玩
                </button>
              </>
            )}
          </div>
        </header>

        {/* Active Workspace Container */}
        <div className="flex-1 min-h-0 relative overflow-hidden">{children}</div>
      </div>

      {/* Non-overlapping Toast Notifications (top-center, clear of left outline footer AND right AI drawer!) */}
      {toasts.length > 0 && (
        <div className="fixed top-[56px] left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 max-w-[420px] pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-3.5 py-2.5 rounded-md border shadow-md text-[12.5px] flex items-center justify-between gap-3 ${
                t.kind === 'success'
                  ? 'bg-[#EDF7F1] border-[#B6DFC7] text-[#1F5F3D]'
                  : t.kind === 'error'
                  ? 'bg-[#FCEEEC] border-[#F0BEB8] text-[#A82C1E]'
                  : t.kind === 'warning'
                  ? 'bg-[#FDF5E6] border-[#ECD09E] text-[#8F5500]'
                  : 'bg-[#FBFAF5] border-[#D7D1C6] text-[#171513]'
              }`}
            >
              <span>{t.message}</span>
              <button
                onClick={() => dismissToast(t.id)}
                className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
