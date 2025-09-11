import { AppSettings } from '@shared/types';

// URL validation
export const isValidURL = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// API endpoint validation
export const isValidAPIEndpoint = (url: string): boolean => {
  if (!isValidURL(url)) return false;
  
  const parsed = new URL(url);
  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
};

// API key validation (basic format check)
export const isValidAPIKey = (key: string): boolean => {
  // Basic validation: non-empty, reasonable length, no spaces
  return key.length >= 8 && key.length <= 256 && !/\s/.test(key);
};

// Email validation
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Phone validation (Taiwan format)
export const isValidPhone = (phone: string): boolean => {
  const phoneRegex = /^(\+886|0)?[0-9]{8,10}$/;
  return phoneRegex.test(phone.replace(/[-\s]/g, ''));
};

// Settings validation
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export const validateSettings = (settings: AppSettings): ValidationResult => {
  const errors: Record<string, string> = {};

  // Validate base URL
  if (!settings.baseURL.trim()) {
    errors.baseURL = 'API 基礎網址不能為空';
  } else if (!isValidAPIEndpoint(settings.baseURL)) {
    errors.baseURL = 'API 基礎網址格式不正確';
  }

  // Validate API key (only if not using mock)
  if (!settings.useMock) {
    if (!settings.apiKey.trim()) {
      errors.apiKey = 'API 金鑰不能為空';
    } else if (!isValidAPIKey(settings.apiKey)) {
      errors.apiKey = 'API 金鑰格式不正確（8-256 字元，不含空格）';
    }
  }

  // Validate environment
  if (!['dev', 'stg', 'prod'].includes(settings.environment)) {
    errors.environment = '無效的環境設定';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// File validation
export const validateAudioFile = (file: File): ValidationResult => {
  const errors: Record<string, string> = {};

  // Check file type
  const allowedTypes = [
    'audio/webm',
    'audio/wav', 
    'audio/mp3',
    'audio/mpeg',
    'audio/ogg',
    'audio/mp4',
    'audio/x-wav'
  ];

  if (!allowedTypes.includes(file.type)) {
    errors.type = '不支援的音檔格式。支援格式：WebM, WAV, MP3, OGG';
  }

  // Check file size (max 500MB for MVP)
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    errors.size = '檔案大小超過限制（最大 500MB）';
  }

  // Check minimum file size (at least 1KB)
  if (file.size < 1024) {
    errors.size = '檔案太小，可能不是有效的音檔';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Meeting data validation
export const validateMeetingData = (title: string, participants: string[]): ValidationResult => {
  const errors: Record<string, string> = {};

  // Validate title
  if (!title || title.trim().length === 0) {
    errors.title = '會議標題不能為空';
  } else if (title.trim().length > 100) {
    errors.title = '會議標題不能超過 100 字元';
  } else if (title.trim().length < 2) {
    errors.title = '會議標題至少需要 2 個字元';
  }

  // Validate participants
  if (!participants || participants.length === 0) {
    errors.participants = '至少需要一位參與者';
  } else if (participants.length > 20) {
    errors.participants = '參與者數量不能超過 20 人';
  } else {
    // Check individual participant names
    const invalidParticipants = participants.filter(p => 
      !p || p.trim().length === 0 || p.trim().length > 50
    );
    
    if (invalidParticipants.length > 0) {
      errors.participants = '參與者姓名不能為空且不能超過 50 字元';
    }

    // Check for duplicates
    const uniqueParticipants = new Set(participants.map(p => p.trim().toLowerCase()));
    if (uniqueParticipants.size !== participants.length) {
      errors.participants = '參與者姓名不能重複';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Device validation
export const validateRecordingDevice = (deviceId: string | null): ValidationResult => {
  const errors: Record<string, string> = {};

  if (!deviceId) {
    errors.device = '請選擇錄音設備';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Recording duration validation
export const validateRecordingDuration = (duration: number): ValidationResult => {
  const errors: Record<string, string> = {};

  // Minimum 3 seconds
  if (duration < 3) {
    errors.duration = '錄音時間至少需要 3 秒';
  }

  // Maximum 4 hours (for MVP)
  const maxDuration = 4 * 60 * 60; // 4 hours in seconds
  if (duration > maxDuration) {
    errors.duration = '錄音時間不能超過 4 小時';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Network connectivity check
export const checkNetworkConnectivity = async (): Promise<boolean> => {
  try {
    // Simple connectivity test
    const response = await fetch('https://www.google.com/generate_204', {
      method: 'GET',
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000)
    });
    return true;
  } catch {
    return false;
  }
};

// API endpoint health check
export const checkAPIHealth = async (baseURL: string, apiKey?: string): Promise<boolean> => {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    // Try to ping a common health endpoint
    const response = await fetch(`${baseURL}/health`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000)
    });

    return response.status < 500; // Accept 4xx as "reachable but unauthorized"
  } catch {
    return false;
  }
};