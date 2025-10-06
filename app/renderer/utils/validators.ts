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

  // Only validate Gemini settings now
  if (settings.geminiApiKey && settings.geminiApiKey.trim() && !isValidAPIKey(settings.geminiApiKey.trim())) {
    errors.geminiApiKey = 'Gemini API Key 格式不正確（8-256 字元，不含空格）';
  }

  const transcriptionMode = settings.transcriptionMode ?? 'gemini_direct';

  if (transcriptionMode === 'hybrid_stt') {
    const stt = settings.googleCloudSTT ?? {};

    if (!stt.projectId || !stt.projectId.trim()) {
      errors['googleCloudSTT.projectId'] = '請輸入 Google Cloud Project ID';
    }

    if (!stt.location || !stt.location.trim()) {
      errors['googleCloudSTT.location'] = '請輸入 Location，例如 global 或 us-west1';
    }

    if (!stt.recognizerId || !stt.recognizerId.trim()) {
      errors['googleCloudSTT.recognizerId'] = '請輸入 Recognizer ID';
    }

    if (!stt.keyFilePath || !stt.keyFilePath.trim()) {
      errors['googleCloudSTT.keyFilePath'] = '請指定 Service Account Key 檔案路徑';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// File validation (Audio and Video)
export const validateMediaFile = (file: File): ValidationResult => {
  const errors: Record<string, string> = {};

  const allowedTypes = [
    // Audio formats
    'audio/webm',
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/ogg',
    'audio/mp4',
    'audio/mp4a-latm',
    'audio/x-wav',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
    // Video formats
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/avi',
    'video/mov'
  ];

  const normalizeMime = (value?: string) => {
    const base = value?.split(';')[0]?.trim().toLowerCase() ?? '';
    switch (base) {
      case 'audio/mp4a-latm':
      case 'audio/x-m4a':
        return 'audio/m4a';
      default:
        return base;
    }
  };

  const resolveMimeFromExtension = (filename: string): string | undefined => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'm4a':
      case 'mp4a':
        return 'audio/m4a';
      case 'aac':
        return 'audio/aac';
      case 'flac':
        return 'audio/flac';
      case 'ogg':
        return 'audio/ogg';
      case 'opus':
        return 'audio/opus';
      case 'webm':
        return 'audio/webm';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/avi';
      default:
        return undefined;
    }
  };

  let detectedType = normalizeMime(file.type);
  if (!detectedType && file.name) {
    detectedType = resolveMimeFromExtension(file.name) ?? '';
  }

  if (!detectedType || !allowedTypes.includes(detectedType)) {
    errors.type = '不支援的檔案格式。支援格式：MP4, WebM, WAV, MP3, M4A, MOV, AVI 等音訊/影片檔案';
  }

  const effectiveType = detectedType || file.type;

  // Check file size (max 500MB for MVP)
  const maxSize = 500 * 1024 * 1024; // 500MB
  if (file.size > maxSize) {
    errors.size = '檔案大小超過限制（最大 500MB）';
  }

  // Check minimum file size (at least 1KB)
  if (file.size < 1024) {
    errors.size = '檔案太小，可能不是有效的媒體檔案';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Backward compatibility alias
export const validateAudioFile = validateMediaFile;

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
export const checkAPIHealth = async (settings: AppSettings): Promise<boolean> => {
  try {
    // Only check Gemini API health now
    if (!settings.geminiApiKey || !settings.geminiApiKey.trim()) {
      return false;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(settings.geminiApiKey.trim())}`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });

    return response.ok;
  } catch {
    return false;
  }
};
