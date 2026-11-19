/**
 * Complete Ren'Py 8.x Project Compiler
 * Translates canonical ProjectData into clean, idiomatic, lint-clean Ren'Py scripts:
 * - game/options.rpy
 * - game/gui.rpy
 * - game/screens.rpy
 * - game/guie_definitions.rpy
 * - game/guie_extensions.rpy
 * - game/script.rpy
 * - game/tl/<lang>/guie_translations.rpy
 *
 * CRITICAL GUARANTEES:
 * 1. NEVER overwrites or deletes `game/custom_*.rpy` created by AI Assistant or Advanced Mode!
 * 2. Guarantees CJK font (`fonts/SourceHanSansLite.ttf`) is configured out-of-the-box so Chinese,
 *    Japanese, Korean, Latin-Extended & Cyrillic text renders cleanly with ZERO missing-glyph boxes.
 * 3. Compiles ALL 6 genuine playable extensions (CG/Replay/Ending gallery with real unlock persistence,
 *    Character Affection progress screen, 6-slot thumbnail save screen, Player Custom Name input,
 *    Pre-choice autosave, Chapter Title Card).
 * 4. Excludes soft-disabled chapters & scenes from execution, replay, and completion statistics.
 */

import path from 'node:path';
import type {
  ChoiceOption,
  ConditionGroup,
  ConditionRule,
  ProjectData,
  Scene,
  StateEffect,
  StoryBlock,
  StoryVariable,
  TransitionType,
} from '../shared/types';
import { extractLocalizableStrings, isSceneEffectivelyDisabled } from '../shared/defaults';

export interface CompiledFileMap {
  [relativePath: string]: string;
}

export function sanitizeIdentifier(raw: string, prefix = 'id'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_');
  if (!cleaned) return `${prefix}_empty`;
  return /^[0-9]/.test(cleaned) ? `${prefix}_${cleaned}` : cleaned;
}

export function sceneLabelName(sceneId: string): string {
  return `guie_sc_${sanitizeIdentifier(sceneId, 's')}`;
}

export function charDefineName(charId: string): string {
  return `guie_ch_${sanitizeIdentifier(charId, 'c')}`;
}

export function varPythonName(variable: StoryVariable): string {
  const base = `guie_v_${sanitizeIdentifier(variable.id, 'v')}`;
  return variable.persistent ? `persistent.${base}` : base;
}

export function escapeRenpyString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
    .replace(/%/g, '%%');
}

/**
 * Converts creator-friendly inline dialogue text (including visual rich-text tokens and
 * `{状态:好感度}` / `{玩家名字}` interpolations) into safe Ren'Py dialogue string.
 */
export function compileDialogueText(raw: string, project: ProjectData): string {
  // 1. Preserve creator-friendly variable interpolations & valid Ren'Py rich-text tags with sentinels
  const vars: string[] = [];
  const tags: string[] = [];
  let text = raw.replace(/\{玩家名字\}|\[player_name\]/g, () => {
    const idx = vars.push('guie_player_name') - 1;
    return `\uE000V${idx}\uE001`;
  });
  text = text.replace(/\{状态:([^}]+)\}/g, (_m, varName: string) => {
    const found = project.variables.find((v) => v.name === varName.trim());
    if (!found) return varName;
    const idx = vars.push(varPythonName(found)) - 1;
    return `\uE000V${idx}\uE001`;
  });
  text = text.replace(
    /\{(\/?(?:b|i|u|s|color|size|cps|p|w)(?:=[^}]+)?)\}/g,
    (_m, inner: string) => {
      const idx = tags.push(inner) - 1;
      return `\uE000T${idx}\uE001`;
    }
  );

  // 2. Escape raw brackets/braces so literal `[微笑]` or `{笑}` NEVER crashes Ren'Py interpolation
  text = text
    .replace(/\[/g, '[[')
    .replace(/\{/g, '{{')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, '\\n')
    .replace(/%/g, '%%');

  // 3. Restore valid variable interpolations & rich-text tags
  text = text.replace(/\uE000V(\d+)\uE001/g, (_m, i) => `[${vars[Number(i)]}]`);
  text = text.replace(/\uE000T(\d+)\uE001/g, (_m, i) => `{${tags[Number(i)]}}`);
  return text;
}

export function compileTransitionExpr(t: TransitionType, duration = 0.5): string {
  const d = Math.max(0.05, Number(duration) || 0.5);
  switch (t) {
    case 'none':
      return '';
    case 'dissolve':
      return `with Dissolve(${d.toFixed(2)})`;
    case 'fade':
      return `with Fade(${(d * 0.45).toFixed(2)}, ${(d * 0.1).toFixed(2)}, ${(d * 0.45).toFixed(2)})`;
    case 'wipeleft':
      return `with CropMove(${d.toFixed(2)}, "wipeleft")`;
    case 'wiperight':
      return `with CropMove(${d.toFixed(2)}, "wiperight")`;
    case 'slideleft':
      return `with CropMove(${d.toFixed(2)}, "slideleft")`;
    case 'slideright':
      return `with CropMove(${d.toFixed(2)}, "slideright")`;
    case 'blinds':
      return 'with blinds';
    case 'pixellate':
      return `with Pixellate(${d.toFixed(2)}, 5)`;
    case 'irisout':
      return `with CropMove(${d.toFixed(2)}, "irisout")`;
    case 'vpunch':
      return 'with vpunch';
    case 'hpunch':
      return 'with hpunch';
  }
}

export function compileConditionRule(rule: ConditionRule, project: ProjectData): string {
  const v = project.variables.find((item) => item.id === rule.variableId);
  if (!v) return 'True';
  const pyName = varPythonName(v);
  if (v.type === 'boolean') {
    return rule.operator === 'is_false' ? `(not ${pyName})` : `bool(${pyName})`;
  }
  if (v.type === 'number') {
    const num = Number(rule.value);
    const safeNum = Number.isFinite(num) ? num : 0;
    const op = ['==', '!=', '>', '>=', '<', '<='].includes(rule.operator) ? rule.operator : '>=';
    return `(${pyName} ${op} ${safeNum})`;
  }
  const strLit = `"${escapeRenpyString(String(rule.value ?? ''))}"`;
  if (rule.operator === 'contains') {
    return `(${strLit} in str(${pyName}))`;
  }
  const op = rule.operator === '!=' ? '!=' : '==';
  return `(str(${pyName}) ${op} ${strLit})`;
}

export function compileConditionGroup(group: ConditionGroup | undefined, project: ProjectData): string {
  if (!group || group.rules.length === 0) return 'True';
  const compiled = group.rules.map((r) => compileConditionRule(r, project));
  if (group.logic === 'any') return `(${compiled.join(' or ')})`;
  if (group.logic === 'not') return `(not (${compiled.join(' and ')}))`;
  return `(${compiled.join(' and ')})`;
}

export function compileEffectLines(effect: StateEffect, project: ProjectData, indent = '    '): string[] {
  const v = project.variables.find((item) => item.id === effect.variableId);
  if (!v) return [];
  const pyName = varPythonName(v);
  if (v.type === 'boolean') {
    return [`${indent}$ ${pyName} = ${effect.value ? 'True' : 'False'}`];
  }
  if (v.type === 'number') {
    const num = Number(effect.value);
    const safeNum = Number.isFinite(num) ? num : 0;
    if (effect.op === 'add') return [`${indent}$ ${pyName} += ${safeNum}`];
    if (effect.op === 'sub') return [`${indent}$ ${pyName} -= ${safeNum}`];
    return [`${indent}$ ${pyName} = ${safeNum}`];
  }
  return [`${indent}$ ${pyName} = "${escapeRenpyString(String(effect.value ?? ''))}"`];
}

function resolveAssetRelToGame(project: ProjectData, assetId?: string | null): string | null {
  if (!assetId) return null;
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) return null;
  // Ren'Py image/audio paths are relative to `game/`
  return asset.relativePath.replace(/^game[\\/]/i, '').replace(/\\/g, '/');
}

function hexToRgbaRenpy(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.padEnd(6, '0').slice(0, 6);
  const alphaHex = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${full}${alphaHex}`;
}

export function compileProjectToRenpy(project: ProjectData): CompiledFileMap {
  const files: CompiledFileMap = {};
  files['game/options.rpy'] = generateOptionsRpy(project);
  files['game/gui.rpy'] = generateGuiRpy(project);
  files['game/guie_definitions.rpy'] = generateDefinitionsRpy(project);
  files['game/guie_extensions.rpy'] = generateExtensionsRpy(project);
  files['game/screens.rpy'] = generateScreensRpy(project);
  files['game/script.rpy'] = generateScriptRpy(project);

  // Generate multi-language translation files
  const localizable = extractLocalizableStrings(project);
  for (const lang of project.localization.languages) {
    const langCode = sanitizeIdentifier(lang.code, 'lang');
    files[`game/tl/${langCode}/guie_translations.rpy`] = generateLanguageRpy(project, lang, localizable);
  }

  return files;
}

function generateOptionsRpy(project: ProjectData): string {
  const title = escapeRenpyString(project.appearance.window.title || project.meta.title);
  const version = escapeRenpyString(project.meta.version || '1.0.0');
  const safeSaveDir = sanitizeIdentifier(project.meta.id, 'guie_game');
  const iconRel = resolveAssetRelToGame(project, project.appearance.window.iconAssetId);

  return `# =============================================================
# Auto-generated by GUIE Studio (Do not edit manually in Creator Mode)
# Custom scripts should be placed in game/custom_*.rpy
# =============================================================

define config.name = _("${title}")
define gui.show_name = ${project.appearance.window.showWindowTitle ? 'True' : 'False'}
define config.version = "${version}"
define gui.about = _p("""${escapeRenpyString(project.meta.author || '创作者')} 制作""")
define build.name = "${safeSaveDir}"
define config.save_directory = "${safeSaveDir}"
define config.has_sound = True
define config.has_music = True
define config.has_voice = True
define config.enter_transition = dissolve
define config.exit_transition = dissolve
define config.intra_transition = dissolve
define config.after_load_transition = None
define config.end_game_transition = fade
define config.window = "auto"
define config.window_show_transition = Dissolve(.2)
define config.window_hide_transition = Dissolve(.2)
default preferences.text_cps = ${Math.round(project.appearance.dialogueBox.typingCps || 36)}
default preferences.afm_time = 15
default preferences.fullscreen = ${project.appearance.window.fullscreenDefault ? 'True' : 'False'}
${iconRel ? `define config.window_icon = "${iconRel}"` : ''}

init python:
    build.classify('**~', None)
    build.classify('**.bak', None)
    build.classify('**/.**', None)
    build.classify('**/#**', None)
    build.classify('**/thumbs.db', None)
    build.classify('.guie/**', None)
    build.classify('guie.project.json', None)
    build.classify('game/_guie_bridge.rpy', None)
    build.classify('game/_guie_bridge.rpyc', None)
    build.classify('game/**.png', 'archive')
    build.classify('game/**.jpg', 'archive')
    build.classify('game/**.webp', 'archive')
    build.classify('game/**.ogg', 'archive')
    build.classify('game/**.mp3', 'archive')
    build.classify('game/**.wav', 'archive')
    build.classify('game/**.ttf', 'archive')
    build.classify('game/**.otf', 'archive')
`;
}

function generateGuiRpy(project: ProjectData): string {
  const { appearance } = project;
  const w = appearance.window.width || 1920;
  const h = appearance.window.height || 1080;
  const bundledCjk = appearance.font.bundledCjkFont || 'fonts/SourceHanSansLite.ttf';
  const customGlobalFont = resolveAssetRelToGame(project, appearance.font.globalFontAssetId);
  const customDialogueFont = resolveAssetRelToGame(project, appearance.dialogueBox.fontAssetId);
  const globalFontExpr = customGlobalFont ? `"${customGlobalFont}"` : 'guie_multilang_font';
  const dialogueFontExpr = customDialogueFont
    ? `"${customDialogueFont}"`
    : customGlobalFont
    ? `"${customGlobalFont}"`
    : 'guie_multilang_font';
  const sixSlot = project.extensions.sixSlotSaveScreen.enabled;

  return `# =============================================================
# Auto-generated Appearance & CJK+LatinExt+Cyrillic GUI Configuration
# =============================================================

init offset = -2
init python:
    gui.init(${w}, ${h})

# Open-source composite FontGroup: DejaVuSans for Latin Extended & Cyrillic + SourceHanSansLite for CJK/Kana/Hangul
define guie_multilang_font = FontGroup().add("DejaVuSans.ttf", 0x0080, 0x052F).add("DejaVuSans.ttf", 0x1E00, 0x1EFF).add("${bundledCjk}", 0x0000, 0xFFFF)

define gui.accent_color = '${appearance.theme.accentColor}'
define gui.idle_color = '${appearance.theme.idleColor}'
define gui.idle_small_color = '${appearance.theme.idleColor}'
define gui.hover_color = '${appearance.theme.hoverColor}'
define gui.selected_color = '#ffffff'
define gui.insensitive_color = '#8888887f'
define gui.muted_color = '#444444'
define gui.hover_muted_color = '#666666'
define gui.text_color = '${appearance.dialogueBox.textColor || '#FFFFFF'}'
define gui.interface_text_color = '#ffffff'

# CJK & Multi-language bundled font (prevents missing glyph boxes)
define gui.text_font = ${dialogueFontExpr}
define gui.name_text_font = ${globalFontExpr}
define gui.interface_text_font = ${globalFontExpr}

define gui.text_size = ${Math.round(appearance.dialogueBox.fontSize || 30)}
define gui.name_text_size = ${Math.round(appearance.dialogueBox.nameFontSize || 34)}
define gui.interface_text_size = ${Math.round(appearance.font.interfaceSize || 24)}
define gui.label_text_size = ${Math.round((appearance.font.interfaceSize || 24) + 6)}
define gui.notify_text_size = 20
define gui.title_text_size = 64

define gui.textbox_height = ${Math.round(appearance.dialogueBox.boxHeight || 270)}
define gui.textbox_yalign = 1.0
define gui.name_xpos = ${Math.round(appearance.dialogueBox.paddingX || 48)}
define gui.name_ypos = 12
define gui.name_xalign = 0.0
define gui.dialogue_xpos = ${Math.round(appearance.dialogueBox.paddingX || 48)}
define gui.dialogue_ypos = ${Math.round((appearance.dialogueBox.paddingY || 28) + 38)}
define gui.dialogue_width = ${Math.max(400, w - Math.round((appearance.dialogueBox.paddingX || 48) * 2))}
define gui.dialogue_text_xalign = 0.0

define gui.choice_button_width = ${Math.round(w * 0.62)}
define gui.choice_button_height = None
define gui.choice_button_text_color = '${appearance.buttons.textColor}'
define gui.choice_button_text_hover_color = '#ffffff'
define gui.choice_button_text_insensitive_color = '#999999'

define gui.file_slot_cols = ${sixSlot ? 3 : 2}
define gui.file_slot_rows = ${sixSlot ? 2 : 3}
define gui.slot_button_width = ${sixSlot ? 420 : 560}
define gui.slot_button_height = ${sixSlot ? 290 : 124}
define config.thumbnail_width = ${sixSlot ? 384 : 160}
define config.thumbnail_height = ${sixSlot ? 216 : 90}

define gui.nvl_borders = Borders(0, 15, 0, 30)
define gui.nvl_list_length = 6
define gui.nvl_height = 145
define gui.nvl_spacing = 15
define gui.nvl_name_xpos = 280
define gui.nvl_name_ypos = 0
define gui.nvl_name_width = 220
define gui.nvl_name_xalign = 1.0
define gui.nvl_text_xpos = 320
define gui.nvl_text_ypos = 8
define gui.nvl_text_width = ${Math.max(600, w - 520)}
define gui.nvl_text_xalign = 0.0

define guie_box_bg_color = "${hexToRgbaRenpy(appearance.dialogueBox.boxBgColor, appearance.dialogueBox.boxOpacity)}"
define guie_btn_bg_color = "${appearance.buttons.bgColor}"
define guie_btn_hover_color = "${appearance.buttons.hoverBgColor}"
define guie_btn_border_color = "${appearance.buttons.borderColor || '#4A433B'}"
define guie_menu_bg_color = "${appearance.theme.menuBgColor}"
define guie_text_shadow_offset = ${appearance.dialogueBox.textShadow ? '(2, 2)' : '(0, 0)'}
define guie_text_shadow_color = "${appearance.dialogueBox.shadowColor || '#000000'}"
define guie_text_bold = ${(appearance.dialogueBox.fontWeight || 400) >= 600 ? 'True' : 'False'}
define guie_text_kerning = ${(Number(appearance.dialogueBox.letterSpacing) || 0).toFixed(1)}
define guie_line_spacing = ${Math.max(0, Math.round(((appearance.dialogueBox.lineHeight || 1.5) - 1.1) * 18))}
`;
}

function generateDefinitionsRpy(project: ProjectData): string {
  const lines: string[] = [
    '# =============================================================',
    '# Auto-generated Characters, Story Variables, Assets & Transforms',
    '# =============================================================',
    '',
    `default guie_player_name = "${escapeRenpyString(project.extensions.playerCustomName.defaultName || '主角')}"`,
    'default guie_current_chapter = ""',
    '',
  ];

  // Story Variables
  for (const v of project.variables) {
    const pyName = varPythonName(v);
    let initExpr: string;
    if (v.type === 'number') initExpr = String(Number(v.initialValue) || 0);
    else if (v.type === 'boolean') initExpr = v.initialValue ? 'True' : 'False';
    else initExpr = `"${escapeRenpyString(String(v.initialValue ?? ''))}"`;
    lines.push(`default ${pyName} = ${initExpr}`);
  }
  lines.push('');

  // Characters (both ADV and NVL variants)
  for (const ch of project.characters) {
    const defName = charDefineName(ch.id);
    const charFont = resolveAssetRelToGame(project, ch.fontAssetId);
    const avatarPath = resolveAssetRelToGame(project, ch.avatarAssetId);
    const charBoxBg = resolveAssetRelToGame(project, ch.dialogueBoxBgAssetId);
    const extraArgs: string[] = [
      `who_color="${ch.color || '#FFB399'}"`,
    ];
    if (charFont) extraArgs.push(`what_font="${charFont}"`);
    if (charBoxBg) extraArgs.push(`window_background=Frame("${charBoxBg}", 0, 0)`);
    if (avatarPath) {
      const sideTag = sanitizeIdentifier(ch.id, 'side');
      lines.push(`image side ${sideTag} = im.Scale("${avatarPath}", 180, 180)`);
      extraArgs.push(`image="${sideTag}"`);
    }
    lines.push(`define ${defName} = Character(_("${escapeRenpyString(ch.name)}"), ${extraArgs.join(', ')})`);
    lines.push(`define ${defName}_nvl = Character(_("${escapeRenpyString(ch.name)}"), kind=nvl, ${extraArgs.join(', ')})`);

    // Character expression images
    const charTag = sanitizeIdentifier(ch.id, 'ch');
    for (const exp of ch.expressions) {
      const rel = resolveAssetRelToGame(project, exp.assetId);
      if (rel) {
        const expTag = sanitizeIdentifier(exp.id, 'exp');
        lines.push(`image guie_sp_${charTag} ${expTag} = "${rel}"`);
      }
    }
  }
  lines.push('');

  // Dynamic multilingual dialogue translation hook (translates all dialogue/narration when player switches language!)
  if (project.localization.languages.length > 0) {
    lines.push('init python:');
    lines.push('    def _guie_replace_translated_text(s):');
    lines.push('        if _preferences.language and s:');
    lines.push('            return renpy.translate_string(s)');
    lines.push('        return s');
    lines.push('    config.replace_text = _guie_replace_translated_text');
    lines.push('');
  }

  // Background, UI, CG, Video image definitions
  for (const asset of project.assets) {
    const rel = resolveAssetRelToGame(project, asset.id);
    if (!rel) continue;
    const tag = sanitizeIdentifier(asset.id, 'ast');
    if (asset.category === 'background' || asset.category === 'ui') {
      lines.push(`image guie_bg_${tag} = "${rel}"`);
    } else if (asset.category === 'video') {
      lines.push(`image guie_vid_${tag} = Movie(play="${rel}", loop=True)`);
      lines.push(`image guie_vid_noloop_${tag} = Movie(play="${rel}", loop=False)`);
    }
  }
  lines.push('');

  // Standard sprite positions, camera transforms, LUT filters & weather particles
  lines.push(`
# Standard Multi-Character Stage Slots
transform guie_slot_farleft:
    xalign 0.08
    yalign 1.0
transform guie_slot_left:
    xalign 0.25
    yalign 1.0
transform guie_slot_center:
    xalign 0.5
    yalign 1.0
transform guie_slot_right:
    xalign 0.75
    yalign 1.0
transform guie_slot_farright:
    xalign 0.92
    yalign 1.0

transform guie_sprite_custom(px=0.5, py=1.0, sc=1.0, rot=0.0, al=1.0):
    xalign px
    yalign py
    zoom sc
    rotate rot
    alpha al

transform guie_cam_fx(px=0, py=0, zm=1.0, dur=0.8, bl=0.0):
    parallel:
        ease dur xoffset px yoffset py zoom zm
    parallel:
        blur bl

transform guie_cam_shake_light:
    linear 0.05 xoffset -6 yoffset 4
    linear 0.05 xoffset 6 yoffset -4
    linear 0.05 xoffset -4 yoffset -2
    linear 0.05 xoffset 0 yoffset 0

transform guie_cam_shake_medium:
    linear 0.04 xoffset -14 yoffset 8
    linear 0.04 xoffset 14 yoffset -8
    linear 0.04 xoffset -10 yoffset 6
    linear 0.04 xoffset 10 yoffset -6
    linear 0.04 xoffset 0 yoffset 0

transform guie_cam_shake_heavy:
    linear 0.04 xoffset -24 yoffset 16
    linear 0.04 xoffset 24 yoffset -16
    linear 0.04 xoffset -18 yoffset 12
    linear 0.04 xoffset 18 yoffset -12
    linear 0.04 xoffset 0 yoffset 0

# Lightweight built-in atmospheric particle displayables (zero external image dependency)
image guie_particle_snow = SnowBlossom(Solid("#FFFFFFCC", xsize=8, ysize=8), count=55, border=30, xspeed=(-25, 25), yspeed=(60, 130), start=3.0)
image guie_particle_rain = SnowBlossom(Solid("#CFE8FF99", xsize=2, ysize=28), count=90, border=30, xspeed=(-15, -5), yspeed=(520, 760), start=1.0)
image guie_particle_petals = SnowBlossom(Solid("#FFB7C5DD", xsize=12, ysize=8), count=35, border=40, xspeed=(-45, 45), yspeed=(45, 95), start=4.0)
image guie_particle_leaves = SnowBlossom(Solid("#D97736DD", xsize=14, ysize=9), count=30, border=40, xspeed=(-55, 35), yspeed=(55, 110), start=4.0)
image guie_particle_sparkles = SnowBlossom(Solid("#FFE899DD", xsize=6, ysize=6), count=40, border=30, xspeed=(-12, 12), yspeed=(-40, -15), start=3.0)

# Color grading LUT overlay tints & camera vignette frame
image guie_lut_warm = Solid("#FF9E4422")
image guie_lut_cool = Solid("#3B82F622")
image guie_lut_sepia = Solid("#70421433")
image guie_lut_noir = Solid("#0F172A44")
image guie_lut_sunset = Solid("#F9731630")
image guie_lut_dreamy = Solid("#F472B622")
image guie_vignette_overlay = Frame(Solid("#00000055"), 80, 60)
`);

  // Generate custom keyframe transforms for sprite blocks with keyframes
  for (const scene of project.scenes) {
    for (const blk of scene.blocks) {
      if (blk.type === 'sprite' && blk.keyframes && blk.keyframes.length > 0) {
        const tfName = `guie_kf_${sanitizeIdentifier(blk.id, 'k')}`;
        lines.push(`transform ${tfName}:`);
        for (const kf of blk.keyframes) {
          const easeCmd = kf.easing === 'linear' ? 'linear' : kf.easing === 'easein' ? 'easein' : kf.easing === 'easeout' ? 'easeout' : 'ease';
          lines.push(
            `    ${easeCmd} ${Math.max(0.05, kf.timeSec).toFixed(2)} xalign ${kf.x.toFixed(3)} yalign ${kf.y.toFixed(3)} zoom ${kf.scale.toFixed(2)} rotate ${kf.rotation.toFixed(1)} alpha ${kf.alpha.toFixed(2)}`
          );
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function generateExtensionsRpy(project: ProjectData): string {
  const activeScenes = project.scenes.filter((s) => !isSceneEffectivelyDisabled(project, s));
  const cgItems: Array<{ id: string; title: string; path: string }> = [];
  const endings: Array<{ id: string; title: string; subtitle: string }> = [];

  for (const asset of project.assets) {
    if (asset.isCg) {
      const rel = resolveAssetRelToGame(project, asset.id);
      if (rel) cgItems.push({ id: asset.id, title: asset.cgTitle || asset.name, path: rel });
    }
  }
  for (const sc of activeScenes) {
    for (const blk of sc.blocks) {
      if (blk.type === 'cg_unlock') {
        const rel = resolveAssetRelToGame(project, blk.assetId);
        if (rel && !cgItems.some((c) => c.id === blk.cgId)) {
          cgItems.push({ id: blk.cgId, title: blk.title || '特别插画', path: rel });
        }
      } else if (blk.type === 'flow' && blk.action === 'ending') {
        const eid = blk.endingId || blk.id;
        if (!endings.some((e) => e.id === eid)) {
          endings.push({ id: eid, title: blk.endingTitle || '故事终章', subtitle: blk.endingSubtitle || '' });
        }
      } else if (blk.type === 'choice') {
        for (const opt of blk.options) {
          if (opt.targetType === 'ending') {
            const eid = opt.endingId || opt.id;
            if (!endings.some((e) => e.id === eid)) {
              endings.push({ id: eid, title: opt.endingTitle || '故事终章', subtitle: opt.endingSubtitle || '' });
            }
          }
        }
      }
    }
  }

  const replayItems = activeScenes.map((s) => ({
    id: s.id,
    label: sceneLabelName(s.id),
    name: escapeRenpyString(s.name),
  }));

  const affectionTracks = project.extensions.affectionSystem.tracks
    .map((tr) => {
      const ch = project.characters.find((c) => c.id === tr.characterId);
      const v = project.variables.find((item) => item.id === tr.variableId);
      if (!ch || !v) return null;
      return {
        charName: escapeRenpyString(ch.name),
        color: ch.color || '#FF5A3D',
        label: escapeRenpyString(tr.label || v.name),
        pyVar: varPythonName(v),
        maxVal: Math.max(1, tr.maxVal || 100),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const cardStyle = project.extensions.chapterTitleCard.style || 'minimal';
  const cardBg =
    cardStyle === 'ink' ? '#F3F0E8F2' : cardStyle === 'cinematic' ? '#09090BF5' : '#12100EE6';
  const cardTitleColor = cardStyle === 'ink' ? '#171513' : '#FFFFFF';
  const cardSubColor = cardStyle === 'cinematic' ? '#F59E0B' : '#FF5A3D';

  const enableCg = project.extensions.galleryAndEndings.enableCgGallery !== false;
  const enableReplay = project.extensions.galleryAndEndings.enableSceneReplay !== false;
  const enableEndings = project.extensions.galleryAndEndings.enableEndingBook !== false;
  const defaultExtrasTab = enableCg ? 'cg' : enableReplay ? 'replay' : 'endings';

  const lines: string[] = [
    '# =============================================================',
    '# Auto-generated Real Playable Extensions (Genuine Persistent Unlock & State)',
    '# =============================================================',
    '',
    'default persistent.guie_unlocked_cgs = []',
    'default persistent.guie_seen_scenes = []',
    'default persistent.guie_unlocked_endings = []',
    '',
    'init python:',
    '    def guie_unlock_cg(cg_id):',
    '        if cg_id and cg_id not in persistent.guie_unlocked_cgs:',
    '            persistent.guie_unlocked_cgs.append(cg_id)',
    '            renpy.save_persistent()',
    '',
    '    def guie_mark_scene_seen(scene_id):',
    '        if scene_id and scene_id not in persistent.guie_seen_scenes:',
    '            persistent.guie_seen_scenes.append(scene_id)',
    '            renpy.save_persistent()',
    '',
    '    def guie_unlock_ending(ending_id):',
    '        if ending_id and ending_id not in persistent.guie_unlocked_endings:',
    '            persistent.guie_unlocked_endings.append(ending_id)',
    '            renpy.save_persistent()',
    '',
    `    GUIE_CG_LIST = [`,
    ...cgItems.map((c) => `        ("${escapeRenpyString(c.id)}", "${escapeRenpyString(c.title)}", "${c.path}"),`),
    `    ]`,
    `    GUIE_REPLAY_SCENES = [`,
    ...replayItems.map((r) => `        ("${escapeRenpyString(r.id)}", "${r.label}", "${r.name}"),`),
    `    ]`,
    `    GUIE_ENDINGS_LIST = [`,
    ...endings.map((e) => `        ("${escapeRenpyString(e.id)}", "${escapeRenpyString(e.title)}", "${escapeRenpyString(e.subtitle)}"),`),
    `    ]`,
    '',
    '# Extension: Chapter Title Card Screen',
    'screen guie_chapter_card(chapter_title):',
    '    modal True',
    '    zorder 120',
    `    add Solid("${cardBg}")`,
    '    vbox:',
    '        xalign 0.5',
    '        yalign 0.5',
    '        spacing 16',
    `        text _("CHAPTER") size 22 color "${cardSubColor}" xalign 0.5`,
    `        text chapter_title size ${cardStyle === 'cinematic' ? 64 : 56} color "${cardTitleColor}" xalign 0.5`,
    `    timer ${Math.max(0.6, project.extensions.chapterTitleCard.duration || 2.2).toFixed(1)} action Return()`,
    '    key "dismiss" action Return()',
    '',
    '# Extension: Player Custom Name Input Screen',
    'screen guie_name_input_screen(prompt_text, default_name):',
    '    modal True',
    '    zorder 130',
    '    add Solid("#141210D8")',
    '    frame:',
    '        xalign 0.5',
    '        yalign 0.5',
    '        padding (48, 36)',
    '        background Solid("#221E1B")',
    '        vbox:',
    '            spacing 24',
    '            text prompt_text size 32 color "#FFFFFF" xalign 0.5',
    '            input value VariableInputValue("guie_player_name", default=True, returnable=True) length 20 size 32 color "#FFB399" xalign 0.5',
    '            textbutton _("确认开始"):',
    '                xalign 0.5',
    '                action Return(guie_player_name)',
    '',
    '# Extension: Genuine Unlocked CG Gallery / Scene Replay / Ending Collection',
    'screen guie_extras_screen():',
    '    tag menu',
    `    default extras_tab = "${defaultExtrasTab}"`,
    '    default viewing_cg = None',
    '    add Solid(guie_menu_bg_color)',
    '    vbox:',
    '        xpos 64 ypos 48 spacing 24 xsize config.screen_width - 128',
    '        hbox:',
    '            spacing 24',
    '            text _("鉴赏与收集册") size 40 color "#FFFFFF"',
    ...(enableCg ? ['            textbutton _("CG 鉴赏") action SetScreenVariable("extras_tab", "cg")'] : []),
    ...(enableReplay ? ['            textbutton _("已读回想") action SetScreenVariable("extras_tab", "replay")'] : []),
    ...(enableEndings ? ['            textbutton _("结局收集") action SetScreenVariable("extras_tab", "endings")'] : []),
    '            textbutton _("返回") action Return()',
    '        if extras_tab == "cg":',
    '            if not GUIE_CG_LIST:',
    '                text _("尚未在素材库或剧情中标记 CG 插画。") color "#CCCCCC" size 26',
    '            else:',
    '                vpgrid:',
    '                    cols 3 spacing 24',
    '                    for cg_id, cg_title, cg_path in GUIE_CG_LIST:',
    '                        if cg_id in persistent.guie_unlocked_cgs:',
    '                            button:',
    '                                background Solid("#26221E")',
    '                                hover_background Solid("#3A332D")',
    '                                padding (10, 10)',
    '                                action SetScreenVariable("viewing_cg", cg_path)',
    '                                vbox:',
    '                                    spacing 8',
    '                                    add im.Scale(cg_path, 380, 214)',
    '                                    text cg_title size 22 color "#FFFFFF"',
    '                        else:',
    '                            frame:',
    '                                xsize 400 ysize 254 background Solid("#2A2622")',
    '                                text _("未解锁") xalign 0.5 yalign 0.5 color "#888888" size 24',
    '        elif extras_tab == "replay":',
    '            text _("已解锁回想：%d / %d") % (len([x for x in GUIE_REPLAY_SCENES if x[0] in persistent.guie_seen_scenes]), len(GUIE_REPLAY_SCENES)) color "#FFB399" size 24',
    '            viewport:',
    '                scrollbars "vertical" mousewheel True ysize config.screen_height - 220',
    '                vbox:',
    '                    spacing 12',
    '                    for sid, slabel, sname in GUIE_REPLAY_SCENES:',
    '                        if sid in persistent.guie_seen_scenes:',
    '                            textbutton sname action Replay(slabel, locked=False)',
    '                        else:',
    '                            textbutton _("？？？ （需在正篇经历后解锁）") action None',
    '        else:',
    '            text _("已达成结局：%d / %d") % (len([x for x in GUIE_ENDINGS_LIST if x[0] in persistent.guie_unlocked_endings]), len(GUIE_ENDINGS_LIST)) color "#FFB399" size 24',
    '            vbox:',
    '                spacing 14',
    '                for eid, etitle, esub in GUIE_ENDINGS_LIST:',
    '                    if eid in persistent.guie_unlocked_endings:',
    '                        frame:',
    '                            padding (24, 16) background Solid("#2A2622") xfill True',
    '                            vbox:',
    '                                text etitle size 28 color "#FFFFFF"',
    '                                if esub:',
    '                                    text esub size 20 color "#CCCCCC"',
    '                    else:',
    '                        frame:',
    '                            padding (24, 16) background Solid("#1E1B18") xfill True',
    '                            text _("未达成结局 ？？？") size 24 color "#777777"',
    '    if viewing_cg:',
    '        button:',
    '            xfill True yfill True background Solid("#000000E8")',
    '            action SetScreenVariable("viewing_cg", None)',
    '            add viewing_cg xalign 0.5 yalign 0.5',
    '',
    '# Extension: Character Affection Progress Screen',
    'screen guie_affection_screen():',
    '    tag menu',
    '    add Solid(guie_menu_bg_color)',
    '    vbox:',
    '        xpos 80 ypos 56 spacing 28 xsize config.screen_width - 160',
    '        hbox:',
    '            spacing 28',
    '            text _("角色好感度进度") size 40 color "#FFFFFF"',
    '            textbutton _("返回") action Return()',
  ];

  if (affectionTracks.length === 0) {
    lines.push('        text _("请在扩展市场的好感度配置中绑定角色与状态变量。") color "#CCCCCC" size 26');
  } else {
    for (const tr of affectionTracks) {
      lines.push('        frame:');
      lines.push('            padding (24, 18) background Solid("#26221E") xfill True');
      lines.push('            vbox:');
      lines.push('                spacing 10');
      lines.push(`                hbox:`);
      lines.push(`                    spacing 16`);
      lines.push(`                    text "${tr.charName}" size 28 color "${tr.color}"`);
      lines.push(`                    text ("${tr.label}：%s / ${tr.maxVal}" % (${tr.pyVar})) substitute False size 24 color "#FFFFFF"`);
      lines.push(`                bar value StaticValue(max(0, min(${tr.maxVal}, int(${tr.pyVar}))), ${tr.maxVal}) xsize 640 ysize 18`);
    }
  }

  return lines.join('\n');
}

function generateScreensRpy(project: ProjectData): string {
  const boxBgImg = resolveAssetRelToGame(project, project.appearance.dialogueBox.backgroundAssetId);
  const boxBgDecl = boxBgImg ? `"${boxBgImg}"` : 'Solid(guie_box_bg_color)';
  const showExtras = project.extensions.galleryAndEndings.enabled;
  const showAffection = project.extensions.affectionSystem.enabled;
  const hasLanguages = project.localization.languages.length > 0;

  const langButtons = project.localization.languages
    .map(
      (l) =>
        `                textbutton "${escapeRenpyString(l.name)}" action Language("${sanitizeIdentifier(l.code, 'lang')}")`
    )
    .join('\n');

  return `# =============================================================
# Auto-generated Clean Playable Ren'Py Screens
# =============================================================

init offset = -1

style default:
    font gui.text_font
    size gui.text_size
    color gui.text_color
    outlines []

style button_text:
    font gui.interface_text_font
    size gui.interface_text_size
    idle_color gui.idle_color
    hover_color gui.hover_color
    selected_color gui.selected_color
    insensitive_color gui.insensitive_color

style choice_button:
    xsize gui.choice_button_width
    padding (28, 16)
    background Solid(guie_btn_bg_color)
    hover_background Solid(guie_btn_hover_color)
    insensitive_background Solid("#2A2A2AAA")
    xalign 0.5

style choice_button_text:
    font gui.interface_text_font
    size gui.interface_text_size
    idle_color gui.choice_button_text_color
    hover_color gui.choice_button_text_hover_color
    insensitive_color gui.choice_button_text_insensitive_color
    xalign 0.5

screen say(who, what):
    style_prefix "say"
    window:
        id "window"
        xfill True
        ysize gui.textbox_height
        yalign 1.0
        background ${boxBgDecl}
        if who is not None:
            window:
                id "namebox"
                xpos gui.name_xpos
                ypos gui.name_ypos
                background None
                text who id "who" size gui.name_text_size font gui.name_text_font
        text what id "what":
            xpos gui.dialogue_xpos
            ypos gui.dialogue_ypos
            xsize gui.dialogue_width
            size gui.text_size
            font gui.text_font
            color gui.text_color
            bold guie_text_bold
            kerning guie_text_kerning
            line_spacing guie_line_spacing
            drop_shadow guie_text_shadow_offset
            drop_shadow_color guie_text_shadow_color
    if not renpy.variant("small"):
        add SideImage() xalign 0.02 yalign 0.96

screen choice(items):
    style_prefix "choice"
    vbox:
        xalign 0.5
        yalign 0.45
        spacing 18
        for i in items:
            $ _item_sens = i.kwargs.get("sensitive", True)
            textbutton i.caption action (i.action if _item_sens else None) sensitive _item_sens

screen quick_menu():
    zorder 100
    if quick_menu:
        hbox:
            xalign 0.98
            yalign 0.98
            spacing 16
            textbutton _("回退") action Rollback()
            textbutton _("历史") action ShowMenu('history')
            textbutton _("快进") action Skip()
            textbutton _("自动") action Preference("auto-forward", "toggle")
            textbutton _("保存") action ShowMenu('save')
            textbutton _("读取") action ShowMenu('load')
${showAffection ? '            textbutton _("好感度") action ShowMenu("guie_affection_screen")' : ''}
            textbutton _("设置") action ShowMenu('preferences')

default quick_menu = True
init python:
    config.overlay_screens.append("quick_menu")

screen main_menu():
    tag menu
    add Solid(guie_menu_bg_color)
    vbox:
        xpos 110
        yalign 0.5
        spacing 24
        if gui.show_name:
            text "[config.name!t]" size gui.title_text_size color "#FFFFFF"
        textbutton _("开始游戏") action Start()
        textbutton _("读取存档") action ShowMenu("load")
${showExtras ? '        textbutton _("鉴赏与收集册") action ShowMenu("guie_extras_screen")' : ''}
${showAffection ? '        textbutton _("好感度") action ShowMenu("guie_affection_screen")' : ''}
        textbutton _("游戏设置") action ShowMenu("preferences")
        textbutton _("退出游戏") action Quit(confirm=not main_menu)

screen game_menu(title, scroll=None, yinitial=0.0):
    add Solid(guie_menu_bg_color)
    vbox:
        xpos 64 ypos 48 spacing 24 xsize config.screen_width - 128
        hbox:
            spacing 28
            text title size 40 color "#FFFFFF"
            textbutton _("保存") action ShowMenu("save")
            textbutton _("读取") action ShowMenu("load")
            textbutton _("历史") action ShowMenu("history")
            textbutton _("设置") action ShowMenu("preferences")
${showExtras ? '            textbutton _("鉴赏") action ShowMenu("guie_extras_screen")' : ''}
${showAffection ? '            textbutton _("好感度") action ShowMenu("guie_affection_screen")' : ''}
            textbutton _("主菜单") action MainMenu()
            textbutton _("返回") action Return()
        transclude

screen save():
    tag menu
    use file_slots(_("保存进度"))

screen load():
    tag menu
    use file_slots(_("读取进度"))

screen file_slots(title):
    default page_name_value = FilePageNameInputValue(pattern=_("第 {} 页"), auto=_("自动存档"), quick=_("快速存档"))
    use game_menu(title):
        vbox:
            spacing 18
            hbox:
                spacing 16
                textbutton _("自动存档") action FilePage("auto")
                textbutton _("快速存档") action FilePage("quick")
                for page in range(1, 7):
                    textbutton "[page]" action FilePage(page)
            grid gui.file_slot_cols gui.file_slot_rows:
                spacing 24
                for i in range(gui.file_slot_cols * gui.file_slot_rows):
                    $ slot = i + 1
                    button:
                        xsize gui.slot_button_width
                        ysize gui.slot_button_height
                        background Solid("#26221E")
                        hover_background Solid("#3A332D")
                        padding (14, 14)
                        action FileAction(slot)
${
  project.extensions.sixSlotSaveScreen.enabled
    ? `                        vbox:
                            spacing 6
                            add FileScreenshot(slot) xalign 0.5
                            text FileTime(slot, format=_("%Y-%m-%d %H:%M"), empty=_("空存档槽位")) size 18 color "#E5DFD3"
                            text FileSaveName(slot) size 16 color "#FFB399"`
    : `                        hbox:
                            spacing 14
                            add FileScreenshot(slot) yalign 0.5
                            vbox:
                                yalign 0.5
                                spacing 6
                                text FileTime(slot, format=_("%Y-%m-%d %H:%M"), empty=_("空存档槽位")) size 18 color "#E5DFD3"
                                text FileSaveName(slot) size 16 color "#FFB399"`
}

screen history():
    tag menu
    predict False
    use game_menu(_("对话历史")):
        viewport:
            scrollbars "vertical" mousewheel True ysize config.screen_height - 200
            vbox:
                spacing 14
                for h in _history_list:
                    vbox:
                        if h.who:
                            text h.who size 24 color "#FFB399"
                        text h.what size 24 color "#FFFFFF"

screen preferences():
    tag menu
    use game_menu(_("游戏设置")):
        vbox:
            spacing 24
            hbox:
                spacing 24
                text _("显示模式") size 26 color "#FFFFFF"
                textbutton _("窗口") action Preference("display", "window")
                textbutton _("全屏") action Preference("display", "fullscreen")
            hbox:
                spacing 24
                text _("文字速度") size 26 color "#FFFFFF"
                bar value Preference("text speed") xsize 360
            hbox:
                spacing 24
                text _("音乐音量") size 26 color "#FFFFFF"
                bar value Preference("music volume") xsize 360
            hbox:
                spacing 24
                text _("音效音量") size 26 color "#FFFFFF"
                bar value Preference("sound volume") xsize 360
            hbox:
                spacing 24
                text _("语音音量") size 26 color "#FFFFFF"
                bar value Preference("voice volume") xsize 360
${
  hasLanguages
    ? `            hbox:
                spacing 20
                text _("游戏语言") size 26 color "#FFFFFF"
                textbutton _("简体中文") action Language(None)
${langButtons}`
    : ''
}

screen confirm(message, yes_action, no_action):
    modal True
    zorder 200
    add Solid("#00000099")
    frame:
        xalign 0.5 yalign 0.5 padding (48, 36) background Solid("#221E1B")
        vbox:
            spacing 28
            text _(message) size 28 color "#FFFFFF" xalign 0.5
            hbox:
                xalign 0.5 spacing 36
                textbutton _("确定") action yes_action
                textbutton _("取消") action no_action

screen nvl(dialogue, items=None):
    window:
        xfill True yfill True background Solid("#11100ECC") padding (120, 64)
        vbox:
            spacing gui.nvl_spacing
            for d in dialogue:
                hbox:
                    spacing 24
                    if d.who is not None:
                        text d.who size gui.name_text_size color "#FFB399" min_width 180
                    text d.what size gui.text_size color gui.text_color
            if items:
                vbox:
                    spacing 14
                    for i in items:
                        textbutton i.caption action i.action
`;
}

function generateScriptRpy(project: ProjectData): string {
  const activeScenes = project.scenes.filter((s) => !isSceneEffectivelyDisabled(project, s));
  const activeSceneIds = new Set(activeScenes.map((s) => s.id));
  const chapterMap = new Map(project.chapters.map((c) => [c.id, c]));

  const lines: string[] = [
    '# =============================================================',
    '# Auto-generated Story Script (GUIE Studio)',
    '# =============================================================',
    '',
    'label start:',
  ];

  // Player Custom Name prompt at game start if enabled
  if (project.extensions.playerCustomName.enabled && project.extensions.playerCustomName.promptAtStart) {
    lines.push(
      `    $ guie_player_name = renpy.call_screen("guie_name_input_screen", prompt_text=_("${escapeRenpyString(project.extensions.playerCustomName.promptText || '请输入你的名字')}"), default_name="${escapeRenpyString(project.extensions.playerCustomName.defaultName || '主角')}") or "${escapeRenpyString(project.extensions.playerCustomName.defaultName || '主角')}"`
    );
  }

  const startId = activeSceneIds.has(project.meta.startSceneId)
    ? project.meta.startSceneId
    : activeScenes[0]?.id;

  if (startId) {
    lines.push(`    jump ${sceneLabelName(startId)}`);
  } else {
    lines.push('    "尚未创建可播放的剧情场景。"');
    lines.push('    return');
  }
  lines.push('');

  for (const scene of activeScenes) {
    lines.push(...compileScene(scene, project, activeSceneIds, chapterMap));
    lines.push('');
  }

  return lines.join('\n');
}

function compileScene(
  scene: Scene,
  project: ProjectData,
  activeSceneIds: Set<string>,
  chapterMap: Map<string, { name: string }>
): string[] {
  const label = sceneLabelName(scene.id);
  const lines: string[] = [
    `# Scene: ${scene.name}`,
    `label ${label}:`,
    `    $ guie_mark_scene_seen("${escapeRenpyString(scene.id)}")`,
  ];

  const chapterName = scene.chapterId ? chapterMap.get(scene.chapterId)?.name : '';
  if (chapterName) {
    lines.push(`    $ save_name = "${escapeRenpyString(chapterName)} · ${escapeRenpyString(scene.name)}"`);
    if (project.extensions.chapterTitleCard.enabled) {
      lines.push(`    if guie_current_chapter != "${escapeRenpyString(chapterName)}":`);
      lines.push(`        $ guie_current_chapter = "${escapeRenpyString(chapterName)}"`);
      lines.push(`        call screen guie_chapter_card(chapter_title=_("${escapeRenpyString(chapterName)}"))`);
    }
  } else {
    lines.push(`    $ save_name = "${escapeRenpyString(scene.name)}"`);
  }

  let hasExplicitTermination = false;

  for (const blk of scene.blocks) {
    lines.push(`    # @guie:block:${blk.id}`);
    const blockLines = compileBlock(blk, project, activeSceneIds);
    lines.push(...blockLines);
    if (
      blk.type === 'flow' &&
      (blk.action === 'jump_scene' || blk.action === 'ending' || blk.action === 'return_from_call')
    ) {
      hasExplicitTermination = true;
    }
  }

  if (!hasExplicitTermination) {
    if (scene.nextSceneId && activeSceneIds.has(scene.nextSceneId)) {
      lines.push(`    jump ${sceneLabelName(scene.nextSceneId)}`);
    } else {
      lines.push('    return');
    }
  }

  return lines;
}

function compileBlock(
  blk: StoryBlock,
  project: ProjectData,
  activeSceneIds: Set<string>
): string[] {
  const out: string[] = [];

  switch (blk.type) {
    case 'dialogue': {
      const voiceRel = resolveAssetRelToGame(project, blk.voiceAssetId);
      if (voiceRel) {
        if (blk.voiceVolume !== undefined && blk.voiceVolume >= 0 && blk.voiceVolume <= 1) {
          out.push(`    $ renpy.music.set_volume(${blk.voiceVolume.toFixed(2)}, channel="voice")`);
        }
        out.push(`    voice "${voiceRel}"`);
      }
      const ch = blk.speakerId ? project.characters.find((c) => c.id === blk.speakerId) : null;
      const compiledText = compileDialogueText(blk.text || '……', project);
      const speedPrefix = blk.typingSpeed && blk.typingSpeed > 0 ? `{cps=${Math.round(blk.typingSpeed)}}` : '';
      const speedSuffix = speedPrefix ? '{/cps}' : '';
      const finalText = `${speedPrefix}${compiledText}${speedSuffix}`;

      // If expression changed inline on dialogue, update sprite cleanly if asset exists
      if (ch && (blk.expression || blk.outfit)) {
        const matchedExp = ch.expressions.find(
          (e) =>
            (!blk.expression || e.name === blk.expression) &&
            (!blk.outfit || e.outfit === blk.outfit)
        );
        if (matchedExp) {
          out.push(
            `    show guie_sp_${sanitizeIdentifier(ch.id, 'ch')} ${sanitizeIdentifier(matchedExp.id, 'exp')}`
          );
        }
      }

      if (blk.dynamicName?.trim()) {
        out.push(`    "${escapeRenpyString(blk.dynamicName.trim())}" "${finalText}"`);
      } else if (ch) {
        const useNvl = Boolean(blk.nvlMode ?? ch.nvlDefault);
        const defName = useNvl ? `${charDefineName(ch.id)}_nvl` : charDefineName(ch.id);
        out.push(`    ${defName} "${finalText}"`);
      } else if (blk.nvlMode) {
        out.push(`    nvl_narrator "${finalText}"`);
      } else {
        out.push(`    "${finalText}"`);
      }
      break;
    }

    case 'background': {
      const tr = compileTransitionExpr(blk.transition, blk.transitionDuration);
      if (blk.assetId) {
        const asset = project.assets.find((a) => a.id === blk.assetId);
        if (asset) {
          out.push(`    scene guie_bg_${sanitizeIdentifier(asset.id, 'ast')} ${tr}`.trimEnd());
          if (asset.isCg) {
            out.push(`    $ guie_unlock_cg("${escapeRenpyString(asset.id)}")`);
          }
          break;
        }
      }
      const color = blk.color || '#161412';
      out.push(`    scene expression Solid("${color}") ${tr}`.trimEnd());
      break;
    }

    case 'multilayer_stage': {
      const tr = compileTransitionExpr(blk.transition, blk.transitionDuration);
      out.push('    scene expression Solid("#111111")');
      const visibleLayers = [...blk.layers]
        .filter((l) => l.visible)
        .sort((a, b) => a.zIndex - b.zIndex);
      visibleLayers.forEach((layer, idx) => {
        const rel = resolveAssetRelToGame(project, layer.assetId);
        if (!rel) return;
        const tag = `guie_ml_${idx}_${sanitizeIdentifier(layer.id, 'ly')}`;
        out.push(`    show expression "${rel}" as ${tag} zorder ${layer.zIndex}:`);
        out.push(`        xoffset ${Math.round(layer.offsetX)} yoffset ${Math.round(layer.offsetY)} zoom ${(layer.scale || 1).toFixed(2)} alpha ${(layer.alpha ?? 1).toFixed(2)}`);
      });
      if (tr) out.push(`    ${tr}`);
      break;
    }

    case 'sprite': {
      const ch = project.characters.find((c) => c.id === blk.characterId);
      if (!ch) break;
      const charTag = sanitizeIdentifier(ch.id, 'ch');
      const tr = compileTransitionExpr(blk.transition, blk.transitionDuration);
      if (blk.action === 'hide') {
        out.push(`    hide guie_sp_${charTag} ${tr}`.trimEnd());
        break;
      }
      const exp =
        ch.expressions.find(
          (e) =>
            (!blk.expression || e.name === blk.expression) &&
            (!blk.outfit || e.outfit === blk.outfit)
        ) ?? ch.expressions[0];
      if (!exp) break;
      const expTag = sanitizeIdentifier(exp.id, 'exp');
      let atClause = '';
      if (blk.keyframes && blk.keyframes.length > 0) {
        atClause = `at guie_kf_${sanitizeIdentifier(blk.id, 'k')}`;
      } else if (blk.slot === 'custom' || blk.scale !== 1 || blk.rotation || (blk.alpha !== undefined && blk.alpha !== 1)) {
        const px = blk.slot === 'custom' ? (blk.x ?? 0.5) : slotToX(blk.slot);
        const py = blk.slot === 'custom' ? (blk.y ?? 1.0) : 1.0;
        atClause = `at guie_sprite_custom(${px.toFixed(3)}, ${py.toFixed(3)}, ${(blk.scale ?? 1).toFixed(2)}, ${(blk.rotation ?? 0).toFixed(1)}, ${(blk.alpha ?? 1).toFixed(2)})`;
      } else {
        atClause = `at guie_slot_${blk.slot}`;
      }
      const zPart = blk.zOrder !== undefined ? `zorder ${Math.round(blk.zOrder)}` : '';
      out.push(`    show guie_sp_${charTag} ${expTag} ${atClause} ${zPart} ${tr}`.replace(/\s+/g, ' ').trim());
      out[out.length - 1] = `    ${out[out.length - 1]}`;
      break;
    }

    case 'camera_fx': {
      if (blk.reset) {
        out.push('    camera:');
        out.push('        xoffset 0 yoffset 0 zoom 1.0 blur 0.0');
        out.push('    hide guie_particle_snow');
        out.push('    hide guie_particle_rain');
        out.push('    hide guie_particle_petals');
        out.push('    hide guie_particle_leaves');
        out.push('    hide guie_particle_sparkles');
        out.push('    hide guie_lut_overlay');
        out.push('    hide guie_vignette_overlay');
        break;
      }
      out.push('    camera:');
      out.push(
        `        ease ${Math.max(0.05, blk.duration || 0.6).toFixed(2)} xoffset ${Math.round(blk.panX)} yoffset ${Math.round(blk.panY)} zoom ${(blk.zoom || 1).toFixed(2)} blur ${(blk.blur || 0).toFixed(1)}`
      );
      if (blk.shake !== 'none') {
        out.push(`    camera at guie_cam_shake_${blk.shake}`);
      }
      if (blk.lutPreset !== 'none') {
        out.push(`    show guie_lut_${blk.lutPreset} as guie_lut_overlay zorder 80`);
      } else {
        out.push('    hide guie_lut_overlay');
      }
      if (blk.vignette > 0.05) {
        out.push(`    show guie_vignette_overlay zorder 82:`);
        out.push(`        alpha ${Math.min(1, blk.vignette).toFixed(2)}`);
      } else {
        out.push('    hide guie_vignette_overlay');
      }
      for (const p of ['snow', 'rain', 'petals', 'leaves', 'sparkles'] as const) {
        if (blk.particles === p) {
          out.push(`    show guie_particle_${p} zorder 85`);
        } else {
          out.push(`    hide guie_particle_${p}`);
        }
      }
      break;
    }

    case 'audio': {
      const chName = blk.channel === 'bgm' ? 'music' : blk.channel === 'se' ? 'sound' : 'voice';
      if (blk.action === 'stop') {
        const fo = blk.fadeOut ? ` fadeout ${blk.fadeOut.toFixed(2)}` : '';
        out.push(`    stop ${chName}${fo}`);
        break;
      }
      const rel = resolveAssetRelToGame(project, blk.assetId);
      if (!rel) break;
      const vol = blk.volume !== undefined ? ` volume ${blk.volume.toFixed(2)}` : '';
      const fi = blk.fadeIn ? ` fadein ${blk.fadeIn.toFixed(2)}` : '';
      const loopPart =
        blk.channel === 'bgm'
          ? blk.loop === false
            ? ' noloop'
            : ' loop'
          : blk.channel === 'se'
          ? blk.loop === true
            ? ' loop'
            : ' noloop'
          : '';
      const verb = blk.action === 'queue' ? 'queue' : 'play';
      out.push(`    ${verb} ${chName} "${rel}"${vol}${fi}${loopPart}`);
      break;
    }

    case 'video': {
      const rel = resolveAssetRelToGame(project, blk.assetId);
      if (!rel) break;
      const tag = sanitizeIdentifier(blk.assetId, 'ast');
      const vidImg = blk.loop === false ? `guie_vid_noloop_${tag}` : `guie_vid_${tag}`;
      if (blk.mode === 'fullscreen') {
        out.push(
          `    $ renpy.movie_cutscene("${rel}", delay=${blk.skippable === false ? 'None' : 'None'}, loops=${blk.loop ? '-1' : '0'})`
        );
      } else if (blk.mode === 'background_loop') {
        out.push(`    scene ${vidImg}`);
      } else {
        out.push(`    show ${vidImg} at guie_slot_center`);
      }
      break;
    }

    case 'state_change': {
      for (const eff of blk.effects) {
        out.push(...compileEffectLines(eff, project, '    '));
      }
      break;
    }

    case 'choice': {
      if (project.extensions.autoSaveBeforeChoice.enabled) {
        out.push('    $ renpy.force_autosave(take_screenshot=True)');
      }
      out.push('    menu:');
      if (blk.prompt?.trim()) {
        const ch = blk.speakerId ? project.characters.find((c) => c.id === blk.speakerId) : null;
        const txt = compileDialogueText(blk.prompt, project);
        if (ch) out.push(`        ${charDefineName(ch.id)} "${txt}"`);
        else out.push(`        "${txt}"`);
      }
      if (blk.options.length === 0) {
        out.push('        "继续":');
        out.push('            pass');
        break;
      }
      for (const opt of blk.options) {
        out.push(...compileChoiceOption(opt, project, activeSceneIds));
      }
      break;
    }

    case 'condition_branch': {
      const condExpr = compileConditionGroup(blk.condition, project);
      out.push(`    if ${condExpr}:`);
      if (blk.trueTargetType === 'ending') {
        const eid = blk.trueEndingId || blk.id;
        out.push(`        $ guie_unlock_ending("${escapeRenpyString(eid)}")`);
        out.push(`        centered "{size=+14}${escapeRenpyString(blk.trueEndingTitle || '故事终章')}{/size}"`);
        out.push('        return');
      } else if (blk.trueTargetType === 'call_scene' && blk.trueTargetSceneId && activeSceneIds.has(blk.trueTargetSceneId)) {
        out.push(`        call ${sceneLabelName(blk.trueTargetSceneId)}`);
      } else if (blk.trueTargetSceneId && activeSceneIds.has(blk.trueTargetSceneId)) {
        out.push(`        jump ${sceneLabelName(blk.trueTargetSceneId)}`);
      } else {
        out.push('        pass');
      }

      if (blk.falseTargetType === 'scene' && blk.falseTargetSceneId && activeSceneIds.has(blk.falseTargetSceneId)) {
        out.push('    else:');
        out.push(`        jump ${sceneLabelName(blk.falseTargetSceneId)}`);
      } else if (blk.falseTargetType === 'ending') {
        const eid = blk.falseEndingId || `${blk.id}_false`;
        out.push('    else:');
        out.push(`        $ guie_unlock_ending("${escapeRenpyString(eid)}")`);
        out.push(`        centered "{size=+14}${escapeRenpyString(blk.falseEndingTitle || '故事终章')}{/size}"`);
        out.push('        return');
      }
      break;
    }

    case 'flow': {
      if (blk.action === 'jump_scene' && blk.targetSceneId && activeSceneIds.has(blk.targetSceneId)) {
        out.push(`    jump ${sceneLabelName(blk.targetSceneId)}`);
      } else if (blk.action === 'call_scene' && blk.targetSceneId && activeSceneIds.has(blk.targetSceneId)) {
        out.push(`    call ${sceneLabelName(blk.targetSceneId)}`);
      } else if (blk.action === 'return_from_call') {
        out.push('    return');
      } else if (blk.action === 'pause') {
        out.push(`    pause ${Math.max(0.1, blk.pauseSeconds ?? 1).toFixed(2)}`);
      } else if (blk.action === 'wait_click') {
        out.push('    pause');
      } else if (blk.action === 'ending') {
        const eid = blk.endingId || blk.id;
        out.push(`    $ guie_unlock_ending("${escapeRenpyString(eid)}")`);
        if (blk.cgAssetId) {
          const cgAsset = project.assets.find((a) => a.id === blk.cgAssetId);
          if (cgAsset) {
            out.push(`    scene guie_bg_${sanitizeIdentifier(cgAsset.id, 'ast')} with dissolve`);
            out.push(`    $ guie_unlock_cg("${escapeRenpyString(cgAsset.id)}")`);
          }
        }
        const subtitlePart = blk.endingSubtitle ? `\\n\\n${escapeRenpyString(blk.endingSubtitle)}` : '';
        out.push(`    centered "{size=+16}${escapeRenpyString(blk.endingTitle || '故事终章')}{/size}${subtitlePart}"`);
        out.push('    return');
      }
      break;
    }

    case 'player_name_input': {
      out.push(
        `    $ guie_player_name = renpy.call_screen("guie_name_input_screen", prompt_text=_("${escapeRenpyString(blk.prompt || '请输入你的名字')}"), default_name="${escapeRenpyString(blk.defaultName || '主角')}") or "${escapeRenpyString(blk.defaultName || '主角')}"`
      );
      break;
    }

    case 'cg_unlock': {
      out.push(`    $ guie_unlock_cg("${escapeRenpyString(blk.cgId)}")`);
      if (blk.showFullscreen && blk.assetId) {
        const asset = project.assets.find((a) => a.id === blk.assetId);
        if (asset) {
          const tr = compileTransitionExpr(blk.transition || 'dissolve', 0.6);
          out.push(`    scene guie_bg_${sanitizeIdentifier(asset.id, 'ast')} ${tr}`.trimEnd());
        }
      }
      break;
    }
  }

  return out;
}

function compileChoiceOption(
  opt: ChoiceOption,
  project: ProjectData,
  activeSceneIds: Set<string>
): string[] {
  const out: string[] = [];
  const labelEsc = escapeRenpyString(opt.label || '选项');
  const hasCond = opt.condition && opt.condition.rules.length > 0;
  const condExpr = hasCond ? compileConditionGroup(opt.condition, project) : '';

  if (hasCond && opt.lockedBehavior === 'disable') {
    // Active selectable branch when condition holds
    out.push(`        "${labelEsc}" if ${condExpr}:`);
    out.push(...compileChoiceBody(opt, project, activeSceneIds));
    // Visible disabled hint branch when condition fails
    const hint = escapeRenpyString(opt.disabledHint || '条件未满足');
    out.push(`        "${labelEsc}（${hint}）" if (not (${condExpr})) and False:`);
    out.push('            pass');
    // Also show a sensitive(False) option using Ren'Py's built-in menu sensitivity via condition wrapper:
    out.pop();
    out.pop();
    out.push(`        "${labelEsc}（${hint}）" (sensitive=False) if not (${condExpr}):`);
    out.push('            pass');
  } else if (hasCond) {
    out.push(`        "${labelEsc}" if ${condExpr}:`);
    out.push(...compileChoiceBody(opt, project, activeSceneIds));
  } else {
    out.push(`        "${labelEsc}":`);
    out.push(...compileChoiceBody(opt, project, activeSceneIds));
  }
  return out;
}

function compileChoiceBody(
  opt: ChoiceOption,
  project: ProjectData,
  activeSceneIds: Set<string>
): string[] {
  const body: string[] = [];
  for (const eff of opt.effects) {
    body.push(...compileEffectLines(eff, project, '            '));
  }
  if (opt.targetType === 'ending') {
    const eid = opt.endingId || opt.id;
    body.push(`            $ guie_unlock_ending("${escapeRenpyString(eid)}")`);
    const sub = opt.endingSubtitle ? `\\n\\n${escapeRenpyString(opt.endingSubtitle)}` : '';
    body.push(`            centered "{size=+16}${escapeRenpyString(opt.endingTitle || '故事终章')}{/size}${sub}"`);
    body.push('            return');
  } else if (opt.targetType === 'call_scene' && opt.targetSceneId && activeSceneIds.has(opt.targetSceneId)) {
    body.push(`            call ${sceneLabelName(opt.targetSceneId)}`);
  } else if (opt.targetType === 'scene' && opt.targetSceneId && activeSceneIds.has(opt.targetSceneId)) {
    body.push(`            jump ${sceneLabelName(opt.targetSceneId)}`);
  } else {
    body.push('            pass');
  }
  return body;
}

function slotToX(slot: string): number {
  switch (slot) {
    case 'farleft': return 0.08;
    case 'left': return 0.25;
    case 'right': return 0.75;
    case 'farright': return 0.92;
    default: return 0.5;
  }
}

function generateLanguageRpy(
  project: ProjectData,
  lang: ProjectData['localization']['languages'][number],
  localizable: ReturnType<typeof extractLocalizableStrings>
): string {
  const langCode = sanitizeIdentifier(lang.code, 'lang');
  const lines: string[] = [
    `# Auto-generated Localization for ${lang.name} (${lang.code})`,
    '',
  ];

  // Language-specific font override
  const fontRel = resolveAssetRelToGame(project, lang.fontAssetId);
  if (fontRel) {
    lines.push(`translate ${langCode} style default:`);
    lines.push(`    font "${fontRel}"`);
    lines.push(`translate ${langCode} style button_text:`);
    lines.push(`    font "${fontRel}"`);
    lines.push('');
  }

  // Language-specific image overrides
  const overrideEntries = Object.entries(lang.imageOverrides);
  if (overrideEntries.length > 0) {
    lines.push(`translate ${langCode} python:`);
    for (const [origId, replId] of overrideEntries) {
      const replRel = resolveAssetRelToGame(project, replId);
      if (replRel) {
        lines.push(`    renpy.image("guie_bg_${sanitizeIdentifier(origId, 'ast')}", "${replRel}")`);
      }
    }
    lines.push('');
  }

  // String translations
  lines.push(`translate ${langCode} strings:`);
  const seen = new Set<string>();
  for (const item of localizable) {
    const translated = lang.translations[item.key];
    if (!translated || !translated.trim()) continue;
    const oldEsc = escapeRenpyString(item.sourceText);
    if (seen.has(oldEsc)) continue;
    seen.add(oldEsc);
    lines.push(`    old "${oldEsc}"`);
    lines.push(`    new "${escapeRenpyString(translated)}"`);
  }

  if (seen.size === 0) {
    lines.push('    old "开始游戏"');
    lines.push('    new "Start"');
  }

  return lines.join('\n');
}

/**
 * Generates the temporary Live Preview & Debugger Bridge script injected ONLY during
 * in-editor playtest/mirror mode (automatically removed & excluded on export).
 */
export function generateLiveBridgeRpy(bridgePort: number, revision: number): string {
  return `# Temporary GUIE Live Preview Bridge (auto-removed on export)
init -999 python:
    import json
    import urllib.request
    import threading
    import time

    GUIE_BRIDGE_URL = "http://127.0.0.1:${bridgePort}"
    GUIE_BRIDGE_REV = ${revision}
    _guie_last_sent = {"ts": 0}
    _guie_reload_triggered = False

    def _guie_post_async(path, payload):
        def _run():
            try:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    GUIE_BRIDGE_URL + path,
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                urllib.request.urlopen(req, timeout=0.6)
            except Exception:
                pass
        threading.Thread(target=_run, daemon=True).start()

    def _guie_collect_vars():
        out = {}
        try:
            for k, v in renpy.store.__dict__.items():
                if k.startswith("guie_v_") or k == "guie_player_name":
                    if isinstance(v, (int, float, bool, str)):
                        out[k] = v
        except Exception:
            pass
        return out

    def _guie_label_cb(name, abnormal):
        if name and name.startswith("guie_sc_"):
            _guie_post_async("/event", {
                "type": "label",
                "label": name,
                "variables": _guie_collect_vars(),
                "revision": GUIE_BRIDGE_REV
            })

    config.label_callbacks.append(_guie_label_cb)

    def _guie_poll_commands():
        global _guie_reload_triggered
        now = time.time()
        if now - _guie_last_sent["ts"] < 0.7:
            return
        _guie_last_sent["ts"] = now
        try:
            req = urllib.request.Request(GUIE_BRIDGE_URL + "/poll?rev=" + str(GUIE_BRIDGE_REV))
            with urllib.request.urlopen(req, timeout=0.35) as resp:
                cmd = json.loads(resp.read().decode("utf-8"))
                if cmd.get("setVars"):
                    for k, val in cmd["setVars"].items():
                        setattr(renpy.store, k, val)
                # Guard against infinite reload loops: trigger reload AT MOST ONCE when server revision > current revision
                if cmd.get("reloadRev", 0) > GUIE_BRIDGE_REV and not _guie_reload_triggered:
                    _guie_reload_triggered = True
                    renpy.reload_script()
        except Exception:
            pass

    config.periodic_callbacks.append(_guie_poll_commands)
`;
}

export function getBundledFontRelativePath(): string {
  return path.join('game', 'fonts', 'SourceHanSansLite.ttf');
}
