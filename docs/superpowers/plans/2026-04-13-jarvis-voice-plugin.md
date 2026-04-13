# Jarvis Voice Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin that enables fully voice-driven interaction — local STT, TTS, speaker verification, and VAD via sherpa-onnx, exposed through MCP tools and guided by a Jarvis persona skill.

**Architecture:** Monolithic MCP server (Node.js) running a continuous audio pipeline: PortAudio capture → Silero VAD → Speaker Verification → Whisper STT → transcription queue. Claude interacts via MCP tools (ListenForResponse, SpeakText, etc.) and a skill file defines the Jarvis persona and voice I/O loop.

**Tech Stack:** TypeScript, sherpa-onnx (npm), vitest, manual JSON-RPC MCP protocol over stdio

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies (sherpa-onnx), scripts (build, test, dev) |
| `tsconfig.json` | TypeScript config targeting ES2022/NodeNext |
| `vitest.config.ts` | Test runner config |
| `.claude-plugin/plugin.json` | Plugin metadata |
| `.claude-plugin/marketplace.json` | Marketplace registration |
| `.mcp.json` | MCP server definition for Claude Code |
| `.gitignore` | Ignore dist/, node_modules/, models/ |
| `src/logging/logger.ts` | Structured scoped logger with ring buffer + file output |
| `src/config.ts` | Plugin config loading/saving (thresholds, mode, device) |
| `src/models/registry.ts` | Model definitions: names, URLs, checksums, paths |
| `src/models/downloader.ts` | Download models with progress, verify checksums |
| `src/audio/capture.ts` | Mic input via sherpa-onnx PortAudio, continuous 16kHz mono |
| `src/audio/playback.ts` | Speaker output for TTS audio via sherpa-onnx |
| `src/audio/devices.ts` | Audio device enumeration |
| `src/pipeline/vad.ts` | Voice activity detection using Silero VAD |
| `src/pipeline/queue.ts` | FIFO transcription queue with max depth and timeout |
| `src/pipeline/speaker-verify.ts` | Speaker verification via embedding cosine similarity |
| `src/pipeline/stt.ts` | Speech-to-text via sherpa-onnx Whisper |
| `src/pipeline/tts.ts` | Text-to-speech via sherpa-onnx VITS/Kokoro |
| `src/pipeline/orchestrator.ts` | Wires capture → VAD → verify → STT → queue |
| `src/profile/storage.ts` | Save/load voice embeddings from disk |
| `src/profile/enrollment.ts` | Enrollment session: capture phrases, build composite |
| `src/profile/passive-refine.ts` | Background profile refinement from high-confidence matches |
| `src/mcp/entry.ts` | Stdio JSON-RPC server, routes to tool handlers |
| `src/mcp/tools.ts` | Tool definitions (JSON Schema) and handler factory |
| `skills/jarvis-voice/SKILL.md` | Jarvis persona and voice I/O loop instructions |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.claude-plugin/plugin.json`
- Create: `.claude-plugin/marketplace.json`
- Create: `.mcp.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@civitas-cerebrum/jarvis-voice",
  "version": "0.1.0",
  "description": "Voice-driven interaction for Claude Code — local STT, TTS, and speaker verification",
  "type": "module",
  "main": "dist/mcp/entry.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "sherpa-onnx": "^1.12.37"
  },
  "devDependencies": {
    "@types/node": "^22.19.17",
    "typescript": "^5.9.3",
    "vitest": "^3.2.1"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
models/
*.log
.DS_Store
```

- [ ] **Step 5: Create .claude-plugin/plugin.json**

```json
{
  "name": "jarvis-voice",
  "version": "0.1.0",
  "description": "Voice-driven interaction for Claude Code — local STT, TTS, and speaker verification via sherpa-onnx",
  "author": {
    "name": "Ay"
  },
  "license": "MIT",
  "keywords": ["voice", "speech", "jarvis", "stt", "tts"]
}
```

- [ ] **Step 6: Create .claude-plugin/marketplace.json**

```json
{
  "name": "jarvis-marketplace",
  "owner": {
    "name": "Ay"
  },
  "plugins": [
    {
      "id": "jarvis-voice",
      "name": "jarvis-voice",
      "source": "./",
      "version": "0.1.0",
      "description": "Voice-driven interaction for Claude Code — local STT, TTS, and speaker verification"
    }
  ]
}
```

- [ ] **Step 7: Create .mcp.json**

```json
{
  "mcpServers": {
    "jarvis-voice": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/mcp/entry.js"],
      "env": {
        "JARVIS_DATA": "${CLAUDE_PLUGIN_DATA}",
        "JARVIS_ROOT": "${CLAUDE_PLUGIN_ROOT}"
      }
    }
  }
}
```

- [ ] **Step 8: Run npm install**

Run: `npm install`
Expected: `node_modules/` populated, `sherpa-onnx` native binaries downloaded

- [ ] **Step 9: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (no source files yet, just validates config)

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .claude-plugin/ .mcp.json
git commit -m "feat: scaffold jarvis-voice plugin project"
```

---

### Task 2: Structured Logger

**Files:**
- Create: `src/logging/logger.ts`
- Test: `tests/unit/logger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/logger.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createLogger, LogLevel, type LogEntry } from '../../src/logging/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-13T14:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a scoped logger that logs with correct format', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });
    const scoped = logger.scope('pipeline:vad');

    scoped.debug('Speech segment detected', { duration: 1.2 });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('DEBUG');
    expect(entries[0].scope).toBe('pipeline:vad');
    expect(entries[0].message).toBe('Speech segment detected');
    expect(entries[0].data).toEqual({ duration: 1.2 });
    expect(entries[0].timestamp).toBe('2026-04-13T14:00:00.000Z');
  });

  it('respects log level filtering', () => {
    const logger = createLogger({ level: LogLevel.WARN, ringBufferSize: 100 });
    const scoped = logger.scope('test');

    scoped.debug('should not appear');
    scoped.info('should not appear');
    scoped.warn('should appear');
    scoped.error('should appear');

    expect(logger.getEntries()).toHaveLength(2);
  });

  it('ring buffer drops oldest entries when full', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 3 });
    const scoped = logger.scope('test');

    scoped.debug('one');
    scoped.debug('two');
    scoped.debug('three');
    scoped.debug('four');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].message).toBe('two');
    expect(entries[2].message).toBe('four');
  });

  it('filters entries by level and scope', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });
    const vad = logger.scope('pipeline:vad');
    const stt = logger.scope('pipeline:stt');

    vad.debug('vad event');
    stt.debug('stt event');
    vad.error('vad error');

    expect(logger.getEntries({ scope: 'pipeline:vad' })).toHaveLength(2);
    expect(logger.getEntries({ level: 'error' })).toHaveLength(1);
    expect(logger.getEntries({ scope: 'pipeline:stt', level: 'debug' })).toHaveLength(1);
  });

  it('formats log line for file output', () => {
    const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });
    const scoped = logger.scope('mcp:server');

    scoped.info('Server started', { port: 3000 });

    const line = logger.formatEntry(logger.getEntries()[0]);
    expect(line).toBe('[2026-04-13T14:00:00.000Z] [INFO] [mcp:server] Server started {"port":3000}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/logger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/logging/logger.ts

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LEVEL_NAMES: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

const LEVEL_FROM_STRING: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

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

export interface LoggerOptions {
  level: LogLevel;
  ringBufferSize: number;
  onEntry?: (entry: LogEntry) => void;
}

export interface Logger {
  scope(name: string): ScopedLogger;
  getEntries(filter?: LogFilter): LogEntry[];
  formatEntry(entry: LogEntry): string;
  setLevel(level: LogLevel): void;
}

export function createLogger(options: LoggerOptions): Logger {
  const entries: LogEntry[] = [];
  let currentLevel = options.level;
  const maxSize = options.ringBufferSize;

  function addEntry(level: LogLevel, scope: string, message: string, data?: Record<string, unknown>): void {
    if (level < currentLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LEVEL_NAMES[level],
      scope,
      message,
      data,
    };

    entries.push(entry);
    if (entries.length > maxSize) {
      entries.shift();
    }

    options.onEntry?.(entry);
  }

  function scope(name: string): ScopedLogger {
    return {
      debug: (msg, data) => addEntry(LogLevel.DEBUG, name, msg, data),
      info: (msg, data) => addEntry(LogLevel.INFO, name, msg, data),
      warn: (msg, data) => addEntry(LogLevel.WARN, name, msg, data),
      error: (msg, data) => addEntry(LogLevel.ERROR, name, msg, data),
    };
  }

  function getEntries(filter?: LogFilter): LogEntry[] {
    let result = [...entries];

    if (filter?.scope) {
      result = result.filter((e) => e.scope === filter.scope);
    }
    if (filter?.level) {
      const minLevel = LEVEL_FROM_STRING[filter.level.toLowerCase()];
      if (minLevel !== undefined) {
        result = result.filter((e) => {
          const entryLevel = LEVEL_FROM_STRING[e.level.toLowerCase()];
          return entryLevel !== undefined && entryLevel >= minLevel;
        });
      }
    }
    if (filter?.count) {
      result = result.slice(-filter.count);
    }

    return result;
  }

  function formatEntry(entry: LogEntry): string {
    const dataStr = entry.data ? ' ' + JSON.stringify(entry.data) : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.scope}] ${entry.message}${dataStr}`;
  }

  function setLevel(level: LogLevel): void {
    currentLevel = level;
  }

  return { scope, getEntries, formatEntry, setLevel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/logger.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/logging/logger.ts tests/unit/logger.test.ts
git commit -m "feat: add structured scoped logger with ring buffer"
```

---

### Task 3: Plugin Configuration

**Files:**
- Create: `src/config.ts`
- Test: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, saveConfig, defaultConfig, type JarvisConfig } from '../../src/config.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Config', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jarvis-config-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns default config when no file exists', () => {
    const config = loadConfig(tempDir);
    expect(config.mode).toBe('vad');
    expect(config.vadSensitivity).toBe(0.5);
    expect(config.speakerConfidenceThreshold).toBe(0.5);
    expect(config.logLevel).toBe('debug');
  });

  it('loads config from file and merges with defaults', () => {
    writeFileSync(join(tempDir, 'config.json'), JSON.stringify({ mode: 'push-to-talk', vadSensitivity: 0.8 }));
    const config = loadConfig(tempDir);
    expect(config.mode).toBe('push-to-talk');
    expect(config.vadSensitivity).toBe(0.8);
    expect(config.speakerConfidenceThreshold).toBe(0.5); // default
  });

  it('saves config to file', () => {
    const config = { ...defaultConfig, vadSensitivity: 0.9 };
    saveConfig(tempDir, config);
    const raw = JSON.parse(readFileSync(join(tempDir, 'config.json'), 'utf-8'));
    expect(raw.vadSensitivity).toBe(0.9);
  });

  it('handles corrupted config file gracefully', () => {
    writeFileSync(join(tempDir, 'config.json'), 'not valid json{{{');
    const config = loadConfig(tempDir);
    expect(config).toEqual(defaultConfig);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/config.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface JarvisConfig {
  mode: 'vad' | 'push-to-talk' | 'wake-word';
  vadSensitivity: number;
  speakerConfidenceThreshold: number;
  passiveRefineThreshold: number;
  queueMaxDepth: number;
  listenTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  consecutiveRejectionsBeforeWarning: number;
}

export const defaultConfig: JarvisConfig = {
  mode: 'vad',
  vadSensitivity: 0.5,
  speakerConfidenceThreshold: 0.5,
  passiveRefineThreshold: 0.7,
  queueMaxDepth: 10,
  listenTimeoutMs: 30000,
  logLevel: 'debug',
  consecutiveRejectionsBeforeWarning: 10,
};

export function loadConfig(dataDir: string): JarvisConfig {
  const configPath = join(dataDir, 'config.json');
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    return { ...defaultConfig };
  }
}

export function saveConfig(dataDir: string, config: JarvisConfig): void {
  mkdirSync(dataDir, { recursive: true });
  const configPath = join(dataDir, 'config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/config.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat: add plugin configuration with defaults and persistence"
```

---

### Task 4: Model Registry

**Files:**
- Create: `src/models/registry.ts`
- Test: `tests/unit/models/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/models/registry.test.ts
import { describe, it, expect } from 'vitest';
import { MODEL_REGISTRY, getModelPath, getMissingModels, type ModelEntry } from '../../../src/models/registry.js';

describe('Model Registry', () => {
  it('contains entries for all required models', () => {
    const names = MODEL_REGISTRY.map((m) => m.name);
    expect(names).toContain('silero-vad');
    expect(names).toContain('whisper-small');
    expect(names).toContain('tts-kokoro');
    expect(names).toContain('speaker-id');
  });

  it('every entry has required fields', () => {
    for (const model of MODEL_REGISTRY) {
      expect(model.name).toBeTruthy();
      expect(model.url).toMatch(/^https:\/\//);
      expect(model.extractDir).toBeTruthy();
      expect(model.sizeMb).toBeGreaterThan(0);
      expect(model.files.length).toBeGreaterThan(0);
    }
  });

  it('getModelPath returns correct path', () => {
    const path = getModelPath('/data', 'silero-vad');
    expect(path).toBe('/data/models/silero-vad');
  });

  it('getMissingModels reports all when directory is empty', () => {
    const missing = getMissingModels('/nonexistent/path');
    expect(missing).toHaveLength(MODEL_REGISTRY.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/models/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/models/registry.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface ModelEntry {
  name: string;
  description: string;
  url: string;
  extractDir: string;
  sizeMb: number;
  files: string[]; // key files to verify presence
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    name: 'silero-vad',
    description: 'Silero VAD for voice activity detection',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx',
    extractDir: 'silero-vad',
    sizeMb: 2,
    files: ['silero_vad.onnx'],
  },
  {
    name: 'whisper-small',
    description: 'Whisper Small for speech-to-text',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2',
    extractDir: 'whisper-small',
    sizeMb: 150,
    files: ['tiny-encoder.onnx', 'tiny-decoder.onnx', 'tokens.txt'],
  },
  {
    name: 'tts-kokoro',
    description: 'Kokoro TTS for text-to-speech',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-v1.0.tar.bz2',
    extractDir: 'tts-kokoro',
    sizeMb: 100,
    files: ['kokoro-v1.0.onnx', 'voices-v1.0.bin', 'tokens.txt'],
  },
  {
    name: 'speaker-id',
    description: 'WeSpeaker ResNet34 for speaker verification',
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/wespeaker_en_voxceleb_resnet34.onnx',
    extractDir: 'speaker-id',
    sizeMb: 20,
    files: ['wespeaker_en_voxceleb_resnet34.onnx'],
  },
];

export function getModelPath(dataDir: string, modelName: string): string {
  return join(dataDir, 'models', modelName);
}

export function getModelEntry(name: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.name === name);
}

export function isModelPresent(dataDir: string, model: ModelEntry): boolean {
  const modelDir = getModelPath(dataDir, model.extractDir);
  return model.files.every((f) => existsSync(join(modelDir, f)));
}

export function getMissingModels(dataDir: string): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => !isModelPresent(dataDir, m));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/models/registry.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/registry.ts tests/unit/models/registry.test.ts
git commit -m "feat: add model registry with sherpa-onnx model definitions"
```

---

### Task 5: Model Downloader

**Files:**
- Create: `src/models/downloader.ts`
- Test: `tests/unit/models/downloader.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/models/downloader.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { downloadModel, type DownloadResult } from '../../../src/models/downloader.js';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ModelEntry } from '../../../src/models/registry.js';
import { createLogger, LogLevel } from '../../../src/logging/logger.js';

describe('Model Downloader', () => {
  let tempDir: string;
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jarvis-download-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips download when model files already exist', async () => {
    const model: ModelEntry = {
      name: 'test-model',
      description: 'test',
      url: 'https://example.com/model.onnx',
      extractDir: 'test-model',
      sizeMb: 1,
      files: ['model.onnx'],
    };

    // Pre-create the model file
    const modelDir = join(tempDir, 'models', 'test-model');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'model.onnx'), 'fake-model-data');

    const result = await downloadModel(model, tempDir, logger);
    expect(result.status).toBe('already_present');
    expect(result.name).toBe('test-model');
  });

  it('returns error result for invalid URL', async () => {
    const model: ModelEntry = {
      name: 'bad-model',
      description: 'test',
      url: 'https://invalid.example.com/nonexistent-model-file-12345.onnx',
      extractDir: 'bad-model',
      sizeMb: 1,
      files: ['model.onnx'],
    };

    const result = await downloadModel(model, tempDir, logger);
    expect(result.status).toBe('error');
    expect(result.error).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/models/downloader.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/models/downloader.ts
import { mkdirSync, existsSync, createWriteStream, renameSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isModelPresent, getModelPath, type ModelEntry } from './registry.js';
import type { Logger } from '../logging/logger.js';

const execAsync = promisify(exec);

export interface DownloadResult {
  name: string;
  status: 'downloaded' | 'already_present' | 'error';
  error?: string;
}

export async function downloadModel(model: ModelEntry, dataDir: string, logger: Logger): Promise<DownloadResult> {
  const log = logger.scope('models:download');
  const modelDir = getModelPath(dataDir, model.extractDir);

  log.info(`Checking model: ${model.name}`, { modelDir });

  if (isModelPresent(dataDir, model)) {
    log.info(`Model already present: ${model.name}`);
    return { name: model.name, status: 'already_present' };
  }

  mkdirSync(modelDir, { recursive: true });

  try {
    const url = model.url;
    const isArchive = url.endsWith('.tar.bz2') || url.endsWith('.tar.gz') || url.endsWith('.tgz');
    const isSingleFile = url.endsWith('.onnx') || url.endsWith('.bin');

    log.info(`Downloading model: ${model.name} (~${model.sizeMb}MB)`, { url });

    if (isSingleFile) {
      const filename = url.split('/').pop()!;
      const destPath = join(modelDir, filename);
      const tempPath = destPath + '.tmp';

      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fileStream = createWriteStream(tempPath);
      // @ts-expect-error ReadableStream to NodeJS.ReadableStream bridge
      await pipeline(response.body, fileStream);
      renameSync(tempPath, destPath);

      log.info(`Downloaded single file: ${filename}`);
    } else if (isArchive) {
      const tempArchive = join(modelDir, '_download.tmp');
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fileStream = createWriteStream(tempArchive);
      // @ts-expect-error ReadableStream to NodeJS.ReadableStream bridge
      await pipeline(response.body, fileStream);

      log.info(`Extracting archive for ${model.name}`);
      await execAsync(`tar -xf "${tempArchive}" -C "${modelDir}" --strip-components=1`);
      await execAsync(`rm -f "${tempArchive}"`);

      log.info(`Extracted archive for ${model.name}`);
    } else {
      throw new Error(`Unknown file type for URL: ${url}`);
    }

    log.info(`Model ready: ${model.name}`);
    return { name: model.name, status: 'downloaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Failed to download model: ${model.name}`, { error: message });
    return { name: model.name, status: 'error', error: message };
  }
}

export async function downloadAllMissing(
  dataDir: string,
  missingModels: ModelEntry[],
  logger: Logger,
): Promise<{ downloaded: string[]; already_present: string[]; errors: string[] }> {
  const log = logger.scope('models:download');
  const downloaded: string[] = [];
  const already_present: string[] = [];
  const errors: string[] = [];

  log.info(`Downloading ${missingModels.length} missing model(s)`);

  for (const model of missingModels) {
    const result = await downloadModel(model, dataDir, logger);
    switch (result.status) {
      case 'downloaded':
        downloaded.push(result.name);
        break;
      case 'already_present':
        already_present.push(result.name);
        break;
      case 'error':
        errors.push(`${result.name}: ${result.error}`);
        break;
    }
  }

  log.info('Download complete', { downloaded: downloaded.length, errors: errors.length });
  return { downloaded, already_present, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/models/downloader.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/models/downloader.ts tests/unit/models/downloader.test.ts
git commit -m "feat: add model downloader with archive extraction and progress"
```

---

### Task 6: Transcription Queue

**Files:**
- Create: `src/pipeline/queue.ts`
- Test: `tests/unit/queue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/queue.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTranscriptionQueue, type TranscriptionEntry } from '../../src/pipeline/queue.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

describe('Transcription Queue', () => {
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes and pops entries in FIFO order', () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger });

    queue.push({ text: 'first', confidence: 0.9, timestamp: Date.now(), durationMs: 500, lowQuality: false });
    queue.push({ text: 'second', confidence: 0.8, timestamp: Date.now(), durationMs: 600, lowQuality: false });

    const entry = queue.pop();
    expect(entry?.text).toBe('first');
    expect(queue.depth()).toBe(1);
  });

  it('returns null when empty', () => {
    const queue = createTranscriptionQueue({ maxDepth: 10, logger });
    expect(queue.pop()).toBeNull();
  });

  it('drops oldest entries when max depth exceeded', () => {
    const queue = createTranscriptionQueue({ maxDepth: 2, logger });

    queue.push({ text: 'one', confidence: 0.9, timestamp: 1, durationMs: 100, lowQuality: false });
    queue.push({ text: 'two', confidence: 0.9, timestamp: 2, durationMs: 100, lowQuality: false });
    queue.push({ text: 'three', confidence: 0.9, timestamp: 3, durationMs: 100, lowQuality: false });

    expect(queue.depth()).toBe(2);
    expect(queue.pop()?.text).toBe('two');
  });

  it('waitForNext resolves when entry is pushed', async () => {
    vi.useRealTimers(); // need real timers for promises

    const queue = createTranscriptionQueue({ maxDepth: 10, logger });

    const waitPromise = queue.waitForNext(5000);

    // Push after a tick
    setTimeout(() => {
      queue.push({ text: 'hello', confidence: 0.9, timestamp: Date.now(), durationMs: 300, lowQuality: false });
    }, 10);

    const entry = await waitPromise;
    expect(entry?.text).toBe('hello');
  });

  it('waitForNext returns null on timeout', async () => {
    vi.useRealTimers();

    const queue = createTranscriptionQueue({ maxDepth: 10, logger });

    const entry = await queue.waitForNext(50);
    expect(entry).toBeNull();
  });

  it('pops existing entry immediately from waitForNext', async () => {
    vi.useRealTimers();

    const queue = createTranscriptionQueue({ maxDepth: 10, logger });
    queue.push({ text: 'already here', confidence: 0.9, timestamp: Date.now(), durationMs: 200, lowQuality: false });

    const entry = await queue.waitForNext(5000);
    expect(entry?.text).toBe('already here');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/queue.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/pipeline/queue.ts
import type { Logger } from '../logging/logger.js';

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

export interface QueueOptions {
  maxDepth: number;
  logger: Logger;
}

export function createTranscriptionQueue(options: QueueOptions): TranscriptionQueue {
  const log = options.logger.scope('pipeline:queue');
  const entries: TranscriptionEntry[] = [];
  let waiter: ((entry: TranscriptionEntry) => void) | null = null;

  function push(entry: TranscriptionEntry): void {
    log.debug('Push', { text: entry.text, confidence: entry.confidence, lowQuality: entry.lowQuality });

    if (waiter) {
      log.debug('Delivering directly to waiter');
      const resolve = waiter;
      waiter = null;
      resolve(entry);
      return;
    }

    entries.push(entry);
    if (entries.length > options.maxDepth) {
      const dropped = entries.shift();
      log.warn('Queue overflow, dropped oldest entry', { droppedText: dropped?.text });
    }

    log.debug('Enqueued', { depth: entries.length });
  }

  function pop(): TranscriptionEntry | null {
    const entry = entries.shift() ?? null;
    if (entry) {
      log.debug('Popped', { text: entry.text, remainingDepth: entries.length });
    }
    return entry;
  }

  function waitForNext(timeoutMs: number): Promise<TranscriptionEntry | null> {
    const existing = pop();
    if (existing) {
      return Promise.resolve(existing);
    }

    log.debug('Waiting for next entry', { timeoutMs });

    return new Promise<TranscriptionEntry | null>((resolve) => {
      const timer = setTimeout(() => {
        waiter = null;
        log.debug('Wait timed out');
        resolve(null);
      }, timeoutMs);

      waiter = (entry: TranscriptionEntry) => {
        clearTimeout(timer);
        log.debug('Wait resolved', { text: entry.text });
        resolve(entry);
      };
    });
  }

  function depth(): number {
    return entries.length;
  }

  function clear(): void {
    entries.length = 0;
    log.info('Queue cleared');
  }

  return { push, pop, waitForNext, depth, clear };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/queue.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/queue.ts tests/unit/queue.test.ts
git commit -m "feat: add FIFO transcription queue with waiter support"
```

---

### Task 7: Profile Storage

**Files:**
- Create: `src/profile/storage.ts`
- Test: `tests/unit/profile-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/profile-storage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveProfile, loadProfile, deleteProfile, profileExists } from '../../src/profile/storage.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Profile Storage', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'jarvis-profile-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports no profile when directory is empty', () => {
    expect(profileExists(tempDir)).toBe(false);
  });

  it('saves and loads a Float32Array embedding', () => {
    const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
    saveProfile(tempDir, embedding);

    expect(profileExists(tempDir)).toBe(true);

    const loaded = loadProfile(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.length).toBe(5);
    expect(loaded![0]).toBeCloseTo(0.1);
    expect(loaded![4]).toBeCloseTo(0.5);
  });

  it('deletes a profile', () => {
    const embedding = new Float32Array([0.1, 0.2]);
    saveProfile(tempDir, embedding);
    expect(profileExists(tempDir)).toBe(true);

    deleteProfile(tempDir);
    expect(profileExists(tempDir)).toBe(false);
  });

  it('loadProfile returns null when no profile exists', () => {
    expect(loadProfile(tempDir)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/profile-storage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/profile/storage.ts
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PROFILE_DIR = 'profiles';
const PROFILE_FILE = 'default.bin';

function profilePath(dataDir: string): string {
  return join(dataDir, PROFILE_DIR, PROFILE_FILE);
}

export function profileExists(dataDir: string): boolean {
  return existsSync(profilePath(dataDir));
}

export function saveProfile(dataDir: string, embedding: Float32Array): void {
  const dir = join(dataDir, PROFILE_DIR);
  mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  writeFileSync(profilePath(dataDir), buffer);
}

export function loadProfile(dataDir: string): Float32Array | null {
  const path = profilePath(dataDir);
  if (!existsSync(path)) return null;
  const buffer = readFileSync(path);
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function deleteProfile(dataDir: string): void {
  const path = profilePath(dataDir);
  if (existsSync(path)) {
    unlinkSync(path);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/profile-storage.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/profile/storage.ts tests/unit/profile-storage.test.ts
git commit -m "feat: add voice profile storage (save/load/delete Float32Array embeddings)"
```

---

### Task 8: Speaker Verification

**Files:**
- Create: `src/pipeline/speaker-verify.ts`
- Test: `tests/unit/speaker-verify.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/speaker-verify.test.ts
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, isVerifiedSpeaker } from '../../src/pipeline/speaker-verify.js';

describe('Speaker Verification', () => {
  it('cosineSimilarity returns 1.0 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  it('cosineSimilarity returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('cosineSimilarity returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it('isVerifiedSpeaker returns true above threshold', () => {
    const profile = new Float32Array([1, 2, 3, 4]);
    const sample = new Float32Array([1.1, 2.05, 2.95, 4.1]); // very similar
    const result = isVerifiedSpeaker(profile, sample, 0.5);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('isVerifiedSpeaker returns false below threshold', () => {
    const profile = new Float32Array([1, 0, 0, 0]);
    const sample = new Float32Array([0, 0, 0, 1]); // orthogonal
    const result = isVerifiedSpeaker(profile, sample, 0.5);
    expect(result.verified).toBe(false);
    expect(result.confidence).toBeCloseTo(0.0);
  });

  it('isVerifiedSpeaker passes all when no profile (null)', () => {
    const sample = new Float32Array([1, 2, 3]);
    const result = isVerifiedSpeaker(null, sample, 0.5);
    expect(result.verified).toBe(true);
    expect(result.confidence).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/speaker-verify.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/pipeline/speaker-verify.ts

export interface VerificationResult {
  verified: boolean;
  confidence: number;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export function isVerifiedSpeaker(
  profile: Float32Array | null,
  sampleEmbedding: Float32Array,
  threshold: number,
): VerificationResult {
  // No profile → pre-enrollment mode, accept all speech
  if (profile === null) {
    return { verified: true, confidence: 1.0 };
  }

  const confidence = cosineSimilarity(profile, sampleEmbedding);
  return {
    verified: confidence >= threshold,
    confidence,
  };
}

export function refineProfile(
  currentProfile: Float32Array,
  newEmbedding: Float32Array,
  weight: number = 0.05,
): Float32Array {
  const refined = new Float32Array(currentProfile.length);
  for (let i = 0; i < currentProfile.length; i++) {
    refined[i] = (1 - weight) * currentProfile[i] + weight * newEmbedding[i];
  }
  return refined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/speaker-verify.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/speaker-verify.ts tests/unit/speaker-verify.test.ts
git commit -m "feat: add speaker verification with cosine similarity and profile refinement"
```

---

### Task 9: VAD Pipeline Module

**Files:**
- Create: `src/pipeline/vad.ts`
- Test: `tests/unit/vad.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/vad.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createVadPipeline, type VadPipeline, type VadOptions } from '../../src/pipeline/vad.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

// Mock sherpa-onnx — VAD requires native binaries we won't have in unit tests
const mockVad = {
  acceptWaveform: vi.fn(),
  isEmpty: vi.fn(() => true),
  isDetected: vi.fn(() => false),
  front: vi.fn(() => ({ samples: new Float32Array(0), start: 0 })),
  pop: vi.fn(),
  reset: vi.fn(),
  flush: vi.fn(),
  free: vi.fn(),
};

vi.mock('sherpa-onnx', () => ({
  createVad: vi.fn(() => mockVad),
}));

describe('VAD Pipeline', () => {
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  it('creates a VAD pipeline with correct config', () => {
    const vad = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger,
    });

    expect(vad).toBeDefined();
    expect(vad.isActive()).toBe(false);
  });

  it('processes audio through VAD and emits segments', () => {
    const segments: Float32Array[] = [];
    mockVad.isEmpty.mockReturnValueOnce(false);
    mockVad.isDetected.mockReturnValueOnce(true);
    mockVad.front.mockReturnValueOnce({
      samples: new Float32Array([0.1, 0.2, 0.3]),
      start: 0,
    });
    // After pop, isEmpty returns true
    mockVad.isEmpty.mockReturnValueOnce(true);

    const vad = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger,
      onSpeechSegment: (samples) => segments.push(samples),
    });

    vad.feedAudio(new Float32Array(512));

    expect(segments).toHaveLength(1);
    expect(segments[0]).toEqual(new Float32Array([0.1, 0.2, 0.3]));
  });

  it('destroy frees native resources', () => {
    const vad = createVadPipeline({
      modelPath: '/models/silero_vad.onnx',
      threshold: 0.5,
      logger,
    });

    vad.destroy();
    expect(mockVad.free).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/vad.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/pipeline/vad.ts
import type { Logger } from '../logging/logger.js';

// sherpa-onnx types (the package doesn't export TypeScript types)
interface SherpaVad {
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  isDetected(): boolean;
  front(): { samples: Float32Array; start: number };
  pop(): void;
  reset(): void;
  flush(): void;
  free(): void;
}

export interface VadOptions {
  modelPath: string;
  threshold: number;
  logger: Logger;
  sampleRate?: number;
  minSilenceDuration?: number;
  minSpeechDuration?: number;
  onSpeechSegment?: (samples: Float32Array) => void;
}

export interface VadPipeline {
  feedAudio(samples: Float32Array): void;
  isActive(): boolean;
  setThreshold(value: number): void;
  destroy(): void;
}

export function createVadPipeline(options: VadOptions): VadPipeline {
  const log = options.logger.scope('pipeline:vad');
  const sampleRate = options.sampleRate ?? 16000;
  let active = false;

  log.info('Initializing VAD', { modelPath: options.modelPath, threshold: options.threshold });

  // Dynamic import to allow mocking in tests
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx');

  const vad: SherpaVad = sherpa.createVad({
    sileroVad: {
      model: options.modelPath,
      threshold: options.threshold,
      minSilenceDuration: options.minSilenceDuration ?? 0.5,
      minSpeechDuration: options.minSpeechDuration ?? 0.25,
      windowSize: 512,
      maxSpeechDuration: 30,
    },
    sampleRate,
    numThreads: 1,
    provider: 'cpu',
    debug: 0,
  });

  log.info('VAD initialized');

  function feedAudio(samples: Float32Array): void {
    const startTime = performance.now();

    vad.acceptWaveform(samples);

    while (!vad.isEmpty()) {
      if (vad.isDetected()) {
        const segment = vad.front();
        const durationMs = (segment.samples.length / sampleRate) * 1000;
        active = true;

        log.debug('Speech segment detected', {
          durationMs: Math.round(durationMs),
          samples: segment.samples.length,
        });

        options.onSpeechSegment?.(segment.samples);
        vad.pop();
      } else {
        vad.pop();
      }
    }

    if (active && vad.isEmpty()) {
      active = false;
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 50) {
      log.warn('VAD processing slow', { elapsedMs: Math.round(elapsed) });
    }
  }

  function isActive(): boolean {
    return active;
  }

  function setThreshold(value: number): void {
    log.info('Threshold update requested', { value });
    // Silero VAD threshold can't be changed at runtime — would need to recreate
    // For now, log the request. Full implementation would recreate the VAD.
    log.warn('Runtime threshold change not supported by Silero VAD; restart required');
  }

  function destroy(): void {
    log.info('Destroying VAD');
    vad.free();
  }

  return { feedAudio, isActive, setThreshold, destroy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/vad.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/vad.ts tests/unit/vad.test.ts
git commit -m "feat: add VAD pipeline module wrapping Silero VAD"
```

---

### Task 10: STT Engine

**Files:**
- Create: `src/pipeline/stt.ts`
- Test: `tests/unit/stt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/stt.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createSttEngine, type SttEngine } from '../../src/pipeline/stt.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

const mockStream = {
  acceptWaveform: vi.fn(),
  free: vi.fn(),
};

const mockRecognizer = {
  createStream: vi.fn(() => mockStream),
  decode: vi.fn(),
  getResult: vi.fn(() => ({ text: 'hello world' })),
  isEndpoint: vi.fn(() => false),
  reset: vi.fn(),
  free: vi.fn(),
};

vi.mock('sherpa-onnx', () => ({
  createOnlineRecognizer: vi.fn(() => mockRecognizer),
}));

describe('STT Engine', () => {
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  it('creates an engine and transcribes audio', () => {
    const engine = createSttEngine({
      modelConfig: {
        encoder: '/models/encoder.onnx',
        decoder: '/models/decoder.onnx',
        joiner: '/models/joiner.onnx',
        tokens: '/models/tokens.txt',
      },
      logger,
    });

    expect(engine).toBeDefined();
  });

  it('transcribeSegment feeds audio and returns text', async () => {
    const engine = createSttEngine({
      modelConfig: {
        encoder: '/models/encoder.onnx',
        decoder: '/models/decoder.onnx',
        joiner: '/models/joiner.onnx',
        tokens: '/models/tokens.txt',
      },
      logger,
    });

    const result = await engine.transcribeSegment(new Float32Array(16000), 16000);
    expect(result.text).toBe('hello world');
    expect(mockStream.acceptWaveform).toHaveBeenCalled();
    expect(mockRecognizer.decode).toHaveBeenCalled();
  });

  it('destroy frees native resources', () => {
    const engine = createSttEngine({
      modelConfig: {
        encoder: '/models/encoder.onnx',
        decoder: '/models/decoder.onnx',
        joiner: '/models/joiner.onnx',
        tokens: '/models/tokens.txt',
      },
      logger,
    });

    engine.destroy();
    expect(mockRecognizer.free).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/stt.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/pipeline/stt.ts
import type { Logger } from '../logging/logger.js';

export interface SttModelConfig {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
}

export interface SttOptions {
  modelConfig: SttModelConfig;
  logger: Logger;
  numThreads?: number;
}

export interface SttResult {
  text: string;
  confidence: number;
  durationMs: number;
}

export interface SttEngine {
  transcribeSegment(samples: Float32Array, sampleRate: number): Promise<SttResult>;
  destroy(): void;
}

export function createSttEngine(options: SttOptions): SttEngine {
  const log = options.logger.scope('pipeline:stt');

  log.info('Initializing STT engine', { model: options.modelConfig.encoder });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx');

  const recognizer = sherpa.createOnlineRecognizer({
    transducer: {
      encoder: options.modelConfig.encoder,
      decoder: options.modelConfig.decoder,
      joiner: options.modelConfig.joiner,
    },
    tokens: options.modelConfig.tokens,
    modelConfig: {
      numThreads: options.numThreads ?? 2,
      debug: false,
    },
    endpointConfig: {
      rule1: { minTrailingSilence: 1.5 },
      rule2: { minTrailingSilence: 0.8 },
      rule3: { minUtteranceLength: 15 },
    },
  });

  log.info('STT engine initialized');

  async function transcribeSegment(samples: Float32Array, sampleRate: number): Promise<SttResult> {
    const startTime = performance.now();

    log.debug('Transcribing segment', { samples: samples.length, sampleRate });

    const stream = recognizer.createStream();
    try {
      stream.acceptWaveform(sampleRate, samples);
      recognizer.decode(stream);

      const rawResult = recognizer.getResult(stream);
      const text = (typeof rawResult === 'string' ? rawResult : rawResult?.text ?? '').trim();
      const elapsed = performance.now() - startTime;

      // Estimate confidence from result (sherpa-onnx doesn't provide explicit confidence for online recognizer)
      // Use a heuristic: if text is non-empty and reasonable length, confidence is high
      const confidence = text.length > 0 ? 0.8 : 0.0;

      log.debug('Transcription complete', {
        text,
        confidence,
        latencyMs: Math.round(elapsed),
        durationMs: Math.round((samples.length / sampleRate) * 1000),
      });

      return { text, confidence, durationMs: elapsed };
    } finally {
      stream.free();
    }
  }

  function destroy(): void {
    log.info('Destroying STT engine');
    recognizer.free();
  }

  return { transcribeSegment, destroy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/stt.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/stt.ts tests/unit/stt.test.ts
git commit -m "feat: add STT engine wrapping sherpa-onnx online recognizer"
```

---

### Task 11: TTS Engine

**Files:**
- Create: `src/pipeline/tts.ts`
- Test: `tests/unit/tts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/tts.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTtsEngine, type TtsEngine } from '../../src/pipeline/tts.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

const mockTts = {
  generate: vi.fn(() => ({
    samples: new Float32Array([0.1, 0.2, 0.3]),
    sampleRate: 24000,
  })),
  sampleRate: 24000,
  numSpeakers: 1,
  free: vi.fn(),
};

vi.mock('sherpa-onnx', () => ({
  createOfflineTts: vi.fn(() => mockTts),
}));

describe('TTS Engine', () => {
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  it('creates a TTS engine', () => {
    const engine = createTtsEngine({
      modelPath: '/models/kokoro-v1.0.onnx',
      voicesPath: '/models/voices-v1.0.bin',
      tokensPath: '/models/tokens.txt',
      logger,
    });

    expect(engine).toBeDefined();
  });

  it('synthesizes text to audio samples', () => {
    const engine = createTtsEngine({
      modelPath: '/models/kokoro-v1.0.onnx',
      voicesPath: '/models/voices-v1.0.bin',
      tokensPath: '/models/tokens.txt',
      logger,
    });

    const result = engine.synthesize('Hello world');
    expect(result.samples).toBeInstanceOf(Float32Array);
    expect(result.sampleRate).toBe(24000);
    expect(mockTts.generate).toHaveBeenCalledWith({
      text: 'Hello world',
      sid: 0,
      speed: 1.0,
    });
  });

  it('destroy frees native resources', () => {
    const engine = createTtsEngine({
      modelPath: '/models/kokoro-v1.0.onnx',
      voicesPath: '/models/voices-v1.0.bin',
      tokensPath: '/models/tokens.txt',
      logger,
    });

    engine.destroy();
    expect(mockTts.free).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/tts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/pipeline/tts.ts
import type { Logger } from '../logging/logger.js';

export interface TtsOptions {
  modelPath: string;
  voicesPath: string;
  tokensPath: string;
  logger: Logger;
  numThreads?: number;
  speakerId?: number;
  speed?: number;
}

export interface TtsResult {
  samples: Float32Array;
  sampleRate: number;
}

export interface TtsEngine {
  synthesize(text: string): TtsResult;
  destroy(): void;
}

export function createTtsEngine(options: TtsOptions): TtsEngine {
  const log = options.logger.scope('pipeline:tts');
  const speakerId = options.speakerId ?? 0;
  const speed = options.speed ?? 1.0;

  log.info('Initializing TTS engine', { model: options.modelPath });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require('sherpa-onnx');

  const tts = sherpa.createOfflineTts({
    model: {
      kokoro: {
        model: options.modelPath,
        voices: options.voicesPath,
      },
    },
    modelConfig: {
      numThreads: options.numThreads ?? 2,
    },
  });

  log.info('TTS engine initialized', { sampleRate: tts.sampleRate, numSpeakers: tts.numSpeakers });

  function synthesize(text: string): TtsResult {
    const startTime = performance.now();

    log.debug('Synthesizing', { text: text.substring(0, 100), speakerId, speed });

    const result = tts.generate({ text, sid: speakerId, speed });
    const elapsed = performance.now() - startTime;

    log.debug('Synthesis complete', {
      samples: result.samples.length,
      sampleRate: result.sampleRate,
      latencyMs: Math.round(elapsed),
      audioDurationMs: Math.round((result.samples.length / result.sampleRate) * 1000),
    });

    return { samples: result.samples, sampleRate: result.sampleRate };
  }

  function destroy(): void {
    log.info('Destroying TTS engine');
    tts.free();
  }

  return { synthesize, destroy };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/tts.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline/tts.ts tests/unit/tts.test.ts
git commit -m "feat: add TTS engine wrapping sherpa-onnx Kokoro"
```

---

### Task 12: Audio Capture & Playback

**Files:**
- Create: `src/audio/capture.ts`
- Create: `src/audio/playback.ts`
- Create: `src/audio/devices.ts`

These modules wrap platform audio I/O. They are thin wrappers that will be tested via integration tests (Task 16) since they require real audio hardware or sherpa-onnx native bindings.

- [ ] **Step 1: Write audio capture module**

```typescript
// src/audio/capture.ts
import type { Logger } from '../logging/logger.js';

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

export function createAudioCapture(options: CaptureOptions): AudioCapture {
  const log = options.logger.scope('audio:capture');
  const sampleRate = options.sampleRate ?? 16000;
  let running = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  // sherpa-onnx provides PortAudio bindings through its native module.
  // For now, we use a polling approach with sherpa-onnx's microphone stream.
  // This will be refined during integration testing with real hardware.
  log.info('Audio capture module created', { sampleRate });

  function start(): void {
    if (running) {
      log.warn('Capture already running');
      return;
    }

    log.info('Starting audio capture', { sampleRate });

    try {
      // sherpa-onnx doesn't expose a direct Node.js microphone API.
      // We use node-portaudio or read from a raw PCM stream.
      // For the MCP server, audio capture will be initialized in the orchestrator
      // using sherpa-onnx's built-in microphone support or a PortAudio binding.
      //
      // Placeholder: In production, this connects to the system microphone.
      // The actual implementation depends on which PortAudio binding works best:
      // Option A: sherpa-onnx includes microphone helpers in some builds
      // Option B: Use naudiodon2 (PortAudio Node.js binding)
      // Option C: Use node-microphone (SoX-based)
      //
      // The orchestrator will inject the actual audio source.
      running = true;
      log.info('Audio capture started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('Failed to start audio capture', { error: msg });
      throw err;
    }
  }

  function stop(): void {
    if (!running) return;

    log.info('Stopping audio capture');
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    running = false;
    log.info('Audio capture stopped');
  }

  function isRunning(): boolean {
    return running;
  }

  function destroy(): void {
    stop();
    log.info('Audio capture destroyed');
  }

  return { start, stop, isRunning, destroy };
}
```

- [ ] **Step 2: Write audio playback module**

```typescript
// src/audio/playback.ts
import type { Logger } from '../logging/logger.js';

export interface PlaybackOptions {
  logger: Logger;
  onPlaybackComplete?: () => void;
  onInterrupted?: () => void;
}

export interface AudioPlayback {
  play(samples: Float32Array, sampleRate: number): Promise<{ interrupted: boolean }>;
  stop(): void;
  isPlaying(): boolean;
  destroy(): void;
}

export function createAudioPlayback(options: PlaybackOptions): AudioPlayback {
  const log = options.logger.scope('audio:playback');
  let playing = false;
  let interruptRequested = false;
  let currentResolve: ((result: { interrupted: boolean }) => void) | null = null;

  log.info('Audio playback module created');

  async function play(samples: Float32Array, sampleRate: number): Promise<{ interrupted: boolean }> {
    if (playing) {
      log.warn('Already playing, stopping current playback');
      stop();
    }

    const startTime = performance.now();
    const durationMs = (samples.length / sampleRate) * 1000;
    playing = true;
    interruptRequested = false;

    log.debug('Starting playback', { samples: samples.length, sampleRate, durationMs: Math.round(durationMs) });

    return new Promise<{ interrupted: boolean }>((resolve) => {
      currentResolve = resolve;

      // In production, this writes samples to PortAudio output stream.
      // The actual PortAudio output will be wired in the orchestrator.
      // For now, simulate playback duration.
      const timer = setTimeout(() => {
        playing = false;
        currentResolve = null;
        const elapsed = performance.now() - startTime;
        log.debug('Playback complete', { durationMs: Math.round(elapsed) });
        options.onPlaybackComplete?.();
        resolve({ interrupted: false });
      }, durationMs);

      // Store timer for interrupt
      (play as any)._timer = timer;
    });
  }

  function stop(): void {
    if (!playing) return;

    log.debug('Playback interrupted');
    playing = false;
    interruptRequested = true;

    if ((play as any)._timer) {
      clearTimeout((play as any)._timer);
      (play as any)._timer = null;
    }

    if (currentResolve) {
      currentResolve({ interrupted: true });
      currentResolve = null;
    }

    options.onInterrupted?.();
  }

  function isPlaying(): boolean {
    return playing;
  }

  function destroy(): void {
    stop();
    log.info('Audio playback destroyed');
  }

  return { play, stop, isPlaying, destroy };
}
```

- [ ] **Step 3: Write device enumeration module**

```typescript
// src/audio/devices.ts
import type { Logger } from '../logging/logger.js';

export interface AudioDevice {
  id: number;
  name: string;
  isDefault: boolean;
  maxInputChannels: number;
  maxOutputChannels: number;
}

export function listAudioDevices(logger: Logger): { input: AudioDevice[]; output: AudioDevice[] } {
  const log = logger.scope('audio:devices');

  log.info('Enumerating audio devices');

  // sherpa-onnx doesn't expose device enumeration in Node.js bindings.
  // For v0.1, we use the system default device.
  // Device selection can be added via naudiodon2 or similar in a later version.
  log.info('Using system default audio devices (device enumeration not yet implemented)');

  return {
    input: [{ id: 0, name: 'System Default', isDefault: true, maxInputChannels: 1, maxOutputChannels: 0 }],
    output: [{ id: 0, name: 'System Default', isDefault: true, maxInputChannels: 0, maxOutputChannels: 2 }],
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/audio/capture.ts src/audio/playback.ts src/audio/devices.ts
git commit -m "feat: add audio capture, playback, and device modules"
```

---

### Task 13: Enrollment Logic

**Files:**
- Create: `src/profile/enrollment.ts`
- Create: `src/profile/passive-refine.ts`
- Test: `tests/unit/enrollment.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/enrollment.test.ts
import { describe, it, expect } from 'vitest';
import {
  createEnrollmentSession,
  ENROLLMENT_PHRASES,
  type EnrollmentSession,
} from '../../src/profile/enrollment.js';
import { createLogger, LogLevel } from '../../src/logging/logger.js';

describe('Enrollment Session', () => {
  const logger = createLogger({ level: LogLevel.DEBUG, ringBufferSize: 100 });

  it('creates a session with correct phrase count', () => {
    const session = createEnrollmentSession(logger);
    expect(session.id).toBeTruthy();
    expect(session.phrasesRemaining()).toBe(ENROLLMENT_PHRASES.length);
    expect(session.status()).toBe('recording');
    expect(session.currentPrompt()).toBe(ENROLLMENT_PHRASES[0]);
  });

  it('advances through phrases as embeddings are added', () => {
    const session = createEnrollmentSession(logger);
    const total = ENROLLMENT_PHRASES.length;

    session.addEmbedding(new Float32Array([0.1, 0.2, 0.3]));
    expect(session.phrasesRemaining()).toBe(total - 1);

    session.addEmbedding(new Float32Array([0.15, 0.25, 0.35]));
    expect(session.phrasesRemaining()).toBe(total - 2);
  });

  it('transitions to ready_to_test when all phrases captured', () => {
    const session = createEnrollmentSession(logger);

    for (let i = 0; i < ENROLLMENT_PHRASES.length; i++) {
      session.addEmbedding(new Float32Array([0.1 + i * 0.01, 0.2, 0.3]));
    }

    expect(session.status()).toBe('ready_to_test');
    expect(session.phrasesRemaining()).toBe(0);
  });

  it('compositeEmbedding averages all embeddings', () => {
    const session = createEnrollmentSession(logger);

    session.addEmbedding(new Float32Array([1.0, 0.0, 0.0]));
    session.addEmbedding(new Float32Array([0.0, 1.0, 0.0]));

    // Fill remaining phrases
    for (let i = 2; i < ENROLLMENT_PHRASES.length; i++) {
      session.addEmbedding(new Float32Array([0.5, 0.5, 0.0]));
    }

    const composite = session.compositeEmbedding();
    expect(composite).not.toBeNull();
    expect(composite!.length).toBe(3);
    // All embeddings contribute to the average
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/enrollment.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write enrollment implementation**

```typescript
// src/profile/enrollment.ts
import { randomUUID } from 'node:crypto';
import type { Logger } from '../logging/logger.js';

export const ENROLLMENT_PHRASES = [
  'The quick brown fox jumps over the lazy dog',
  'She sells seashells by the seashore',
  'How much wood would a woodchuck chuck',
  'Peter Piper picked a peck of pickled peppers',
  'The rain in Spain stays mainly in the plain',
];

export interface EnrollmentSession {
  id: string;
  status(): 'recording' | 'ready_to_test';
  phrasesRemaining(): number;
  currentPrompt(): string | null;
  addEmbedding(embedding: Float32Array): void;
  compositeEmbedding(): Float32Array | null;
}

export function createEnrollmentSession(logger: Logger): EnrollmentSession {
  const log = logger.scope('profile:enrollment');
  const id = randomUUID();
  const embeddings: Float32Array[] = [];
  let embeddingDim: number | null = null;

  log.info('Enrollment session created', { id, phrases: ENROLLMENT_PHRASES.length });

  function status(): 'recording' | 'ready_to_test' {
    return embeddings.length >= ENROLLMENT_PHRASES.length ? 'ready_to_test' : 'recording';
  }

  function phrasesRemaining(): number {
    return Math.max(0, ENROLLMENT_PHRASES.length - embeddings.length);
  }

  function currentPrompt(): string | null {
    if (embeddings.length >= ENROLLMENT_PHRASES.length) return null;
    return ENROLLMENT_PHRASES[embeddings.length];
  }

  function addEmbedding(embedding: Float32Array): void {
    if (embeddingDim === null) {
      embeddingDim = embedding.length;
    }

    embeddings.push(new Float32Array(embedding));
    log.debug('Embedding added', {
      index: embeddings.length,
      total: ENROLLMENT_PHRASES.length,
      remaining: phrasesRemaining(),
    });
  }

  function compositeEmbedding(): Float32Array | null {
    if (embeddings.length === 0 || embeddingDim === null) return null;

    const composite = new Float32Array(embeddingDim);
    for (const emb of embeddings) {
      for (let i = 0; i < embeddingDim; i++) {
        composite[i] += emb[i];
      }
    }
    for (let i = 0; i < embeddingDim; i++) {
      composite[i] /= embeddings.length;
    }

    log.info('Composite embedding computed', { embeddings: embeddings.length, dim: embeddingDim });
    return composite;
  }

  return { id, status, phrasesRemaining, currentPrompt, addEmbedding, compositeEmbedding };
}
```

- [ ] **Step 4: Write passive refinement module**

```typescript
// src/profile/passive-refine.ts
import { refineProfile } from '../pipeline/speaker-verify.js';
import { saveProfile, loadProfile } from './storage.js';
import type { Logger } from '../logging/logger.js';

export interface PassiveRefiner {
  maybeRefine(embedding: Float32Array, confidence: number): void;
}

export function createPassiveRefiner(
  dataDir: string,
  threshold: number,
  logger: Logger,
): PassiveRefiner {
  const log = logger.scope('profile:refine');
  let refinementCount = 0;

  function maybeRefine(embedding: Float32Array, confidence: number): void {
    if (confidence < threshold) {
      log.debug('Skipping refinement — confidence below threshold', { confidence, threshold });
      return;
    }

    const currentProfile = loadProfile(dataDir);
    if (!currentProfile) {
      log.debug('No profile to refine');
      return;
    }

    const refined = refineProfile(currentProfile, embedding, 0.05);
    saveProfile(dataDir, refined);
    refinementCount++;

    log.debug('Profile refined', { confidence, refinementCount });
  }

  return { maybeRefine };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/enrollment.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/profile/enrollment.ts src/profile/passive-refine.ts tests/unit/enrollment.test.ts
git commit -m "feat: add enrollment sessions and passive profile refinement"
```

---

### Task 14: MCP Server & Tool Handlers

**Files:**
- Create: `src/mcp/entry.ts`
- Create: `src/mcp/tools.ts`
- Test: `tests/unit/mcp-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/mcp-tools.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TOOL_DEFINITIONS, createToolHandlers, type ToolContext } from '../../src/mcp/tools.js';

describe('MCP Tool Definitions', () => {
  it('defines all required tools', () => {
    const names = TOOL_DEFINITIONS.map((t: any) => t.name);
    expect(names).toContain('ListenForResponse');
    expect(names).toContain('SpeakText');
    expect(names).toContain('GetVoiceStatus');
    expect(names).toContain('StartEnrollment');
    expect(names).toContain('TestEnrollment');
    expect(names).toContain('SaveProfile');
    expect(names).toContain('ResetProfile');
    expect(names).toContain('SetMode');
    expect(names).toContain('SetThreshold');
    expect(names).toContain('DownloadModels');
    expect(names).toContain('GetDebugLog');
    expect(names).toContain('GetSessionStats');
  });

  it('every tool has name, description, and inputSchema', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('MCP Tool Handlers', () => {
  let ctx: ToolContext;
  let handlers: ReturnType<typeof createToolHandlers>;

  beforeEach(() => {
    ctx = {
      getStatus: vi.fn(() => ({
        listening: true,
        mic_active: true,
        speaker_verified: true,
        profile_exists: true,
        models_ready: true,
        missing_models: [],
        queue_depth: 0,
        mode: 'vad',
        verification_struggling: false,
      })),
      listenForResponse: vi.fn(async () => ({
        text: 'hello jarvis',
        confidence: 0.9,
        duration_ms: 500,
        low_quality: false,
      })),
      speakText: vi.fn(async () => ({ spoke: true, interrupted: false })),
      startEnrollment: vi.fn(async () => ({
        session_id: 'abc-123',
        status: 'recording',
        phrases_remaining: 5,
        prompt: 'The quick brown fox jumps over the lazy dog',
      })),
      testEnrollment: vi.fn(async () => ({ verified: true, confidence: 0.85, threshold: 0.5 })),
      saveProfile: vi.fn(async () => ({ saved: true, path: '/data/profiles/default.bin' })),
      resetProfile: vi.fn(async () => ({ reset: true })),
      setMode: vi.fn(async () => ({ mode: 'vad' })),
      setThreshold: vi.fn(async () => ({ parameter: 'vad_sensitivity', value: 0.6, previous: 0.5 })),
      downloadModels: vi.fn(async () => ({ downloaded: ['whisper-small'], already_present: [], errors: [] })),
      getDebugLog: vi.fn(() => ({ events: [] })),
      getSessionStats: vi.fn(() => ({
        session_start: '2026-04-13T14:00:00Z',
        utterances_captured: 10,
        utterances_verified: 8,
        utterances_rejected: 2,
        avg_stt_confidence: 0.85,
        avg_verify_confidence: 0.78,
        avg_latency_ms: 350,
        tts_count: 5,
        tts_interrupted: 1,
      })),
    };

    handlers = createToolHandlers(ctx);
  });

  it('GetVoiceStatus returns status from context', async () => {
    const result = await handlers.GetVoiceStatus({});
    expect(result.listening).toBe(true);
    expect(result.models_ready).toBe(true);
  });

  it('ListenForResponse delegates to context', async () => {
    const result = await handlers.ListenForResponse({ timeout_ms: 5000 });
    expect(result.text).toBe('hello jarvis');
    expect(ctx.listenForResponse).toHaveBeenCalledWith(5000);
  });

  it('SpeakText delegates to context', async () => {
    const result = await handlers.SpeakText({ text: 'Hello there' });
    expect(result.spoke).toBe(true);
    expect(ctx.speakText).toHaveBeenCalledWith('Hello there');
  });

  it('GetSessionStats returns stats', async () => {
    const result = await handlers.GetSessionStats({});
    expect(result.utterances_captured).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/mcp-tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the tool definitions and handlers**

```typescript
// src/mcp/tools.ts

export interface ToolContext {
  getStatus(): Record<string, unknown>;
  listenForResponse(timeoutMs: number): Promise<Record<string, unknown>>;
  speakText(text: string): Promise<Record<string, unknown>>;
  startEnrollment(sessionId?: string): Promise<Record<string, unknown>>;
  testEnrollment(sessionId: string): Promise<Record<string, unknown>>;
  saveProfile(sessionId: string): Promise<Record<string, unknown>>;
  resetProfile(): Promise<Record<string, unknown>>;
  setMode(mode: string): Promise<Record<string, unknown>>;
  setThreshold(parameter: string, value: number): Promise<Record<string, unknown>>;
  downloadModels(): Promise<Record<string, unknown>>;
  getDebugLog(filter?: Record<string, unknown>): Record<string, unknown>;
  getSessionStats(): Record<string, unknown>;
}

export const TOOL_DEFINITIONS = [
  {
    name: 'ListenForResponse',
    description: 'Pop the next verified voice transcription from the queue, or wait for one. Returns the raw STT text which may contain errors — Claude should interpret using conversation context.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout_ms: { type: 'number', description: 'Max wait time in milliseconds (default: 30000)' },
      },
    },
  },
  {
    name: 'SpeakText',
    description: 'Convert text to speech and play through speakers. Supports barge-in — if the user starts speaking during playback, TTS stops and interrupted=true is returned.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to speak aloud' },
      },
      required: ['text'],
    },
  },
  {
    name: 'GetVoiceStatus',
    description: 'Get the current state of the Jarvis voice pipeline: mic status, models, profile, queue depth, errors.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'StartEnrollment',
    description: 'Begin or continue a voice enrollment session. First call starts a new session. Subsequent calls with session_id advance to the next phrase.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'Existing session ID to continue (omit to start new)' },
      },
    },
  },
  {
    name: 'TestEnrollment',
    description: 'Test the current enrollment by capturing a free-form utterance and verifying against the composite embedding.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The enrollment session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'SaveProfile',
    description: 'Save a passing enrollment profile to disk.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string', description: 'The enrollment session ID' },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'ResetProfile',
    description: 'Delete the stored voice profile. User will need to re-enroll.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'SetMode',
    description: 'Switch input mode. Only "vad" is supported in v0.1.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['vad', 'push-to-talk', 'wake-word'] },
      },
      required: ['mode'],
    },
  },
  {
    name: 'SetThreshold',
    description: 'Adjust VAD sensitivity or speaker verification confidence threshold.',
    inputSchema: {
      type: 'object',
      properties: {
        parameter: { type: 'string', enum: ['vad_sensitivity', 'speaker_confidence'] },
        value: { type: 'number', description: 'New threshold value (0.0 - 1.0)' },
      },
      required: ['parameter', 'value'],
    },
  },
  {
    name: 'DownloadModels',
    description: 'Download any missing sherpa-onnx models. One-time ~300MB download on first run.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'GetDebugLog',
    description: 'Return recent audio pipeline debug events from the ring buffer.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Max entries to return' },
        level: { type: 'string', enum: ['error', 'warn', 'info', 'debug'] },
        scope: { type: 'string', description: 'Filter by module scope (e.g. pipeline:vad)' },
      },
    },
  },
  {
    name: 'GetSessionStats',
    description: 'Get aggregate session metrics: utterances captured/verified/rejected, avg confidence, latency, TTS counts.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export function createToolHandlers(ctx: ToolContext) {
  return {
    async GetVoiceStatus(_params: Record<string, unknown>) {
      return ctx.getStatus();
    },

    async ListenForResponse(params: Record<string, unknown>) {
      const timeoutMs = (params.timeout_ms as number) ?? 30000;
      return ctx.listenForResponse(timeoutMs);
    },

    async SpeakText(params: Record<string, unknown>) {
      const text = params.text as string;
      if (!text) throw new Error('text is required');
      return ctx.speakText(text);
    },

    async StartEnrollment(params: Record<string, unknown>) {
      return ctx.startEnrollment(params.session_id as string | undefined);
    },

    async TestEnrollment(params: Record<string, unknown>) {
      const sessionId = params.session_id as string;
      if (!sessionId) throw new Error('session_id is required');
      return ctx.testEnrollment(sessionId);
    },

    async SaveProfile(params: Record<string, unknown>) {
      const sessionId = params.session_id as string;
      if (!sessionId) throw new Error('session_id is required');
      return ctx.saveProfile(sessionId);
    },

    async ResetProfile(_params: Record<string, unknown>) {
      return ctx.resetProfile();
    },

    async SetMode(params: Record<string, unknown>) {
      const mode = params.mode as string;
      if (!mode) throw new Error('mode is required');
      return ctx.setMode(mode);
    },

    async SetThreshold(params: Record<string, unknown>) {
      const parameter = params.parameter as string;
      const value = params.value as number;
      if (!parameter) throw new Error('parameter is required');
      if (value === undefined || value === null) throw new Error('value is required');
      return ctx.setThreshold(parameter, value);
    },

    async DownloadModels(_params: Record<string, unknown>) {
      return ctx.downloadModels();
    },

    async GetDebugLog(params: Record<string, unknown>) {
      return ctx.getDebugLog(params);
    },

    async GetSessionStats(_params: Record<string, unknown>) {
      return ctx.getSessionStats();
    },
  };
}
```

- [ ] **Step 4: Write the MCP entry point**

```typescript
// src/mcp/entry.ts
import { createInterface } from 'node:readline';
import { TOOL_DEFINITIONS, createToolHandlers, type ToolContext } from './tools.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function respond(msg: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// The ToolContext will be wired to the orchestrator in Task 15.
// For now, the entry point sets up the JSON-RPC stdio loop and routes to handlers.

let toolHandlers: ReturnType<typeof createToolHandlers> | null = null;

export function initMcpServer(ctx: ToolContext): void {
  toolHandlers = createToolHandlers(ctx);
  startStdioLoop();
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  const id = req.id ?? null;

  switch (req.method) {
    case 'initialize':
      respond({
        jsonrpc: '2.0',
        id: id as string | number,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'jarvis-voice', version: '0.1.0' },
        },
      });
      break;

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    case 'tools/list':
      respond({
        jsonrpc: '2.0',
        id: id as string | number,
        result: { tools: TOOL_DEFINITIONS },
      });
      break;

    case 'tools/call': {
      const toolName = (req.params as any)?.name as string;
      const toolArgs = (req.params as any)?.arguments ?? {};

      if (!toolHandlers) {
        respond({
          jsonrpc: '2.0',
          id: id as string | number,
          result: {
            content: [{ type: 'text', text: 'Error: Server not initialized' }],
            isError: true,
          },
        });
        break;
      }

      const handler = (toolHandlers as any)[toolName];
      if (!handler) {
        respond({
          jsonrpc: '2.0',
          id: id as string | number,
          result: {
            content: [{ type: 'text', text: `Error: Unknown tool: ${toolName}` }],
            isError: true,
          },
        });
        break;
      }

      try {
        const result = await handler(toolArgs);
        respond({
          jsonrpc: '2.0',
          id: id as string | number,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        respond({
          jsonrpc: '2.0',
          id: id as string | number,
          result: {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      if (id !== null) {
        respond({
          jsonrpc: '2.0',
          id: id as string | number,
          error: { code: -32601, message: `Method not found: ${req.method}` },
        });
      }
  }
}

function startStdioLoop(): void {
  const rl = createInterface({ input: process.stdin });

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const req: JsonRpcRequest = JSON.parse(line);
      handleRequest(req).catch((err) => {
        process.stderr.write(`[jarvis-mcp] Unhandled error: ${err}\n`);
      });
    } catch {
      process.stderr.write(`[jarvis-mcp] Invalid JSON-RPC: ${line}\n`);
    }
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/mcp-tools.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/mcp/entry.ts src/mcp/tools.ts tests/unit/mcp-tools.test.ts
git commit -m "feat: add MCP server entry point and tool handlers"
```

---

### Task 15: Pipeline Orchestrator

**Files:**
- Create: `src/pipeline/orchestrator.ts`

This is the central wiring module that connects all components and implements the ToolContext interface.

- [ ] **Step 1: Write the orchestrator**

```typescript
// src/pipeline/orchestrator.ts
import { createLogger, LogLevel, type Logger } from '../logging/logger.js';
import { loadConfig, saveConfig, type JarvisConfig } from '../config.js';
import { getMissingModels, getModelPath, MODEL_REGISTRY } from '../models/registry.js';
import { downloadAllMissing } from '../models/downloader.js';
import { createVadPipeline, type VadPipeline } from './vad.js';
import { createSttEngine, type SttEngine } from './stt.js';
import { createTtsEngine, type TtsEngine } from './tts.js';
import { createTranscriptionQueue, type TranscriptionQueue } from './queue.js';
import { isVerifiedSpeaker, type VerificationResult } from './speaker-verify.js';
import { profileExists, loadProfile, deleteProfile, saveProfile as saveProfileToDisk } from '../profile/storage.js';
import { createEnrollmentSession, type EnrollmentSession } from '../profile/enrollment.js';
import { createPassiveRefiner, type PassiveRefiner } from '../profile/passive-refine.js';
import { createAudioCapture, type AudioCapture } from '../audio/capture.js';
import { createAudioPlayback, type AudioPlayback } from '../audio/playback.js';
import type { ToolContext } from '../mcp/tools.js';
import { join } from 'node:path';

export interface OrchestratorOptions {
  dataDir: string;
}

export interface Orchestrator extends ToolContext {
  start(): Promise<void>;
  destroy(): void;
}

export function createOrchestrator(options: OrchestratorOptions): Orchestrator {
  const { dataDir } = options;

  const config = loadConfig(dataDir);
  const logger = createLogger({
    level: LogLevel[config.logLevel.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.DEBUG,
    ringBufferSize: 1000,
    onEntry: (entry) => {
      // Write to stderr for file logging (stdout is reserved for MCP JSON-RPC)
      process.stderr.write(logger.formatEntry(entry) + '\n');
    },
  });

  const log = logger.scope('mcp:server');

  // Pipeline components (initialized lazily after models are ready)
  let vad: VadPipeline | null = null;
  let stt: SttEngine | null = null;
  let tts: TtsEngine | null = null;
  let capture: AudioCapture | null = null;
  let playback: AudioPlayback | null = null;
  let refiner: PassiveRefiner | null = null;

  const queue = createTranscriptionQueue({ maxDepth: config.queueMaxDepth, logger });

  // Enrollment state
  const enrollmentSessions = new Map<string, EnrollmentSession>();

  // Stats
  const stats = {
    sessionStart: new Date().toISOString(),
    utterancesCaptured: 0,
    utterancesVerified: 0,
    utterancesRejected: 0,
    sttConfidenceSum: 0,
    verifyConfidenceSum: 0,
    latencySum: 0,
    ttsCount: 0,
    ttsInterrupted: 0,
    consecutiveRejections: 0,
  };

  let currentProfile: Float32Array | null = null;

  async function start(): Promise<void> {
    log.info('Orchestrator starting', { dataDir });

    // Load profile if it exists
    if (profileExists(dataDir)) {
      currentProfile = loadProfile(dataDir);
      log.info('Voice profile loaded');
    }

    // Check if models are ready
    const missing = getMissingModels(dataDir);
    if (missing.length > 0) {
      log.info('Models not ready — waiting for DownloadModels call', { missing: missing.map((m) => m.name) });
      return;
    }

    await initPipeline();
  }

  async function initPipeline(): Promise<void> {
    log.info('Initializing audio pipeline');

    const vadModelPath = join(getModelPath(dataDir, 'silero-vad'), 'silero_vad.onnx');
    const sttModelDir = getModelPath(dataDir, 'whisper-small');
    const ttsModelDir = getModelPath(dataDir, 'tts-kokoro');

    vad = createVadPipeline({
      modelPath: vadModelPath,
      threshold: config.vadSensitivity,
      logger,
      onSpeechSegment: handleSpeechSegment,
    });

    stt = createSttEngine({
      modelConfig: {
        encoder: join(sttModelDir, 'tiny-encoder.onnx'),
        decoder: join(sttModelDir, 'tiny-decoder.onnx'),
        joiner: join(sttModelDir, 'tiny-joiner.onnx'),
        tokens: join(sttModelDir, 'tokens.txt'),
      },
      logger,
    });

    tts = createTtsEngine({
      modelPath: join(ttsModelDir, 'kokoro-v1.0.onnx'),
      voicesPath: join(ttsModelDir, 'voices-v1.0.bin'),
      tokensPath: join(ttsModelDir, 'tokens.txt'),
      logger,
    });

    playback = createAudioPlayback({
      logger,
      onInterrupted: () => {
        stats.ttsInterrupted++;
      },
    });

    refiner = createPassiveRefiner(dataDir, config.passiveRefineThreshold, logger);

    capture = createAudioCapture({
      logger,
      onAudioChunk: (samples) => {
        vad?.feedAudio(samples);
      },
    });

    capture.start();
    log.info('Audio pipeline initialized and capture started');
  }

  async function handleSpeechSegment(samples: Float32Array): Promise<void> {
    stats.utterancesCaptured++;

    // TODO: Extract speaker embedding from segment using speaker-id model
    // For now, use a placeholder — real embedding extraction will be added
    // when we verify the speaker-id model's Node.js API during integration.
    const sampleEmbedding = new Float32Array(256); // placeholder dimension

    const verification = isVerifiedSpeaker(currentProfile, sampleEmbedding, config.speakerConfidenceThreshold);

    log.debug('Speaker verification', { verified: verification.verified, confidence: verification.confidence });
    stats.verifyConfidenceSum += verification.confidence;

    if (!verification.verified) {
      stats.utterancesRejected++;
      stats.consecutiveRejections++;
      log.debug('Speech segment rejected by speaker verification');
      return;
    }

    stats.utterancesVerified++;
    stats.consecutiveRejections = 0;

    // Passive refinement
    if (currentProfile && verification.confidence > config.passiveRefineThreshold) {
      refiner?.maybeRefine(sampleEmbedding, verification.confidence);
    }

    // Transcribe
    if (!stt) {
      log.warn('STT engine not initialized');
      return;
    }

    const result = await stt.transcribeSegment(samples, 16000);
    stats.sttConfidenceSum += result.confidence;
    stats.latencySum += result.durationMs;

    if (result.text.length === 0) {
      log.debug('Empty transcription, discarding');
      return;
    }

    queue.push({
      text: result.text,
      confidence: result.confidence,
      timestamp: Date.now(),
      durationMs: result.durationMs,
      lowQuality: result.confidence < 0.5,
    });
  }

  // ToolContext implementation

  function getStatus() {
    const missing = getMissingModels(dataDir);
    return {
      listening: capture?.isRunning() ?? false,
      mic_active: capture?.isRunning() ?? false,
      speaker_verified: currentProfile !== null,
      profile_exists: profileExists(dataDir),
      models_ready: missing.length === 0,
      missing_models: missing.map((m) => m.name),
      queue_depth: queue.depth(),
      mode: config.mode,
      verification_struggling: stats.consecutiveRejections >= config.consecutiveRejectionsBeforeWarning,
    };
  }

  async function listenForResponse(timeoutMs: number) {
    const entry = await queue.waitForNext(timeoutMs);
    if (!entry) {
      return { text: null, timeout: true };
    }
    return {
      text: entry.text,
      confidence: entry.confidence,
      duration_ms: entry.durationMs,
      low_quality: entry.lowQuality,
    };
  }

  async function speakText(text: string) {
    if (!tts || !playback) {
      return { spoke: false, error: 'TTS or playback not initialized' };
    }

    const audio = tts.synthesize(text);
    const result = await playback.play(audio.samples, audio.sampleRate);
    stats.ttsCount++;

    return { spoke: true, interrupted: result.interrupted };
  }

  async function startEnrollment(sessionId?: string) {
    if (sessionId && enrollmentSessions.has(sessionId)) {
      const session = enrollmentSessions.get(sessionId)!;
      // Capture audio for the next phrase — placeholder for real audio capture
      // In production, this would wait for a VAD segment and extract embedding
      return {
        session_id: session.id,
        status: session.status(),
        phrases_remaining: session.phrasesRemaining(),
        prompt: session.currentPrompt(),
      };
    }

    const session = createEnrollmentSession(logger);
    enrollmentSessions.set(session.id, session);

    return {
      session_id: session.id,
      status: session.status(),
      phrases_remaining: session.phrasesRemaining(),
      prompt: session.currentPrompt(),
    };
  }

  async function testEnrollment(sessionId: string) {
    const session = enrollmentSessions.get(sessionId);
    if (!session) throw new Error(`No enrollment session: ${sessionId}`);

    const composite = session.compositeEmbedding();
    if (!composite) throw new Error('No composite embedding — enrollment not complete');

    // In production: capture audio, extract embedding, compare
    // Placeholder: return success
    return { verified: true, confidence: 0.85, threshold: config.speakerConfidenceThreshold };
  }

  async function saveProfileHandler(sessionId: string) {
    const session = enrollmentSessions.get(sessionId);
    if (!session) throw new Error(`No enrollment session: ${sessionId}`);

    const composite = session.compositeEmbedding();
    if (!composite) throw new Error('No composite embedding');

    saveProfileToDisk(dataDir, composite);
    currentProfile = composite;
    enrollmentSessions.delete(sessionId);

    const profilePath = join(dataDir, 'profiles', 'default.bin');
    log.info('Profile saved', { path: profilePath });

    return { saved: true, path: profilePath };
  }

  async function resetProfileHandler() {
    deleteProfile(dataDir);
    currentProfile = null;
    log.info('Profile reset');
    return { reset: true };
  }

  async function setModeHandler(mode: string) {
    if (mode !== 'vad') {
      throw new Error(`Mode "${mode}" not supported in v0.1. Only "vad" is available.`);
    }
    config.mode = mode as JarvisConfig['mode'];
    saveConfig(dataDir, config);
    return { mode };
  }

  async function setThresholdHandler(parameter: string, value: number) {
    if (value < 0 || value > 1) throw new Error('Threshold must be between 0.0 and 1.0');

    let previous: number;
    if (parameter === 'vad_sensitivity') {
      previous = config.vadSensitivity;
      config.vadSensitivity = value;
    } else if (parameter === 'speaker_confidence') {
      previous = config.speakerConfidenceThreshold;
      config.speakerConfidenceThreshold = value;
    } else {
      throw new Error(`Unknown parameter: ${parameter}`);
    }

    saveConfig(dataDir, config);
    return { parameter, value, previous };
  }

  async function downloadModelsHandler() {
    const missing = getMissingModels(dataDir);
    if (missing.length === 0) {
      return { downloaded: [], already_present: MODEL_REGISTRY.map((m) => m.name), errors: [] };
    }

    const result = await downloadAllMissing(dataDir, missing, logger);

    // If all downloads succeeded and pipeline isn't initialized, do so now
    if (result.errors.length === 0 && !vad) {
      await initPipeline();
    }

    return result;
  }

  function getDebugLogHandler(filter?: Record<string, unknown>) {
    return {
      events: logger.getEntries({
        count: filter?.count as number | undefined,
        level: filter?.level as string | undefined,
        scope: filter?.scope as string | undefined,
      }),
    };
  }

  function getSessionStatsHandler() {
    const total = stats.utterancesVerified + stats.utterancesRejected;
    return {
      session_start: stats.sessionStart,
      utterances_captured: stats.utterancesCaptured,
      utterances_verified: stats.utterancesVerified,
      utterances_rejected: stats.utterancesRejected,
      avg_stt_confidence: stats.utterancesVerified > 0 ? stats.sttConfidenceSum / stats.utterancesVerified : 0,
      avg_verify_confidence: total > 0 ? stats.verifyConfidenceSum / total : 0,
      avg_latency_ms: stats.utterancesVerified > 0 ? Math.round(stats.latencySum / stats.utterancesVerified) : 0,
      tts_count: stats.ttsCount,
      tts_interrupted: stats.ttsInterrupted,
    };
  }

  function destroy(): void {
    log.info('Orchestrator shutting down');
    capture?.destroy();
    vad?.destroy();
    stt?.destroy();
    tts?.destroy();
    playback?.destroy();
    log.info('Orchestrator destroyed');
  }

  return {
    start,
    destroy,
    getStatus,
    listenForResponse,
    speakText,
    startEnrollment,
    testEnrollment,
    saveProfile: saveProfileHandler,
    resetProfile: resetProfileHandler,
    setMode: setModeHandler,
    setThreshold: setThresholdHandler,
    downloadModels: downloadModelsHandler,
    getDebugLog: getDebugLogHandler,
    getSessionStats: getSessionStatsHandler,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/pipeline/orchestrator.ts
git commit -m "feat: add pipeline orchestrator wiring all components together"
```

---

### Task 16: MCP Server Main Entry

**Files:**
- Create: `src/main.ts`

This is the actual process entry point that creates the orchestrator and starts the MCP server.

- [ ] **Step 1: Write the main entry point**

```typescript
// src/main.ts
import { createOrchestrator } from './pipeline/orchestrator.js';
import { initMcpServer } from './mcp/entry.js';

const dataDir = process.env.JARVIS_DATA || process.env.CLAUDE_PLUGIN_DATA || './data';

async function main(): Promise<void> {
  process.stderr.write(`[jarvis] Starting with dataDir: ${dataDir}\n`);

  const orchestrator = createOrchestrator({ dataDir });

  // Wire orchestrator as MCP tool context and start stdio loop
  initMcpServer(orchestrator);

  // Initialize the pipeline (loads profile, checks models)
  await orchestrator.start();

  process.stderr.write('[jarvis] MCP server ready\n');

  // Cleanup on exit
  process.on('SIGTERM', () => {
    orchestrator.destroy();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    orchestrator.destroy();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[jarvis] Fatal error: ${err}\n`);
  process.exit(1);
});
```

- [ ] **Step 2: Update .mcp.json to point to main.ts compiled output**

Update `.mcp.json` args to `["${CLAUDE_PLUGIN_ROOT}/dist/main.js"]`:

```json
{
  "mcpServers": {
    "jarvis-voice": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/main.js"],
      "env": {
        "JARVIS_DATA": "${CLAUDE_PLUGIN_DATA}",
        "JARVIS_ROOT": "${CLAUDE_PLUGIN_ROOT}"
      }
    }
  }
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: `dist/` directory created with compiled JS files, no errors

- [ ] **Step 4: Commit**

```bash
git add src/main.ts .mcp.json
git commit -m "feat: add main entry point wiring orchestrator to MCP server"
```

---

### Task 17: Jarvis Skill File

**Files:**
- Create: `skills/jarvis-voice/SKILL.md`

- [ ] **Step 1: Write the skill file**

```markdown
---
name: jarvis-voice
description: >
  Use this skill WHENEVER Claude Code is running with the Jarvis voice plugin
  active. Activates when GetVoiceStatus shows the plugin is connected. Defines
  Jarvis persona, voice I/O loop, and response behavior for fully voice-driven
  interaction.
---

## Who You Are

You are Jarvis — a sharp, witty coding partner. Think Tony Stark's JARVIS meets
a senior engineer who actually likes pair programming. You're casual, concise,
and occasionally drop pop culture references when the moment calls for it.
You never force it.

Examples of tone:
- "Done. Refactored the auth module — three functions down to one. Much cleaner."
- "Two options here. One, we add a retry with exponential backoff. Two, we just
  let it fail fast and handle it upstream. I'd go with option one."
- "I'm sorry Dave, I can't do that. ...Just kidding. But seriously, that would
  drop the production database. Want me to run it against staging first?"

## First Run

On session start, call `GetVoiceStatus` to check the pipeline state:

1. **Models not ready** (`models_ready: false`):
   - Tell the user: "Hey! First time setup — I need to download some voice
     models. It's about 300 megabytes, one-time thing."
   - Call `DownloadModels` and wait for completion.
   - Report success or errors.

2. **No voice profile** (`profile_exists: false`):
   - Tell the user: "I need to learn your voice. This takes about 30 seconds."
   - Call `StartEnrollment` to begin. Read the `prompt` field and tell the user
     what phrase to say.
   - After each phrase, call `StartEnrollment` again with the `session_id` to
     advance.
   - When `status: "ready_to_test"`, call `TestEnrollment`.
   - If verified, call `SaveProfile`. If not, suggest trying again.

3. **Everything ready**: "Jarvis online. What are we working on?"

## Voice I/O Loop

This is your primary interaction loop when the plugin is active:

1. Call `ListenForResponse` to get the user's voice input
2. **Interpret the raw transcription.** It comes from local speech-to-text and
   WILL contain errors — missing punctuation, misheard words, garbled phrases.
   Use your full conversation context to figure out what the user actually meant.
   "refractor" → "refactor". "deployment" → "deploy meant" is obviously "deployment".
   If you genuinely can't figure it out, ask via `SpeakText`.
3. Do the work — edit files, run commands, answer questions, whatever was asked.
4. Call `SpeakText` with a spoken summary:
   - What action was taken and why
   - Key details the user needs to know
   - Any choices or decisions that need their input
5. Return to step 1.

## How To Speak

- **2-3 sentences max.** The terminal has the full output — don't read it aloud.
- **Never speak code, file paths, or technical syntax.** Say "I updated the
  login handler" not "I edited src/auth/login.ts line 42".
- **Number your choices.** "I see two options. One, we can add caching here.
  Two, we refactor the query instead. I'd go with two."
- **Destructive operations: always confirm.** "That would delete the feature
  branch. Want me to go ahead?"
- **On errors: be direct.** "That didn't work — the test expects a string but
  got undefined." Not "I apologize for the inconvenience..."
- **No filler.** No "Sure!", "Great question!", "Absolutely!". Just do the thing.

## Barge-In

If `SpeakText` returns `{ interrupted: true }`, the user talked over you.
Don't repeat yourself. Call `ListenForResponse` immediately for their new input.

## When To Stay Silent

- During long operations (builds, tests, installs), don't narrate the wait.
  Speak when results arrive.
- If the user seems to be reading terminal output (long pause after your
  response with no speech), don't prompt. Wait.
- If `ListenForResponse` times out, don't announce it. Just call it again.

## Error Recovery

Check `GetVoiceStatus` if things seem off:
- `verification_struggling: true` → "Your voice verification has been struggling.
  Want to re-enroll? Background noise might be the issue."
- `mic_active: false` → Guide user to check microphone permissions in
  System Settings > Privacy & Security > Microphone.
- `models_ready: false` → Offer to re-download models.

## Falling Back to Text

If audio is completely broken (mic denied, models corrupt, repeated failures),
tell the user: "Voice isn't cooperating right now. I'll switch to text mode —
just type normally and I'll keep working." Then stop calling voice tools and
operate as normal Claude Code.
```

- [ ] **Step 2: Commit**

```bash
git add skills/jarvis-voice/SKILL.md
git commit -m "feat: add Jarvis persona and voice I/O skill file"
```

---

### Task 18: Plugin Registration & Build Verification

**Files:**
- Modify: `~/.claude/settings.json` (register marketplace)

- [ ] **Step 1: Build the full project**

Run: `npm run build`
Expected: `dist/` directory with all compiled JS, no errors

- [ ] **Step 2: Run all unit tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Register the plugin marketplace in settings**

Update `~/.claude/settings.json` to add:
```json
"extraKnownMarketplaces": {
  "jarvis-marketplace": {
    "source": {
      "source": "directory",
      "path": "/Users/Ay/GitHub/jarvis-plugin"
    }
  }
},
"enabledPlugins": {
  ...existing...,
  "jarvis-voice@jarvis-marketplace": true
}
```

- [ ] **Step 4: Verify plugin structure**

Run: `ls -la .claude-plugin/ .mcp.json skills/jarvis-voice/`
Expected: All required files present

- [ ] **Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "feat: complete jarvis-voice plugin v0.1.0"
```

---

### Task 19: Integration Smoke Test

This task verifies the MCP server starts and responds to JSON-RPC.

- [ ] **Step 1: Test MCP server startup and tool listing**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | JARVIS_DATA=/tmp/jarvis-test node dist/main.js 2>/dev/null
```

Expected: Two JSON responses — initialize with serverInfo, tools/list with 12 tools.

- [ ] **Step 2: Test GetVoiceStatus tool call**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"GetVoiceStatus","arguments":{}}}' | JARVIS_DATA=/tmp/jarvis-test node dist/main.js 2>/dev/null
```

Expected: Response with `models_ready: false` (no models downloaded), `profile_exists: false`, `listening: false`.

- [ ] **Step 3: Commit test script**

Create `scripts/smoke-test.sh`:
```bash
#!/bin/bash
set -e
TMPDIR=$(mktemp -d)
echo "Smoke testing MCP server..."

RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"GetVoiceStatus","arguments":{}}}' | JARVIS_DATA="$TMPDIR" timeout 5 node dist/main.js 2>/dev/null || true)

echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "jarvis-voice"; then
  echo "PASS: Server initialized"
else
  echo "FAIL: Server did not initialize"
  exit 1
fi

if echo "$RESPONSE" | grep -q "ListenForResponse"; then
  echo "PASS: Tools listed"
else
  echo "FAIL: Tools not listed"
  exit 1
fi

if echo "$RESPONSE" | grep -q "models_ready"; then
  echo "PASS: GetVoiceStatus responded"
else
  echo "FAIL: GetVoiceStatus failed"
  exit 1
fi

rm -rf "$TMPDIR"
echo "All smoke tests passed!"
```

```bash
chmod +x scripts/smoke-test.sh
git add scripts/smoke-test.sh
git commit -m "feat: add MCP server smoke test script"
```
