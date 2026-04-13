# Jarvis Voice Plugin — Design Spec

**Date:** 2026-04-13
**Status:** Draft
**Plugin name:** jarvis-voice
**Marketplace:** jarvis-marketplace (directory-based, local dev)

---

## Overview

Jarvis is a Claude Code plugin that enables fully voice-driven interaction with Claude. When active, Claude listens for the user's voice continuously, transcribes speech, interprets commands, performs work, and speaks back a summary of what it did. Everything runs locally on-device — no cloud audio processing, no API keys for voice.

### Core Principles

- **Privacy first:** All audio processing (capture, VAD, STT, TTS, speaker verification) runs locally via sherpa-onnx. No audio ever leaves the machine.
- **Context-aware:** Claude itself handles transcription error correction using full conversation context — no separate LLM cleanup step needed.
- **Conversational:** The user can talk anytime. Jarvis queues transcriptions in the background and processes them when Claude is ready.
- **Graceful degradation:** If audio fails at any point, Claude falls back to normal text mode.

---

## Architecture

### High-Level

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (Node.js)                     │
│                                                             │
│  ┌──────────┐   ┌───────┐   ┌──────────┐   ┌───────────┐  │
│  │ PortAudio│──→│  VAD  │──→│ Speaker  │──→│    STT    │  │
│  │ Capture  │   │(Silero│   │ Verify   │   │ (Whisper) │  │
│  │ 16kHz    │   │)      │   │          │   │           │  │
│  └──────────┘   └───┬───┘   └────┬─────┘   └─────┬─────┘  │
│                     │            │                │         │
│                  discard      discard        ┌────▼─────┐  │
│                  silence    unverified       │  Queue   │  │
│                                              └────┬─────┘  │
│  ┌──────────┐   ┌──────────┐                      │         │
│  │ PortAudio│◀──│ TTS      │     ListenForResponse│         │
│  │ Playback │   │(VITS/    │◀────────────────────────────── │
│  └──────────┘   │ Piper)   │     SpeakText                  │
│                 └──────────┘                                │
│                                                             │
│              Structured Debug Logger                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Tools (stdio)
┌──────────────────────▼──────────────────────────────────────┐
│                Claude Code + Jarvis Skill                   │
│                                                             │
│  Voice I/O loop: Listen → Interpret → Act → Speak → Repeat │
│  Context-aware STT correction built into interpretation     │
│  Jarvis persona: casual, sharp, pop culture references      │
└─────────────────────────────────────────────────────────────┘
```

### Why Monolithic MCP Server

sherpa-onnx's Node.js bindings handle heavy compute (VAD, STT, TTS, speaker ID) in native C++ threads internally. PortAudio capture runs on its own native thread. The Node.js layer is orchestration only — it won't block MCP tool responses. A split sidecar architecture adds IPC complexity without real benefit at this stage. If performance issues arise later, the pipeline modules are isolated enough to extract into a separate process.

---

## Plugin Structure

```
jarvis-plugin/
├── .claude-plugin/
│   ├── plugin.json              # Plugin metadata
│   └── marketplace.json         # Marketplace registration
├── .mcp.json                    # MCP server definition
├── package.json                 # sherpa-onnx-node dependency
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── mcp/
│   │   ├── server.ts            # MCP server entry — tool registration & dispatch
│   │   └── tools/
│   │       ├── listen.ts        # ListenForResponse
│   │       ├── speak.ts         # SpeakText
│   │       ├── status.ts        # GetVoiceStatus
│   │       ├── enroll.ts        # StartEnrollment, TestEnrollment, SaveProfile, ResetProfile
│   │       ├── config.ts        # SetMode, SetThreshold
│   │       ├── models.ts        # DownloadModels
│   │       └── debug.ts         # GetDebugLog, GetSessionStats
│   ├── audio/
│   │   ├── capture.ts           # Mic input stream (PortAudio via sherpa-onnx)
│   │   ├── playback.ts          # Speaker output for TTS audio
│   │   └── devices.ts           # Device enumeration & selection
│   ├── pipeline/
│   │   ├── vad.ts               # Voice activity detection (Silero VAD)
│   │   ├── speaker-verify.ts    # Speaker verification against enrolled profile
│   │   ├── stt.ts               # Speech-to-text (Whisper)
│   │   ├── tts.ts               # Text-to-speech (VITS/Piper)
│   │   └── queue.ts             # Transcription queue (FIFO, max depth 10)
│   ├── profile/
│   │   ├── enrollment.ts        # Enrollment session management
│   │   ├── storage.ts           # Save/load voice profiles
│   │   └── passive-refine.ts    # Background profile refinement
│   ├── models/
│   │   ├── downloader.ts        # First-run model download with progress
│   │   └── registry.ts          # Model URLs, checksums, paths
│   ├── logging/
│   │   └── logger.ts            # Structured scoped logger with ring buffer
│   └── config.ts                # Plugin configuration
├── skills/
│   └── jarvis-voice/
│       └── SKILL.md             # Jarvis persona + voice I/O behavior
├── tests/
│   ├── unit/
│   │   ├── vad.test.ts
│   │   ├── queue.test.ts
│   │   ├── speaker-verify.test.ts
│   │   ├── enrollment.test.ts
│   │   ├── config.test.ts
│   │   └── models/
│   │       └── registry.test.ts
│   ├── integration/
│   │   ├── pipeline.test.ts
│   │   ├── mcp-tools.test.ts
│   │   └── tts-playback.test.ts
│   └── fixtures/
│       ├── speech-sample-16k.wav
│       ├── silence-16k.wav
│       ├── noise-16k.wav
│       └── enrolled-speaker.bin
├── models/                      # .gitignored — downloaded models
└── README.md
```

### Plugin Manifests

**`.claude-plugin/plugin.json`:**
- name: `jarvis-voice`
- version: `0.1.0`
- description: "Voice-driven interaction for Claude Code — local STT, TTS, and speaker verification"
- author: Ay

**`.claude-plugin/marketplace.json`:**
- marketplace name: `jarvis-marketplace`
- single plugin: `jarvis-voice` at source `./`

**`.mcp.json`:**
- Server name: `jarvis-voice`
- Command: `node ${CLAUDE_PLUGIN_ROOT}/dist/mcp/server.js`
- Env: `JARVIS_DATA=${CLAUDE_PLUGIN_DATA}`, `JARVIS_ROOT=${CLAUDE_PLUGIN_ROOT}`

---

## MCP Tools

### Primary Tools

**`ListenForResponse`**
- Purpose: Pop the next verified transcription from the queue, or wait for one
- Parameters: `{ timeout_ms?: number }` (default: 30000)
- Returns: `{ text: string, confidence: number, duration_ms: number, low_quality: boolean }`
- On timeout: `{ text: null, timeout: true }`

**`SpeakText`**
- Purpose: Convert text to speech and play through speakers
- Parameters: `{ text: string }`
- Returns: `{ spoke: boolean, interrupted: boolean, error?: string }`
- Barge-in: If VAD detects the verified speaker during playback, TTS stops immediately and returns `{ spoke: true, interrupted: true }`

**`GetVoiceStatus`**
- Purpose: Full pipeline state snapshot
- Parameters: none
- Returns:
  ```
  {
    listening: boolean,
    mic_active: boolean,
    speaker_verified: boolean,
    profile_exists: boolean,
    models_ready: boolean,
    missing_models: string[],
    queue_depth: number,
    mode: "vad" | "push-to-talk" | "wake-word",
    verification_struggling: boolean,
    error?: string
  }
  ```

### Enrollment Tools

**`StartEnrollment`**
- Purpose: Begin or continue an enrollment session. First call starts the session and returns the first phrase. Subsequent calls with the same session_id advance to the next phrase (the MCP server captures audio between calls).
- Parameters: `{ session_id?: string }` (omit to start new session, provide to continue)
- Returns: `{ session_id: string, status: "recording" | "ready_to_test", phrases_remaining: number, prompt?: string }`
- When `status: "ready_to_test"`, all phrases captured. Proceed to `TestEnrollment`.

**`TestEnrollment`**
- Purpose: Verify the current enrollment by capturing a free-form utterance and comparing against the composite embedding
- Parameters: `{ session_id: string }`
- Returns: `{ verified: boolean, confidence: number, threshold: number }`

**`SaveProfile`**
- Purpose: Save a passing enrollment to disk
- Parameters: `{ session_id: string }`
- Returns: `{ saved: boolean, path: string }`

**`ResetProfile`**
- Purpose: Delete the stored voice profile
- Parameters: none
- Returns: `{ reset: boolean }`

### Configuration Tools

**`SetMode`**
- Purpose: Switch input mode
- Parameters: `{ mode: "vad" | "push-to-talk" | "wake-word" }`
- Returns: `{ mode: string }`
- Note: Only "vad" implemented in v0.1. Others return an error with a message.

**`SetThreshold`**
- Purpose: Adjust sensitivity parameters
- Parameters: `{ parameter: "vad_sensitivity" | "speaker_confidence", value: number }`
- Returns: `{ parameter: string, value: number, previous: number }`

### Model Management Tools

**`DownloadModels`**
- Purpose: Download missing sherpa-onnx models
- Parameters: none
- Returns: `{ downloaded: string[], already_present: string[], errors: string[] }`

### Debug Tools

**`GetDebugLog`**
- Purpose: Return recent pipeline events from ring buffer
- Parameters: `{ count?: number, level?: "error" | "warn" | "info" | "debug", scope?: string }`
- Returns: `{ events: Array<{ timestamp, level, scope, message, data? }> }`

**`GetSessionStats`**
- Purpose: Aggregate session metrics
- Parameters: none
- Returns:
  ```
  {
    session_start: string,
    utterances_captured: number,
    utterances_verified: number,
    utterances_rejected: number,
    avg_stt_confidence: number,
    avg_verify_confidence: number,
    avg_latency_ms: number,
    tts_count: number,
    tts_interrupted: number
  }
  ```

---

## Audio Pipeline

### Stage 1: Audio Capture

- PortAudio opens default input device at 16kHz, mono, 16-bit PCM
- Continuous capture via native callback thread — never blocks Node.js
- Audio delivered in chunks (~30ms frames) to VAD
- Device selection via `devices.ts` — enumerate available devices, allow user override in config

### Stage 2: Voice Activity Detection

- Silero VAD model (bundled with sherpa-onnx, ~2MB)
- Processes each audio chunk in real-time
- Outputs speech segments with start/end timestamps
- Configurable sensitivity threshold (default tuned for quiet room)
- Discards silence and background noise — only speech segments pass through
- Typical latency: ~10ms per chunk

### Stage 3: Speaker Verification

- Each VAD speech segment checked against the enrolled voice profile
- sherpa-onnx speaker ID model extracts a voice embedding from the segment
- Cosine similarity compared against stored profile embedding
- Confidence score 0.0–1.0. Above threshold (default 0.5) → verified
- Below threshold → discarded, logged as debug event
- If no profile exists (pre-enrollment) → all speech passes through
- Typical latency: ~50ms per segment

### Stage 4: Speech-to-Text

- Verified segments fed to sherpa-onnx Whisper model
- Default model: Whisper Small (~150MB) — balance of speed and accuracy
- Returns raw transcription text and confidence score
- Typical latency: 200-500ms for a normal utterance

### Stage 5: Transcription Queue

- Verified transcriptions pushed to a FIFO queue
- Each entry: `{ text, confidence, timestamp, duration_ms, low_quality }`
- `low_quality` flag set when confidence < 0.5
- Max queue depth: 10. Oldest entries dropped if full.
- `ListenForResponse` pops from front, or blocks with configurable timeout

### TTS Playback

- `SpeakText` feeds text to sherpa-onnx TTS (VITS or Piper voice model)
- Generated audio plays through default output device via PortAudio
- During playback, VAD continues running on mic input
- If verified speaker detected during playback → barge-in: stop TTS immediately, route new speech through the pipeline
- Typical TTS generation latency: 100-300ms

### Total Input Latency Budget

From end of user speech to transcription in queue: ~300-600ms

---

## Speaker Enrollment & Profile Management

### First-Run Explicit Enrollment

1. `GetVoiceStatus` returns `profile_exists: false`
2. Skill instructs Claude to initiate enrollment
3. Claude calls `StartEnrollment` — returns first phrase prompt
4. User speaks the phrase, MCP extracts voice embedding
5. Repeats for ~5 phrases (phonetically diverse), building composite embedding
6. Claude calls `TestEnrollment` — user speaks freely, MCP verifies against composite
7. On success (confidence > threshold), Claude calls `SaveProfile`
8. Profile saved to `${JARVIS_DATA}/profiles/default.bin`

### Passive Refinement

After enrollment, high-confidence verified utterances (confidence > 0.7) contribute to profile updates:

```
profile = 0.95 * profile + 0.05 * new_embedding
```

This slowly adapts to voice changes (different mic, cold, fatigue) without degrading the baseline. Only high-confidence matches contribute — prevents pollution from misidentified speakers.

### Profile Storage

```
${JARVIS_DATA}/
├── profiles/
│   └── default.bin          # Voice embedding (few KB)
├── config.json              # Thresholds, mode, device preferences
├── logs/
│   └── jarvis.log           # Persistent log file with daily rotation
└── models/
    ├── vad/                 # Silero VAD (bundled or downloaded)
    ├── stt/                 # Whisper Small
    ├── tts/                 # VITS/Piper voice
    └── speaker-id/          # WeSpeaker/3D-Speaker
```

### Edge Cases

- **Mic permission denied:** `GetVoiceStatus` returns `{ error: "microphone_permission_denied" }`. Skill guides user to macOS System Settings > Privacy > Microphone.
- **Profile corruption / drift:** After N consecutive rejections of VAD-detected speech, `GetVoiceStatus` sets `verification_struggling: true`. Skill suggests re-enrollment via `ResetProfile` + `StartEnrollment`.
- **Multiple users:** Single "default" profile in v0.1. Architecture supports keyed profiles for future multi-user support.

---

## Model Management

### Required Models

| Model | Purpose | Size | Source |
|-------|---------|------|--------|
| Silero VAD | Voice activity detection | ~2MB | Bundled with sherpa-onnx |
| Whisper Small | Speech-to-text | ~150MB | sherpa-onnx GitHub releases |
| VITS/Piper | Text-to-speech | ~50-100MB | sherpa-onnx GitHub releases |
| WeSpeaker/3D-Speaker | Speaker verification | ~20MB | sherpa-onnx GitHub releases |

**Total first-run download: ~220-320MB**

### Download Flow

1. MCP server starts, checks `${JARVIS_DATA}/models/` for each expected model
2. Missing models reported via `GetVoiceStatus` → `{ models_ready: false, missing_models: [...] }`
3. Skill instructs Claude to inform user and call `DownloadModels`
4. Downloads from sherpa-onnx GitHub releases, verified via SHA256 checksum
5. Extracted to model-specific subdirectories
6. On completion, pipeline initializes with loaded models

### Model Registry

`src/models/registry.ts` contains a hardcoded list of supported models:
- Each entry: `{ name, url, sha256, extractPath, size_mb }`
- URLs point to versioned sherpa-onnx GitHub releases
- Future: user-selectable models (Whisper Tiny for speed, Large for accuracy)

---

## Skill File

**`skills/jarvis-voice/SKILL.md`** defines:

### Persona

Jarvis is a casual, sharp coding partner. Friendly, concise, conversational — like a senior engineer who enjoys pair programming. Occasionally drops pop culture references when the moment calls for it, never forces them.

### Voice I/O Loop

1. Call `ListenForResponse` to get user's voice input
2. Interpret raw STT using conversation context to correct errors (no separate LLM step)
3. Do the work (edit, run commands, answer questions)
4. Call `SpeakText` with a spoken summary: what was done, key details, choices for the user
5. Return to step 1

### Response Rules

- Spoken responses: 2-3 sentences max. Terminal has the full output.
- Never speak code, file paths, or technical syntax — describe what changed.
- Number choices: "I see two options. One, we can..."
- Destructive/irreversible operations: always confirm via voice before acting.
- On errors: be direct, no apologies.

### First Run Behavior

On session start, check `GetVoiceStatus`:
- Models not ready → guide download via `DownloadModels`
- No voice profile → run enrollment flow
- Everything ready → "Jarvis online. What are we working on?"

### Barge-In

If `SpeakText` returns `{ interrupted: true }`, the user cut Jarvis off. Don't repeat. Listen for new input immediately.

### When To Stay Silent

- During long operations (builds, tests), don't narrate the wait. Speak when results arrive.
- If the user appears to be reading terminal output (long pause), wait. Don't prompt.

---

## Logging & Debugging

### Structured Logger

Every module gets a scoped logger. Consistent format:

```
[ISO_TIMESTAMP] [LEVEL] [scope] Message {optional_data}
```

Example:
```
[2026-04-13T14:32:01.123Z] [DEBUG] [pipeline:vad] Speech segment detected: 1.2s, energy=0.73
[2026-04-13T14:32:01.180Z] [DEBUG] [pipeline:speaker-verify] Checking segment: confidence=0.82, threshold=0.50 → PASS
[2026-04-13T14:32:01.400Z] [DEBUG] [pipeline:stt] Transcription: "refactor the auth module" (confidence=0.91, latency=220ms)
[2026-04-13T14:32:01.401Z] [DEBUG] [pipeline:queue] Enqueued, depth=1
```

### Every Method Logs

- Entry with input parameters
- Key decision points (threshold comparisons, branching)
- Exit with result or error
- Timing (operation duration)

### Log Levels

- `ERROR`: Something broke (mic failed, model crash, file I/O)
- `WARN`: Recoverable (low confidence, queue overflow, verification drift)
- `INFO`: Lifecycle events (server start, model loaded, profile saved)
- `DEBUG`: Everything (every VAD trigger, every verification, every STT result)

### Storage

- **In-memory ring buffer:** Last 1000 entries, exposed via `GetDebugLog` tool
- **File:** `${JARVIS_DATA}/logs/jarvis.log` with daily rotation
- **Level:** Configurable via `config.json` (default: `DEBUG`)

### Module Scopes

`audio:capture`, `audio:playback`, `audio:devices`, `pipeline:vad`, `pipeline:speaker-verify`, `pipeline:stt`, `pipeline:tts`, `pipeline:queue`, `profile:enrollment`, `profile:storage`, `profile:refine`, `models:download`, `mcp:server`, `mcp:tools`

---

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| Mic permission denied | PortAudio error on stream open | `GetVoiceStatus` returns error. Skill guides user to System Settings. |
| No audio device | Device enumeration returns empty | Skill tells user to connect mic, offers retry. |
| Model download fails | Checksum mismatch or network error | `DownloadModels` reports per-model errors. Skill retries. |
| Model corrupted | sherpa-onnx throws on load | Delete model file, re-download on next start. |
| STT garbage output | Confidence below 0.5 | Entry flagged `low_quality: true`. Claude uses context to interpret or asks for clarification. |
| Speaker verification drift | N consecutive rejections of VAD-detected speech | `GetVoiceStatus` sets `verification_struggling: true`. Skill suggests re-enrollment. |
| TTS playback fails | PortAudio output error | `SpeakText` returns `{ spoke: false, error }`. Claude falls back to text. |
| MCP server crash | Claude Code detects disconnected server | Auto-restart by Claude Code. Pipeline reinitializes. Queue lost (acceptable). |

**Design principle:** Every failure surfaces through MCP tool return values. Nothing is swallowed silently. Graceful degradation to text-only mode if audio is completely broken.

---

## Testing Strategy

### Unit Tests

Mock sherpa-onnx bindings, test logic:
- `vad.test.ts` — Feed known audio samples, assert speech segment detection
- `queue.test.ts` — Push/pop, overflow, timeout, max depth
- `speaker-verify.test.ts` — Verify enrolled vs unknown embeddings, threshold behavior
- `enrollment.test.ts` — Composite embedding math, passive refinement weighted average
- `config.test.ts` — Threshold validation, mode switching
- `registry.test.ts` — URL format, checksum validation

### Integration Tests

Use real audio fixtures with real sherpa-onnx (requires models):
- `pipeline.test.ts` — Full VAD → verify → STT with recorded audio
- `mcp-tools.test.ts` — Tool call/response schema contracts
- `tts-playback.test.ts` — TTS generates valid audio buffer

### Test Fixtures

- `speech-sample-16k.wav` — Known speech for STT
- `silence-16k.wav` — Silence for VAD negative test
- `noise-16k.wav` — Background noise for VAD/verify rejection
- `enrolled-speaker.bin` — Test voice profile embedding

### Approach

- No live mic tests — all audio input from fixture files via test harness replacing PortAudio capture
- vitest as the runner
- CI caches downloaded models for integration tests

---

## Platform Support

- **v0.1: macOS only**
- Audio capture: PortAudio (cross-platform, but mic permissions are macOS-specific)
- Mic permissions: macOS requires Privacy > Microphone access for terminal apps
- sherpa-onnx-node ships prebuilt binaries for macOS arm64 and x86_64
- Cross-platform (Linux, Windows) designed for but not tested in v0.1

---

## Installation & First-Run

### For Users

1. Add to `~/.claude/settings.json`:
   ```json
   "extraKnownMarketplaces": {
     "jarvis-marketplace": {
       "source": { "source": "directory", "path": "/path/to/jarvis-plugin" }
     }
   },
   "enabledPlugins": {
     "jarvis-voice@jarvis-marketplace": true
   }
   ```
2. Start a new Claude Code session
3. Jarvis skill activates. Claude checks `GetVoiceStatus`.
4. If models missing → Claude announces download, calls `DownloadModels` (~300MB one-time)
5. If no voice profile → Claude runs enrollment (~30 seconds)
6. Ready: "Jarvis online. What are we working on?"

### Plugin Bootstrap

- `npm install` in plugin root installs `sherpa-onnx-node` with prebuilt native binaries
- No system dependencies needed on macOS
- `.mcp.json` points to compiled `dist/mcp/server.js`
- TypeScript compiled via `tsc` to `dist/`

---

## Future Enhancements (Not in v0.1)

- Push-to-talk mode (hotkey-based)
- Wake word mode ("Hey Jarvis")
- Multiple voice profiles (multi-user)
- User-selectable STT models (Tiny/Small/Large)
- User-selectable TTS voices
- Linux and Windows support
- Audio input from non-default devices via config
