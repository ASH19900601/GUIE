import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  PlayCircle,
  Square,
  Package,
  FolderOpen,
  RefreshCw,
  Wrench,
  ArrowRight,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import type { ExportResult, ExportTargetStatus, ProjectIssue } from '@shared/types';
import { analyzeProjectIssues, createId, replaceAssetReferences } from '@shared/defaults';
import { useAppStore } from '../store/useAppStore';

export const FinishWizardPage: React.FC = () => {
  const {
    project,
    projectDir,
    missingAssetIds,
    liveRenpy,
    mutateProject,
    replaceProjectState,
    refreshMissingAssets,
    flushPendingSaves,
    setActiveTab,
    setActiveSceneId,
    startPlaytest,
    stopPlaytest,
    pushToast,
  } = useAppStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [checking, setChecking] = useState(false);
  const [engineIssues, setEngineIssues] = useState<ProjectIssue[]>([]);
  const [engineCheckedOk, setEngineCheckedOk] = useState<boolean | null>(null);
  const [playtestSceneId, setPlaytestSceneId] = useState<string>('');
  const [targets, setTargets] = useState<ExportTargetStatus[]>([]);
  const [exportingTarget, setExportingTarget] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  // Connect dangling option inline dialog state
  const [connectingIssue, setConnectingIssue] = useState<{
    sceneId: string;
    blockId: string;
    optionId: string;
  } | null>(null);
  const [chosenTargetSceneId, setChosenTargetSceneId] = useState('__new__');

  useEffect(() => {
    void window.guie.getExportTargets().then(setTargets);
  }, []);

  const structuralIssues = useMemo(() => {
    if (!project) return [];
    return analyzeProjectIssues(project, new Set(missingAssetIds));
  }, [project, missingAssetIds]);

  const allIssues = [...structuralIssues, ...engineIssues];
  const blockingCount = allIssues.filter((i) => i.severity === 'error').length;

  if (!project || !projectDir) return null;

  const runFullCheck = async () => {
    setChecking(true);
    try {
      await flushPendingSaves();
      await refreshMissingAssets();
      const res = await window.guie.runEngineCheck(projectDir, project);
      setEngineIssues(res.friendlyIssues);
      setEngineCheckedOk(res.ok);
      if (res.ok && structuralIssues.filter((i) => i.severity === 'error').length === 0) {
        pushToast('success', '检查全部通过，未发现阻止试玩或导出的问题！');
      } else {
        pushToast('warning', '检查发现待修复问题，请点击右侧真实修复按钮直接解决。');
      }
    } finally {
      setChecking(false);
    }
  };

  // Requirement 5.3: EVERY fix button MUST be 100% real and working (NEVER disabled!)
  const handleFixIssue = async (issue: ProjectIssue) => {
    const act = issue.fixAction;
    if (act.type === 'jump_to_block') {
      await setActiveTab('story');
      await setActiveSceneId(act.sceneId, act.blockId);
      return;
    }
    if (act.type === 'replace_asset') {
      const oldAsset = project.assets.find((a) => a.id === act.assetId);
      if (!oldAsset) return;
      const paths = await window.guie.pickFiles({
        title: `选择新文件以替换丢失的「${oldAsset.name}」`,
        multi: false,
      });
      if (paths.length === 0) return;
      const imported = await window.guie.importAssets(projectDir, paths, oldAsset.category);
      if (!imported[0]) return;
      const updated = replaceAssetReferences(project, oldAsset.id, imported[0].id);
      updated.assets = updated.assets.filter((a) => a.id !== oldAsset.id);
      updated.assets.push(imported[0]);
      await replaceProjectState(updated, true);
      pushToast('success', `已替换丢失素材「${oldAsset.name}」并同步全项目引用`);
      return;
    }
    if (act.type === 'connect_option') {
      setChosenTargetSceneId(project.scenes[0]?.id ?? '__new__');
      setConnectingIssue({
        sceneId: act.sceneId,
        blockId: act.blockId,
        optionId: act.optionId,
      });
      return;
    }
    if (act.type === 'connect_orphan_scene') {
      const orphan = project.scenes.find((s) => s.id === act.sceneId);
      if (!orphan) return;
      // Connect orphan scene to the end of the last reachable scene (or start scene)
      mutateProject(
        (d) => {
          const anchor =
            d.scenes.find((s) => s.id !== orphan.id && !s.nextSceneId) ??
            d.scenes.find((s) => s.id === d.meta.startSceneId);
          if (anchor) anchor.nextSceneId = orphan.id;
        },
        { immediateSave: true }
      );
      pushToast('success', `已将场景「${orphan.name}」自动接入剧情主线`);
      return;
    }
    if (act.type === 'set_start_scene') {
      mutateProject(
        (d) => {
          d.meta.startSceneId = act.sceneId;
        },
        { immediateSave: true }
      );
      pushToast('success', '已修复开场场景设定');
      return;
    }
    if (act.type === 'fix_cjk_font') {
      mutateProject(
        (d) => {
          d.appearance.font.bundledCjkFont = 'fonts/SourceHanSansLite.ttf';
        },
        { immediateSave: true }
      );
      pushToast('success', '已一键恢复内置开源多语言字体');
      return;
    }
    if (act.type === 'open_appearance') {
      await setActiveTab('appearance');
    }
  };

  const handleConfirmConnectOption = () => {
    if (!connectingIssue) return;
    mutateProject(
      (d) => {
        let targetId = chosenTargetSceneId;
        if (targetId === '__new__') {
          const newId = createId('sc');
          d.scenes.push({
            id: newId,
            chapterId: d.chapters[0]?.id ?? null,
            name: `新分支场景 ${d.scenes.length + 1}`,
            order: d.scenes.length,
            disabled: false,
            nextSceneId: null,
            blocks: [
              {
                id: createId('blk'),
                type: 'dialogue',
                speakerId: null,
                text: '在这里继续编写该选项后的剧情。',
              },
            ],
          });
          targetId = newId;
        }
        const sc = d.scenes.find((s) => s.id === connectingIssue.sceneId);
        const blk = sc?.blocks.find((b) => b.id === connectingIssue.blockId);
        if (blk?.type === 'choice') {
          const opt = blk.options.find((o) => o.id === connectingIssue.optionId);
          if (opt) {
            opt.targetType = 'scene';
            opt.targetSceneId = targetId;
          }
        }
      },
      { immediateSave: true }
    );
    setConnectingIssue(null);
    pushToast('success', '已为悬空选项成功连接后续场景');
  };

  const handleExport = async (target: ExportTargetStatus['target']) => {
    await flushPendingSaves();
    const outDir = `${projectDir.replace(/[\\/]+$/, '')}_exports`;
    setExportingTarget(target);
    setExportResult(null);
    try {
      const res = await window.guie.exportGame({
        projectDir,
        outputDir: outDir,
        target,
      });
      setExportResult(res);
      if (res.success) {
        pushToast('success', res.message);
      } else {
        pushToast('error', res.message);
      }
    } finally {
      setExportingTarget(null);
    }
  };

  const handleVerifyExportedGame = async () => {
    if (!exportResult?.executablePath) return;
    const res = await window.guie.launchExportedExe(exportResult.executablePath);
    if (res.launched) {
      pushToast('success', '已启动导出的独立游戏程序！');
    } else {
      pushToast('error', res.error || '启动导出程序失败');
    }
  };

  return (
    <div id="guie-main-scroll" className="h-full w-full overflow-y-auto paper-scroll bg-[#F3F0E8] p-6">
      <div className="max-w-[980px] mx-auto flex flex-col gap-6">
        {/* Continuous Wizard Header (Req 5.3 & 6.2.7) */}
        <div className="border-b border-[#D7D1C6] pb-4">
          <h1 className="text-[18px] font-bold text-[#171513]">完成与发布向导</h1>
          <p className="text-[13px] text-[#706A60] mt-1">
            按照「检查问题 → 试玩验证 → 多平台打包导出」三步闭环完成你的视觉小说作品。
          </p>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {[
              { n: 1 as const, title: '1. 自动检查与修复', desc: blockingCount > 0 ? `发现 ${blockingCount} 项阻塞问题` : '状态良好' },
              { n: 2 as const, title: '2. 试玩主要路线', desc: liveRenpy.running ? '正在试玩运行中' : '支持从头或任意场景试玩' },
              { n: 3 as const, title: '3. 打包导出发行版', desc: '一键生成可独立运行的游戏包' },
            ].map((s) => (
              <button
                key={s.n}
                data-testid={`wizard-step-${s.n}`}
                onClick={() => setStep(s.n)}
                className={`text-left p-3.5 rounded-md border cursor-pointer transition-colors ${
                  step === s.n
                    ? 'bg-[#FFF1ED] border-[#FF5A3D]'
                    : 'bg-white border-[#D7D1C6] hover:border-[#B8B0A0]'
                }`}
              >
                <div className="font-semibold text-[13.5px] text-[#171513]">{s.title}</div>
                <div className="text-[11.5px] text-[#706A60] mt-0.5">{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* STEP 1: Issue Check & Real Direct Fix */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="paper-card p-5 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="font-semibold text-[15px] flex items-center gap-2">
                  {blockingCount === 0 && engineCheckedOk !== false ? (
                    <CheckCircle2 size={18} className="text-[#2A7B50]" />
                  ) : (
                    <AlertTriangle size={18} className="text-[#B86E00]" />
                  )}
                  游戏完整性自动检查中心
                </div>
                <p className="text-[12.5px] text-[#706A60] mt-1">
                  自动检测悬空选项、未接入主线的场景、缺失素材、多语言字体及运行引擎语法校验。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  data-testid="run-full-check-btn"
                  disabled={checking}
                  onClick={() => void runFullCheck()}
                  className="paper-btn-primary px-4 py-2 text-[13px] inline-flex items-center gap-1.5"
                >
                  {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  {checking ? '正在全面检查…' : '立即全面检查'}
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="paper-btn-secondary px-4 py-2 text-[13px] inline-flex items-center gap-1"
                >
                  下一步：试玩 <ArrowRight size={14} />
                </button>
              </div>
            </div>

            {allIssues.length === 0 ? (
              <div className="paper-card p-8 text-center">
                <CheckCircle2 size={32} className="mx-auto text-[#2A7B50] mb-2" />
                <div className="font-semibold text-[15px] text-[#171513]">
                  未发现任何剧情断链、缺失素材或运行问题！
                </div>
                <p className="text-[12.5px] text-[#706A60] mt-1 mb-4">
                  {engineCheckedOk
                    ? '运行引擎深度校验已通过，可以直接试玩或导出独立游戏。'
                    : '点击上方「立即全面检查」执行运行引擎最终确认，或直接进入下一步试玩。'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {allIssues.map((issue) => (
                  <div
                    key={issue.id}
                    data-testid={`issue-card-${issue.code}`}
                    className={`paper-card p-4 flex items-start justify-between gap-4 ${
                      issue.severity === 'error'
                        ? 'border-[#E7B5AF] bg-[#FCEEEC]/40'
                        : 'border-[#ECD09E] bg-[#FDF5E6]/50'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {issue.severity === 'error' ? (
                        <XCircle size={18} className="text-[#C93B2B] shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle size={18} className="text-[#B86E00] shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 text-[12.5px]">
                        <div className="font-semibold text-[13.5px] text-[#171513]">{issue.title}</div>
                        <div className="text-[#565149] mt-1">
                          <strong>发生了什么：</strong>
                          {issue.whatHappened}
                        </div>
                        <div className="text-[#706A60] mt-0.5">
                          <strong>有什么影响：</strong>
                          {issue.impact}
                        </div>
                        <div className="text-[#2A7B50] mt-0.5">
                          <strong>如何解决：</strong>
                          {issue.howToFix}
                        </div>
                      </div>
                    </div>

                    <button
                      data-testid={`fix-issue-btn-${issue.code}`}
                      onClick={() => void handleFixIssue(issue)}
                      className="paper-btn-primary px-3.5 py-2 text-[12px] inline-flex items-center gap-1.5 shrink-0"
                    >
                      <Wrench size={13} />
                      {issue.fixAction.type === 'replace_asset'
                        ? '一键替换素材'
                        : issue.fixAction.type === 'connect_option'
                        ? '连接目标场景'
                        : issue.fixAction.type === 'connect_orphan_scene'
                        ? '一键接入主线'
                        : issue.fixAction.type === 'fix_cjk_font'
                        ? '一键修复字体'
                        : '前往直接修复'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Playtest Verification */}
        {step === 2 && (
          <div className="paper-card p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-semibold text-[15.5px] text-[#171513]">实机试玩验证</h2>
              <p className="text-[12.5px] text-[#706A60] mt-1">
                在导出前实际启动游戏，体验开场流程、分支选择、画面转场与音乐播放。
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-md border border-[#E7E2D8] bg-[#FBFAF5] flex flex-col justify-between gap-3">
                <div>
                  <div className="font-semibold text-[14px]">从头完整试玩</div>
                  <p className="text-[12px] text-[#706A60] mt-1">
                    从游戏标题主菜单开始完整游玩，验证开场、存档、好感度与多结局解锁流程。
                  </p>
                </div>
                {liveRenpy.running ? (
                  <button
                    onClick={() => void stopPlaytest()}
                    className="px-4 py-2 rounded-md bg-[#FCEEEC] border border-[#F0BEB8] text-[#C93B2B] font-medium text-[13px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Square size={13} fill="currentColor" /> 停止当前试玩
                  </button>
                ) : (
                  <button
                    onClick={() => void startPlaytest({ fromCurrentScene: false })}
                    className="paper-btn-primary px-4 py-2 text-[13px] inline-flex items-center justify-center gap-1.5"
                  >
                    <Play size={14} fill="currentColor" /> 从头开始试玩
                  </button>
                )}
              </div>

              <div className="p-4 rounded-md border border-[#E7E2D8] bg-[#FBFAF5] flex flex-col justify-between gap-3">
                <div>
                  <div className="font-semibold text-[14px]">从指定场景直接试玩</div>
                  <p className="text-[12px] text-[#706A60] mt-1 mb-2">
                    无需重跑前置剧情，直接跳转到任意场景测试分支和演出。
                  </p>
                  <select
                    value={playtestSceneId || project.meta.startSceneId}
                    onChange={(e) => setPlaytestSceneId(e.target.value)}
                    className="paper-input w-full text-[12.5px]"
                  >
                    {project.scenes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    const sid = playtestSceneId || project.meta.startSceneId;
                    void setActiveSceneId(sid).then(() =>
                      startPlaytest({ fromCurrentScene: true })
                    );
                  }}
                  className="paper-btn-secondary px-4 py-2 text-[13px] inline-flex items-center justify-center gap-1.5"
                >
                  <PlayCircle size={14} className="text-[#FF5A3D]" /> 跳转到该场景试玩
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-[#E7E2D8]">
              <button
                onClick={() => setStep(3)}
                className="paper-btn-primary px-5 py-2 text-[13px] inline-flex items-center gap-1.5"
              >
                下一步：导出独立游戏 <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Multi-Platform Export */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {targets.map((t) => {
                const isBuilding = exportingTarget === t.target;
                return (
                  <div
                    key={t.target}
                    data-testid={`export-target-${t.target}`}
                    className={`paper-card p-4 flex flex-col justify-between gap-3 ${
                      !t.available ? 'opacity-80 bg-[#FBFAF5]' : 'bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-[14px] text-[#171513]">{t.label}</div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded ${
                            t.available
                              ? 'bg-[#EDF7F1] text-[#2A7B50]'
                              : 'bg-[#EFECE3] text-[#706A60]'
                          }`}
                        >
                          {t.available ? '本机可直接导出' : '需额外构建套件'}
                        </span>
                      </div>
                      {!t.available && t.reason && (
                        <p className="text-[12px] text-[#706A60] mt-2 leading-relaxed">{t.reason}</p>
                      )}
                      {t.available && (
                        <p className="text-[12px] text-[#706A60] mt-1.5">
                          打包全部剧情、素材、内置多语言字体与扩展系统，玩家解压后直接双击运行，无需安装任何软件。
                        </p>
                      )}
                    </div>

                    <button
                      data-testid={`export-btn-${t.target}`}
                      disabled={!t.available || Boolean(exportingTarget)}
                      onClick={() => void handleExport(t.target)}
                      className={
                        t.available
                          ? 'paper-btn-primary py-2 text-[12.5px] inline-flex items-center justify-center gap-1.5'
                          : 'paper-btn-secondary py-2 text-[12.5px]'
                      }
                    >
                      {isBuilding ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> 正在打包导出（约 15-40 秒）…
                        </>
                      ) : (
                        <>
                          <Package size={14} /> {t.available ? '立即打包导出' : '本机缺少官方构建支持包'}
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {exportResult && (
              <div
                data-testid="export-result-banner"
                className={`paper-card p-5 flex items-center justify-between gap-4 flex-wrap ${
                  exportResult.success
                    ? 'bg-[#EDF7F1] border-[#B6DFC7]'
                    : 'bg-[#FCEEEC] border-[#F0BEB8]'
                }`}
              >
                <div>
                  <div className="font-semibold text-[14.5px] text-[#171513]">
                    {exportResult.success ? '打包导出成功！' : '导出未完成'}
                  </div>
                  <div className="text-[12.5px] text-[#565149] mt-0.5">{exportResult.message}</div>
                  {exportResult.outputDir && (
                    <div className="text-[11.5px] text-[#706A60] mt-1">
                      输出位置：{exportResult.outputDir}
                    </div>
                  )}
                </div>
                {exportResult.success && (
                  <div className="flex items-center gap-2">
                    {exportResult.outputDir && (
                      <button
                        onClick={() => void window.guie.openPathInExplorer(exportResult.outputDir!)}
                        className="paper-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5"
                      >
                        <FolderOpen size={14} /> 打开导出文件夹
                      </button>
                    )}
                    {exportResult.executablePath && (
                      <button
                        data-testid="launch-exported-exe-btn"
                        onClick={() => void handleVerifyExportedGame()}
                        className="paper-btn-primary px-4 py-2 text-[12.5px] inline-flex items-center gap-1.5"
                      >
                        <ExternalLink size={14} /> 试运行导出的独立游戏
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline Dialog: Fix Dangling Choice Option Target */}
      {connectingIssue && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-xl w-full max-w-[420px] p-5 flex flex-col gap-4">
            <div className="font-semibold text-[14.5px]">为该选项指定目标场景</div>
            <select
              value={chosenTargetSceneId}
              onChange={(e) => setChosenTargetSceneId(e.target.value)}
              className="paper-input w-full"
            >
              <option value="__new__">+ 自动新建一个后续场景并连接</option>
              {project.scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  连接到已有场景：{s.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConnectingIssue(null)}
                className="paper-btn-secondary px-3.5 py-1.5 text-[12.5px]"
              >
                取消
              </button>
              <button
                onClick={handleConfirmConnectOption}
                className="paper-btn-primary px-4 py-1.5 text-[12.5px]"
              >
                确认修复
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
