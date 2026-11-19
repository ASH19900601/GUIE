import React, { useRef, useState } from 'react';
import { Mic, Square, Upload, Check, Trash2, X, Loader2, Volume2, Link2, PlusCircle } from 'lucide-react';
import type { AsrTranscriptItem, DialogueBlock } from '@shared/types';
import { createId } from '@shared/defaults';
import { useAppStore } from '../../store/useAppStore';

interface ExtendedAsrRow extends AsrTranscriptItem {
  pcm16k?: number[];
  audioUrl?: string;
  savedAssetId?: string;
}

/**
 * Resamples any decoded AudioBuffer into 16kHz mono Float32Array via OfflineAudioContext
 * (zero external ffmpeg CLI needed!).
 */
async function decodeAudioFileTo16kMono(file: File): Promise<{ samples: number[]; durationSec: number }> {
  const arrBuf = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const decoded = await audioCtx.decodeAudioData(arrBuf);
    const targetRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, frameCount, targetRate);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const channelData = rendered.getChannelData(0);
    return {
      samples: Array.from(channelData),
      durationSec: Number(decoded.duration.toFixed(2)),
    };
  } finally {
    await audioCtx.close();
  }
}

export const AsrWorkbenchModal: React.FC = () => {
  const {
    asrModalOpen,
    setAsrModalOpen,
    project,
    projectDir,
    activeSceneId,
    runtimeInfo,
    mutateProject,
    pushToast,
  } = useAppStore();

  const [rows, setRows] = useState<ExtendedAsrRow[]>([]);
  const [recording, setRecording] = useState(false);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!asrModalOpen || !project || !projectDir) return null;

  const currentScene = project.scenes.find((s) => s.id === activeSceneId) ?? project.scenes[0];
  const existingDialogues = currentScene
    ? currentScene.blocks.filter((b): b is DialogueBlock => b.type === 'dialogue')
    : [];

  const transcribeRow = async (rowId: string, file: File) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, status: 'transcribing', error: undefined } : r))
    );
    try {
      const { samples, durationSec } = await decodeAudioFileTo16kMono(file);
      const res = await window.guie.transcribePcm({
        samples,
        sampleRate: 16000,
        projectDir,
        saveFileName: file.name,
      });
      if (res.savedAsset) {
        mutateProject((draft) => {
          if (!draft.assets.some((a) => a.id === res.savedAsset!.id)) {
            draft.assets.push(res.savedAsset!);
          }
        });
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                text: res.text || '（未识别出清晰语音，请手动补充文字）',
                durationSec,
                status: 'done',
                savedAssetId: res.savedAsset?.id,
              }
            : r
        )
      );
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                status: 'error',
                error: err instanceof Error ? err.message : '音频解码或识别失败',
              }
            : r
        )
      );
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const newRows: ExtendedAsrRow[] = list.map((f) => ({
      id: createId('asr'),
      fileName: f.name,
      text: '',
      speakerId: project.characters[0]?.id ?? null,
      durationSec: 0,
      status: 'pending',
      audioUrl: URL.createObjectURL(f),
    }));
    setRows((prev) => [...prev, ...newRows]);
    for (let i = 0; i < list.length; i += 1) {
      await transcribeRow(newRows[i].id, list[i]);
    }
  };

  const handleToggleRecording = async () => {
    if (recording) {
      mediaRecRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const fileName = `现场录音_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}.webm`;
        const file = new File([blob], fileName, { type: blob.type });
        const rowId = createId('asr');
        setRows((prev) => [
          ...prev,
          {
            id: rowId,
            fileName,
            text: '',
            speakerId: project.characters[0]?.id ?? null,
            durationSec: 0,
            status: 'pending',
            audioUrl: URL.createObjectURL(blob),
          },
        ]);
        await transcribeRow(rowId, file);
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      pushToast('error', '无法访问麦克风，请检查系统录音权限或改用批量导入音频文件。');
    }
  };

  const handleMatchExistingDialogues = () => {
    if (!currentScene) return;
    const readyRows = rows.filter((r) => r.status === 'done');
    if (readyRows.length === 0) return;

    let matchedCount = 0;
    mutateProject(
      (draft) => {
        const sc = draft.scenes.find((s) => s.id === currentScene.id);
        if (!sc) return;
        const dlgBlocks = sc.blocks.filter((b): b is DialogueBlock => b.type === 'dialogue');
        for (let i = 0; i < Math.min(readyRows.length, dlgBlocks.length); i += 1) {
          const row = readyRows[i];
          if (row.savedAssetId) dlgBlocks[i].voiceAssetId = row.savedAssetId;
          if (row.speakerId !== undefined && !dlgBlocks[i].speakerId) {
            dlgBlocks[i].speakerId = row.speakerId;
          }
          matchedCount += 1;
        }
      },
      { immediateSave: true }
    );
    pushToast('success', `已按顺序为「${currentScene.name}」的 ${matchedCount} 句现有对白绑定配音！`);
    setAsrModalOpen(false);
  };

  const handleCreateNewDialogues = () => {
    if (!currentScene) return;
    const readyRows = rows.filter((r) => r.status === 'done');
    if (readyRows.length === 0) return;

    mutateProject(
      (draft) => {
        const sc = draft.scenes.find((s) => s.id === currentScene.id);
        if (!sc) return;
        for (const row of readyRows) {
          sc.blocks.push({
            id: createId('blk'),
            type: 'dialogue',
            speakerId: row.speakerId,
            text: row.text,
            voiceAssetId: row.savedAssetId,
          });
        }
      },
      { immediateSave: true }
    );
    pushToast('success', `已在「${currentScene.name}」批量生成 ${readyRows.length} 句带配音的对白卡片！`);
    setAsrModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
      <div
        data-testid="asr-modal"
        className="bg-[#FBFAF5] border border-[#D7D1C6] rounded-lg shadow-2xl w-full max-w-[780px] max-h-[86vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-[#E7E2D8] bg-white flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-[15px] text-[#171513] flex items-center gap-2">
              <Mic size={16} className="text-[#FF5A3D]" />
              离线语音识别转剧本 & 批量语音匹配
            </h2>
            <p className="text-[12px] text-[#706A60] mt-0.5">
              {runtimeInfo?.asrReady
                ? `内置 ${runtimeInfo.asrModelType || '离线模型'} 已就绪，100% 本地运行，无需联网或安装外部工具。`
                : '离线语音模型加载中'}
            </p>
          </div>
          <button
            onClick={() => setAsrModalOpen(false)}
            className="p-1.5 rounded hover:bg-[#EFECE3] text-[#706A60] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Input Controls */}
        <div className="px-5 py-3 border-b border-[#E7E2D8] bg-[#FBFAF5] flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => void handleToggleRecording()}
            className={`px-3.5 py-2 rounded-md text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer border ${
              recording
                ? 'bg-[#C93B2B] text-white border-[#C93B2B]'
                : 'bg-[#FF5A3D] text-white border-[#FF5A3D] hover:bg-[#E5482C]'
            }`}
          >
            {recording ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
            {recording ? '停止录音并离线识别' : '麦克风直接录音'}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".wav,.mp3,.ogg,.flac,.m4a,.webm"
            className="hidden"
            onChange={(e) => void handleFilesSelected(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="paper-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5"
          >
            <Upload size={14} />
            批量选择多条配音文件
          </button>

          <span className="text-[11.5px] text-[#706A60] ml-auto">
            目标场景：<strong className="text-[#171513]">{currentScene?.name}</strong>
          </span>
        </div>

        {/* Transcription Review Table */}
        <div className="flex-1 overflow-y-auto paper-scroll p-4 flex flex-col gap-2.5">
          {rows.length === 0 ? (
            <div className="py-14 text-center text-[#706A60] text-[13px]">
              点击上方「麦克风直接录音」或「批量选择多条配音文件」，
              <br />
              即可自动完成离线语音转文字，逐条校对后一键绑定或批量生成对白。
            </div>
          ) : (
            rows.map((row, idx) => (
              <div
                key={row.id}
                className="paper-card p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#EFECE3] text-[#706A60]">
                      #{idx + 1}
                    </span>
                    <span className="text-[12.5px] font-medium text-[#171513] truncate">
                      {row.fileName}
                    </span>
                    {row.durationSec > 0 && (
                      <span className="text-[11px] text-[#948D82]">{row.durationSec}s</span>
                    )}
                    {row.status === 'transcribing' && (
                      <span className="text-[11.5px] text-[#B86E00] inline-flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> 离线识别中…
                      </span>
                    )}
                    {row.status === 'done' && (
                      <span className="text-[11.5px] text-[#2A7B50] inline-flex items-center gap-1">
                        <Check size={12} /> 识别完成
                      </span>
                    )}
                    {row.status === 'error' && (
                      <span className="text-[11.5px] text-[#C93B2B]">{row.error}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {row.audioUrl && (
                      <button
                        type="button"
                        onClick={() => new Audio(row.audioUrl).play()}
                        className="paper-btn-secondary px-2 py-0.5 text-[11.5px] inline-flex items-center gap-1"
                      >
                        <Volume2 size={12} /> 试听
                      </button>
                    )}
                    <select
                      value={row.speakerId ?? ''}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, speakerId: e.target.value || null } : r
                          )
                        )
                      }
                      className="paper-input py-0.5 px-2 text-[12px]"
                    >
                      <option value="">旁白</option>
                      {project.characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                      className="p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={row.text}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, text: e.target.value } : r))
                    )
                  }
                  placeholder="识别结果可在此直接校对修改…"
                  className="paper-input w-full text-[13px]"
                />
                {existingDialogues[idx] && (
                  <div className="text-[11px] text-[#706A60] bg-[#FBFAF5] px-2.5 py-1 rounded border border-[#EFECE3] truncate">
                    顺序匹配预览 → 对白 #{idx + 1}：「{existingDialogues[idx].text || '（空对白）'}」
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Apply Footer */}
        <div className="px-5 py-3.5 border-t border-[#E7E2D8] bg-white flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[12px] text-[#706A60]">
            已完成 {rows.filter((r) => r.status === 'done').length} / {rows.length} 条音频转写
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={rows.filter((r) => r.status === 'done').length === 0}
              onClick={handleMatchExistingDialogues}
              className="paper-btn-secondary px-3.5 py-2 text-[12.5px] inline-flex items-center gap-1.5"
            >
              <Link2 size={14} />
              按顺序匹配到现有对白
            </button>
            <button
              type="button"
              disabled={rows.filter((r) => r.status === 'done').length === 0}
              onClick={handleCreateNewDialogues}
              className="paper-btn-primary px-4 py-2 text-[12.5px] inline-flex items-center gap-1.5"
            >
              <PlusCircle size={14} />
              批量生成新对白并绑定语音
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
