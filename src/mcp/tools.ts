export interface ToolContext {
  getStatus(): Record<string, unknown>;
  listenForResponse(timeoutMs: number): Promise<Record<string, unknown>>;
  speakText(text: string, expectResponse?: boolean): Promise<Record<string, unknown>>;
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

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'ListenForResponse',
    description:
      'Listen for user speech and return the transcribed text. Blocks until speech is detected or timeout expires.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout_ms: {
          type: 'number',
          description: 'Maximum time to wait for speech in milliseconds. Defaults to 30000.',
        },
      },
    },
  },
  {
    name: 'SpeakText',
    description: 'Synthesize and play text-to-speech audio through the speaker. Use expect_response when asking the user a question so the next ListenForResponse accepts any speech without requiring the wake word.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The text to speak aloud.',
        },
        expect_response: {
          type: 'boolean',
          description: 'Set to true when asking the user a question. Switches to active listening mode so the user can respond without saying the wake word.',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'GetVoiceStatus',
    description:
      'Get the current status of the voice pipeline including mode, VAD activity, speaker profile state, and queue depth.',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'StartEnrollment',
    description:
      'Start a speaker enrollment session. The user will be prompted to read several phrases to build a voice profile.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Optional session ID to resume an existing enrollment session.',
        },
      },
    },
  },
  {
    name: 'TestEnrollment',
    description:
      'Test the current enrollment session by verifying the composite embedding against a new speech sample.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The enrollment session ID to test.',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'SaveProfile',
    description:
      'Save the enrollment session composite embedding as the active speaker profile.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'The enrollment session ID whose profile to save.',
        },
      },
      required: ['session_id'],
    },
  },
  {
    name: 'ResetProfile',
    description:
      'Delete the current speaker profile, disabling speaker verification.',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'SetMode',
    description: 'Change the voice capture mode.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['vad', 'push-to-talk', 'wake-word'],
          description: 'The capture mode to activate.',
        },
      },
      required: ['mode'],
    },
  },
  {
    name: 'SetThreshold',
    description: 'Adjust a pipeline threshold parameter at runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        parameter: {
          type: 'string',
          enum: ['vad_sensitivity', 'speaker_confidence'],
          description: 'The parameter to adjust.',
        },
        value: {
          type: 'number',
          description: 'The new threshold value (0-1).',
        },
      },
      required: ['parameter', 'value'],
    },
  },
  {
    name: 'DownloadModels',
    description:
      'Download any missing ML models required by the voice pipeline.',
    inputSchema: {
      type: 'object',
    },
  },
  {
    name: 'GetDebugLog',
    description:
      'Retrieve recent log entries from the ring buffer for debugging.',
    inputSchema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent log entries to return.',
        },
        level: {
          type: 'string',
          description: 'Minimum log level filter (DEBUG, INFO, WARN, ERROR).',
        },
        scope: {
          type: 'string',
          description: 'Filter entries by scope name.',
        },
      },
    },
  },
  {
    name: 'GetSessionStats',
    description:
      'Get aggregate statistics for the current session including utterance counts, verification rates, and latency.',
    inputSchema: {
      type: 'object',
    },
  },
];

export type ToolHandlers = Record<
  string,
  (params: Record<string, unknown>) => Promise<Record<string, unknown>>
>;

export function createToolHandlers(ctx: ToolContext): ToolHandlers {
  return {
    async ListenForResponse(params) {
      const timeoutMs =
        typeof params.timeout_ms === 'number' ? params.timeout_ms : 30_000;
      return ctx.listenForResponse(timeoutMs);
    },

    async SpeakText(params) {
      if (typeof params.text !== 'string') {
        throw new Error('Missing required parameter: text');
      }
      const expectResponse = params.expect_response === true;
      return ctx.speakText(params.text, expectResponse);
    },

    async GetVoiceStatus() {
      return ctx.getStatus();
    },

    async StartEnrollment(params) {
      const sessionId =
        typeof params.session_id === 'string' ? params.session_id : undefined;
      return ctx.startEnrollment(sessionId);
    },

    async TestEnrollment(params) {
      if (typeof params.session_id !== 'string') {
        throw new Error('Missing required parameter: session_id');
      }
      return ctx.testEnrollment(params.session_id);
    },

    async SaveProfile(params) {
      if (typeof params.session_id !== 'string') {
        throw new Error('Missing required parameter: session_id');
      }
      return ctx.saveProfile(params.session_id);
    },

    async ResetProfile() {
      return ctx.resetProfile();
    },

    async SetMode(params) {
      if (typeof params.mode !== 'string') {
        throw new Error('Missing required parameter: mode');
      }
      return ctx.setMode(params.mode);
    },

    async SetThreshold(params) {
      if (typeof params.parameter !== 'string') {
        throw new Error('Missing required parameter: parameter');
      }
      if (typeof params.value !== 'number') {
        throw new Error('Missing required parameter: value');
      }
      return ctx.setThreshold(params.parameter, params.value);
    },

    async DownloadModels() {
      return ctx.downloadModels();
    },

    async GetDebugLog(params) {
      const filter: Record<string, unknown> = {};
      if (typeof params.count === 'number') filter.count = params.count;
      if (typeof params.level === 'string') filter.level = params.level;
      if (typeof params.scope === 'string') filter.scope = params.scope;
      return ctx.getDebugLog(Object.keys(filter).length > 0 ? filter : undefined);
    },

    async GetSessionStats() {
      return ctx.getSessionStats();
    },
  };
}
