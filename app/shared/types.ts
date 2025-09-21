// API Request/Response Types
export interface CreateMeetingRequest {
  title: string;
  participants: string[];
  options?: {
    language?: string;
    webhookEnabled?: boolean;
  };
}

export interface CreateMeetingResponse {
  id: string;
  createdAt: string;
}

export interface UploadAudioResponse {
  ok: boolean;
}

export interface CompleteResponse {
  status: 'queued';
}

export type MeetingStatus = 'queued' | 'stt' | 'summarize' | 'done' | 'failed';

export interface StatusResponse {
  status: MeetingStatus;
  progress?: number;
  errorCode?: string;
}

export interface TranscriptSegment {
  start: number | string;  // Support both seconds (number) and MM:SS format (string)
  end: number | string;    // Support both seconds (number) and MM:SS format (string)
  speaker: string;
  text: string;
}

export interface MeetingSummary {
  minutesMd: string;
  highlights: string[];
  timeline: Array<{
    item: string;
    date?: string;
    owner?: string;
  }>;
  todos: Array<{
    owner?: string;
    task: string;
    due?: string;
  }>;
  by_speaker: Array<{
    speaker: string;
    items: string[];
  }>;
}

export interface ResultResponse {
  transcript: {
    segments: TranscriptSegment[];
    fullText?: string;
  };
  summary: MeetingSummary;
  meta: {
    title: string;
    participants: string[];
    createdAt: string;
  };
  quality?: {
    wer: number;
    notes: string[];
  };
  nameSuggestions?: string[];
}

// Application State Types
export interface MeetingJob {
  id: string;
  meetingId: string;
  filename: string;
  title: string;
  participants: string[];
  status: MeetingStatus;
  progress: number;
  createdAt: string;
  audioFile?: string;
  result?: ResultResponse;
  transcript?: string;
  transcriptSegments?: TranscriptSegment[];
  summary?: string;
}

// 內部領域詞彙表項目
export interface VocabularyItem {
  incorrect: string;  // 錯誤的詞彙
  correct: string;    // 正確的詞彙
  description?: string; // 描述說明
}

export interface AppSettings {
  baseURL: string;
  apiKey: string;
  environment: 'dev' | 'stg' | 'prod';
  // Gemini API 設定
  useGemini?: boolean;
  geminiApiKey?: string;
  // Gemini 進階設定
  geminiPreferredModel?: string;          // 偏好的 Gemini 模型
  geminiEnableFallback?: boolean;         // 啟用模型 fallback
  geminiRetryConfig?: {
    maxRetries?: number;                  // 最大重試次數 (預設: 5)
    baseDelay?: number;                   // 基礎延遲毫秒 (預設: 30000)
    enableJitter?: boolean;               // 啟用隨機抖動 (預設: true)
  };
  geminiDiagnosticMode?: boolean;         // 診斷模式：啟用詳細日誌
  geminiHealthCheckEnabled?: boolean;     // 啟用 API 健康檢查
  // 轉錄模式設定
  transcriptionMode?: TranscriptionMode;
  googleCloudSTT?: GoogleCloudSTTSettings;
  // 自訂提示詞設定
  customTranscriptPrompt?: string;
  customSummaryPrompt?: string;
  // 內部領域詞彙表
  vocabularyList?: VocabularyItem[];
  // 錄音儲存設定
  recordingSavePath?: string; // 錄音儲存路徑
}

export interface RecordingState {
  isRecording: boolean;
  duration: number;
  volume: number;
  audioFile?: string;
  deviceId?: string;
}

// IPC Types
export interface IPCRecordingStart {
  deviceId: string;
}

export interface IPCRecordingStop {
  filePath: string;
  duration: number;
}

export interface IPCRecordingError {
  error: string;
}

// UI Component Types
export interface DeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

// Transcription mode & Google STT 設定
export type TranscriptionMode = 'gemini_direct' | 'hybrid_stt';

export interface GoogleCloudSTTSettings {
  enabled?: boolean;
  projectId?: string;
  location?: string;
  recognizerId?: string;
  keyFilePath?: string;
  languageCode?: string;
  model?: string;
  enableSpeakerDiarization?: boolean;
  minSpeakerCount?: number;
  maxSpeakerCount?: number;
}

// Google STT IPC 型別
export interface STTInitializeRequest {
  projectId: string;
  location: string;
  recognizerId: string;
  keyFilePath?: string;
  model?: string;
}

export interface STTPrepareAudioRequest {
  sourcePath: string;
  mimeType?: string;
  sampleRate?: number;
}

export interface STTPrepareAudioResponse {
  success: boolean;
  wavPath?: string;
  durationSeconds?: number;
  error?: string;
}

export interface STTTranscriptionRequest {
  filePath?: string;
  sourcePath?: string;
  startTimeSeconds?: number;
  endTimeSeconds?: number;
  languageCode?: string;
  enableWordTimeOffsets?: boolean;
  enableSpeakerDiarization?: boolean;
  minSpeakerCount?: number;
  maxSpeakerCount?: number;
  mimeType?: string;
}

export interface STTTranscriptSegment {
  text: string;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  speakerTag?: number;
}

export interface STTTranscriptionResponse {
  success: boolean;
  transcript?: string;
  segments?: STTTranscriptSegment[];
  error?: string;
  rawResponse?: unknown;
}

export interface STTStatusResponse {
  initialized: boolean;
  projectId?: string;
  location?: string;
  recognizerId?: string;
  model?: string;
}

export interface STTProgressEvent {
  stage: 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
}
