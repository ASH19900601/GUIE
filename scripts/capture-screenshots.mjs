/**
 * Full-Page Automated HD Demo Screenshot Capture Script (Req 8.3.4)
 * Launches directly from latest built source (no installer packaging needed!),
 * builds a rich showcase visual novel project, and captures every core workspace
 * & modal into `docs/screenshots/*.png`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createTestFixtures } from './fixture-assets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const shotsDir = path.join(rootDir, 'docs', 'screenshots');

async function main() {
  fs.mkdirSync(shotsDir, { recursive: true });
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-shots-'));
  const projectsDir = path.join(tmpBase, 'projects');
  const fixturesDir = path.join(tmpBase, 'fixtures');
  const fakeAppData = path.join(tmpBase, 'appdata');
  fs.mkdirSync(projectsDir, { recursive: true });
  fs.mkdirSync(fakeAppData, { recursive: true });
  const fx = createTestFixtures(fixturesDir);

  const app = await electron.launch({
    args: [rootDir],
    env: { ...process.env, APPDATA: fakeAppData },
  });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(800);

  const snap = async (fileName) => {
    await win.waitForTimeout(350);
    const out = path.join(shotsDir, fileName);
    await win.screenshot({ path: out });
    console.log(`[screenshots] Captured ${fileName}`);
  };

  try {
    // 1. Welcome Home
    await snap('01-welcome-home.png');

    // Create showcase project
    await win.getByTestId('home-create-project-btn').click();
    await win.getByTestId('wizard-title-input').fill('樱庭微风 · 夏日物语');
    await win.getByTestId('wizard-author-input').fill('星河工作室');
    await win.getByTestId('wizard-dir-input').fill(projectsDir);
    await win.getByTestId('wizard-submit-btn').click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible' });
    await win.waitForTimeout(500);

    const projectDir = path.join(projectsDir, fs.readdirSync(projectsDir)[0]);
    const bgAssets = await win.evaluate(
      ({ d, p }) => window.guie.importAssets(d, p, 'background'),
      { d: projectDir, p: [fx.bgClassroom, fx.bgGarden, fx.bgRooftop] }
    );
    const spAssets = await win.evaluate(
      ({ d, p }) => window.guie.importAssets(d, p, 'sprite'),
      { d: projectDir, p: [fx.spLinSmile, fx.spLinSurprised, fx.spShenCalm, fx.spShenGentle] }
    );
    const bgmAssets = await win.evaluate(
      ({ d, p }) => window.guie.importAssets(d, p, 'bgm'),
      { d: projectDir, p: [fx.bgmEvening] }
    );

    // Return to Home FIRST so save barrier finishes cleanly before injecting showcase JSON
    await win.getByTestId('back-to-home-btn').click();
    await win.waitForTimeout(400);

    // Hydrate rich showcase data
    const jsonPath = path.join(projectDir, 'guie.project.json');
    const proj = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    proj.assets.push(...bgAssets, ...spAssets, ...bgmAssets);
    proj.assets[0].isCg = true;

    proj.characters = [
      {
        id: 'ch_lin',
        name: '林夏',
        color: '#FF5A3D',
        avatarAssetId: spAssets[0].id,
        expressions: [
          { id: 'exp_1', name: '微笑', outfit: '夏装校服', assetId: spAssets[0].id, order: 0 },
          { id: 'exp_2', name: '惊讶', outfit: '夏装校服', assetId: spAssets[1].id, order: 1 },
        ],
      },
      {
        id: 'ch_shen',
        name: '沈秋',
        color: '#2A7B50',
        avatarAssetId: spAssets[2].id,
        expressions: [
          { id: 'exp_3', name: '平静', outfit: '衬衫', assetId: spAssets[2].id, order: 0 },
          { id: 'exp_4', name: '温柔', outfit: '衬衫', assetId: spAssets[3].id, order: 1 },
        ],
      },
    ];
    proj.variables = [
      { id: 'var_aff', name: '林夏好感度', type: 'number', initialValue: 2, persistent: true, category: 'affection' },
      { id: 'var_key', name: '天台钥匙', type: 'boolean', initialValue: true, persistent: false, category: 'flag' },
      { id: 'var_club', name: '所属社团', type: 'string', initialValue: '天文社', persistent: false, category: 'general' },
    ];

    const ch0 = proj.chapters[0].id;
    proj.chapters.push({ id: 'ch_2', name: '第一章 · 放学后的微风', order: 1, collapsed: false, disabled: false });

    proj.scenes[0].name = '黄昏教室的邀请';
    proj.scenes[0].blocks = [
      { id: 'b1', type: 'background', assetId: bgAssets[0].id, transition: 'dissolve', transitionDuration: 0.6 },
      { id: 'b2', type: 'audio', channel: 'bgm', action: 'play', assetId: bgmAssets[0].id, loop: true, volume: 0.8, fadeIn: 0.8 },
      { id: 'b3', type: 'sprite', action: 'show', characterId: 'ch_lin', expression: '微笑', slot: 'left', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
      { id: 'b4', type: 'sprite', action: 'show', characterId: 'ch_shen', expression: '平静', slot: 'right', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
      { id: 'b5', type: 'dialogue', speakerId: null, text: '放学铃声散尽，橘红色的晚霞穿过教室窗帘洒在木质课桌上。' },
      { id: 'b6', type: 'dialogue', speakerId: 'ch_lin', expression: '微笑', text: '今天的天空特别清澈呀！{玩家名字}，要不要一起去看看晚霞？' },
      { id: 'b7', type: 'state_change', effects: [{ id: 'e1', variableId: 'var_aff', op: 'add', value: 1 }] },
      {
        id: 'b8',
        type: 'choice',
        prompt: '夕阳正好，你要接受谁的邀请？',
        options: [
          { id: 'o1', label: '和林夏去中庭花园', lockedBehavior: 'hide', effects: [{ id: 'eo1', variableId: 'var_aff', op: 'add', value: 2 }], targetType: 'scene', targetSceneId: 'sc_garden' },
          {
            id: 'o2',
            label: '和沈秋去秘密天台',
            condition: { logic: 'all', rules: [{ id: 'r1', variableId: 'var_aff', operator: '>=', value: 2 }, { id: 'r2', variableId: 'var_key', operator: 'is_true', value: true }] },
            lockedBehavior: 'disable',
            disabledHint: '需好感度≥2且持有钥匙',
            effects: [],
            targetType: 'scene',
            targetSceneId: 'sc_roof',
          },
          { id: 'o3', label: '先回校门口等待大家', lockedBehavior: 'hide', effects: [], targetType: 'scene', targetSceneId: 'sc_merge' },
        ],
      },
    ];
    proj.scenes.push(
      {
        id: 'sc_garden',
        chapterId: 'ch_2',
        name: '中庭紫阳花圃',
        order: 1,
        disabled: false,
        nextSceneId: 'sc_merge',
        blocks: [
          { id: 'bg_g', type: 'background', assetId: bgAssets[1].id, transition: 'dissolve', transitionDuration: 0.6 },
          { id: 'dg_1', type: 'dialogue', speakerId: 'ch_lin', text: '风里带着花香，明天也要一起走回家哦！' },
        ],
      },
      {
        id: 'sc_roof',
        chapterId: 'ch_2',
        name: '秘密天台观星',
        order: 2,
        disabled: false,
        nextSceneId: null,
        blocks: [
          { id: 'bg_r', type: 'background', assetId: bgAssets[2].id, transition: 'fade', transitionDuration: 0.8 },
          { id: 'dr_1', type: 'dialogue', speakerId: 'ch_shen', text: '只有你记得这个秘密地点。' },
          { id: 'er_1', type: 'flow', action: 'ending', endingId: 'end_true', endingTitle: '真结局：星光约定', endingSubtitle: '你们在天台定下永不褪色的约定' },
        ],
      },
      {
        id: 'sc_merge',
        chapterId: 'ch_2',
        name: '校门口路线汇合',
        order: 3,
        disabled: false,
        nextSceneId: null,
        blocks: [
          { id: 'dm_1', type: 'dialogue', speakerId: null, text: '暮色四合，大家在校门口汇合，相约明日再见。' },
          { id: 'em_1', type: 'flow', action: 'ending', endingId: 'end_norm', endingTitle: '普通结局：明日再会', endingSubtitle: '温暖平静的校园时光' },
        ],
      }
    );
    proj.extensions.galleryAndEndings.enabled = true;
    proj.extensions.affectionSystem.enabled = true;
    proj.extensions.affectionSystem.tracks = [{ characterId: 'ch_lin', variableId: 'var_aff', maxVal: 10, label: '林夏好感度' }];
    proj.extensions.sixSlotSaveScreen.enabled = true;
    proj.extensions.chapterTitleCard.enabled = true;
    proj.localization.languages = [
      {
        code: 'en',
        name: 'English（英语）',
        imageOverrides: {},
        translations: {
          'meta.title': 'Breeze of Sakura Courtyard',
          'blk.b5.text': 'After-school bells faded as the amber sunset streamed across the wooden desks.',
          'blk.b6.text': 'The sky is so clear today! Want to watch the sunset together?',
        },
      },
      { code: 'ja', name: '日本語（日语）', imageOverrides: {}, translations: { 'meta.title': '桜庭の微風' } },
    ];
    fs.writeFileSync(jsonPath, JSON.stringify(proj, null, 2), 'utf8');

    // Open hydrated showcase project cleanly from Home
    await win.getByText('樱庭微风 · 夏日物语').first().click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible' });
    await win.waitForTimeout(500);

    // Click dialogue card b6 so right instant preview displays background + both sprites + dialogue!
    await win.getByTestId('story-card-b6').click();
    await snap('02-story-workbench-cards.png');

    // 3. Slide-over Add Content Drawer
    await win.getByTestId('header-add-content-btn').click();
    await snap('03-story-add-drawer.png');
    await win.keyboard.press('Escape').catch(() => {});
    await win.mouse.click(200, 200);

    // 4. Plain Text Script View
    await win.getByTestId('story-view-script').click();
    await snap('04-story-plain-script.png');

    // 5. Narrative Flowchart & Causal Map
    await win.getByTestId('story-view-flow').click();
    await snap('05-story-flowchart-causal.png');
    await win.getByTestId('story-view-cards').click();

    // 6 & 7. Characters & Story States
    await win.getByTestId('nav-characters').click();
    await snap('06-characters-roster.png');
    await win.getByTestId('tab-variables').click();
    await snap('07-story-variables.png');

    // 8. Asset Manager
    await win.getByTestId('nav-assets').click();
    await snap('08-assets-manager.png');

    // 9. Game Appearance
    await win.getByTestId('nav-appearance').click();
    await win.getByTestId('appearance-cat-dialogue').click();
    await snap('09-appearance-editor.png');

    // 10. Extensions Marketplace
    await win.getByTestId('nav-extensions').click();
    await snap('10-extensions-marketplace.png');

    // 11. Reuse Library
    await win.getByTestId('nav-reuse').click();
    await snap('11-reuse-library.png');

    // 12. Localization Workbench
    await win.getByTestId('nav-localization').click();
    await snap('12-localization-workbench.png');

    // 13. Completion Wizard
    await win.getByTestId('nav-finish').click();
    await snap('13-finish-wizard.png');

    // 14. Built-in AI Assistant Drawer
    await win.getByTestId('nav-story').click();
    await win.getByTestId('story-card-b6').click();
    await win.getByTestId('toggle-ai-drawer-btn').click();
    await snap('14-ai-assistant-drawer.png');
    await win.getByTestId('toggle-ai-drawer-btn').click();

    // 15. Offline ASR Workbench Modal
    await win.getByTestId('open-asr-btn').click();
    await snap('15-offline-asr-modal.png');
    await win.locator('[data-testid="asr-modal"] button').first().click();

    // 16. Opt-in Advanced Mode
    await win.getByTestId('toggle-advanced-mode-btn').click();
    await win.waitForTimeout(450);
    await snap('16-advanced-mode.png');

    console.log('[screenshots] ✅ Captured all 16 HD showcase screenshots to docs/screenshots/');
  } finally {
    try {
      await app.close();
    } catch {}
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error('[screenshots] FAILED:', err);
  process.exit(1);
});
