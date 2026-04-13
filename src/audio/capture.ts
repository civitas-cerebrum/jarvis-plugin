import { spawn, type ChildProcess } from 'node:child_process';
import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface CaptureOptions {
  logger: Logger;
  sampleRate?: number;
  onAudioChunk: (samples: Float32Array) => void;
}

export interface AudioCapture {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  destroy(): void;
}

const CHUNK_SAMPLES = 512;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const CHUNK_BYTES = CHUNK_SAMPLES * BYTES_PER_SAMPLE;
const INT16_MAX = 32768;

export function createAudioCapture(options: CaptureOptions): AudioCapture {
  const log: ScopedLogger = options.logger.scope('audio:capture');
  const sampleRate = options.sampleRate ?? 16000;
  let running = false;
  let destroyed = false;
  let proc: ChildProcess | null = null;
  let remainder: Buffer = Buffer.alloc(0);

  log.info('capture created', { sampleRate });

  function processStdout(data: Buffer): void {
    // Accumulate data with any leftover from the previous read
    let buf = remainder.length > 0 ? Buffer.concat([remainder, data]) : data;
    let offset = 0;

    while (offset + CHUNK_BYTES <= buf.length) {
      const float32 = new Float32Array(CHUNK_SAMPLES);
      for (let i = 0; i < CHUNK_SAMPLES; i++) {
        const int16 = buf.readInt16LE(offset + i * BYTES_PER_SAMPLE);
        float32[i] = int16 / INT16_MAX;
      }
      options.onAudioChunk(float32);
      offset += CHUNK_BYTES;
    }

    // Keep any leftover bytes for the next read
    remainder = offset < buf.length ? buf.subarray(offset) : Buffer.alloc(0);
  }

  function spawnRec(): void {
    const args = [
      '-q', '-t', 'raw', '-b', '16', '-e', 'signed-integer',
      '-c', '1', '-r', String(sampleRate), '-',
    ];

    log.info('spawning rec process', { sampleRate });
    proc = spawn('rec', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.stdout?.on('data', (chunk: Buffer) => {
      processStdout(chunk);
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg.length > 0) {
        log.error('rec stderr', { message: msg });
      }
    });

    proc.on('error', (err: Error) => {
      log.error('rec process error', { error: err.message });
      running = false;
      proc = null;
    });

    proc.on('close', (code: number | null) => {
      log.info('rec process exited', { code });
      running = false;
      proc = null;
    });
  }

  return {
    start(): void {
      if (destroyed) {
        log.error('cannot start — capture is destroyed');
        return;
      }
      if (running) {
        log.warn('start called while already running');
        return;
      }
      running = true;
      remainder = Buffer.alloc(0);
      spawnRec();
      log.info('capture started', { sampleRate });
    },

    stop(): void {
      if (!running) {
        log.warn('stop called while not running');
        return;
      }
      if (proc) {
        proc.kill('SIGTERM');
        proc = null;
      }
      running = false;
      remainder = Buffer.alloc(0);
      log.info('capture stopped');
    },

    isRunning(): boolean {
      return running;
    },

    destroy(): void {
      if (destroyed) {
        log.warn('destroy called on already-destroyed capture');
        return;
      }
      if (running) {
        if (proc) {
          proc.kill('SIGTERM');
          proc = null;
        }
        running = false;
        remainder = Buffer.alloc(0);
        log.info('capture stopped during destroy');
      }
      destroyed = true;
      log.info('capture destroyed');
    },
  };
}
