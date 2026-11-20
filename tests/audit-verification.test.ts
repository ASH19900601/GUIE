import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProject,
  createSnapshot,
  importAssetFiles,
  previewSnapshot,
  saveProjectSync,
} from '../src/main/projectManager';
import { compileDialogueText, compileProjectToRenpy } from '../src/main/renpyCompiler';
import { runRenpyLint } from '../src/main/renpyRunner';
import { createId, replaceAssetReferences } from '../src/shared/defaults';
import { advancePreviewStep, simulateSceneTimeline } from '../src/shared/previewEngine';
// @ts-expect-error mjs fixture helper without .d.ts
import { createTestFixtures } from '../scripts/fixture-assets.mjs';

let tempRoot: string;
let fixtures: ReturnType<typeof createTestFixtures>;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-audit-test-'));
  fixtures = createTestFixtures(path.join(tempRoot, 'fixtures'));
});

afterAll(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
});

describe('Deep Audit Verification: Compiler, Multilingual FontGroup, All 6 Extensions, All 13 Block Types, Timeline & Snapshots', () => {
  it('safely escapes stray brackets/braces while preserving rich-text tags and state/player interpolations', () => {
    const { project } = createProject({ parentDir: tempRoot, title: '转义安全测试' });
    const compiled = compileDialogueText(
      '你好 {玩家名字}，当前好感：{状态:好感度}！[微笑] {哈哈} {b}加粗{/b} {color=#FF5A3D}高亮{/color} {cps=15}慢速{/cps}',
      project
    );
    expect(compiled).toContain('[guie_player_name]');
    expect(compiled).toContain('[guie_v_');
    expect(compiled).toContain('[[微笑]');
    expect(compiled).toContain('{{哈哈}');
    expect(compiled).toContain('{b}加粗{/b}');
    expect(compiled).toContain('{color=#FF5A3D}高亮{/color}');
    expect(compiled).toContain('{cps=15}慢速{/cps}');
  });

  it('compiles CJK+LatinExt+Cyrillic FontGroup, all 6 extensions, all 13 block types, and multilingual translations cleanly through REAL RenPy Lint', async () => {
    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: '全量功能真机编译校验',
      author: '审计验证',
    });

    // Import real fixture assets
    const bgAssets = importAssetFiles(projectDir, [fixtures.bgClassroom, fixtures.bgRooftop], 'background');
    const spAssets = importAssetFiles(projectDir, [fixtures.spLinSmile, fixtures.spLinSurprised], 'sprite');
    const bgmAssets = importAssetFiles(projectDir, [fixtures.bgmEvening], 'bgm');
    const seAssets = importAssetFiles(projectDir, [fixtures.voiceLine1], 'se');
    const voiceAssets = importAssetFiles(projectDir, [fixtures.voiceLine1], 'voice');
    const uiAssets = importAssetFiles(projectDir, [fixtures.bgGarden], 'ui');
    bgAssets[1].isCg = true;
    bgAssets[1].cgTitle = '天台星夜 CG';
    project.assets.push(...bgAssets, ...spAssets, ...bgmAssets, ...seAssets, ...voiceAssets, ...uiAssets);

    const charId = createId('ch');
    project.characters.push({
      id: charId,
      name: '林夏',
      color: '#FF5A3D',
      avatarAssetId: spAssets[0].id,
      dialogueBoxBgAssetId: uiAssets[0].id,
      expressions: [
        { id: 'exp_1', name: '微笑', assetId: spAssets[0].id, order: 0 },
        { id: 'exp_2', name: '惊讶', assetId: spAssets[1].id, order: 1 },
      ],
    });

    const affVar = project.variables[0];
    affVar.persistent = true;
    const keyVarId = createId('var');
    const titleVarId = createId('var');
    project.variables.push(
      { id: keyVarId, name: '天台钥匙', type: 'boolean', initialValue: false, persistent: false },
      { id: titleVarId, name: '称号', type: 'string', initialValue: '新生', persistent: false }
    );

    // Enable ALL 6 real extensions with customized options
    project.extensions.galleryAndEndings = {
      enabled: true,
      enableCgGallery: true,
      enableSceneReplay: true,
      enableEndingBook: true,
    };
    project.extensions.affectionSystem = {
      enabled: true,
      tracks: [{ characterId: charId, variableId: affVar.id, maxVal: 10, label: '林夏好感度' }],
    };
    project.extensions.sixSlotSaveScreen.enabled = true;
    project.extensions.playerCustomName = {
      enabled: true,
      defaultName: '旅人',
      promptAtStart: true,
      promptText: '请输入主角姓名',
    };
    project.extensions.autoSaveBeforeChoice.enabled = true;
    project.extensions.chapterTitleCard = {
      enabled: true,
      duration: 1.8,
      style: 'cinematic',
    };

    // Add 2nd scene (callable reusable common scene) and 3rd scene (branch target)
    const commonSceneId = createId('sc');
    const branchSceneId = createId('sc');
    project.scenes.push(
      {
        id: commonSceneId,
        chapterId: project.chapters[0].id,
        name: '公共插曲',
        order: 1,
        disabled: false,
        nextSceneId: null,
        blocks: [
          { id: createId('blk'), type: 'dialogue', speakerId: charId, text: '这是一段可复用公共剧情。' },
          { id: createId('blk'), type: 'flow', action: 'return_from_call' },
        ],
      },
      {
        id: branchSceneId,
        chapterId: project.chapters[0].id,
        name: '天台结局场景',
        order: 2,
        disabled: false,
        nextSceneId: null,
        blocks: [
          {
            id: createId('blk'),
            type: 'cg_unlock',
            cgId: 'cg_starlight',
            title: '星光约定',
            assetId: bgAssets[1].id,
            showFullscreen: true,
            transition: 'blinds',
          },
          {
            id: createId('blk'),
            type: 'flow',
            action: 'ending',
            endingId: 'end_star',
            endingTitle: '真结局：星光',
            endingSubtitle: 'Café · Привет · こんにちは · 안녕하세요',
            cgAssetId: bgAssets[1].id,
          },
        ],
      }
    );

    // Populate start scene with ALL block types (dialogue, nvl, rich text, multilingual, background blinds, multilayer, sprite keyframes, camera_fx vignette+particles+lut, audio, state_change, condition_branch, choice with disabled hint, flow call/pause/wait_click, player_name_input)
    project.scenes[0].blocks = [
      {
        id: createId('blk'),
        type: 'background',
        assetId: bgAssets[0].id,
        transition: 'blinds',
        transitionDuration: 0.8,
      },
      {
        id: createId('blk'),
        type: 'multilayer_stage',
        layers: [
          {
            id: 'ly_1',
            name: '远景',
            group: 'background',
            assetId: bgAssets[0].id,
            offsetX: 0,
            offsetY: 0,
            parallaxDepth: 0.4,
            scale: 1,
            alpha: 1,
            visible: true,
            zIndex: 1,
          },
        ],
        transition: 'dissolve',
        transitionDuration: 0.5,
      },
      {
        id: createId('blk'),
        type: 'sprite',
        action: 'show',
        characterId: charId,
        expression: '微笑',
        slot: 'center',
        scale: 1,
        rotation: 0,
        alpha: 1,
        zOrder: 10,
        transition: 'irisout',
        transitionDuration: 0.5,
        keyframes: [
          { id: 'kf_1', timeSec: 0.4, x: 0.5, y: 1, scale: 1.05, rotation: 2, alpha: 1, easing: 'ease' },
        ],
      },
      {
        id: createId('blk'),
        type: 'camera_fx',
        panX: 15,
        panY: -10,
        zoom: 1.1,
        duration: 0.6,
        shake: 'light',
        blur: 1.5,
        dofFocus: 0.5,
        vignette: 0.4,
        lutPreset: 'sunset',
        particles: 'petals',
        particleIntensity: 1.2,
      },
      {
        id: createId('blk'),
        type: 'audio',
        channel: 'bgm',
        action: 'play',
        assetId: bgmAssets[0].id,
        loop: true,
        volume: 0.75,
        fadeIn: 0.5,
      },
      {
        id: createId('blk'),
        type: 'audio',
        channel: 'se',
        action: 'play',
        assetId: seAssets[0].id,
        loop: false,
        volume: 0.9,
      },
      {
        id: createId('blk'),
        type: 'dialogue',
        speakerId: charId,
        text: '你好 {玩家名字}！中文 / こんにちは / 안녕하세요 / Café / Привет [微笑] {b}测试{/b}',
        voiceAssetId: voiceAssets[0].id,
        voiceVolume: 0.85,
      },
      {
        id: createId('blk'),
        type: 'dialogue',
        speakerId: null,
        nvlMode: true,
        text: '全屏独白测试，好感度当前为 {状态:好感度}。',
      },
      {
        id: createId('blk'),
        type: 'player_name_input',
        prompt: '请再次确认你的称呼',
        defaultName: '旅人',
      },
      {
        id: createId('blk'),
        type: 'state_change',
        effects: [
          { id: 'e1', variableId: affVar.id, op: 'add', value: 3 },
          { id: 'e2', variableId: keyVarId, op: 'set', value: true },
          { id: 'e3', variableId: titleVarId, op: 'set', value: '星光观测者' },
        ],
      },
      {
        id: createId('blk'),
        type: 'flow',
        action: 'call_scene',
        targetSceneId: commonSceneId,
      },
      {
        id: createId('blk'),
        type: 'flow',
        action: 'pause',
        pauseSeconds: 0.5,
      },
      {
        id: createId('blk'),
        type: 'flow',
        action: 'wait_click',
      },
      {
        id: createId('blk'),
        type: 'condition_branch',
        condition: {
          logic: 'all',
          rules: [
            { id: 'r1', variableId: affVar.id, operator: '>=', value: 2 },
            { id: 'r2', variableId: keyVarId, operator: 'is_true', value: true },
          ],
        },
        trueTargetType: 'call_scene',
        trueTargetSceneId: commonSceneId,
        falseTargetType: 'continue',
      },
      {
        id: createId('blk'),
        type: 'choice',
        speakerId: charId,
        prompt: '要去天台看星星吗？',
        options: [
          {
            id: 'opt_go',
            label: '去天台',
            condition: {
              logic: 'all',
              rules: [{ id: 'rc1', variableId: affVar.id, operator: '>=', value: 2 }],
            },
            lockedBehavior: 'disable',
            disabledHint: '需要好感度达到 2',
            effects: [{ id: 'ef1', variableId: affVar.id, op: 'add', value: 2 }],
            targetType: 'scene',
            targetSceneId: branchSceneId,
          },
          {
            id: 'opt_stay',
            label: '留在这里',
            lockedBehavior: 'hide',
            effects: [],
            targetType: 'ending',
            endingId: 'end_stay',
            endingTitle: '平静日常',
            endingSubtitle: '明天再见',
          },
        ],
      },
    ];

    // Add multilingual localization with image override
    project.localization.languages.push({
      code: 'en',
      name: 'English',
      fontAssetId: null,
      imageOverrides: { [bgAssets[0].id]: bgAssets[1].id },
      translations: {
        'meta.title': 'Full Feature Verification',
      },
    });

    // Verify compiled files contain ALL critical fixes
    const compiled = compileProjectToRenpy(project);
    expect(compiled['game/gui.rpy']).toContain('FontGroup()');
    expect(compiled['game/gui.rpy']).toContain('DejaVuSans.ttf');
    expect(compiled['game/gui.rpy']).toContain('fonts/SourceHanSansLite.ttf');
    expect(compiled['game/guie_definitions.rpy']).toContain('window_background=Frame(');
    expect(compiled['game/guie_definitions.rpy']).toContain('config.replace_text');
    expect(compiled['game/guie_extensions.rpy']).toContain('substitute False');
    expect(compiled['game/guie_extensions.rpy']).toContain('viewing_cg');
    expect(compiled['game/screens.rpy']).toContain('i.kwargs.get("sensitive", True)');
    expect(compiled['game/script.rpy']).toContain('with blinds');
    expect(compiled['game/script.rpy']).toContain('show guie_vignette_overlay');

    // Verify sixSlotSaveScreen=false actually produces different layout from enabled=true
    project.extensions.sixSlotSaveScreen.enabled = false;
    const compiledCompactSave = compileProjectToRenpy(project);
    expect(compiledCompactSave['game/gui.rpy']).toContain('define gui.file_slot_cols = 2');
    project.extensions.sixSlotSaveScreen.enabled = true;

    saveProjectSync(projectDir, project);
    const lintRes = await runRenpyLint(projectDir, project);
    expect(lintRes.ok, `Real Ren'Py Lint FAILED:\n${lintRes.rawOutput}`).toBe(true);
  }, 60000);

  it('supports bidirectional timeline scrubbing (forward & backward) and step-through of condition_branch + call_scene/return_from_call', () => {
    const { project } = createProject({ parentDir: tempRoot, title: '时间轴步进测试' });
    const affVar = project.variables[0];
    const commonId = createId('sc');
    const trueBranchId = createId('sc');
    const chId = createId('ch');

    project.characters.push({
      id: chId,
      name: '林夏',
      color: '#FF5A3D',
      dialogueBoxBgAssetId: 'ast_custom_box',
      expressions: [],
    });

    project.scenes.push(
      {
        id: commonId,
        chapterId: project.chapters[0].id,
        name: '公共回忆',
        order: 1,
        disabled: false,
        nextSceneId: null,
        blocks: [
          { id: 'c_b1', type: 'dialogue', speakerId: chId, text: '公共回忆第一句' },
          { id: 'c_b2', type: 'flow', action: 'return_from_call' },
        ],
      },
      {
        id: trueBranchId,
        chapterId: project.chapters[0].id,
        name: '高好感分支',
        order: 2,
        disabled: false,
        nextSceneId: null,
        blocks: [{ id: 't_b1', type: 'dialogue', speakerId: chId, text: '进入高好感分支！' }],
      }
    );

    project.scenes[0].blocks = [
      { id: 'b1', type: 'dialogue', speakerId: chId, text: '第一句' },
      { id: 'b2', type: 'dialogue', speakerId: null, text: '第二句' },
      { id: 'b3', type: 'flow', action: 'call_scene', targetSceneId: commonId },
      {
        id: 'b4',
        type: 'condition_branch',
        condition: {
          logic: 'all',
          rules: [{ id: 'r1', variableId: affVar.id, operator: '>=', value: 5 }],
        },
        trueTargetType: 'scene',
        trueTargetSceneId: trueBranchId,
        falseTargetType: 'continue',
      },
      { id: 'b5', type: 'dialogue', speakerId: null, text: '条件未满足时的后续' },
    ];

    // Clicking b1 must still build forward steps up to the call_scene (b3), so user can scrub forward AND backward!
    const sim = simulateSceneTimeline(project, project.scenes[0].id, 'b1', { [affVar.id]: 6 });
    expect(sim.targetStepIndex).toBe(0);
    expect(sim.steps.length).toBe(3); // b1, b2, b3 (call_scene)
    expect(sim.stage.speakerDialogueBoxBgAssetId).toBe('ast_custom_box');

    // Advance from b3 (call_scene) -> enters commonId with callStack depth 2!
    const stepIntoCall = advancePreviewStep(project, sim.steps[2], sim.steps[2].stageSnapshot, []);
    expect(stepIntoCall.nextStep?.sceneId).toBe(commonId);
    expect(stepIntoCall.nextStep?.callStack).toEqual(['开场场景', '公共回忆']);
    expect(stepIntoCall.nextReturnStack.length).toBe(1);

    // Advance c_b1 -> c_b2 (return_from_call) -> returns to caller scene at b4 (condition_branch)!
    const stepToRet = advancePreviewStep(
      project,
      stepIntoCall.nextStep!,
      stepIntoCall.nextStep!.stageSnapshot,
      stepIntoCall.nextReturnStack
    );
    expect(stepToRet.nextStep?.blockId).toBe('c_b2');

    const stepBack = advancePreviewStep(
      project,
      stepToRet.nextStep!,
      stepToRet.nextStep!.stageSnapshot,
      stepToRet.nextReturnStack
    );
    expect(stepBack.nextStep?.sceneId).toBe(project.scenes[0].id);
    expect(stepBack.nextStep?.blockId).toBe('b4');
    expect(stepBack.nextStep?.callStack).toEqual(['开场场景']);

    // Advance b4 (condition_branch) with affVar=6 (>=5) -> jumps to trueBranchId!
    const stepCond = advancePreviewStep(
      project,
      stepBack.nextStep!,
      stepBack.nextStep!.stageSnapshot,
      stepBack.nextReturnStack
    );
    expect(stepCond.nextStep?.sceneId).toBe(trueBranchId);
    expect(stepCond.nextStep?.blockId).toBe('t_b1');
  });

  it('previews historical snapshots cleanly and replaces asset references across localization too', () => {
    const { projectDir, project } = createProject({ parentDir: tempRoot, title: '快照预览与素材替换测试' });
    const oldId = 'ast_old_1';
    const newId = 'ast_new_2';
    project.localization.languages.push({
      code: 'ja',
      name: '日本語',
      fontAssetId: oldId,
      imageOverrides: { [oldId]: oldId },
      translations: {},
    });
    const replaced = replaceAssetReferences(project, oldId, newId);
    expect(replaced.localization.languages[0].fontAssetId).toBe(newId);
    expect(replaced.localization.languages[0].imageOverrides[newId]).toBe(newId);
    expect(replaced.localization.languages[0].imageOverrides[oldId]).toBeUndefined();

    const snap = createSnapshot(projectDir, replaced, '审计里程碑', 'manual');
    const preview = previewSnapshot(projectDir, snap.id);
    expect(preview.title).toBe('快照预览与素材替换测试');
    expect(preview.scenes.length).toBeGreaterThanOrEqual(1);
    expect(preview.scenes[0].sampleLine).toBeTruthy();
  });
});
