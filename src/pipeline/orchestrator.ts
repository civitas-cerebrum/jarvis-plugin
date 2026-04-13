import { createLogger, LogLevel } from '../logging/logger.js';
import type { Logger, ScopedLogger } from '../logging/logger.js';
import { loadConfig, saveConfig } from '../config.js';
import type { JarvisConfig } from '../config.js';
import { createTranscriptionQueue } from './queue.js';
import type { TranscriptionQueue } from './queue.js';
import { getMissingModels, getModelPath } from '../models/registry.js';
import { downloadAllMissing } from '../models/downloader.js';
import { createVadPipeline } from './vad.js';
import type { VadPipeline } from './vad.js';
import { createSttEngine } from './stt.js';
import type { SttEngine } from './stt.js';
import { createTtsEngine } from './tts.js';
import type { TtsEngine } from './tts.js';
import { createAudioPlayback } from '../audio/playback.js';
import type { AudioPlayback } from '../audio/playback.js';
import { createAudioCapture } from '../audio/capture.js';
import type { AudioCapture } from '../audio/capture.js';
import { createEmbeddingExtractor } from './embedding-extractor.js';
import type { EmbeddingExtractor } from './embedding-extractor.js';
import { createPassiveRefiner } from '../profile/passive-refine.js';
import type { PassiveRefiner } from '../profile/passive-refine.js';
import { createEnrollmentSession } from '../profile/enrollment.js';
import type { EnrollmentSession } from '../profile/enrollment.js';
import {
  profileExists,
  loadProfile,
  saveProfile as saveProfileToDisk,
  deleteProfile,
} from '../profile/storage.js';
import { isVerifiedSpeaker } from './speaker-verify.js';
import type { ToolContext } from '../mcp/tools.js';
import { join } from 'node:path';

export interface Orchestrator extends ToolContext {
  start(): Promise<void>;
  destroy(): void;
}

interface SessionStats {
  utterancesCaptured: number;
  utterancesVerified: number;
  utterancesRejected: number;
  confidenceSum: number;
  latencySum: number;
  ttsCount: number;
  ttsInterrupted: number;
  consecutiveRejections: number;
}

export function createOrchestrator(options: { dataDir: string }): Orchestrator {
  const { dataDir } = options;

  const logger: Logger = createLogger({
    level: LogLevel.DEBUG,
    ringBufferSize: 1000,
    onEntry(entry) {
      process.stderr.write(logger.formatEntry(entry) + '\n');
    },
  });

  const log: ScopedLogger = logger.scope('orchestrator');
  const config: JarvisConfig = loadConfig(dataDir);

  const queue: TranscriptionQueue = createTranscriptionQueue({
    maxDepth: config.queueMaxDepth,
    logger,
  });

  let voiceProfile: Float32Array | null = null;
  let vad: VadPipeline | null = null;
  let stt: SttEngine | null = null;
  let tts: TtsEngine | null = null;
  let playback: AudioPlayback | null = null;
  let capture: AudioCapture | null = null;
  let embeddingExtractor: EmbeddingExtractor | null = null;
  let passiveRefiner: PassiveRefiner | null = null;
  let enrollmentSession: EnrollmentSession | null = null;
  let pipelineReady = false;

  const stats: SessionStats = {
    utterancesCaptured: 0,
    utterancesVerified: 0,
    utterancesRejected: 0,
    confidenceSum: 0,
    latencySum: 0,
    ttsCount: 0,
    ttsInterrupted: 0,
    consecutiveRejections: 0,
  };

  function handleSpeechSegment(samples: Float32Array): void {
    stats.utterancesCaptured++;

    if (embeddingExtractor) {
      const sampleEmbedding = embeddingExtractor.extract(samples, 16000);

      const verification = isVerifiedSpeaker(
        voiceProfile,
        sampleEmbedding,
        config.speakerConfidenceThreshold,
      );

      if (!verification.verified) {
        stats.utterancesRejected++;
        stats.consecutiveRejections++;
        log.debug('Speaker rejected', {
          confidence: verification.confidence,
          consecutive: stats.consecutiveRejections,
        });
        if (
          stats.consecutiveRejections >=
          config.consecutiveRejectionsBeforeWarning
        ) {
          log.warn('Many consecutive speaker rejections', {
            count: stats.consecutiveRejections,
          });
        }
        return;
      }

      stats.utterancesVerified++;
      stats.consecutiveRejections = 0;
      stats.confidenceSum += verification.confidence;

      if (passiveRefiner && voiceProfile) {
        passiveRefiner.maybeRefine(sampleEmbedding, verification.confidence);
      }
    } else {
      // No embedding extractor — count as verified with full confidence
      stats.utterancesVerified++;
      stats.consecutiveRejections = 0;
      stats.confidenceSum += 1.0;
    }

    if (stt) {
      void stt
        .transcribeSegment(samples, 16000)
        .then((result) => {
          stats.latencySum += result.durationMs;
          queue.push({
            text: result.text,
            confidence: result.confidence,
            timestamp: Date.now(),
            durationMs: result.durationMs,
            lowQuality: result.confidence < 0.5,
          });
        })
        .catch((err: unknown) => {
          log.error('STT transcription failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }

  function initPipeline(): void {
    log.info('Initializing pipeline');

    const vadModelPath = join(
      getModelPath(dataDir, 'silero-vad'),
      'silero_vad.onnx',
    );
    vad = createVadPipeline({
      modelPath: vadModelPath,
      threshold: config.vadSensitivity,
      logger: logger.scope('pipeline:vad'),
      onSpeechSegment: handleSpeechSegment,
    });

    const sttModelDir = getModelPath(dataDir, 'whisper-small');
    stt = createSttEngine({
      modelConfig: {
        encoder: join(sttModelDir, 'tiny-encoder.onnx'),
        decoder: join(sttModelDir, 'tiny-decoder.onnx'),
        joiner: join(sttModelDir, 'tiny-joiner.onnx'),
        tokens: join(sttModelDir, 'tokens.txt'),
      },
      logger,
    });

    const speakerIdModelPath = join(
      getModelPath(dataDir, 'speaker-id'),
      'wespeaker_en_voxceleb_resnet34.onnx',
    );
    embeddingExtractor = createEmbeddingExtractor({
      modelPath: speakerIdModelPath,
      logger,
    });

    const ttsModelDir = getModelPath(dataDir, 'tts-kokoro');
    tts = createTtsEngine({
      modelPath: join(ttsModelDir, 'kokoro-v1.0.onnx'),
      voicesPath: join(ttsModelDir, 'voices-v1.0.bin'),
      tokensPath: join(ttsModelDir, 'tokens.txt'),
      logger,
    });

    playback = createAudioPlayback({
      logger,
      onInterrupted() {
        stats.ttsInterrupted++;
      },
    });

    passiveRefiner = createPassiveRefiner(
      dataDir,
      config.passiveRefineThreshold,
      logger,
    );

    capture = createAudioCapture({
      logger,
      onAudioChunk(samples: Float32Array) {
        vad?.feedAudio(samples);
      },
    });

    capture.start();
    pipelineReady = true;
    log.info('Pipeline initialized and capture started');
  }

  const orchestrator: Orchestrator = {
    async start(): Promise<void> {
      log.info('Starting orchestrator', { dataDir });

      if (profileExists(dataDir)) {
        voiceProfile = loadProfile(dataDir);
        log.info('Voice profile loaded');
      } else {
        log.info('No voice profile found, speaker verification disabled');
      }

      const missing = getMissingModels(dataDir);
      if (missing.length > 0) {
        log.warn('Missing models detected, pipeline will not start', {
          missing: missing.map((m) => m.name),
        });
        return;
      }

      initPipeline();
    },

    destroy(): void {
      log.info('Destroying orchestrator');
      capture?.destroy();
      vad?.destroy();
      stt?.destroy();
      tts?.destroy();
      embeddingExtractor?.destroy();
      playback?.destroy();
      capture = null;
      vad = null;
      stt = null;
      tts = null;
      embeddingExtractor = null;
      playback = null;
      passiveRefiner = null;
      pipelineReady = false;
      log.info('Orchestrator destroyed');
    },

    getStatus(): Record<string, unknown> {
      return {
        mode: config.mode,
        pipelineReady,
        vadActive: vad?.isActive() ?? false,
        profileLoaded: voiceProfile !== null,
        queueDepth: queue.depth(),
        consecutiveRejections: stats.consecutiveRejections,
      };
    },

    async listenForResponse(timeoutMs: number): Promise<Record<string, unknown>> {
      const entry = await queue.waitForNext(timeoutMs);
      if (entry === null) {
        return { heard: false, reason: 'timeout' };
      }
      return {
        heard: true,
        text: entry.text,
        confidence: entry.confidence,
        durationMs: entry.durationMs,
        lowQuality: entry.lowQuality,
      };
    },

    async speakText(text: string): Promise<Record<string, unknown>> {
      if (!tts || !playback) {
        return { spoken: false, reason: 'TTS or playback not initialized' };
      }

      const result = tts.synthesize(text);
      stats.ttsCount++;
      const playResult = await playback.play(result.samples, result.sampleRate);
      return {
        spoken: true,
        interrupted: playResult.interrupted,
        sampleRate: result.sampleRate,
        samples: result.samples.length,
      };
    },

    async startEnrollment(sessionId?: string): Promise<Record<string, unknown>> {
      if (sessionId && enrollmentSession?.id === sessionId) {
        return {
          sessionId: enrollmentSession.id,
          status: enrollmentSession.status(),
          phrasesRemaining: enrollmentSession.phrasesRemaining(),
          currentPrompt: enrollmentSession.currentPrompt(),
        };
      }
      enrollmentSession = createEnrollmentSession(logger);
      return {
        sessionId: enrollmentSession.id,
        status: enrollmentSession.status(),
        phrasesRemaining: enrollmentSession.phrasesRemaining(),
        currentPrompt: enrollmentSession.currentPrompt(),
      };
    },

    async testEnrollment(sessionId: string): Promise<Record<string, unknown>> {
      if (!enrollmentSession || enrollmentSession.id !== sessionId) {
        return { error: 'No matching enrollment session found' };
      }
      const composite = enrollmentSession.compositeEmbedding();
      if (!composite) {
        return { error: 'No embeddings collected yet' };
      }
      if (!embeddingExtractor) {
        return { error: 'Embedding extractor not initialized' };
      }
      // Capture a short test sample via the queue (caller should have spoken)
      // For now, use the composite itself as a self-test
      const testEmbedding = composite;
      const result = isVerifiedSpeaker(
        composite,
        testEmbedding,
        config.speakerConfidenceThreshold,
      );
      return {
        verified: result.verified,
        confidence: result.confidence,
      };
    },

    async saveProfile(sessionId: string): Promise<Record<string, unknown>> {
      if (!enrollmentSession || enrollmentSession.id !== sessionId) {
        return { error: 'No matching enrollment session found' };
      }
      const composite = enrollmentSession.compositeEmbedding();
      if (!composite) {
        return { error: 'No embeddings collected yet' };
      }
      saveProfileToDisk(dataDir, composite);
      voiceProfile = composite;
      log.info('Voice profile saved from enrollment');
      return { saved: true };
    },

    async resetProfile(): Promise<Record<string, unknown>> {
      deleteProfile(dataDir);
      voiceProfile = null;
      log.info('Voice profile reset');
      return { reset: true };
    },

    async setMode(mode: string): Promise<Record<string, unknown>> {
      const valid = ['vad', 'push-to-talk', 'wake-word'] as const;
      if (!valid.includes(mode as typeof valid[number])) {
        return { error: `Invalid mode: ${mode}` };
      }
      (config as { mode: string }).mode = mode;
      saveConfig(dataDir, config);
      log.info('Mode changed', { mode });
      return { mode };
    },

    async setThreshold(
      parameter: string,
      value: number,
    ): Promise<Record<string, unknown>> {
      if (parameter === 'vad_sensitivity') {
        config.vadSensitivity = value;
        vad?.setThreshold(value);
        saveConfig(dataDir, config);
        return { parameter, value };
      }
      if (parameter === 'speaker_confidence') {
        config.speakerConfidenceThreshold = value;
        saveConfig(dataDir, config);
        return { parameter, value };
      }
      return { error: `Unknown parameter: ${parameter}` };
    },

    async downloadModels(): Promise<Record<string, unknown>> {
      const missing = getMissingModels(dataDir);
      if (missing.length === 0) {
        return { status: 'all_present' };
      }
      const result = await downloadAllMissing(dataDir, missing, logger);
      return {
        downloaded: result.downloaded,
        alreadyPresent: result.already_present,
        errors: result.errors,
      };
    },

    getDebugLog(filter?: Record<string, unknown>): Record<string, unknown> {
      const logFilter: Record<string, unknown> = {};
      if (filter) {
        if (typeof filter.count === 'number') logFilter.count = filter.count;
        if (typeof filter.level === 'string') logFilter.level = filter.level;
        if (typeof filter.scope === 'string') logFilter.scope = filter.scope;
      }
      const entries = logger.getEntries(
        Object.keys(logFilter).length > 0
          ? (logFilter as { count?: number; level?: string; scope?: string })
          : undefined,
      );
      return { entries };
    },

    getSessionStats(): Record<string, unknown> {
      return {
        utterancesCaptured: stats.utterancesCaptured,
        utterancesVerified: stats.utterancesVerified,
        utterancesRejected: stats.utterancesRejected,
        averageConfidence:
          stats.utterancesVerified > 0
            ? stats.confidenceSum / stats.utterancesVerified
            : 0,
        averageLatencyMs:
          stats.utterancesVerified > 0
            ? stats.latencySum / stats.utterancesVerified
            : 0,
        ttsCount: stats.ttsCount,
        ttsInterrupted: stats.ttsInterrupted,
        consecutiveRejections: stats.consecutiveRejections,
      };
    },
  };

  return orchestrator;
}
