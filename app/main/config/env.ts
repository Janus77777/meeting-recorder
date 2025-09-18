import { AppSettings } from '@shared/types';

// Default environment configuration
export const DEFAULT_SETTINGS: AppSettings = {
  baseURL: 'https://api.meeting-recorder.com',
  apiKey: '',
  environment: 'dev',
  useMock: false,
  useGemini: true,  // 預設使用Gemini
  geminiApiKey: '',
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
  openRouterApiKey: '',
  openRouterBaseURL: 'https://openrouter.ai/api/v1',
  openRouterModel: 'google/gemma-3n-e4b-it:free',
  openRouterFallbackModels: '',
  openRouterReferer: 'https://github.com/Janus77777/meeting-recorder',
  openRouterTitle: 'Meeting Recorder',
  customTranscriptPrompt: '',
  customSummaryPrompt: '',
  vocabularyList: [],
  recordingSavePath: '~/Downloads' // 預設儲存到下載資料夾
};

// Environment-specific configurations
export const ENV_CONFIGS = {
  dev: {
    baseURL: 'https://dev-api.meeting-recorder.com',
    name: 'Development'
  },
  stg: {
    baseURL: 'https://staging-api.meeting-recorder.com',
    name: 'Staging'
  },
  prod: {
    baseURL: 'https://api.meeting-recorder.com',
    name: 'Production'
  }
};

// NOTE: Settings persistence is now handled by Zustand persist middleware
// using the 'meeting-recorder-settings' key in localStorage

// Get current base URL based on settings
export const getCurrentBaseURL = (settings: AppSettings): string => {
  if (settings.useMock) {
    return 'mock://api';
  }

  if (settings.useGemini === false && settings.openRouterBaseURL) {
    return settings.openRouterBaseURL;
  }
  
  return settings.baseURL || ENV_CONFIGS[settings.environment].baseURL;
};
