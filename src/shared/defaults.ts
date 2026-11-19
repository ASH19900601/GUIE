import type {
  AppearanceConfig,
  AssetCategory,
  AssetEntry,
  ConditionGroup,
  ConditionOperator,
  ConditionRule,
  DialogueBoxPreset,
  ProjectData,
  ProjectIssue,
  Scene,
  StateEffect,
  StoryBlock,
  StoryVariable,
  ThemePresetId,
  VariableType,
} from './types';

let idCounter = 0;

export function createId(prefix = 'id'): string {
  idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}_${rand}`;
}

export const APPEARANCE_PRESETS: Record<
  ThemePresetId,
  {
    name: string;
    description: string;
    theme: AppearanceConfig['theme'];
    dialogueBox: Partial<AppearanceConfig['dialogueBox']>;
    buttons: AppearanceConfig['buttons'];
  }
> = {
  paper_warm: {
    name: '暖纸书卷',
    description: '温暖典雅的叙事质感，深炭色半透明对话框搭配高对比白字',
    theme: {
      primaryColor: '#FF5A3D',
      accentColor: '#D94B30',
      idleColor: '#E5DFD3',
      hoverColor: '#FF785E',
      menuBgColor: '#1E1B18',
      overlayOpacity: 0.88,
    },
    dialogueBox: {
      textColor: '#FFFFFF',
      nameColor: '#FFB399',
      boxBgColor: '#1B1917',
      boxOpacity: 0.86,
      textShadow: true,
      shadowColor: '#000000',
    },
    buttons: {
      style: 'rounded',
      bgColor: '#26221E',
      hoverBgColor: '#FF5A3D',
      textColor: '#FFFFFF',
      borderColor: '#4A433B',
      borderWidth: 1,
      radius: 8,
    },
  },
  bright_fresh: {
    name: '明亮清爽',
    description: '晴朗清透的校园日系氛围，蓝灰半透明底栏配清晰易读纯白文字',
    theme: {
      primaryColor: '#2563EB',
      accentColor: '#0EA5E9',
      idleColor: '#E2ECF8',
      hoverColor: '#38BDF8',
      menuBgColor: '#17253B',
      overlayOpacity: 0.84,
    },
    dialogueBox: {
      // Strictly white readable text on frosted slate-navy translucent box (Req 2.7)
      textColor: '#FFFFFF',
      nameColor: '#BAE6FD',
      boxBgColor: '#182C44',
      boxOpacity: 0.84,
      textShadow: true,
      shadowColor: '#0B1624',
    },
    buttons: {
      style: 'pill',
      bgColor: '#1E3A5F',
      hoverBgColor: '#0EA5E9',
      textColor: '#FFFFFF',
      borderColor: '#60A5FA',
      borderWidth: 1,
      radius: 999,
    },
  },
  midnight_velvet: {
    name: '午夜剧场',
    description: '电影级沉静深邃质感，适合悬疑、科幻与都市夜景题材',
    theme: {
      primaryColor: '#E11D48',
      accentColor: '#FB7185',
      idleColor: '#CBD5E1',
      hoverColor: '#FDA4AF',
      menuBgColor: '#0F131A',
      overlayOpacity: 0.92,
    },
    dialogueBox: {
      textColor: '#FFFFFF',
      nameColor: '#FDA4AF',
      boxBgColor: '#0D1117',
      boxOpacity: 0.9,
      textShadow: true,
      shadowColor: '#000000',
    },
    buttons: {
      style: 'sharp',
      bgColor: '#181E29',
      hoverBgColor: '#E11D48',
      textColor: '#FFFFFF',
      borderColor: '#334155',
      borderWidth: 1,
      radius: 4,
    },
  },
  sakura_soft: {
    name: '樱庭物语',
    description: '温柔浪漫的恋爱物语风格，深玫褐柔光对话框衬托清晰白字',
    theme: {
      primaryColor: '#DB2777',
      accentColor: '#F472B6',
      idleColor: '#FCE7F3',
      hoverColor: '#F9A8D4',
      menuBgColor: '#2B1822',
      overlayOpacity: 0.86,
    },
    dialogueBox: {
      textColor: '#FFFFFF',
      nameColor: '#FBCFE8',
      boxBgColor: '#331A26',
      boxOpacity: 0.86,
      textShadow: true,
      shadowColor: '#1A0B12',
    },
    buttons: {
      style: 'rounded',
      bgColor: '#422131',
      hoverBgColor: '#DB2777',
      textColor: '#FFFFFF',
      borderColor: '#F472B6',
      borderWidth: 1,
      radius: 10,
    },
  },
  classic_vn: {
    name: '经典 Galgame',
    description: '经典日式视觉小说复古布局，高可读性描边阴影与清晰名字框',
    theme: {
      primaryColor: '#D97706',
      accentColor: '#F59E0B',
      idleColor: '#FEF3C7',
      hoverColor: '#FCD34D',
      menuBgColor: '#1C1917',
      overlayOpacity: 0.88,
    },
    dialogueBox: {
      textColor: '#FFFFFF',
      nameColor: '#FDE68A',
      boxBgColor: '#171514',
      boxOpacity: 0.85,
      textShadow: true,
      shadowColor: '#000000',
    },
    buttons: {
      style: 'outline',
      bgColor: '#24201E',
      hoverBgColor: '#D97706',
      textColor: '#FFFFFF',
      borderColor: '#D97706',
      borderWidth: 2,
      radius: 6,
    },
  },
};

export function createDefaultAppearance(title = '未命名视觉小说'): AppearanceConfig {
  const preset = APPEARANCE_PRESETS.paper_warm;
  const defaultPresets: DialogueBoxPreset[] = [
    {
      id: 'preset_standard',
      name: '标准叙事',
      fontSize: 30,
      fontWeight: 400,
      lineHeight: 1.55,
      letterSpacing: 0.5,
      textColor: '#FFFFFF',
      nameColor: '#FFB399',
      textShadow: true,
      shadowColor: '#000000',
      paddingX: 48,
      paddingY: 28,
      nameFontSize: 34,
      boxHeight: 270,
      boxBgColor: '#1B1917',
      boxOpacity: 0.86,
      typingCps: 36,
    },
    {
      id: 'preset_cinematic',
      name: '电影字幕',
      fontSize: 28,
      fontWeight: 500,
      lineHeight: 1.6,
      letterSpacing: 1,
      textColor: '#FFFFFF',
      nameColor: '#FDE68A',
      textShadow: true,
      shadowColor: '#000000',
      paddingX: 80,
      paddingY: 24,
      nameFontSize: 30,
      boxHeight: 210,
      boxBgColor: '#0D0E12',
      boxOpacity: 0.78,
      typingCps: 42,
    },
  ];
  return {
    themePreset: 'paper_warm',
    theme: { ...preset.theme },
    font: {
      globalFontAssetId: null,
      bundledCjkFont: 'fonts/SourceHanSansLite.ttf',
      baseSize: 30,
      interfaceSize: 24,
    },
    dialogueBox: {
      fontAssetId: null,
      fontSize: 30,
      fontWeight: 400,
      lineHeight: 1.55,
      letterSpacing: 0.5,
      textColor: '#FFFFFF',
      nameColor: '#FFB399',
      textShadow: true,
      shadowColor: '#000000',
      paddingX: 48,
      paddingY: 28,
      nameFontSize: 34,
      boxHeight: 270,
      backgroundAssetId: null,
      boxBgColor: '#1B1917',
      boxOpacity: 0.86,
      typingCps: 36,
      savedPresets: defaultPresets,
    },
    buttons: { ...preset.buttons },
    window: {
      title,
      width: 1920,
      height: 1080,
      iconAssetId: null,
      fullscreenDefault: false,
      showWindowTitle: true,
    },
  };
}

export function createNewProjectData(options: {
  title: string;
  author?: string;
  width?: number;
  height?: number;
  withStarterContent?: boolean;
}): ProjectData {
  const now = new Date().toISOString();
  const chapterId = createId('ch');
  const startSceneId = createId('sc');
  const appearance = createDefaultAppearance(options.title);
  if (options.width) appearance.window.width = options.width;
  if (options.height) appearance.window.height = options.height;

  const starterBlocks: StoryBlock[] = options.withStarterContent
    ? [
        {
          id: createId('blk'),
          type: 'dialogue',
          speakerId: null,
          text: '黄昏的微风拂过教室窗帘，一切故事从这里开始。',
        },
      ]
    : [
        {
          id: createId('blk'),
          type: 'dialogue',
          speakerId: null,
          text: '在这里写下你的第一句开场旁白。',
        },
      ];

  return {
    meta: {
      id: createId('proj'),
      schemaVersion: 1,
      title: options.title.trim() || '我的视觉小说',
      version: '1.0.0',
      author: options.author?.trim() || '创作者',
      createdAt: now,
      updatedAt: now,
      startSceneId,
    },
    chapters: [
      {
        id: chapterId,
        name: '序章',
        order: 0,
        collapsed: false,
        disabled: false,
        description: '故事的起点',
      },
    ],
    scenes: [
      {
        id: startSceneId,
        chapterId,
        name: '开场场景',
        order: 0,
        disabled: false,
        summary: '故事开始的第一个场景',
        nextSceneId: null,
        blocks: starterBlocks,
      },
    ],
    characters: [],
    variables: [
      {
        id: createId('var'),
        name: '好感度',
        type: 'number',
        initialValue: 0,
        persistent: false,
        category: 'affection',
        description: '用于记录角色关系变化的故事状态',
      },
    ],
    assets: [],
    appearance,
    extensions: {
      galleryAndEndings: {
        enabled: false,
        enableCgGallery: true,
        enableSceneReplay: true,
        enableEndingBook: true,
      },
      affectionSystem: {
        enabled: false,
        tracks: [],
      },
      sixSlotSaveScreen: {
        enabled: false,
      },
      playerCustomName: {
        enabled: false,
        defaultName: '主角',
        promptAtStart: true,
        promptText: '请输入你的名字',
      },
      autoSaveBeforeChoice: {
        enabled: true,
      },
      chapterTitleCard: {
        enabled: false,
        duration: 2.2,
        style: 'minimal',
      },
    },
    localization: {
      defaultLanguage: 'zh_CN',
      languages: [],
    },
    flowLayout: {
      direction: 'TB',
      nodePositions: {},
      showCausalLinks: true,
    },
  };
}

// ==========================================
// Condition Operators, Formatting & Evaluation
// ==========================================

export function getOperatorsForVariableType(
  type: VariableType
): Array<{ value: ConditionOperator; label: string }> {
  if (type === 'number') {
    return [
      { value: '>=', label: '大于等于' },
      { value: '>', label: '大于' },
      { value: '==', label: '等于' },
      { value: '!=', label: '不等于' },
      { value: '<=', label: '小于等于' },
      { value: '<', label: '小于' },
    ];
  }
  if (type === 'boolean') {
    return [
      { value: 'is_true', label: '已开启（为真）' },
      { value: 'is_false', label: '未开启（为假）' },
    ];
  }
  return [
    { value: '==', label: '等于文字' },
    { value: '!=', label: '不等于文字' },
    { value: 'contains', label: '包含文字' },
  ];
}

export function formatRuleNatural(rule: ConditionRule, variables: StoryVariable[]): string {
  const v = variables.find((item) => item.id === rule.variableId);
  const name = v?.name ?? '未知状态';
  switch (rule.operator) {
    case 'is_true':
      return `${name} 已开启`;
    case 'is_false':
      return `${name} 未开启`;
    case '>=':
      return `${name} 达到 ${rule.value}`;
    case '>':
      return `${name} 大于 ${rule.value}`;
    case '<=':
      return `${name} 不超过 ${rule.value}`;
    case '<':
      return `${name} 小于 ${rule.value}`;
    case '==':
      return `${name} 等于 ${rule.value}`;
    case '!=':
      return `${name} 不等于 ${rule.value}`;
    case 'contains':
      return `${name} 包含“${rule.value}”`;
  }
}

export function formatConditionNatural(
  group: ConditionGroup | undefined,
  variables: StoryVariable[]
): string {
  if (!group || group.rules.length === 0) return '';
  const parts = group.rules.map((r) => formatRuleNatural(r, variables));
  if (group.logic === 'not') {
    return `不满足（${parts.join(' 且 ')}）`;
  }
  if (group.logic === 'any') {
    return parts.length > 1 ? `满足任一：${parts.join(' 或 ')}` : parts[0];
  }
  return parts.join(' 且 ');
}

export function formatEffectNatural(effect: StateEffect, variables: StoryVariable[]): string {
  const v = variables.find((item) => item.id === effect.variableId);
  const name = v?.name ?? '状态';
  if (v?.type === 'boolean') {
    return `${name} 设为 ${effect.value ? '已开启' : '未开启'}`;
  }
  if (effect.op === 'add') return `${name} 增加 ${effect.value}`;
  if (effect.op === 'sub') return `${name} 减少 ${effect.value}`;
  return `${name} 设为 ${effect.value}`;
}

export function evaluateConditionGroup(
  group: ConditionGroup | undefined,
  variables: StoryVariable[],
  runtimeValues: Record<string, number | boolean | string>
): boolean {
  if (!group || group.rules.length === 0) return true;

  const evalRule = (rule: ConditionRule): boolean => {
    const v = variables.find((item) => item.id === rule.variableId);
    if (!v) return false;
    const cur = runtimeValues[v.id] ?? v.initialValue;
    switch (rule.operator) {
      case 'is_true':
        return Boolean(cur) === true;
      case 'is_false':
        return Boolean(cur) === false;
      case '==':
        return String(cur) === String(rule.value);
      case '!=':
        return String(cur) !== String(rule.value);
      case '>':
        return Number(cur) > Number(rule.value);
      case '>=':
        return Number(cur) >= Number(rule.value);
      case '<':
        return Number(cur) < Number(rule.value);
      case '<=':
        return Number(cur) <= Number(rule.value);
      case 'contains':
        return String(cur).includes(String(rule.value));
    }
  };

  if (group.logic === 'all') return group.rules.every(evalRule);
  if (group.logic === 'any') return group.rules.some(evalRule);
  return !group.rules.every(evalRule);
}

export function applyStateEffect(
  effect: StateEffect,
  variables: StoryVariable[],
  runtimeValues: Record<string, number | boolean | string>
): Record<string, number | boolean | string> {
  const v = variables.find((item) => item.id === effect.variableId);
  if (!v) return runtimeValues;
  const next = { ...runtimeValues };
  const cur = next[v.id] ?? v.initialValue;
  if (v.type === 'number') {
    const curNum = Number(cur) || 0;
    const valNum = Number(effect.value) || 0;
    if (effect.op === 'add') next[v.id] = curNum + valNum;
    else if (effect.op === 'sub') next[v.id] = curNum - valNum;
    else next[v.id] = valNum;
  } else if (v.type === 'boolean') {
    next[v.id] = Boolean(effect.value);
  } else {
    next[v.id] = String(effect.value ?? '');
  }
  return next;
}

// ==========================================
// Asset Classification & Reference Tracking
// ==========================================

export function inferAssetCategory(fileName: string): AssetCategory {
  const lower = fileName.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  if (['.ttf', '.otf', '.woff', '.woff2', '.ttc'].includes(ext)) return 'font';
  if (['.mp4', '.webm', '.ogv', '.mkv', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.ogg', '.wav', '.flac', '.opus', '.m4a'].includes(ext)) {
    if (lower.includes('voice') || lower.includes('cv') || lower.includes('语音') || lower.includes('配音')) {
      return 'voice';
    }
    if (lower.includes('se') || lower.includes('sfx') || lower.includes('音效') || lower.includes('click') || lower.includes('door')) {
      return 'se';
    }
    return 'bgm';
  }
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) {
    if (lower.includes('ui') || lower.includes('box') || lower.includes('icon') || lower.includes('btn') || lower.includes('对话框')) {
      return 'ui';
    }
    if (lower.includes('bg') || lower.includes('background') || lower.includes('背景') || lower.includes('场景') || lower.includes('cg')) {
      return 'background';
    }
    if (lower.includes('_') || lower.includes('立绘') || lower.includes('sprite') || lower.includes('chara')) {
      return 'sprite';
    }
    return 'background';
  }
  return 'background';
}

export interface AssetUsageLocation {
  kind: 'block' | 'character' | 'appearance' | 'localization';
  label: string;
  sceneId?: string;
  blockId?: string;
  characterId?: string;
}

export function computeAssetUsageMap(project: ProjectData): Record<string, AssetUsageLocation[]> {
  const map: Record<string, AssetUsageLocation[]> = {};
  const add = (assetId: string | null | undefined, loc: AssetUsageLocation) => {
    if (!assetId) return;
    if (!map[assetId]) map[assetId] = [];
    map[assetId].push(loc);
  };

  for (const ch of project.characters) {
    add(ch.avatarAssetId, { kind: 'character', label: `角色「${ch.name}」头像`, characterId: ch.id });
    add(ch.fontAssetId, { kind: 'character', label: `角色「${ch.name}」专属字体`, characterId: ch.id });
    add(ch.dialogueBoxBgAssetId, { kind: 'character', label: `角色「${ch.name}」专属对话框`, characterId: ch.id });
    for (const exp of ch.expressions) {
      add(exp.assetId, {
        kind: 'character',
        label: `角色「${ch.name}」表情·${exp.name}`,
        characterId: ch.id,
      });
    }
  }

  add(project.appearance.font.globalFontAssetId, { kind: 'appearance', label: '游戏外观·全局字体' });
  add(project.appearance.dialogueBox.fontAssetId, { kind: 'appearance', label: '游戏外观·对话框字体' });
  add(project.appearance.dialogueBox.backgroundAssetId, { kind: 'appearance', label: '游戏外观·对话框底图' });
  add(project.appearance.window.iconAssetId, { kind: 'appearance', label: '游戏外观·应用图标' });

  for (const lang of project.localization.languages) {
    add(lang.fontAssetId, { kind: 'localization', label: `多语言「${lang.name}」专属字体` });
    for (const replacementId of Object.values(lang.imageOverrides)) {
      add(replacementId, { kind: 'localization', label: `多语言「${lang.name}」替换图片` });
    }
  }

  for (const scene of project.scenes) {
    scene.blocks.forEach((blk, idx) => {
      const prefix = `场景「${scene.name}」第 ${idx + 1} 项`;
      if (blk.type === 'dialogue' && blk.voiceAssetId) {
        add(blk.voiceAssetId, { kind: 'block', label: `${prefix}·语音`, sceneId: scene.id, blockId: blk.id });
      } else if (blk.type === 'background' && blk.assetId) {
        add(blk.assetId, { kind: 'block', label: `${prefix}·背景`, sceneId: scene.id, blockId: blk.id });
      } else if (blk.type === 'multilayer_stage') {
        for (const l of blk.layers) {
          add(l.assetId, { kind: 'block', label: `${prefix}·图层「${l.name}」`, sceneId: scene.id, blockId: blk.id });
        }
      } else if (blk.type === 'audio' && blk.assetId) {
        add(blk.assetId, { kind: 'block', label: `${prefix}·音频`, sceneId: scene.id, blockId: blk.id });
      } else if (blk.type === 'video' && blk.assetId) {
        add(blk.assetId, { kind: 'block', label: `${prefix}·视频`, sceneId: scene.id, blockId: blk.id });
      } else if (blk.type === 'flow' && blk.cgAssetId) {
        add(blk.cgAssetId, { kind: 'block', label: `${prefix}·结局CG`, sceneId: scene.id, blockId: blk.id });
      } else if (blk.type === 'cg_unlock' && blk.assetId) {
        add(blk.assetId, { kind: 'block', label: `${prefix}·CG解锁`, sceneId: scene.id, blockId: blk.id });
      }
    });
  }

  return map;
}

export function replaceAssetReferences(
  project: ProjectData,
  oldAssetId: string,
  newAssetId: string
): ProjectData {
  const next: ProjectData = structuredClone(project);
  for (const ch of next.characters) {
    if (ch.avatarAssetId === oldAssetId) ch.avatarAssetId = newAssetId;
    if (ch.fontAssetId === oldAssetId) ch.fontAssetId = newAssetId;
    if (ch.dialogueBoxBgAssetId === oldAssetId) ch.dialogueBoxBgAssetId = newAssetId;
    for (const exp of ch.expressions) {
      if (exp.assetId === oldAssetId) exp.assetId = newAssetId;
    }
  }
  if (next.appearance.font.globalFontAssetId === oldAssetId) next.appearance.font.globalFontAssetId = newAssetId;
  if (next.appearance.dialogueBox.fontAssetId === oldAssetId) next.appearance.dialogueBox.fontAssetId = newAssetId;
  if (next.appearance.dialogueBox.backgroundAssetId === oldAssetId) next.appearance.dialogueBox.backgroundAssetId = newAssetId;
  if (next.appearance.window.iconAssetId === oldAssetId) next.appearance.window.iconAssetId = newAssetId;

  for (const lang of next.localization.languages) {
    if (lang.fontAssetId === oldAssetId) lang.fontAssetId = newAssetId;
    const updatedOverrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(lang.imageOverrides)) {
      const nextKey = k === oldAssetId ? newAssetId : k;
      const nextVal = v === oldAssetId ? newAssetId : v;
      updatedOverrides[nextKey] = nextVal;
    }
    lang.imageOverrides = updatedOverrides;
  }

  for (const scene of next.scenes) {
    for (const blk of scene.blocks) {
      if (blk.type === 'dialogue' && blk.voiceAssetId === oldAssetId) blk.voiceAssetId = newAssetId;
      if (blk.type === 'background' && blk.assetId === oldAssetId) blk.assetId = newAssetId;
      if (blk.type === 'multilayer_stage') {
        for (const l of blk.layers) {
          if (l.assetId === oldAssetId) l.assetId = newAssetId;
        }
      }
      if (blk.type === 'audio' && blk.assetId === oldAssetId) blk.assetId = newAssetId;
      if (blk.type === 'video' && blk.assetId === oldAssetId) blk.assetId = newAssetId;
      if (blk.type === 'flow' && blk.cgAssetId === oldAssetId) blk.cgAssetId = newAssetId;
      if (blk.type === 'cg_unlock' && blk.assetId === oldAssetId) blk.assetId = newAssetId;
    }
  }
  return next;
}

// ==========================================
// Active Scene Helper & Reachability Checker
// ==========================================

export function isSceneEffectivelyDisabled(project: ProjectData, scene: Scene): boolean {
  if (scene.disabled) return true;
  if (scene.chapterId) {
    const ch = project.chapters.find((c) => c.id === scene.chapterId);
    if (ch?.disabled) return true;
  }
  return false;
}

export function getActiveScenes(project: ProjectData): Scene[] {
  return project.scenes.filter((s) => !isSceneEffectivelyDisabled(project, s));
}

export function analyzeProjectIssues(
  project: ProjectData,
  missingAssetIds: Set<string> = new Set()
): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const activeScenes = getActiveScenes(project);
  const activeSceneMap = new Map(activeScenes.map((s) => [s.id, s]));

  // 1. Check start scene
  if (!activeSceneMap.has(project.meta.startSceneId)) {
    const firstActive = activeScenes[0];
    issues.push({
      id: 'issue_no_start_scene',
      severity: 'error',
      code: 'START_SCENE_INVALID',
      title: '缺少有效的开场场景',
      whatHappened: '当前设定的开场场景不存在或已被临时停用。',
      impact: '玩家启动游戏时无法进入正篇剧情。',
      howToFix: firstActive
        ? `点击右侧按钮将「${firstActive.name}」设为开场场景。`
        : '请至少启用或创建一个场景作为开场场景。',
      fixAction: firstActive
        ? { type: 'set_start_scene', sceneId: firstActive.id }
        : { type: 'open_appearance' },
    });
  }

  // 2. Reachability graph
  const reachable = new Set<string>();
  const queue: string[] = [];
  if (activeSceneMap.has(project.meta.startSceneId)) {
    reachable.add(project.meta.startSceneId);
    queue.push(project.meta.startSceneId);
  }
  const visit = (targetId?: string | null) => {
    if (targetId && activeSceneMap.has(targetId) && !reachable.has(targetId)) {
      reachable.add(targetId);
      queue.push(targetId);
    }
  };

  while (queue.length > 0) {
    const sid = queue.shift()!;
    const scene = activeSceneMap.get(sid);
    if (!scene) continue;
    visit(scene.nextSceneId);
    for (const blk of scene.blocks) {
      if (blk.type === 'choice') {
        for (const opt of blk.options) visit(opt.targetSceneId);
      } else if (blk.type === 'condition_branch') {
        visit(blk.trueTargetSceneId);
        visit(blk.falseTargetSceneId);
      } else if (blk.type === 'flow') {
        visit(blk.targetSceneId);
      }
    }
  }

  // 3. Per-scene & per-block checks
  for (const scene of activeScenes) {
    if (!reachable.has(scene.id) && scene.id !== project.meta.startSceneId) {
      issues.push({
        id: `issue_orphan_${scene.id}`,
        severity: 'warning',
        code: 'ORPHAN_SCENE',
        title: `场景「${scene.name}」尚未接入主线剧情`,
        whatHappened: '目前没有任何开场路径、选项或跳转能够通往这个场景。',
        impact: '玩家在正常游玩过程中永远看不到这一段剧情。',
        howToFix: '点击一键接入，将它连接到当前剧情线之后。',
        sceneId: scene.id,
        fixAction: { type: 'connect_orphan_scene', sceneId: scene.id },
      });
    }

    for (const blk of scene.blocks) {
      if (blk.type === 'choice') {
        if (blk.options.length === 0) {
          issues.push({
            id: `issue_empty_choice_${blk.id}`,
            severity: 'error',
            code: 'EMPTY_CHOICE',
            title: `场景「${scene.name}」存在没有任何选项的分支`,
            whatHappened: '分支卡片里还没有添加可供玩家点击的选项。',
            impact: '游戏运行到此处时会卡住或无法继续。',
            howToFix: '点击前往该卡片，补充至少一个玩家选项。',
            sceneId: scene.id,
            blockId: blk.id,
            fixAction: { type: 'jump_to_block', sceneId: scene.id, blockId: blk.id },
          });
        }
        for (const opt of blk.options) {
          if (!opt.label.trim()) {
            issues.push({
              id: `issue_blank_opt_${opt.id}`,
              severity: 'error',
              code: 'BLANK_OPTION_LABEL',
              title: `场景「${scene.name}」有选项未填写文字`,
              whatHappened: '存在一个空白选项文字。',
              impact: '玩家看到的选项按钮将是空的。',
              howToFix: '点击前往分支卡片补全选项文字。',
              sceneId: scene.id,
              blockId: blk.id,
              optionId: opt.id,
              fixAction: { type: 'jump_to_block', sceneId: scene.id, blockId: blk.id },
            });
          }
          if (
            (opt.targetType === 'scene' || opt.targetType === 'call_scene') &&
            (!opt.targetSceneId || !activeSceneMap.has(opt.targetSceneId))
          ) {
            issues.push({
              id: `issue_dangling_opt_${opt.id}`,
              severity: 'error',
              code: 'DANGLING_CHOICE_TARGET',
              title: `选项「${opt.label || '未命名选项'}」未指定有效的目标场景`,
              whatHappened: `场景「${scene.name}」中的选项指向了一个不存在或已停用的后续场景。`,
              impact: '玩家点击该选项时将无法正常进入后续剧情。',
              howToFix: '点击直接为该选项连接目标场景或自动新建后续场景。',
              sceneId: scene.id,
              blockId: blk.id,
              optionId: opt.id,
              fixAction: {
                type: 'connect_option',
                sceneId: scene.id,
                blockId: blk.id,
                optionId: opt.id,
              },
            });
          }
        }
      } else if (blk.type === 'flow') {
        if (
          (blk.action === 'jump_scene' || blk.action === 'call_scene') &&
          (!blk.targetSceneId || !activeSceneMap.has(blk.targetSceneId))
        ) {
          issues.push({
            id: `issue_dangling_flow_${blk.id}`,
            severity: 'error',
            code: 'DANGLING_FLOW_TARGET',
            title: `场景「${scene.name}」的剧情跳转目标无效`,
            whatHappened: '此处的场景跳转指向了一个不存在或已停用的场景。',
            impact: '试玩到此处时无法跳转。',
            howToFix: '点击跳转到该卡片重新选择目标场景。',
            sceneId: scene.id,
            blockId: blk.id,
            fixAction: { type: 'jump_to_block', sceneId: scene.id, blockId: blk.id },
          });
        }
      } else if (blk.type === 'condition_branch') {
        if (
          (blk.trueTargetType === 'scene' || blk.trueTargetType === 'call_scene') &&
          (!blk.trueTargetSceneId || !activeSceneMap.has(blk.trueTargetSceneId))
        ) {
          issues.push({
            id: `issue_dangling_cond_${blk.id}`,
            severity: 'error',
            code: 'DANGLING_CONDITION_TARGET',
            title: `场景「${scene.name}」的条件分支缺少目标场景`,
            whatHappened: '条件满足时要前往的场景不存在或已停用。',
            impact: '满足条件时剧情将中断。',
            howToFix: '点击定位到该条件卡片并选择有效的目标场景。',
            sceneId: scene.id,
            blockId: blk.id,
            fixAction: { type: 'jump_to_block', sceneId: scene.id, blockId: blk.id },
          });
        }
      }
    }
  }

  // 4. Missing assets check
  const usageMap = computeAssetUsageMap(project);
  for (const assetId of missingAssetIds) {
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) continue;
    const usages = usageMap[assetId] ?? [];
    issues.push({
      id: `issue_missing_asset_${assetId}`,
      severity: usages.length > 0 ? 'error' : 'warning',
      code: 'MISSING_ASSET_FILE',
      title: `素材「${asset.name}」原文件已丢失`,
      whatHappened: `项目素材库中登记的「${asset.name}」在磁盘上已找不到对应文件。`,
      impact:
        usages.length > 0
          ? `该素材正被 ${usages.length} 处剧情或角色使用，会导致画面或声音缺失。`
          : '该素材当前未被使用，建议替换或从素材库清理。',
      howToFix: '点击一键替换，从电脑重新选择文件并自动更新全项目引用。',
      assetId,
      fixAction: { type: 'replace_asset', assetId },
    });
  }

  // 5. CJK font safety check
  if (!project.appearance.font.bundledCjkFont && !project.appearance.font.globalFontAssetId) {
    issues.push({
      id: 'issue_cjk_font',
      severity: 'error',
      code: 'MISSING_CJK_FONT',
      title: '未配置多语言中文显示字体',
      whatHappened: '游戏尚未绑定支持中日韩字符的字体。',
      impact: '游戏中的中文、日文或韩文对白可能会显示为空白方框。',
      howToFix: '点击一键恢复内置开源多语言字体。',
      fixAction: { type: 'fix_cjk_font' },
    });
  }

  return issues;
}

// ==========================================
// Narrative Flowchart & Causal Map Builder
// ==========================================

export interface FlowSegmentNode {
  id: string;
  sceneId: string;
  sceneName: string;
  chapterName: string;
  segmentIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
  firstBlockId: string;
  title: string;
  previewText: string;
  blockCount: number;
  kind: 'story' | 'choice' | 'condition' | 'ending';
  isStart: boolean;
  isDisabled: boolean;
  writtenVariableIds: string[];
  readVariableIds: string[];
}

export interface FlowRouteEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  conditionText?: string;
  edgeKind: 'sequence' | 'choice' | 'condition_true' | 'condition_false' | 'jump' | 'call';
  sceneId?: string;
  blockId?: string;
  optionId?: string;
  isMergeTarget?: boolean;
}

export interface FlowCausalEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  variableId: string;
  variableName: string;
}

export interface FlowGraphModel {
  nodes: FlowSegmentNode[];
  edges: FlowRouteEdge[];
  causalEdges: FlowCausalEdge[];
  mergeNodeIds: Set<string>;
}

/**
 * Builds the intuitive Narrative Segment Flowchart:
 * - Each node is a CONTINUOUS non-branching story sequence (never 1 node per dialogue line!)
 * - Splits ONLY when encountering a player choice, conditional branch, jump/call, or ending.
 * - Produces route edges (with choice text + natural condition text), merge detection, and causal state read/write links!
 */
export function buildNarrativeFlowGraph(project: ProjectData): FlowGraphModel {
  const nodes: FlowSegmentNode[] = [];
  const edges: FlowRouteEdge[] = [];
  const sceneEntryNodeId = new Map<string, string>();
  const chapterNameMap = new Map(project.chapters.map((c) => [c.id, c.name]));

  const collectReadsFromCondition = (cond?: ConditionGroup): string[] => {
    if (!cond) return [];
    return [...new Set(cond.rules.map((r) => r.variableId).filter(Boolean))];
  };

  for (const scene of project.scenes) {
    const chName = scene.chapterId ? chapterNameMap.get(scene.chapterId) ?? '未分组' : '未分组';
    const disabled = isSceneEffectivelyDisabled(project, scene);

    if (scene.blocks.length === 0) {
      const nodeId = `seg_${scene.id}_0`;
      sceneEntryNodeId.set(scene.id, nodeId);
      nodes.push({
        id: nodeId,
        sceneId: scene.id,
        sceneName: scene.name,
        chapterName: chName,
        segmentIndex: 0,
        startBlockIndex: 0,
        endBlockIndex: 0,
        firstBlockId: '',
        title: scene.name,
        previewText: '（空场景，点击开始编写剧情）',
        blockCount: 0,
        kind: 'story',
        isStart: scene.id === project.meta.startSceneId,
        isDisabled: disabled,
        writtenVariableIds: [],
        readVariableIds: [],
      });
      continue;
    }

    let segStart = 0;
    let segIdx = 0;
    let prevNodeId: string | null = null;
    let sceneSegments: Array<{
      nodeId: string;
      terminalBlock: StoryBlock | null;
      nextImplicitAllowed: boolean;
    }> = [];

    const flushSegment = (endInclusive: number, terminalBlock: StoryBlock | null) => {
      const slice = scene.blocks.slice(segStart, endInclusive + 1);
      if (slice.length === 0) return null;
      const nodeId = `seg_${scene.id}_${segIdx}`;
      if (segIdx === 0) sceneEntryNodeId.set(scene.id, nodeId);

      const written = new Set<string>();
      const read = new Set<string>();
      let previewText = '';

      for (const b of slice) {
        if (b.type === 'dialogue' && !previewText && b.text.trim()) {
          const sp = b.speakerId
            ? project.characters.find((c) => c.id === b.speakerId)?.name
            : null;
          previewText = sp ? `${sp}：${b.text.slice(0, 38)}` : b.text.slice(0, 40);
        } else if (b.type === 'state_change') {
          b.effects.forEach((e) => written.add(e.variableId));
        } else if (b.type === 'choice') {
          if (!previewText) previewText = b.prompt || `玩家选择（${b.options.length}个选项）`;
          for (const opt of b.options) {
            collectReadsFromCondition(opt.condition).forEach((v) => read.add(v));
            opt.effects.forEach((e) => written.add(e.variableId));
          }
        } else if (b.type === 'condition_branch') {
          collectReadsFromCondition(b.condition).forEach((v) => read.add(v));
          if (!previewText) previewText = `条件判断：${formatConditionNatural(b.condition, project.variables)}`;
        } else if (b.type === 'flow' && b.action === 'ending') {
          if (!previewText) previewText = `结局：${b.endingTitle || '故事终章'}`;
        }
      }

      const kind: FlowSegmentNode['kind'] =
        terminalBlock?.type === 'choice'
          ? 'choice'
          : terminalBlock?.type === 'condition_branch'
          ? 'condition'
          : terminalBlock?.type === 'flow' && terminalBlock.action === 'ending'
          ? 'ending'
          : 'story';

      const node: FlowSegmentNode = {
        id: nodeId,
        sceneId: scene.id,
        sceneName: scene.name,
        chapterName: chName,
        segmentIndex: segIdx,
        startBlockIndex: segStart,
        endBlockIndex: endInclusive,
        firstBlockId: slice[0].id,
        title: segIdx === 0 ? scene.name : `${scene.name} · 第${segIdx + 1}段`,
        previewText: previewText || `${slice.length} 项剧情演出`,
        blockCount: slice.length,
        kind,
        isStart: segIdx === 0 && scene.id === project.meta.startSceneId,
        isDisabled: disabled,
        writtenVariableIds: [...written],
        readVariableIds: [...read],
      };
      nodes.push(node);

      if (prevNodeId) {
        edges.push({
          id: `edge_seq_${prevNodeId}_${nodeId}`,
          fromNodeId: prevNodeId,
          toNodeId: nodeId,
          label: '继续',
          edgeKind: 'sequence',
        });
      }

      const stopsFallthrough =
        terminalBlock?.type === 'choice' ||
        terminalBlock?.type === 'condition_branch' ||
        (terminalBlock?.type === 'flow' &&
          (terminalBlock.action === 'jump_scene' ||
            terminalBlock.action === 'ending' ||
            terminalBlock.action === 'return_from_call'));

      sceneSegments.push({
        nodeId,
        terminalBlock,
        nextImplicitAllowed: !stopsFallthrough,
      });

      prevNodeId = stopsFallthrough ? null : nodeId;
      segIdx += 1;
      segStart = endInclusive + 1;
      return nodeId;
    };

    for (let i = 0; i < scene.blocks.length; i += 1) {
      const blk = scene.blocks[i];
      const isBranchOrEnd =
        blk.type === 'choice' ||
        blk.type === 'condition_branch' ||
        (blk.type === 'flow' &&
          ['jump_scene', 'call_scene', 'return_from_call', 'ending'].includes(blk.action));

      if (isBranchOrEnd) {
        flushSegment(i, blk);
      }
    }
    if (segStart < scene.blocks.length) {
      flushSegment(scene.blocks.length - 1, null);
    }

    // Store internal metadata for second pass linking
    (scene as Scene & { _flowSegs?: typeof sceneSegments })._flowSegs = sceneSegments;
  }

  // Second pass: connect cross-scene edges and ending virtual nodes
  for (const scene of project.scenes) {
    const segs = (scene as Scene & { _flowSegs?: Array<{ nodeId: string; terminalBlock: StoryBlock | null; nextImplicitAllowed: boolean }> })._flowSegs ?? [];
    delete (scene as Scene & { _flowSegs?: unknown })._flowSegs;

    if (segs.length === 0) {
      const entryId = sceneEntryNodeId.get(scene.id);
      if (entryId && scene.nextSceneId && sceneEntryNodeId.has(scene.nextSceneId)) {
        edges.push({
          id: `edge_next_${entryId}_${scene.nextSceneId}`,
          fromNodeId: entryId,
          toNodeId: sceneEntryNodeId.get(scene.nextSceneId)!,
          label: '接续下一场景',
          edgeKind: 'sequence',
        });
      }
      continue;
    }

    for (let sIdx = 0; sIdx < segs.length; sIdx += 1) {
      const seg = segs[sIdx];
      const blk = seg.terminalBlock;
      const nextSegInScene = segs[sIdx + 1]?.nodeId;

      if (blk?.type === 'choice') {
        for (const opt of blk.options) {
          const condText = formatConditionNatural(opt.condition, project.variables);
          if (opt.targetType === 'ending') {
            const endNodeId = `end_${opt.id}`;
            nodes.push({
              id: endNodeId,
              sceneId: scene.id,
              sceneName: opt.endingTitle || '结局',
              chapterName: '结局',
              segmentIndex: 999,
              startBlockIndex: 0,
              endBlockIndex: 0,
              firstBlockId: blk.id,
              title: `结局：${opt.endingTitle || '未命名结局'}`,
              previewText: opt.endingSubtitle || '到达故事结局',
              blockCount: 1,
              kind: 'ending',
              isStart: false,
              isDisabled: isSceneEffectivelyDisabled(project, scene),
              writtenVariableIds: [],
              readVariableIds: [],
            });
            edges.push({
              id: `edge_opt_${opt.id}`,
              fromNodeId: seg.nodeId,
              toNodeId: endNodeId,
              label: opt.label || '选项',
              conditionText: condText || undefined,
              edgeKind: 'choice',
              sceneId: scene.id,
              blockId: blk.id,
              optionId: opt.id,
            });
          } else if (opt.targetType === 'continue') {
            const targetId =
              nextSegInScene ?? (scene.nextSceneId ? sceneEntryNodeId.get(scene.nextSceneId) : undefined);
            if (targetId) {
              edges.push({
                id: `edge_opt_${opt.id}`,
                fromNodeId: seg.nodeId,
                toNodeId: targetId,
                label: opt.label || '选项',
                conditionText: condText || undefined,
                edgeKind: 'choice',
                sceneId: scene.id,
                blockId: blk.id,
                optionId: opt.id,
              });
            }
          } else if (opt.targetSceneId && sceneEntryNodeId.has(opt.targetSceneId)) {
            edges.push({
              id: `edge_opt_${opt.id}`,
              fromNodeId: seg.nodeId,
              toNodeId: sceneEntryNodeId.get(opt.targetSceneId)!,
              label: opt.label || '选项',
              conditionText: condText || undefined,
              edgeKind: 'choice',
              sceneId: scene.id,
              blockId: blk.id,
              optionId: opt.id,
            });
          }
        }
      } else if (blk?.type === 'condition_branch') {
        const condText = formatConditionNatural(blk.condition, project.variables);
        if (blk.trueTargetSceneId && sceneEntryNodeId.has(blk.trueTargetSceneId)) {
          edges.push({
            id: `edge_cond_t_${blk.id}`,
            fromNodeId: seg.nodeId,
            toNodeId: sceneEntryNodeId.get(blk.trueTargetSceneId)!,
            label: `满足：${condText || '条件成立'}`,
            edgeKind: 'condition_true',
            sceneId: scene.id,
            blockId: blk.id,
          });
        }
        if (blk.falseTargetType === 'scene' && blk.falseTargetSceneId && sceneEntryNodeId.has(blk.falseTargetSceneId)) {
          edges.push({
            id: `edge_cond_f_${blk.id}`,
            fromNodeId: seg.nodeId,
            toNodeId: sceneEntryNodeId.get(blk.falseTargetSceneId)!,
            label: '否则',
            edgeKind: 'condition_false',
            sceneId: scene.id,
            blockId: blk.id,
          });
        } else if (nextSegInScene) {
          edges.push({
            id: `edge_cond_f_${blk.id}`,
            fromNodeId: seg.nodeId,
            toNodeId: nextSegInScene,
            label: '否则继续',
            edgeKind: 'condition_false',
            sceneId: scene.id,
            blockId: blk.id,
          });
        }
      } else if (blk?.type === 'flow') {
        if ((blk.action === 'jump_scene' || blk.action === 'call_scene') && blk.targetSceneId && sceneEntryNodeId.has(blk.targetSceneId)) {
          edges.push({
            id: `edge_flow_${blk.id}`,
            fromNodeId: seg.nodeId,
            toNodeId: sceneEntryNodeId.get(blk.targetSceneId)!,
            label: blk.action === 'call_scene' ? '调用公共剧情' : '前往场景',
            edgeKind: blk.action === 'call_scene' ? 'call' : 'jump',
            sceneId: scene.id,
            blockId: blk.id,
          });
        }
      }

      // Connect last segment of scene to explicit nextSceneId if fallthrough is allowed
      if (sIdx === segs.length - 1 && seg.nextImplicitAllowed && scene.nextSceneId && sceneEntryNodeId.has(scene.nextSceneId)) {
        edges.push({
          id: `edge_scene_next_${scene.id}_${scene.nextSceneId}`,
          fromNodeId: seg.nodeId,
          toNodeId: sceneEntryNodeId.get(scene.nextSceneId)!,
          label: '接续下一场景',
          edgeKind: 'sequence',
        });
      }
    }
  }

  // Detect Route Merges (in-degree >= 2)
  const inDegree = new Map<string, number>();
  for (const e of edges) {
    inDegree.set(e.toNodeId, (inDegree.get(e.toNodeId) ?? 0) + 1);
  }
  const mergeNodeIds = new Set<string>();
  for (const [nid, deg] of inDegree.entries()) {
    if (deg >= 2) mergeNodeIds.add(nid);
  }
  for (const e of edges) {
    if (mergeNodeIds.has(e.toNodeId)) e.isMergeTarget = true;
  }

  // Build Narrative Causal Links (Variable Writer Node -> Variable Reader Node)
  const causalEdges: FlowCausalEdge[] = [];
  const varNameMap = new Map(project.variables.map((v) => [v.id, v.name]));
  const writersByVar = new Map<string, FlowSegmentNode[]>();
  for (const n of nodes) {
    for (const vid of n.writtenVariableIds) {
      if (!writersByVar.has(vid)) writersByVar.set(vid, []);
      writersByVar.get(vid)!.push(n);
    }
  }
  for (const reader of nodes) {
    for (const vid of reader.readVariableIds) {
      const writers = writersByVar.get(vid) ?? [];
      for (const writer of writers) {
        if (writer.id === reader.id) continue;
        causalEdges.push({
          id: `causal_${writer.id}_${reader.id}_${vid}`,
          fromNodeId: writer.id,
          toNodeId: reader.id,
          variableId: vid,
          variableName: varNameMap.get(vid) ?? '状态',
        });
      }
    }
  }

  return { nodes, edges, causalEdges, mergeNodeIds };
}

// ==========================================
// Localization String Extractor
// ==========================================

export interface LocalizableStringEntry {
  key: string;
  sourceText: string;
  context: string;
  sceneId?: string;
  blockId?: string;
}

export function extractLocalizableStrings(project: ProjectData): LocalizableStringEntry[] {
  const entries: LocalizableStringEntry[] = [];
  entries.push({
    key: 'meta.title',
    sourceText: project.meta.title,
    context: '游戏标题',
  });
  for (const ch of project.chapters) {
    entries.push({
      key: `chapter.${ch.id}.name`,
      sourceText: ch.name,
      context: `章节名称`,
    });
  }
  for (const ch of project.characters) {
    entries.push({
      key: `char.${ch.id}.name`,
      sourceText: ch.name,
      context: `角色名称`,
    });
  }
  for (const scene of project.scenes) {
    if (isSceneEffectivelyDisabled(project, scene)) continue;
    scene.blocks.forEach((blk, idx) => {
      if (blk.type === 'dialogue' && blk.text.trim()) {
        const sp = blk.speakerId
          ? project.characters.find((c) => c.id === blk.speakerId)?.name ?? '角色'
          : '旁白';
        entries.push({
          key: `blk.${blk.id}.text`,
          sourceText: blk.text,
          context: `${scene.name} #${idx + 1}（${sp}）`,
          sceneId: scene.id,
          blockId: blk.id,
        });
      } else if (blk.type === 'choice') {
        if (blk.prompt?.trim()) {
          entries.push({
            key: `blk.${blk.id}.prompt`,
            sourceText: blk.prompt,
            context: `${scene.name} #${idx + 1}（选择提示）`,
            sceneId: scene.id,
            blockId: blk.id,
          });
        }
        blk.options.forEach((opt, oi) => {
          if (opt.label.trim()) {
            entries.push({
              key: `opt.${opt.id}.label`,
              sourceText: opt.label,
              context: `${scene.name} #${idx + 1} 选项 ${oi + 1}`,
              sceneId: scene.id,
              blockId: blk.id,
            });
          }
          if (opt.disabledHint?.trim()) {
            entries.push({
              key: `opt.${opt.id}.hint`,
              sourceText: opt.disabledHint,
              context: `${scene.name} #${idx + 1} 选项 ${oi + 1} 禁用提示`,
              sceneId: scene.id,
              blockId: blk.id,
            });
          }
        });
      } else if (blk.type === 'flow' && blk.action === 'ending' && blk.endingTitle) {
        entries.push({
          key: `blk.${blk.id}.endingTitle`,
          sourceText: blk.endingTitle,
          context: `${scene.name} 结局标题`,
          sceneId: scene.id,
          blockId: blk.id,
        });
      }
    });
  }
  return entries;
}
