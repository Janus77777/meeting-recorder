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
    enabled: true,
    projectId: 'integral-server-472807-a5',
    location: 'us',
    recognizerId: '_',
    keyFilePath: BUILTIN_GOOGLE_STT_KEY,
    languageCode: 'cmn-Hans-CN',
    model: 'chirp_3',
    // 新預設：使用 chirp_3 + 簡中，開啟 Diarization 與 Word Offsets
    enableSpeakerDiarization: true,
    enableWordTimeOffsets: true,
    minSpeakerCount: 1,
    maxSpeakerCount: 6
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
  customTranscriptCleanupPrompt: '',
  customSummaryPrompt: '',
  vocabularyList: [],
  recordingSavePath: '~/Downloads' // 預設儲存到下載資料夾
};
