import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Monitor,
  Tv,
  Play,
  Square,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Sliders,
  Layers,
  Clock,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import type { ChoiceOption, ParticlePreset, PreviewStageState, TimelineStep } from '@shared/types';
import {
  advancePreviewStep,
  applyBlockToStage,
  resolveChoiceNavigation,
  simulateSceneTimeline,
  summarizeBlockForTimeline,
  type CallReturnFrame,
} from '@shared/previewEngine';
import { useAppStore } from '../../store/useAppStore';

interface StagePreviewPaneProps {
  onJumpToCard: (sceneId: string, blockId: string) => void;
}

const LUT_FILTERS: Record<string, string> = {
  none: 'none',
  warm: 'sepia(0.18) saturate(1.22) brightness(1.04)',
  cool: 'hue-rotate(15deg) saturate(0.95) brightness(0.98)',
  sepia: 'sepia(0.65) contrast(1.04)',
  noir: 'grayscale(0.85) contrast(1.25) brightness(0.92)',
  sunset: 'sepia(0.32) saturate(1.45) hue-rotate(-10deg)',
  dreamy: 'brightness(1.08) contrast(0.94) saturate(1.15)',
};

const SLOT_LEFT_PERCENT: Record<string, string> = {
  farleft: '10%',
  left: '26%',
  center: '50%',
  right: '74%',
  farright: '90%',
};

export const StagePreviewPane: React.FC<StagePreviewPaneProps> = ({ onJumpToCard }) => {
  const {
    project,
    projectDir,
    activeSceneId,
    selectedBlockId,
    liveRenpy,
    previewOverrides,
    startPlaytest,
    stopPlaytest,
    setPreviewOverride,
    resetPreviewOverrides,
  } = useAppStore();

  const [previewMode, setPreviewMode] = useState<'instant' | 'mirror'>('instant');
  const [debuggerOpen, setDebuggerOpen] = useState(true);
  const [debugTab, setDebugTab] = useState<'vars' | 'route' | 'stack' | 'snapshots'>('vars');

  // Interactive timeline playback state (allows stepping across scenes & choices cleanly without reload loops!)
  const [interactiveSteps, setInteractiveSteps] = useState<TimelineStep[] | null>(null);
  const [returnStack, setReturnStack] = useState<CallReturnFrame[]>([]);
  const [scrubIndex, setScrubIndex] = useState<number>(0);
  const [nameInputDraft, setNameInputDraft] = useState<string>('');
  const isInternalSyncRef = useRef(false);

  // Sync from clicked editor card -> instant stage simulation (Bidirectional sync #1)
  const baseSim = useMemo(() => {
    if (!project || !activeSceneId) return null;
    return simulateSceneTimeline(project, activeSceneId, selectedBlockId, previewOverrides);
  }, [project, activeSceneId, selectedBlockId, previewOverrides]);

  // Reset interactive scrub ONLY when user externally clicks a card in editor (NEVER when preview itself scrubs/steps!)
  useEffect(() => {
    if (isInternalSyncRef.current) {
      isInternalSyncRef.current = false;
      return;
    }
    setInteractiveSteps(null);
    setReturnStack([]);
    if (baseSim) {
      setScrubIndex(baseSim.targetStepIndex);
    }
  }, [activeSceneId, selectedBlockId]);

  // Keep player name input draft synced when entering a player_name_input block
  const activeSteps = interactiveSteps ?? baseSim?.steps ?? [];
  const currentStep = activeSteps[Math.min(scrubIndex, Math.max(0, activeSteps.length - 1))];
  const stage: PreviewStageState | null = currentStep?.stageSnapshot ?? baseSim?.stage ?? null;

  useEffect(() => {
    if (stage?.activeNameInput) {
      setNameInputDraft(
        String(previewOverrides.__player_name__ ?? stage.activeNameInput.defaultName ?? '主角')
      );
    }
  }, [currentStep?.blockId]);

  if (!project || !projectDir) return null;

  const getAssetSrc = (assetId?: string | null): string | null => {
    if (!assetId) return null;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    return window.guie.getAssetUrl(projectDir, asset.relativePath);
  };

  const syncEditorFromPreview = (sceneId: string, blockId: string) => {
    isInternalSyncRef.current = true;
    onJumpToCard(sceneId, blockId);
  };

  // Bidirectional sync #2: User scrubs timeline -> jump & highlight card in center editor WITHOUT truncating steps!
  const handleScrub = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(activeSteps.length - 1, nextIdx));
    // Freeze current steps into interactiveSteps so scrubbing backward preserves forward steps!
    if (!interactiveSteps && activeSteps.length > 0) {
      setInteractiveSteps(activeSteps);
    }
    setScrubIndex(clamped);
    const step = activeSteps[clamped];
    if (step) {
      syncEditorFromPreview(step.sceneId, step.blockId);
    }
  };

  // Interactive click on a choice button inside Instant Preview!
  const handlePreviewChoiceClick = (option: ChoiceOption) => {
    if (!stage || !currentStep) return;
    const nav = resolveChoiceNavigation(
      project,
      currentStep.sceneId,
      currentStep.blockId,
      option,
      stage.variables
    );

    const existingPrefix = activeSteps.slice(0, scrubIndex + 1);
    if (nav.ending) {
      const endStage: PreviewStageState = {
        ...structuredClone(stage),
        variables: nav.nextVars,
        activeChoice: null,
        activeEnding: nav.ending,
      };
      const nextStep: TimelineStep = {
        index: existingPrefix.length,
        sceneId: currentStep.sceneId,
        sceneName: currentStep.sceneName,
        blockId: currentStep.blockId,
        summary: `选择「${option.label}」→ 达成结局：${nav.ending.title}`,
        choiceTakenLabel: option.label,
        variablesSnapshot: nav.nextVars,
        callStack: currentStep.callStack,
        stageSnapshot: endStage,
      };
      const combined = [...existingPrefix, nextStep];
      setInteractiveSteps(combined);
      setScrubIndex(combined.length - 1);
      return;
    }

    if (nav.nextSceneId && nav.nextBlockId) {
      const targetScene = project.scenes.find((s) => s.id === nav.nextSceneId);
      const targetBlk = targetScene?.blocks.find((b) => b.id === nav.nextBlockId);
      if (targetScene && targetBlk) {
        const nextStage = applyBlockToStage(
          { ...structuredClone(stage), variables: nav.nextVars },
          targetBlk,
          project
        );
        if (option.targetType === 'call_scene') {
          const curScene = project.scenes.find((s) => s.id === currentStep.sceneId);
          const curIdx = curScene?.blocks.findIndex((b) => b.id === currentStep.blockId) ?? 0;
          setReturnStack((prev) => [
            ...prev,
            {
              sceneId: currentStep.sceneId,
              sceneName: currentStep.sceneName,
              nextBlockIndex: curIdx + 1,
            },
          ]);
        }
        const nextStep: TimelineStep = {
          index: existingPrefix.length,
          sceneId: targetScene.id,
          sceneName: targetScene.name,
          blockId: targetBlk.id,
          summary: summarizeBlockForTimeline(targetBlk, project),
          choiceTakenLabel: option.label,
          variablesSnapshot: nextStage.variables,
          callStack:
            option.targetType === 'call_scene'
              ? [...currentStep.callStack, targetScene.name]
              : [targetScene.name],
          stageSnapshot: nextStage,
        };
        const combined = [...existingPrefix, nextStep];
        setInteractiveSteps(combined);
        setScrubIndex(combined.length - 1);
        syncEditorFromPreview(targetScene.id, targetBlk.id);
      }
    }
  };

  // Step forward cleanly through condition_branch, jump_scene, call_scene, return_from_call, or nextSceneId!
  const handleStepNext = () => {
    if (!currentStep || !stage) return;
    if (stage.activeChoice) return; // Wait for creator to click one of the choices
    if (scrubIndex < activeSteps.length - 1) {
      handleScrub(scrubIndex + 1);
      return;
    }
    const { nextStep, nextReturnStack } = advancePreviewStep(
      project,
      currentStep,
      stage,
      returnStack
    );
    if (!nextStep) return;
    nextStep.index = activeSteps.length;
    const combined = [...activeSteps, nextStep];
    setReturnStack(nextReturnStack);
    setInteractiveSteps(combined);
    setScrubIndex(combined.length - 1);
    syncEditorFromPreview(nextStep.sceneId, nextStep.blockId);
  };

  const bgSrc = getAssetSrc(stage?.backgroundAssetId);
  const boxBgSrc = getAssetSrc(
    stage?.speakerDialogueBoxBgAssetId ?? project.appearance.dialogueBox.backgroundAssetId
  );
  const avatarSrc = getAssetSrc(stage?.speakerAvatarAssetId);
  const boxStyle = project.appearance.dialogueBox;
  const btnStyle = project.appearance.buttons;

  const currentSceneObj = project.scenes.find((s) => s.id === (currentStep?.sceneId ?? activeSceneId));

  return (
    <aside
      data-testid="live-preview-pane"
      className="w-[410px] xl:w-[445px] shrink-0 h-full bg-[#FBFAF5] border-l border-[#D7D1C6] flex flex-col overflow-hidden"
    >
      {/* Top Preview Mode Header */}
      <div className="px-3.5 py-2.5 border-b border-[#E7E2D8] flex items-center justify-between gap-2 bg-white">
        <div className="flex items-center gap-1 bg-[#F3F0E8] p-0.5 rounded-md border border-[#E7E2D8]">
          <button
            data-testid="preview-mode-instant"
            onClick={() => setPreviewMode('instant')}
            className={`px-2.5 py-1 rounded text-[12px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              previewMode === 'instant'
                ? 'bg-white text-[#171513] font-medium shadow-xs'
                : 'text-[#706A60] hover:text-[#171513]'
            }`}
          >
            <Monitor size={13} />
            即时画面
          </button>
          <button
            data-testid="preview-mode-mirror"
            onClick={() => setPreviewMode('mirror')}
            className={`px-2.5 py-1 rounded text-[12px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
              previewMode === 'mirror'
                ? 'bg-white text-[#171513] font-medium shadow-xs'
                : 'text-[#706A60] hover:text-[#171513]'
            }`}
          >
            <Tv size={13} />
            实机镜像
          </button>
        </div>

        <div className="text-[11.5px] text-[#706A60] truncate max-w-[160px]" title={currentSceneObj?.name}>
          {currentSceneObj?.name || '未选场景'}
        </div>
      </div>

      {/* Stage Viewport (True 16:9 Aspect Ratio) */}
      <div className="p-3 border-b border-[#E7E2D8] bg-[#F3F0E8]">
        {previewMode === 'mirror' ? (
          <div className="w-full aspect-video rounded-md overflow-hidden border border-[#D7D1C6] bg-[#161412] relative flex flex-col items-center justify-center text-white">
            {liveRenpy.running && liveRenpy.mirrorActive && liveRenpy.frameDataUrl ? (
              <>
                <img
                  src={liveRenpy.frameDataUrl}
                  alt="真实运行引擎实机画面"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/65 text-[10.5px] text-[#86EFAC] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                  实机同步中 · 保存自动热更新
                </div>
              </>
            ) : (
              <div className="px-5 text-center">
                <Tv size={24} className="mx-auto mb-2 text-[#948D82]" />
                <div className="text-[13px] font-medium mb-1">
                  {liveRenpy.running ? '正在同步实机渲染画面…' : '实机画面镜像模式'}
                </div>
                <p className="text-[11.5px] text-[#B8B0A0] mb-3 leading-relaxed">
                  启动真实游戏窗口后，画面将实时镜像到此处；每次修改保存后自动热重载，无需重启。
                </p>
                {liveRenpy.running ? (
                  <button
                    onClick={() => void stopPlaytest()}
                    className="px-3 py-1.5 rounded bg-[#C93B2B] text-white text-[12px] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square size={11} fill="currentColor" />
                    停止实机镜像
                  </button>
                ) : (
                  <button
                    data-testid="start-mirror-btn"
                    onClick={() => void startPlaytest({ fromCurrentScene: true, mirrorMode: true })}
                    className="paper-btn-primary px-3.5 py-1.5 text-[12px] inline-flex items-center gap-1.5"
                  >
                    <Play size={12} fill="currentColor" />
                    启动实机画面镜像
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="instant-stage-viewport"
            className={`w-full aspect-video rounded-md overflow-hidden border border-[#D7D1C6] relative select-none ${
              stage?.camera.shake === 'light'
                ? 'animate-shake-light'
                : stage?.camera.shake === 'medium'
                ? 'animate-shake-medium'
                : stage?.camera.shake === 'heavy'
                ? 'animate-shake-heavy'
                : ''
            }`}
            style={{ backgroundColor: stage?.backgroundColor || '#171513' }}
          >
            {/* Camera Transform Container */}
            <div
              className="absolute inset-0 transition-all duration-300"
              style={{
                transform: stage
                  ? `translate(${stage.camera.panX * 0.2}px, ${stage.camera.panY * 0.2}px) scale(${stage.camera.zoom || 1})`
                  : undefined,
                filter: [
                  stage?.camera.blur ? `blur(${stage.camera.blur * 0.4}px)` : '',
                  stage?.camera.lutPreset ? LUT_FILTERS[stage.camera.lutPreset] : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined,
              }}
            >
              {/* Single Background OR Multilayer Parallax Stage */}
              {stage && stage.multilayerLayers.length > 0 ? (
                [...stage.multilayerLayers]
                  .filter((l) => l.visible && (!stage.isolatedLayerId || stage.isolatedLayerId === l.id))
                  .sort((a, b) => a.zIndex - b.zIndex)
                  .map((layer) => {
                    const src = getAssetSrc(layer.assetId);
                    if (!src) return null;
                    return (
                      <img
                        key={layer.id}
                        src={src}
                        alt={layer.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          opacity: layer.alpha,
                          transform: `translate(${layer.offsetX * 0.22}px, ${layer.offsetY * 0.22}px) scale(${layer.scale})`,
                        }}
                      />
                    );
                  })
              ) : bgSrc ? (
                <img src={bgSrc} alt="场景背景" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-b from-[#2B2622] to-[#171513] flex items-center justify-center">
                  <span className="text-[11px] text-white/30">尚未设置场景背景</span>
                </div>
              )}

              {/* Character Sprites Layer */}
              {stage?.sprites
                .slice()
                .sort((a, b) => a.zOrder - b.zOrder)
                .map((sp) => {
                  const spSrc = getAssetSrc(sp.assetId);
                  const chName = project.characters.find((c) => c.id === sp.characterId)?.name ?? '角色';
                  const leftPos =
                    sp.slot === 'custom'
                      ? `${Math.round((sp.x ?? 0.5) * 100)}%`
                      : SLOT_LEFT_PERCENT[sp.slot] ?? '50%';
                  const bottomPos = sp.slot === 'custom' ? `${Math.round((1 - (sp.y ?? 1)) * 100)}%` : '0%';
                  return (
                    <div
                      key={sp.characterId}
                      className="absolute -translate-x-1/2 transition-all duration-200 pointer-events-none"
                      style={{
                        left: leftPos,
                        bottom: bottomPos,
                        height: '82%',
                        opacity: sp.alpha,
                        transform: `translateX(-50%) scale(${sp.scale}) rotate(${sp.rotation}deg)`,
                        transformOrigin: 'bottom center',
                      }}
                    >
                      {spSrc ? (
                        <img
                          src={spSrc}
                          alt={chName}
                          className="h-full w-auto max-w-none object-contain drop-shadow"
                        />
                      ) : (
                        <div className="h-full w-24 rounded-t-xl bg-white/15 border border-white/25 flex flex-col items-center justify-center text-white/80 text-[11px] px-2 text-center">
                          <span>{chName}</span>
                          {sp.expression && <span className="text-[10px] opacity-70">({sp.expression})</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>

            {/* Weather Particles Canvas Overlay */}
            {stage && stage.camera.particles !== 'none' && (
              <ParticleOverlay preset={stage.camera.particles} intensity={stage.camera.particleIntensity} />
            )}

            {/* Vignette Overlay */}
            {stage && stage.camera.vignette > 0 && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(circle, transparent 48%, rgba(0,0,0,${(
                    stage.camera.vignette * 0.78
                  ).toFixed(2)}) 100%)`,
                }}
              />
            )}

            {/* Video Overlay Indicator */}
            {stage?.videoOverlay && (
              <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-white text-[12px]">
                正在播放视频演出片段
              </div>
            )}

            {/* Interactive Choice Overlay */}
            {stage?.activeChoice && (
              <div
                data-testid="preview-choice-overlay"
                className="absolute inset-0 bg-black/35 flex flex-col items-center justify-center gap-2 px-8 z-20"
              >
                {stage.activeChoice.options
                  .filter((o) => o.visible)
                  .map(({ option, enabled, disabledHint }) => (
                    <button
                      key={option.id}
                      disabled={!enabled}
                      onClick={() => enabled && handlePreviewChoiceClick(option)}
                      style={{
                        backgroundColor: enabled ? btnStyle.bgColor : '#3A3A3ACC',
                        color: enabled ? btnStyle.textColor : '#BBBBBB',
                        borderColor: btnStyle.borderColor,
                        borderWidth: `${btnStyle.borderWidth}px`,
                        borderRadius: `${Math.min(18, btnStyle.radius)}px`,
                      }}
                      className="w-full max-w-[290px] px-3.5 py-1.5 text-[11.5px] font-medium border text-center transition-transform hover:scale-[1.01] disabled:cursor-not-allowed cursor-pointer"
                    >
                      {option.label || '未命名选项'}
                      {!enabled && disabledHint ? `（${disabledHint}）` : ''}
                    </button>
                  ))}
              </div>
            )}

            {/* Ending Overlay */}
            {stage?.activeEnding && (
              <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center text-center px-6 z-20">
                <div className="text-[10.5px] tracking-widest text-[#FF5A3D] mb-1">
                  达成结局
                </div>
                <div className="text-[18px] font-bold text-white">{stage.activeEnding.title}</div>
                {stage.activeEnding.subtitle && (
                  <div className="text-[12px] text-white/75 mt-1">{stage.activeEnding.subtitle}</div>
                )}
              </div>
            )}

            {/* Interactive Player Name Input Overlay */}
            {stage?.activeNameInput && (
              <div className="absolute inset-0 bg-black/65 flex items-center justify-center z-20">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPreviewOverride('__player_name__', nameInputDraft.trim() || stage.activeNameInput!.defaultName);
                    handleStepNext();
                  }}
                  className="bg-[#221E1B] border border-white/20 rounded-md px-4 py-3 text-center w-[250px] flex flex-col gap-2"
                >
                  <div className="text-[11.5px] text-white">{stage.activeNameInput.prompt}</div>
                  <input
                    type="text"
                    value={nameInputDraft}
                    onChange={(e) => setNameInputDraft(e.target.value)}
                    className="bg-black/45 border border-white/25 rounded px-2 py-1 text-[11.5px] text-[#FFB399] text-center focus:outline-none focus:border-[#FF5A3D]"
                  />
                  <button
                    type="submit"
                    className="bg-[#FF5A3D] hover:bg-[#E5482C] text-white text-[11px] py-1 rounded cursor-pointer"
                  >
                    确认名字并继续预览
                  </button>
                </form>
              </div>
            )}

            {/* NVL Full-Screen Monologue vs ADV Dialogue Box */}
            {stage && !stage.activeEnding && !stage.activeNameInput && (
              stage.nvlMode ? (
                <div
                  onClick={handleStepNext}
                  className="absolute inset-0 bg-[#12100E]/82 px-7 py-5 flex flex-col justify-center gap-2 z-10 cursor-pointer"
                >
                  {stage.nvlHistory.map((item, idx) => (
                    <div key={idx} className="text-[11.5px] leading-relaxed">
                      {item.speaker && (
                        <span className="font-semibold mr-2" style={{ color: item.color }}>
                          {item.speaker}
                        </span>
                      )}
                      <span style={{ color: boxStyle.textColor || '#FFFFFF' }}>
                        {renderRichTextPreview(item.text)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={handleStepNext}
                  title="点击画面步进到下一句"
                  className="absolute left-0 right-0 bottom-0 z-10 cursor-pointer flex items-end"
                  style={{
                    height: `${Math.max(22, Math.min(44, Math.round((boxStyle.boxHeight / 1080) * 100)))}%`,
                    backgroundColor: boxBgSrc
                      ? undefined
                      : hexToRgba(boxStyle.boxBgColor || '#1B1917', boxStyle.boxOpacity ?? 0.86),
                    backgroundImage: boxBgSrc ? `url("${boxBgSrc}")` : undefined,
                    backgroundSize: 'cover',
                    padding: `${Math.max(6, Math.round(boxStyle.paddingY * 0.28))}px ${Math.max(10, Math.round(boxStyle.paddingX * 0.32))}px`,
                  }}
                >
                  {avatarSrc && (
                    <img
                      src={avatarSrc}
                      alt="侧边头像"
                      className="w-11 h-11 rounded object-cover border border-white/25 mr-2.5 shrink-0 self-center"
                    />
                  )}
                  <div className="flex-1 min-w-0 h-full flex flex-col justify-start overflow-hidden">
                    {stage.speakerName && (
                      <div
                        className="font-semibold truncate mb-0.5"
                        style={{
                          color: stage.speakerColor || boxStyle.nameColor,
                          fontSize: `${Math.max(11, Math.round(boxStyle.nameFontSize * 0.36))}px`,
                          textShadow: boxStyle.textShadow ? `1px 1px 2px ${boxStyle.shadowColor}` : undefined,
                        }}
                      >
                        {stage.speakerName}
                      </div>
                    )}
                    <div
                      className="overflow-hidden line-clamp-3"
                      style={{
                        color: boxStyle.textColor || '#FFFFFF',
                        fontSize: `${Math.max(10.5, Math.round(boxStyle.fontSize * 0.36))}px`,
                        fontWeight: boxStyle.fontWeight,
                        lineHeight: boxStyle.lineHeight,
                        letterSpacing: `${boxStyle.letterSpacing * 0.3}px`,
                        textShadow: boxStyle.textShadow ? `1px 1px 2px ${boxStyle.shadowColor}` : undefined,
                      }}
                    >
                      {stage.text ? renderRichTextPreview(stage.text) : (
                        <span className="opacity-50">点击左侧任意卡片即时预览当前画面</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Timeline Scrubber Strip */}
        <div className="mt-2.5 flex items-center gap-2">
          <button
            title="上一步"
            onClick={() => handleScrub(scrubIndex - 1)}
            disabled={scrubIndex <= 0}
            className="paper-btn-secondary p-1 disabled:opacity-40"
          >
            <SkipBack size={12} />
          </button>
          <input
            data-testid="timeline-scrubber"
            type="range"
            min={0}
            max={Math.max(0, activeSteps.length - 1)}
            value={Math.min(scrubIndex, Math.max(0, activeSteps.length - 1))}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="flex-1 accent-[#FF5A3D] cursor-pointer h-1.5"
          />
          <button
            title="下一步"
            onClick={handleStepNext}
            className="paper-btn-secondary p-1"
          >
            <SkipForward size={12} />
          </button>
          <span className="text-[11px] text-[#706A60] tabular-nums shrink-0 min-w-[46px] text-right">
            {activeSteps.length > 0 ? `${scrubIndex + 1} / ${activeSteps.length}` : '0 / 0'}
          </span>
        </div>
      </div>

      {/* Collapsible Visual Timeline Debugger */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-[#FBFAF5]">
        <div className="px-3.5 py-2 border-b border-[#E7E2D8] flex items-center justify-between bg-white">
          <button
            onClick={() => setDebuggerOpen(!debuggerOpen)}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#171513] cursor-pointer"
          >
            {debuggerOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            时间轴与故事状态调试
          </button>
          {Object.keys(previewOverrides).length > 0 && (
            <button
              onClick={resetPreviewOverrides}
              className="text-[11px] text-[#FF5A3D] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw size={11} />
              恢复初始状态
            </button>
          )}
        </div>

        {debuggerOpen && (
          <>
            <div className="px-3 py-1.5 border-b border-[#E7E2D8] flex items-center gap-1 bg-[#FBFAF5]">
              {[
                { id: 'vars' as const, label: '故事状态', icon: Sliders },
                { id: 'route' as const, label: '路线轨迹', icon: GitBranch },
                { id: 'stack' as const, label: '调用层级', icon: Layers },
                { id: 'snapshots' as const, label: '步骤快照', icon: Clock },
              ].map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setDebugTab(t.id)}
                    className={`px-2 py-1 rounded text-[11.5px] inline-flex items-center gap-1 cursor-pointer ${
                      debugTab === t.id
                        ? 'bg-[#FFF1ED] text-[#FF5A3D] font-medium'
                        : 'text-[#706A60] hover:bg-[#EFECE3]'
                    }`}
                  >
                    <Icon size={12} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto paper-scroll p-3">
              {debugTab === 'vars' && (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-[#706A60] mb-0.5">
                    临时调整下方数值可立即测试不同条件分支的显示与解锁效果：
                  </div>
                  {project.variables.length === 0 ? (
                    <div className="text-[12px] text-[#948D82] py-4 text-center">
                      尚未创建故事状态，可在「角色与状态」中添加。
                    </div>
                  ) : (
                    project.variables.map((v) => {
                      const val =
                        previewMode === 'mirror' && liveRenpy.running && liveRenpy.variables[v.id] !== undefined
                          ? liveRenpy.variables[v.id]
                          : stage?.variables[v.id] ?? v.initialValue;
                      return (
                        <div
                          key={v.id}
                          className="p-2.5 rounded-md border border-[#E7E2D8] bg-white flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-medium text-[#171513] truncate">
                              {v.name}
                            </div>
                            <div className="text-[10.5px] text-[#948D82]">
                              {v.type === 'number' ? '数字' : v.type === 'boolean' ? '开关' : '文字'}
                              {v.persistent ? ' · 跨周目持久' : ''}
                            </div>
                          </div>
                          {v.type === 'number' ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setPreviewOverride(v.id, Number(val) - 1)}
                                className="paper-btn-secondary w-6 h-6 text-[12px] flex items-center justify-center"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                value={Number(val)}
                                onChange={(e) => setPreviewOverride(v.id, Number(e.target.value))}
                                className="paper-input w-14 text-center py-0.5 px-1 text-[12px]"
                              />
                              <button
                                onClick={() => setPreviewOverride(v.id, Number(val) + 1)}
                                className="paper-btn-secondary w-6 h-6 text-[12px] flex items-center justify-center"
                              >
                                +
                              </button>
                            </div>
                          ) : v.type === 'boolean' ? (
                            <button
                              onClick={() => setPreviewOverride(v.id, !Boolean(val))}
                              className={`px-2.5 py-1 rounded text-[11.5px] font-medium border cursor-pointer ${
                                Boolean(val)
                                  ? 'bg-[#EDF7F1] border-[#B6DFC7] text-[#2A7B50]'
                                  : 'bg-[#F3F0E8] border-[#D7D1C6] text-[#706A60]'
                              }`}
                            >
                              {Boolean(val) ? '已开启' : '未开启'}
                            </button>
                          ) : (
                            <input
                              type="text"
                              value={String(val)}
                              onChange={(e) => setPreviewOverride(v.id, e.target.value)}
                              className="paper-input w-28 py-0.5 px-2 text-[12px]"
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {debugTab === 'route' && (
                <div className="flex flex-col gap-1.5">
                  {activeSteps.length === 0 ? (
                    <div className="text-[12px] text-[#948D82] py-4 text-center">暂无执行轨迹</div>
                  ) : (
                    activeSteps
                      .filter((s, idx) => idx === 0 || s.sceneId !== activeSteps[idx - 1].sceneId || s.choiceTakenLabel)
                      .map((step, idx) => (
                        <button
                          key={`${step.blockId}_${idx}`}
                          onClick={() => handleScrub(step.index)}
                          className="text-left p-2 rounded border border-[#E7E2D8] bg-white hover:border-[#FF5A3D] cursor-pointer"
                        >
                          <div className="text-[12px] font-medium text-[#171513]">{step.sceneName}</div>
                          {step.choiceTakenLabel && (
                            <div className="text-[11px] text-[#FF5A3D] mt-0.5">
                              经由选择：{step.choiceTakenLabel}
                            </div>
                          )}
                        </button>
                      ))
                  )}
                </div>
              )}

              {debugTab === 'stack' && (
                <div className="flex flex-col gap-1.5">
                  {(currentStep?.callStack ?? [currentSceneObj?.name || '当前场景']).map((name, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-2 rounded border border-[#E7E2D8] bg-white text-[12px] flex items-center justify-between"
                    >
                      <span>{name}</span>
                      <span className="text-[10.5px] text-[#948D82]">
                        {idx === 0 ? '主线层级' : `公共剧情第 ${idx} 层`}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {debugTab === 'snapshots' && (
                <div className="flex flex-col gap-1">
                  {activeSteps.map((step, idx) => (
                    <button
                      key={`${step.blockId}_${idx}`}
                      onClick={() => handleScrub(idx)}
                      className={`text-left px-2.5 py-1.5 rounded text-[11.5px] border cursor-pointer flex items-center gap-2 ${
                        idx === scrubIndex
                          ? 'bg-[#FFF1ED] border-[#FBCBC1] text-[#171513] font-medium'
                          : 'bg-white border-[#E7E2D8] text-[#565149] hover:border-[#D7D1C6]'
                      }`}
                    >
                      <span className="text-[10.5px] text-[#948D82] w-5 shrink-0">#{idx + 1}</span>
                      <span className="truncate">{step.summary}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
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

/**
 * Renders visual rich text markers ({b}...{/b}, {color=#...}...{/color}, {size=+6}...{/size}) cleanly inside Preview!
 */
function renderRichTextPreview(text: string): React.ReactNode {
  // Strip typing speed markers cleanly for static preview
  const cleaned = text.replace(/\{\/?cps(?:=[^}]*)?\}/g, '');
  const parts: React.ReactNode[] = [];
  const regex = /\{(b|i|color=#[0-9a-fA-F]{3,6}|size=[+-]?\d+)\}([\s\S]*?)\{\/(b|i|color|size)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{cleaned.slice(lastIndex, match.index)}</span>);
    }
    const openTag = match[1];
    const inner = match[2];
    if (openTag === 'b') {
      parts.push(<strong key={key++}>{inner}</strong>);
    } else if (openTag === 'i') {
      parts.push(<em key={key++}>{inner}</em>);
    } else if (openTag.startsWith('color=')) {
      parts.push(<span key={key++} style={{ color: openTag.slice(6) }}>{inner}</span>);
    } else if (openTag.startsWith('size=')) {
      const delta = Number(openTag.slice(5));
      parts.push(
        <span key={key++} style={{ fontSize: delta > 0 ? '1.18em' : '0.88em' }}>
          {inner}
        </span>
      );
    } else {
      parts.push(<span key={key++}>{inner}</span>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < cleaned.length) {
    parts.push(<span key={key++}>{cleaned.slice(lastIndex)}</span>);
  }
  return parts.length > 0 ? parts : cleaned;
}

const ParticleOverlay: React.FC<{ preset: ParticlePreset; intensity: number }> = ({
  preset,
  intensity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const count = Math.round(28 * Math.max(0.3, intensity));
    const particles = Array.from({ length: count }, () => ({
      x: Math.random() * 400,
      y: Math.random() * 225,
      vx: preset === 'rain' ? -1.5 : (Math.random() - 0.5) * 1.2,
      vy: preset === 'rain' ? 7 : preset === 'sparkles' ? -0.8 : 0.9 + Math.random() * 1.2,
      size: preset === 'rain' ? 10 : 3 + Math.random() * 3,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
        if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;

        ctx.fillStyle =
          preset === 'rain'
            ? 'rgba(207, 232, 255, 0.65)'
            : preset === 'petals'
            ? 'rgba(255, 183, 197, 0.85)'
            : preset === 'leaves'
            ? 'rgba(217, 119, 54, 0.85)'
            : preset === 'sparkles'
            ? 'rgba(255, 232, 153, 0.85)'
            : 'rgba(255, 255, 255, 0.82)';

        if (preset === 'rain') {
          ctx.fillRect(p.x, p.y, 1.3, p.size);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [preset, intensity]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={225}
      className="absolute inset-0 w-full h-full pointer-events-none z-10"
    />
  );
};
