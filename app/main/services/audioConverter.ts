import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';

export interface ConvertAudioOptions {
  /** 來源音訊檔案路徑 */
  inputPath: string;
  /** 轉換後輸出的資料夾。預設使用系統 temp 目錄 */
  outputDir?: string;
  /** 轉換後檔案名稱（不含副檔名）。預設為隨機 UUID */
  outputBasename?: string;
  /** 取樣率，預設 16000 */
  sampleRate?: number;
}

export interface ConvertAudioResult {
  success: boolean;
  outputPath?: string;
  durationSeconds?: number;
  error?: string;
}

export interface PrepareAudioOptions {
  inputPath: string;
  outputDir?: string;
  outputBasename?: string;
  sampleRate?: number;
}

export interface ExtractSegmentOptions {
  inputPath: string;
  startTime: number;
  endTime?: number;
  outputDir?: string;
  outputBasename?: string;
  sampleRate?: number;
}

export interface ExtractSegmentResult {
  success: boolean;
  outputPath?: string;
  durationSeconds?: number;
  error?: string;
}

/**
 * 專責進行音訊格式轉換的服務。
 * 目前用途：將錄音結果 (WebM/Opus) 轉為 LINEAR16 WAV，供 Google STT 使用。
 */
export class AudioConverterService {
  constructor() {
    this.initializeFfmpeg();
  }

  private initializeFfmpeg(): void {
    if (process.platform === 'win32') {
      try {
        const possiblePaths = [
          path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', 'ffmpeg.exe'),
          path.join(__dirname, '..', '..', '..', 'resources', 'ffmpeg', 'win32-x64', 'ffmpeg.exe'),
          'ffmpeg'
        ];
        const possibleProbePaths = [
          path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', 'ffprobe.exe'),
          path.join(__dirname, '..', '..', '..', 'resources', 'ffmpeg', 'win32-x64', 'ffprobe.exe'),
          'ffprobe'
        ];
        for (const pth of possiblePaths) {
          if (pth !== 'ffmpeg' && fs.existsSync(pth)) {
            ffmpeg.setFfmpegPath(pth);
            break;
          }
          if (pth === 'ffmpeg') {
            try { ffmpeg.setFfmpegPath('ffmpeg'); } catch {}
          }
        }
        for (const pth of possibleProbePaths) {
          if (pth !== 'ffprobe' && fs.existsSync(pth)) {
            (ffmpeg as any).setFfprobePath?.(pth);
            break;
          }
          if (pth === 'ffprobe') {
            try { (ffmpeg as any).setFfprobePath?.('ffprobe'); } catch {}
          }
        }
      } catch (e) {
        console.warn('FFmpeg 路徑初始化失敗（Windows）:', e);
      }
    }
  }

  async convertToLinear16Wav(options: ConvertAudioOptions): Promise<ConvertAudioResult> {
    const { inputPath } = options;
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    const sampleRate = options.sampleRate ?? 16_000;
    const outputDir = options.outputDir ?? this.getDefaultOutputDir();
    const basename = options.outputBasename ?? randomUUID();
    const outputPath = path.join(outputDir, `${basename}.wav`);

    await fs.promises.mkdir(outputDir, { recursive: true });

    return new Promise<ConvertAudioResult>((resolve) => {
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(sampleRate)
        .format('wav')
        .on('end', async () => {
          try {
            const duration = await this.getDurationSeconds(outputPath);
            resolve({ success: true, outputPath, durationSeconds: duration });
          } catch (error) {
            resolve({
              success: true,
              outputPath,
              error: error instanceof Error ? error.message : 'Failed to read duration'
            });
          }
        })
        .on('error', (error) => {
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Audio conversion failed'
          });
        })
        .save(outputPath);
    });
  }

  async prepareLinear16Wav(options: PrepareAudioOptions): Promise<ConvertAudioResult> {
    const outputDir = options.outputDir ?? this.getDefaultOutputDir();
    const basename = options.outputBasename ?? randomUUID();
    const targetPath = path.join(outputDir, `${basename}.wav`);
    await fs.promises.mkdir(outputDir, { recursive: true });

    if (options.inputPath === targetPath) {
      return { success: true, outputPath: targetPath };
    }

    return this.convertToLinear16Wav({
      inputPath: options.inputPath,
      outputDir,
      outputBasename: basename,
      sampleRate: options.sampleRate
    });
  }

  async extractLinear16Segment(options: ExtractSegmentOptions): Promise<ExtractSegmentResult> {
    const { inputPath, startTime } = options;
    if (!fs.existsSync(inputPath)) {
      return { success: false, error: `Input file not found: ${inputPath}` };
    }

    const sampleRate = options.sampleRate ?? 16_000;
    const outputDir = options.outputDir ?? this.getDefaultOutputDir();
    const basename = options.outputBasename ?? `${randomUUID()}-segment`;
    const outputPath = path.join(outputDir, `${basename}.wav`);

    await fs.promises.mkdir(outputDir, { recursive: true });

    const duration = options.endTime !== undefined ? Math.max(options.endTime - startTime, 0) : undefined;

    return new Promise<ExtractSegmentResult>((resolve) => {
      let command = ffmpeg(inputPath)
        .seekInput(Math.max(startTime, 0))
        .audioCodec('pcm_s16le')
        .audioChannels(1)
        .audioFrequency(sampleRate)
        .format('wav');

      if (duration !== undefined && Number.isFinite(duration) && duration > 0) {
        command = command.duration(duration);
      }

      command
        .on('end', async () => {
          try {
            const segmentDuration = await this.getDurationSeconds(outputPath);
            resolve({ success: true, outputPath, durationSeconds: segmentDuration });
          } catch (error) {
            resolve({
              success: true,
              outputPath,
              error: error instanceof Error ? error.message : 'Failed to read segment duration'
            });
          }
        })
        .on('error', (error) => {
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Audio segment extraction failed'
          });
        })
        .save(outputPath);
    });
  }

  private getDefaultOutputDir(): string {
    const tempDir = path.join(app.getPath('temp'), 'meeting-recorder', 'stt-temp');
    return tempDir;
  }

  private getDurationSeconds(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (error, metadata) => {
        if (error) {
          reject(error);
          return;
        }
        // 主要來源：format.duration；後備：streams 的 duration 或 nb_frames/sample_rate 換算
        let duration = Number(metadata.format?.duration ?? 0);
        if (!Number.isFinite(duration) || duration <= 0) {
          const streams: any[] = Array.isArray((metadata as any).streams) ? (metadata as any).streams : [];
          for (const s of streams) {
            const d1 = Number(s.duration ?? 0);
            if (Number.isFinite(d1) && d1 > 0) { duration = Math.max(duration, d1); }
            const nbFrames = Number(s.nb_frames ?? 0);
            const r = Number(s.sample_rate ?? s.sampleRate ?? 0);
            if (Number.isFinite(nbFrames) && nbFrames > 0 && Number.isFinite(r) && r > 0) {
              const d2 = nbFrames / r;
              if (Number.isFinite(d2) && d2 > 0) duration = Math.max(duration, d2);
            }
          }
        }
        resolve(duration);
      });
    });
  }
}

export const audioConverterService = new AudioConverterService();
