import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createProject,
  enqueueProjectSave,
  flushProjectSaves,
  openProject,
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  saveProjectSync,
} from '../src/main/projectManager';
import { compileProjectToRenpy } from '../src/main/renpyCompiler';
import { runRenpyLint } from '../src/main/renpyRunner';
import { getOfflineAsrStatus, transcribePcm16k } from '../src/main/asrService';
import { saveToReuseLibrary, importFromReuseLibrary, deleteReuseItem } from '../src/main/reuseLibrary';
import { runAiAssistantTurn, getResolvedApiKey } from '../src/main/aiAgent';
import {
  analyzeProjectIssues,
  buildNarrativeFlowGraph,
  createId,
  APPEARANCE_PRESETS,
} from '../src/shared/defaults';
import { simulateStageAtBlock, resolveChoiceNavigation } from '../src/shared/previewEngine';

let tempRoot: string;

beforeAll(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'guie-test-'));
});

afterAll(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {}
});

describe('Phase 2 Core Backend Engine & Compiler', () => {
  it('guarantees readable high-contrast white dialogue text across all built-in appearance presets', () => {
    for (const [id, preset] of Object.entries(APPEARANCE_PRESETS)) {
      expect(preset.dialogueBox.textColor?.toUpperCase(), `Preset ${id} textColor`).toBe('#FFFFFF');
    }
  });

  it('creates a project with bundled CJK font, compiles rich multi-branch + all 6 extensions, and passes REAL RenPy lint', async () => {
    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: '测试物语：樱花与星空',
      author: '测试作者',
      withStarterContent: true,
    });

    // Verify bundled CJK font exists
    expect(fs.existsSync(path.join(projectDir, 'game', 'fonts', 'SourceHanSansLite.ttf'))).toBe(true);

    // Add 2 characters, variables, 3 branches, 1 merge, 2 endings, and enable all 6 extensions
    const chA = { id: createId('ch'), name: '林夏', color: '#FF5A3D', expressions: [] };
    const chB = { id: createId('ch'), name: '沈秋', color: '#2A7B50', expressions: [] };
    project.characters.push(chA, chB);

    const varAff = project.variables[0];
    const varKey = {
      id: createId('var'),
      name: '拿到天台钥匙',
      type: 'boolean' as const,
      initialValue: false,
      persistent: true,
    };
    project.variables.push(varKey);

    const startScene = project.scenes[0];
    const gardenScene = {
      id: createId('sc'),
      chapterId: project.chapters[0].id,
      name: '中庭花园',
      order: 1,
      disabled: false,
      nextSceneId: null as string | null,
      blocks: [
        { id: createId('blk'), type: 'dialogue' as const, speakerId: chA.id, text: '花园里的风真舒服呀，{玩家名字}！当前好感度：{状态:好感度}' },
      ],
    };
    const roofScene = {
      id: createId('sc'),
      chapterId: project.chapters[0].id,
      name: '秘密天台',
      order: 2,
      disabled: false,
      nextSceneId: null as string | null,
      blocks: [
        { id: createId('blk'), type: 'dialogue' as const, speakerId: chB.id, text: '只有拿到钥匙且好感度足够才能来到这里。', nvlMode: true },
        { id: createId('blk'), type: 'flow' as const, action: 'ending' as const, endingId: 'end_true', endingTitle: '真结局：星光约定', endingSubtitle: '你们在天台定下约定' },
      ],
    };
    const mergeScene = {
      id: createId('sc'),
      chapterId: project.chapters[0].id,
      name: '傍晚归途（汇合）',
      order: 3,
      disabled: false,
      nextSceneId: null as string | null,
      blocks: [
        { id: createId('blk'), type: 'dialogue' as const, speakerId: null, text: '无论刚才去了哪里，大家最终都在校门口汇合了。' },
        {
          id: createId('blk'),
          type: 'condition_branch' as const,
          condition: {
            logic: 'all' as const,
            rules: [{ id: createId('r2'), variableId: varAff.id, operator: '>=' as const, value: 3 }],
          },
          trueTargetType: 'scene' as const,
          trueTargetSceneId: roofScene.id,
          falseTargetType: 'continue' as const,
        },
        { id: createId('blk'), type: 'flow' as const, action: 'ending' as const, endingId: 'end_normal', endingTitle: '普通结局：明日再会', endingSubtitle: '平静而温暖的日常' },
      ],
    };
    gardenScene.nextSceneId = mergeScene.id;

    // Add state change + composite condition choice + camera fx + pause to startScene
    startScene.blocks.push(
      {
        id: createId('blk'),
        type: 'state_change',
        effects: [
          { id: createId('eff'), variableId: varAff.id, op: 'add', value: 2 },
          { id: createId('eff'), variableId: varKey.id, op: 'set', value: true },
        ],
      },
      {
        id: createId('blk'),
        type: 'camera_fx',
        panX: 12,
        panY: -8,
        zoom: 1.05,
        duration: 0.6,
        shake: 'light',
        blur: 0,
        dofFocus: 0.5,
        vignette: 0.2,
        lutPreset: 'warm',
        particles: 'petals',
        particleIntensity: 1,
      },
      {
        id: createId('blk'),
        type: 'choice',
        prompt: '放学后要去哪里呢？',
        options: [
          {
            id: createId('opt'),
            label: '去中庭花园',
            lockedBehavior: 'hide',
            effects: [{ id: createId('eff'), variableId: varAff.id, op: 'add', value: 1 }],
            targetType: 'scene',
            targetSceneId: gardenScene.id,
          },
          {
            id: createId('opt'),
            label: '去秘密天台',
            condition: {
              logic: 'all',
              rules: [
                { id: createId('r'), variableId: varAff.id, operator: '>=', value: 2 },
                { id: createId('r'), variableId: varKey.id, operator: 'is_true', value: true },
              ],
            },
            lockedBehavior: 'disable',
            disabledHint: '需要好感度≥2且拥有钥匙',
            effects: [],
            targetType: 'scene',
            targetSceneId: roofScene.id,
          },
          {
            id: createId('opt'),
            label: '直接回校门口',
            lockedBehavior: 'hide',
            effects: [],
            targetType: 'scene',
            targetSceneId: mergeScene.id,
          },
        ],
      }
    );

    project.scenes.push(gardenScene, roofScene, mergeScene);

    // Enable ALL 6 real playable extensions + localization
    project.extensions.galleryAndEndings.enabled = true;
    project.extensions.affectionSystem.enabled = true;
    project.extensions.affectionSystem.tracks = [
      { characterId: chA.id, variableId: varAff.id, maxVal: 10, label: '林夏好感度' },
    ];
    project.extensions.sixSlotSaveScreen.enabled = true;
    project.extensions.playerCustomName.enabled = true;
    project.extensions.autoSaveBeforeChoice.enabled = true;
    project.extensions.chapterTitleCard.enabled = true;
    project.localization.languages.push({
      code: 'en',
      name: 'English',
      imageOverrides: {},
      translations: { 'meta.title': 'Test Story: Sakura & Stars' },
    });

    // Verify Flowchart continuous segments, merge detection, and causal links
    const flow = buildNarrativeFlowGraph(project);
    expect(flow.nodes.length).toBeGreaterThanOrEqual(4);
    expect(flow.mergeNodeIds.size).toBe(2); // mergeScene & roofScene both have 2 incoming routes
    expect(flow.causalEdges.length).toBeGreaterThanOrEqual(1); // startScene writes varAff, read by mergeScene condition_branch

    // Verify Preview Engine & Choice navigation
    const choiceBlk = startScene.blocks[startScene.blocks.length - 1];
    const sim = simulateStageAtBlock(project, startScene.id, choiceBlk.id);
    expect(sim.stage.variables[varAff.id]).toBe(2);
    expect(sim.stage.activeChoice?.options[1].enabled).toBe(true);
    if (choiceBlk.type === 'choice') {
      const nav = resolveChoiceNavigation(project, startScene.id, choiceBlk.id, choiceBlk.options[0], sim.stage.variables);
      expect(nav.nextSceneId).toBe(gardenScene.id);
      expect(nav.nextVars[varAff.id]).toBe(3);
    }

    // Verify ZERO structural errors
    const issues = analyzeProjectIssues(project);
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);

    // Save & run REAL Ren'Py lint!
    saveProjectSync(projectDir, project);
    const compiled = compileProjectToRenpy(project);
    expect(compiled['game/gui.rpy']).toContain('SourceHanSansLite.ttf');
    expect(compiled['game/guie_extensions.rpy']).toContain('persistent.guie_unlocked_endings');

    const lint = await runRenpyLint(projectDir, project);
    expect(lint.ok, `Ren'Py Lint failed:\n${lint.rawOutput}`).toBe(true);
  }, 60000);

  it('prevents stale save overwrites and supports cross-restart snapshots & custom_*.rpy preservation', async () => {
    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: '保存安全测试',
    });

    // Place a custom_*.rpy file and ensure GUI compiler NEVER deletes or overwrites it
    const customFile = path.join(projectDir, 'game', 'custom_phone.rpy');
    fs.writeFileSync(customFile, 'define guie_custom_marker = "kept"\n', 'utf8');

    // Rapid queued saves: rev 1 (old text) followed immediately by rev 2 (new text)
    const p1 = structuredClone(project);
    if (p1.scenes[0].blocks[0].type === 'dialogue') p1.scenes[0].blocks[0].text = '旧草稿内容';
    const p2 = structuredClone(project);
    if (p2.scenes[0].blocks[0].type === 'dialogue') p2.scenes[0].blocks[0].text = '最新定稿内容';

    const s1 = enqueueProjectSave(projectDir, p1, 1);
    const s2 = enqueueProjectSave(projectDir, p2, 2);
    await Promise.all([s1, s2]);
    await flushProjectSaves(projectDir);

    const reopened = openProject(projectDir);
    expect(reopened.project.scenes[0].blocks[0].type === 'dialogue' && reopened.project.scenes[0].blocks[0].text).toBe('最新定稿内容');
    expect(fs.readFileSync(customFile, 'utf8')).toContain('kept');

    // Snapshot & restore test
    const snap = createSnapshot(projectDir, reopened.project, '重要里程碑', 'manual');
    const list = listSnapshots(projectDir);
    expect(list.some((s) => s.id === snap.id)).toBe(true);

    const mutated = structuredClone(reopened.project);
    if (mutated.scenes[0].blocks[0].type === 'dialogue') mutated.scenes[0].blocks[0].text = '误删后的内容';
    saveProjectSync(projectDir, mutated);

    const restored = restoreSnapshot(projectDir, snap.id, mutated);
    expect(restored.scenes[0].blocks[0].type === 'dialogue' && restored.scenes[0].blocks[0].text).toBe('最新定稿内容');
  });

  it('supports Cross-Project Reuse Library with automatic broken-asset cleanup', () => {
    const { project: srcProj } = createProject({ parentDir: tempRoot, title: '源项目' });
    const { project: dstProj } = createProject({ parentDir: tempRoot, title: '目标项目' });

    const charId = createId('ch');
    srcProj.characters.push({
      id: charId,
      name: '复用角色小青',
      color: '#2A7B50',
      avatarAssetId: 'missing_asset_only_in_src',
      expressions: [],
    });

    const savedItem = saveToReuseLibrary({
      kind: 'character',
      name: '小青模板',
      project: srcProj,
      sourceId: charId,
    });

    try {
      const imported = importFromReuseLibrary({ itemId: savedItem.id, project: dstProj });
      expect(imported.cleanedAssetRefs).toBe(1);
      expect(imported.updatedProject.characters.some((c) => c.name === '复用角色小青')).toBe(true);
      const importedChar = imported.updatedProject.characters.find((c) => c.name === '复用角色小青');
      expect(importedChar?.avatarAssetId).toBeUndefined();
    } finally {
      deleteReuseItem(savedItem.id);
    }
  });

  it('loads and executes built-in 100% offline Paraformer ASR model cleanly', () => {
    const status = getOfflineAsrStatus();
    expect(status.available).toBe(true);
    // Run a 1-second silent/tone PCM buffer through the real ONNX model to confirm zero runtime crash
    const samples = new Float32Array(16000);
    const text = transcribePcm16k(samples, 16000);
    expect(typeof text).toBe('string');
  });

  it('runs a REAL end-to-end DeepSeek AI Assistant edit & RenPy Lint verification when API key is present', async () => {
    const apiKey = getResolvedApiKey();
    if (!apiKey) {
      console.warn('Skipping live DeepSeek API test (no API key configured)');
      return;
    }

    const { projectDir, project } = createProject({
      parentDir: tempRoot,
      title: 'AI实测物语',
    });

    const turn = await runAiAssistantTurn({
      projectDir,
      project,
      userPrompt: '请在当前开场场景中，创建角色“林悠”并续写 3 句关于放学后在图书馆偶遇的对白。',
      history: [],
      context: {
        activeTab: 'story',
        activeSceneId: project.scenes[0].id,
        activeSceneName: project.scenes[0].name,
      },
    });

    expect(turn.projectMutated).toBe(true);
    expect(turn.operations.length).toBeGreaterThanOrEqual(1);
    expect(turn.updatedProject.scenes[0].blocks.length).toBeGreaterThanOrEqual(4);

    // Verify disk file was updated and passes REAL Ren'Py Lint!
    const lint = await runRenpyLint(projectDir, turn.updatedProject);
    expect(lint.ok, `AI-edited project failed Ren'Py Lint:\n${lint.rawOutput}`).toBe(true);
  }, 90000);
});
