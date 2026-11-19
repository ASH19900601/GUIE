import React, { useState } from 'react';
import {
  BookOpen,
  FolderOpen,
  Plus,
  Clock,
  Trash2,
  CheckCircle2,
  Film,
  Layers,
  Play,
  ArrowRight,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const WelcomeHome: React.FC = () => {
  const {
    runtimeInfo,
    recentProjects,
    createNewProject,
    openExistingProject,
    refreshRecentProjects,
    pushToast,
  } = useAppStore();

  const [wizardOpen, setWizardOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [resolution, setResolution] = useState<'1920x1080' | '1280x720'>('1920x1080');
  const [parentDir, setParentDir] = useState('');
  const [withStarter, setWithStarter] = useState(true);
  const [busy, setBusy] = useState(false);

  const effectiveParentDir = parentDir || runtimeInfo?.defaultProjectsDir || '';

  const handleOpenCreateWizard = (presetTitle = '') => {
    setTitle(presetTitle);
    setAuthor('');
    setParentDir(runtimeInfo?.defaultProjectsDir || '');
    setWizardOpen(true);
  };

  const handlePickParentDir = async () => {
    const dir = await window.guie.pickDirectory('选择保存新游戏的文件夹');
    if (dir) setParentDir(dir);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      pushToast('warning', '请先给你的游戏起一个名字');
      return;
    }
    if (!effectiveParentDir) {
      pushToast('warning', '请选择保存位置');
      return;
    }
    setBusy(true);
    try {
      const [w, h] = resolution.split('x').map(Number);
      await createNewProject({
        parentDir: effectiveParentDir,
        title: title.trim(),
        author: author.trim() || '创作者',
        width: w,
        height: h,
        withStarterContent: withStarter,
      });
      setWizardOpen(false);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenFolder = async () => {
    const dir = await window.guie.pickDirectory('选择已有的游戏项目文件夹');
    if (!dir) return;
    try {
      await openExistingProject(dir);
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : '打开项目失败');
    }
  };

  const handleRemoveRecent = async (e: React.MouseEvent, projectPath: string) => {
    e.stopPropagation();
    await window.guie.removeRecentProject(projectPath);
    await refreshRecentProjects();
  };

  return (
    <div className="h-full w-full overflow-y-auto paper-scroll bg-[#F3F0E8] text-[#171513]">
      {/* Subtle editorial header bar */}
      <header className="border-b border-[#D7D1C6] bg-[#FBFAF5] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-[#FF5A3D] text-white flex items-center justify-center font-bold text-sm tracking-tight">
            G
          </div>
          <div>
            <div className="font-semibold text-[15px] tracking-tight text-[#171513]">
              GUIE 视觉小说创作工坊
            </div>
            <div className="text-[11.5px] text-[#706A60]">
              零代码全流程视觉小说引擎 · 即时预览 · 内置 AI 协助
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-[#706A60]">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2
              size={14}
              className={runtimeInfo?.renpyReady ? 'text-[#2A7B50]' : 'text-[#B86E00]'}
            />
            {runtimeInfo?.renpyReady ? '运行引擎已就绪' : '运行引擎准备中'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2
              size={14}
              className={runtimeInfo?.cjkFontReady ? 'text-[#2A7B50]' : 'text-[#B86E00]'}
            />
            {runtimeInfo?.cjkFontReady ? '多语言字体开箱可用' : '默认字体'}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2
              size={14}
              className={runtimeInfo?.asrReady ? 'text-[#2A7B50]' : 'text-[#948D82]'}
            />
            {runtimeInfo?.asrReady ? '离线语音识别就绪' : '离线语音未启用'}
          </span>
        </div>
      </header>

      {/* Editorial Two-Column Main Layout (Req 6.2.1) */}
      <main className="max-w-[1220px] mx-auto px-8 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Value Proposition, 3-Step Guide, Primary Actions */}
        <section className="lg:col-span-7 flex flex-col gap-6">
          <div className="paper-card bg-[#FBFAF5] p-7">
            <div className="inline-flex items-center gap-2 text-[12px] font-medium text-[#FF5A3D] bg-[#FFF1ED] border border-[#FBCBC1] px-2.5 py-0.5 rounded mb-4">
              纯可视化创作 · 无需学习任何编程
            </div>
            <h1 className="text-[28px] font-bold leading-snug tracking-tight text-[#171513] mb-3">
              像写剧本一样创作你的视觉小说，
              <br />
              边写边看即时画面，一键打包发布。
            </h1>
            <p className="text-[14px] text-[#706A60] leading-relaxed mb-6">
              所有角色、对白、立绘表情、背景转场、多分支条件、路线汇合与游戏外观均通过直观图形界面完成；
              遇到复杂定制玩法时，直接用自然语言交由内置 AI 助手在后台代劳。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                data-testid="home-create-project-btn"
                onClick={() => handleOpenCreateWizard('')}
                className="paper-btn-primary px-5 py-2.5 text-[14px] inline-flex items-center gap-2"
              >
                <Plus size={16} />
                创建新游戏
              </button>
              <button
                data-testid="home-open-project-btn"
                onClick={handleOpenFolder}
                className="paper-btn-secondary px-5 py-2.5 text-[14px] inline-flex items-center gap-2"
              >
                <FolderOpen size={16} />
                打开已有项目
              </button>
            </div>
          </div>

          {/* Three-Step Onboarding Guide */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="paper-card p-4">
              <div className="flex items-center gap-2 text-[#FF5A3D] font-semibold text-[12px] mb-2">
                <span className="w-5 h-5 rounded bg-[#FFF1ED] border border-[#FBCBC1] flex items-center justify-center">
                  1
                </span>
                编写剧情与角色
              </div>
              <div className="font-medium text-[13.5px] mb-1 flex items-center gap-1.5">
                <BookOpen size={14} className="text-[#706A60]" />
                卡片与剧本双视图
              </div>
              <p className="text-[12px] text-[#706A60] leading-relaxed">
                批量拖入立绘自动建角，回车连录对白，在选线流程图中清晰连接分支与汇合。
              </p>
            </div>

            <div className="paper-card p-4">
              <div className="flex items-center gap-2 text-[#FF5A3D] font-semibold text-[12px] mb-2">
                <span className="w-5 h-5 rounded bg-[#FFF1ED] border border-[#FBCBC1] flex items-center justify-center">
                  2
                </span>
                即时画面与时间轴
              </div>
              <div className="font-medium text-[13.5px] mb-1 flex items-center gap-1.5">
                <Layers size={14} className="text-[#706A60]" />
                所见即所得调试
              </div>
              <p className="text-[12px] text-[#706A60] leading-relaxed">
                点任意卡片即刻还原画面、立绘与状态数值，拖动时间轴回溯每一步分支轨迹。
              </p>
            </div>

            <div className="paper-card p-4">
              <div className="flex items-center gap-2 text-[#FF5A3D] font-semibold text-[12px] mb-2">
                <span className="w-5 h-5 rounded bg-[#FFF1ED] border border-[#FBCBC1] flex items-center justify-center">
                  3
                </span>
                检查、试玩与导出
              </div>
              <div className="font-medium text-[13.5px] mb-1 flex items-center gap-1.5">
                <Play size={14} className="text-[#706A60]" />
                一键发布独立游戏
              </div>
              <p className="text-[12px] text-[#706A60] leading-relaxed">
                自动检查并一键修复问题，支持从当前场景试玩，并导出可双击运行的独立游戏包。
              </p>
            </div>
          </div>

          {/* Quick Starter Ideas */}
          <div className="paper-card p-5">
            <div className="text-[13px] font-semibold text-[#171513] mb-3 flex items-center gap-2">
              <Film size={15} className="text-[#706A60]" />
              快速起步模板
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleOpenCreateWizard('盛夏校园物语')}
                className="text-left p-3.5 rounded-md border border-[#E7E2D8] bg-[#FBFAF5] hover:border-[#FF5A3D] hover:bg-[#FFF1ED]/40 transition-colors cursor-pointer"
              >
                <div className="font-medium text-[13px] text-[#171513] flex items-center justify-between">
                  校园日常多分支
                  <ArrowRight size={14} className="text-[#948D82]" />
                </div>
                <div className="text-[12px] text-[#706A60] mt-1">
                  预置序章、好感度状态与 1080p 高清宽屏画布
                </div>
              </button>
              <button
                onClick={() => handleOpenCreateWizard('雾都推理事件簿')}
                className="text-left p-3.5 rounded-md border border-[#E7E2D8] bg-[#FBFAF5] hover:border-[#FF5A3D] hover:bg-[#FFF1ED]/40 transition-colors cursor-pointer"
              >
                <div className="font-medium text-[13px] text-[#171513] flex items-center justify-between">
                  悬疑线索推理短篇
                  <ArrowRight size={14} className="text-[#948D82]" />
                </div>
                <div className="text-[12px] text-[#706A60] mt-1">
                  适合多线索开关判断、路线汇合与多重结局
                </div>
              </button>
            </div>
          </div>
        </section>

        {/* Right Column: Recent Projects List */}
        <section className="lg:col-span-5 flex flex-col">
          <div className="paper-card bg-[#FBFAF5] flex flex-col flex-1 min-h-[420px]">
            <div className="px-5 py-4 border-b border-[#E7E2D8] flex items-center justify-between">
              <div className="font-semibold text-[14px] flex items-center gap-2">
                <Clock size={15} className="text-[#706A60]" />
                最近编辑的项目
              </div>
              <span className="text-[12px] text-[#948D82]">{recentProjects.length} 个项目</span>
            </div>

            <div className="p-4 flex-1 overflow-y-auto paper-scroll">
              {recentProjects.length === 0 ? (
                <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-6">
                  <div className="w-11 h-11 rounded-lg bg-[#EFECE3] border border-[#D7D1C6] flex items-center justify-center text-[#706A60] mb-3">
                    <BookOpen size={20} />
                  </div>
                  <div className="font-medium text-[14px] text-[#171513] mb-1">
                    还没有最近打开的项目
                  </div>
                  <p className="text-[12.5px] text-[#706A60] mb-4">
                    点击左侧「创建新游戏」开始你的第一部作品，或打开电脑中已有的项目文件夹。
                  </p>
                  <button
                    onClick={() => handleOpenCreateWizard('')}
                    className="paper-btn-primary px-4 py-2 text-[13px] inline-flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    立即创建第一个游戏
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {recentProjects.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => void openExistingProject(item.path)}
                      className="group p-3.5 rounded-md border border-[#E7E2D8] bg-white hover:border-[#FF5A3D] transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-[13.5px] text-[#171513] truncate group-hover:text-[#FF5A3D] transition-colors">
                            {item.title}
                          </div>
                          <div className="text-[11.5px] text-[#706A60] mt-1 flex items-center gap-3">
                            <span>{item.sceneCount} 个场景</span>
                            <span>{item.characterCount} 名角色</span>
                            <span>{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</span>
                          </div>
                        </div>
                        <button
                          title="从最近列表移除"
                          onClick={(e) => void handleRemoveRecent(e, item.path)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#FCEEEC] text-[#948D82] hover:text-[#C93B2B] transition-opacity cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="text-[11px] text-[#948D82] truncate mt-1.5" title={item.path}>
                        {item.path}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Create New Game Wizard Modal */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-xl w-full max-w-[480px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E7E2D8] flex items-center justify-between bg-white">
              <div>
                <h2 className="font-semibold text-[15px] text-[#171513]">创建新游戏</h2>
                <p className="text-[12px] text-[#706A60]">自动配置中文与多语言显示字体，开箱即玩</p>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="p-1.5 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 flex flex-col gap-4">
              <div>
                <label className="block text-[12.5px] font-medium text-[#171513] mb-1">
                  游戏名称 <span className="text-[#FF5A3D]">*</span>
                </label>
                <input
                  data-testid="wizard-title-input"
                  type="text"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：盛夏的约定"
                  className="paper-input w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-medium text-[#171513] mb-1">
                    创作者署名
                  </label>
                  <input
                    data-testid="wizard-author-input"
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="创作者"
                    className="paper-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[12.5px] font-medium text-[#171513] mb-1">
                    画面比例
                  </label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as '1920x1080' | '1280x720')}
                    className="paper-input w-full"
                  >
                    <option value="1920x1080">高清宽屏 (1920 × 1080)</option>
                    <option value="1280x720">标准宽屏 (1280 × 720)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[12.5px] font-medium text-[#171513] mb-1">
                  保存文件夹
                </label>
                <div className="flex gap-2">
                  <input
                    data-testid="wizard-dir-input"
                    type="text"
                    value={effectiveParentDir}
                    onChange={(e) => setParentDir(e.target.value)}
                    className="paper-input flex-1 text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={handlePickParentDir}
                    className="paper-btn-secondary px-3 py-1.5 text-[12.5px] shrink-0"
                  >
                    更改位置
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12.5px] text-[#706A60] cursor-pointer">
                <input
                  type="checkbox"
                  checked={withStarter}
                  onChange={(e) => setWithStarter(e.target.checked)}
                  className="accent-[#FF5A3D]"
                />
                包含一句示例开场旁白（推荐新手勾选）
              </label>

              <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E7E2D8]">
                <button
                  type="button"
                  onClick={() => setWizardOpen(false)}
                  className="paper-btn-secondary px-4 py-2 text-[13px]"
                >
                  取消
                </button>
                <button
                  data-testid="wizard-submit-btn"
                  type="submit"
                  disabled={busy}
                  className="paper-btn-primary px-5 py-2 text-[13px]"
                >
                  {busy ? '正在创建…' : '创建并开始创作'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
