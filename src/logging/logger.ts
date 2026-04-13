export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  scope: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ScopedLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export interface LogFilter {
  count?: number;
  level?: string;
  scope?: string;
}

export interface Logger {
  scope(name: string): ScopedLogger;
  getEntries(filter?: LogFilter): LogEntry[];
  formatEntry(entry: LogEntry): string;
  setLevel(level: LogLevel): void;
}

export interface CreateLoggerOptions {
  level: LogLevel;
  ringBufferSize: number;
  onEntry?: (entry: LogEntry) => void;
}

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LEVEL_FROM_NAME: Record<string, LogLevel> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
};

export function createLogger(options: CreateLoggerOptions): Logger {
  let currentLevel = options.level;
  const maxSize = options.ringBufferSize;
  const onEntry = options.onEntry;

  const buffer: LogEntry[] = [];

  function addEntry(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): void {
    if (level < currentLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LEVEL_NAMES[level],
      scope,
      message,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    if (buffer.length >= maxSize) {
      buffer.shift();
    }

    buffer.push(entry);

    if (onEntry) {
      onEntry(entry);
    }
  }

  function formatEntry(entry: LogEntry): string {
    let result = `[${entry.timestamp}] [${entry.level}] [${entry.scope}] ${entry.message}`;
    if (entry.data !== undefined) {
      result += ` ${JSON.stringify(entry.data)}`;
    }
    return result;
  }

  function getEntries(filter?: LogFilter): LogEntry[] {
    let entries = [...buffer];

    if (filter?.scope !== undefined) {
      entries = entries.filter((e) => e.scope === filter.scope);
    }

    if (filter?.level !== undefined) {
      const minLevel = LEVEL_FROM_NAME[filter.level];
      if (minLevel !== undefined) {
        entries = entries.filter((e) => {
          const entryLevel = LEVEL_FROM_NAME[e.level];
          return entryLevel !== undefined && entryLevel >= minLevel;
        });
      }
    }

    if (filter?.count !== undefined) {
      entries = entries.slice(-filter.count);
    }

    return entries;
  }

  function scope(name: string): ScopedLogger {
    return {
      debug(message: string, data?: Record<string, unknown>): void {
        addEntry(LogLevel.DEBUG, name, message, data);
      },
      info(message: string, data?: Record<string, unknown>): void {
        addEntry(LogLevel.INFO, name, message, data);
      },
      warn(message: string, data?: Record<string, unknown>): void {
        addEntry(LogLevel.WARN, name, message, data);
      },
      error(message: string, data?: Record<string, unknown>): void {
        addEntry(LogLevel.ERROR, name, message, data);
      },
    };
  }

  return {
    scope,
    getEntries,
    formatEntry,
    setLevel(level: LogLevel): void {
      currentLevel = level;
    },
  };
}
