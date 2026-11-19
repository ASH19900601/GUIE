import React from 'react';
import {
  MessageSquare,
  AlignLeft,
  BookOpen,
  GitFork,
  Image as ImageIcon,
  UserSquare2,
  Layers,
  Camera,
  Music,
  Volume2,
  Mic,
  Film,
  Sliders,
  GitBranch,
  CornerDownRight,
  Flag,
  Clock,
  Award,
  UserPen,
  X,
} from 'lucide-react';
import type { ProjectData, StoryBlock } from '@shared/types';
import { createId } from '@shared/defaults';

interface AddContentDrawerProps {
  open: boolean;
  insertIndex: number;
  project: ProjectData;
  onClose: () => void;
  onInsertBlock: (block: StoryBlock, insertIndex: number) => void;
}

interface CatalogItem {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number }>;
  build: (project: ProjectData) => StoryBlock;
}

const CATALOG_GROUPS: Array<{ title: string; items: CatalogItem[] }> = [
  {
    title: '对白与剧情互动',
    items: [
      {
        id: 'dialogue',
        label: '角色对白',
        desc: '角色说出的一句台词，可配表情与语音',
        icon: MessageSquare,
        build: (p) => ({
          id: createId('blk'),
          type: 'dialogue',
          speakerId: p.characters[0]?.id ?? null,
          text: '',
        }),
      },
      {
        id: 'narration',
        label: '旁白叙述',
        desc: '无角色名的故事叙述与环境描写',
        icon: AlignLeft,
        build: () => ({
          id: createId('blk'),
          type: 'dialogue',
          speakerId: null,
          text: '',
        }),
      },
      {
        id: 'nvl',
        label: '全屏独白（NVL）',
        desc: '整屏连续独白与心理描写模式',
        icon: BookOpen,
        build: () => ({
          id: createId('blk'),
          type: 'dialogue',
          speakerId: null,
          nvlMode: true,
          text: '',
        }),
      },
      {
        id: 'choice',
        label: '玩家选择分支',
        desc: '多个选项、显示条件、好感度增减与路线跳转',
        icon: GitFork,
        build: () => ({
          id: createId('blk'),
          type: 'choice',
          prompt: '接下来你决定怎么做？',
          options: [
            { id: createId('opt'), label: '选项一', lockedBehavior: 'hide', effects: [], targetType: 'continue' },
            { id: createId('opt'), label: '选项二', lockedBehavior: 'hide', effects: [], targetType: 'continue' },
          ],
        }),
      },
      {
        id: 'player_name',
        label: '玩家自定义姓名',
        desc: '弹出输入框让玩家输入主角名字',
        icon: UserPen,
        build: (p) => ({
          id: createId('blk'),
          type: 'player_name_input',
          prompt: p.extensions.playerCustomName.promptText || '请输入你的名字',
          defaultName: p.extensions.playerCustomName.defaultName || '主角',
        }),
      },
    ],
  },
  {
    title: '画面、立绘与镜头特效',
    items: [
      {
        id: 'background',
        label: '切换背景与转场',
        desc: '更换背景图或纯色底幕，支持 12 种转场效果',
        icon: ImageIcon,
        build: (p) => ({
          id: createId('blk'),
          type: 'background',
          assetId: p.assets.find((a) => a.category === 'background')?.id ?? null,
          color: '#1A1816',
          transition: 'dissolve',
          transitionDuration: 0.6,
        }),
      },
      {
        id: 'sprite',
        label: '角色立绘（显示/隐藏）',
        desc: '立绘出场、换表情服装、位置缩放旋转、关键帧与退场',
        icon: UserSquare2,
        build: (p) => ({
          id: createId('blk'),
          type: 'sprite',
          action: 'show',
          characterId: p.characters[0]?.id ?? '',
          expression: p.characters[0]?.expressions[0]?.name,
          slot: 'center',
          scale: 1,
          rotation: 0,
          alpha: 1,
          zOrder: 10,
          transition: 'dissolve',
          transitionDuration: 0.4,
        }),
      },
      {
        id: 'multilayer',
        label: '多层场景舞台',
        desc: '叠加远景/中景/前景多图层与视差偏移',
        icon: Layers,
        build: (p) => {
          const bg = p.assets.find((a) => a.category === 'background');
          return {
            id: createId('blk'),
            type: 'multilayer_stage',
            layers: bg
              ? [
                  {
                    id: createId('ly'),
                    name: '远景底图',
                    group: 'background',
                    assetId: bg.id,
                    offsetX: 0,
                    offsetY: 0,
                    parallaxDepth: 0.4,
                    scale: 1,
                    alpha: 1,
                    visible: true,
                    zIndex: 1,
                  },
                ]
              : [],
            transition: 'dissolve',
            transitionDuration: 0.5,
          };
        },
      },
      {
        id: 'camera_fx',
        label: '镜头与环境粒子特效',
        desc: '推拉缩放、震屏、模糊暗角、色调滤镜与雨雪落叶',
        icon: Camera,
        build: () => ({
          id: createId('blk'),
          type: 'camera_fx',
          panX: 0,
          panY: 0,
          zoom: 1.08,
          duration: 0.8,
          shake: 'none',
          blur: 0,
          dofFocus: 0.5,
          vignette: 0.2,
          lutPreset: 'none',
          particles: 'none',
          particleIntensity: 1,
        }),
      },
      {
        id: 'cg_unlock',
        label: '解锁鉴赏 CG',
        desc: '展示特殊插画并永久收入玩家的 CG 鉴赏相册',
        icon: Award,
        build: (p) => ({
          id: createId('blk'),
          type: 'cg_unlock',
          cgId: createId('cg'),
          title: '特别回忆插画',
          assetId: p.assets.find((a) => a.category === 'background')?.id ?? '',
          showFullscreen: true,
          transition: 'dissolve',
        }),
      },
    ],
  },
  {
    title: '声音与视频演出',
    items: [
      {
        id: 'bgm',
        label: '背景音乐（播放/停止）',
        desc: '支持循环、排队播放、音量与淡入淡出',
        icon: Music,
        build: (p) => ({
          id: createId('blk'),
          type: 'audio',
          channel: 'bgm',
          action: 'play',
          assetId: p.assets.find((a) => a.category === 'bgm')?.id,
          loop: true,
          volume: 0.8,
          fadeIn: 0.8,
          fadeOut: 0.8,
        }),
      },
      {
        id: 'se',
        label: '音效（SE）',
        desc: '单次或停止音效，支持音量与淡出',
        icon: Volume2,
        build: (p) => ({
          id: createId('blk'),
          type: 'audio',
          channel: 'se',
          action: 'play',
          assetId: p.assets.find((a) => a.category === 'se')?.id,
          loop: false,
          volume: 0.9,
        }),
      },
      {
        id: 'voice',
        label: '独立语音控制',
        desc: '播放或停止语音轨道',
        icon: Mic,
        build: (p) => ({
          id: createId('blk'),
          type: 'audio',
          channel: 'voice',
          action: 'play',
          assetId: p.assets.find((a) => a.category === 'voice')?.id,
          volume: 1,
        }),
      },
      {
        id: 'video',
        label: '视频演出',
        desc: '全屏片头/过场视频、循环视频背景或视频立绘',
        icon: Film,
        build: (p) => ({
          id: createId('blk'),
          type: 'video',
          mode: 'fullscreen',
          assetId: p.assets.find((a) => a.category === 'video')?.id ?? '',
          loop: false,
          skippable: true,
        }),
      },
    ],
  },
  {
    title: '故事状态与流程控制',
    items: [
      {
        id: 'state_change',
        label: '修改故事状态',
        desc: '对好感度、线索开关或文字状态进行设置、增加或减少',
        icon: Sliders,
        build: (p) => ({
          id: createId('blk'),
          type: 'state_change',
          effects: p.variables[0]
            ? [
                {
                  id: createId('eff'),
                  variableId: p.variables[0].id,
                  op: p.variables[0].type === 'number' ? 'add' : 'set',
                  value: p.variables[0].type === 'number' ? 1 : p.variables[0].type === 'boolean' ? true : '',
                },
              ]
            : [],
        }),
      },
      {
        id: 'condition_branch',
        label: '自动条件分支',
        desc: '不弹出选项，根据故事状态自动分流到不同场景',
        icon: GitBranch,
        build: (p) => ({
          id: createId('blk'),
          type: 'condition_branch',
          condition: { logic: 'all', rules: [] },
          trueTargetType: 'scene',
          trueTargetSceneId: p.scenes[0]?.id,
          falseTargetType: 'continue',
        }),
      },
      {
        id: 'jump_call',
        label: '跳转 / 调用公共剧情',
        desc: '前往另一场景、调用可复用公共剧情段或返回',
        icon: CornerDownRight,
        build: (p) => ({
          id: createId('blk'),
          type: 'flow',
          action: 'jump_scene',
          targetSceneId: p.scenes[0]?.id,
        }),
      },
      {
        id: 'pause',
        label: '剧情停顿 / 等待点击',
        desc: '让画面停留指定秒数或等待玩家点击继续',
        icon: Clock,
        build: () => ({
          id: createId('blk'),
          type: 'flow',
          action: 'pause',
          pauseSeconds: 1.0,
        }),
      },
      {
        id: 'ending',
        label: '达成结局',
        desc: '结束本条路线并自动解锁结局收集册记录',
        icon: Flag,
        build: () => ({
          id: createId('blk'),
          type: 'flow',
          action: 'ending',
          endingId: createId('end'),
          endingTitle: '结局：未完待续',
          endingSubtitle: '感谢游玩本条路线',
        }),
      },
    ],
  },
];

/**
 * Slide-over Contextual Add Content Drawer (Req 6.2.3):
 * Always overlays cleanly on demand so the Story Workbench strictly preserves its 3-column layout!
 */
export const AddContentDrawer: React.FC<AddContentDrawerProps> = ({
  open,
  insertIndex,
  project,
  onClose,
  onInsertBlock,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div
        data-testid="add-content-drawer"
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] h-full bg-[#FBFAF5] border-l border-[#D7D1C6] shadow-2xl flex flex-col"
      >
        <div className="px-4 py-3.5 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
          <div>
            <div className="font-semibold text-[14px] text-[#171513]">添加剧情内容</div>
            <div className="text-[11.5px] text-[#706A60]">
              将插入到第 <strong className="text-[#FF5A3D]">{insertIndex + 1}</strong> 项位置
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto paper-scroll p-3.5 flex flex-col gap-5">
          {CATALOG_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-[11.5px] font-semibold text-[#948D82] mb-2 px-1">
                {group.title}
              </div>
              <div className="flex flex-col gap-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      data-testid={`add-block-${item.id}`}
                      onClick={() => {
                        const block = item.build(project);
                        onInsertBlock(block, insertIndex);
                        onClose();
                      }}
                      className="text-left p-2.5 rounded-md border border-[#E7E2D8] bg-white hover:border-[#FF5A3D] hover:bg-[#FFF1ED]/50 transition-colors flex items-start gap-2.5 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded bg-[#F3F0E8] border border-[#E7E2D8] flex items-center justify-center text-[#565149] shrink-0 mt-0.5">
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-[13px] text-[#171513]">{item.label}</div>
                        <div className="text-[11.5px] text-[#706A60] leading-snug mt-0.5">
                          {item.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
