import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Info } from 'lucide-react';
import type { DialogueBlock, ProjectData, Scene, StoryBlock } from '@shared/types';
import { createId } from '@shared/defaults';
import { summarizeBlockForTimeline } from '@shared/previewEngine';
import { registerDraftFlusher, useAppStore } from '../../store/useAppStore';

interface PlainTextScriptViewProps {
  scene: Scene;
  project: ProjectData;
  onApplyBlocks: (blocks: StoryBlock[]) => void;
}

const ANCHOR_RE = /^【事件#([a-zA-Z0-9_-]+)：.*】$/;

/**
 * Plain-Text Screenplay Writing View (Req 2.3):
 * Lets creators rapidly write & edit dozens of dialogue lines in plain script syntax
 * (`角色名：台词` or narration lines) while preserving EVERY non-dialogue structured event
 * (backgrounds, sprites, choices, camera FX, audio, state changes) via anchored markers!
 */
export const PlainTextScriptView: React.FC<PlainTextScriptViewProps> = ({
  scene,
  project,
  onApplyBlocks,
}) => {
  const { pushToast, markDraftDirty } = useAppStore();

  const serializeToScript = useMemo(() => {
    const lines: string[] = [];
    for (const blk of scene.blocks) {
      if (blk.type === 'dialogue') {
        const sp = blk.speakerId
          ? project.characters.find((c) => c.id === blk.speakerId)?.name
          : null;
        if (sp) lines.push(`${sp}：${blk.text}`);
        else lines.push(blk.text);
      } else {
        const summary = summarizeBlockForTimeline(blk, project);
        lines.push(`【事件#${blk.id}：${summary}】`);
      }
    }
    return lines.join('\n');
  }, [scene, project]);

  const [draft, setDraft] = useState(serializeToScript);
  const [hasLocalEdits, setHasLocalEdits] = useState(false);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(hasLocalEdits);
  const sceneRef = useRef(scene);
  const projectRef = useRef(project);
  const onApplyRef = useRef(onApplyBlocks);
  draftRef.current = draft;
  dirtyRef.current = hasLocalEdits;
  sceneRef.current = scene;
  projectRef.current = project;
  onApplyRef.current = onApplyBlocks;

  useEffect(() => {
    setDraft(serializeToScript);
    setHasLocalEdits(false);
    markDraftDirty('plain_script', false);
  }, [serializeToScript, scene.id, markDraftDirty]);

  const parseDraftToBlocks = (rawDraft: string, curScene: Scene, curProject: ProjectData): StoryBlock[] => {
    const existingById = new Map(curScene.blocks.map((b) => [b.id, b]));
    const charByName = new Map(curProject.characters.map((c) => [c.name, c.id]));
    const existingDialogues = curScene.blocks.filter((b): b is DialogueBlock => b.type === 'dialogue');
    let dlgReuseCursor = 0;

    const rawLines = rawDraft.split(/\r?\n/);
    const nextBlocks: StoryBlock[] = [];
    const placedEventIds = new Set<string>();

    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (!line) continue;

      const anchorMatch = line.match(ANCHOR_RE);
      if (anchorMatch) {
        const orig = existingById.get(anchorMatch[1]);
        if (orig) {
          nextBlocks.push(orig);
          placedEventIds.add(orig.id);
        }
        continue;
      }

      // Parse `角色名：台词` or `角色名: 台词`
      const colonIdx = line.search(/[：:]/);
      let speakerId: string | null = null;
      let text = line;
      if (colonIdx > 0 && colonIdx <= 14) {
        const maybeName = line.slice(0, colonIdx).trim();
        if (charByName.has(maybeName)) {
          speakerId = charByName.get(maybeName)!;
          text = line.slice(colonIdx + 1).trim();
        }
      }

      // Reuse existing dialogue block ID/metadata when order aligns to keep voice bindings safe!
      const reused = existingDialogues[dlgReuseCursor];
      if (reused && reused.text === text && reused.speakerId === speakerId) {
        dlgReuseCursor += 1;
        nextBlocks.push(reused);
      } else {
        nextBlocks.push({
          id: createId('blk'),
          type: 'dialogue',
          speakerId,
          text,
        });
      }
    }

    // Safety net: NEVER silently lose any non-dialogue structured event even if user accidentally deleted its marker line!
    for (const blk of curScene.blocks) {
      if (blk.type !== 'dialogue' && !placedEventIds.has(blk.id)) {
        nextBlocks.push(blk);
      }
    }
    return nextBlocks;
  };

  // Register draft flusher so switching scenes/tabs/playtest/home NEVER drops un-synced plain-text edits (Req 5.1)!
  useEffect(() => {
    const unregister = registerDraftFlusher(() => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        markDraftDirty('plain_script', false);
        const blocks = parseDraftToBlocks(draftRef.current, sceneRef.current, projectRef.current);
        onApplyRef.current(blocks);
      }
    });
    return () => {
      unregister();
      markDraftDirty('plain_script', false);
    };
  }, [markDraftDirty]);

  const handleApply = () => {
    const nextBlocks = parseDraftToBlocks(draft, scene, project);
    dirtyRef.current = false;
    setHasLocalEdits(false);
    markDraftDirty('plain_script', false);
    onApplyBlocks(nextBlocks);
    pushToast('success', '纯文本剧本已同步到卡片视图，所有背景/立绘/分支事件均完整保留。');
  };

  return (
    <div data-testid="plain-text-script-view" className="h-full flex flex-col p-4 gap-3 overflow-hidden">
      <div className="p-3 rounded-md bg-[#FBFAF5] border border-[#E7E2D8] flex items-center justify-between gap-3">
        <div className="text-[12px] text-[#706A60] flex items-start gap-2">
          <Info size={15} className="text-[#FF5A3D] shrink-0 mt-0.5" />
          <div>
            <span className="font-medium text-[#171513]">高速纯文本写作模式：</span>
            每行写一句旁白，或用「角色名：台词」格式快速写对白。
            带 <code className="bg-[#EFECE3] px-1 rounded">【事件#…】</code> 的行代表背景、立绘、分支等演出事件，系统将始终安全保留不会丢失。
          </div>
        </div>
        <button
          data-testid="apply-plain-script-btn"
          onClick={handleApply}
          disabled={!hasLocalEdits}
          className="paper-btn-primary px-3.5 py-1.5 text-[12.5px] inline-flex items-center gap-1.5 shrink-0"
        >
          <Check size={14} />
          同步到故事卡片
        </button>
      </div>

      <textarea
        data-testid="plain-script-textarea"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setHasLocalEdits(true);
          markDraftDirty('plain_script', true);
        }}
        placeholder={`示例：\n黄昏的教室里只剩下微风声。\n林夏：放学后一起去天台看看吧？`}
        className="flex-1 w-full paper-card p-4 text-[14px] leading-[1.85] font-sans resize-none focus:outline-none focus:border-[#FF5A3D] paper-scroll"
      />
    </div>
  );
};
