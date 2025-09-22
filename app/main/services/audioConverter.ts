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
      console.log(`🔧 正在初始化 FFmpeg... process.resourcesPath: ${process.resourcesPath}`);

      // 在 Windows 上，優先使用打包的 ffmpeg
      const possiblePaths = [
        path.join(process.resourcesPath, 'ffmpeg', 'win32-x64', 'ffmpeg.exe'), // 打包後的路徑
        path.join(__dirname, '..', '..', '..', 'resources', 'ffmpeg', 'win32-x64', 'ffmpeg.exe'), // 開發時路徑
        'ffmpeg', // 系統 PATH 中的 ffmpeg（備用）
      ];

      console.log('🔍 檢查 FFmpeg 路徑:');
      for (const ffmpegPath of possiblePaths) {
        console.log(`  - 嘗試路徑: ${ffmpegPath}`);
        try {
          if (fs.existsSync(ffmpegPath)) {
            console.log(`  ✅ 路徑存在: ${ffmpegPath}`);
            ffmpeg.setFfmpegPath(ffmpegPath);
            console.log(`🎯 FFmpeg 路徑設定為: ${ffmpegPath}`);
            return;
          } else if (ffmpegPath === 'ffmpeg') {
            console.log(`  ⚠️ 無法檢查系統 PATH，嘗試設定: ${ffmpegPath}`);
            // 對於系統 PATH 中的 ffmpeg，我們無法直接檢查存在性，但可以嘗試設定
            try {
              ffmpeg.setFfmpegPath(ffmpegPath);
              console.log(`🎯 FFmpeg 路徑設定為系統 PATH: ${ffmpegPath}`);
              return;
            } catch (error) {
              console.log(`  ❌ 系統 PATH 中沒有找到 FFmpeg`);
            }
          } else {
            console.log(`  ❌ 路徑不存在: ${ffmpegPath}`);
          }
        } catch (error) {
          console.log(`  ❌ 無法設定 FFmpeg 路徑: ${ffmpegPath} - ${error}`);
        }
      }

      console.warn('⚠️ 在 Windows 上找不到 FFmpeg，音訊轉換功能將無法使用');
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
      try {
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
            // 在 Windows 上，如果 ffmpeg 不存在，提供更好的錯誤訊息
            if (process.platform === 'win32' && error.message.includes('Cannot find ffmpeg')) {
              resolve({
                success: false,
                error: 'FFmpeg 未安裝或未找到。請確保 FFmpeg 已安裝在系統 PATH 中，或聯繫開發者獲取支援。'
              });
            } else {
              resolve({
                success: false,
                error: error instanceof Error ? error.message : 'Audio conversion failed'
              });
            }
          })
          .save(outputPath);
      } catch (error) {
        if (process.platform === 'win32' && error instanceof Error && error.message.includes('ffmpeg')) {
          resolve({
            success: false,
            error: 'FFmpeg 未安裝或未找到。請確保 FFmpeg 已安裝在系統 PATH 中，或聯繫開發者獲取支援。'
          });
        } else {
          resolve({
            success: false,
            error: error instanceof Error ? error.message : 'Audio conversion initialization failed'
          });
        }
      }
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
        const duration = metadata.format?.duration ?? 0;
        resolve(duration);
      });
    });
  }
}

export const audioConverterService = new AudioConverterService();
