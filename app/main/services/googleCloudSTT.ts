import { v2, protos } from '@google-cloud/speech';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { BUILTIN_GOOGLE_STT_KEY } from '@main/config/env';

type RecognizeRequest = protos.google.cloud.speech.v2.IRecognizeRequest;
type RecognizeResponse = protos.google.cloud.speech.v2.IRecognizeResponse;
type SpeechRecognitionResult = protos.google.cloud.speech.v2.ISpeechRecognitionResult;
type SpeechRecognitionAlternative = protos.google.cloud.speech.v2.ISpeechRecognitionAlternative;
type WordInfo = protos.google.cloud.speech.v2.IWordInfo;
type Duration = protos.google.protobuf.IDuration;

export interface GoogleSTTConfig {
  projectId: string;
  location: string;
  recognizerId: string;
  keyFilePath?: string;
  model?: string;
}

export interface GoogleSTTRequestOptions {
  languageCode?: string;
  enableWordTimeOffsets?: boolean;
  enableSpeakerDiarization?: boolean;
  minSpeakerCount?: number;
  maxSpeakerCount?: number;
  mimeType?: string;
}

export interface GoogleSTTTranscriptSegment {
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  speakerTag?: number;
}

export interface GoogleSTTTranscriptionResult {
  transcript: string;
  segments: GoogleSTTTranscriptSegment[];
  rawResponse: RecognizeResponse | null;
}

export class GoogleCloudSTTService {
  private client: v2.SpeechClient | null = null;
  private config: GoogleSTTConfig | null = null;

  async initialize(config: GoogleSTTConfig): Promise<void> {
    const resolvedKeyPath = this.resolveKeyFilePath(config.keyFilePath);

    if (resolvedKeyPath && !fs.existsSync(resolvedKeyPath)) {
      throw new Error(`找不到 Service Account 金鑰檔案：${resolvedKeyPath}`);
    }

    const clientOptions: Record<string, unknown> = {
      apiEndpoint: `${config.location}-speech.googleapis.com`
    };

    if (config.projectId) {
      clientOptions.projectId = config.projectId;
    }
    if (resolvedKeyPath) {
      clientOptions.keyFilename = resolvedKeyPath;
    }

    this.client = new v2.SpeechClient(clientOptions as any);
    this.config = {
      ...config,
      keyFilePath: resolvedKeyPath
    };
  }

  isInitialized(): boolean {
    return !!this.client && !!this.config;
  }

  async transcribeFile(filePath: string, options: GoogleSTTRequestOptions = {}): Promise<GoogleSTTTranscriptionResult> {
    if (!this.client || !this.config) {
      throw new Error('GoogleCloudSTTService has not been initialized');
    }

    const fileContent = await fs.promises.readFile(filePath);
    const content = fileContent.toString('base64');

    const recognizerIdLower = this.config.recognizerId.toLowerCase();
    const modelIdLower = (this.config.model || '').toLowerCase();
    const isChirpRecognizer = recognizerIdLower.includes('chirp') || modelIdLower.includes('chirp');

    const diarizationConfig: protos.google.cloud.speech.v2.ISpeakerDiarizationConfig | undefined =
      options.enableSpeakerDiarization
        ? {
            minSpeakerCount: options.minSpeakerCount ?? 2,
            maxSpeakerCount: options.maxSpeakerCount ?? 6
          }
        : undefined;

    const features: protos.google.cloud.speech.v2.IRecognitionFeatures | undefined = (() => {
      const result: protos.google.cloud.speech.v2.IRecognitionFeatures = {};
      let hasFeature = false;

      if (options.enableWordTimeOffsets) {
        result.enableWordTimeOffsets = true;
        hasFeature = true;
      }

      if (diarizationConfig) {
        result.diarizationConfig = diarizationConfig;
        hasFeature = true;
      }

      return hasFeature ? result : undefined;
    })();

    const recognitionConfig: protos.google.cloud.speech.v2.IRecognitionConfig = {};

    if (!isChirpRecognizer) {
      recognitionConfig.autoDecodingConfig = {};
      if (options.languageCode) {
        recognitionConfig.languageCodes = [options.languageCode];
      }
    }

    if (features) {
      recognitionConfig.features = features;
    }

    const request: RecognizeRequest = {
      recognizer: `projects/${this.config.projectId}/locations/${this.config.location}/recognizers/${this.config.recognizerId}`,
      config: recognitionConfig,
      content
    };

    console.log('[GoogleSTT] Recognize request config', {
      recognizer: request.recognizer,
      isChirpRecognizer,
      hasFeatures: !!features,
      languageCodes: recognitionConfig.languageCodes,
      diarization: !!features?.diarizationConfig,
      enableWordTimeOffsets: !!features?.enableWordTimeOffsets
    });

    const [response] = await this.client.recognize(request);
    if (process.env.NODE_ENV === 'development') {
      console.log('[GoogleSTT] Raw response results summary',
        (response.results || []).map((result, idx) => ({
          index: idx,
          alternatives: result.alternatives?.map(alt => ({
            transcriptLength: alt.transcript?.length ?? 0,
            wordCount: alt.words?.length ?? 0,
            confidence: alt.confidence ?? null
          })),
          channelTag: result.channelTag ?? null,
          resultEndTime: result.resultEndOffset?.seconds ?? null
        }))
      );
    }

    const segments: GoogleSTTTranscriptSegment[] = [];
    const alternatives: string[] = [];

    (response.results ?? []).forEach((result: SpeechRecognitionResult) => {
      (result.alternatives ?? []).forEach((alt: SpeechRecognitionAlternative) => {
        if (alt.transcript) {
          alternatives.push(alt.transcript);
        }
        (alt.words ?? []).forEach((word: WordInfo) => {
          segments.push({
            text: word.word ?? '',
            startTime: word.startOffset ? this.durationToSeconds(word.startOffset) : undefined,
            endTime: word.endOffset ? this.durationToSeconds(word.endOffset) : undefined,
            confidence: word.confidence ?? undefined,
            speakerTag: word.speakerLabel ? Number(word.speakerLabel) : undefined
          });
        });
      });
    });

    return {
      transcript: alternatives.join(' ').trim(),
      segments,
      rawResponse: response ?? null
    };
  }

  private durationToSeconds(duration: Duration): number {
    const seconds = duration.seconds ?? 0;
    const nanos = duration.nanos ?? 0;
    return Number(seconds) + nanos / 1_000_000_000;
  }

  private resolveKeyFilePath(keyFilePath?: string): string | undefined {
    if (!keyFilePath || keyFilePath.trim() === '') {
      return undefined;
    }

    if (keyFilePath === BUILTIN_GOOGLE_STT_KEY) {
      const baseDir = app.isPackaged
        ? path.join(process.resourcesPath, 'credentials')
        : path.resolve(__dirname, '../../resources/credentials');
      return path.join(baseDir, 'google-stt.json');
    }

    if (keyFilePath.startsWith('@builtin/')) {
      const relativePath = keyFilePath.replace('@builtin/', '');
      const baseDir = app.isPackaged
        ? process.resourcesPath
        : path.resolve(__dirname, '../../resources');
      return path.join(baseDir, relativePath);
    }

    return keyFilePath;
  }
}

export const googleCloudSTTService = new GoogleCloudSTTService();
