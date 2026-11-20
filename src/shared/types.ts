/**
 * Canonical Shared Domain Types for GUIE (Ren'Py Visual Novel Zero-Code Engine)
 * Covers every GUI-managed capability, compiler IR, preview/timeline state,
 * AI assistant protocol, localization, extensions, snapshots, and reuse library.
 */

export type WorkspaceTab =
  | 'story'
  | 'characters'
  | 'assets'
  | 'appearance'
  | 'extensions'
  | 'reuse'
  | 'localization'
  | 'finish';

export type AppMode = 'creator' | 'advanced';

export type StoryViewMode = 'cards' | 'script' | 'flow';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export type TransitionType =
  | 'none'
  | 'dissolve'
  | 'fade'
  | 'wipeleft'
  | 'wiperight'
  | 'slideleft'
  | 'slideright'
  | 'pixellate'
  | 'vpunch'
  | 'hpunch'
  | 'blinds'
  | 'irisout';

export const TRANSITION_OPTIONS: Array<{ value: TransitionType; label: string; desc: string }> = [
  { value: 'none', label: '立即切换', desc: '无过渡直接出现' },
  { value: 'dissolve', label: '柔和淡入淡出', desc: '最常用的平滑溶解过渡' },
  { value: 'fade', label: '黑屏过渡', desc: '先渐暗至黑屏再显现新画面' },
  { value: 'wipeleft', label: '向左擦除', desc: '画面从右向左平滑擦除切换' },
  { value: 'wiperight', label: '向右擦除', desc: '画面从左向右平滑擦除切换' },
  { value: 'slideleft', label: '向左滑入', desc: '新画面从右侧平滑推入' },
  { value: 'slideright', label: '向右滑入', desc: '新画面从左侧平滑推入' },
  { value: 'blinds', label: '百叶窗切换', desc: '百叶窗条纹展开切换' },
  { value: 'pixellate', label: '像素化过渡', desc: '复古马赛克像素化转场' },
  { value: 'irisout', label: '圆形聚焦', desc: '电影感圆形光圈缩放过渡' },
  { value: 'vpunch', label: '竖向震动', desc: '强烈冲击感垂直震屏' },
  { value: 'hpunch', label: '横向震动', desc: '左右摇晃震动效果' },
];

export type VariableType = 'number' | 'boolean' | 'string';

export interface StoryVariable {
  id: string;
  name: string;
  type: VariableType;
  initialValue: number | boolean | string;
  persistent: boolean; // 跨周目持久状态
  category?: 'affection' | 'flag' | 'general';
  linkedCharacterId?: string;
  description?: string;
}

export type ConditionOperator =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'is_true'
  | 'is_false';

export interface ConditionRule {
  id: string;
  variableId: string;
  operator: ConditionOperator;
  value: number | boolean | string;
}

export type ConditionLogic = 'all' | 'any' | 'not';

export interface ConditionGroup {
  logic: ConditionLogic; // 'all' = 全部满足(且), 'any' = 任一满足(或), 'not' = 不满足(非)
  rules: ConditionRule[];
}

export type StateEffectOp = 'set' | 'add' | 'sub';

export interface StateEffect {
  id: string;
  variableId: string;
  op: StateEffectOp;
  value: number | boolean | string;
}

export interface CharacterExpression {
  id: string;
  name: string;
  outfit?: string;
  assetId: string;
  order: number;
}

export interface Character {
  id: string;
  name: string;
  color: string;
  avatarAssetId?: string;
  fontAssetId?: string;
  dialogueBoxBgAssetId?: string;
  dialogueBoxTint?: string;
  nvlDefault?: boolean;
  description?: string;
  expressions: CharacterExpression[];
}

export type AssetCategory =
  | 'background'
  | 'sprite'
  | 'bgm'
  | 'se'
  | 'voice'
  | 'video'
  | 'font'
  | 'ui';

export interface AssetEntry {
  id: string;
  name: string;
  category: AssetCategory;
  relativePath: string; // e.g., "game/assets/background/classroom.png"
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isCg?: boolean;
  cgTitle?: string;
  createdAt: string;
}

export interface SpriteKeyframe {
  id: string;
  timeSec: number;
  x: number; // 0..1 normalized
  y: number; // 0..1 normalized
  scale: number;
  rotation: number;
  alpha: number;
  easing: 'linear' | 'easein' | 'easeout' | 'ease';
}

export interface StageLayer {
  id: string;
  name: string;
  group: 'background' | 'midground' | 'foreground';
  assetId: string;
  offsetX: number; // px
  offsetY: number; // px
  parallaxDepth: number; // 0.0 .. 2.0
  scale: number;
  alpha: number;
  visible: boolean;
  zIndex: number;
}

export interface ChoiceOption {
  id: string;
  label: string;
  condition?: ConditionGroup;
  lockedBehavior: 'hide' | 'disable';
  disabledHint?: string;
  effects: StateEffect[];
  targetType: 'scene' | 'ending' | 'continue' | 'call_scene';
  targetSceneId?: string;
  endingId?: string;
  endingTitle?: string;
  endingSubtitle?: string;
}

export type BlockType =
  | 'dialogue'
  | 'choice'
  | 'background'
  | 'sprite'
  | 'multilayer_stage'
  | 'camera_fx'
  | 'audio'
  | 'video'
  | 'state_change'
  | 'condition_branch'
  | 'flow'
  | 'player_name_input'
  | 'cg_unlock';

export interface BaseBlock {
  id: string;
  type: BlockType;
  collapsedGroupId?: string;
}

export interface DialogueBlock extends BaseBlock {
  type: 'dialogue';
  speakerId: string | null; // null = 旁白
  dynamicName?: string; // 动态角色名（例如“神秘声音”）
  expression?: string;
  outfit?: string;
  nvlMode?: boolean; // NVL 连续独白模式
  text: string;
  voiceAssetId?: string;
  voiceVolume?: number; // 0..1
  typingSpeed?: number; // cps override (0 = global default)
}

export interface ChoiceBlock extends BaseBlock {
  type: 'choice';
  prompt?: string;
  speakerId?: string | null;
  options: ChoiceOption[];
}

export interface BackgroundBlock extends BaseBlock {
  type: 'background';
  assetId: string | null;
  color?: string;
  transition: TransitionType;
  transitionDuration: number;
}

export type SpriteSlot = 'farleft' | 'left' | 'center' | 'right' | 'farright' | 'custom';

export interface SpriteBlock extends BaseBlock {
  type: 'sprite';
  action: 'show' | 'hide';
  characterId: string;
  expression?: string;
  outfit?: string;
  slot: SpriteSlot;
  x?: number; // 0..1 normalized when custom
  y?: number; // 0..1 normalized when custom
  scale?: number; // default 1
  rotation?: number; // degrees
  alpha?: number; // 0..1
  zOrder?: number;
  transition: TransitionType;
  transitionDuration: number;
  keyframes?: SpriteKeyframe[];
}

export interface MultilayerStageBlock extends BaseBlock {
  type: 'multilayer_stage';
  layers: StageLayer[];
  isolatedLayerId?: string | null;
  transition: TransitionType;
  transitionDuration: number;
}

export type LutPreset = 'none' | 'warm' | 'cool' | 'sepia' | 'noir' | 'sunset' | 'dreamy';
export type ParticlePreset = 'none' | 'rain' | 'snow' | 'petals' | 'leaves' | 'sparkles';

export interface CameraFxBlock extends BaseBlock {
  type: 'camera_fx';
  panX: number; // -300..300 px
  panY: number; // -200..200 px
  zoom: number; // 0.5..2.5
  duration: number;
  shake: 'none' | 'light' | 'medium' | 'heavy';
  blur: number; // 0..20
  dofFocus: number; // 0..1
  vignette: number; // 0..1
  lutPreset: LutPreset;
  particles: ParticlePreset;
  particleIntensity: number; // 0.2..2.0
  reset?: boolean;
}

export interface AudioBlock extends BaseBlock {
  type: 'audio';
  channel: 'bgm' | 'se' | 'voice';
  action: 'play' | 'stop' | 'queue';
  assetId?: string;
  loop?: boolean;
  volume?: number; // 0..1
  fadeIn?: number; // seconds
  fadeOut?: number; // seconds
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  mode: 'fullscreen' | 'background_loop' | 'sprite_video';
  assetId: string;
  characterId?: string;
  loop?: boolean;
  skippable?: boolean;
}

export interface StateChangeBlock extends BaseBlock {
  type: 'state_change';
  effects: StateEffect[];
}

export interface ConditionBranchBlock extends BaseBlock {
  type: 'condition_branch';
  condition: ConditionGroup;
  trueTargetType: 'scene' | 'ending' | 'call_scene';
  trueTargetSceneId?: string;
  trueEndingId?: string;
  trueEndingTitle?: string;
  falseTargetType: 'continue' | 'scene' | 'ending';
  falseTargetSceneId?: string;
  falseEndingId?: string;
  falseEndingTitle?: string;
}

export interface FlowBlock extends BaseBlock {
  type: 'flow';
  action: 'jump_scene' | 'call_scene' | 'return_from_call' | 'pause' | 'wait_click' | 'ending';
  targetSceneId?: string;
  pauseSeconds?: number;
  endingId?: string;
  endingTitle?: string;
  endingSubtitle?: string;
  cgAssetId?: string;
}

export interface PlayerNameInputBlock extends BaseBlock {
  type: 'player_name_input';
  prompt: string;
  defaultName: string;
}

export interface CgUnlockBlock extends BaseBlock {
  type: 'cg_unlock';
  cgId: string;
  title: string;
  assetId: string;
  showFullscreen: boolean;
  transition: TransitionType;
}

export type StoryBlock =
  | DialogueBlock
  | ChoiceBlock
  | BackgroundBlock
  | SpriteBlock
  | MultilayerStageBlock
  | CameraFxBlock
  | AudioBlock
  | VideoBlock
  | StateChangeBlock
  | ConditionBranchBlock
  | FlowBlock
  | PlayerNameInputBlock
  | CgUnlockBlock;

export interface Chapter {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
  disabled: boolean; // 临时软停用
  description?: string;
}

export interface Scene {
  id: string;
  chapterId: string | null;
  name: string;
  order: number;
  disabled: boolean; // 临时软停用
  summary?: string;
  nextSceneId?: string | null; // 明确的默认后续场景连接
  blocks: StoryBlock[];
}

export interface DialogueBoxPreset {
  id: string;
  name: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textColor: string;
  nameColor: string;
  textShadow: boolean;
  shadowColor: string;
  paddingX: number;
  paddingY: number;
  nameFontSize: number;
  boxHeight: number;
  boxBgColor: string;
  boxOpacity: number;
  typingCps: number;
}

export type ThemePresetId =
  | 'paper_warm'
  | 'bright_fresh'
  | 'midnight_velvet'
  | 'sakura_soft'
  | 'classic_vn';

export interface AppearanceConfig {
  themePreset: ThemePresetId;
  theme: {
    primaryColor: string;
    accentColor: string;
    idleColor: string;
    hoverColor: string;
    menuBgColor: string;
    overlayOpacity: number;
  };
  font: {
    globalFontAssetId?: string | null;
    bundledCjkFont: string; // defaults to "fonts/SourceHanSansLite.ttf"
    baseSize: number;
    interfaceSize: number;
  };
  dialogueBox: {
    fontAssetId?: string | null;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing: number;
    textColor: string; // ALWAYS high-contrast readable (e.g. #FFFFFF on dark/translucent box)
    nameColor: string;
    textShadow: boolean;
    shadowColor: string;
    paddingX: number;
    paddingY: number;
    nameFontSize: number;
    boxHeight: number;
    backgroundAssetId?: string | null;
    boxBgColor: string;
    boxOpacity: number;
    typingCps: number;
    savedPresets: DialogueBoxPreset[];
  };
  buttons: {
    style: 'rounded' | 'sharp' | 'pill' | 'outline';
    bgColor: string;
    hoverBgColor: string;
    textColor: string;
    borderColor: string;
    borderWidth: number;
    radius: number;
  };
  window: {
    title: string;
    width: number;
    height: number;
    iconAssetId?: string | null;
    fullscreenDefault: boolean;
    showWindowTitle: boolean;
  };
}

export interface AffectionTrack {
  characterId: string;
  variableId: string;
  maxVal: number;
  label: string;
}

export interface ExtensionsConfig {
  galleryAndEndings: {
    enabled: boolean;
    enableCgGallery: boolean;
    enableSceneReplay: boolean;
    enableEndingBook: boolean;
  };
  affectionSystem: {
    enabled: boolean;
    tracks: AffectionTrack[];
  };
  sixSlotSaveScreen: {
    enabled: boolean;
  };
  playerCustomName: {
    enabled: boolean;
    defaultName: string;
    promptAtStart: boolean;
    promptText: string;
  };
  autoSaveBeforeChoice: {
    enabled: boolean;
  };
  chapterTitleCard: {
    enabled: boolean;
    duration: number;
    style: 'minimal' | 'cinematic' | 'ink';
  };
  /** Smooth deactivation record for deprecated legacy extensions if opened from older projects */
  legacyDeprecatedExtensions?: Array<{ id: string; name: string; disabled: boolean }>;
}

export interface LanguageEntry {
  code: string; // e.g., 'en', 'ja', 'ko', 'zh_TW'
  name: string; // e.g., 'English', '日本語', '한국어'
  fontAssetId?: string | null;
  imageOverrides: Record<string, string>; // originalAssetId -> replacementAssetId
  translations: Record<string, string>; // translationKey -> translatedText
}

export interface LocalizationConfig {
  defaultLanguage: string;
  languages: LanguageEntry[];
}

export interface FlowLayoutConfig {
  direction: 'TB' | 'LR';
  nodePositions: Record<string, { x: number; y: number }>;
  showCausalLinks: boolean;
}

export interface ProjectMeta {
  id: string;
  schemaVersion: number;
  title: string;
  version: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  startSceneId: string;
  cjkFontAutoUpgraded?: boolean;
}

export interface ProjectData {
  meta: ProjectMeta;
  chapters: Chapter[];
  scenes: Scene[];
  characters: Character[];
  variables: StoryVariable[];
  assets: AssetEntry[];
  appearance: AppearanceConfig;
  extensions: ExtensionsConfig;
  localization: LocalizationConfig;
  flowLayout: FlowLayoutConfig;
}

export interface RecentProjectItem {
  path: string;
  title: string;
  updatedAt: string;
  sceneCount: number;
  characterCount: number;
}

export interface ProjectSnapshotMeta {
  id: string;
  label: string;
  kind: 'auto' | 'milestone' | 'manual';
  createdAt: string;
  sceneCount: number;
  blockCount: number;
}

export interface SnapshotPreviewData {
  meta: ProjectSnapshotMeta;
  title: string;
  chapters: Array<{ id: string; name: string; disabled: boolean }>;
  scenes: Array<{ id: string; name: string; blockCount: number; sampleLine?: string }>;
  characters: Array<{ id: string; name: string; expressionCount: number }>;
  variableCount: number;
  assetCount: number;
  customFileCount: number;
}

export interface ProjectIssue {
  id: string;
  severity: 'error' | 'warning';
  code: string;
  title: string;
  whatHappened: string;
  impact: string;
  howToFix: string;
  sceneId?: string;
  blockId?: string;
  optionId?: string;
  assetId?: string;
  fixAction:
    | { type: 'jump_to_block'; sceneId: string; blockId: string }
    | { type: 'replace_asset'; assetId: string }
    | { type: 'connect_option'; sceneId: string; blockId: string; optionId: string }
    | { type: 'connect_orphan_scene'; sceneId: string }
    | { type: 'set_start_scene'; sceneId: string }
    | { type: 'fix_cjk_font' }
    | { type: 'open_appearance' };
}

// ==========================================
// Built-in AI Assistant Types
// ==========================================

export type AiProviderPreset = 'deepseek' | 'openai' | 'moonshot' | 'qwen' | 'siliconflow' | 'custom';

export interface AiSettings {
  provider: AiProviderPreset;
  baseUrl: string;
  model: string;
  hasApiKey: boolean; // renderer never sees plaintext secret after saving unless explicitly editing
  maskedKey?: string;
}

export interface AiOperationRecord {
  id: string;
  action: 'read' | 'write' | 'edit' | 'delete' | 'check';
  status: 'pending' | 'running' | 'done' | 'failed';
  target: string; // friendly scene name or filename
  summary: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reasoningDurationSec?: number;
  operations?: AiOperationRecord[];
  snapshotIdBefore?: string;
  error?: string;
  createdAt: string;
}

export interface AiEditorContext {
  activeTab: WorkspaceTab;
  activeSceneId?: string | null;
  activeSceneName?: string | null;
  selectedBlockId?: string | null;
  selectedBlockSummary?: string | null;
  selectedCharacterId?: string | null;
  selectedCharacterName?: string | null;
  selectedAssetId?: string | null;
  selectedAssetName?: string | null;
  activeLanguageCode?: string | null;
  activeLanguageName?: string | null;
}

// ==========================================
// Live Ren'Py Mirror & Timeline Debugger
// ==========================================

export interface LiveRenpyState {
  running: boolean;
  mirrorActive: boolean;
  currentSceneId?: string | null;
  currentBlockId?: string | null;
  variables: Record<string, number | boolean | string>;
  callStack: string[];
  frameDataUrl?: string | null;
  revision: number;
}

export interface TimelineStep {
  index: number;
  sceneId: string;
  sceneName: string;
  blockId: string;
  summary: string;
  choiceTakenLabel?: string;
  variablesSnapshot: Record<string, number | boolean | string>;
  callStack: string[];
  stageSnapshot: PreviewStageState;
}

export interface ActiveSpriteState {
  characterId: string;
  expression?: string;
  outfit?: string;
  assetId?: string;
  slot: SpriteSlot;
  x?: number;
  y?: number;
  scale: number;
  rotation: number;
  alpha: number;
  zOrder: number;
}

export interface PreviewStageState {
  backgroundAssetId: string | null;
  backgroundColor: string;
  multilayerLayers: StageLayer[];
  isolatedLayerId?: string | null;
  sprites: ActiveSpriteState[];
  camera: {
    panX: number;
    panY: number;
    zoom: number;
    shake: 'none' | 'light' | 'medium' | 'heavy';
    blur: number;
    vignette: number;
    lutPreset: LutPreset;
    particles: ParticlePreset;
    particleIntensity: number;
  };
  bgmAssetId: string | null;
  videoOverlay?: { assetId: string; mode: VideoBlock['mode'] } | null;
  speakerName: string | null;
  speakerColor: string;
  speakerAvatarAssetId?: string | null;
  speakerDialogueBoxBgAssetId?: string | null;
  text: string;
  nvlMode: boolean;
  nvlHistory: Array<{ speaker: string | null; text: string; color: string }>;
  activeChoice?: {
    blockId: string;
    prompt?: string;
    options: Array<{
      option: ChoiceOption;
      visible: boolean;
      enabled: boolean;
      disabledHint?: string;
    }>;
  } | null;
  activeEnding?: {
    title: string;
    subtitle?: string;
    cgAssetId?: string;
  } | null;
  activeNameInput?: {
    prompt: string;
    defaultName: string;
  } | null;
  activeChapterCard?: string | null;
  variables: Record<string, number | boolean | string>;
}

// ==========================================
// Offline ASR & Reuse Library Types
// ==========================================

export interface AsrTranscriptItem {
  id: string;
  fileName: string;
  tempWavPath?: string;
  sourceFilePath?: string;
  text: string;
  speakerId: string | null;
  durationSec: number;
  status: 'pending' | 'transcribing' | 'done' | 'error';
  error?: string;
}

export type ReuseItemKind = 'character' | 'chapter' | 'scene' | 'snippet';

export interface ReuseLibraryItem {
  id: string;
  kind: ReuseItemKind;
  name: string;
  description: string;
  createdAt: string;
  sourceProjectTitle: string;
  payload: unknown;
}

export interface ExportTargetStatus {
  target: 'win' | 'mac' | 'linux' | 'pc' | 'web' | 'android';
  label: string;
  available: boolean;
  reason?: string;
}

export interface ExportResult {
  success: boolean;
  target: ExportTargetStatus['target'];
  outputDir?: string;
  executablePath?: string;
  verifiedLaunchable?: boolean;
  message: string;
}

export interface AdvancedFileEntry {
  relativePath: string;
  name: string;
  size: number;
  isManagedByGui: boolean;
}
