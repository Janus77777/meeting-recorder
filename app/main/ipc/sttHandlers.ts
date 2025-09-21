import { ipcMain, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { audioConverterService } from '../services/audioConverter';
import { googleCloudSTTService } from '../services/googleCloudSTT';
import {
  STTInitializeRequest,
  STTPrepareAudioRequest,
  STTPrepareAudioResponse,
  STTProgressEvent,
  STTStatusResponse,
  STTTranscriptionRequest,
  STTTranscriptionResponse
} from '@shared/types';

function emitProgress(webContents: WebContents, payload: STTProgressEvent) {
  webContents.send('stt:progress', payload);
}

export function setupSTTIPC(): void {
  ipcMain.handle('stt:initialize', async (_event, payload: STTInitializeRequest) => {
    try {
      await googleCloudSTTService.initialize(payload);
      const status: STTStatusResponse = {
        initialized: true,
        projectId: payload.projectId,
        location: payload.location,
        recognizerId: payload.recognizerId,
        model: payload.model
      };
      return { success: true, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize Google STT';
      return { success: false, error: message };
    }
  });

  ipcMain.handle('stt:getStatus', async () => {
    const initialized = googleCloudSTTService.isInitialized();
    const status: STTStatusResponse = {
      initialized
    };
    return status;
  });

  ipcMain.handle('stt:prepareAudio', async (_event, payload: STTPrepareAudioRequest): Promise<STTPrepareAudioResponse> => {
    try {
      const baseDir = path.dirname(payload.sourcePath);
      const baseName = path.parse(payload.sourcePath).name;
      const result = await audioConverterService.prepareLinear16Wav({
        inputPath: payload.sourcePath,
        sampleRate: payload.sampleRate,
        outputDir: baseDir,
        outputBasename: `${baseName}-linear16`
      });
      if (!result.success || !result.outputPath) {
        return { success: false, error: result.error ?? 'Audio preparation failed' };
      }

      return {
        success: true,
        wavPath: result.outputPath,
        durationSeconds: result.durationSeconds
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Audio preparation failed'
      };
    }
  });

  ipcMain.handle('stt:transcribe', async (event, payload: STTTranscriptionRequest): Promise<STTTranscriptionResponse> => {
    const webContents = event.sender;
    let workingPath: string | undefined;
    let segmentPathToCleanup: string | undefined;

    try {
      if (!googleCloudSTTService.isInitialized()) {
        throw new Error('Google STT service is not initialized');
      }

      emitProgress(webContents, {
        stage: 'uploading',
        progress: 10,
        message: '正在轉換音訊格式...'
      });

      if (payload.sourcePath) {
        const startTime = payload.startTimeSeconds ?? 0;
        const segmentResult = await audioConverterService.extractLinear16Segment({
          inputPath: payload.sourcePath,
          startTime,
          endTime: payload.endTimeSeconds,
          sampleRate: 16_000
        });
        if (!segmentResult.success || !segmentResult.outputPath) {
          throw new Error(segmentResult.error ?? 'Audio segment extraction failed');
        }
        workingPath = segmentResult.outputPath;
        segmentPathToCleanup = segmentResult.outputPath;
      } else if (payload.filePath) {
        const convertResult = await audioConverterService.convertToLinear16Wav({ inputPath: payload.filePath });
        if (!convertResult.success || !convertResult.outputPath) {
          throw new Error(convertResult.error ?? 'Audio conversion failed');
        }
        workingPath = convertResult.outputPath;
      } else {
        throw new Error('Missing audio input path for transcription');
      }

      emitProgress(webContents, {
        stage: 'processing',
        progress: 40,
        message: '呼叫 Google STT 服務...'
      });

      const transcription = await googleCloudSTTService.transcribeFile(workingPath, {
        languageCode: payload.languageCode,
        enableWordTimeOffsets: payload.enableWordTimeOffsets,
        enableSpeakerDiarization: payload.enableSpeakerDiarization,
        minSpeakerCount: payload.minSpeakerCount,
        maxSpeakerCount: payload.maxSpeakerCount,
        mimeType: payload.mimeType
      });

      emitProgress(webContents, {
        stage: 'completed',
        progress: 100,
        message: '轉錄完成'
      });

      return {
        success: true,
        transcript: transcription.transcript,
        segments: transcription.segments,
        rawResponse: transcription.rawResponse ?? undefined
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google STT transcription failed';
      emitProgress(webContents, {
        stage: 'failed',
        progress: 100,
        message
      });

      return {
        success: false,
        error: message
      };
    } finally {
      if (segmentPathToCleanup) {
        fs.promises.unlink(segmentPathToCleanup).catch(() => void 0);
      }
    }
  });
}
