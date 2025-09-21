import { AppSettings } from '@shared/types';

export const BUILTIN_GOOGLE_STT_KEY = '@builtin/google-stt.json';

// Default environment configuration
export const DEFAULT_SETTINGS: AppSettings = {
  baseURL: 'https://api.meeting-recorder.com',
  apiKey: '',
  environment: 'prod',
  useGemini: true,  // 預設使用Gemini
  geminiApiKey: '',
  transcriptionMode: 'gemini_direct',
  googleCloudSTT: {
    enabled: false,
    projectId: 'integral-server-472807-a5',
    location: 'asia-southeast1',
    recognizerId: 'eletron',
    keyFilePath: BUILTIN_GOOGLE_STT_KEY,
    languageCode: 'cmn-Hant-TW',
    model: 'latest_long',
    enableSpeakerDiarization: true,
    minSpeakerCount: 1,
    maxSpeakerCount: 10
  },
  // Gemini 進階設定 - 預設值
  geminiPreferredModel: 'gemini-2.5-pro',
  geminiEnableFallback: true,
  geminiRetryConfig: {
    maxRetries: 5,
    baseDelay: 30000,
    enableJitter: true
  },
  geminiDiagnosticMode: false,
  geminiHealthCheckEnabled: true,
  customTranscriptPrompt: '',
  customSummaryPrompt: '',
  vocabularyList: [],
  recordingSavePath: '~/Downloads' // 預設儲存到下載資料夾
};
