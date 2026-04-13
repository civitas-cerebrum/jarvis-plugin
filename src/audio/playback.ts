import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface PlaybackOptions {
  logger: Logger;
  onPlaybackComplete?: () => void;
  onInterrupted?: () => void;
}

export interface PlaybackResult {
  interrupted: boolean;
}

export interface AudioPlayback {
  play(samples: Float32Array, sampleRate: number): Promise<PlaybackResult>;
  stop(): void;
  isPlaying(): boolean;
  destroy(): void;
}

const INT16_MAX = 32768;

function float32ToInt16Buffer(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to Int16 range
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * (INT16_MAX - 1));
    buf.writeInt16LE(int16, i * 2);
  }
  return buf;
}

export function createAudioPlayback(options: PlaybackOptions): AudioPlayback {
  const log: ScopedLogger = options.logger.scope('audio:playback');
  const tempDir = mkdtempSync(join(tmpdir(), 'jarvis-'));
  const tempFile = join(tempDir, 'tts.raw');
  let playing = false;
  let destroyed = false;
  let proc: ChildProcess | null = null;
  let currentResolve: ((result: PlaybackResult) => void) | undefined;

  log.info('playback created', { tempDir });

  return {
    play(samples: Float32Array, sampleRate: number): Promise<PlaybackResult> {
      if (destroyed) {
        log.error('cannot play — playback is destroyed');
        return Promise.resolve({ interrupted: false });
      }
      if (playing) {
        log.warn('play called while already playing');
        return Promise.resolve({ interrupted: false });
      }

      playing = true;
      const durationMs = (samples.length / sampleRate) * 1000;
      log.info('playback started', { samples: samples.length, sampleRate, durationMs });

      const pcmBuffer = float32ToInt16Buffer(samples);

      // Write PCM to a temp file — SoX play doesn't handle Node.js
      // socketpair-based stdin pipes correctly (exits after partial read).
      // Using a file lets play read at its own pace.
      writeFileSync(tempFile, pcmBuffer);

      return new Promise<PlaybackResult>((resolve) => {
        currentResolve = resolve;

        const args = [
          '-q', '-t', 'raw', '-b', '16', '-e', 'signed-integer',
          '-c', '1', '-r', String(sampleRate), tempFile,
        ];

        proc = spawn('play', args, { stdio: ['ignore', 'ignore', 'pipe'] });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const msg = chunk.toString().trim();
          if (msg.length > 0) {
            log.error('play stderr', { message: msg });
          }
        });

        proc.on('error', (err: Error) => {
          log.error('play process error', { error: err.message });
          playing = false;
          proc = null;
          const r = currentResolve;
          currentResolve = undefined;
          if (r) r({ interrupted: false });
        });

        proc.on('close', (code: number | null, signal: string | null) => {
          const r = currentResolve;
          if (r) {
            playing = false;
            proc = null;
            currentResolve = undefined;
            log.info('playback complete', { code, signal });
            options.onPlaybackComplete?.();
            r({ interrupted: false });
          }
        });
      });
    },

    stop(): void {
      if (!playing) {
        log.warn('stop called while not playing');
        return;
      }

      if (proc) {
        proc.kill('SIGTERM');
        proc = null;
      }

      playing = false;
      log.info('playback stopped (interrupted)');

      const resolve = currentResolve;
      currentResolve = undefined;
      if (resolve) {
        resolve({ interrupted: true });
      }

      options.onInterrupted?.();
    },

    isPlaying(): boolean {
      return playing;
    },

    destroy(): void {
      if (destroyed) {
        log.warn('destroy called on already-destroyed playback');
        return;
      }
      if (playing) {
        if (proc) {
          proc.kill('SIGTERM');
          proc = null;
        }
        playing = false;

        const resolve = currentResolve;
        currentResolve = undefined;
        if (resolve) {
          resolve({ interrupted: true });
        }

        options.onInterrupted?.();
        log.info('playback stopped during destroy');
      }
      destroyed = true;
      try { unlinkSync(tempFile); } catch { /* ignore */ }
      try { rmdirSync(tempDir); } catch { /* ignore */ }
      log.info('playback destroyed');
    },
  };
}
