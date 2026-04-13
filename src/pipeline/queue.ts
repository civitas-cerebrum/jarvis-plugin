import type { Logger, ScopedLogger } from '../logging/logger.js';

export interface TranscriptionEntry {
  text: string;
  confidence: number;
  timestamp: number;
  durationMs: number;
  lowQuality: boolean;
}

export type ListeningMode = 'wake-word' | 'active';

export interface TranscriptionQueue {
  push(entry: TranscriptionEntry): void;
  pop(): TranscriptionEntry | null;
  waitForNext(timeoutMs: number): Promise<TranscriptionEntry | null>;
  depth(): number;
  clear(): void;
  setMode(mode: ListeningMode): void;
  getMode(): ListeningMode;
}

export interface CreateTranscriptionQueueOptions {
  maxDepth: number;
  logger: Logger;
  wakeWord?: string;
}

export function createTranscriptionQueue(options: CreateTranscriptionQueueOptions): TranscriptionQueue {
  const { maxDepth } = options;
  const wakeWord = (options.wakeWord ?? 'jarvis').toLowerCase();
  const log: ScopedLogger = options.logger.scope('pipeline:queue');
  const entries: TranscriptionEntry[] = [];

  let waiter: ((entry: TranscriptionEntry | null) => void) | null = null;
  let mode: ListeningMode = 'active';

  /** Check if text starts with the wake word, return stripped text or null */
  function matchWakeWord(text: string): string | null {
    const lower = text.toLowerCase().trim();
    // Match "jarvis", "hey jarvis", "yo jarvis", etc.
    const patterns = [
      new RegExp(`^(?:hey\\s+|yo\\s+|ok\\s+)?${wakeWord}[,.:!?\\s]*(.*)`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = lower.match(pattern);
      if (match) {
        return match[1]?.trim() || null; // null if just the wake word with no command
      }
    }
    return null;
  }

  function push(entry: TranscriptionEntry): void {
    // In wake-word mode, filter entries that don't contain the wake word
    if (mode === 'wake-word') {
      const stripped = matchWakeWord(entry.text);
      if (stripped === null && !matchWakeWord(entry.text)?.length) {
        // Check if it's JUST the wake word (no command yet) — still pass it
        // so Claude knows the user is addressing Jarvis
        const justWakeWord = entry.text.toLowerCase().trim().replace(/[,.:!?]/g, '');
        const isJustWakeWord = justWakeWord === wakeWord ||
          justWakeWord === `hey ${wakeWord}` ||
          justWakeWord === `yo ${wakeWord}`;
        if (!isJustWakeWord) {
          log.debug('push: filtered (no wake word)', { text: entry.text, mode });
          return;
        }
      }
      // Strip the wake word prefix from the text
      if (stripped !== null) {
        entry = { ...entry, text: stripped };
      }
    }

    if (waiter !== null) {
      log.debug('push: delivering directly to waiter', { text: entry.text });
      const resolve = waiter;
      waiter = null;
      resolve(entry);
      return;
    }

    entries.push(entry);
    log.debug('push: queued entry', { text: entry.text, depth: entries.length, mode });

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

  function setMode(newMode: ListeningMode): void {
    if (newMode !== mode) {
      log.info('listening mode changed', { from: mode, to: newMode });
      mode = newMode;
    }
  }

  function getMode(): ListeningMode {
    return mode;
  }

  return { push, pop, waitForNext, depth, clear, setMode, getMode };
}
