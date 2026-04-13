declare module 'sherpa-onnx' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createVad(config: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createOnlineRecognizer(config: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export function createOfflineTts(config: any): any;
  export function createCircularBuffer(capacity: number): any;
  export function readWave(path: string): { samples: Float32Array; sampleRate: number };
}
