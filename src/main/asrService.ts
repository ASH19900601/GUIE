/**
 * Built-in 100% Offline Speech Recognition (ASR) Service
 * Powered by `sherpa-onnx-node` + bundled Paraformer-zh-small / Whisper ONNX model.
 * Zero external CLI dependencies — renderer decodes any audio format or mic stream via Web Audio API
 * into 16kHz mono Float32 PCM (or WAV) and passes it directly to this service!
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveRuntimePaths } from './runtimePaths';

interface SherpaRecognizerInstance {
  createStream: () => {
    acceptWaveform: (input: { sampleRate: number; samples: Float32Array }) => void;
  };
  decode: (stream: unknown) => void;
  getResult: (stream: unknown) => { text: string };
}

let cachedRecognizer: SherpaRecognizerInstance | null = null;
let cachedModelDir: string | null = null;

export interface AsrStatus {
  available: boolean;
  modelType?: string;
  message: string;
}

export function getOfflineAsrStatus(): AsrStatus {
  const { asrModelDir } = resolveRuntimePaths();
  if (!asrModelDir) {
    return {
      available: false,
      message: '内置离线语音模型尚未就绪。',
    };
  }
  const hasParaformer =
    fs.existsSync(path.join(asrModelDir, 'model.int8.onnx')) ||
    fs.existsSync(path.join(asrModelDir, 'model.onnx'));
  const hasWhisper =
    fs.existsSync(path.join(asrModelDir, 'encoder.int8.onnx')) ||
    fs.existsSync(path.join(asrModelDir, 'tiny-encoder.int8.onnx'));

  if (!hasParaformer && !hasWhisper) {
    return { available: false, message: '语音识别模型文件不完整。' };
  }
  return {
    available: true,
    modelType: hasParaformer ? 'Paraformer 中英双语离线模型' : 'Whisper 多语言离线模型',
    message: '离线语音识别已就绪（完全在本地运行，无需联网）',
  };
}

function getOrCreateRecognizer(): SherpaRecognizerInstance {
  const { asrModelDir } = resolveRuntimePaths();
  if (!asrModelDir) {
    throw new Error('内置离线语音识别模型未找到。');
  }
  if (cachedRecognizer && cachedModelDir === asrModelDir) {
    return cachedRecognizer;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx-node');
  const tokensPath = path.join(asrModelDir, 'tokens.txt');

  const paraformerInt8 = path.join(asrModelDir, 'model.int8.onnx');
  const paraformerFp32 = path.join(asrModelDir, 'model.onnx');

  let modelConfig: Record<string, unknown>;
  if (fs.existsSync(paraformerInt8) || fs.existsSync(paraformerFp32)) {
    modelConfig = {
      paraformer: {
        model: fs.existsSync(paraformerInt8) ? paraformerInt8 : paraformerFp32,
      },
      tokens: tokensPath,
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    };
  } else {
    const files = fs.readdirSync(asrModelDir);
    const enc = files.find((f) => f.includes('encoder') && f.endsWith('.onnx'));
    const dec = files.find((f) => f.includes('decoder') && f.endsWith('.onnx'));
    const tok = files.find((f) => f.includes('tokens') && f.endsWith('.txt')) || 'tokens.txt';
    if (!enc || !dec) {
      throw new Error('离线语音模型文件不完整。');
    }
    modelConfig = {
      whisper: {
        encoder: path.join(asrModelDir, enc),
        decoder: path.join(asrModelDir, dec),
        language: 'zh',
        task: 'transcribe',
      },
      tokens: path.join(asrModelDir, tok),
      numThreads: 2,
      provider: 'cpu',
      debug: 0,
    };
  }

  const recognizer = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig,
  }) as SherpaRecognizerInstance;

  cachedRecognizer = recognizer;
  cachedModelDir = asrModelDir;
  return recognizer;
}

/**
 * Transcribes 16kHz mono Float32 PCM samples completely offline.
 */
export function transcribePcm16k(samples: Float32Array, sampleRate = 16000): string {
  const recognizer = getOrCreateRecognizer();
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  return cleanTranscriptText(result?.text || '');
}

/**
 * Transcribes a local WAV file directly via `sherpa-onnx-node`'s native `readWave`!
 */
export function transcribeWavFile(wavPath: string): { text: string; durationSec: number } {
  if (!fs.existsSync(wavPath)) {
    throw new Error('找不到音频文件。');
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx-node');
  const wave = sherpa.readWave(wavPath) as { samples: Float32Array; sampleRate: number };
  const text = transcribePcm16k(wave.samples, wave.sampleRate);
  const durationSec = wave.sampleRate > 0 ? wave.samples.length / wave.sampleRate : 0;
  return { text, durationSec: Number(durationSec.toFixed(2)) };
}

/**
 * Encodes Float32 PCM samples into a standard 16-bit PCM WAV file (used to save mic recordings
 * directly into the project's `game/assets/voice/` folder!).
 */
export function writePcmToWavFile(
  samples: Float32Array,
  sampleRate: number,
  destPath: string
): void {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  fs.writeFileSync(destPath, buffer);
}

function cleanTranscriptText(raw: string): string {
  return raw
    .replace(/<\|[^|]+\|>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .trim();
}
