import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface TranscriptionEntry {
  text: string;
  confidence: number;
  timestamp: number;
  durationMs: number;
  lowQuality: boolean;
}

export interface TranscriptionQueue {
  push(entry: TranscriptionEntry): void;
  pop(): TranscriptionEntry | null;
  waitForNext(timeoutMs: number): Promise<TranscriptionEntry | null>;
  depth(): number;
  clear(): void;
}

export interface CreateTranscriptionQueueOptions {
  maxDepth: number;
  logger: Logger;
}

export function createTranscriptionQueue(options: CreateTranscriptionQueueOptions): TranscriptionQueue {
  const { maxDepth } = options;
  const log: ScopedLogger = options.logger.scope('pipeline:queue');
  const entries: TranscriptionEntry[] = [];

  let waiter: ((entry: TranscriptionEntry | null) => void) | null = null;

  function push(entry: TranscriptionEntry): void {
    if (waiter !== null) {
      log.debug('push: delivering directly to waiter', { text: entry.text });
      const resolve = waiter;
      waiter = null;
      resolve(entry);
      return;
    }

    entries.push(entry);
    log.debug('push: queued entry', { text: entry.text, depth: entries.length });

    if (entries.length > maxDepth) {
      const dropped = entries.shift()!;
      log.warn('push: dropped oldest entry (max depth exceeded)', {
        droppedText: dropped.text,
        maxDepth,
      });
    }
  }

  function pop(): TranscriptionEntry | null {
    const entry = entries.shift() ?? null;
    log.debug('pop', { found: entry !== null, depth: entries.length });
    return entry;
  }

  async function waitForNext(timeoutMs: number): Promise<TranscriptionEntry | null> {
    if (entries.length > 0) {
      const entry = entries.shift()!;
      log.debug('waitForNext: returning existing entry', { text: entry.text, depth: entries.length });
      return entry;
    }

    log.debug('waitForNext: waiting for next entry', { timeoutMs });

    return new Promise<TranscriptionEntry | null>((resolve) => {
      const timer = setTimeout(() => {
        waiter = null;
        log.debug('waitForNext: timed out');
        resolve(null);
      }, timeoutMs);

      waiter = (entry: TranscriptionEntry | null) => {
        clearTimeout(timer);
        resolve(entry);
      };
    });
  }

  function depth(): number {
    return entries.length;
  }

  function clear(): void {
    const count = entries.length;
    entries.length = 0;
    log.debug('clear', { cleared: count });
  }

  return { push, pop, waitForNext, depth, clear };
}
