import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  FolderPlus,
  FilePlus2,
  Trash2,
  EyeOff,
  Eye,
  Flag,
  LayoutList,
  FileText,
  GitBranch,
  Mic,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  X,
} from 'lucide-react';
import type { ChoiceBlock, DialogueBlock, Scene, StoryBlock } from '@shared/types';
import { analyzeProjectIssues, createId, isSceneEffectivelyDisabled } from '@shared/defaults';
import { useAppStore } from '../../store/useAppStore';
import { BlockCard } from './BlockCard';
import { AddContentDrawer } from './AddContentDrawer';
import { PlainTextScriptView } from './PlainTextScriptView';
import { StoryFlowchartView } from './StoryFlowchartView';
import { StagePreviewPane } from './StagePreviewPane';
import { ConditionEditor, StateEffectsEditor } from './ConditionAndEffectEditors';

const PAGE_SIZE = 20;

export const StoryWorkbench: React.FC = () => {
  const {
    project,
    missingAssetIds,
    activeSceneId,
    selectedBlockId,
    storyViewMode,
    editingChoiceTarget,
    setActiveSceneId,
    setSelectedBlockId,
    setStoryViewMode,
    openChoiceOptionEditor,
    clearChoiceOptionEditor,
    mutateProject,
    setAsrModalOpen,
    pushToast,
  } = useAppStore();

  // Search & multi-filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCharId, setFilterCharId] = useState<string>('all');
  const [filterErrorsOnly, setFilterErrorsOnly] = useState(false);

  // Pagination & Cross-Page-Safe Dialogue Collapse
  const [page, setPage] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [autoFocusBlockId, setAutoFocusBlockId] = useState<string | null>(null);

  // Slide-over Add Content Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInsertIndex, setDrawerInsertIndex] = useState(0);

  // Drag reorder state
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);

  // New Scene Explicit Connection Modal (Req 2.2: prevents silent unreachable scenes!)
  const [newSceneModalOpen, setNewSceneModalOpen] = useState(false);
  const [newSceneName, setNewSceneName] = useState('');
  const [newSceneChapterId, setNewSceneChapterId] = useState<string>('');
  const [newSceneLinkMode, setNewSceneLinkMode] = useState<'after_current' | 'as_choice_branch' | 'unconnected'>('after_current');
  const [newSceneBranchLabel, setNewSceneBranchLabel] = useState('');

  // Chapter rename / create inline
  const [newChapterName, setNewChapterName] = useState('');
  const [addingChapter, setAddingChapter] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const activeScene = useMemo(
    () => project?.scenes.find((s) => s.id === activeSceneId) ?? project?.scenes[0] ?? null,
    [project, activeSceneId]
  );

  // Compute error block IDs for quick error filtering
  const errorBlockIds = useMemo(() => {
    if (!project) return new Set<string>();
    const issues = analyzeProjectIssues(project, new Set(missingAssetIds));
    return new Set(issues.map((i) => i.blockId).filter((x): x is string => Boolean(x)));
  }, [project, missingAssetIds]);

  // Reset pagination when scene changes (or jump to page containing selectedBlockId) AND scroll selected card into view (Req 3.2)!
  useEffect(() => {
    if (!activeScene || !selectedBlockId) {
      setPage(0);
      return;
    }
    const idx = activeScene.blocks.findIndex((b) => b.id === selectedBlockId);
    if (idx >= 0) {
      setPage(Math.floor(idx / PAGE_SIZE));
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-testid="story-card-${selectedBlockId}"]`);
        if (el && typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }, [activeScene?.id, selectedBlockId]);

  if (!project || !activeScene) return null;

  // Compute filtered block list with original indices preserved
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return activeScene.blocks
      .map((blk, origIdx) => ({ blk, origIdx }))
      .filter(({ blk }) => {
        if (filterErrorsOnly && !errorBlockIds.has(blk.id)) return false;
        if (filterType !== 'all') {
          if (filterType === 'visual' && !['background', 'sprite', 'multilayer_stage', 'camera_fx', 'video', 'cg_unlock'].includes(blk.type)) return false;
          else if (filterType === 'audio' && blk.type !== 'audio') return false;
          else if (filterType === 'logic' && !['choice', 'condition_branch', 'state_change', 'flow'].includes(blk.type)) return false;
          else if (filterType === 'dialogue' && blk.type !== 'dialogue') return false;
        }
        if (filterCharId !== 'all') {
          const matchesSpeaker = blk.type === 'dialogue' && blk.speakerId === filterCharId;
          const matchesSprite = blk.type === 'sprite' && blk.characterId === filterCharId;
          if (!matchesSpeaker && !matchesSprite) return false;
        }
        if (q) {
          const textBlob = JSON.stringify(blk).toLowerCase();
          if (!textBlob.includes(q)) return false;
        }
        return true;
      });
  }, [activeScene.blocks, searchQuery, filterType, filterCharId, filterErrorsOnly, errorBlockIds]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = filteredEntries.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Build consecutive dialogue collapse runs inside the full scene, and render CROSS-PAGE-SAFE banners!
  // Requirement 2.3: Even when a collapsed group spans across page boundaries, EVERY page overlapping
  // that group MUST display an expandable summary banner — NEVER producing a blank page!
  const dialogueRuns = useMemo(() => {
    const runByBlockId = new Map<string, { groupId: string; startIdx: number; endIdx: number; count: number; preview: string }>();
    let i = 0;
    while (i < activeScene.blocks.length) {
      if (activeScene.blocks[i].type === 'dialogue') {
        const start = i;
        while (i < activeScene.blocks.length && activeScene.blocks[i].type === 'dialogue') {
          i += 1;
        }
        const count = i - start;
        if (count >= 3) {
          const first = activeScene.blocks[start] as DialogueBlock;
          const groupId = `run_${activeScene.id}_${first.id}`;
          const info = {
            groupId,
            startIdx: start,
            endIdx: i - 1,
            count,
            preview: first.text.slice(0, 32) || '连续对白段落',
          };
          for (let k = start; k < i; k += 1) {
            runByBlockId.set(activeScene.blocks[k].id, info);
          }
        }
      } else {
        i += 1;
      }
    }
    return runByBlockId;
  }, [activeScene.id, activeScene.blocks]);

  const toggleCollapseAllDialogues = () => {
    const allGroupIds = new Set([...dialogueRuns.values()].map((r) => r.groupId));
    if (allGroupIds.size === 0) {
      pushToast('info', '当前场景暂无超过 3 句的连续对白可折叠');
      return;
    }
    const anyExpanded = [...allGroupIds].some((gid) => !collapsedGroups[gid]);
    const next: Record<string, boolean> = { ...collapsedGroups };
    for (const gid of allGroupIds) next[gid] = anyExpanded;
    setCollapsedGroups(next);
  };

  // Block CRUD Helpers
  const updateBlock = (blockId: string, nextBlock: StoryBlock, coalesceKey?: string) => {
    mutateProject(
      (draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        const idx = sc.blocks.findIndex((b) => b.id === blockId);
        if (idx >= 0) sc.blocks[idx] = nextBlock;
      },
      coalesceKey ? { coalesceKey } : undefined
    );
  };

  const insertBlockAt = (block: StoryBlock, insertIdx: number, focusAfter = false) => {
    mutateProject((draft) => {
      const sc = draft.scenes.find((s) => s.id === activeScene.id);
      if (!sc) return;
      const clamped = Math.max(0, Math.min(sc.blocks.length, insertIdx));
      sc.blocks.splice(clamped, 0, block);
    });
    setSelectedBlockId(block.id);
    if (focusAfter) setAutoFocusBlockId(block.id);
    setPage(Math.floor(insertIdx / PAGE_SIZE));
  };

  const deleteBlock = (blockId: string) => {
    mutateProject(
      (draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc) return;
        sc.blocks = sc.blocks.filter((b) => b.id !== blockId);
      },
      { milestoneLabel: `删除「${activeScene.name}」剧情项前` }
    );
  };

  const duplicateBlock = (block: StoryBlock, idx: number) => {
    const clone = structuredClone(block);
    clone.id = createId('blk');
    insertBlockAt(clone, idx + 1);
  };

  const moveBlockToIndex = (fromIdx: number, toIdx: number) => {
    mutateProject(
      (draft) => {
        const sc = draft.scenes.find((s) => s.id === activeScene.id);
        if (!sc || fromIdx < 0 || fromIdx >= sc.blocks.length) return;
        const [item] = sc.blocks.splice(fromIdx, 1);
        const clamped = Math.max(0, Math.min(sc.blocks.length, toIdx));
        sc.blocks.splice(clamped, 0, item);
      },
      { milestoneLabel: '调整剧情卡片顺序前' }
    );
  };

  const handleMultiLinePasteAt = (afterIndex: number, lines: string[]) => {
    const charByName = new Map(project.characters.map((c) => [c.name, c.id]));
    const newBlocks: DialogueBlock[] = lines.map((line) => {
      const colonIdx = line.search(/[：:]/);
      let speakerId: string | null = null;
      let text = line;
      if (colonIdx > 0 && colonIdx <= 14) {
        const maybe = line.slice(0, colonIdx).trim();
        if (charByName.has(maybe)) {
          speakerId = charByName.get(maybe)!;
          text = line.slice(colonIdx + 1).trim();
        }
      }
      return { id: createId('blk'), type: 'dialogue', speakerId, text };
    });
    mutateProject((draft) => {
      const sc = draft.scenes.find((s) => s.id === activeScene.id);
      if (!sc) return;
      sc.blocks.splice(afterIndex + 1, 0, ...newBlocks);
    });
    pushToast('success', `已将粘贴的多行剧本自动拆分为 ${newBlocks.length} 句连续对白卡片`);
  };

  // Chapter & Scene Operations (Req 2.2)
  const handleCreateChapter = () => {
    const name = newChapterName.trim();
    if (!name) return;
    mutateProject((draft) => {
      draft.chapters.push({
        id: createId('ch'),
        name,
        order: draft.chapters.length,
        collapsed: false,
        disabled: false,
      });
    });
    setNewChapterName('');
    setAddingChapter(false);
  };

  const handleDeleteChapter = (chapterId: string) => {
    mutateProject(
      (draft) => {
        draft.chapters = draft.chapters.filter((c) => c.id !== chapterId);
        // Preserve scenes when deleting a chapter (Req 2.2)
        const fallbackChId = draft.chapters[0]?.id ?? null;
        for (const sc of draft.scenes) {
          if (sc.chapterId === chapterId) sc.chapterId = fallbackChId;
        }
      },
      { milestoneLabel: '删除章节前（保留场景）' }
    );
    pushToast('info', '已删除章节，章节内的所有场景均已自动保留。');
  };

  const handleOpenNewSceneModal = (defaultChId?: string | null) => {
    setNewSceneName(`新场景 ${project.scenes.length + 1}`);
    setNewSceneChapterId(defaultChId ?? activeScene.chapterId ?? project.chapters[0]?.id ?? '');
    setNewSceneLinkMode('after_current');
    setNewSceneBranchLabel('前往新分支');
    setNewSceneModalOpen(true);
  };

  const handleCreateSceneConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newSceneName.trim() || `场景 ${project.scenes.length + 1}`;
    const newId = createId('sc');
    const firstBlkId = createId('blk');

    mutateProject((draft) => {
      const newScene: Scene = {
        id: newId,
        chapterId: newSceneChapterId || null,
        name: title,
        order: draft.scenes.length,
        disabled: false,
        nextSceneId: null,
        blocks: [
          {
            id: firstBlkId,
            type: 'dialogue',
            speakerId: null,
            text: `在这里开始编写「${title}」的剧情。`,
          },
        ],
      };
      draft.scenes.push(newScene);

      const cur = draft.scenes.find((s) => s.id === activeScene.id);
      if (cur) {
        if (newSceneLinkMode === 'after_current') {
          // Preserve existing downstream chain so creating a scene after current NEVER orphans oldNext!
          if (cur.nextSceneId) {
            newScene.nextSceneId = cur.nextSceneId;
          }
          cur.nextSceneId = newId;
        } else if (newSceneLinkMode === 'as_choice_branch') {
          const existingChoice = [...cur.blocks].reverse().find((b): b is ChoiceBlock => b.type === 'choice');
          const optLabel = newSceneBranchLabel.trim() || `前往「${title}」`;
          if (existingChoice) {
            existingChoice.options.push({
              id: createId('opt'),
              label: optLabel,
              lockedBehavior: 'hide',
              effects: [],
              targetType: 'scene',
              targetSceneId: newId,
            });
          } else {
            cur.blocks.push({
              id: createId('blk'),
              type: 'choice',
              prompt: '你要去哪里？',
              options: [
                {
                  id: createId('opt'),
                  label: optLabel,
                  lockedBehavior: 'hide',
                  effects: [],
                  targetType: 'scene',
                  targetSceneId: newId,
                },
              ],
            });
          }
        }
      }
    }, { immediateSave: true });

    setNewSceneModalOpen(false);
    void setActiveSceneId(newId, firstBlkId);
    pushToast(
      'success',
      newSceneLinkMode === 'after_current'
        ? `已创建「${title}」并自动衔接在「${activeScene.name}」之后`
        : newSceneLinkMode === 'as_choice_branch'
        ? `已创建「${title}」并挂接为分支选项`
        : `已创建独立场景「${title}」`
    );
  };

  const handleDeleteScene = (sceneId: string) => {
    if (project.scenes.length <= 1) {
      pushToast('warning', '游戏至少需要保留一个场景');
      return;
    }
    const target = project.scenes.find((s) => s.id === sceneId);
    mutateProject(
      (draft) => {
        draft.scenes = draft.scenes.filter((s) => s.id !== sceneId);
        if (draft.meta.startSceneId === sceneId && draft.scenes[0]) {
          draft.meta.startSceneId = draft.scenes[0].id;
        }
      },
      { milestoneLabel: `删除场景「${target?.name ?? ''}」前` }
    );
    if (activeSceneId === sceneId) {
      const fallback = project.scenes.find((s) => s.id !== sceneId);
      void setActiveSceneId(fallback?.id ?? null);
    }
  };

  const moveChapterOrder = (idx: number, delta: -1 | 1) => {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= project.chapters.length) return;
    mutateProject(
      (draft) => {
        const [item] = draft.chapters.splice(idx, 1);
        draft.chapters.splice(nextIdx, 0, item);
        draft.chapters.forEach((c, i) => (c.order = i));
      },
      { milestoneLabel: '调整章节排序前' }
    );
  };

  const moveSceneOrder = (sceneId: string, delta: -1 | 1) => {
    const targetScene = project.scenes.find((s) => s.id === sceneId);
    if (!targetScene) return;
    // Swap cleanly within the same chapter so clicking up/down ALWAYS moves visibly!
    const siblingIds = project.scenes
      .filter((s) => s.chapterId === targetScene.chapterId)
      .map((s) => s.id);
    const sibPos = siblingIds.indexOf(sceneId);
    const nextSibPos = sibPos + delta;
    if (sibPos < 0 || nextSibPos < 0 || nextSibPos >= siblingIds.length) return;
    const swapPartnerId = siblingIds[nextSibPos];
    mutateProject(
      (draft) => {
        const i1 = draft.scenes.findIndex((s) => s.id === sceneId);
        const i2 = draft.scenes.findIndex((s) => s.id === swapPartnerId);
        if (i1 < 0 || i2 < 0) return;
        const tmp = draft.scenes[i1];
        draft.scenes[i1] = draft.scenes[i2];
        draft.scenes[i2] = tmp;
        draft.scenes.forEach((s, i) => (s.order = i));
      },
      { milestoneLabel: `调整场景「${targetScene.name}」排序前` }
    );
  };

  const openDrawerAt = (idx: number) => {
    setDrawerInsertIndex(idx);
    setDrawerOpen(true);
  };

  const handleJumpFromPreviewOrFlow = (sceneId: string, blockId: string) => {
    if (storyViewMode === 'flow') setStoryViewMode('cards');
    void setActiveSceneId(sceneId, blockId);
  };

  // Render list of page items with CROSS-PAGE-SAFE collapsed summary banners
  const renderedCardNodes: React.ReactNode[] = [];
  const emittedCollapsedGroupsOnPage = new Set<string>();

  pageSlice.forEach(({ blk, origIdx }, localIdx) => {
    const run = dialogueRuns.get(blk.id);
    const isCollapsedRun = Boolean(run && collapsedGroups[run.groupId]);

    if (isCollapsedRun && run) {
      if (!emittedCollapsedGroupsOnPage.has(run.groupId)) {
        emittedCollapsedGroupsOnPage.add(run.groupId);
        const spansPrevPage = run.startIdx < pageSlice[0].origIdx;
        const spansNextPage = run.endIdx > pageSlice[pageSlice.length - 1].origIdx;
        renderedCardNodes.push(
          <div
            key={`collapsed_${run.groupId}_p${safePage}`}
            data-testid={`collapsed-banner-${run.groupId}`}
            className="paper-card px-3.5 py-2.5 bg-[#FBFAF5] border-dashed border-[#C7C0B2] flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-[#171513] flex items-center gap-2">
                <span>
                  已折叠 {run.count} 句连续对白（#{run.startIdx + 1} – #{run.endIdx + 1}）
                </span>
                {(spansPrevPage || spansNextPage) && (
                  <span className="text-[10.5px] px-1.5 py-0.5 rounded bg-[#FFF1ED] text-[#FF5A3D]">
                    跨页续接
                  </span>
                )}
              </div>
              <div className="text-[11.5px] text-[#706A60] truncate mt-0.5">
                摘要：{run.preview}…
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                setCollapsedGroups((prev) => ({ ...prev, [run.groupId]: false }))
              }
              className="paper-btn-secondary px-2.5 py-1 text-[12px] shrink-0"
            >
              展开此段
            </button>
          </div>
        );
      }
      return;
    }

    // Optional single-group collapse header at start of a >=3 dialogue run
    if (run && origIdx === run.startIdx && !collapsedGroups[run.groupId]) {
      renderedCardNodes.push(
        <div key={`run_hdr_${run.groupId}`} className="flex items-center justify-between px-1 -mb-1">
          <span className="text-[11px] text-[#948D82]">
            连续对白段落（共 {run.count} 句）
          </span>
          <button
            type="button"
            onClick={() => setCollapsedGroups((prev) => ({ ...prev, [run.groupId]: true }))}
            className="text-[11px] text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
          >
            一键折叠此段
          </button>
        </div>
      );
    }

    renderedCardNodes.push(
      <div key={blk.id} className="flex flex-col">
        {/* Hover/Click Between-Card Insertion Line (Req 2.3) */}
        <div className="group h-4 flex items-center justify-center relative my-0.5">
          <div className="w-full h-[1px] bg-transparent group-hover:bg-[#FF5A3D]/40 transition-colors" />
          <button
            type="button"
            data-testid={`insert-between-${origIdx}`}
            onClick={() => openDrawerAt(origIdx)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 absolute px-2 py-0.5 rounded-full bg-[#FFF1ED] border border-[#FBCBC1] text-[#FF5A3D] text-[10.5px] font-medium inline-flex items-center gap-1 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus size={11} /> 在此处添加
          </button>
        </div>

        <BlockCard
          block={blk}
          index={origIdx}
          totalBlocks={activeScene.blocks.length}
          sceneId={activeScene.id}
          project={project}
          isSelected={selectedBlockId === blk.id}
          hasError={errorBlockIds.has(blk.id)}
          autoFocusTrigger={autoFocusBlockId === blk.id}
          onSelect={() => setSelectedBlockId(blk.id)}
          onUpdate={(next, coalesceKey) => updateBlock(blk.id, next, coalesceKey)}
          onDelete={() => deleteBlock(blk.id)}
          onDuplicate={() => duplicateBlock(blk, origIdx)}
          onMoveToIndex={(targetIdx) => moveBlockToIndex(origIdx, targetIdx)}
          onEnterContinueDialogue={(speakerId, nvlMode) => {
            const newBlk: DialogueBlock = {
              id: createId('blk'),
              type: 'dialogue',
              speakerId,
              nvlMode,
              text: '',
            };
            insertBlockAt(newBlk, origIdx + 1, true);
          }}
          onMultiLinePaste={(lines) => handleMultiLinePasteAt(origIdx, lines)}
          onDragStart={() => setDragBlockId(blk.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!dragBlockId || dragBlockId === blk.id) return;
            const fromIdx = activeScene.blocks.findIndex((b) => b.id === dragBlockId);
            if (fromIdx >= 0) moveBlockToIndex(fromIdx, origIdx);
            setDragBlockId(null);
          }}
        />
      </div>
    );

    if (localIdx === pageSlice.length - 1) {
      renderedCardNodes.push(
        <div key="insert_tail" className="pt-2 pb-6 flex items-center justify-center gap-2">
          <button
            type="button"
            data-testid="append-dialogue-btn"
            onClick={() => {
              const lastDlg = [...activeScene.blocks].reverse().find((b): b is DialogueBlock => b.type === 'dialogue');
              const newBlk: DialogueBlock = {
                id: createId('blk'),
                type: 'dialogue',
                speakerId: lastDlg?.speakerId ?? project.characters[0]?.id ?? null,
                text: '',
              };
              insertBlockAt(newBlk, activeScene.blocks.length, true);
            }}
            className="paper-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> 续写下一句对白
          </button>
          <button
            type="button"
            data-testid="open-add-drawer-btn"
            onClick={() => openDrawerAt(activeScene.blocks.length)}
            className="paper-btn-primary px-4 py-2 text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> 添加剧情 / 画面 / 分支
          </button>
        </div>
      );
    }
  });

  // Lookup choice option if Flowchart Edge Choice Modal is open
  const choiceModalContext = (() => {
    if (!editingChoiceTarget) return null;
    const sc = project.scenes.find((s) => s.id === editingChoiceTarget.sceneId);
    const blk = sc?.blocks.find((b) => b.id === editingChoiceTarget.blockId);
    if (!sc || !blk || blk.type !== 'choice') return null;
    const opt = blk.options.find((o) => o.id === editingChoiceTarget.optionId);
    if (!opt) return null;
    return { sc, blk, opt };
  })();

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* COLUMN 1: Chapter & Scene Outline (256px) */}
      <aside className="w-[252px] shrink-0 h-full bg-[#FBFAF5] border-r border-[#D7D1C6] flex flex-col overflow-hidden">
        <div className="p-3 border-b border-[#E7E2D8] flex items-center justify-between bg-white">
          <span className="font-semibold text-[13px] text-[#171513]">章节与场景大纲</span>
          <div className="flex items-center gap-1">
            <button
              title="新建章节"
              onClick={() => setAddingChapter(true)}
              className="p-1.5 rounded hover:bg-[#EFECE3] text-[#565149] cursor-pointer"
            >
              <FolderPlus size={14} />
            </button>
            <button
              data-testid="outline-new-scene-btn"
              title="新建场景"
              onClick={() => handleOpenNewSceneModal()}
              className="p-1.5 rounded bg-[#FFF1ED] text-[#FF5A3D] hover:bg-[#FF5A3D] hover:text-white cursor-pointer"
            >
              <FilePlus2 size={14} />
            </button>
          </div>
        </div>

        {/* Inline Add Chapter Input */}
        {addingChapter && (
          <div className="p-2.5 border-b border-[#E7E2D8] bg-[#FFF1ED]/40 flex gap-1.5">
            <input
              type="text"
              autoFocus
              value={newChapterName}
              onChange={(e) => setNewChapterName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateChapter()}
              placeholder="输入章节名…"
              className="paper-input flex-1 py-1 text-[12px]"
            />
            <button onClick={handleCreateChapter} className="paper-btn-primary px-2.5 text-[11.5px]">
              确定
            </button>
          </div>
        )}

        {/* Chapters & Scenes Tree */}
        <div className="flex-1 overflow-y-auto paper-scroll p-2 flex flex-col gap-2">
          {project.chapters.map((ch, chIdx) => {
            const chScenes = project.scenes.filter((s) => s.chapterId === ch.id);
            return (
              <div key={ch.id} className="rounded-md border border-[#E7E2D8] bg-white overflow-hidden">
                <div className="group px-2 py-1.5 bg-[#F8F6F0] border-b border-[#EFECE3] flex items-center justify-between gap-1">
                  <button
                    onClick={() =>
                      mutateProject((d) => {
                        const target = d.chapters.find((x) => x.id === ch.id);
                        if (target) target.collapsed = !target.collapsed;
                      }, { skipUndo: true })
                    }
                    className="flex items-center gap-1 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {ch.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    {renamingId === ch.id ? (
                      <input
                        autoFocus
                        value={renameText}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={() => {
                          if (renameText.trim() && renameText.trim() !== ch.name) {
                            mutateProject(
                              (d) => {
                                const t = d.chapters.find((x) => x.id === ch.id);
                                if (t) t.name = renameText.trim();
                              },
                              { milestoneLabel: `重命名章节「${ch.name}」前` }
                            );
                          }
                          setRenamingId(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        className="paper-input py-0 px-1 text-[12px] w-full"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(ch.id);
                          setRenameText(ch.name);
                        }}
                        className={`text-[12px] font-semibold truncate ${
                          ch.disabled ? 'line-through text-[#948D82]' : 'text-[#171513]'
                        }`}
                        title="双击重命名章节"
                      >
                        {ch.name}
                      </span>
                    )}
                  </button>

                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                    <button
                      title="上移章节"
                      onClick={() => moveChapterOrder(chIdx, -1)}
                      className="p-0.5 text-[#706A60] hover:text-[#171513] cursor-pointer"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <button
                      title="下移章节"
                      onClick={() => moveChapterOrder(chIdx, 1)}
                      className="p-0.5 text-[#706A60] hover:text-[#171513] cursor-pointer"
                    >
                      <ArrowDown size={11} />
                    </button>
                    <button
                      title={ch.disabled ? '重新启用章节' : '临时软停用章节（不参与运行与统计）'}
                      onClick={() =>
                        mutateProject((d) => {
                          const t = d.chapters.find((x) => x.id === ch.id);
                          if (t) t.disabled = !t.disabled;
                        })
                      }
                      className="p-0.5 text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
                    >
                      {ch.disabled ? <Eye size={11} /> : <EyeOff size={11} />}
                    </button>
                    <button
                      title="删除章节（保留场景）"
                      onClick={() => handleDeleteChapter(ch.id)}
                      className="p-0.5 text-[#706A60] hover:text-[#C93B2B] cursor-pointer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>

                {!ch.collapsed && (
                  <div className="p-1 flex flex-col gap-0.5">
                    {chScenes.length === 0 ? (
                      <div className="px-2 py-2 text-[11px] text-[#948D82] text-center">
                        暂无场景
                      </div>
                    ) : (
                      chScenes.map((sc) => {
                        const isCur = sc.id === activeScene.id;
                        const isStart = sc.id === project.meta.startSceneId;
                        const effDisabled = isSceneEffectivelyDisabled(project, sc);
                        return (
                          <div
                            key={sc.id}
                            data-testid={`scene-item-${sc.id}`}
                            onClick={() => void setActiveSceneId(sc.id)}
                            className={`group px-2 py-1.5 rounded text-[12.5px] flex items-center justify-between gap-1 cursor-pointer ${
                              isCur
                                ? 'bg-[#FFF1ED] text-[#171513] font-medium'
                                : 'text-[#565149] hover:bg-[#F3F0E8]'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {isStart && (
                                <span
                                  title="开场场景"
                                  className="w-1.5 h-1.5 rounded-full bg-[#FF5A3D] shrink-0"
                                />
                              )}
                              {renamingId === sc.id ? (
                                <input
                                  autoFocus
                                  value={renameText}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setRenameText(e.target.value)}
                                  onBlur={() => {
                                    if (renameText.trim() && renameText.trim() !== sc.name) {
                                      mutateProject(
                                        (d) => {
                                          const t = d.scenes.find((x) => x.id === sc.id);
                                          if (t) t.name = renameText.trim();
                                        },
                                        { milestoneLabel: `重命名场景「${sc.name}」前` }
                                      );
                                    }
                                    setRenamingId(null);
                                  }}
                                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                  className="paper-input py-0 px-1 text-[12px] w-full"
                                />
                              ) : (
                                <span
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingId(sc.id);
                                    setRenameText(sc.name);
                                  }}
                                  className={`truncate ${effDisabled ? 'line-through opacity-55' : ''}`}
                                  title="双击重命名场景"
                                >
                                  {sc.name}
                                </span>
                              )}
                              <span className="text-[10.5px] text-[#948D82] shrink-0">
                                ({sc.blocks.length})
                              </span>
                            </div>

                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                              <button
                                title="上移"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveSceneOrder(sc.id, -1);
                                }}
                                className="p-0.5 text-[#706A60] hover:text-[#171513] cursor-pointer"
                              >
                                <ArrowUp size={11} />
                              </button>
                              <button
                                title="下移"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveSceneOrder(sc.id, 1);
                                }}
                                className="p-0.5 text-[#706A60] hover:text-[#171513] cursor-pointer"
                              >
                                <ArrowDown size={11} />
                              </button>
                              {!isStart && (
                                <button
                                  title="设为开场场景"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    mutateProject((d) => {
                                      d.meta.startSceneId = sc.id;
                                    });
                                    pushToast('success', `已将「${sc.name}」设为游戏开场场景`);
                                  }}
                                  className="p-0.5 text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
                                >
                                  <Flag size={11} />
                                </button>
                              )}
                              <button
                                title={sc.disabled ? '重新启用场景' : '临时软停用场景'}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  mutateProject((d) => {
                                    const t = d.scenes.find((x) => x.id === sc.id);
                                    if (t) t.disabled = !t.disabled;
                                  });
                                }}
                                className="p-0.5 text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
                              >
                                {sc.disabled ? <Eye size={11} /> : <EyeOff size={11} />}
                              </button>
                              <button
                                title="删除场景"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteScene(sc.id);
                                }}
                                className="p-0.5 text-[#706A60] hover:text-[#C93B2B] cursor-pointer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned scenes (if any after deleting chapters) */}
          {project.scenes.filter((s) => !s.chapterId || !project.chapters.some((c) => c.id === s.chapterId)).length > 0 && (
            <div className="rounded-md border border-[#E7E2D8] bg-white p-1.5 flex flex-col gap-0.5">
              <div className="text-[11px] font-semibold text-[#948D82] px-1.5 mb-1">未归属章节</div>
              {project.scenes
                .filter((s) => !s.chapterId || !project.chapters.some((c) => c.id === s.chapterId))
                .map((sc) => {
                  const isStart = sc.id === project.meta.startSceneId;
                  return (
                    <div
                      key={sc.id}
                      onClick={() => void setActiveSceneId(sc.id)}
                      className={`group w-full px-2 py-1.5 rounded text-[12.5px] flex items-center justify-between gap-1 cursor-pointer ${
                        sc.id === activeScene.id ? 'bg-[#FFF1ED] font-medium' : 'hover:bg-[#F3F0E8]'
                      }`}
                    >
                      <span className={`truncate ${sc.disabled ? 'line-through opacity-55' : ''}`}>
                        {sc.name}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
                        {!isStart && (
                          <button
                            title="设为开场场景"
                            onClick={(e) => {
                              e.stopPropagation();
                              mutateProject((d) => {
                                d.meta.startSceneId = sc.id;
                              });
                            }}
                            className="p-0.5 text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
                          >
                            <Flag size={11} />
                          </button>
                        )}
                        <button
                          title={sc.disabled ? '重新启用' : '临时软停用'}
                          onClick={(e) => {
                            e.stopPropagation();
                            mutateProject((d) => {
                              const t = d.scenes.find((x) => x.id === sc.id);
                              if (t) t.disabled = !t.disabled;
                            });
                          }}
                          className="p-0.5 text-[#706A60] hover:text-[#FF5A3D] cursor-pointer"
                        >
                          {sc.disabled ? <Eye size={11} /> : <EyeOff size={11} />}
                        </button>
                        <button
                          title="删除场景"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteScene(sc.id);
                          }}
                          className="p-0.5 text-[#706A60] hover:text-[#C93B2B] cursor-pointer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Scene Connection & Chapter Assignment Footer */}
        <div className="p-2.5 border-t border-[#E7E2D8] bg-white flex flex-col gap-1.5 text-[11.5px]">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#706A60] shrink-0">所属章节</span>
            <select
              value={activeScene.chapterId ?? ''}
              onChange={(e) =>
                mutateProject((d) => {
                  const sc = d.scenes.find((s) => s.id === activeScene.id);
                  if (sc) sc.chapterId = e.target.value || null;
                })
              }
              className="paper-input py-0.5 px-1.5 text-[11.5px] flex-1 min-w-0"
            >
              <option value="">未分组</option>
              {project.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[#706A60] shrink-0">结束后前往</span>
            <select
              data-testid="scene-next-select"
              value={activeScene.nextSceneId ?? ''}
              onChange={(e) =>
                mutateProject((d) => {
                  const sc = d.scenes.find((s) => s.id === activeScene.id);
                  if (sc) sc.nextSceneId = e.target.value || null;
                })
              }
              className="paper-input py-0.5 px-1.5 text-[11.5px] flex-1 min-w-0"
            >
              <option value="">本场景结束</option>
              {project.scenes
                .filter((s) => s.id !== activeScene.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </aside>

      {/* COLUMN 2: Center Editor (Cards | Plain Text Script | Narrative Flowchart) */}
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-[#F3F0E8]">
        {/* Mode Switcher & Quick Toolbar */}
        <div className="px-4 py-2.5 border-b border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-[#EFECE3] p-0.5 rounded-md border border-[#D7D1C6]">
              {[
                { id: 'cards' as const, label: '卡片剧本', icon: LayoutList },
                { id: 'script' as const, label: '纯文本剧本', icon: FileText },
                { id: 'flow' as const, label: '选线流程图', icon: GitBranch },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    data-testid={`story-view-${m.id}`}
                    onClick={() => setStoryViewMode(m.id)}
                    className={`px-2.5 py-1 rounded text-[12px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      storyViewMode === m.id
                        ? 'bg-white text-[#171513] font-semibold shadow-xs'
                        : 'text-[#706A60] hover:text-[#171513]'
                    }`}
                  >
                    <Icon size={13} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              data-testid="open-asr-btn"
              onClick={() => setAsrModalOpen(true)}
              className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
              title="内置离线语音转文字并批量匹配语音"
            >
              <Mic size={13} className="text-[#FF5A3D]" />
              离线语音转剧本
            </button>

            {storyViewMode === 'cards' && (
              <>
                <button
                  data-testid="collapse-all-dlg-btn"
                  onClick={toggleCollapseAllDialogues}
                  className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1"
                  title="将连续多句对白一键折叠为摘要"
                >
                  <ChevronsUpDown size={13} />
                  折叠对白
                </button>
                <button
                  data-testid="header-add-content-btn"
                  onClick={() => {
                    const selIdx = selectedBlockId
                      ? activeScene.blocks.findIndex((b) => b.id === selectedBlockId)
                      : -1;
                    openDrawerAt(selIdx >= 0 ? selIdx + 1 : activeScene.blocks.length);
                  }}
                  className="paper-btn-primary px-3 py-1 text-[12px] inline-flex items-center gap-1"
                >
                  <Plus size={13} />
                  添加内容
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search & Multi-Dimensional Filter Bar (Card View) */}
        {storyViewMode === 'cards' && (
          <div className="px-4 py-2 border-b border-[#E7E2D8] bg-[#FBFAF5]/80 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#948D82]" />
              <input
                data-testid="story-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="搜索场景内的对白、选项或事件…"
                className="paper-input w-full pl-8 py-1 text-[12px]"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(0);
              }}
              className="paper-input py-1 px-2 text-[12px]"
            >
              <option value="all">全部事件类型</option>
              <option value="dialogue">仅看对白/旁白</option>
              <option value="logic">分支与状态</option>
              <option value="visual">背景/立绘/特效</option>
              <option value="audio">音乐与音效</option>
            </select>

            <select
              value={filterCharId}
              onChange={(e) => {
                setFilterCharId(e.target.value);
                setPage(0);
              }}
              className="paper-input py-1 px-2 text-[12px] max-w-[125px]"
            >
              <option value="all">全部角色</option>
              {project.characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              data-testid="in-scene-outline-jump"
              value=""
              onChange={(e) => {
                const blkId = e.target.value;
                if (!blkId) return;
                setSearchQuery('');
                setFilterType('all');
                setFilterCharId('all');
                setFilterErrorsOnly(false);
                setSelectedBlockId(blkId);
              }}
              className="paper-input py-1 px-2 text-[12px] max-w-[165px]"
              title="场景内大纲快速跳转"
            >
              <option value="">场景内大纲跳转…</option>
              {activeScene.blocks
                .map((b, i) => ({ b, i }))
                .filter(
                  ({ b, i }) =>
                    i === 0 ||
                    i === activeScene.blocks.length - 1 ||
                    b.type === 'background' ||
                    b.type === 'choice' ||
                    b.type === 'condition_branch' ||
                    b.type === 'multilayer_stage' ||
                    (b.type === 'flow' && ['ending', 'jump_scene', 'call_scene'].includes(b.action))
                )
                .map(({ b, i }) => {
                  const tag =
                    b.type === 'choice'
                      ? `选择：${b.prompt?.slice(0, 12) || `${b.options.length}选项`}`
                      : b.type === 'condition_branch'
                      ? '条件分支'
                      : b.type === 'background'
                      ? '切换背景'
                      : b.type === 'multilayer_stage'
                      ? '多层舞台'
                      : b.type === 'flow' && b.action === 'ending'
                      ? `结局：${b.endingTitle || '终章'}`
                      : b.type === 'dialogue'
                      ? b.text.slice(0, 14) || '对白'
                      : '节点';
                  return (
                    <option key={b.id} value={b.id}>
                      #{i + 1} {tag}
                    </option>
                  );
                })}
            </select>

            <label className="inline-flex items-center gap-1 text-[12px] text-[#706A60] cursor-pointer">
              <input
                type="checkbox"
                checked={filterErrorsOnly}
                onChange={(e) => setFilterErrorsOnly(e.target.checked)}
                className="accent-[#C93B2B]"
              />
              仅看错误项
            </label>
          </div>
        )}

        {/* Active Center View Body */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {storyViewMode === 'cards' && (
            <div className="h-full flex flex-col overflow-hidden">
              <div id="guie-main-scroll" className="flex-1 overflow-y-auto paper-scroll px-4 py-3 flex flex-col gap-1">
                {filteredEntries.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="text-[13.5px] text-[#706A60] mb-3">
                      {activeScene.blocks.length === 0
                        ? '这个场景还是空的，点击下方按钮开始添加第一句对白或画面。'
                        : '没有符合当前搜索或筛选条件的剧情卡片。'}
                    </div>
                    <button
                      onClick={() => openDrawerAt(activeScene.blocks.length)}
                      className="paper-btn-primary px-4 py-2 text-[12.5px] inline-flex items-center gap-1.5"
                    >
                      <Plus size={14} /> 添加剧情内容
                    </button>
                  </div>
                ) : (
                  renderedCardNodes
                )}
              </div>

              {/* Segmented Pagination Footer (for long scenes!) */}
              {totalPages > 1 && (
                <div className="px-4 py-2 border-t border-[#D7D1C6] bg-[#FBFAF5] flex items-center justify-between text-[12px]">
                  <span className="text-[#706A60]">
                    共 {filteredEntries.length} 项剧情 · 第 {safePage + 1} / {totalPages} 段
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      data-testid="page-prev-btn"
                      disabled={safePage <= 0}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1"
                    >
                      <ChevronLeft size={13} /> 上一段
                    </button>
                    <select
                      value={safePage}
                      onChange={(e) => setPage(Number(e.target.value))}
                      className="paper-input py-0.5 px-1.5 text-[11.5px]"
                      title="直接跳转到指定分段"
                    >
                      {Array.from({ length: totalPages }, (_, pi) => (
                        <option key={pi} value={pi}>
                          第 {pi + 1} 段 (#{pi * PAGE_SIZE + 1}–#{Math.min(filteredEntries.length, (pi + 1) * PAGE_SIZE)})
                        </option>
                      ))}
                    </select>
                    <button
                      data-testid="page-next-btn"
                      disabled={safePage >= totalPages - 1}
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      className="paper-btn-secondary px-2.5 py-1 text-[12px] inline-flex items-center gap-1"
                    >
                      下一段 <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {storyViewMode === 'script' && (
            <PlainTextScriptView
              scene={activeScene}
              project={project}
              onApplyBlocks={(nextBlocks) => {
                mutateProject(
                  (draft) => {
                    const sc = draft.scenes.find((s) => s.id === activeScene.id);
                    if (sc) sc.blocks = nextBlocks;
                  },
                  { immediateSave: true }
                );
              }}
            />
          )}

          {storyViewMode === 'flow' && (
            <StoryFlowchartView
              project={project}
              onJumpToSegment={handleJumpFromPreviewOrFlow}
              onEditChoiceEdge={(scId, blkId, optId) => void openChoiceOptionEditor(scId, blkId, optId)}
            />
          )}
        </div>
      </main>

      {/* COLUMN 3: Persistent Instant Game Preview & Visual Timeline Debugger */}
      <StagePreviewPane onJumpToCard={handleJumpFromPreviewOrFlow} />

      {/* Slide-Over Add Content Context Drawer (NEVER creates 4th column!) */}
      <AddContentDrawer
        open={drawerOpen}
        insertIndex={drawerInsertIndex}
        project={project}
        onClose={() => setDrawerOpen(false)}
        onInsertBlock={(block, idx) => insertBlockAt(block, idx, block.type === 'dialogue')}
      />

      {/* Explicit New Scene Connection Modal (Req 2.2) */}
      {newSceneModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSceneConfirm}
            className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-xl w-full max-w-[440px] overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
              <div className="font-semibold text-[14.5px]">新建场景并建立剧情连接</div>
              <button
                type="button"
                onClick={() => setNewSceneModalOpen(false)}
                className="p-1 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3.5 text-[12.5px]">
              <div>
                <label className="block font-medium mb-1">场景名称</label>
                <input
                  data-testid="new-scene-name-input"
                  type="text"
                  autoFocus
                  value={newSceneName}
                  onChange={(e) => setNewSceneName(e.target.value)}
                  className="paper-input w-full"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">所属章节</label>
                <select
                  value={newSceneChapterId}
                  onChange={(e) => setNewSceneChapterId(e.target.value)}
                  className="paper-input w-full"
                >
                  <option value="">不归属任何章节</option>
                  {project.chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium mb-1.5">如何接入剧情主线？（防止场景变成死胡同）</label>
                <div className="flex flex-col gap-2">
                  <label className="p-2.5 rounded border border-[#E7E2D8] bg-white flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="linkMode"
                      checked={newSceneLinkMode === 'after_current'}
                      onChange={() => setNewSceneLinkMode('after_current')}
                      className="mt-0.5 accent-[#FF5A3D]"
                    />
                    <div>
                      <div className="font-medium">自动接在当前场景「{activeScene.name}」之后（推荐）</div>
                      <div className="text-[11.5px] text-[#706A60]">当前场景播放完毕后自动进入此新场景</div>
                    </div>
                  </label>
                  <label className="p-2.5 rounded border border-[#E7E2D8] bg-white flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="linkMode"
                      checked={newSceneLinkMode === 'as_choice_branch'}
                      onChange={() => setNewSceneLinkMode('as_choice_branch')}
                      className="mt-0.5 accent-[#FF5A3D]"
                    />
                    <div className="flex-1">
                      <div className="font-medium">作为当前场景分支的一个新选项</div>
                      {newSceneLinkMode === 'as_choice_branch' && (
                        <input
                          type="text"
                          value={newSceneBranchLabel}
                          onChange={(e) => setNewSceneBranchLabel(e.target.value)}
                          placeholder="选项按钮文字"
                          className="paper-input w-full mt-1.5 py-1 text-[12px]"
                        />
                      )}
                    </div>
                  </label>
                  <label className="p-2.5 rounded border border-[#E7E2D8] bg-white flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="linkMode"
                      checked={newSceneLinkMode === 'unconnected'}
                      onChange={() => setNewSceneLinkMode('unconnected')}
                      className="mt-0.5 accent-[#FF5A3D]"
                    />
                    <div>
                      <div className="font-medium">暂不连接（稍后在选项或流程图中连接）</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#E7E2D8] bg-white flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewSceneModalOpen(false)}
                className="paper-btn-secondary px-3.5 py-1.5 text-[12.5px]"
              >
                取消
              </button>
              <button
                data-testid="new-scene-confirm-btn"
                type="submit"
                className="paper-btn-primary px-4 py-1.5 text-[12.5px]"
              >
                创建场景
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Flowchart Edge Direct Choice Option Editor Modal (Req 2.4) */}
      {choiceModalContext && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-xl w-full max-w-[540px] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
              <div className="font-semibold text-[14.5px]">
                编辑分支选项（来自「{choiceModalContext.sc.name}」）
              </div>
              <button
                onClick={clearChoiceOptionEditor}
                className="p-1 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium mb-1">选项文字</label>
                <input
                  type="text"
                  value={choiceModalContext.opt.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    mutateProject((d) => {
                      const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                      const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                      if (blk?.type === 'choice') {
                        const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                        if (o) o.label = val;
                      }
                    });
                  }}
                  className="paper-input w-full"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[12px] font-medium mb-1">触发方式</label>
                  <select
                    value={choiceModalContext.opt.targetType}
                    onChange={(e) => {
                      const val = e.target.value as 'scene' | 'continue' | 'call_scene' | 'ending';
                      mutateProject((d) => {
                        const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                        const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                        if (blk?.type === 'choice') {
                          const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                          if (o) o.targetType = val;
                        }
                      });
                    }}
                    className="paper-input w-full text-[12.5px]"
                  >
                    <option value="scene">前往场景</option>
                    <option value="continue">继续本场景</option>
                    <option value="call_scene">调用公共剧情</option>
                    <option value="ending">直接达成结局</option>
                  </select>
                </div>
                {(choiceModalContext.opt.targetType === 'scene' || choiceModalContext.opt.targetType === 'call_scene') && (
                  <div>
                    <label className="block text-[12px] font-medium mb-1">前往目标场景</label>
                    <select
                      value={choiceModalContext.opt.targetSceneId ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        mutateProject((d) => {
                          const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                          const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                          if (blk?.type === 'choice') {
                            const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                            if (o) o.targetSceneId = val || undefined;
                          }
                        });
                      }}
                      className="paper-input w-full text-[12.5px]"
                    >
                      <option value="">选择场景…</option>
                      {project.scenes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {choiceModalContext.opt.targetType === 'ending' && (
                  <div>
                    <label className="block text-[12px] font-medium mb-1">结局标题</label>
                    <input
                      type="text"
                      value={choiceModalContext.opt.endingTitle ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        mutateProject((d) => {
                          const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                          const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                          if (blk?.type === 'choice') {
                            const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                            if (o) o.endingTitle = val;
                          }
                        });
                      }}
                      placeholder="例如：真结局"
                      className="paper-input w-full text-[12.5px]"
                    />
                  </div>
                )}
              </div>
              <ConditionEditor
                value={choiceModalContext.opt.condition}
                variables={project.variables}
                onChange={(cond) => {
                  mutateProject((d) => {
                    const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                    const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                    if (blk?.type === 'choice') {
                      const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                      if (o) o.condition = cond;
                    }
                  });
                }}
              />
              {choiceModalContext.opt.condition && choiceModalContext.opt.condition.rules.length > 0 && (
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-[#706A60] shrink-0">未满足时：</span>
                  <select
                    value={choiceModalContext.opt.lockedBehavior}
                    onChange={(e) => {
                      const val = e.target.value as 'hide' | 'disable';
                      mutateProject((d) => {
                        const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                        const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                        if (blk?.type === 'choice') {
                          const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                          if (o) o.lockedBehavior = val;
                        }
                      });
                    }}
                    className="paper-input py-1 text-[12px]"
                  >
                    <option value="hide">隐藏该选项</option>
                    <option value="disable">灰显并提示原因</option>
                  </select>
                  {choiceModalContext.opt.lockedBehavior === 'disable' && (
                    <input
                      type="text"
                      value={choiceModalContext.opt.disabledHint ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        mutateProject((d) => {
                          const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                          const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                          if (blk?.type === 'choice') {
                            const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                            if (o) o.disabledHint = val;
                          }
                        });
                      }}
                      placeholder="禁用提示文字"
                      className="paper-input flex-1 py-1 text-[12px]"
                    />
                  )}
                </div>
              )}
              <StateEffectsEditor
                effects={choiceModalContext.opt.effects}
                variables={project.variables}
                onChange={(effects) => {
                  mutateProject((d) => {
                    const sc = d.scenes.find((s) => s.id === choiceModalContext.sc.id);
                    const blk = sc?.blocks.find((b) => b.id === choiceModalContext.blk.id);
                    if (blk?.type === 'choice') {
                      const o = blk.options.find((x) => x.id === choiceModalContext.opt.id);
                      if (o) o.effects = effects;
                    }
                  });
                }}
              />
            </div>
            <div className="px-5 py-3 border-t border-[#E7E2D8] bg-white flex justify-end">
              <button onClick={clearChoiceOptionEditor} className="paper-btn-primary px-4 py-1.5 text-[12.5px]">
                完成编辑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
