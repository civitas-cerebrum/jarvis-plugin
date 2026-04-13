declare module 'sherpa-onnx-node' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class Vad {
    constructor(config: any);
    acceptWaveform(samples: Float32Array): void;
    isEmpty(): boolean;
    isDetected(): boolean;
    front(): { samples: Float32Array; start: number };
    pop(): void;
    reset(): void;
    flush(): void;
    free(): void;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class OnlineRecognizer {
    constructor(config: any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createStream(): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    decode(stream: any): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getResult(stream: any): { text?: string };
    free(): void;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class OfflineTts {
    constructor(config: any);
    generate(options: { text: string; sid: number; speed: number }): {
      samples: Float32Array;
      sampleRate: number;
    };
    free(): void;
  }

  export class SpeakerEmbeddingExtractor {
    constructor(config: { model: string; numThreads?: number; debug?: boolean });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createStream(): any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    compute(stream: any): Float32Array;
    readonly dim: number;
    free?(): void;
  }

  export class SpeakerEmbeddingManager {
    constructor(dim: number);
    addMulti(options: { name: string; v: Float32Array[] }): boolean;
    search(options: { v: Float32Array; threshold: number }): string;
    verify(options: { name: string; v: Float32Array; threshold: number }): boolean;
  }

  export function readWave(path: string): { samples: Float32Array; sampleRate: number };
}
