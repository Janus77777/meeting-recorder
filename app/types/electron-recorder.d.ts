declare module '@youngerheart/electron-recorder' {
  export interface RecorderResult {
    mic?: MediaStreamTrack;
    desktop?: MediaStreamTrack;
  }

  export function getWindow(electron: any, windowName?: string): Promise<RecorderResult>;
  export function startRecord(callback: (url: string) => void, timeout?: number): void;
  export function endRecord(): void;
}