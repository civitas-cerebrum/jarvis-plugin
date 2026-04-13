/**
 * Acoustic loopback self-test.
 *
 * Speaks a known phrase through the speakers, captures it via the mic,
 * runs it through the full pipeline (VAD → denoiser → STT), and verifies
 * the transcription roughly matches the original phrase.
 *
 * Requirements: speakers + mic active, not muted, reasonable volume.
 * Run with: npx vitest run tests/acoustic/self-test.ts
 */
import { describe, it, expect } from 'vitest';
import sherpa from 'sherpa-onnx-node';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTtsEngine } from '../../src/pipeline/tts.js';
import { createSttEngine } from '../../src/pipeline/stt.js';
import { createAudioPlayback } from '../../src/audio/playback.js';
import { createAudioCapture } from '../../src/audio/capture.js';
import { createVadPipeline } from '../../src/pipeline/vad.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';
import { getModelPath } from '../../src/models/registry.js';

const DATA_DIR =
  process.env.JARVIS_DATA ||
  '/Users/Ay/.claude/plugins/data/jarvis-voice-jarvis-marketplace';

const logger = createLogger({
  level: LogLevel.DEBUG,
  ringBufferSize: 100,
  onEntry(entry) {
    process.stderr.write(logger.formatEntry(entry) + '\n');
  },
});

// Check if models exist before running
const kokoroModel = join(getModelPath(DATA_DIR, 'tts-kokoro-v1'), 'kokoro-v0.19.onnx');
const modelsExist = existsSync(kokoroModel);

describe.skipIf(!modelsExist)('Acoustic Loopback Self-Test', () => {
  it('speaks a phrase and captures a transcription through the full pipeline', async () => {
    // --- TTS: generate audio ---
    const kokoroDir = getModelPath(DATA_DIR, 'tts-kokoro-v1');
    const tts = createTtsEngine({
      modelPath: join(kokoroDir, 'kokoro-v0.19.onnx'),
      voicesPath: join(kokoroDir, 'voices-v0.19.bin'),
      tokensPath: join(kokoroDir, 'tokens.txt'),
      dataDir: join(getModelPath(DATA_DIR, 'tts-kokoro'), 'espeak-ng-data'),
      kokoro: true,
      logger,
    });

    const testPhrase = 'The weather is sunny today';
    const ttsResult = tts.synthesize(testPhrase);
    expect(ttsResult.samples.length).toBeGreaterThan(0);
    expect(ttsResult.sampleRate).toBe(24000);

    // --- STT: prepare recognizer ---
    const sttModelDir = getModelPath(DATA_DIR, 'whisper-small');
    const stt = createSttEngine({
      modelConfig: {
        encoder: join(sttModelDir, 'tiny.en-encoder.onnx'),
        decoder: join(sttModelDir, 'tiny.en-decoder.onnx'),
        tokens: join(sttModelDir, 'tiny.en-tokens.txt'),
      },
      logger,
    });

    // --- VAD + Capture: set up loopback ---
    const capturedSegments: Float32Array[] = [];

    const vadModelPath = join(
      getModelPath(DATA_DIR, 'silero-vad'),
      'silero_vad.onnx',
    );
    const vad = createVadPipeline({
      modelPath: vadModelPath,
      threshold: 0.5,
      logger: logger.scope('test:vad'),
      onSpeechSegment(samples: Float32Array) {
        capturedSegments.push(samples);
      },
    });

    const capture = createAudioCapture({
      logger,
      onAudioChunk(samples: Float32Array) {
        vad.feedAudio(samples);
      },
    });

    // --- Play and capture ---
    const playback = createAudioPlayback({ logger });
    capture.start();

    // Small delay to let capture stabilize
    await new Promise((r) => setTimeout(r, 500));

    await playback.play(ttsResult.samples, ttsResult.sampleRate);

    // Wait for VAD to detect the tail end of speech
    await new Promise((r) => setTimeout(r, 2000));

    capture.stop();
    playback.destroy();
    vad.destroy();

    // --- Verify we captured something ---
    expect(capturedSegments.length).toBeGreaterThan(0);

    // --- STT: transcribe the captured audio ---
    const longestSegment = capturedSegments.reduce((a, b) =>
      a.length > b.length ? a : b,
    );

    const transcription = await stt.transcribeSegment(longestSegment, 16000);
    expect(transcription.text.length).toBeGreaterThan(0);

    // Fuzzy match: check that key words from the phrase appear
    const lower = transcription.text.toLowerCase();
    const keyWords = ['weather', 'sunny', 'today'];
    const matched = keyWords.filter((w) => lower.includes(w));

    console.log(`\n  Spoke:        "${testPhrase}"`);
    console.log(`  Heard:        "${transcription.text}"`);
    console.log(`  Confidence:   ${transcription.confidence}`);
    console.log(`  Keywords:     ${matched.length}/${keyWords.length} matched`);
    console.log(`  Segments:     ${capturedSegments.length} captured`);
    console.log(`  Latency:      ${transcription.durationMs}ms\n`);

    // At least 1 keyword should match for a passing test
    expect(matched.length).toBeGreaterThanOrEqual(1);

    stt.destroy();
    tts.destroy();
  }, 30000); // 30s timeout for the full roundtrip
});
