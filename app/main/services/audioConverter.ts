import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStaticPath from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';

const resolveBundledBinary = (candidate?: string | null, fallbackModule?: 'ffmpeg-static' | 'ffprobe-static'): string | undefined => {
  if (!candidate) {
    return undefined;
  }

  const asarAdjusted = candidate.replace(/app\.asar(?!\.unpacked)/g, 'app.asar.unpacked');
  if (fs.existsSync(asarAdjusted)) {
    return asarAdjusted;
  }

  if (app.isPackaged && fallbackModule) {
    const binaryName = path.basename(candidate);
    const moduleDir = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', fallbackModule);
    const directCandidate = path.join(moduleDir, binaryName);
    if (fs.existsSync(directCandidate)) {
      return directCandidate;
    }

    // ffprobe-static 將檔案放在 bin/<platform>/<arch>
    const binCandidate = path.join(moduleDir, 'bin', process.platform, process.arch, binaryName);
    if (fs.existsSync(binCandidate)) {
      return binCandidate;
    }
  }

  return fs.existsSync(candidate) ? candidate : undefined;
};

const resolvedFfmpegPath = resolveBundledBinary(ffmpegStaticPath, 'ffmpeg-static');
if (resolvedFfmpegPath) {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
}

const resolvedFfprobePath = resolveBundledBinary((ffprobe as { path?: string })?.path, 'ffprobe-static');
if (resolvedFfprobePath) {
  ffmpeg.setFfprobePath(resolvedFfprobePath);
}

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
        const duration = metadata.format?.duration ?? 0;
        resolve(duration);
      });
    });
  }
}

export const audioConverterService = new AudioConverterService();
