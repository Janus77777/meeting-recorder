import { AppSettings } from '@shared/types';

// Default environment configuration
export const DEFAULT_SETTINGS: AppSettings = {
  baseURL: 'https://api.meeting-recorder.com',
  apiKey: '',
  environment: 'dev',
  useMock: false,
  useGemini: true,  // 預設使用Gemini
  geminiApiKey: '',
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

// Load settings from localStorage or default
export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem('app-settings');
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<AppSettings>;
      return {
        ...DEFAULT_SETTINGS,
        ...parsed
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  
  return DEFAULT_SETTINGS;
};

// Save settings to localStorage
export const saveSettings = (settings: AppSettings): void => {
  try {
    localStorage.setItem('app-settings', JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
};

// Get current base URL based on settings
export const getCurrentBaseURL = (settings: AppSettings): string => {
  if (settings.useMock) {
    return 'mock://api';
  }
  
  return settings.baseURL || ENV_CONFIGS[settings.environment].baseURL;
};