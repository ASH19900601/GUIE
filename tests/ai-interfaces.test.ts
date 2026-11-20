import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AI_TOOLS,
  executeToolCall,
  getResolvedApiKey,
  runAiAssistantTurn,
} from '../src/main/aiAgent';
import {
  createProject,
  importAssetFiles,
  saveProjectSync,
} from '../src/main/projectManager';
import { runRenpyLint } from '../src/main/renpyRunner';
import { extractLocalizableStrings } from '../src/shared/defaults';
// @ts-expect-error mjs fixture helper without .d.ts
import { createTestFixtures } from '../scripts/fixture-assets.mjs';

let tempRoot: string;
let fixtures: ReturnType<typeof createTestFixtures>;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-ai-interfaces-'));
  fixtures = createTestFixtures(path.join(tempRoot, 'fixtures'));
});

afterAll(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
});

describe('Complete AI Agent Interfaces across all GUIE modules', () => {
  it('exposes all 27 structured & custom tools and executes every domain tool cleanly with real RenPy Lint verification', async () => {
    expect(AI_TOOLS.length).toBeGreaterThanOrEqual(27);

    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: 'AI全接口测试工程',
      withStarterContent: true,
    });

    const imported = importAssetFiles(projectDir, [
      fixtures.bgClassroom,
      fixtures.bgGarden,
      fixtures.spLinSmile,
      fixtures.bgmEvening,
      fixtures.voiceLine1,
    ]);
    project.assets.push(...imported);

    const ctx = {
      activeTab: 'story' as const,
      activeSceneId: project.meta.startSceneId,
    };

    // 1. Project Meta & Chapter Management
    await executeToolCall('update_project_meta', { title: '樱庭夏日 · 国际版', author: 'GUIE Team', width: 1920, height: 1080 }, project, projectDir, ctx);
    expect(project.meta.title).toBe('樱庭夏日 · 国际版');

    const chRes = await executeToolCall('manage_chapter', { action: 'create', name: '第一章 · 晚风' }, project, projectDir, ctx);
    expect(chRes.ok).toBe(true);
    expect(project.chapters.some((c) => c.name === '第一章 · 晚风')).toBe(true);

    // 2. Characters & Story Variables
    await executeToolCall('create_character', { name: '林夏', color: '#C96442', description: '天文社副社长' }, project, projectDir, ctx);
    await executeToolCall(
      'update_or_delete_character',
      {
        characterId: '林夏',
        addExpressions: [{ name: '微笑', assetName: path.basename(fixtures.spLinSmile) }],
      },
      project,
      projectDir,
      ctx
    );
    expect(project.characters.find((c) => c.name === '林夏')?.expressions.length).toBe(1);

    await executeToolCall(
      'create_story_variable',
      { name: '天台钥匙', type: 'boolean', initialValue: true, persistent: false, category: 'flag' },
      project,
      projectDir,
      ctx
    );
    await executeToolCall(
      'update_or_delete_variable',
      { variableId: '好感度', initialValue: 2, persistent: true, linkedCharacterName: '林夏' },
      project,
      projectDir,
      ctx
    );
    expect(project.variables.find((v) => v.name === '好感度')?.persistent).toBe(true);

    // 3. Scenes & All 13 Story Block Types
    await executeToolCall(
      'create_scene',
      {
        name: '中庭花圃',
        chapterId: '第一章 · 晚风',
        lines: [{ speakerName: '林夏', text: '这里的紫阳花开得正好，{玩家名字}快来看！', expression: '微笑' }],
        endingTitle: '夏日花圃之约',
      },
      project,
      projectDir,
      ctx
    );

    const insRes = await executeToolCall(
      'insert_story_blocks',
      {
        sceneId: project.meta.startSceneId,
        blocks: [
          { type: 'background', assetName: path.basename(fixtures.bgClassroom), transition: 'dissolve' },
          { type: 'audio', channel: 'bgm', action: 'play', assetName: path.basename(fixtures.bgmEvening) },
          { type: 'sprite', action: 'show', characterName: '林夏', expression: '微笑', slot: 'center' },
          { type: 'camera_fx', zoom: 1.05, lutPreset: 'sunset', particles: 'petals', vignette: 0.25 },
          { type: 'player_name_input', prompt: '请输入你的名字：', defaultName: '林晨' },
          { type: 'dialogue', speakerName: '林夏', expression: '微笑', text: '放学啦，{玩家名字}，一起去中庭看看吗？' },
          { type: 'state_change', effects: [{ variableName: '好感度', op: 'add', value: 1 }] },
          { type: 'cg_unlock', assetName: path.basename(fixtures.bgGarden), title: '黄昏教室的邂逅' },
          {
            type: 'choice',
            prompt: '你要去哪里？',
            options: [
              {
                label: '和林夏去中庭花圃',
                targetType: 'scene',
                targetSceneId: '中庭花圃',
                conditionVariableName: '好感度',
                conditionOperator: '>=',
                conditionValue: 2,
              },
              {
                label: '直接回家休息',
                targetType: 'ending',
                endingTitle: '宁静的傍晚',
              },
            ],
          },
        ],
      },
      project,
      projectDir,
      ctx
    );
    expect(insRes.ok).toBe(true);

    const readBlocks = await executeToolCall('read_scene_blocks', { sceneId: project.meta.startSceneId }, project, projectDir, ctx);
    expect(readBlocks.ok).toBe(true);

    // 4. Assets, Appearance, Extensions, Flowchart Layout & Reuse Library
    const assetsRes = await executeToolCall('list_assets', { category: 'all' }, project, projectDir, ctx);
    expect(assetsRes.ok).toBe(true);
    await executeToolCall(
      'update_asset_metadata',
      { assetId: path.basename(fixtures.bgClassroom), isCg: true, cgTitle: '放学后的教室' },
      project,
      projectDir,
      ctx
    );

    await executeToolCall(
      'update_appearance',
      {
        themePreset: 'midnight_velvet',
        dialogueBox: { fontSize: 31, boxOpacity: 0.88 },
        saveAsPresetName: '测试暗色字幕',
      },
      project,
      projectDir,
      ctx
    );
    expect(project.appearance.themePreset).toBe('midnight_velvet');

    await executeToolCall(
      'update_extensions',
      {
        galleryAndEndings: { enabled: true, enableCgGallery: true, enableSceneReplay: true, enableEndingBook: true },
        affectionSystem: { enabled: true, autoGenerateForAllCharacters: true },
        chapterTitleCard: { enabled: true, style: 'ink', duration: 2.0 },
      },
      project,
      projectDir,
      ctx
    );
    expect(project.extensions.affectionSystem.tracks.length).toBeGreaterThanOrEqual(1);

    await executeToolCall('update_flow_layout', { direction: 'LR', showCausalLinks: true }, project, projectDir, ctx);
    expect(project.flowLayout.direction).toBe('LR');

    const saveReuse = await executeToolCall(
      'manage_reuse_library',
      { action: 'save', kind: 'character', sourceId: '林夏', name: '林夏_测试复用' },
      project,
      projectDir,
      ctx
    );
    expect(saveReuse.ok).toBe(true);

    // 5. Multi-Language Localization Tools (Add English, Read Strings, Fill Translations)
    await executeToolCall('manage_language', { action: 'add', langCode: 'en' }, project, projectDir, ctx);
    expect(project.localization.languages.some((l) => l.code === 'en')).toBe(true);

    const locStrings = (await executeToolCall(
      'get_localization_strings',
      { langCode: 'English', onlyUntranslated: true },
      project,
      projectDir,
      ctx
    )) as { ok: boolean; output: { strings: Array<{ key: string; sourceText: string }> } };
    expect(locStrings.ok).toBe(true);
    expect(locStrings.output.strings.length).toBeGreaterThan(4);

    // Fill translations via key AND sourceText fallback, including {玩家名字} placeholder
    const entriesToFill = locStrings.output.strings.map((s, idx) => ({
      key: idx % 2 === 0 ? s.key : undefined,
      sourceText: idx % 2 === 1 ? s.sourceText : undefined,
      text: s.sourceText.includes('{玩家名字}')
        ? 'School is over, {玩家名字}, shall we visit the courtyard?'
        : `EN_${idx + 1}`,
    }));

    const fillRes = (await executeToolCall(
      'set_localization_translations',
      { langCode: '英语', entries: entriesToFill },
      project,
      projectDir,
      ctx
    )) as { ok: boolean; output: { completionPercent: number } };
    expect(fillRes.ok).toBe(true);
    expect(fillRes.output.completionPercent).toBe(100);

    // Verify compiled game/tl/en/guie_translations.rpy contains [guie_player_name] and passes real Ren'Py 8.5.3 Lint!
    saveProjectSync(projectDir, project);
    const tlFile = fs.readFileSync(path.join(projectDir, 'game', 'tl', 'en', 'guie_translations.rpy'), 'utf8');
    expect(tlFile).toContain('School is over, [guie_player_name], shall we visit the courtyard?');

    const checkRes = await executeToolCall('run_project_check', { autoFixOrphanScenes: true }, project, projectDir, ctx);
    expect(checkRes.ok).toBe(true);
  }, 45000);

  it('uses real DeepSeek AI to translate all untranslated dialogue & choices into English after user creates English localization', async () => {
    const apiKey = getResolvedApiKey();
    if (!apiKey) return;

    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: '黄昏教室的约定',
      withStarterContent: false,
    });

    // User creates English version in Localization tab (0% translated initially)
    project.localization.languages.push({
      code: 'en',
      name: 'English（英语）',
      fontAssetId: null,
      imageOverrides: {},
      translations: {},
    });
    const sc = project.scenes[0];
    sc.blocks = [
      {
        id: 'b_dlg_1',
        type: 'dialogue',
        speakerId: null,
        text: '晚风吹过教室的窗帘，夕阳把课桌染成了温暖的橘色。',
      },
      {
        id: 'b_dlg_2',
        type: 'dialogue',
        speakerId: null,
        text: '你好，{玩家名字}，今晚要不要一起去天台看星星？',
      },
      {
        id: 'b_ch_1',
        type: 'choice',
        prompt: '你的回答是？',
        options: [
          {
            id: 'opt_yes',
            label: '好呀，我们现在就出发',
            lockedBehavior: 'hide',
            effects: [],
            targetType: 'ending',
            endingId: 'end_1',
            endingTitle: '星空下的约定',
          },
        ],
      },
    ];
    saveProjectSync(projectDir, project);

    const turnRes = await runAiAssistantTurn({
      projectDir,
      project,
      userPrompt: '我已经在多语言本地化里创建了英语版本，请帮我把所有还没翻译的中文对白、选项和标题都翻译成英文并填进去。',
      history: [],
      context: {
        activeTab: 'localization',
        activeSceneId: sc.id,
        activeLanguageCode: 'en',
        activeLanguageName: 'English（英语）',
      },
    });

    expect(turnRes.projectMutated).toBe(true);
    const enLang = turnRes.updatedProject.localization.languages.find((l) => l.code === 'en');
    expect(enLang).toBeDefined();
    const allStrings = extractLocalizableStrings(turnRes.updatedProject);
    const translatedCount = allStrings.filter((s) => Boolean(enLang!.translations[s.key]?.trim())).length;
    expect(translatedCount).toBe(allStrings.length);
    // Verify dialogue translation is genuine English and passes real Ren'Py 8.5.3 Lint
    expect(enLang!.translations['blk.b_dlg_1.text']).toMatch(/[a-zA-Z]{3,}/);
    const lint = await runRenpyLint(projectDir, turnRes.updatedProject);
    expect(lint.ok).toBe(true);
  }, 60000);
});
