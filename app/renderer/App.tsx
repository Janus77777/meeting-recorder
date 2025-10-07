import React, { useRef, useState } from 'react';
import { SimpleNavigation } from './components/SimpleNavigation';
import { initializeAPI, getAPI, updateAPISettings } from './services/api';
import { GeminiAPIClient } from './services/geminiApi';
import { AppSettings, MeetingStatus, STTTranscriptionResponse, STTTranscriptSegment, TranscriptSegment } from '@shared/types';
import { useSettingsStore, useUIStore, useJobsStore, initializeStores, useToastActions } from './services/store';
import PromptsPage from './pages/PromptsPage';
import { SettingsPage } from './pages/SettingsPage';
import GoogleSTTSettingsPage from './pages/GoogleSTTSettingsPage';
import SummaryView from './components/SummaryView';
import ResultHeader from './components/ResultHeader';
import KitResultHeader from './components/kit/ResultHeader';
import ProgressBar from './components/ProgressBar';
import SummaryCard from './components/SummaryCard';
import HighlightsCard from './components/HighlightsCard';
import DecisionsCard from './components/DecisionsCard';
import TodosCard from './components/TodosCard';
import TimelineCard from './components/TimelineCard';
import SummaryCardKit from './components/kit/SummaryCard';
import HighlightsCardKit from './components/kit/HighlightsCard';
import DecisionsCardKit from './components/kit/DecisionsCard';
import TodosCardKit from './components/kit/TodosCard';
import TimelineCardKit from './components/kit/TimelineCard';
import TranscriptToolbarKit from './components/kit/TranscriptToolbar';
import Icon from './components/Icon';
import { VocabularyService } from './services/vocabularyService';
import { mergeMediaStreams, requestMicrophoneStream, requestSystemAudioStream, stopStream } from './utils/audioCapture';
import { validateMediaFile } from './utils/validators';
import { joinPath, normalizePath } from './utils/path';

const PAGE_META: Record<'record' | 'result' | 'prompts' | 'settings' | 'stt', { title: string; subtitle: string }> = {
  record: {
    title: '會議錄音工作室',
    subtitle: '即時錄音或上傳檔案，啟動智慧轉錄流程'
  },
  result: {
    title: '查看結果',
    subtitle: '查看完整逐字稿與 AI 摘要，快速回顧會議重點'
  },
  prompts: {
    title: '提示詞管理',
    subtitle: '調整逐字稿與摘要提示詞，客制化你想要的輸出格式'
  },
  settings: {
    title: '系統設定',
    subtitle: '連線 API、調整偏好與權限設定'
  },
  stt: {
    title: 'Google STT 詳細設定',
    subtitle: '配置專案、辨識器、模型與語言等參數'
  }
};

type ParsedTranscriptLine = {
  speaker?: string;
  text: string;
};

const MAX_CLEANUP_CHARS = 7000;

const JOB_STATUS_HINTS: Record<string, string> = {
  queued: '任務排隊中，稍候開始處理',
  stt: '語音轉文字進行中',
  summarize: '正在生成摘要',
  done: '轉錄完成，可前往結果頁查看',
  failed: '處理失敗'
};

const openSystemPreference = async (target: 'microphone' | 'screen') => {
  try {
    const api = (window as any).electronAPI;
    if (api?.permissions?.openSystemPreference) {
      await api.permissions.openSystemPreference(target);
    }
  } catch (error) {
    console.warn('無法自動開啟系統偏好設定:', error);
  }
};

const requestMicrophoneAccess = async () => {
  try {
    const api = (window as any).electronAPI;
    if (api?.permissions?.requestMediaAccess) {
      const granted = await api.permissions.requestMediaAccess('microphone');
      return granted;
    }
  } catch (error) {
    console.warn('無法請求麥克風權限:', error);
  }
  return false;
};

const chunkTranscriptForCleanup = (transcript: string, maxChars: number = MAX_CLEANUP_CHARS): string[] => {
  if (!transcript || transcript.trim().length === 0) {
    return [];
  }

  const lines = transcript.split(/\r?\n/);
  const chunks: string[] = [];
  let buffer: string[] = [];
  let currentLength = 0;

  const pushBuffer = () => {
    if (buffer.length) {
      chunks.push(buffer.join('\n'));
      buffer = [];
      currentLength = 0;
    }
  };

  for (const line of lines) {
    const lineLength = line.length + 1; // include newline
    if (currentLength + lineLength > maxChars && buffer.length > 0) {
      pushBuffer();
    }
    buffer.push(line);
    currentLength += lineLength;
  }

  pushBuffer();

  return chunks.length > 0 ? chunks : [transcript];
};

const cleanupTranscriptInChunks = async (
  client: GeminiAPIClient,
  transcript: string,
  cleanupPrompt?: string
): Promise<string> => {
  const chunks = chunkTranscriptForCleanup(transcript);
  if (chunks.length <= 1) {
    return client.cleanupTranscript(transcript, cleanupPrompt);
  }

  const cleanedChunks: string[] = [];

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    try {
      const cleaned = await client.cleanupTranscript(chunk, cleanupPrompt);
      cleanedChunks.push(cleaned);
    } catch (error) {
      console.warn(`逐字稿分段修正失敗，第 ${index + 1}/${chunks.length} 段將使用原始內容`, error);
      cleanedChunks.push(chunk);
    }
  }

  return cleanedChunks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
};

const parseTranscriptLines = (transcript: string): ParsedTranscriptLine[] => {
  if (!transcript || !transcript.trim()) {
    return [];
  }

  return transcript
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => {
      if (!line || line.length === 0) return false;
      if (line.startsWith('# Legend')) return false;
      // 略過僅包含 Speaker 標記且沒有內容的行
      if (/^\[?\s*Speaker\s+\d+\s*\]?$/i.test(line)) {
        return false;
      }
      return true;
    })
    .map<ParsedTranscriptLine>(line => {
      const match = line.match(/^\[(.+?)\]:\s*(.*)$/);
      if (match) {
        const rawSpeaker = match[1]?.trim();
        const speaker = rawSpeaker.replace(/\|.*/, '').trim();
        return {
          speaker: speaker.length ? speaker : undefined,
          text: match[2]?.trim() ?? ''
        };
      }
      return { text: line };
    })
    .filter(entry => entry.text.length > 0 || (entry.speaker && entry.speaker.length > 0));
};

const mergeSegmentsWithCleanTranscript = (
  segments: TranscriptSegment[] = [],
  cleanedTranscript: string
): TranscriptSegment[] => {
  const parsedLines = parseTranscriptLines(cleanedTranscript);
  if (!parsedLines.length) {
    return segments;
  }

  const merged: TranscriptSegment[] = [];
  const maxIndex = Math.min(segments.length, parsedLines.length);

  for (let i = 0; i < maxIndex; i++) {
    const segment = segments[i];
    const line = parsedLines[i];
    merged.push({
      // 僅覆寫 speaker/text，不動時間戳，確保 1:1 對齊
      start: segment.start,
      end: segment.end,
      speaker: line.speaker ?? segment.speaker,
      text: line.text
    });
  }

  if (parsedLines.length > segments.length) {
    const lastEnd = merged[merged.length - 1]?.end ?? 0;
    for (let i = segments.length; i < parsedLines.length; i++) {
      const line = parsedLines[i];
      merged.push({
        // 新增的行：以上一段 end 作為 start，end 暫缺（渲染時會顯示 --:--）
        start: typeof lastEnd === 'number' ? lastEnd : 0,
        end: undefined as any,
        speaker: line.speaker ?? 'Speaker',
        text: line.text
      });
    }
  } else if (segments.length > parsedLines.length) {
    for (let i = parsedLines.length; i < segments.length; i++) {
      merged.push(segments[i]);
    }
  }

  return merged;
};

const App: React.FC = () => {
  // 使用UI store管理頁面狀態
  const { currentPage, setCurrentPage } = useUIStore();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingStatus, setRecordingStatus] = useState<string>('準備開始錄音...');
  const [hasAudioPermission, setHasAudioPermission] = useState<boolean | null>(null);
  const [recordingMode, setRecordingMode] = useState<'microphone' | 'system' | 'both'>('both'); // 錄音模式
  const [systemStream, setSystemStream] = useState<MediaStream | null>(null);
  const [microphoneStream, setMicrophoneStream] = useState<MediaStream | null>(null);
  const [recordings, setRecordings] = useState<Array<{
    id: string;
    filename: string;
    blob: Blob;
    timestamp: string;
    duration: number;
    size: number;
    filePath?: string;
    chunks?: Blob[];
  }>>([]);
  
  // 使用 Zustand store 管理設定和作業
  const { settings, updateSettings } = useSettingsStore();
  const { showSuccess, showError } = useToastActions();
  const { jobs, addJob, updateJob, removeJob } = useJobsStore();
  
  // 追蹤設定是否已從 localStorage 恢復
  const [isSettingsHydrated, setIsSettingsHydrated] = useState(false);
  
  // 追蹤正在處理的轉錄任務，防止重複執行
  const [processingJobs, setProcessingJobs] = useState<Set<string>>(new Set());
  
  // 結果頁面的分頁狀態
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  const [isResultDetailsOpen, setIsResultDetailsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'highlights' | 'decisions' | 'todos' | 'timeline' | 'transcript'>('overview');
  const [showTranscript, setShowTranscript] = useState(false);
  // 單頁分頁呈現，不使用內部錨點捲動
  
  // 結果頁面的顯示模式：'summary' | 'transcript'
  const [resultViewMode, setResultViewMode] = useState<'summary' | 'transcript'>('summary');
  // 結果清單分頁
  const [resultsPage, setResultsPage] = useState(1);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const transcriptItemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [transcriptSpeaker, setTranscriptSpeaker] = useState('');
  const [showRawSummary, setShowRawSummary] = useState(false);

  const cancelRecordingRef = React.useRef(false);
  const hasResetStaleJobsRef = React.useRef(false);
  // 進度估算（真實百分比）：以「已處理的媒體秒數 / 總媒體秒數」為主
  const progressEstRef = React.useRef<Record<string, { startTs: number; totalSeconds: number; processedSeconds: number; lastEmitTs: number }>>({});

  // 更新狀態
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; releaseNotes?: string } | null>(null);
  const [updateProgress, setUpdateProgress] = useState<{ percent: number; status: string } | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');
  const [platform, setPlatform] = useState<NodeJS.Platform | 'unknown'>('unknown');
  const [updateStatusMessage, setUpdateStatusMessage] = useState<string>('尚未檢查更新');

  type AudioSegment = {
    index: number;
    blob: Blob;
    start: number;
    end: number;
    duration: number;
  };

  const DEFAULT_SEGMENT_MAX_DURATION_SECONDS = 360; // 6 分鐘（Gemini 直接模式）
  const DEFAULT_SEGMENT_MIN_DURATION_SECONDS = 90;  // 避免最後一段過短
  const STT_SEGMENT_MAX_DURATION_SECONDS = 50;      // Google STT 限制建議：單段小於 1 分鐘
  const STT_SEGMENT_MIN_DURATION_SECONDS = 10;      // 保持結果可用性，避免過短片段
  const STT_SEGMENT_MAX_BYTES = 7 * 1024 * 1024;    // STT 段落最大大小（7MB 原始資料）
  const STT_BASE64_EXPANSION_FACTOR = 4 / 3;        // base64 放大係數

  interface SegmentOptions {
    maxDurationSeconds?: number;
    minDurationSeconds?: number;
    maxSegmentBytes?: number;
  }

  const normalizeMimeType = (mime?: string): string | undefined => {
    if (!mime) {
      return undefined;
    }
    return mime.split(';')[0]?.trim().toLowerCase();
  };

  const inferExtensionFromMime = (mime?: string): string => {
    const normalized = normalizeMimeType(mime);
    switch (normalized) {
      case 'audio/mpeg':
      case 'audio/mp3':
        return 'mp3';
      case 'audio/mp4':
      case 'audio/x-m4a':
      case 'audio/m4a':
        return 'm4a';
      case 'audio/aac':
        return 'aac';
      case 'audio/ogg':
        return 'ogg';
      case 'audio/opus':
        return 'opus';
      case 'audio/wav':
      case 'audio/x-wav':
      case 'audio/wave':
      case 'audio/vnd.wave':
        return 'wav';
      case 'audio/flac':
        return 'flac';
      case 'audio/webm':
      case 'audio/webm;codecs=opus':
      default:
        return 'webm';
    }
  };

  const inferMimeFromExtension = (filename: string): string | undefined => {
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

  const handleChooseSavePath = async () => {
    try {
      const picked = (window as any).electronAPI?.dialog?.openDirectory ? await (window as any).electronAPI.dialog.openDirectory() : { canceled: true };
      if (picked?.canceled) return;
      const dir = picked.directoryPath as string;
      if (dir && dir.trim()) {
        updateSettings({ recordingSavePath: dir });
        showSuccess?.(`已設定錄音儲存目錄：${dir}`);
      }
    } catch (e) {
      showError?.(`選擇儲存目錄失敗：${(e as Error).message}`);
    }
  };

  const createAudioSegments = (
    fullBlob: Blob,
    chunkList: Blob[] = [],
    totalDuration: number = recordingTime,
    options: SegmentOptions = {}
  ): AudioSegment[] => {
    const maxBytes = options.maxSegmentBytes ?? Number.POSITIVE_INFINITY;

    const chunkCount = chunkList?.length ?? 0;
    const hasChunks = chunkCount > 0;

    const validDuration = Number.isFinite(totalDuration) && totalDuration > 0
      ? totalDuration
      : undefined;

    const approxChunkDuration = hasChunks && validDuration
      ? validDuration / chunkCount
      : undefined;

    const maxDuration = options.maxDurationSeconds ?? DEFAULT_SEGMENT_MAX_DURATION_SECONDS;
    const minDuration = options.minDurationSeconds ?? DEFAULT_SEGMENT_MIN_DURATION_SECONDS;

    const maxChunksPerSegment = approxChunkDuration
      ? Math.max(1, Math.floor(maxDuration / approxChunkDuration))
      : undefined;

    const segments: AudioSegment[] = [];

    const pushSegment = (segmentBlob: Blob, index: number, startTime: number, endTime: number) => {
      const duration = Math.max(endTime - startTime, approxChunkDuration ?? (validDuration ?? 0));
      segments.push({
        index: segments.length,
        blob: segmentBlob,
        start: startTime,
        end: endTime,
        duration
      });
    };

    const shouldSplitBySize = (blob: Blob): boolean => {
      if (!Number.isFinite(maxBytes)) {
        return false;
      }
      if (blob.size <= maxBytes) {
        return false;
      }
      return blob.size * STT_BASE64_EXPANSION_FACTOR > 10 * 1024 * 1024;
    };

    if (!hasChunks) {
      if (!validDuration) {
        pushSegment(fullBlob, 0, 0, 0);
        return segments;
      }

      const targetBytes = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : fullBlob.size;
      const segmentCountBySize = Math.max(1, Math.ceil(fullBlob.size / targetBytes));
      const segmentCountByDuration = Math.max(1, Math.ceil(validDuration / maxDuration));
      const segmentCount = Math.max(segmentCountBySize, segmentCountByDuration);

      if (segmentCount === 1) {
        pushSegment(fullBlob, 0, 0, validDuration);
        return segments;
      }

      const bytesPerSegment = Math.ceil(fullBlob.size / segmentCount);

      let byteStart = 0;
      for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        const byteEnd = segmentIndex === segmentCount - 1
          ? fullBlob.size
          : Math.min(fullBlob.size, byteStart + bytesPerSegment);

        const startTime = (validDuration * byteStart) / (fullBlob.size || 1);
        const endTime = segmentIndex === segmentCount - 1
          ? validDuration
          : (validDuration * byteEnd) / (fullBlob.size || 1);

        const segmentBlob = fullBlob.slice(byteStart, byteEnd, fullBlob.type || 'audio/webm');
        pushSegment(segmentBlob, segmentIndex, startTime, endTime);

        byteStart = byteEnd;
      }

      return segments;
    }

    let currentChunks: Blob[] = [];
    let segmentStartIndex = 0;

    const finalizeSegment = (endIndexExclusive: number) => {
      if (currentChunks.length === 0) {
        return;
      }

      const startTime = approxChunkDuration ? segmentStartIndex * approxChunkDuration : (validDuration ?? 0);
      const chunkSpan = approxChunkDuration ? currentChunks.length * approxChunkDuration : (validDuration ?? 0);
      const endTime = validDuration ? Math.min(validDuration, startTime + chunkSpan) : startTime + chunkSpan;

      let segmentBlob = new Blob(currentChunks, { type: fullBlob.type || 'audio/webm' });
      const bytesPerChunk = chunkCount > 0 ? fullBlob.size / chunkCount : fullBlob.size;
      let segmentByteStart = segmentStartIndex * bytesPerChunk;

      if (shouldSplitBySize(segmentBlob)) {
        const splits = Math.ceil(segmentBlob.size / (maxBytes || segmentBlob.size));
        const bytesPerSplit = Math.ceil(segmentBlob.size / splits);

        for (let splitIndex = 0; splitIndex < splits; splitIndex++) {
          const splitByteStart = segmentByteStart + splitIndex * bytesPerSplit;
          const splitByteEnd = splitIndex === splits - 1
            ? segmentByteStart + segmentBlob.size
            : splitByteStart + bytesPerSplit;

          const splitStartTime = validDuration
            ? (validDuration * splitByteStart) / (fullBlob.size || 1)
            : startTime;
          const splitEndTime = validDuration
            ? (validDuration * splitByteEnd) / (fullBlob.size || 1)
            : endTime;

          const splitBlob = segmentBlob.slice(
            splitIndex * bytesPerSplit,
            splitIndex === splits - 1 ? segmentBlob.size : (splitIndex + 1) * bytesPerSplit,
            fullBlob.type || 'audio/webm'
          );
          pushSegment(splitBlob, segments.length, splitStartTime, splitEndTime);
        }
      } else {
        pushSegment(segmentBlob, segments.length, startTime, endTime);
      }

      currentChunks = [];
      segmentStartIndex = endIndexExclusive;
    };

    chunkList.forEach((chunk, idx) => {
      currentChunks.push(chunk);
      const isLastChunk = idx === chunkCount - 1;

      let reachedDurationLimit = false;
      if (maxChunksPerSegment && approxChunkDuration) {
        reachedDurationLimit = currentChunks.length >= maxChunksPerSegment;
      }

      const tempSegment = new Blob(currentChunks, { type: fullBlob.type || 'audio/webm' });
      const reachedSizeLimit = shouldSplitBySize(tempSegment);

      if (reachedDurationLimit || reachedSizeLimit || isLastChunk) {
        finalizeSegment(idx + 1);
      }
    });

    if (segments.length === 0) {
      finalizeSegment(chunkCount);
    }

    if (segments.length > 1 && approxChunkDuration) {
      const lastSegment = segments[segments.length - 1];
      if (lastSegment.duration < minDuration) {
        const prev = segments[segments.length - 2];
        const mergedBlob = new Blob([prev.blob, lastSegment.blob], { type: fullBlob.type || 'audio/webm' });
        const mergedSegment: AudioSegment = {
          index: prev.index,
          blob: mergedBlob,
          start: prev.start,
          end: lastSegment.end,
          duration: lastSegment.end - prev.start
        };
        segments.splice(segments.length - 2, 2, mergedSegment);
      }
    }

    return segments.map((segment, idx) => ({ ...segment, index: idx }));
  };

  const createSTTAudioSegments = (
    fullBlob: Blob,
    chunkList: Blob[] = [],
    totalDuration: number = recordingTime
  ): AudioSegment[] => {
    return createAudioSegments(fullBlob, chunkList, totalDuration, {
      maxDurationSeconds: STT_SEGMENT_MAX_DURATION_SECONDS,
      minDurationSeconds: STT_SEGMENT_MIN_DURATION_SECONDS,
      maxSegmentBytes: STT_SEGMENT_MAX_BYTES
    });
  };

  const formatSecondsToTimestamp = (seconds?: number): string => {
    if (seconds === undefined || seconds === null || Number.isNaN(seconds)) {
      return '00:00';
    }
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs
        .toString()
        .padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatEta = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const safeUpdateJobProgress = (jobId: string, processed: number, total: number, stageLabel: string) => {
    const now = Date.now();
    const state = progressEstRef.current[jobId] || { startTs: now, totalSeconds: total || 1, processedSeconds: 0, lastEmitTs: 0 };
    state.totalSeconds = Math.max(total || 1, 1);
    state.processedSeconds = Math.min(Math.max(processed, 0), state.totalSeconds);
    progressEstRef.current[jobId] = state;

    const elapsed = Math.max((now - state.startTs) / 1000, 0.001);
    const speed = state.processedSeconds / elapsed; // 每秒處理的媒體秒數
    const remain = Math.max(state.totalSeconds - state.processedSeconds, 0);
    const eta = speed > 0 ? remain / speed : Infinity;
    const percent = Math.max(0, Math.min(100, Math.round((state.processedSeconds / state.totalSeconds) * 100)));

    // 節流，避免狀態欄訊息快速閃動
    if (now - state.lastEmitTs < 800 && percent < 100) return;
    state.lastEmitTs = now;

    const hint = `${stageLabel} · ${percent}%（預估剩餘 ${formatEta(eta)}）`;
    updateJob(jobId, { progress: percent, progressMessage: hint });
  };

  const buildTranscriptFromSTTSegments = (segments: STTTranscriptSegment[] = []): {
    formattedSegments: TranscriptSegment[];
    text: string;
  } => {
    if (!segments.length) {
      return { formattedSegments: [], text: '' };
    }

    const maxGapSeconds = 2;
    const sorted = [...segments].sort((a, b) => {
      const aStart = a.startTime ?? 0;
      const bStart = b.startTime ?? 0;
      return aStart - bStart;
    });

    type WorkingSegment = {
      speakerTag: number | undefined;
      startTime: number;
      endTime: number;
      words: string[];
    };

    const combined: WorkingSegment[] = [];

    for (const word of sorted) {
      const start = word.startTime ?? word.endTime ?? 0;
      const end = word.endTime ?? word.startTime ?? start;
      const speakerTag = word.speakerTag;

      const last = combined[combined.length - 1];
      const gap = last ? start - last.endTime : Number.POSITIVE_INFINITY;

      if (
        !last ||
        last.speakerTag !== speakerTag ||
        gap > maxGapSeconds
      ) {
        combined.push({
          speakerTag,
          startTime: start,
          endTime: end,
          words: [word.text ?? '']
        });
      } else {
        last.words.push(word.text ?? '');
        last.endTime = end;
      }
    }

    const formattedSegments: TranscriptSegment[] = combined.map(seg => {
      const speakerLabel = seg.speakerTag ? `Speaker ${seg.speakerTag}` : 'Speaker';
      return {
        // 以數值秒數儲存，確保之後跳轉對齊 Google STT 時間戳
        start: seg.startTime,
        end: seg.endTime,
        speaker: speakerLabel,
        text: seg.words.join(' ').replace(/\s+/g, ' ').trim()
      };
    });

    const text = formattedSegments
      .map(seg => {
        const range = `${seg.start} - ${seg.end}`;
        return `[${seg.speaker} ${range}]: ${seg.text}`;
      })
      .join('\n');

    return { formattedSegments, text };
  };

  const getGeminiKey = (config: AppSettings): string | undefined => {
    if (config.geminiApiKey && config.geminiApiKey.trim()) {
      return config.geminiApiKey;
    }
    if (config.apiKey && config.apiKey.trim()) {
      return config.apiKey;
    }
    return undefined;
  };

  const getBlobDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
      const isVideo = !!blob.type && blob.type.startsWith('video');
      const mediaEl = document.createElement(isVideo ? 'video' : 'audio') as HTMLMediaElement;
      const url = URL.createObjectURL(blob);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        mediaEl.remove();
      };

      let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        timeoutHandle = null;
        cleanup();
        reject(new Error('媒體長度讀取逾時'));
      }, 10000);

      mediaEl.preload = 'metadata';
      if (isVideo) {
        mediaEl.muted = true;
        mediaEl.setAttribute('playsinline', 'true');
      }

      mediaEl.onloadedmetadata = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        const duration = mediaEl.duration;
        cleanup();
        if (!Number.isFinite(duration) || duration <= 0) {
          reject(new Error('無法取得媒體長度'));
        } else {
          resolve(duration);
        }
      };

      mediaEl.onerror = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        cleanup();
        reject(new Error('媒體載入失敗'));
      };

      mediaEl.src = url;
      mediaEl.load();
    });
  };

  // 初始化設定和API
  React.useEffect(() => {
    console.log('應用啟動，當前設定:', settings);
    
    // 簡單檢查：如果設定已經載入完成（有 baseURL），就標記為 hydrated
    if (settings.baseURL && settings.baseURL !== '') {
      console.log('Settings 已恢復，直接初始化');
      setIsSettingsHydrated(true);
      initializeAPI(settings);
      updateAPISettings(settings);
      console.log('應用初始化完成，Gemini API Key:', getGeminiKey(settings) ? '已設定' : '未設定');
    } else {
      // 如果還沒恢復，等待一下再檢查
      const timer = setTimeout(() => {
        const currentSettings = useSettingsStore.getState().settings;
        console.log('延遲檢查設定:', currentSettings);
        setIsSettingsHydrated(true);
        initializeAPI(currentSettings);
        updateAPISettings(currentSettings);
        console.log('延遲初始化完成，Gemini API Key:', getGeminiKey(currentSettings) ? '已設定' : '未設定');
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [settings]);

  React.useEffect(() => {
    const detectPlatform = async () => {
      try {
        const result = await window.electronAPI?.app.getPlatform();
        if (result) {
          setPlatform(result as NodeJS.Platform);
          console.log('偵測到作業系統平台:', result);
        }
      } catch (error) {
        console.warn('偵測作業系統平台失敗:', error);
      }
    };

    detectPlatform();
  }, []);

  // Timer effect for recording time
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Check audio permission on load
  React.useEffect(() => {
    checkAudioPermission();
  }, []);

  React.useEffect(() => {
    const completed = jobs.filter(job => job.status === 'done' && (job.summary || job.transcript));
    setCurrentJobIndex(prev => {
      if (completed.length === 0) {
        return 0;
      }
      const clamped = Math.max(0, Math.min(prev, completed.length - 1));
      return clamped;
    });
  }, [jobs]);

  // 依據結果數調整分頁（避免刪除後頁碼超出）
  React.useEffect(() => {
    const count = jobs.filter(job => job.status === 'done' && (job.summary || job.transcript)).length;
    const pageSize = 12;
    const totalPages = Math.max(1, Math.ceil(count / pageSize));
    setResultsPage(prev => Math.min(prev, totalPages));
  }, [jobs]);

  // 移除整體縮放策略，改以 CSS 斷點壓縮/隱藏控制高度，避免裁切

  React.useEffect(() => {
    if (hasResetStaleJobsRef.current) {
      return;
    }

    if (processingJobs.size > 0) {
      return;
    }

    if (jobs.length === 0) {
      return;
    }

    const pendingJobs = jobs.filter(job => job.status !== 'done' && job.status !== 'failed');
    if (pendingJobs.length === 0) {
      hasResetStaleJobsRef.current = true;
      return;
    }

    pendingJobs.forEach(job => {
      updateJob(job.id, {
        status: 'failed',
        progress: 0,
        progressMessage: `先前未完成的任務（${job.filename}）已停止，請重新啟動轉錄。`,
        errorMessage: '應用程式重新啟動後，上一個任務已終止。'
      });
    });

    hasResetStaleJobsRef.current = true;
  }, [jobs, processingJobs, updateJob]);

  // 設置更新監聽器
  React.useEffect(() => {
    const api = window.electronAPI;

    if (api?.updater) {
      api.updater.onUpdateAvailable((info) => {
        console.log('發現新版本:', info.version);
        setUpdateAvailable(true);
        setUpdateDownloaded(false);
        setUpdateInfo(info);
        setUpdateStatusMessage(`發現新版本 ${info.version}`);
        setUpdateProgress(null);
      });

      api.updater.onUpdateProgress((progress) => {
        console.log('更新下載進度:', progress.percent + '%');
        setUpdateProgress({
          percent: progress.percent,
          status: `下載中... ${progress.percent.toFixed(1)}%`
        });
        setUpdateStatusMessage(`下載中... ${progress.percent.toFixed(1)}%`);
      });

      api.updater.onUpdateDownloaded((info) => {
        console.log('更新下載完成 (renderer):', info.version);
        setUpdateDownloaded(true);
        setUpdateProgress({ percent: 100, status: '下載完成，等待安裝' });
        setUpdateStatusMessage(`更新 v${info.version} 已下載，請點擊安裝`);
      });
    } else {
      setUpdateStatusMessage('目前環境不支援自動更新');
    }

  api?.app.getVersion()
      .then((version) => setAppVersion(version))
      .catch((error) => {
        console.warn('取得應用版本失敗:', error);
        setAppVersion('');
      });
  }, []);


  const handleCheckUpdates = async () => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      setUpdateStatusMessage('目前環境不支援自動更新');
      return;
    }

    try {
      setUpdateStatusMessage('檢查更新中...');
      setUpdateProgress(null);
      const result = await updater.checkForUpdates();

      if (result?.available) {
        setUpdateAvailable(true);
        setUpdateDownloaded(false);
        setUpdateInfo({ version: result.version ?? '' });
        setUpdateStatusMessage(`發現新版本 ${result.version ?? ''}`.trim());
      } else {
        setUpdateAvailable(false);
        setUpdateDownloaded(false);
        setUpdateInfo(null);
        const message = result?.message || '目前已是最新版本';
        setUpdateStatusMessage(message);
      }
    } catch (error) {
      setUpdateStatusMessage(`檢查更新失敗：${(error as Error).message}`);
    }
  };

  const handleDownloadUpdate = async () => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      setUpdateStatusMessage('目前環境不支援自動更新');
      return;
    }

    try {
      setUpdateStatusMessage('準備下載更新...');
      setUpdateProgress({ percent: 0, status: '準備下載更新...' });
      const result = await updater.downloadUpdate();
      if (!result?.success) {
        const message = result?.error ? `下載更新失敗：${result.error}` : '下載更新失敗';
        setUpdateStatusMessage(message);
        setUpdateProgress(null);
      }
    } catch (error) {
      setUpdateStatusMessage(`下載更新失敗：${(error as Error).message}`);
      setUpdateProgress(null);
    }
  };

  const handleInstallUpdate = async () => {
    const updater = window.electronAPI?.updater;
    if (!updater) {
      setUpdateStatusMessage('目前環境不支援自動更新');
      return;
    }

    try {
      setUpdateStatusMessage('應用程式即將重新啟動以安裝更新...');
      await updater.installUpdate();
    } catch (error) {
      setUpdateStatusMessage(`安裝更新失敗：${(error as Error).message}`);
    }
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const checkAudioPermission = async () => {
    try {
      const osStatus = await window.electronAPI?.permissions?.getMediaStatus?.('microphone');
      console.log('🔍 macOS systemPreferences 麥克風狀態:', osStatus);

      switch (osStatus) {
        case 'authorized':
        case 'granted':
          setHasAudioPermission(true);
          setRecordingStatus('已獲得麥克風權限，準備就緒');
          return;
        case 'denied':
          setHasAudioPermission(false);
          setRecordingStatus('麥克風權限被拒絕，請在「系統設定 > 隱私權與安全性 > 麥克風」允許 Electron');
          await openSystemPreference('microphone');
          return;
        case 'not-determined':
        case 'prompt':
          setHasAudioPermission(null);
          console.log('🔔 OS 顯示尚未決定，嘗試 askForMediaAccess');
          const granted = await requestMicrophoneAccess();
          if (granted) {
            setHasAudioPermission(true);
            setRecordingStatus('已取得麥克風權限，準備就緒');
          } else {
            setRecordingStatus('仍需要授權麥克風權限');
          }
          return;
        default:
          console.warn('未知的麥克風權限狀態:', osStatus);
          break;
      }

      // Fallback：瀏覽器層級權限（例如非 macOS 或系統 API 不可用）
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        console.log('🔍 Browser Permission API mic 狀態:', permissionStatus.state);

        if (permissionStatus.state === 'granted') {
          setHasAudioPermission(true);
          setRecordingStatus('已獲得麥克風權限，準備就緒');
        } else if (permissionStatus.state === 'denied') {
          setHasAudioPermission(false);
          setRecordingStatus('麥克風權限被拒絕，請檢查瀏覽器/應用設定');
        } else {
          setHasAudioPermission(null);
          setRecordingStatus('需要授權麥克風權限');
        }
      } else {
        console.log('不支援 Permission API，將直接嘗試訪問');
        setRecordingStatus('準備測試麥克風...');
      }
    } catch (error) {
      console.error('檢查權限時出錯:', error);
      setRecordingStatus('權限檢查失敗');
    }
  };

  const testAudioAccess = async () => {
    try {
      setRecordingStatus('正在請求麥克風權限...');
      let userMediaError: Error | null = null;

      try {
        const permissionStatus = navigator.permissions && await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permissionStatus && permissionStatus.state === 'prompt') {
          await requestMicrophoneAccess();
        }
      } catch (permissionError) {
        console.warn('查詢或請求麥克風權限時出錯:', permissionError);
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        userMediaError = error as Error;
      }

      if (!stream) {
        throw userMediaError ?? new Error('無法建立麥克風串流');
      }
      console.log('成功獲得音訊串流:', stream);
      
      // 測試完成，立即關閉
      stream.getTracks().forEach(track => track.stop());
      
      setHasAudioPermission(true);
      setRecordingStatus('麥克風測試成功！可以開始錄音');
      return true;
    } catch (error) {
      console.error('無法訪問麥克風:', error);
      setHasAudioPermission(false);
      const err = error as DOMException;
      if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        setRecordingStatus('麥克風權限被 macOS 拒絕，請在「系統設定 > 隱私權與安全性 > 麥克風」勾選 Electron 後重啟應用');
        await openSystemPreference('microphone');
        await requestMicrophoneAccess();
      } else {
        setRecordingStatus('無法訪問麥克風：' + err.message);
      }
      return false;
    }
  };

  // 測試系統聲音權限（簡化版本）
  const testSystemAudioAccess = async () => {
    try {
      setRecordingStatus('正在測試系統聲音權限...');
      console.log('🎵 開始測試系統聲音權限...');
      const resolvedPlatform = platform === 'unknown' && /mac/i.test(navigator.userAgent)
        ? 'darwin'
        : platform;

      const result = await requestSystemAudioStream({
        platform: resolvedPlatform,
        preferDisplayCapture: true,
        logger: (message, data) => console.log(message, data ?? '')
      });

      result.warnings.forEach(warning => console.warn('⚠️ 系統聲音警告:', warning));

      if (result.stream) {
        stopStream(result.stream);
        setRecordingStatus('✅ 系統聲音權限測試成功，可擷取系統音訊');
        return true;
      }

      const hint = result.error || result.warnings[0] || '系統聲音權限測試失敗';
      setRecordingStatus(`❌ 系統聲音權限測試失敗：${hint}`);
      if (/權限|允許|授權/.test(hint)) {
        await openSystemPreference('screen');
      }
      return false;
      
    } catch (error) {
      console.error('❌ 測試過程錯誤:', error);
      setRecordingStatus('❌ 測試錯誤：' + (error as Error).message);
      return false;
    }
  };

  // 合併音訊流
  const startRecording = async () => {
    const activeStreams: MediaStream[] = [];
    let finalStream: MediaStream | null = null;

    try {
      setRecordingStatus('正在啟動錄音...');
      
      cancelRecordingRef.current = false;

      const streams: MediaStream[] = [];
      
      // 根據錄音模式獲取對應的音訊流
      if (recordingMode === 'microphone' || recordingMode === 'both') {
        setRecordingStatus('正在獲取麥克風權限...');
        const micStream = await requestMicrophoneStream();
        streams.push(micStream);
        activeStreams.push(micStream);
        setMicrophoneStream(micStream);
      }
      
      if (recordingMode === 'system' || recordingMode === 'both') {
        setRecordingStatus('正在獲取系統聲音權限...');
        const resolvedPlatform = platform === 'unknown' && /mac/i.test(navigator.userAgent)
          ? 'darwin'
          : platform;

        const systemResult = await requestSystemAudioStream({
          platform: resolvedPlatform,
          preferDisplayCapture: resolvedPlatform === 'darwin',
          logger: (message, data) => console.log(message, data ?? '')
        });

        systemResult.warnings.forEach(warning => console.warn('⚠️ 系統聲音警告:', warning));

        if (systemResult.stream && systemResult.stream.getAudioTracks) {
          console.log('✅ 系統聲音流有效，軌道數:', systemResult.stream.getAudioTracks().length);
          streams.push(systemResult.stream);
          activeStreams.push(systemResult.stream);
          setSystemStream(systemResult.stream);

          if (systemResult.source === 'display') {
            setRecordingStatus('已透過螢幕錄製取得系統聲音');
          }
        } else if (recordingMode === 'system') {
          const reason = systemResult.error || '無法獲取系統聲音來源';
          console.error('❌ 系統聲音擷取失敗:', reason);
          if (/Requested device not found/i.test(reason)) {
            const friendlyMessage = 'macOS 目前未提供系統音訊輸出來源；若需錄製系統聲音，請安裝虛擬音訊驅動（如 BlackHole 或 Loopback）並在偏好設定中授權。';
            setRecordingStatus(`系統聲音擷取失敗：${friendlyMessage}`);
            alert(friendlyMessage);
          } else if (/權限|允許|授權/.test(reason)) {
            setRecordingStatus(`系統聲音擷取失敗：${reason}`);
            await openSystemPreference('screen');
          } else {
            setRecordingStatus(`系統聲音擷取失敗：${reason}`);
          }
          throw new Error(reason);
        } else {
          console.warn('⚠️ 系統聲音獲取失敗，繼續使用麥克風:', systemResult.error);
          if (systemResult.error) {
            let fallbackMessage = systemResult.error;
            if (/Requested device not found/i.test(systemResult.error)) {
              fallbackMessage = 'macOS 尚未偵測到可錄製的系統音訊來源，將僅錄製麥克風。可考慮安裝虛擬音訊驅動（例如 BlackHole）。';
            }
            setRecordingStatus(`系統聲音取得失敗：${fallbackMessage}`);
            if (/權限|允許|授權/.test(systemResult.error)) {
              await openSystemPreference('screen');
            }
          }
        }
      }
      
      if (streams.length === 0) {
        throw new Error('無法獲取任何音訊源');
      }
      
      // 如果有多個音訊流，合併它們
      if (streams.length > 1) {
        setRecordingStatus('正在合併音訊源...');
        finalStream = mergeMediaStreams(streams);
        activeStreams.push(finalStream);
      } else {
        finalStream = streams[0];
      }
      
      if (!finalStream || !finalStream.getAudioTracks) {
        console.error('❌ 最終音訊串流無效:', finalStream);
        throw new Error('音訊串流合併失敗 - 無效的 MediaStream');
      }

      console.log('最終音訊串流，軌道數:', finalStream.getAudioTracks().length);

      const recorder = new MediaRecorder(finalStream);
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
          console.log('收到音訊數據:', event.data.size, '位元組');
        }
      };

      recorder.onstop = async () => {
        console.log('錄音停止，總共', chunks.length, '個音訊片段');
        const wasCancelled = cancelRecordingRef.current;

        // 清理所有音訊流
        activeStreams.forEach(stream => {
          console.log('關閉音訊串流');
          stopStream(stream);
        });

        setSystemStream(null);
        setMicrophoneStream(null);
        setIsRecording(false);

        if (wasCancelled) {
          setAudioChunks([]);
          setRecordingStatus('已取消錄音，未保存任何檔案');
          return;
        }

        const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        console.log('最終音訊檔案大小:', audioBlob.size, '位元組');
        
        // 生成檔名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const modeLabel = recordingMode === 'both' ? 'mixed' : recordingMode === 'system' ? 'system' : 'mic';
        const mode = settings.transcriptionMode || (settings.useGemini ? 'gemini_direct' : 'hybrid_stt');
        const filenameBase = `meeting-${modeLabel}-${timestamp}`;
        const filename = `${filenameBase}.wav`;
        
        try {
          // 一律：WebM → WAV（本地保存），確保可播放
          let savedPath = '';
          let tempWebmPath: string | null = null;
          const tempDirResult = await window.electronAPI.recording.getTempDir();
          const tempDir = tempDirResult.success && tempDirResult.tempDir ? tempDirResult.tempDir : undefined;
          if (!tempDir) throw new Error('無法取得暫存目錄');
          tempWebmPath = joinPath(tempDir, `${filenameBase}.webm`);
          await window.electronAPI.recording.saveBlob(tempWebmPath, await audioBlob.arrayBuffer());
          const prep = await window.electronAPI.stt.prepareAudio({ sourcePath: tempWebmPath, mimeType: 'audio/webm', sampleRate: 16_000 });
          if (!prep.success || !prep.wavPath) throw new Error(prep.error || 'WAV 轉檔失敗');
          const wavPathTemp = prep.wavPath;
          let baseDirectory: string | undefined;
          const preferred = settings.recordingSavePath?.trim();
          if (preferred) {
            if (preferred.startsWith('~/')) {
              const homePath = await window.electronAPI.app.getPath('home');
              const relative = preferred.slice(2);
              baseDirectory = joinPath(homePath, relative);
            } else if (!preferred.startsWith('~')) {
              baseDirectory = preferred;
            }
          }
          if (!baseDirectory) {
            baseDirectory = await window.electronAPI.app.getPath('downloads');
          }
          const normalizedBase = normalizePath(baseDirectory);
          const wavFilename = `${filenameBase}.wav`;
          const destPath = joinPath(normalizedBase, wavFilename);
          const copyRes = await window.electronAPI.recording.copyFile(wavPathTemp, destPath);
          if (!copyRes.success) throw new Error(copyRes.error || 'WAV 儲存失敗');
          savedPath = destPath;
          
          const newRecording = {
            id: Date.now().toString(),
            filename,
            blob: audioBlob,
            timestamp: new Date().toLocaleString('zh-TW'),
            duration: recordingTime,
            size: audioBlob.size,
            filePath: savedPath,
            chunks: [...chunks]
          };
          
          setRecordings(prev => [newRecording, ...prev]);
          setRecordingStatus(`錄音完成！檔案已自動保存: ${filename} (${(audioBlob.size / 1024).toFixed(1)} KB)`);
          setAudioChunks([...chunks]);
          
          // 交給轉錄作業（仍傳遞 WebM blob 方便切段；作業內會做切段與轉檔）
          startTranscriptionJob(audioBlob, filename, [...chunks], recordingTime, { sourcePath: tempWebmPath || savedPath });
        } catch (error) {
          console.error('錄音保存失敗:', error);
          setRecordingStatus('錄音保存失敗: ' + (error as Error).message);
        }
      };

      recorder.onerror = (event) => {
        console.error('錄音錯誤:', event);
        setRecordingStatus('錄音過程中發生錯誤');
      };

      setAudioChunks([]);
      setMediaRecorder(recorder);
      recorder.start(1000); // 每秒收集一次數據
      setIsRecording(true);
      setRecordingTime(0);
      
      const modeText = recordingMode === 'both' ? '系統聲音 + 麥克風' : 
                      recordingMode === 'system' ? '系統聲音' : '麥克風';
      setRecordingStatus(`錄音中 (${modeText})...`);
      console.log('開始錄音，MediaRecorder 狀態:', recorder.state);
    } catch (error) {
      console.error('啟動錄音失敗:', error);
      setRecordingStatus('啟動錄音失敗：' + (error as Error).message);
      alert('錄音啟動失敗：' + (error as Error).message);
      activeStreams.forEach(stream => stopStream(stream));
      setSystemStream(null);
      setMicrophoneStream(null);
    }
  };

  const cancelRecording = () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      setRecordingStatus('目前沒有進行中的錄音');
      return;
    }

    cancelRecordingRef.current = true;
    setRecordingStatus('正在取消錄音...');
    try {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      setTimeout(() => {
        stopStream(systemStream);
        stopStream(microphoneStream);
        setSystemStream(null);
        setMicrophoneStream(null);
      }, 500);
    } catch (error) {
      console.error('取消錄音時發生錯誤:', error);
      setRecordingStatus('取消錄音失敗：' + (error as Error).message);
      cancelRecordingRef.current = false;
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      console.log('正在停止錄音...');
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      console.log('錄音結束，總時長:', formatTime(recordingTime));
      
      // 立即清理音訊流（防止錄音結束前就清理）
      setTimeout(() => {
        stopStream(systemStream);
        stopStream(microphoneStream);
        setSystemStream(null);
        setMicrophoneStream(null);
      }, 1000);
    } else {
      console.log('MediaRecorder 狀態異常:', mediaRecorder?.state);
      setRecordingStatus('停止錄音時發生錯誤');
    }
  };

  const downloadRecording = (recording: typeof recordings[0]) => {
    const audioUrl = URL.createObjectURL(recording.blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = audioUrl;
    downloadLink.download = recording.filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(audioUrl);
  };

  // 自動保存錄音檔案
  const saveRecordingFile = async (blob: Blob, filename: string): Promise<string> => {
    try {
      console.log(`🎵 開始儲存錄音檔案: ${filename}`);
      console.log('📁 檔案大小:', blob.size, '位元組');

      // 確定儲存路徑
      let baseDirectory: string | undefined;
      const preferred = settings.recordingSavePath?.trim();

      if (preferred) {
        if (preferred.startsWith('~/')) {
          const homePath = await window.electronAPI.app.getPath('home');
          const relative = preferred.slice(2);
          baseDirectory = joinPath(homePath, relative);
          console.log('📍 使用家目錄相對路徑儲存:', baseDirectory);
        } else if (!preferred.startsWith('~')) {
          baseDirectory = preferred;
          console.log('📍 使用設定的儲存路徑:', baseDirectory);
        }
      }

      if (!baseDirectory) {
        baseDirectory = await window.electronAPI.app.getPath('downloads');
        console.log('📍 使用預設下載路徑:', baseDirectory);
      }

      const normalizedBase = normalizePath(baseDirectory);
      const fullPath = joinPath(normalizedBase, filename);
      console.log('🎯 完整儲存路徑:', fullPath);

      // 轉換為 ArrayBuffer 並儲存
      console.log('🔄 轉換檔案格式...');
      const buffer = await blob.arrayBuffer();
      console.log('💾 開始寫入檔案...');

      const result = await window.electronAPI.recording.saveBlob(fullPath, buffer);
      console.log('✅ saveBlob 回應:', result);

      console.log('🎉 檔案儲存成功！路徑:', fullPath);
      return fullPath;
    } catch (error) {
      console.error('❌ 檔案儲存過程出錯:', error);
      console.error('❌ 錯誤詳情:', (error as Error).message);
      console.error('❌ 錯誤堆疊:', (error as Error).stack);
      throw error;
    }
  };

  const playRecording = (recording: typeof recordings[0]) => {
    const audioUrl = URL.createObjectURL(recording.blob);
    const audio = new Audio(audioUrl);
    audio.play().catch(e => console.log('播放失敗:', e));
  };

  // 啟動轉錄作業
  const startTranscriptionJob = async (
    audioBlob: Blob,
    filename: string,
    originalChunks: Blob[] = [],
    durationSeconds: number = recordingTime,
    options: { sourcePath?: string } = {}
  ) => {
    // 防止重複執行：檢查是否已經在處理相同檔案
    if (processingJobs.has(filename)) {
      console.log('⚠️ 轉錄任務已在進行中，跳過重複執行:', filename);
      return;
    }
    
    // 標記為處理中
    setProcessingJobs(prev => new Set([...prev, filename]));
    
    let jobId: string | null = null;

    try {
      console.log('開始轉錄流程:', filename);
      
      // 創建作業記錄
      jobId = Date.now().toString();
      const newJob = {
        id: jobId,
        meetingId: jobId, // 使用 jobId 作為 meetingId
        filename: filename,
        title: filename, // 使用檔案名作為標題
        participants: [], // 錄音沒有參與者信息
        status: 'queued' as const,
        progress: 0,
        createdAt: new Date().toLocaleString('zh-TW'),
        audioFile: options.sourcePath,
        progressMessage: JOB_STATUS_HINTS.queued
      };
      
      addJob(newJob);
      
      const mode = settings.transcriptionMode || (settings.useGemini ? 'gemini_direct' : 'hybrid_stt');

      if (mode === 'hybrid_stt') {
        console.log('使用 Google STT + Gemini 混合模式進行轉錄');
        await startHybridSTTTranscription(audioBlob, filename, jobId, originalChunks, durationSeconds);
      } else if (settings.useGemini) {
        if (!settings.geminiApiKey) {
          alert('請先在設定中配置 Gemini API Key 才能使用轉錄功能');
          return;
        }
        console.log('使用 Google Gemini API 進行轉錄');
        await startGeminiTranscription(audioBlob, filename, jobId, originalChunks, durationSeconds);
      } else {
        alert('請先在設定中配置轉錄服務才能使用此功能');
        return;
      }
      
    } catch (error) {
      console.error('轉錄流程啟動失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (jobId) {
        const latestJob = useJobsStore.getState().jobs.find(job => job.id === jobId);
        if (latestJob) {
          updateJob(jobId, {
            status: 'failed',
            progressMessage: `${JOB_STATUS_HINTS.failed}：${errorMessage}`,
            errorMessage
          });
        }
      }
      setRecordingStatus('轉錄啟動失敗: ' + errorMessage);
    } finally {
      // 清除處理狀態，允許重新執行
      setProcessingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    const targetJob = jobs.find(job => job.id === jobId);
    if (!targetJob) {
      return;
    }

    const confirmMessage = `確定要刪除「${targetJob.filename}」的轉錄結果嗎？` +
      (targetJob.audioFile ? '\n\n這會一併移除本地錄音檔案：\n' + targetJob.audioFile : '');

    if (!window.confirm(confirmMessage)) {
      return;
    }

    let fileRemovalError: Error | null = null;

    if (targetJob.audioFile) {
      try {
        const cleanupResult = await window.electronAPI?.recording?.cleanup([targetJob.audioFile]);
        if (cleanupResult && cleanupResult.success === false) {
          fileRemovalError = new Error(cleanupResult.error || '錄音檔案刪除失敗');
        }
      } catch (error) {
        console.error('刪除錄音檔案失敗:', error);
        fileRemovalError = error instanceof Error ? error : new Error(String(error));
      }
    }

    removeJob(jobId);
    setRecordings(prev => prev.filter(recording => recording.filePath !== targetJob.audioFile));

    if (fileRemovalError) {
      alert(`已移除轉錄結果，但刪除錄音檔案時發生錯誤：${fileRemovalError.message}`);
    } else {
      alert('已刪除轉錄結果。');
    }
  };

  const startHybridSTTTranscription = async (
    audioBlob: Blob,
    filename: string,
    jobId: string,
    originalChunks: Blob[] = [],
    durationSeconds: number = recordingTime
  ) => {
    const currentSettings = useSettingsStore.getState().settings;
    const sttSettings = currentSettings.googleCloudSTT;
    let cleanupPaths: string[] = [];

    try {
      if (!sttSettings || !sttSettings.enabled) {
        throw new Error('請先在設定頁啟用並配置 Google STT');
      }

      const missingFields: string[] = [];
      if (!sttSettings.projectId) missingFields.push('Project ID');
      if (!sttSettings.location) missingFields.push('Location');
      if (!sttSettings.recognizerId) missingFields.push('Recognizer ID');
      if (!sttSettings.keyFilePath) missingFields.push('Service Account Key 檔案');
      if (missingFields.length > 0) {
        throw new Error(`Google STT 設定不完整：${missingFields.join('、')}`);
      }

      const geminiKey = getGeminiKey(currentSettings);
      if (!geminiKey) {
        throw new Error('請先設定 API 金鑰，以便進行後續摘要與後處理');
      }

      const geminiClient = new GeminiAPIClient(geminiKey, {
        preferredModel: currentSettings.geminiPreferredModel,
        enableFallback: currentSettings.geminiEnableFallback,
        retryConfig: currentSettings.geminiRetryConfig,
        diagnosticMode: currentSettings.geminiDiagnosticMode
      });

      setRecordingStatus('初始化 Google STT 服務...');
      const initResult = await window.electronAPI.stt.initialize({
        projectId: sttSettings.projectId!,
        location: sttSettings.location!,
        recognizerId: sttSettings.recognizerId!,
        keyFilePath: sttSettings.keyFilePath!,
        model: sttSettings.model
      });

      if (!initResult.success) {
        throw new Error(initResult.error || 'Google STT 初始化失敗');
      }

      const tempDirResult = await window.electronAPI.recording.getTempDir();
      if (!tempDirResult.success || !tempDirResult.tempDir) {
        throw new Error(tempDirResult.error || '無法取得暫存目錄');
      }
      const tempDir = tempDirResult.tempDir;

      cleanupPaths = [];
      const baseMime = normalizeMimeType(audioBlob.type) || 'audio/webm';
      const baseExt = inferExtensionFromMime(baseMime);
      const sourceFilePath = joinPath(tempDir, `${jobId}-source.${baseExt}`);

      setRecordingStatus('保存原始音訊檔案...');
      const originalBuffer = await audioBlob.arrayBuffer();
      const saveOriginalResult = await window.electronAPI.recording.saveBlob(sourceFilePath, originalBuffer);
      if (!saveOriginalResult.success) {
        throw new Error(saveOriginalResult.error || '原始音訊儲存失敗');
      }
      cleanupPaths.push(sourceFilePath);

      setRecordingStatus('轉換音訊格式，準備切割...');
      const prepareResult = await window.electronAPI.stt.prepareAudio({
        sourcePath: sourceFilePath,
        mimeType: baseMime,
        sampleRate: 16_000
      });
      if (!prepareResult.success || !prepareResult.wavPath) {
        throw new Error(prepareResult.error || '音訊格式轉換失敗');
      }

      const preparedWavPath = prepareResult.wavPath;
      cleanupPaths.push(preparedWavPath);

      // 決定切段所用的總時長：以主程序 ffprobe 回傳為主，後備以 <audio> 估算
      let durationForSegments = prepareResult.durationSeconds && prepareResult.durationSeconds > 0
        ? prepareResult.durationSeconds
        : (durationSeconds || 0);
      if (!durationForSegments || durationForSegments <= 0) {
        try {
          durationForSegments = await getBlobDuration(audioBlob);
        } catch {}
      }
      const sttSegments = createSTTAudioSegments(audioBlob, originalChunks, Math.max(1, Math.floor(durationForSegments)));
      console.log('📼 Google STT 分段資訊:', sttSegments.map(s => ({ index: s.index + 1, duration: s.duration })));

      const aggregatedSegments: STTTranscriptSegment[] = [];
      const transcriptParts: string[] = [];

      const recognizerIdLower = (sttSettings.recognizerId || '').toLowerCase();
      const modelIdLower = (sttSettings.model || '').toLowerCase();
      const isChirp3 = modelIdLower.includes('chirp_3') || recognizerIdLower.includes('chirp_3');
      // 語言：chirp_3 強制用簡中；其他使用使用者設定
      const langForThisRun = isChirp3 ? 'cmn-Hans-CN' : (sttSettings.languageCode || 'zh-TW');
      // 僅在模型為 chirp_3 且語言為簡中時開啟 diarization
      let enableSpeakerDiarization = Boolean(sttSettings.enableSpeakerDiarization) && isChirp3 && langForThisRun === 'cmn-Hans-CN';
      if (!enableSpeakerDiarization && Boolean(sttSettings.enableSpeakerDiarization) && (!isChirp3 || langForThisRun !== 'cmn-Hans-CN')) {
        console.warn('Diarization 僅支援 chirp_3 + cmn-Hans-CN，本次已自動停用。');
        setRecordingStatus('Diarization 僅支援 chirp_3 + 簡中 (cmn-Hans-CN)，本次已自動停用。');
      }

      // 初始化真實進度估算
      const totalSecondsForStt = sttSegments.reduce((sum, s) => sum + (s.duration || (s.end - s.start) || 0), 0);
      progressEstRef.current[jobId] = { startTs: Date.now(), totalSeconds: Math.max(totalSecondsForStt, 1), processedSeconds: 0, lastEmitTs: 0 };

      window.electronAPI.stt.onProgress(event => {
        if (event.message) {
          // 僅更新本地狀態提示，避免干擾使用者可讀的穩定訊息
          setRecordingStatus(event.message);
        }
        if (typeof event.progress === 'number') {
          // 我們用真實估算為主，這裡不直接覆蓋百分比，僅在非常早期提供最低進度
          const normalized = Math.min(25, Math.max(event.progress, 3));
          updateJob(jobId, { progress: normalized });
        }
      });

      updateJob(jobId, { status: 'stt', progress: 10 });
      setRecordingStatus(`開始進行 Google STT 轉錄，共 ${sttSegments.length} 段`);

      for (const segment of sttSegments) {
        const partLabel = sttSegments.length > 1
          ? `第 ${segment.index + 1}/${sttSegments.length} 段（約 ${Math.round(segment.start)}s ~ ${Math.round(segment.end)}s）`
          : '整段音訊';

        setRecordingStatus(`Google STT 正在處理 ${partLabel}...`);

          const sttResponse: STTTranscriptionResponse = await window.electronAPI.stt.transcribe({
            sourcePath: preparedWavPath,
            startTimeSeconds: segment.start,
            endTimeSeconds: segment.end,
            languageCode: langForThisRun,
            enableWordTimeOffsets: !isChirp3,
            enableSpeakerDiarization: enableSpeakerDiarization,
            minSpeakerCount: enableSpeakerDiarization ? (sttSettings.minSpeakerCount ?? 1) : undefined,
            maxSpeakerCount: enableSpeakerDiarization ? (sttSettings.maxSpeakerCount ?? 6) : undefined,
            mimeType: 'audio/wav'
          });

        if (!sttResponse.success || !sttResponse.transcript) {
          throw new Error(sttResponse.error || 'Google STT 轉錄失敗');
        }

        if (Array.isArray(sttResponse.segments)) {
          aggregatedSegments.push(...sttResponse.segments);
        }

        transcriptParts.push(sttResponse.transcript);

        // 按已完成媒體秒數更新真實進度與 ETA
        const est = progressEstRef.current[jobId];
        if (est) {
          const d = segment.duration || (segment.end - segment.start) || 0;
          est.processedSeconds = Math.min(est.totalSeconds, est.processedSeconds + Math.max(d, 0));
          safeUpdateJobProgress(jobId, est.processedSeconds, est.totalSeconds, '語音轉文字處理中');
        }
      }

      let formattedSegments: TranscriptSegment[] = [];
      let transcriptFromSegments = '';

      if (aggregatedSegments.length > 0) {
        const built = buildTranscriptFromSTTSegments(aggregatedSegments);
        formattedSegments = built.formattedSegments;
        transcriptFromSegments = built.text;
      }

      let finalTranscript = transcriptParts.join('\n\n').trim();

      if (!finalTranscript) {
        finalTranscript = transcriptFromSegments;
      }

      if ((!formattedSegments || formattedSegments.length === 0) && finalTranscript) {
        formattedSegments = sttSegments.map((segment, idx) => ({
          start: segment.start,
          end: segment.end,
          speaker: `Segment ${idx + 1}`,
          text: (transcriptParts[idx] || finalTranscript)
            .replace(/\s+/g, ' ')
            .trim()
        }));
      }

      if (!finalTranscript) {
        throw new Error('無法取得 Google STT 轉錄結果');
      }

      if (currentSettings.vocabularyList && currentSettings.vocabularyList.length > 0) {
        finalTranscript = VocabularyService.applyVocabularyCorrections(finalTranscript, currentSettings.vocabularyList);
      }

      setRecordingStatus('Google STT 完成，啟動 Gemini 逐字稿修正...');
      const estAfterStt = progressEstRef.current[jobId];
      if (estAfterStt) safeUpdateJobProgress(jobId, Math.max(estAfterStt.processedSeconds, estAfterStt.totalSeconds * 0.9), estAfterStt.totalSeconds, '逐字稿修正中');
      updateJob(jobId, { status: 'stt' });

      let cleanedTranscript = await cleanupTranscriptInChunks(
        geminiClient,
        finalTranscript,
        currentSettings.customTranscriptCleanupPrompt
      );

      // 簡體 → 繁體（台灣）
      try {
        const { toTW } = await import('./utils/zhConvert');
        cleanedTranscript = await toTW(cleanedTranscript);
      } catch {}

      if (!cleanedTranscript) {
        throw new Error('逐字稿修正後的內容為空');
      }

      finalTranscript = cleanedTranscript;
      formattedSegments = mergeSegmentsWithCleanTranscript(formattedSegments, finalTranscript);

      setRecordingStatus('逐字稿修正完成，準備生成會議摘要...');
      if (estAfterStt) safeUpdateJobProgress(jobId, Math.max(estAfterStt.processedSeconds, estAfterStt.totalSeconds * 0.95), estAfterStt.totalSeconds, '生成會議摘要');
      updateJob(jobId, { status: 'summarize' });

      let summaryMarkdown = '';
      let overallSummary = '';

      if (currentSettings.customSummaryPrompt) {
        const summaryText = await geminiClient.generateCustomSummary(cleanedTranscript, currentSettings.customSummaryPrompt);
        summaryMarkdown = summaryText;
        overallSummary = summaryText;
      } else {
        const structuredSummary = await geminiClient.generateStructuredSummaryFromTranscript(cleanedTranscript);
        // 轉繁
        try {
          const { toTW } = await import('./utils/zhConvert');
          summaryMarkdown = await toTW(structuredSummary.minutesMd || '');
        } catch {
          summaryMarkdown = structuredSummary.minutesMd;
        }
        overallSummary = structuredSummary.overallSummary;
      }

      // 產生「標題式大綱」的時間軸（可點擊跳到逐字稿）
      let timelineItems: Array<{ time?: string; item: string; desc?: string }> = [];
      try {
        const tl = await geminiClient.generateTimelineOutline(
          (formattedSegments || []).map(s => ({ start: typeof s.start === 'number' ? s.start : 0, end: typeof s.end === 'number' ? s.end : undefined, text: s.text }))
        );
        // 簡→繁
        try {
          const { toTW } = await import('./utils/zhConvert');
          timelineItems = await Promise.all((tl || []).map(async (t: any) => ({ time: t.time, item: await toTW(t.item || ''), desc: t.desc ? await toTW(t.desc) : undefined })));
        } catch {
          timelineItems = (tl || []).map((t: any) => ({ time: t.time, item: t.item, desc: t.desc }));
        }
      } catch (e) {
        console.warn('產生時間軸大綱失敗（將以空白略過）:', e);
      }

      updateJob(jobId, { status: 'done', transcript: cleanedTranscript, transcriptSegments: formattedSegments, summary: summaryMarkdown, timelineItems });
      if (estAfterStt) safeUpdateJobProgress(jobId, estAfterStt.totalSeconds, estAfterStt.totalSeconds, '完成');

      setRecordingStatus('Google STT 轉錄完成！可在結果頁查看詳細內容');

    } catch (error) {
      console.error('Google STT 轉錄失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateJob(jobId, {
        status: 'failed',
        errorMessage,
        progressMessage: `${JOB_STATUS_HINTS.failed}：${errorMessage}`
      });
      setRecordingStatus('Google STT 轉錄失敗：' + errorMessage);
    } finally {
      if (cleanupPaths.length > 0) {
        window.electronAPI.recording.cleanup(cleanupPaths).catch(() => void 0);
      }
    }
  };

  // 使用 Gemini API 進行轉錄
  const startGeminiTranscription = async (
    audioBlob: Blob,
    filename: string,
    jobId: string,
    originalChunks: Blob[] = [],
    durationSeconds: number = recordingTime
  ) => {
    try {
      // 直接使用最新的設定，不等待 hydration 狀態
      const currentSettings = useSettingsStore.getState().settings;
      const geminiKey = getGeminiKey(currentSettings);
      console.log('🔍 開始 Gemini 轉錄，當前設定:', {
        hasApiKey: !!geminiKey,
        useGemini: currentSettings.useGemini,
        apiKeyPrefix: geminiKey?.substring(0, 10)
      });
      
      if (!geminiKey) {
        throw new Error('請先設定 API 金鑰');
      }
      
      const geminiClient = new GeminiAPIClient(geminiKey, {
        preferredModel: currentSettings.geminiPreferredModel,
        enableFallback: currentSettings.geminiEnableFallback,
        retryConfig: currentSettings.geminiRetryConfig,
        diagnosticMode: currentSettings.geminiDiagnosticMode
      });
      
      // 直接開始轉錄流程，不進行額外的連接測試
      
      const segments = createAudioSegments(audioBlob, originalChunks, durationSeconds);
      console.log('📼 分段資訊:', segments.map(s => ({ index: s.index + 1, duration: s.duration }))); 

      const mimeType = audioBlob.type || 'audio/webm';
      const transcriptSegments: string[] = [];
      const totalSecondsForDirect = segments.reduce((sum, s) => sum + (s.duration || (s.end - s.start) || 0), 0);
      progressEstRef.current[jobId] = { startTs: Date.now(), totalSeconds: Math.max(totalSecondsForDirect, 1), processedSeconds: 0, lastEmitTs: 0 };

      updateJob(jobId, { status: 'stt', progress: 5 });
      setRecordingStatus(`API 連接成功，準備處理音訊（共 ${segments.length} 段）...`);

      for (const segment of segments) {
        const partLabel = segments.length > 1
          ? `第 ${segment.index + 1}/${segments.length} 段（約 ${Math.round(segment.start)}s ~ ${Math.round(segment.end)}s）`
          : '整段音訊';

        setRecordingStatus(`正在上傳 ${partLabel} 到 Gemini...`);
        const segmentFilename = segments.length > 1
          ? `${filename.replace(/\.\w+$/, '')}-part-${segment.index + 1}.webm`
          : filename;

        const uploadResult = await geminiClient.uploadFile(segment.blob, segmentFilename);
        console.log(`Gemini 段落上傳完成 (${segment.index + 1}/${segments.length}):`, uploadResult.name);

        const estD = progressEstRef.current[jobId];
        if (estD) {
          const d = segment.duration || (segment.end - segment.start) || 0;
          estD.processedSeconds = Math.min(estD.totalSeconds, estD.processedSeconds + Math.max(d, 0));
          safeUpdateJobProgress(jobId, estD.processedSeconds, estD.totalSeconds, '語音轉文字處理中');
        }

        await new Promise(resolve => setTimeout(resolve, 1500));

        setRecordingStatus(`開始轉錄 ${partLabel}...`);
        const transcriptionResult = await geminiClient.generateTranscription(
          uploadResult.uri,
          mimeType,
          settings.customTranscriptPrompt,
          settings.vocabularyList,
          {
            index: segment.index,
            total: segments.length,
            startTime: segment.start,
            endTime: segment.end
          }
        );

        transcriptSegments.push(transcriptionResult.trim());

        const segmentProgress = 30 + Math.floor(((segment.index + 1) / segments.length) * 30);
        updateJob(jobId, { progress: segmentProgress });
        await new Promise(resolve => setTimeout(resolve, 1200));
      }

      const combinedTranscriptRaw = transcriptSegments.join('\n\n');
      console.log('Gemini 逐字稿合併完成');

      const cleanedTranscript = await cleanupTranscriptInChunks(
        geminiClient,
        combinedTranscriptRaw,
        settings.customTranscriptCleanupPrompt
      );

      const parsedResult = geminiClient.parseTranscriptionResult(cleanedTranscript);
      // 逐字稿一律簡轉繁（台灣）
      try {
        const { toTW } = await import('./utils/zhConvert');
        parsedResult.transcript.fullText = await toTW(parsedResult.transcript.fullText);
      } catch {}
      const estAfter = progressEstRef.current[jobId];
      if (estAfter) safeUpdateJobProgress(jobId, Math.max(estAfter.processedSeconds, estAfter.totalSeconds * 0.9), estAfter.totalSeconds, '逐字稿修正中');
      const geminiSegments = mergeSegmentsWithCleanTranscript(
        Array.isArray(parsedResult.transcript?.segments)
          ? (parsedResult.transcript.segments as TranscriptSegment[])
          : [],
        parsedResult.transcript.fullText
      );
      
      // 4. 後處理：應用詞彙表修正（雙重保險）
      if (settings.vocabularyList && settings.vocabularyList.length > 0) {
        parsedResult.transcript.fullText = VocabularyService.applyVocabularyCorrections(
          parsedResult.transcript.fullText, 
          settings.vocabularyList
        );
        console.log('詞彙表後處理完成');
      }
      
      // 5. 第二步：生成自訂會議總結（如果有自訂摘要提示詞）
      let finalSummary = parsedResult.summary;
      // 若存在預設摘要，先做簡轉繁處理（minutesMd 與 overallSummary）
      try {
        const { toTW } = await import('./utils/zhConvert');
        if (finalSummary?.minutesMd) finalSummary.minutesMd = await toTW(finalSummary.minutesMd);
        if (finalSummary?.overallSummary) finalSummary.overallSummary = await toTW(finalSummary.overallSummary);
      } catch {}
      if (settings.customSummaryPrompt) {
        setRecordingStatus('逐字稿完成，等待後再生成自訂摘要...');
        
        // 添加延遲以避免請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 3000));
        setRecordingStatus('開始生成自訂摘要...');
        
        try {
          let customSummaryResult = await geminiClient.generateCustomSummary(
            parsedResult.transcript.fullText,
            settings.customSummaryPrompt
          );
          // 自訂摘要也轉繁
          try {
            const { toTW } = await import('./utils/zhConvert');
            customSummaryResult = await toTW(customSummaryResult);
          } catch {}
          console.log('Gemini 自訂摘要完成:', customSummaryResult);
          
          // 用自訂摘要替換原來的摘要
          finalSummary = {
            ...parsedResult.summary,
            overallSummary: customSummaryResult,
            minutesMd: `# 自訂會議摘要\n\n${customSummaryResult}`
          };
        } catch (summaryError) {
          console.error('自訂摘要生成失敗，使用預設摘要:', summaryError);
          // 如果自訂摘要失敗，繼續使用原來的摘要
        }
      }
      // 6. 更新作業狀態為完成（逐字稿段落轉繁）
      let twSegments = geminiSegments;
      try {
        const { toTW } = await import('./utils/zhConvert');
        twSegments = await Promise.all(
          geminiSegments.map(async (seg) => ({ ...seg, text: await toTW(seg.text || '') }))
        );
      } catch {}
      updateJob(jobId, { status: 'done', transcript: parsedResult.transcript.fullText, transcriptSegments: twSegments, summary: finalSummary.minutesMd });
      if (estAfter) safeUpdateJobProgress(jobId, estAfter.totalSeconds, estAfter.totalSeconds, '完成');
      
      setRecordingStatus('Gemini 轉錄完成！可在結果頁查看詳細內容');
      
    } catch (error) {
      console.error('Gemini 轉錄失敗:', error);

      // 改進錯誤訊息，提供更具體的指導
      let errorMessage = '';
      let suggestions: string[] = [];

      if (error instanceof Error) {
        const errorMsg = error.message;

        if (errorMsg.includes('503')) {
          errorMessage = 'Gemini API 服務目前過載';
          suggestions = [
            '請稍等 5-10 分鐘後重試',
            '嘗試在非高峰時段使用',
            '檢查 Google API 服務狀態'
          ];
        } else if (errorMsg.includes('429')) {
          errorMessage = 'API 使用配額已達上限';
          suggestions = [
            '等待配額重置（通常為每日重置）',
            '升級您的 Google Cloud 方案',
            '檢查 API 配額設定'
          ];
        } else if (errorMsg.includes('401') || errorMsg.includes('Invalid API key')) {
          errorMessage = 'API 金鑰無效或已過期';
          suggestions = [
            '檢查 API 金鑰是否正確',
            '確認 API 金鑰權限設定',
            '重新生成 API 金鑰'
          ];
        } else if (errorMsg.includes('403')) {
          errorMessage = 'API 權限不足';
          suggestions = [
            '確認已啟用 Generative Language API',
            '檢查 API 金鑰權限設定',
            '聯繫管理員確認權限'
          ];
        } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network')) {
          errorMessage = '網路連接問題';
          suggestions = [
            '檢查網路連接',
            '確認防火牆設定',
            '嘗試重新連接網路'
          ];
      } else {
        errorMessage = errorMsg;
        if (/INVALID_ARGUMENT/i.test(errorMsg)) {
          suggestions = [
            '確認未在非 chirp_3 模型啟用說話者分段（Diarization）',
            '若需 Diarization，請將模型設為 chirp_3 並使用語言 cmn-Hans-CN',
            '或先關閉 Diarization 僅保留字詞時間戳（Word Offsets）',
          ];
        } else {
          suggestions = [
            '檢查網路連接和 API 設定',
            '查看詳細錯誤日誌',
            '嘗試重新啟動應用程式'
          ];
        }
      }
      } else {
        errorMessage = '未知錯誤';
        suggestions = ['請重試或聯繫技術支援'];
      }

      const fullMessage = `❌ ${errorMessage}\n\n💡 建議解決方案:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
      updateJob(jobId, {
        status: 'failed',
        errorMessage,
        progressMessage: fullMessage
      });
      setRecordingStatus(fullMessage);

      // 記錄錯誤到控制台，便於調試
      const { settings: debugSettings } = useSettingsStore.getState();
      console.error('🔍 Gemini 轉錄詳細錯誤資訊:', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        settings: {
          hasApiKey: !!getGeminiKey(debugSettings),
          preferredModel: debugSettings.geminiPreferredModel,
          enableFallback: debugSettings.geminiEnableFallback,
          retryConfig: debugSettings.geminiRetryConfig
        }
      });
    }
  };

  // 使用原有 API 進行轉錄
  const startOriginalApiTranscription = async (audioBlob: Blob, filename: string, jobId: string, originalChunks: Blob[] = [], durationSeconds: number = recordingTime) => {
    try {
      const api = getAPI();
      
      // 1. 創建會議
      const meetingResponse = await api.createMeeting({
        title: `錄音轉錄 - ${filename}`,
        participants: [],
        options: {
          language: 'zh-TW'
        }
      });
      
      console.log('會議創建成功:', meetingResponse);
      
      // 2. 上傳音訊檔案
      const audioFile = new File([audioBlob], filename, { type: 'audio/webm' });
      await api.uploadAudio(meetingResponse.id, audioFile);
      console.log('音訊檔案上傳成功');
      
      // 3. 完成會議，開始處理
      await api.completeMeeting(meetingResponse.id);
      console.log('會議標記為完成，開始轉錄處理');
      
      // 4. 開始輪詢狀態
      startStatusPolling(meetingResponse.id, jobId);
      
    } catch (error) {
      console.error('原有 API 轉錄失敗:', error);
      updateJob(jobId, { status: 'failed' });
      setRecordingStatus('API 轉錄失敗: ' + (error as Error).message);
    }
  };


  // 處理檔案上傳
  const handleFileUpload = async (file: File) => {
    try {
      console.log('開始處理上傳檔案:', file.name, file.type, file.size);
      
      const validation = validateMediaFile(file);
      if (!validation.isValid) {
        const message = Object.values(validation.errors).join('\n');
        alert(message || '檔案驗證失敗，請重新選擇檔案。');
        setRecordingStatus(message || '媒體檔案驗證失敗');
        return;
      }

      setRecordingStatus(`正在處理檔案: ${file.name}...`);
      
      // 將 File 轉換為 Blob
      const normalizedType = normalizeMimeType(file.type) || inferMimeFromExtension(file.name) || file.type || 'audio/m4a';
      const fileBlob = new Blob([file], { type: normalizedType });
      const estimatedDuration = await getBlobDuration(fileBlob).catch(() => 0);
      
      // 直接啟動轉錄流程
      await startTranscriptionJob(fileBlob, file.name, [], estimatedDuration || recordingTime);
      
    } catch (error) {
      console.error('檔案上傳處理失敗:', error);
      setRecordingStatus('檔案處理失敗: ' + (error as Error).message);
      alert('檔案處理失敗: ' + (error as Error).message);
    }
  };

  // 狀態輪詢
  const startStatusPolling = async (meetingId: string, jobId: string) => {
    try {
      const api = getAPI();
      
      await api.pollMeetingStatus(
        meetingId,
        (status) => {
          console.log('狀態更新:', status);
          
          const progressMessage = JOB_STATUS_HINTS[status.status] || recordingStatus;
          const progressValue = status.progress ?? 0;

          // 更新作業狀態
          updateJob(jobId, {
            status: status.status,
            progress: progressValue,
            progressMessage
          });
          
          // 更新錄音狀態顯示
          setRecordingStatus(progressMessage);
        },
        2000, // 每2秒輪詢一次
        150   // 最多5分鐘
      );
      
      // 處理完成後獲取結果
      const result = await api.getMeetingResult(meetingId);
      console.log('轉錄結果:', result);
      
      // 更新作業結果（統一轉為繁體）
      let minutesMd = result.summary?.minutesMd || '';
      let transcriptText = result.transcript?.segments?.map(s => s.text).join('\n') || '';
      let transcriptSegments = result.transcript?.segments || [];
      try {
        const { toTW } = await import('./utils/zhConvert');
        minutesMd = await toTW(minutesMd);
        transcriptText = await toTW(transcriptText);
        transcriptSegments = await Promise.all(
          (transcriptSegments || []).map(async (s: any) => ({ ...s, text: await toTW(s.text || '') }))
        );
      } catch {}

      updateJob(jobId, {
        transcript: transcriptText,
        transcriptSegments,
        summary: minutesMd,
        status: 'done',
        progress: 100,
        progressMessage: JOB_STATUS_HINTS.done
      });
      
      setRecordingStatus('轉錄完成！可在結果頁查看詳細內容');
      
    } catch (error) {
      console.error('狀態輪詢失敗:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      updateJob(jobId, {
        status: 'failed',
        errorMessage,
        progressMessage: `${JOB_STATUS_HINTS.failed}：${errorMessage}`
      });
      setRecordingStatus('轉錄處理失敗: ' + errorMessage);
    }
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'record': {
        const permissionState = hasAudioPermission === false ? 'danger' : hasAudioPermission === true ? 'success' : 'warning';

        const latestJob = jobs[0];
        const activeJob = jobs.find(job => job.status !== 'done' && job.status !== 'failed');
        const failedJob = latestJob && latestJob.status === 'failed' ? latestJob : null;
        const completedJob = latestJob && latestJob.status === 'done' ? latestJob : null;

        let bannerVariant: 'success' | 'warning' | 'danger' | 'info' = permissionState;
        let bannerIcon: React.ReactNode = permissionState === 'danger'
          ? <Icon name="warning" />
          : hasAudioPermission === true
            ? <Icon name="success" />
            : <Icon name="info" />;
        let bannerTitle = permissionState === 'danger' ? '權限問題' : hasAudioPermission === true ? '裝置準備就緒' : '權限檢查中';
        let bannerDesc = recordingStatus;
        let bannerProgress: number | null = null;

        if (hasAudioPermission === false) {
          bannerVariant = 'danger';
          bannerIcon = <Icon name="warning" />;
          bannerTitle = '麥克風權限被拒絕';
          bannerDesc = '請前往系統設定 > 隱私權與安全性 > 麥克風，允許此應用使用麥克風。';
        } else if (activeJob) {
          bannerVariant = 'info';
          bannerIcon = <Icon name="info" />;
          bannerTitle = `正在處理：${activeJob.filename}`;
          const hint = activeJob.progressMessage || JOB_STATUS_HINTS[activeJob.status] || '任務處理中';
          bannerDesc = hint;
          const progressValue = activeJob.progress ?? 0;
          bannerProgress = Math.max(8, Math.min(100, progressValue));
        } else if (failedJob) {
          bannerVariant = 'danger';
          bannerIcon = <Icon name="error" />;
          bannerTitle = `處理失敗：${failedJob.filename}`;
          const message = failedJob.progressMessage || failedJob.errorMessage || JOB_STATUS_HINTS.failed;
          bannerDesc = message;
        } else if (completedJob) {
          bannerVariant = 'success';
          bannerIcon = <Icon name="success" />;
          bannerTitle = `轉錄完成：${completedJob.filename}`;
          bannerDesc = completedJob.progressMessage || JOB_STATUS_HINTS.done;
        } else if (hasAudioPermission === null) {
          bannerVariant = 'warning';
          bannerIcon = <Icon name="info" />;
          bannerTitle = '權限檢查中';
          bannerDesc = '正在檢查麥克風權限...';
        } else {
          bannerVariant = 'success';
          bannerIcon = <Icon name="success" />;
          bannerTitle = '裝置準備就緒';
          bannerDesc = recordingStatus || '已獲得麥克風權限，準備就緒';
        }

        const recordModes: Array<{ id: typeof recordingMode; title: string; description: string }> = [
          { id: 'both', title: '混合模式 (推薦)', description: '同時錄製系統音訊與麥克風，適合線上會議' },
          { id: 'system', title: '系統聲音', description: '僅擷取系統播放的聲音，適合線上會議' },
          { id: 'microphone', title: '麥克風', description: '僅擷取麥克風輸入，適合訪談或現場記錄' }
        ];

        const currentTask = jobs[0];
        const completedJobs = jobs.filter(job => job.status === 'done').slice(0, 2);

        const timelineSteps: Array<{ key: MeetingStatus; label: string }> = [
          { key: 'queued', label: '排隊' },
          { key: 'stt', label: '語音轉文字' },
          { key: 'summarize', label: '摘要生成' },
          { key: 'done', label: '完成' }
        ];

        const renderRecordingSession = () => (
          <div className="recording-session">
            <div className="recording-session__badge">
              <span className="recording-session__dot" />
              <span>錄音進行中</span>
            </div>
            <div className="recording-session__time">{formatTime(recordingTime)}</div>
            <div className="recording-session__buttons">
              <button onClick={stopRecording} className="btn btn--surface btn--xl">停止錄音</button>
              <button onClick={cancelRecording} className="btn btn--danger btn--xl">取消錄音</button>
            </div>
            <p className="recording-session__hint">取消後本段錄音不會保存或進行轉錄。</p>
          </div>
        );

        const handleRetryJob = async (job: typeof jobs[number]) => {
          // 1) 若本機暫存錄音存在於記憶列表，直接使用
          const draft = recordings.find(r => r.filename === job.filename);
          if (draft) {
            startTranscriptionJob(draft.blob, draft.filename, draft.chunks || [], draft.duration, { sourcePath: draft.filePath });
            return;
          }

          // 2) 嘗試用作業記錄中的 audioFile 重新讀取
          if (job.audioFile) {
            try {
              const existsRes = await window.electronAPI.recording.fileExists(job.audioFile);
              if (existsRes?.success && existsRes.exists) {
                const readRes = await window.electronAPI.recording.readFile(job.audioFile);
                if (readRes?.success && readRes.buffer) {
                  const extMime = inferMimeFromExtension(job.filename) || inferMimeFromExtension(job.audioFile) || 'audio/wav';
                  const blob = new Blob([readRes.buffer], { type: extMime });
                  const duration = await getBlobDuration(blob).catch(() => 0);
                  startTranscriptionJob(blob, job.filename, [], duration || recordingTime, { sourcePath: job.audioFile });
                  return;
                }
              }
            } catch {}
          }

          // 3) 找不到或已被清理：請使用者手動選擇原始檔案
          const pick = await (window.electronAPI as any)?.dialog?.openFile?.();
          if (pick && !pick.canceled && pick.filePath) {
            try {
              const readRes = await window.electronAPI.recording.readFile(pick.filePath);
              if (readRes?.success && readRes.buffer) {
                const chosenName = pick.filePath.split(/[\\/]/).pop() || job.filename;
                const extMime = inferMimeFromExtension(chosenName) || 'audio/wav';
                const blob = new Blob([readRes.buffer], { type: extMime });
                const duration = await getBlobDuration(blob).catch(() => 0);
                startTranscriptionJob(blob, chosenName, [], duration || recordingTime, { sourcePath: pick.filePath });
                return;
              }
            } catch (e) {
              console.error('讀取手動選擇的檔案失敗:', e);
            }
          }

          alert('找不到原始錄音檔案，請重新錄製或上傳。');
        };

        return (
          <div className="record-dashboard">
            <div className={`status-bar status-bar--${bannerVariant}`}>
              <div className="status-bar__icon">{bannerIcon}</div>
              <div className="status-bar__content">
                <h1 className="status-bar__title">{bannerTitle}</h1>
                <p className="status-bar__subtitle">{bannerDesc}</p>
                {bannerProgress !== null && (
                  <div className="status-progress">
                    <div className="status-progress__bar" style={{ width: `${bannerProgress}%` }} />
                  </div>
                )}
              </div>
            </div>

            <div className="record-dashboard__grid">
              <section className="quick-panel">
                <header className="quick-panel__header">
                  <div>
                    <h2>快速開始錄音</h2>
                    <p>選擇收音模式並啟動智慧轉錄流程。</p>
                  </div>
                  {hasAudioPermission !== true && (
                    <button className="btn btn--minimal" onClick={testAudioAccess}>重新檢查麥克風</button>
                  )}
                </header>

                {isRecording ? (
                  renderRecordingSession()
                ) : (
                  <div className="quick-panel__cta">
                    <button
                      className="btn btn--primary btn--xl"
                      onClick={startRecording}
                      disabled={hasAudioPermission === false}
                    >
                      開始會議錄音
                      </button>

                    <label className="upload-tile">
                      <div className="upload-tile__icon"><Icon name="upload" /></div>
                      <div>
                        <div className="upload-tile__title">上傳音訊或影片</div>
                        <div className="upload-tile__hint">拖放或點擊選擇，支援 MP3、WAV、MP4 等格式</div>
                      </div>
                      <input
                        type="file"
                        accept="audio/*,video/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(file);
                            e.target.value = '';
                          }
                        }}
                      />
                    </label>
                  </div>
                )}

                <div className="mode-selector">
                  {recordModes.map(option => (
                    <button
                      key={option.id}
                      className={`mode-selector__pill ${recordingMode === option.id ? 'is-active' : ''}`}
                      onClick={() => setRecordingMode(option.id)}
                      type="button"
                    >
                      <span className="mode-selector__title">{option.title}</span>
                      <span className="mode-selector__desc">{option.description}</span>
                    </button>
                  ))}
                </div>

                <div className="mode-selector__hint">
                  {recordingMode === 'both' && '混合模式需授權螢幕分享與麥克風權限。'}
                  {recordingMode === 'system' && '系統聲音模式需授權螢幕分享權限。'}
                  {recordingMode === 'microphone' && '麥克風模式僅需授權麥克風權限。'}
                </div>

                {/* 大型拖放區：填補左側空白並提供直覺上傳 */}
                <div
                  className="quick-panel__dropzone"
                  onDragOver={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLDivElement).classList.add('is-dragover');
                  }}
                  onDragLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).classList.remove('is-dragover');
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLDivElement).classList.remove('is-dragover');
                    const file = e.dataTransfer?.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                >
                  將音訊或影片拖放到此處即可上傳（支援 MP3 · WAV · MP4 等）
                </div>

                <footer className="quick-panel__footer">
                  <div className="quick-panel__stat">
                    <span>錄音儲存路徑</span>
                    <div className="quick-panel__row">
                      <strong className="quick-panel__path" title={settings.recordingSavePath || ''}>{settings.recordingSavePath || '預設下載資料夾'}</strong>
                      <button className="btn btn--surface" onClick={handleChooseSavePath}>選擇…</button>
                    </div>
                  </div>
                  <div className="quick-panel__stat">
                    <span>API 狀態</span>
                    <span className={`chip chip--${getGeminiKey(settings) ? 'success' : 'danger'}`}>
                      {getGeminiKey(settings) ? 'Gemini 金鑰已設定' : '尚未設定金鑰'}
                    </span>
                  </div>
                </footer>

                {recordings.length > 0 && (
                  <div className="draft-list">
                    <div className="draft-list__header">
                      <h3>草稿錄音</h3>
                      <span className="chip chip--neutral">{recordings.length} 筆</span>
                    </div>
                    <div className="draft-list__body">
                      {recordings.map(recording => (
                        <div key={recording.id} className="draft-item">
                          <div>
                          <div className="draft-item__name" title={recording.filename}>{require('./utils/filename').getDisplayName(recording.filename, 'medium')}</div>
                            <div className="draft-item__meta">{recording.timestamp} · {formatTime(recording.duration)} · {(recording.size / 1024).toFixed(1)} KB</div>
                          </div>
                          <div className="draft-item__actions">
                            <button
                              className="btn btn--primary"
                              onClick={() => startTranscriptionJob(
                                recording.blob,
                                recording.filename,
                                recording.chunks || [],
                                recording.duration,
                                { sourcePath: recording.filePath }
                              )}
                            >
                              🎯 開始轉錄
                            </button>
                            <button className="btn btn--minimal" onClick={() => downloadRecording(recording)}>下載</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="task-panel">
                <div className="task-panel__card">
                  <div className="task-panel__header">
                    <div>
                      <h3>目前任務狀態</h3>
                      <p>即時掌握轉錄流程與摘要產出進度。</p>
                    </div>
                    {currentTask && (
                      <span className={`chip chip--${currentTask.status === 'done' ? 'success' : currentTask.status === 'failed' ? 'danger' : 'warning'}`}>
                        {currentTask.status === 'done' ? '已完成' : currentTask.status === 'failed' ? '失敗' : '進行中'}
                      </span>
                    )}
                  </div>

                  {currentTask ? (
                    <>
                      <div className="task-panel__file">
                        <div className="task-panel__file-icon"><Icon name="file" /></div>
                        <div>
                          <div className="task-panel__file-name" title={currentTask.filename}>{require('./utils/filename').getDisplayName(currentTask.filename, 'medium')}</div>
                          <div className="task-panel__file-meta">建立時間：{currentTask.createdAt}</div>
                        </div>
                      </div>

                      <div className="timeline">
                        {timelineSteps.map(step => {
                          const currentIndex = timelineSteps.findIndex(s => s.key === currentTask.status);
                          const stepIndex = timelineSteps.findIndex(s => s.key === step.key);
                          const isCompleted = currentTask.status === 'done' || stepIndex < currentIndex;
                          const isActive = step.key === currentTask.status;
                          return (
                            <div key={step.key} className={`timeline__step ${isCompleted ? 'is-completed' : ''} ${isActive ? 'is-active' : ''}`}>
                              <div className="timeline__dot" />
                              <span className="timeline__label">{step.label}</span>
                            </div>
                          );
                        })}
                      </div>

                      {currentTask.progressMessage && (
                        <div className="task-panel__message">{currentTask.progressMessage}</div>
                      )}

                      <div className="task-panel__actions">
                        {currentTask.status === 'done' && (
                          <button className="btn btn--primary" onClick={() => setCurrentPage('result')}>查看結果</button>
                        )}
                        {currentTask.status === 'failed' && (
                          <button className="btn btn--surface" onClick={() => handleRetryJob(currentTask)}>🔁 重新嘗試</button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="task-panel__empty">
                      <div className="task-panel__empty-icon"><Icon name="clock" /></div>
                      <div className="task-panel__empty-title">尚無進行中的任務</div>
                      <div className="task-panel__empty-text">開始錄音或上傳檔案後，轉錄進度會顯示在這裡。</div>
                    </div>
                  )}
                </div>

                <div className="recent-panel">
                  <div className="recent-panel__header">
                    <h4>最近完成</h4>
                    <button className="btn btn--minimal" onClick={() => setCurrentPage('result')}>檢視全部</button>
                  </div>
                  {completedJobs.length === 0 ? (
                    <p className="recent-panel__empty">尚未有完成的轉錄結果。</p>
                  ) : (
                    <ul className="recent-panel__list">
                      {completedJobs.map(job => (
                        <li key={job.id}>
                          <div>
                            <div className="recent-panel__name" title={job.filename}>{require('./utils/filename').getDisplayName(job.filename, 'medium')}</div>
                            <div className="recent-panel__time">完成時間：{job.createdAt}</div>
                          </div>
                          <button className="btn btn--surface" onClick={() => setCurrentPage('result')}>查看結果</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>
          </div>
        );
      }
      case 'result': {
        const completedJobs = jobs.filter(job => job.status === 'done' && (job.transcript || job.summary));

        if (completedJobs.length === 0) {
          return (
            <div className="page-scroll">
              <div className="jobs-empty" style={{ marginTop: '2rem' }}>
                <div className="empty-state__icon"><Icon name="file" /></div>
                <h3 className="empty-state__title">暫無完成的轉錄結果</h3>
                <p className="empty-state__text">完成轉錄後結果將會顯示在這裡</p>
              </div>
            </div>
          );
        }

        const safeIndex = Math.min(currentJobIndex, completedJobs.length - 1);
        const currentJob = completedJobs[safeIndex];
        // 分頁設定
        const pageSize = 12;
        const totalPages = Math.max(1, Math.ceil(completedJobs.length / pageSize));
        const currentPage = Math.min(Math.max(resultsPage, 1), totalPages);
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        const pagedJobs = completedJobs.slice(start, end);

        const buildExportContent = (job: typeof currentJob) => {
          const summarySection = job.summary ? `會議摘要：
${job.summary}

` : '';
          const transcriptSection = job.transcript ? `完整轉錄：
${job.transcript}` : '';
          return `檔案：${job.filename}
完成時間：${job.createdAt}

${summarySection}${transcriptSection}`;
        };

        const getResultSnippet = (job: typeof currentJob) => {
          const sourceText = job.summary || job.transcript;
          if (!sourceText) {
            return '';
          }
          const plain = sourceText
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/[#>*`\-]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (!plain) {
            return '';
          }
          return plain.length > 110 ? `${plain.slice(0, 110)}…` : plain;
        };

        // 詳情頁（滿版）
        if (isResultDetailsOpen && currentJob) {
          return (
            <div className="result-details">
              {(() => {
                // 準備資料：從 Markdown 解析各區段（概要、決議等），並整合結構化摘要
                const minutesMd = (currentJob.summary || currentJob.result?.summary?.minutesMd || '').trim();
                const parseSections = (md: string): Record<string, string[]> => {
                  const out: Record<string, string[]> = {};
                  if (!md) return out;
                  const lines = md.split(/\r?\n/);
                  let key: string | null = null;
                  for (const raw of lines) {
                    const line = raw.trim();
                    if (!line) continue;
                    const m = line.match(/^##\s+(.+)$/);
                    if (m) { key = m[1].trim(); out[key] = out[key] || []; continue; }
                    // 列表或段落都當作一行
                    if (line.startsWith('-') || line.startsWith('•')) {
                      const normalized = line.replace(/^[-•]\s*/, '').trim();
                      if (key) { (out[key] = out[key] || []).push(normalized); }
                      continue;
                    }
                    if (key) { (out[key] = out[key] || []).push(line); }
                  }
                  return out;
                };

                const sections = parseSections(minutesMd);
                // 同義標題對應，避免不同 Prompt 造成分段落差
                const pick = (names: string[]): string[] => {
                  for (const n of names) {
                    if (sections[n] && sections[n].length) return sections[n];
                  }
                  return [];
                };
                // 摘要全文：直接以整份 minutesMd 扁平化的行為主（避免資訊量流失）
                const overview = Object.values(sections).flat();
                const decisions = pick(['決議與結論', '重要決議', '決議']);
                const highlightsFromMd = pick(['主要重點', '重點摘要', '重點']);

                const summaryObj = currentJob.result?.summary as any;
                // 嚴格模式：只接受模型明確標記的 [高]/[中]/[低]（半形方括號＋空格），其餘不推斷。
                const parsePriorityFromText = (text: string): { clean: string; priority?: 'high'|'medium'|'low' } => {
                  const m = text.match(/^\s*\[(高|中|低)\]\s+(.+)$/);
                  if (!m) return { clean: text.trim() };
                  const lvl = m[1];
                  const clean = m[2].trim();
                  const priority = lvl === '高' ? 'high' : lvl === '中' ? 'medium' : 'low';
                  return { clean, priority };
                };
                const highlightsData = (summaryObj?.highlights && summaryObj.highlights.length > 0)
                  ? (summaryObj.highlights as any[]).map((h: any, i: number) => {
                      if (typeof h === 'string') {
                        const p = parsePriorityFromText(h);
                        return { id: String(i + 1), content: p.clean, priority: p.priority } as any;
                      }
                      // 只接受 'high'|'medium'|'low'，其餘當作無優先級
                      const pr = ((): 'high'|'medium'|'low'|undefined => {
                        const val = (h.priority || '').toString().toLowerCase();
                        return val === 'high' ? 'high' : val === 'medium' ? 'medium' : val === 'low' ? 'low' : undefined;
                      })();
                      return { id: String(i + 1), content: h.text || '', priority: pr } as any;
                    })
                  : highlightsFromMd.map((t, i) => {
                      const p = parsePriorityFromText(t);
                      // 僅在模型明確輸出 [高]/[中]/[低] 時標記；沒有就不標
                      return { id: String(i + 1), content: p.clean, priority: p.priority } as any;
                    });

                const decisionsData = decisions.map((t, i) => ({ id: String(i + 1), content: t }));

                const parseTodoFromText = (line: string) => {
                  // 支援：事項：…｜負責人：…｜期限：MM/DD｜狀態：進行中
                  const parts = line.split(/\s*[｜|]\s*/);
                  let task = line, owner: string|undefined, due: string|undefined, status: 'pending'|'in-progress'|'completed'|undefined;
                  for (const part of parts) {
                    if (/事項[:：]/.test(part)) task = part.replace(/事項[:：]/, '').trim();
                    if (/負責人[:：]/.test(part)) owner = part.replace(/負責人[:：]/, '').trim();
                    if (/(期限|到期|日期)[:：]/.test(part)) due = part.replace(/(期限|到期|日期)[:：]/, '').trim();
                    if (/狀態[:：]/.test(part)) {
                      const s = part.replace(/狀態[:：]/, '').trim();
                      if (/完成/.test(s)) status = 'completed'; else if (/進行/.test(s)) status = 'in-progress'; else status = 'pending';
                    }
                  }
                  return { task: task.trim(), owner, due, status: status || 'pending' };
                };
                const todosData = (summaryObj?.todos && (summaryObj.todos as any[]).length > 0)
                  ? ((summaryObj.todos as any[]).map((t: any, i: number) => ({ id: String(i + 1), task: t.task || t.text || '', assignee: t.owner, dueDate: t.due || t.deadline, status: ((): any => { const s = (t.status || '').toString(); if (/完成/.test(s)) return 'completed'; if (/進行/.test(s)) return 'in-progress'; return 'pending'; })() })))
                  : ((sections['待辦事項'] || []).map((line: string, i: number) => { const parsed = parseTodoFromText(line); return { id: String(i + 1), task: parsed.task, assignee: parsed.owner, dueDate: parsed.due, status: parsed.status as any }; }));

                const timelineData = ((currentJob.timelineItems && currentJob.timelineItems.length > 0)
                  ? currentJob.timelineItems
                  : (summaryObj?.timeline || [])
                ).map((t: any, i: number) => ({
                  id: String(i + 1),
                  time: t.timeRange || t.time || undefined,
                  title: t.item,
                  description: t.desc || ''
                }));

                // 若 MD 中沒有 overview，退而用整份 minutesMd 的前幾段
                const overviewFallback = () => {
                  if (!minutesMd) return [] as string[];
                  const paras = minutesMd
                    .split(/\r?\n/)
                    .map(l => l.trim())
                    .filter(Boolean)
                    .filter(l => !/^#/.test(l))
                    .map(l => l.replace(/^[-•]\s*/, ''));
                  return paras.slice(0, 6);
                };

                const isProcessing = currentJob.status !== 'done' && currentJob.status !== 'failed';
                
                const parseTsToSeconds = (ts?: string): number | null => {
                  if (!ts) return null;
                  const start = ts.split('-')[0];
                  const parts = start.split(':').map(Number);
                  if (parts.some(n => Number.isNaN(n))) return null;
                  return (parts.length === 3)
                    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                    : parts[0] * 60 + parts[1];
                };
                const handleJumpToTranscript = (item: { time?: string }) => {
                  const startSec = parseTsToSeconds(item.time);
                  setResultViewMode('transcript');
                  setTimeout(() => {
                    if (startSec == null || !currentJob.transcriptSegments || currentJob.transcriptSegments.length === 0) {
                      transcriptContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      return;
                    }
                    let idx = currentJob.transcriptSegments.findIndex(seg => {
                      const s = typeof seg.start === 'number' ? seg.start : (parseTsToSeconds(String(seg.start)) ?? 0);
                      return s >= (startSec as number);
                    });
                    if (idx < 0) idx = 0;
                    const targetEl = transcriptItemRefs.current[idx];
                    targetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 50);
                };

                const renderDetailBody = () => {
                  if (resultViewMode === 'transcript') {
                    if (!currentJob.transcript) {
                      return (
                        <div className="jobs-empty" style={{ border: 'none', background: 'transparent', padding: '2rem' }}>
                          <p className="empty-state__text">尚未產出逐字稿內容</p>
                        </div>
                      );
                    }
                    if (currentJob.transcriptSegments && currentJob.transcriptSegments.length > 0) {
                      return (
                        <div>
                          <TranscriptToolbarKit
                            query={transcriptQuery}
                            onQueryChange={setTranscriptQuery}
                            speakers={[...new Set(currentJob.transcriptSegments.map(s => s.speaker).filter(Boolean) as string[])]}
                            speaker={transcriptSpeaker}
                            onSpeakerChange={setTranscriptSpeaker}
                            onCopy={() => {
                              const content = buildExportContent(currentJob);
                              window.electronAPI?.clipboard?.writeText?.(content);
                            }}
                            onDownload={() => {
                              const blob = new Blob([buildExportContent(currentJob)], { type: 'text/plain;charset=utf-8' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${currentJob.filename.replace(/\.[^/.]+$/, '')}-transcript.txt`;
                              document.body.appendChild(a);
                              a.click();
                              URL.revokeObjectURL(url);
                              a.remove();
                            }}
                          />
                          <div className="result-transcript-list" ref={transcriptContainerRef}>
                            {currentJob.transcriptSegments
                              .filter(seg => (transcriptSpeaker ? seg.speaker === transcriptSpeaker : true))
                              .filter(seg => (transcriptQuery ? (seg.text?.toLowerCase()?.includes(transcriptQuery.toLowerCase())) : true))
                              .map((segment, idx) => {
                                const startLabel = typeof segment.start === 'number' ? formatSecondsToTimestamp(segment.start) : (segment.start as string) ?? '--:--';
                                const endLabel = typeof segment.end === 'number' ? formatSecondsToTimestamp(segment.end) : (segment.end as string) ?? '--:--';
                                return (
                                  <div ref={(el) => { transcriptItemRefs.current[idx] = el; }} key={`${segment.start}-${segment.end}-${idx}`} className="transcript-item">
                                    <div>
                                      <div className="transcript-item__speaker">{segment.speaker}</div>
                                      <div className="transcript-item__time">{startLabel} - {endLabel}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>{segment.text}</div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    }
                    return <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{currentJob.transcript}</div>;
                  }
                  // summary mode
                  return (
                    <>
                      <SummaryCardKit summary={overview.length ? overview : overviewFallback()} fullContent={overview.length ? overview : overviewFallback()} />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <HighlightsCardKit items={highlightsData} />
                        <DecisionsCardKit items={decisionsData} />
                        <TodosCardKit items={todosData} />
                      </div>
                      <TimelineCardKit items={timelineData} onJump={handleJumpToTranscript} />
                      <div className="flex justify-end mt-2">
                        <button className="btn btn--surface" onClick={async () => {
                          try {
                            const tl = await geminiClient.generateTimelineOutline(
                              (currentJob.transcriptSegments || []).map(s => ({ start: typeof s.start === 'number' ? s.start : 0, end: typeof s.end === 'number' ? s.end : undefined, text: s.text }))
                            );
                            const normalized = tl.map((t: any, i: number) => ({ id: String(i + 1), time: t.time, title: t.item, description: t.desc || '' }));
                            updateJob(currentJob.id, { timelineItems: normalized });
                          } catch (e) {
                            console.warn('重跑時間軸失敗:', e);
                          }
                        }}>重跑時間軸</button>
                      </div>
                      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[#0F172A] font-semibold">模型原始摘要（Markdown）</h4>
                          <button className="btn btn--surface" onClick={() => setShowRawSummary(v => !v)}>{showRawSummary ? '收合' : '查看'}</button>
                        </div>
                        {showRawSummary && (
                          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace', fontSize: 13, color: '#334155' }}>
                            {currentJob.summary || '（無）'}
                          </pre>
                        )}
                      </section>
                    </>
                  );
                };

                return (
                  <>
                    <KitResultHeader
                      fileName={currentJob.filename}
                      completedTime={currentJob.createdAt}
                      currentMode={resultViewMode}
                      onModeChange={(m) => setResultViewMode(m)}
                      onBack={() => setIsResultDetailsOpen(false)}
                      files={completedJobs.map(j => ({ id: j.id, label: j.filename }))}
                      onSelectFile={(id) => {
                        const idx = completedJobs.findIndex(j => j.id === id);
                        if (idx >= 0) setCurrentJobIndex(idx);
                      }}
                      showProgress={isProcessing}
                      progressValue={currentJob.progress || 0}
                      estimatedTime={currentJob.progressMessage?.match(/預估剩餘\s([^）]+)/)?.[1] || '--:--'}
                    />

                    <ProgressBar progress={currentJob.progress || 0} isVisible={isProcessing} />

                    <div className="result-content">
                      <div className="result-body result-single">{renderDetailBody()}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          );
        }

        // 清單頁
        return (
          <div className="page-scroll page-scroll--flush">
            <div className="result-layout">
              <div className="result-toolbar">
                <div className="page-heading">
                  <h2 className="page-heading__title">會議轉錄結果</h2>
                </div>
              </div>

              <div className="result-collection">
                {pagedJobs.map((job, index) => {
                  const isActive = index === safeIndex;
                  const snippet = getResultSnippet(job);
                  return (
                    <div
                      key={job.id}
                      className={`result-card ${isActive ? 'is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setCurrentJobIndex(index);
                        setIsResultDetailsOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setCurrentJobIndex(index);
                          setIsResultDetailsOpen(true);
                        }
                      }}
                    >
                      <div className="result-card__header">
                        <div className="result-card__title" title={job.filename}>{require('./utils/filename').getDisplayName(job.filename, 'medium')}</div>
                        <button
                          type="button"
                          className="result-card__delete"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleDeleteJob(job.id);
                          }}
                          title="刪除轉錄結果"
                        >
                          刪除
                        </button>
                      </div>
                      <div className="result-card__meta">完成時間：{job.createdAt}</div>
                      {/* 統一不顯示本機檔案路徑，避免洩露/過長干擾版面 */}
                      {snippet && (
                        <p className="result-card__snippet">{snippet}</p>
                      )}
                      <div className="result-card__footer">
                        <span className="chip chip--success">已完成</span>
                        <button
                          type="button"
                          className="result-card__view"
                          onClick={(event) => {
                            event.stopPropagation();
                            setCurrentJobIndex(index);
                            setIsResultDetailsOpen(true);
                          }}
                        >
                          查看
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    className="btn btn--surface"
                    disabled={currentPage <= 1}
                    onClick={() => setResultsPage(p => Math.max(1, p - 1))}
                  >上一頁</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button
                      key={p}
                      type="button"
                      className="btn btn--minimal"
                      style={{
                        background: p === currentPage ? 'rgba(226,232,240,0.9)' : undefined,
                        border: '1px solid rgba(226,232,240,0.8)'
                      }}
                      onClick={() => setResultsPage(p)}
                    >{p}</button>
                  ))}
                  <button
                    type="button"
                    className="btn btn--surface"
                    disabled={currentPage >= totalPages}
                    onClick={() => setResultsPage(p => Math.min(totalPages, p + 1))}
                  >下一頁</button>
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'settings':
        return (
          <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', textAlign: 'left' }}><SettingsPage /></div>
        );
      case 'stt':
        return (
          <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', textAlign: 'left' }}><GoogleSTTSettingsPage /></div>
        );
      case 'prompts':
        return <PromptsPage />;
      default:
        return <div>Unknown page</div>;
    }
  };

  const activeJobCountValue = jobs.filter(job => job.status !== 'done' && job.status !== 'failed').length;
  const completedJobCountValue = jobs.filter(job => job.status === 'done').length;
  const pageMeta = PAGE_META[currentPage];
  const isRecordPage = currentPage === 'record';
  const useFluidContent =
    currentPage === 'record' ||
    currentPage === 'prompts' ||
    currentPage === 'settings' ||
    (currentPage === 'result' && isResultDetailsOpen);

  return (
    <div className="app-shell">
      <SimpleNavigation
        currentPage={currentPage === 'stt' ? 'settings' : currentPage}
        onPageChange={setCurrentPage as any}
        jobCount={jobs.length}
        activeJobCount={activeJobCountValue}
        completedJobCount={completedJobCountValue}
        settings={settings}
        appVersion={appVersion}
        updateStatus={updateStatusMessage}
        updateAvailable={updateAvailable}
        updateDownloaded={updateDownloaded}
        updateProgress={updateProgress}
        updateInfo={updateInfo}
        onCheckUpdates={handleCheckUpdates}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
      />

      <div className={`app-main${isRecordPage ? ' app-main--record' : ''}`}>
        {!isRecordPage && !(currentPage === 'result' && isResultDetailsOpen) && (
          <header className="app-main__header">
            <div className="page-heading">
              <h1 className="page-heading__title">{pageMeta.title}</h1>
              <p className="page-heading__subtitle">{pageMeta.subtitle}</p>
            </div>
          </header>
        )}

        <div className={`app-main__content${useFluidContent ? ' app-main__content--fluid' : ''}${currentPage === 'settings' ? ' app-main__content--settings' : ''}`}>
          {renderCurrentPage()}
        </div>
      </div>
    </div>
  );
};

export default App;
