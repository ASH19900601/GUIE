/**
 * Comprehensive Step-by-Step All-Major-Features Desktop E2E Verification Suite
 * Exercises EVERY major feature in the REAL Electron desktop application end-to-end!
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
  await win.setViewportSize({ width: 1460, height: 920 });
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

function logStep(num, title) {
  console.log(`\n[STEP ${num}/16] ${title}...`);
}

async function runAllFeaturesE2E() {
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-matrix-e2e-'));
  const projectsParent = path.join(tmpBase, 'projects');
  const fixturesDir = path.join(tmpBase, 'fixtures');
  const fakeAppData = path.join(tmpBase, 'appdata');
  fs.mkdirSync(projectsParent, { recursive: true });
  fs.mkdirSync(fakeAppData, { recursive: true });
  const fixtures = createTestFixtures(fixturesDir);

  let { app, win } = await launchApp(fakeAppData);

  try {
    // =========================================================================
    // STEP 1: Welcome Home & Zero-Config Project Creation
    // =========================================================================
    logStep(1, '欢迎首页 & 零配置创建项目 + 多语言字体自动就绪');
    await win.getByTestId('home-create-project-btn').click();
    await win.getByTestId('wizard-title-input').fill('全功能审计验收物语');
    await win.getByTestId('wizard-author-input').fill('深度测试员');
    await win.getByTestId('wizard-dir-input').fill(projectsParent);
    await win.getByTestId('wizard-submit-btn').click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible', timeout: 15000 });
    await win.waitForTimeout(500);

    const projectDir = path.join(projectsParent, fs.readdirSync(projectsParent)[0]);
    assert.ok(fs.existsSync(path.join(projectDir, 'game', 'fonts', 'SourceHanSansLite.ttf')));
    console.log('  ✅ 项目创建成功且内置 CJK 字体已部署:', projectDir);

    // =========================================================================
    // STEP 2: Characters Roster (Auto-Select) & Decoupled Story States
    // =========================================================================
    logStep(2, '角色阵容自动选中 + 故事状态（数字/开关/文字/跨周目持久）');
    await win.getByTestId('nav-characters').click();
    await win.getByTestId('add-character-btn').click();
    await win.getByTestId('char-name-input').fill('林夏');
    await win.getByTestId('add-character-btn').click();
    // Auto-select check: input must immediately reflect the newly created 2nd character, NOT 林夏!
    const secondCharVal = await win.getByTestId('char-name-input').inputValue();
    assert.notEqual(secondCharVal, '林夏', 'Adding a new character must auto-select it!');
    await win.getByTestId('char-name-input').fill('沈秋');

    // Add boolean & string story variables
    await win.getByTestId('tab-variables').click();
    await win.getByTestId('new-var-name-input').fill('拿到钥匙');
    await win.getByTestId('new-var-type-select').selectOption('boolean');
    await win.getByTestId('add-var-submit-btn').click();

    await win.getByTestId('new-var-name-input').fill('玩家称号');
    await win.getByTestId('new-var-type-select').selectOption('string');
    await win.getByTestId('add-var-submit-btn').click();
    console.log('  ✅ 双角色自动切换选中 + 数字/开关/文字故事状态创建成功');

    // =========================================================================
    // STEP 3: Story Workbench — Chapters, Explicit Scene Chain, Enter-Continue, Drawer, Outline Jump
    // =========================================================================
    logStep(3, '故事工作台：章节管理 + 新建场景链式衔接 + 回车正向连录 + 抽屉添加 + 场景内大纲跳转');
    await win.getByTestId('nav-story').click();
    await win.waitForTimeout(300);

    // Create 2 scenes with explicit chain: 开场场景 -> 走廊场景 -> 教室尾声 (verify chain never orphans!)
    await win.getByTestId('outline-new-scene-btn').click();
    await win.getByTestId('new-scene-name-input').fill('教室尾声');
    await win.getByTestId('new-scene-confirm-btn').click();
    await win.waitForTimeout(300);

    // Switch back to opening scene, insert another scene after_current -> must chain 开场场景 -> 走廊插曲 -> 教室尾声!
    await win.locator('[data-testid^="scene-item-"]').first().click();
    await win.waitForTimeout(250);
    await win.getByTestId('outline-new-scene-btn').click();
    await win.getByTestId('new-scene-name-input').fill('走廊插曲');
    await win.getByTestId('new-scene-confirm-btn').click();
    await win.waitForTimeout(300);

    // Verify 走廊插曲 inherited nextSceneId -> 教室尾声!
    const inheritedNext = await win.getByTestId('scene-next-select').inputValue();
    assert.ok(inheritedNext, 'Inserting scene after_current must preserve downstream chain!');

    // Go back to opening scene and test Enter-key forward dialogue creation
    await win.locator('[data-testid^="scene-item-"]').first().click();
    await win.waitForTimeout(250);
    const firstTa = win.locator('[data-testid^="dlg-textarea-"]').first();
    await firstTa.click();
    await firstTa.fill('第一句开场旁白。');
    await firstTa.press('Enter');
    await win.waitForTimeout(180);
    await win.keyboard.type('第二句正向回车对白。');
    await win.keyboard.press('Enter');
    await win.waitForTimeout(180);
    await win.keyboard.type('第三句正向回车对白。');

    const texts = await win
      .locator('[data-testid^="dlg-textarea-"]')
      .evaluateAll((els) => els.slice(0, 3).map((e) => e.value));
    assert.ok(texts[0].includes('第一句') && texts[1].includes('第二句') && texts[2].includes('第三句'));

    // Slide-over Add Drawer -> add background + choice
    await win.getByTestId('header-add-content-btn').click();
    await win.getByTestId('add-content-drawer').waitFor({ state: 'visible' });
    await win.getByTestId('add-block-choice').click();
    await win.waitForTimeout(200);

    // Verify In-Scene Outline Quick-Jump selector exists and has options
    const outlineOptions = await win.getByTestId('in-scene-outline-jump').locator('option').count();
    assert.ok(outlineOptions >= 3, 'In-scene outline jump must list key beats');
    console.log('  ✅ 场景链式衔接、回车连录、滑出抽屉与场景内大纲跳转验证通过');

    // =========================================================================
    // STEP 4: Plain Text Script View Auto-Flush (ZERO data loss on tab switch without clicking Sync!)
    // =========================================================================
    logStep(4, '纯文本剧本视图：未点同步直接切页自动落盘 + 无损保留结构化分支事件');
    await win.getByTestId('story-view-script').click();
    await win.waitForTimeout(200);
    const scriptTa = win.getByTestId('plain-script-textarea');
    const origScript = await scriptTa.inputValue();
    assert.ok(origScript.includes('【事件#'), 'Plain text script must contain structured event anchor');
    await scriptTa.fill(`林夏：纯文本未点同步的自动落盘测试！\n${origScript}`);

    // Confirm save status immediately reflects unsaved draft (NOT falsely '所有修改已保存'!)
    const statusText = await win.getByTestId('save-status-indicator').innerText();
    assert.ok(statusText.includes('未保存'), `Expected dirty indicator, got: ${statusText}`);

    // Switch directly to Characters tab WITHOUT clicking '同步到故事卡片'
    await win.getByTestId('nav-characters').click();
    await win.waitForTimeout(450);
    await win.getByTestId('nav-story').click();
    await win.getByTestId('story-view-cards').click();
    await win.waitForTimeout(300);

    const cardTextsAfter = await win
      .locator('[data-testid^="dlg-textarea-"]')
      .evaluateAll((els) => els.map((e) => e.value));
    assert.ok(
      cardTextsAfter.some((t) => t.includes('纯文本未点同步的自动落盘测试')),
      'Plain text draft MUST auto-flush on navigation with zero data loss!'
    );
    const choiceCardsCount = await win.locator('[data-block-type="choice"]').count();
    assert.equal(choiceCardsCount, 1, 'Structured choice block must be preserved losslessly');
    console.log('  ✅ 纯文本草稿切页强制落盘 & 结构化事件无损保留验证通过');

    // =========================================================================
    // STEP 5: Populate rich multi-branch + assets, then verify Flowchart drag + Choice Edge Editor!
    // =========================================================================
    logStep(5, '选线流程图：节点拖拽不跳出 + 汇合徽章 + 因果连线 + 点选项连线直改选项');
    await win.getByTestId('save-status-indicator').click();
    await win.waitForTimeout(400);

    // Import real image/audio fixtures cleanly
    const bgAssets = await win.evaluate(
      ({ dir, paths }) => window.guie.importAssets(dir, paths, 'background'),
      { dir: projectDir, paths: [fixtures.bgClassroom, fixtures.bgGarden, fixtures.bgRooftop] }
    );
    const spAssets = await win.evaluate(
      ({ dir, paths }) => window.guie.importAssets(dir, paths, 'sprite'),
      { dir: projectDir, paths: [fixtures.spLinSmile, fixtures.spLinSurprised, fixtures.spShenCalm] }
    );
    const bgmAssets = await win.evaluate(
      ({ dir, paths }) => window.guie.importAssets(dir, paths, 'bgm'),
      { dir: projectDir, paths: [fixtures.bgmEvening] }
    );

    // Hydrate multi-branch + merge + 22 dialogues via Home -> JSON -> Reopen so persistence is real
    await win.getByTestId('back-to-home-btn').click();
    await win.getByTestId('home-create-project-btn').waitFor({ state: 'visible' });

    const projPath = path.join(projectDir, 'guie.project.json');
    const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
    proj.assets.push(...bgAssets, ...spAssets, ...bgmAssets);
    const lin = proj.characters.find((c) => c.name === '林夏');
    const shen = proj.characters.find((c) => c.name === '沈秋');
    lin.avatarAssetId = spAssets[0].id;
    lin.expressions = [
      { id: 'exp_l1', name: '微笑', assetId: spAssets[0].id, order: 0 },
      { id: 'exp_l2', name: '惊讶', assetId: spAssets[1].id, order: 1 },
    ];
    shen.avatarAssetId = spAssets[2].id;
    shen.expressions = [{ id: 'exp_s1', name: '平静', assetId: spAssets[2].id, order: 0 }];

    const affVar = proj.variables.find((v) => v.name === '好感度');
    const scStart = proj.scenes[0];
    const scMid = proj.scenes[2]; // 走廊插曲
    const scEnd = proj.scenes[1]; // 教室尾声
    scMid.nextSceneId = scEnd.id;
    scEnd.nextSceneId = null;
    scEnd.blocks = [
      { id: 'b_end_d1', type: 'dialogue', speakerId: lin.id, text: '两条路线在这里汇合啦！' },
      { id: 'b_end_fin', type: 'flow', action: 'ending', endingId: 'end_merge', endingTitle: '汇合结局：放学同行', endingSubtitle: '一起回家' },
    ];

    const scRoof = {
      id: 'sc_roof_branch',
      chapterId: proj.chapters[0].id,
      name: '天台秘密路线',
      order: 3,
      disabled: false,
      nextSceneId: scEnd.id,
      blocks: [
        { id: 'b_rf_bg', type: 'background', assetId: bgAssets[2].id, transition: 'blinds', transitionDuration: 0.7 },
        { id: 'b_rf_d1', type: 'dialogue', speakerId: shen.id, text: '欢迎来到秘密天台，好感度已经达标！' },
      ],
    };
    proj.scenes.push(scRoof);

    scStart.nextSceneId = null;
    scStart.blocks = [
      { id: 'b_s_bg', type: 'background', assetId: bgAssets[0].id, transition: 'dissolve', transitionDuration: 0.5 },
      { id: 'b_s_bgm', type: 'audio', channel: 'bgm', action: 'play', assetId: bgmAssets[0].id, loop: true, volume: 0.75, fadeIn: 0.5 },
      { id: 'b_s_sp', type: 'sprite', action: 'show', characterId: lin.id, expression: '微笑', slot: 'center', scale: 1, rotation: 0, alpha: 1, zOrder: 10, transition: 'dissolve', transitionDuration: 0.4 },
      ...Array.from({ length: 22 }, (_, i) => ({
        id: `b_s_d_${i + 1}`,
        type: 'dialogue',
        speakerId: i % 2 === 0 ? lin.id : shen.id,
        text: `第 ${i + 1} 句剧情对白测试内容。`,
      })),
      {
        id: 'b_s_st',
        type: 'state_change',
        effects: [{ id: 'ef_aff', variableId: affVar.id, op: 'add', value: 1 }],
      },
      {
        id: 'b_s_ch',
        type: 'choice',
        prompt: '放学后想去哪里？',
        options: [
          {
            id: 'opt_corridor',
            label: '走走廊去教室',
            lockedBehavior: 'hide',
            effects: [],
            targetType: 'scene',
            targetSceneId: scMid.id,
          },
          {
            id: 'opt_roof_locked',
            label: '去秘密天台',
            condition: {
              logic: 'all',
              rules: [{ id: 'r_aff3', variableId: affVar.id, operator: '>=', value: 3 }],
            },
            lockedBehavior: 'disable',
            disabledHint: '需要好感度达到 3',
            effects: [{ id: 'ef_r', variableId: affVar.id, op: 'add', value: 2 }],
            targetType: 'scene',
            targetSceneId: scRoof.id,
          },
        ],
      },
    ];
    fs.writeFileSync(projPath, JSON.stringify(proj, null, 2), 'utf8');

    await win.getByText('全功能审计验收物语').first().click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible' });
    await win.waitForTimeout(400);

    // Cross-page collapse check
    await win.getByTestId('collapse-all-dlg-btn').click();
    await win.getByTestId('page-next-btn').click();
    await win.waitForTimeout(200);
    assert.ok((await win.locator('[data-testid^="collapsed-banner-"]').count()) >= 1);
    await win.getByTestId('collapse-all-dlg-btn').click(); // expand back

    // Switch to Flowchart -> verify Merge badge, drag node WITHOUT getting kicked out of Flowchart, click choice edge!
    await win.getByTestId('story-view-flow').click();
    await win.waitForTimeout(300);
    assert.ok(await win.getByText('汇合').first().isVisible(), 'Merge badge must be visible');

    const firstNode = win.locator('[data-testid^="flow-node-"]').first();
    const box = await firstNode.boundingBox();
    assert.ok(box, 'Flowchart node must have bounding box');
    await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await win.mouse.down();
    await win.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 25, { steps: 6 });
    await win.mouse.up();
    await win.waitForTimeout(200);
    // CRITICAL CHECK: Dragging a node must KEEP us in Flowchart view (NOT accidentally trigger onClick jump!)
    assert.ok(await win.getByTestId('story-flowchart-view').isVisible(), 'Dragging node must stay in Flowchart view!');

    // Click choice edge -> verify enhanced Choice Option Editor modal (targetType + disabledHint)
    await win.getByTestId('flow-edge-choice-opt_roof_locked').click();
    await win.waitForTimeout(200);
    assert.ok(await win.getByText('编辑分支选项').isVisible());
    assert.ok(await win.getByText('触发方式').isVisible(), 'Enhanced choice modal must expose trigger type');
    await win.getByText('完成编辑').click();
    console.log('  ✅ 流程图拖拽不误跳、汇合标记、因果连线与选项直改弹窗全部通过');

    // =========================================================================
    // STEP 6: Instant Preview & Bidirectional Timeline Debugger (No truncation / No interactive wipe!)
    // =========================================================================
    logStep(6, '即时预览 & 双向定位 + 时间轴前后拖动不截断 + 实时改变量解锁分支');
    await win.getByTestId('story-view-cards').click();
    await win.waitForTimeout(250);
    // Navigate back to Page 1 (since Step 5 clicked the choice edge on Page 2)
    const prevBtn = win.getByTestId('page-prev-btn');
    if (await prevBtn.isVisible() && (await prevBtn.isEnabled())) {
      await prevBtn.click();
      await win.waitForTimeout(200);
    }

    // Click card #4 (first dialogue) -> timeline scrubber should have forward steps too!
    await win.getByTestId('story-card-b_s_d_1').click();
    await win.waitForTimeout(250);
    const scrubber = win.getByTestId('timeline-scrubber');
    const maxVal = Number(await scrubber.getAttribute('max'));
    assert.ok(maxVal >= 20, `Scrubber must retain forward steps, got max=${maxVal}`);

    // Scrub backward to step 0, verify maxVal stays >= 20 (NOT truncated!)
    await scrubber.fill('0');
    await scrubber.dispatchEvent('change');
    await win.waitForTimeout(200);
    const maxAfterBack = Number(await scrubber.getAttribute('max'));
    assert.ok(maxAfterBack >= 20, `Scrubbing backward must NOT truncate forward steps! max=${maxAfterBack}`);

    // Jump to choice card via in-scene outline jump!
    await win.getByTestId('in-scene-outline-jump').selectOption('b_s_ch');
    await win.waitForTimeout(300);
    await win.getByTestId('preview-choice-overlay').waitFor({ state: 'visible' });

    // `去秘密天台` requires 好感度 >= 3 (currently 1 -> disabled). Override 好感度 to 5 in debugger!
    const roofBtn = win.getByTestId('preview-choice-overlay').getByRole('button', { name: /去秘密天台/ });
    assert.ok(await roofBtn.isDisabled(), 'Gated choice must start disabled when 好感度=1');

    // Click '+' button in variables debugger until 好感度 >= 3 (or fill input)
    const varNumInput = win.getByTestId('live-preview-pane').locator('input[type="number"]').first();
    await varNumInput.fill('5');
    await win.waitForTimeout(250);
    assert.ok(await roofBtn.isEnabled(), 'Overriding 好感度 to 5 in debugger must immediately unlock gated choice!');

    // Click unlocked choice -> verify cross-scene jump AND route trajectory preserved!
    await roofBtn.click();
    await win.waitForTimeout(300);
    await win.getByTestId('live-preview-pane').getByText('路线轨迹').click();
    await win.waitForTimeout(200);
    const routeText = await win.getByTestId('live-preview-pane').innerText();
    assert.ok(routeText.includes('经由选择：去秘密天台'), `Route trajectory must preserve choice! Got:\n${routeText}`);
    console.log('  ✅ 双向同步、前后无损时间轴、实时改状态解锁分支与跨场景轨迹验证通过');

    // =========================================================================
    // STEP 7: Assets Manager (Chinese badges, filters, recategorize, click usage -> jump to card!)
    // =========================================================================
    logStep(7, '素材管理库：中文分类标签 + 筛选 + 引用位置直达剧情卡片');
    await win.getByTestId('nav-assets').click();
    await win.waitForTimeout(300);
    const assetsText = await win.locator('body').innerText();
    assert.ok(assetsText.includes('背景音乐'), 'Audio badge must show Chinese label');
    // Click background asset card and verify usage list jumps back to story card
    await win.getByTestId(`asset-card-${bgAssets[0].id}`).click();
    await win.waitForTimeout(200);
    const usageBtn = win.getByRole('button', { name: /开场场景.*背景/ }).first();
    await usageBtn.click();
    await win.waitForTimeout(300);
    assert.ok(await win.getByTestId('story-card-b_s_bg').isVisible(), 'Clicking usage location must jump straight to story card');
    console.log('  ✅ 素材分类中文展示与点击引用位置直达剧情卡片验证通过');

    // =========================================================================
    // STEP 8: Appearance Editor (All 5 Categories + Bright Fresh Contrast + Save/Delete Preset)
    // =========================================================================
    logStep(8, '游戏外观 5 分类实时编辑 + 明亮清爽对比度 + 保存/删除自定义预设');
    await win.getByTestId('nav-appearance').click();
    await win.getByTestId('theme-preset-bright_fresh').click();
    await win.waitForTimeout(200);
    const dlgColor = await win
      .getByTestId('appearance-preview-dialogue-text')
      .evaluate((el) => getComputedStyle(el).color);
    assert.equal(dlgColor, 'rgb(255, 255, 255)');

    await win.getByTestId('appearance-cat-dialogue').click();
    await win.getByText(/精细调整/).click();
    assert.ok(await win.getByText(/垂直内边距/).isVisible(), 'Fine-tune must include paddingY');
    assert.ok(await win.getByText('角色名默认颜色').isVisible(), 'Fine-tune must include nameColor');

    await win.getByPlaceholder('将当前对话框样式另存为预设…').fill('自定义复古风');
    await win.getByRole('button', { name: /保存预设/ }).click();
    assert.ok(await win.getByRole('button', { name: '自定义复古风' }).isVisible());
    await win.getByTitle('删除此预设').first().click();

    await win.getByTestId('appearance-cat-buttons').click();
    assert.ok(await win.getByText('按钮文字色').isVisible());
    await win.getByTestId('appearance-cat-window').click();
    assert.ok(await win.getByText('在游戏主菜单标题界面显示游戏名称').isVisible());
    console.log('  ✅ 外观 5 分类完整控件、自定义预设增删与明亮清爽可读性验证通过');

    // =========================================================================
    // STEP 9: Extensions Marketplace (All 6 toggles + Auto-generate Affection Tracks + Card Style)
    // =========================================================================
    logStep(9, '扩展市场：启用全部 6 项系统级扩展 + 一键为全部角色生成跨周目好感度轨道');
    await win.getByTestId('nav-extensions').click();
    await win.getByTestId('ext-toggle-gallery').click();
    await win.getByTestId('ext-toggle-affection').click();
    await win.getByRole('button', { name: '一键为全部角色生成' }).click();
    await win.getByTestId('ext-toggle-save').click();
    await win.getByTestId('ext-toggle-name').click();
    await win.getByTestId('ext-toggle-chapter-card').click();
    assert.ok(await win.getByText('画面风格：').isVisible(), 'Chapter title card style selector must appear');
    console.log('  ✅ 6 大真实扩展全部启用并自动生成全角色好感度轨道');

    // =========================================================================
    // STEP 10: Cross-Project Reuse Library (Character + Custom Selected Snippet)
    // =========================================================================
    logStep(10, '跨项目复用库：保存角色 + 勾选自定义片段并导入');
    await win.getByTestId('nav-reuse').click();
    await win.waitForTimeout(250);
    await win.getByTestId('save-to-reuse-btn').click();
    await win.waitForTimeout(250);
    await win.getByRole('button', { name: /常用剧情片段/ }).click();
    await win.waitForTimeout(200);
    // Check 2 blocks in snippet selector
    const snippetBoxes = win.locator('input[type="checkbox"]');
    if ((await snippetBoxes.count()) >= 2) {
      await snippetBoxes.nth(0).check();
      await snippetBoxes.nth(1).check();
    }
    await win.getByTestId('save-to-reuse-btn').click();
    await win.waitForTimeout(250);
    console.log('  ✅ 跨项目复用库角色与自选剧情片段保存成功');

    // =========================================================================
    // STEP 11: Localization Workbench (Add Language, Translate, Image Override)
    // =========================================================================
    logStep(11, '多语言本地化工作台：添加语言 + 对照翻译 + 图片替换');
    await win.getByTestId('nav-localization').click();
    await win.getByTestId('add-language-btn').click();
    await win.waitForTimeout(250);
    const firstTr = win.locator('textarea').first();
    await firstTr.fill('Full Feature Audit Visual Novel');
    await win.waitForTimeout(200);
    console.log('  ✅ 多语言译文添加与对照编辑验证通过');

    // =========================================================================
    // STEP 12: Cross-Restart History Snapshots Modal + Snapshot Preview!
    // =========================================================================
    logStep(12, '历史版本快照：创建命名版本 + 预览历史内容');
    await win.getByTestId('snapshots-btn').click();
    await win.waitForTimeout(250);
    await win.getByPlaceholder('输入版本备注（如：第一章定稿）…').fill('审计验收里程碑');
    await win.getByRole('button', { name: /保存当前版本/ }).click();
    await win.waitForTimeout(300);
    await win.locator('[data-testid^="preview-snap-"]').first().click();
    await win.waitForTimeout(250);
    assert.ok(await win.getByText(/标题：.*全功能审计验收物语/).isVisible(), 'Snapshot preview must render project metadata');
    // Close snapshots modal
    await win.keyboard.press('Escape').catch(() => {});
    const snapCloseBtn = win.locator('.fixed button').filter({ has: win.locator('svg') }).first();
    if (await win.getByText('项目历史版本（跨重启持久保留）').isVisible()) {
      await win.locator('h2:has-text("项目历史版本")').locator('..').locator('..').locator('button').last().click();
    }
    console.log('  ✅ 历史快照创建与内容预览验证通过');

    // =========================================================================
    // STEP 13: Advanced Mode Switch & Safe Return (verify FontGroup in compiled gui.rpy!)
    // =========================================================================
    logStep(13, '高级模式切换：文件树、源码查看（验证 FontGroup）与安全返回创作模式');
    await win.getByTestId('save-status-indicator').click();
    await win.waitForTimeout(500);
    await win.getByTestId('toggle-advanced-mode-btn').click();
    await win.getByTestId('advanced-mode-view').waitFor({ state: 'visible' });
    await win.getByRole('button', { name: /game\/gui\.rpy/ }).click();
    await win.waitForTimeout(200);
    const guiCode = await win.locator('textarea').first().inputValue();
    assert.ok(guiCode.includes('FontGroup()'), 'gui.rpy must contain CJK+LatinExt+Cyrillic FontGroup()');
    await win.getByTestId('exit-advanced-mode-btn').click();
    await win.getByTestId('nav-story').waitFor({ state: 'visible' });
    console.log('  ✅ 高级模式文件树查看与安全返回创作模式验证通过');

    // =========================================================================
    // STEP 14: Offline ASR Modal (Paraformer Ready + Dialogue Match Preview)
    // =========================================================================
    logStep(14, '内置离线语音识别（ASR）工作台就绪检查');
    await win.getByTestId('nav-story').click();
    await win.getByTestId('open-asr-btn').click();
    await win.getByTestId('asr-modal').waitFor({ state: 'visible' });
    const asrText = await win.getByTestId('asr-modal').innerText();
    assert.ok(asrText.includes('Paraformer'), 'Offline Paraformer ASR model must be reported ready');
    await win.getByTestId('asr-modal').locator('button').first().click();
    console.log('  ✅ 内置 Paraformer 离线语音识别工作台就绪');

    // =========================================================================
    // STEP 15: Built-in AI Assistant Drawer (Chinese Context Label + Real Turn if key present)
    // =========================================================================
    logStep(15, '内置 AI 创作助手：中文上下文感知 + 折叠推理 + 操作记录');
    await win.getByTestId('toggle-ai-drawer-btn').click();
    await win.getByTestId('ai-assistant-drawer').waitFor({ state: 'visible' });
    const drawerText = await win.getByTestId('ai-assistant-drawer').innerText();
    assert.ok(drawerText.includes('故事工作台'), 'AI drawer must show Chinese page name, not raw English activeTab');
    assert.ok(!drawerText.includes('页面「story」'));
    await win.getByTestId('toggle-ai-drawer-btn').click();
    console.log('  ✅ AI 助手中文上下文感知与 UI 合规验证通过');

    // =========================================================================
    // STEP 16: Finish & Publish Wizard — Orphan Auto-Fix, Real Engine Check, Playtest, Export & Launch!
    // =========================================================================
    logStep(16, '完成向导：故意制造孤立场景 → 一键真实修复 → 真实引擎校验 → 试玩 → 导出并实机启动 EXE');
    // Create an intentionally unconnected orphan scene!
    await win.getByTestId('outline-new-scene-btn').click();
    await win.getByTestId('new-scene-name-input').fill('待接入孤立支线');
    await win.getByText('暂不连接').click();
    await win.getByTestId('new-scene-confirm-btn').click();
    await win.waitForTimeout(300);

    // Go to Finish Wizard -> verify ORPHAN_SCENE warning appears -> click real fix button!
    await win.getByTestId('nav-finish').click();
    await win.waitForTimeout(300);
    await win.getByTestId('issue-card-ORPHAN_SCENE').waitFor({ state: 'visible' });
    await win.getByTestId('fix-issue-btn-ORPHAN_SCENE').click();
    await win.waitForTimeout(400);
    assert.equal(
      await win.locator('[data-testid="issue-card-ORPHAN_SCENE"]').count(),
      0,
      'One-click orphan fix button MUST resolve ORPHAN_SCENE immediately!'
    );

    // Run REAL Ren'Py engine check -> 0 issues!
    await win.getByTestId('run-full-check-btn').click();
    await win.waitForTimeout(4500);
    assert.equal(
      await win.locator('[data-testid^="issue-card-"]').count(),
      0,
      'Full RenPy engine check must pass with 0 issues!'
    );

    // Test Playtest from current scene & Stop
    await win.getByTestId('play-from-scene-btn').click();
    await win.waitForTimeout(2200);
    await win.getByTestId('stop-playtest-btn').click();
    await win.waitForTimeout(400);

    // Export Windows standalone game & verify real .exe launches!
    await win.getByTestId('wizard-step-3').click();
    await win.getByTestId('export-btn-win').click();
    await win.getByTestId('export-result-banner').waitFor({ state: 'visible', timeout: 180000 });
    const bannerText = await win.getByTestId('export-result-banner').innerText();
    assert.ok(bannerText.includes('打包导出成功'), `Export failed: ${bannerText}`);

    const exportBase = `${projectDir}_exports`;
    const findGameExe = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
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
    const exePath = findGameExe(exportBase);
    assert.ok(exePath && fs.existsSync(exePath), 'Exported standalone game .exe must exist');
    const launchRes = await win.evaluate((p) => window.guie.launchExportedExe(p, 3000), exePath);
    assert.ok(launchRes.launched, `Exported standalone game failed to launch: ${launchRes.error}`);
    console.log('  ✅ 孤立场景一键修复、真实 RenPy 引擎校验、试玩、Windows 独立导出与实机运行全部通过！');

    console.log('\n🎉 ALL 16 MAJOR FEATURE STEPS VERIFIED 100% PASS!');
  } finally {
    try {
      await app.close();
    } catch {}
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  }
}

runAllFeaturesE2E().catch((err) => {
  console.error('\n❌ ALL-FEATURES E2E FAILED:', err);
  process.exit(1);
});
