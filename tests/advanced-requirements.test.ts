import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProject,
  openProject,
  restoreSnapshot,
  saveProjectSync,
} from '../src/main/projectManager';
import { compileProjectToRenpy } from '../src/main/renpyCompiler';
import { runRenpyLint } from '../src/main/renpyRunner';
import { getResolvedApiKey, runAiAssistantTurn } from '../src/main/aiAgent';
import { createId } from '../src/shared/defaults';

let tempRoot: string;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-adv-test-'));
});

afterAll(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
});

describe('Advanced Requirements Verification (CJK Auto-Upgrade, Soft Disable, AI Custom .rpy Loop)', () => {
  it('auto-upgrades legacy project default font to bundled CJK font WITHOUT overwriting custom user fonts', () => {
    // Case 1: Legacy project using DejaVuSans (missing CJK glyphs)
    const legacy = createProject({ parentDir: tempRoot, title: '旧版缺字项目' });
    legacy.project.appearance.font.bundledCjkFont = 'DejaVuSans.ttf';
    legacy.project.appearance.font.globalFontAssetId = null;
    fs.writeFileSync(
      path.join(legacy.projectDir, 'guie.project.json'),
      JSON.stringify(legacy.project, null, 2),
      'utf8'
    );

    const openedLegacy = openProject(legacy.projectDir);
    expect(openedLegacy.upgradedCjkFont).toBe(true);
    expect(openedLegacy.project.appearance.font.bundledCjkFont).toBe('fonts/SourceHanSansLite.ttf');

    // Case 2: Project with explicit custom user font MUST NOT be overwritten
    const custom = createProject({ parentDir: tempRoot, title: '自定义字体项目' });
    const customFontId = createId('ast');
    custom.project.assets.push({
      id: customFontId,
      name: 'MyCustomFont',
      category: 'font',
      relativePath: 'game/assets/font/my_custom.ttf',
      originalName: 'my_custom.ttf',
      mimeType: 'font/ttf',
      sizeBytes: 1024,
      createdAt: new Date().toISOString(),
    });
    custom.project.appearance.font.globalFontAssetId = customFontId;
    saveProjectSync(custom.projectDir, custom.project);

    const openedCustom = openProject(custom.projectDir);
    expect(openedCustom.upgradedCjkFont).toBe(false);
    expect(openedCustom.project.appearance.font.globalFontAssetId).toBe(customFontId);
  });

  it('strictly excludes soft-disabled chapters and scenes from compiled script, replay list, and endings', () => {
    const { project } = createProject({ parentDir: tempRoot, title: '软停用测试' });
    const disabledChId = createId('ch');
    project.chapters.push({
      id: disabledChId,
      name: '废弃支线章',
      order: 1,
      collapsed: false,
      disabled: true,
    });
    project.scenes.push(
      {
        id: 'sc_in_disabled_ch',
        chapterId: disabledChId,
        name: '停用章内场景',
        order: 1,
        disabled: false,
        blocks: [
          { id: 'b_dis_1', type: 'dialogue', speakerId: null, text: '这段不应该出现在编译脚本里' },
          { id: 'b_dis_end', type: 'flow', action: 'ending', endingId: 'end_disabled', endingTitle: '停用结局' },
        ],
      },
      {
        id: 'sc_self_disabled',
        chapterId: project.chapters[0].id,
        name: '单独停用场景',
        order: 2,
        disabled: true,
        blocks: [{ id: 'b_dis_2', type: 'dialogue', speakerId: null, text: '也不应该出现' }],
      }
    );

    const compiled = compileProjectToRenpy(project);
    expect(compiled['game/script.rpy']).not.toContain('sc_in_disabled_ch');
    expect(compiled['game/script.rpy']).not.toContain('sc_self_disabled');
    expect(compiled['game/guie_extensions.rpy']).not.toContain('sc_in_disabled_ch');
    expect(compiled['game/guie_extensions.rpy']).not.toContain('end_disabled');
  });

  it('AI Assistant writes custom_*.rpy advanced feature, modifies it on follow-up instruction, passes real RenPy Lint, and cleanly reverts on 1-click Undo', async () => {
    const apiKey = getResolvedApiKey();
    if (!apiKey) {
      console.warn('Skipping live AI custom_*.rpy test (no API key configured)');
      return;
    }

    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: 'AI高级源码兜底实测',
    });

    // Turn 1: Create an advanced custom phone chat UI screen via natural language (outside standard GUI forms!)
    const turn1 = await runAiAssistantTurn({
      projectDir,
      project,
      userPrompt:
        '请通过自定义扩展脚本帮我做一个简单的手机消息界面（custom_phone_ui.rpy），包含一个名为 guie_phone_screen 的 screen，显示“未读消息：放学后见！”，并提供关闭按钮。请直接写入并自动检查通过。',
      history: [],
      context: {
        activeTab: 'story',
        activeSceneId: project.scenes[0].id,
        activeSceneName: project.scenes[0].name,
      },
    });

    const gameDir = path.join(projectDir, 'game');
    const customFiles = fs.readdirSync(gameDir).filter((f) => f.startsWith('custom_') && f.endsWith('.rpy'));
    expect(customFiles.length).toBeGreaterThanOrEqual(1);

    const lint1 = await runRenpyLint(projectDir, turn1.updatedProject);
    expect(lint1.ok, `Turn 1 custom screen failed Ren'Py Lint:\n${lint1.rawOutput}`).toBe(true);

    // Turn 2: Follow-up natural language adjustment ("把界面改成粉色，增加一条新消息")
    const turn2 = await runAiAssistantTurn({
      projectDir,
      project: turn1.updatedProject,
      userPrompt: '把刚才的手机消息界面背景改成柔和粉色（#F9A8D4），再增加一条“记得带伞哦”的未读消息，并校验无错。',
      history: [
        { role: 'user', content: '请帮我做手机消息界面' },
        { role: 'assistant', content: turn1.reply },
      ],
      context: {
        activeTab: 'story',
        activeSceneId: project.scenes[0].id,
        activeSceneName: project.scenes[0].name,
      },
    });

    const mergedCustom = fs
      .readdirSync(gameDir)
      .filter((f) => f.startsWith('custom_') && f.endsWith('.rpy'))
      .map((f) => fs.readFileSync(path.join(gameDir, f), 'utf8'))
      .join('\n');
    expect(mergedCustom).toContain('记得带伞');

    const lint2 = await runRenpyLint(projectDir, turn2.updatedProject);
    expect(lint2.ok, `Turn 2 modified custom screen failed Ren'Py Lint:\n${lint2.rawOutput}`).toBe(true);

    // Verify 1-click Undo restores pre-Turn1 snapshot AND removes custom_*.rpy cleanly!
    restoreSnapshot(projectDir, turn1.snapshotIdBefore, turn2.updatedProject);
    const remainingCustom = fs.readdirSync(gameDir).filter((f) => f.startsWith('custom_') && f.endsWith('.rpy'));
    expect(remainingCustom).toHaveLength(0);
  }, 120000);
});
