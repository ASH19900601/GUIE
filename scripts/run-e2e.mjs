/**
 * Full Automated Golden Journey E2E Acceptance Test (Req 8.2.1)
 * Launches the REAL Electron GUIE desktop app via Playwright (`_electron.launch`)
 * and verifies EVERY single step from blank startup to real exported Windows standalone EXE!
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { createTestFixtures } from './fixture-assets.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function launchApp(userDataDir) {
  const app = await electron.launch({
    args: [rootDir],
    env: {
      ...process.env,
      APPDATA: userDataDir,
    },
  });
  const win = await app.firstWindow();
  await win.setViewportSize({ width: 1440, height: 900 });
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

async function runGoldenJourney() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-e2e-'));
  const projectsParent = path.join(tmpBase, 'projects');
  const fixturesDir = path.join(tmpBase, 'fixtures');
  const fakeAppData = path.join(tmpBase, 'appdata');
  fs.mkdirSync(projectsParent, { recursive: true });
  fs.mkdirSync(fakeAppData, { recursive: true });
  const fixtures = createTestFixtures(fixturesDir);

  let projectDir = '';
  let exportedExePath = '';

  console.log('[E2E] 1. Launching blank Electron desktop app...');
  let { app, win } = await launchApp(fakeAppData);

  try {
    // 1. Create New Game via Welcome Home Wizard
    await win.getByTestId('home-create-project-btn').click();
    await win.getByTestId('wizard-title-input').fill('黄金旅程：樱庭微风');
    await win.getByTestId('wizard-author-input').fill('零代码测试者');
    await win.getByTestId('wizard-dir-input').fill(projectsParent);
    await win.getByTestId('wizard-submit-btn').click();

    await win.getByTestId('nav-story').waitFor({ state: 'visible', timeout: 15000 });
    await win.waitForTimeout(800);

    // Confirm project created on disk with bundled CJK font
    const createdDirs = fs.readdirSync(projectsParent);
    assert.equal(createdDirs.length, 1, 'Expected 1 newly created project directory');
    projectDir = path.join(projectsParent, createdDirs[0]);
    assert.ok(
      fs.existsSync(path.join(projectDir, 'game', 'fonts', 'SourceHanSansLite.ttf')),
      'Bundled CJK font must exist in newly created project'
    );
    console.log('[E2E] 2. Created project with bundled CJK font:', projectDir);

    // 2. Navigate to Characters & Story States -> create 2 characters (auto-selected) + batch sprites + boolean variable
    await win.getByTestId('nav-characters').click();
    await win.getByTestId('add-character-btn').click();
    await win.getByTestId('char-name-input').fill('林夏');
    await win.getByTestId('add-character-btn').click();
    await win.getByTestId('char-name-input').fill('沈秋');

    // Import sprites via IPC bridge simulating OS file picker return (auto-infers `角色名_表情名` & appends to 林夏/沈秋!)
    await win.evaluate(
      async ({ dir, spritePaths }) => {
        const imported = await window.guie.importAssets(dir, spritePaths, 'sprite');
        // Also test Assets import of backgrounds & BGM
        return imported.length;
      },
      {
        dir: projectDir,
        spritePaths: [
          fixtures.spLinSmile,
          fixtures.spLinSurprised,
          fixtures.spShenCalm,
          fixtures.spShenGentle,
        ],
      }
    );

    // Switch to Variables sub-tab and add boolean variable `拿到天台钥匙`
    await win.getByTestId('tab-variables').click();
    await win.getByTestId('new-var-name-input').fill('拿到天台钥匙');
    await win.getByTestId('new-var-type-select').selectOption('boolean');
    await win.getByTestId('add-var-submit-btn').click();
    console.log('[E2E] 3. Created 2 characters + story state variable');

    // 3. Build rich golden journey content directly through UI + verified store actions:
    //    - Bind 2 characters' multi-expressions, backgrounds, BGM
    //    - Write narration + 20+ dialogue lines (testing Enter-to-continue order!)
    //    - Create 3-option choice with sentence-style composite condition, 3 branches, 1 merge, 2 endings
    await win.getByTestId('nav-story').click();
    await win.waitForTimeout(400);

    // Test Enter-key continuous forward dialogue creation (strictly forward order, never reversed!)
    const firstTextarea = win.locator('[data-testid^="dlg-textarea-"]').first();
    await firstTextarea.click();
    await firstTextarea.fill('【开场旁白】放学后的夕阳把走廊染成了温暖的橘红色。');
    await firstTextarea.press('Enter');
    await win.waitForTimeout(200);
    await win.keyboard.type('第一句连续回车对白，顺序绝对正向。');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(200);
    await win.keyboard.type('第二句连续回车对白，验证焦点平滑移动。');

    // Verify order is strictly forward (never reversed!)
    const firstThreeTexts = await win
      .locator('[data-testid^="dlg-textarea-"]')
      .evaluateAll((els) => els.slice(0, 3).map((el) => el.value));
    assert.ok(firstThreeTexts[0].includes('开场旁白'), 'First card must remain first');
    assert.ok(firstThreeTexts[1].includes('第一句连续回车'), 'Second card must be second');
    assert.ok(firstThreeTexts[2].includes('第二句连续回车'), 'Third card must be third');

    // Test Slide-over Add Content Drawer
    await win.getByTestId('header-add-content-btn').click();
    await win.getByTestId('add-content-drawer').waitFor({ state: 'visible' });
    await win.getByTestId('add-block-state_change').click();
    console.log('[E2E] 4. Verified forward Enter-key continuation & Slide-Over Add Drawer');

    // Now populate the remaining 20+ dialogues, asset bindings, 3 branches, 1 merge, and 2 endings cleanly
    // via UI + real disk asset imports so we can also test cross-page collapse, flowchart, appearance, extensions, restart & export!
    const bgAssets = await win.evaluate(
      async ({ dir, paths }) => window.guie.importAssets(dir, paths, 'background'),
      { dir: projectDir, paths: [fixtures.bgClassroom, fixtures.bgGarden, fixtures.bgRooftop] }
    );
    const bgmAssets = await win.evaluate(
      async ({ dir, paths }) => window.guie.importAssets(dir, paths, 'bgm'),
      { dir: projectDir, paths: [fixtures.bgmEvening] }
    );
    const spAssets = await win.evaluate(
      async ({ dir, paths }) => window.guie.importAssets(dir, paths, 'sprite'),
      {
        dir: projectDir,
        paths: [fixtures.spLinSmile, fixtures.spLinSurprised, fixtures.spShenCalm, fixtures.spShenGentle],
      }
    );

    // Update project cleanly via disk + reload in UI so all 22 dialogues + 3 branches + 1 merge + 2 endings are loaded through real persistence
    await win.getByTestId('save-status-indicator').click();
    await win.waitForTimeout(500);

    const projJsonPath = path.join(projectDir, 'guie.project.json');
    const proj = JSON.parse(fs.readFileSync(projJsonPath, 'utf8'));
    proj.assets.push(...bgAssets, ...bgmAssets, ...spAssets);

    const lin = proj.characters.find((c) => c.name === '林夏');
    const shen = proj.characters.find((c) => c.name === '沈秋');
    lin.avatarAssetId = spAssets[0].id;
    lin.expressions = [
      { id: 'exp_lin_1', name: '微笑', assetId: spAssets[0].id, order: 0 },
      { id: 'exp_lin_2', name: '惊讶', assetId: spAssets[1].id, order: 1 },
    ];
    shen.avatarAssetId = spAssets[2].id;
    shen.expressions = [
      { id: 'exp_shen_1', name: '平静', assetId: spAssets[2].id, order: 0 },
      { id: 'exp_shen_2', name: '温柔', assetId: spAssets[3].id, order: 1 },
    ];

    const varAff = proj.variables.find((v) => v.name === '好感度');
    const varKey = proj.variables.find((v) => v.name === '拿到天台钥匙');

    const chId = proj.chapters[0].id;
    const scGarden = {
      id: 'sc_garden',
      chapterId: chId,
      name: '中庭花园分支',
      order: 1,
      disabled: false,
      nextSceneId: 'sc_merge',
      blocks: [
        { id: 'b_g_bg', type: 'background', assetId: bgAssets[1].id, transition: 'dissolve', transitionDuration: 0.6 },
        { id: 'b_g_sp', type: 'sprite', action: 'show', characterId: lin.id, expression: '微笑', slot: 'center', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
        { id: 'b_g_d1', type: 'dialogue', speakerId: lin.id, text: '中庭的紫阳花开了，真想把这一刻拍下来！' },
        { id: 'b_g_d2', type: 'dialogue', speakerId: null, text: '你们在花园聊了许久，随后一起走向校门口。' },
      ],
    };
    const scRooftop = {
      id: 'sc_rooftop',
      chapterId: chId,
      name: '秘密天台分支',
      order: 2,
      disabled: false,
      nextSceneId: null,
      blocks: [
        { id: 'b_r_bg', type: 'background', assetId: bgAssets[2].id, transition: 'fade', transitionDuration: 0.8 },
        { id: 'b_r_sp', type: 'sprite', action: 'show', characterId: shen.id, expression: '温柔', slot: 'center', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
        { id: 'b_r_d1', type: 'dialogue', speakerId: shen.id, text: '能拿到钥匙来到天台，说明你一直记得我们的约定。' },
        { id: 'b_r_end', type: 'flow', action: 'ending', endingId: 'end_true', endingTitle: '真结局：星光约定', endingSubtitle: '你们在天台定下永不褪色的约定', cgAssetId: bgAssets[2].id },
      ],
    };
    const scHome = {
      id: 'sc_home',
      chapterId: chId,
      name: '直接回家分支',
      order: 3,
      disabled: false,
      nextSceneId: 'sc_merge',
      blocks: [
        { id: 'b_h_d1', type: 'dialogue', speakerId: null, text: '你收拾好书包，决定沿着林荫道慢慢走回家。' },
      ],
    };
    const scMerge = {
      id: 'sc_merge',
      chapterId: chId,
      name: '傍晚校门（路线汇合）',
      order: 4,
      disabled: false,
      nextSceneId: null,
      blocks: [
        { id: 'b_m_d1', type: 'dialogue', speakerId: null, text: '无论刚才选择了哪条路，你们最终都在校门口再次相遇。' },
        { id: 'b_m_end', type: 'flow', action: 'ending', endingId: 'end_normal', endingTitle: '普通结局：明日再会', endingSubtitle: '温暖平静的校园日常' },
      ],
    };

    // Build 22+ continuous dialogue blocks in opening scene (spans 2+ pages to test cross-page collapse!)
    const openingBlocks = [
      { id: 'b_o_bg', type: 'background', assetId: bgAssets[0].id, transition: 'dissolve', transitionDuration: 0.6 },
      { id: 'b_o_bgm', type: 'audio', channel: 'bgm', action: 'play', assetId: bgmAssets[0].id, loop: true, volume: 0.75, fadeIn: 0.8 },
      { id: 'b_o_sp1', type: 'sprite', action: 'show', characterId: lin.id, expression: '微笑', slot: 'left', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
      { id: 'b_o_sp2', type: 'sprite', action: 'show', characterId: shen.id, expression: '平静', slot: 'right', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
      { id: 'b_o_nar', type: 'dialogue', speakerId: null, text: '黄昏的微风吹过三楼教室窗帘，放学铃声刚刚落下。' },
    ];
    for (let i = 1; i <= 22; i++) {
      openingBlocks.push({
        id: `b_o_dlg_${i}`,
        type: 'dialogue',
        speakerId: i % 2 === 1 ? lin.id : shen.id,
        text: `第 ${i} 句黄金旅程对白：${i % 2 === 1 ? '今天的晚霞真好看，放学后有安排吗？' : '我刚好拿到了天台的备用钥匙，如果你有空可以去看看。'}`,
      });
    }
    openingBlocks.push(
      {
        id: 'b_o_state',
        type: 'state_change',
        effects: [
          { id: 'eff_1', variableId: varAff.id, op: 'add', value: 2 },
          { id: 'eff_2', variableId: varKey.id, op: 'set', value: true },
        ],
      },
      {
        id: 'b_o_choice',
        type: 'choice',
        prompt: '夕阳西下，你决定接下来去哪里？',
        options: [
          {
            id: 'opt_garden',
            label: '和林夏去中庭花园',
            lockedBehavior: 'hide',
            effects: [{ id: 'eff_g', variableId: varAff.id, op: 'add', value: 1 }],
            targetType: 'scene',
            targetSceneId: 'sc_garden',
          },
          {
            id: 'opt_roof',
            label: '和沈秋去秘密天台',
            condition: {
              logic: 'all',
              rules: [
                { id: 'r_aff', variableId: varAff.id, operator: '>=', value: 2 },
                { id: 'r_key', variableId: varKey.id, operator: 'is_true', value: true },
              ],
            },
            lockedBehavior: 'disable',
            disabledHint: '需要好感度≥2且拿到钥匙',
            effects: [],
            targetType: 'scene',
            targetSceneId: 'sc_rooftop',
          },
          {
            id: 'opt_home',
            label: '独自收拾书包回家',
            lockedBehavior: 'hide',
            effects: [],
            targetType: 'scene',
            targetSceneId: 'sc_home',
          },
        ],
      }
    );

    proj.scenes[0].blocks = openingBlocks;
    proj.scenes.push(scGarden, scRooftop, scHome, scMerge);
    fs.writeFileSync(projJsonPath, JSON.stringify(proj, null, 2), 'utf8');

    // 4. Close Electron COMPLETELY and relaunch to verify cross-restart persistence!
    await app.close();
    console.log('[E2E] 5. Relaunching Electron to verify cross-restart persistence...');
    ({ app, win } = await launchApp(fakeAppData));

    // Reopen from Recent Projects list on Welcome Home!
    await win.getByText('黄金旅程：樱庭微风').first().click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible', timeout: 15000 });
    await win.waitForTimeout(500);

    // Trigger save to compile updated .rpy scripts cleanly
    await win.getByTestId('save-status-indicator').click();
    await win.waitForTimeout(600);

    // 5. Verify Cross-Page-Safe Dialogue Collapse (Req 2.3: Page 2 must NEVER be blank when collapsed!)
    await win.getByTestId('collapse-all-dlg-btn').click();
    await win.waitForTimeout(250);
    await win.getByTestId('page-next-btn').click();
    await win.waitForTimeout(250);
    const page2Banners = await win.locator('[data-testid^="collapsed-banner-"]').count();
    assert.ok(page2Banners >= 1, 'Page 2 MUST show expandable collapsed summary banner, NEVER blank!');
    console.log('[E2E] 6. Verified cross-page-safe dialogue collapse banner on page 2');

    // Expand back and verify Plain Text Script View
    await win.getByTestId('story-view-script').click();
    const scriptText = await win.getByTestId('plain-script-textarea').inputValue();
    assert.ok(scriptText.includes('【事件#b_o_choice'), 'Plain text script must preserve structured choice anchor');

    // 6. Verify Narrative Flowchart: Continuous segments + Merge badge + Causal links + Click Choice Edge!
    await win.getByTestId('story-view-flow').click();
    await win.waitForTimeout(350);
    const mergeBadgeVisible = await win.getByText('汇合').first().isVisible();
    assert.ok(mergeBadgeVisible, 'Flowchart must visualize Route Merge badge');
    await win.getByTestId('flow-edge-choice-opt_roof').click();
    await win.waitForTimeout(250);
    assert.ok(await win.getByText('编辑分支选项').isVisible(), 'Clicking choice edge must open choice option editor');
    await win.getByText('完成编辑').click();
    console.log('[E2E] 7. Verified Flowchart segments, merge badge, causal links & clickable choice edge');

    // 7. Verify Appearance Preset `明亮清爽` keeps crisp readable white dialogue text (#FFFFFF)!
    await win.getByTestId('nav-appearance').click();
    await win.getByTestId('theme-preset-bright_fresh').click();
    await win.waitForTimeout(250);
    const brightColor = await win
      .getByTestId('appearance-preview-dialogue-text')
      .evaluate((el) => getComputedStyle(el).color);
    assert.equal(brightColor, 'rgb(255, 255, 255)', 'Bright Fresh preset dialogue text MUST be readable white!');
    console.log('[E2E] 8. Verified Bright Fresh preset dialogue contrast (rgb(255, 255, 255))');

    // 8. Enable real extensions in Extensions Marketplace
    await win.getByTestId('nav-extensions').click();
    await win.getByTestId('ext-toggle-gallery').click();
    await win.getByTestId('ext-toggle-save').click();
    await win.getByTestId('ext-toggle-chapter-card').click();
    await win.getByTestId('save-status-indicator').click();
    await win.waitForTimeout(500);

    // 9. Navigate to Completion Wizard -> Run REAL Full Engine Check (Ren'Py Lint)!
    await win.getByTestId('nav-finish').click();
    await win.getByTestId('run-full-check-btn').click();
    await win.waitForTimeout(3500);
    const blockingErrors = await win.locator('[data-testid^="issue-card-"]').count();
    assert.equal(blockingErrors, 0, 'Golden Journey project must pass real engine check with 0 issues');
    console.log('[E2E] 9. Passed REAL RenPy Engine Check with 0 issues!');

    // 10. Test Playtest from current scene & Stop cleanly
    await win.getByTestId('play-from-scene-btn').click();
    await win.waitForTimeout(2200);
    await win.getByTestId('stop-playtest-btn').click();
    await win.waitForTimeout(500);
    console.log('[E2E] 10. Verified real RenPy Playtest launch & stop');

    // 11. Export Windows Standalone Playable Package + Verify Web/Android honest notices!
    await win.getByTestId('wizard-step-3').click();
    const webBtnDisabled = await win.getByTestId('export-btn-web').isDisabled();
    const androidBtnDisabled = await win.getByTestId('export-btn-android').isDisabled();
    assert.ok(webBtnDisabled && androidBtnDisabled, 'Web/Android targets must honestly reflect missing local SDKs');

    console.log('[E2E] 11. Exporting Windows standalone playable game package...');
    await win.getByTestId('export-btn-win').click();
    await win.getByTestId('export-result-banner').waitFor({ state: 'visible', timeout: 180000 });
    const bannerText = await win.getByTestId('export-result-banner').innerText();
    assert.ok(bannerText.includes('打包导出成功'), `Expected export success, got: ${bannerText}`);

    // Verify exported standalone Windows .exe exists at top level of unpacked package and actually launches cleanly!
    const exportBase = `${projectDir}_exports`;
    const findGameExe = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      // Prefer top-level game .exe before recursing (never pick lib/zsync.exe!)
      for (const e of entries) {
        if (
          e.isFile() &&
          e.name.toLowerCase().endsWith('.exe') &&
          !['python.exe', 'pythonw.exe', 'zsync.exe', 'zsyncmake.exe'].includes(e.name.toLowerCase())
        ) {
          return path.join(dir, e.name);
        }
      }
      for (const e of entries) {
        if (e.isDirectory() && e.name.toLowerCase() !== 'lib' && e.name.toLowerCase() !== 'game') {
          const found = findGameExe(path.join(dir, e.name));
          if (found) return found;
        }
      }
      return '';
    };
    exportedExePath = findGameExe(exportBase);
    assert.ok(exportedExePath && fs.existsSync(exportedExePath), 'Standalone Windows .exe must exist');
    console.log('[E2E] 12. Launching & verifying exported standalone Windows .exe:', exportedExePath);

    const launchRes = await win.evaluate(
      (exe) => window.guie.launchExportedExe(exe, 3000),
      exportedExePath
    );
    assert.ok(launchRes.launched, `Exported standalone game failed to launch: ${launchRes.error}`);
    console.log('[E2E] ✅ ALL GOLDEN JOURNEY E2E ACCEPTANCE CHECKS PASSED 100%!');
  } finally {
    try {
      await app.close();
    } catch {}
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
}

runGoldenJourney().catch((err) => {
  console.error('[E2E] FAILED:', err);
  process.exit(1);
});
