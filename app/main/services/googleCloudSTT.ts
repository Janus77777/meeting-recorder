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
    const isChirp3Model = recognizerIdLower.includes('chirp_3') || modelIdLower.includes('chirp_3');

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

      if (options.enableWordTimeOffsets && !isChirp3Model) {
        // chirp_3 目前不支援 word timestamps，避免 INVALID_ARGUMENT 錯誤
        result.enableWordTimeOffsets = true;
        hasFeature = true;
      }

      if (diarizationConfig) {
        result.diarizationConfig = diarizationConfig;
        hasFeature = true;
      }

      // 既定開啟：自動標點
      try {
        (result as any).enableAutomaticPunctuation = true;
        hasFeature = true;
      } catch {}

      // 注意：Diarization 僅支援單聲道；若開啟 diarization，禁止多聲道分離
      if (!diarizationConfig) {
        try {
          (result as any).multiChannelMode = (protos.google.cloud.speech.v2 as any).RecognitionFeatures.MultiChannelMode.SEPARATE_RECOGNITION_PER_CHANNEL;
          hasFeature = true;
        } catch {}
      }

      return hasFeature ? result : undefined;
    })();

    const recognitionConfig: protos.google.cloud.speech.v2.IRecognitionConfig = {};

    // 對 chirp_3 也允許帶入語言代碼（例如 cmn-Hans-CN）
    recognitionConfig.autoDecodingConfig = {};
    if (options.languageCode) {
      recognitionConfig.languageCodes = [options.languageCode];
    }

    if (features) {
      recognitionConfig.features = features;
    }

    // 明確指定模型，避免使用 recognizer 預設模型導致不支援的欄位組合（例如 latest_long + diarization）
    if (this.config?.model) {
      recognitionConfig.model = this.config.model;
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

    let response: RecognizeResponse;
    try {
      const [res] = await this.client.recognize(request);
      response = res;
    } catch (err: any) {
      const msg = (err && err.message) ? String(err.message) : '';
      const code = (err && (err.code !== undefined)) ? Number(err.code) : undefined;
      const recognizerNotFound = msg.includes('Unable to find Recognizer') || msg.includes('NOT_FOUND');
      const noWordTsSupported = msg.toLowerCase().includes('does not currently support word timestamps');
      if (recognizerNotFound || code === 5) {
        // 自動後備：若指定的 recognizer 不存在，改用預設 '_' 再嘗試一次
        const fallback: RecognizeRequest = {
          ...request,
          recognizer: `projects/${this.config.projectId}/locations/${this.config.location}/recognizers/_`
        };
        console.warn('[GoogleSTT] 指定的 recognizer 不存在，改用預設 _ 重試一次:', {
          original: request.recognizer,
          fallback: fallback.recognizer
        });
        const [res2] = await this.client.recognize(fallback);
        response = res2;
      } else if (noWordTsSupported || (code === 3 && /word\s+timestamps/i.test(msg))) {
        // 後備：關閉 word offsets 後重試
        const featuresFallback = { ...(recognitionConfig.features || {}) } as any;
        if (featuresFallback && 'enableWordTimeOffsets' in featuresFallback) {
          delete featuresFallback.enableWordTimeOffsets;
        }
        const request2: RecognizeRequest = {
          ...request,
          config: { ...recognitionConfig, features: featuresFallback }
        };
        console.warn('[GoogleSTT] 此模型不支援 word timestamps，已關閉 offsets 重試。');
        const [res3] = await this.client.recognize(request2);
        response = res3;
      } else {
        throw err;
      }
    }
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
