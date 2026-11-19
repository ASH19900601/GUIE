import React, { useEffect, useState } from 'react';
import { FileCode2, Save, RefreshCw, Play, Plus, ShieldAlert } from 'lucide-react';
import type { AdvancedFileEntry } from '@shared/types';
import { useAppStore } from '../store/useAppStore';

/**
 * Opt-in Advanced Developer Mode (Req 1.4):
 * Houses file tree, raw `.rpy` code editor, and full Ren'Py Lint console strictly outside Creator Mode.
 */
export const AdvancedModeView: React.FC = () => {
  const { projectDir, project, setMode, pushToast } = useAppStore();
  const [files, setFiles] = useState<AdvancedFileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [lintLog, setLintLog] = useState<string>('点击「运行全局 Lint 诊断」查看完整引擎输出。');
  const [lintRunning, setLintRunning] = useState(false);

  const loadFiles = async () => {
    if (!projectDir) return;
    const list = await window.guie.listAdvancedFiles(projectDir);
    setFiles(list);
    if (!selectedPath && list[0]) {
      await openFile(list[0].relativePath);
    }
  };

  const openFile = async (relPath: string) => {
    if (!projectDir) return;
    const txt = await window.guie.readAdvancedFile(projectDir, relPath);
    setSelectedPath(relPath);
    setContent(txt);
    setDirty(false);
  };

  useEffect(() => {
    void loadFiles();
  }, [projectDir]);

  if (!projectDir || !project) return null;

  const handleSaveFile = async () => {
    if (!selectedPath) return;
    await window.guie.writeAdvancedFile(projectDir, selectedPath, content);
    setDirty(false);
    pushToast('success', `已保存文件 ${selectedPath}`);
  };

  const handleCreateCustomRpy = async () => {
    const fileName = `game/custom_script_${Date.now().toString(36).slice(-4)}.rpy`;
    const boilerplate = `# Custom Ren'Py Script (Safely preserved outside GUI-managed files)\n\ninit python:\n    pass\n`;
    await window.guie.writeAdvancedFile(projectDir, fileName, boilerplate);
    await loadFiles();
    await openFile(fileName);
    pushToast('success', `已新建自定义脚本 ${fileName}`);
  };

  const handleRunLint = async () => {
    setLintRunning(true);
    try {
      const res = await window.guie.runEngineCheck(projectDir, project);
      setLintLog(res.rawOutput);
    } finally {
      setLintRunning(false);
    }
  };

  const selectedEntry = files.find((f) => f.relativePath === selectedPath);

  return (
    <div data-testid="advanced-mode-view" className="h-full w-full flex overflow-hidden bg-[#F3F0E8]">
      {/* File Tree */}
      <aside className="w-[260px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] flex flex-col">
        <div className="p-3 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
          <span className="font-semibold text-[13px]">工程脚本文件树</span>
          <button
            onClick={() => void handleCreateCustomRpy()}
            className="paper-btn-secondary px-2 py-1 text-[11.5px] inline-flex items-center gap-1"
            title="新建受保护的 custom_*.rpy"
          >
            <Plus size={12} /> 新建脚本
          </button>
        </div>
        <div className="flex-1 overflow-y-auto paper-scroll p-2 flex flex-col gap-0.5">
          {files.map((f) => (
            <button
              key={f.relativePath}
              onClick={() => void openFile(f.relativePath)}
              className={`w-full text-left px-2.5 py-1.5 rounded text-[12px] flex items-center justify-between gap-2 cursor-pointer ${
                selectedPath === f.relativePath
                  ? 'bg-[#FFF1ED] text-[#171513] font-semibold'
                  : 'text-[#565149] hover:bg-[#EFECE3]'
              }`}
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <FileCode2 size={13} className="shrink-0" />
                <span className="truncate">{f.relativePath}</span>
              </span>
              {f.isManagedByGui && (
                <span className="text-[10px] px-1 rounded bg-[#EFECE3] text-[#706A60] shrink-0">
                  GUI
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Code Editor + Lint Console */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[12.5px] font-semibold truncate">
              {selectedPath || '未选择文件'}
            </span>
            {selectedEntry?.isManagedByGui && (
              <span className="text-[11px] px-2 py-0.5 rounded bg-[#FDF5E6] border border-[#ECD09E] text-[#8F5500] inline-flex items-center gap-1">
                <ShieldAlert size={11} /> 由创作模式自动生成，推荐在 custom_*.rpy 中编写手写扩展
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              disabled={!dirty}
              onClick={() => void handleSaveFile()}
              className="paper-btn-primary px-3 py-1 text-[12px] inline-flex items-center gap-1"
            >
              <Save size={13} /> 保存文件
            </button>
            <button
              onClick={() => void handleRunLint()}
              disabled={lintRunning}
              className="paper-btn-secondary px-3 py-1 text-[12px] inline-flex items-center gap-1"
            >
              {lintRunning ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
              运行全局 Lint 诊断
            </button>
            <button
              onClick={() => void setMode('creator')}
              className="paper-btn-secondary px-3 py-1 text-[12px]"
            >
              返回创作模式
            </button>
          </div>
        </div>

        <textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
          spellCheck={false}
          className="flex-1 w-full p-4 font-mono text-[12.5px] leading-relaxed bg-white text-[#171513] resize-none focus:outline-none paper-scroll"
        />

        <div className="h-[190px] shrink-0 border-t border-[#D7D1C6] bg-[#1E1C1A] text-[#E5DFD3] flex flex-col">
          <div className="px-3.5 py-1.5 border-b border-white/10 text-[11.5px] text-[#B8B0A0] font-medium">
            工程级诊断输出（Ren'Py Lint）
          </div>
          <pre className="flex-1 overflow-auto p-3.5 text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed m-0">
            {lintLog}
          </pre>
        </div>
      </main>
    </div>
  );
};
