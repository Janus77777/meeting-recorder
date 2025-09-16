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
  useMock: boolean;
  // Gemini API 設定
  useGemini?: boolean;
  geminiApiKey?: string;
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