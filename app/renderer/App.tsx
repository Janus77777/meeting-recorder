import React, { useState } from 'react';
import { SimpleNavigation } from './components/SimpleNavigation';
import { initializeAPI, getAPI, updateAPISettings } from './services/api';
import { GeminiAPIClient } from './services/geminiApi';
import { AppSettings, STTTranscriptionResponse, STTTranscriptSegment, TranscriptSegment } from '@shared/types';
import { useSettingsStore, useUIStore, useJobsStore, initializeStores } from './services/store';
import PromptsPage from './pages/PromptsPage';
import { SettingsPage } from './pages/SettingsPage';
import { VocabularyService } from './services/vocabularyService';
import { mergeMediaStreams, requestMicrophoneStream, requestSystemAudioStream, stopStream } from './utils/audioCapture';
import { joinPath, normalizePath } from './utils/path';

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
    chunks?: Blob[];
  }>>([]);
  
  // 使用 Zustand store 管理設定和作業
  const { settings, updateSettings } = useSettingsStore();
  const { jobs, addJob, updateJob } = useJobsStore();
  
  // 追蹤設定是否已從 localStorage 恢復
  const [isSettingsHydrated, setIsSettingsHydrated] = useState(false);
  
  // 追蹤正在處理的轉錄任務，防止重複執行
  const [processingJobs, setProcessingJobs] = useState<Set<string>>(new Set());
  
  // 結果頁面的分頁狀態
  const [currentJobIndex, setCurrentJobIndex] = useState(0);
  
  // 結果頁面的顯示模式：'summary' | 'transcript'
  const [resultViewMode, setResultViewMode] = useState<'summary' | 'transcript'>('summary');

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
        start: formatSecondsToTimestamp(seg.startTime),
        end: formatSecondsToTimestamp(seg.endTime),
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
      const audio = document.createElement('audio');
      const url = URL.createObjectURL(blob);

      const cleanup = () => {
        URL.revokeObjectURL(url);
        audio.remove();
      };

      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        cleanup();
        if (!Number.isFinite(duration)) {
          reject(new Error('無法取得音訊長度'));
        } else {
          resolve(duration);
        }
      };

      audio.onerror = () => {
        cleanup();
        reject(new Error('音訊載入失敗'));
      };

      audio.src = url;
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
      if (navigator.permissions && navigator.permissions.query) {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        console.log('麥克風權限狀態:', permissionStatus.state);
        
        if (permissionStatus.state === 'granted') {
          setHasAudioPermission(true);
          setRecordingStatus('已獲得麥克風權限，準備就緒');
        } else if (permissionStatus.state === 'denied') {
          setHasAudioPermission(false);
          setRecordingStatus('麥克風權限被拒絕');
        } else {
          setHasAudioPermission(null);
          setRecordingStatus('需要麥克風權限');
        }
      } else {
        console.log('不支援權限查詢，將直接嘗試訪問');
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('成功獲得音訊串流:', stream);
      
      // 測試完成，立即關閉
      stream.getTracks().forEach(track => track.stop());
      
      setHasAudioPermission(true);
      setRecordingStatus('麥克風測試成功！可以開始錄音');
      return true;
    } catch (error) {
      console.error('無法訪問麥克風:', error);
      setHasAudioPermission(false);
      setRecordingStatus('無法訪問麥克風：' + (error as Error).message);
      return false;
    }
  };

  // 測試系統聲音權限（簡化版本）
  const testSystemAudioAccess = async () => {
    try {
      setRecordingStatus('正在測試系統聲音權限...');
      console.log('🎵 開始測試系統聲音權限...');
      
      // 檢查 electronAPI 是否可用
      const electronAPI = (window as any).electronAPI;
      if (!electronAPI) {
        console.error('❌ window.electronAPI 未定義');
        setRecordingStatus('❌ electronAPI 未定義');
        return false;
      }
      
      console.log('✅ electronAPI 可用，方法:', Object.keys(electronAPI));
      
      if (typeof electronAPI.getAudioSources !== 'function') {
        console.error('❌ electronAPI.getAudioSources 不存在');
        setRecordingStatus('❌ getAudioSources 方法不存在');
        return false;
      }
      
      console.log('✅ getAudioSources 方法存在，開始調用...');
      setRecordingStatus('✅ API 檢查完成，系統聲音功能可用');
      return true;
      
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
          throw new Error(reason);
        } else {
          console.warn('⚠️ 系統聲音獲取失敗，繼續使用麥克風:', systemResult.error);
          if (systemResult.error) {
            setRecordingStatus(`系統聲音取得失敗：${systemResult.error}，將僅錄製麥克風`);
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
        const audioBlob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        console.log('最終音訊檔案大小:', audioBlob.size, '位元組');
        
        // 生成檔名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const modeLabel = recordingMode === 'both' ? 'mixed' : recordingMode === 'system' ? 'system' : 'mic';
        const filename = `meeting-${modeLabel}-${timestamp}.webm`;
        
        try {
          // 自動保存錄音檔案
          await saveRecordingFile(audioBlob, filename);
          
          // 保存錄音記錄到應用狀態
          const newRecording = {
            id: Date.now().toString(),
            filename,
            blob: audioBlob,
            timestamp: new Date().toLocaleString('zh-TW'),
            duration: recordingTime,
            size: audioBlob.size,
            chunks: [...chunks]
          };
          
          setRecordings(prev => [newRecording, ...prev]);
          setRecordingStatus(`錄音完成！檔案已自動保存: ${filename} (${(audioBlob.size / 1024).toFixed(1)} KB)`);
          setAudioChunks([...chunks]); // 保存原始音訊片段供後續使用
          
        } catch (error) {
          console.error('錄音保存失敗:', error);
          setRecordingStatus('錄音保存失敗: ' + (error as Error).message);
        }
        
        // 清理所有音訊流
        activeStreams.forEach(stream => {
          console.log('關閉音訊串流');
          stopStream(stream);
        });
        
        setSystemStream(null);
        setMicrophoneStream(null);
        
        // 自動啟動轉錄流程
        startTranscriptionJob(audioBlob, filename, [...chunks], recordingTime);
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
  const saveRecordingFile = async (blob: Blob, filename: string) => {
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
    durationSeconds: number = recordingTime
  ) => {
    // 防止重複執行：檢查是否已經在處理相同檔案
    if (processingJobs.has(filename)) {
      console.log('⚠️ 轉錄任務已在進行中，跳過重複執行:', filename);
      return;
    }
    
    // 標記為處理中
    setProcessingJobs(prev => new Set([...prev, filename]));
    
    try {
      console.log('開始轉錄流程:', filename);
      
      // 創建作業記錄
      const jobId = Date.now().toString();
      const newJob = {
        id: jobId,
        meetingId: jobId, // 使用 jobId 作為 meetingId
        filename: filename,
        title: filename, // 使用檔案名作為標題
        participants: [], // 錄音沒有參與者信息
        status: 'queued' as const,
        progress: 0,
        createdAt: new Date().toLocaleString('zh-TW')
      };
      
      addJob(newJob);
      
      const mode = settings.transcriptionMode || (settings.useGemini ? 'gemini_direct' : 'hybrid_stt');

      if (mode === 'hybrid_stt') {
        console.log('使用 Google STT + Gemini 混合模式進行轉錄');
        await startHybridSTTTranscription(audioBlob, filename, jobId, originalChunks, durationSeconds);
      } else if (settings.useGemini && settings.geminiApiKey) {
        console.log('使用 Google Gemini API 進行轉錄');
        await startGeminiTranscription(audioBlob, filename, jobId, originalChunks, durationSeconds);
      } else {
        console.log('使用原有 API 進行轉錄');
        await startOriginalApiTranscription(audioBlob, filename, jobId, originalChunks, durationSeconds);
      }
      
    } catch (error) {
      console.error('轉錄流程啟動失敗:', error);
      setRecordingStatus('轉錄啟動失敗: ' + (error as Error).message);
    } finally {
      // 清除處理狀態，允許重新執行
      setProcessingJobs(prev => {
        const newSet = new Set(prev);
        newSet.delete(filename);
        return newSet;
      });
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

      const sttSegments = createSTTAudioSegments(audioBlob, originalChunks, prepareResult.durationSeconds ?? durationSeconds);
      console.log('📼 Google STT 分段資訊:', sttSegments.map(s => ({ index: s.index + 1, duration: s.duration })));

      const aggregatedSegments: STTTranscriptSegment[] = [];
      const transcriptParts: string[] = [];

      let enableSpeakerDiarization = sttSettings.enableSpeakerDiarization ?? true;
      const recognizerIdLower = (sttSettings.recognizerId || '').toLowerCase();
      const modelIdLower = (sttSettings.model || '').toLowerCase();
      const isChirpRecognizer = recognizerIdLower.includes('chirp') || modelIdLower.includes('chirp');
      if (enableSpeakerDiarization && isChirpRecognizer) {
        enableSpeakerDiarization = false;
        console.warn('選用的 Google STT 模型 (Chirp) 不支援說話者分段，已自動停用該功能。');
        setRecordingStatus('目前選用的 Google STT 模型不支援說話者分段，已自動停用該功能。');
      }

      window.electronAPI.stt.onProgress(event => {
        if (event.message) {
          setRecordingStatus(event.message);
        }
        if (typeof event.progress === 'number') {
          updateJob(jobId, { progress: Math.min(90, Math.max(event.progress, 5)) });
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
          languageCode: sttSettings.languageCode || 'zh-TW',
          enableWordTimeOffsets: false,
          enableSpeakerDiarization: false,
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

        const segmentProgress = 10 + Math.floor(((segment.index + 1) / sttSegments.length) * 60);
        updateJob(jobId, { progress: segmentProgress });
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
          start: formatSecondsToTimestamp(segment.start),
          end: formatSecondsToTimestamp(segment.end),
          speaker: `Segment ${idx + 1}`,
          text: (transcriptParts[idx] || finalTranscript)
            .replace(/\s+/g, ' ')
            .trim()
        }));
      }

      if (!finalTranscript) {
        throw new Error('無法取得 Google STT 轉錄結果');
      }

      if (settings.vocabularyList && settings.vocabularyList.length > 0) {
        finalTranscript = VocabularyService.applyVocabularyCorrections(finalTranscript, settings.vocabularyList);
      }

      setRecordingStatus('Google STT 完成，準備生成會議摘要...');
      updateJob(jobId, { progress: 80, status: 'summarize' });

      const geminiClient = new GeminiAPIClient(geminiKey, {
        preferredModel: currentSettings.geminiPreferredModel,
        enableFallback: currentSettings.geminiEnableFallback,
        retryConfig: currentSettings.geminiRetryConfig,
        diagnosticMode: currentSettings.geminiDiagnosticMode
      });

      let summaryMarkdown = '';
      let overallSummary = '';

      if (settings.customSummaryPrompt) {
        const summaryText = await geminiClient.generateCustomSummary(finalTranscript, settings.customSummaryPrompt);
        summaryMarkdown = summaryText;
        overallSummary = summaryText;
      } else {
        const structuredSummary = await geminiClient.generateStructuredSummaryFromTranscript(finalTranscript);
        summaryMarkdown = structuredSummary.minutesMd;
        overallSummary = structuredSummary.overallSummary;
      }

      updateJob(jobId, {
        status: 'done',
        progress: 100,
        transcript: finalTranscript,
        transcriptSegments: formattedSegments,
        summary: summaryMarkdown
      });

      setRecordingStatus('Google STT 轉錄完成！可到「任務」或「結果」頁面查看');

    } catch (error) {
      console.error('Google STT 轉錄失敗:', error);
      updateJob(jobId, { status: 'failed' });
      setRecordingStatus('Google STT 轉錄失敗：' + (error instanceof Error ? error.message : String(error)));
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

        const uploadProgress = 5 + Math.floor(((segment.index + 1) / segments.length) * 25);
        updateJob(jobId, { progress: uploadProgress });

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

      const parsedResult = geminiClient.parseTranscriptionResult(combinedTranscriptRaw);
      updateJob(jobId, { progress: 80 });
      
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
      if (settings.customSummaryPrompt) {
        setRecordingStatus('逐字稿完成，等待後再生成自訂摘要...');
        
        // 添加延遲以避免請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 3000));
        setRecordingStatus('開始生成自訂摘要...');
        
        try {
          const customSummaryResult = await geminiClient.generateCustomSummary(
            parsedResult.transcript.fullText,
            settings.customSummaryPrompt
          );
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
      
      // 6. 更新作業狀態為完成
      updateJob(jobId, {
        status: 'done',
        progress: 100,
        transcript: parsedResult.transcript.fullText,
        summary: finalSummary.minutesMd
      });
      
      setRecordingStatus('Gemini 轉錄完成！可到「任務」或「結果」頁面查看');
      
    } catch (error) {
      console.error('Gemini 轉錄失敗:', error);
      updateJob(jobId, { status: 'failed' });

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
          suggestions = [
            '檢查網路連接和 API 設定',
            '查看詳細錯誤日誌',
            '嘗試重新啟動應用程式'
          ];
        }
      } else {
        errorMessage = '未知錯誤';
        suggestions = ['請重試或聯繫技術支援'];
      }

      const fullMessage = `❌ ${errorMessage}\n\n💡 建議解決方案:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
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
      
      // 檢查檔案大小 (限制 50MB)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        alert('檔案太大！請選擇小於 50MB 的音訊檔案。');
        return;
      }
      
      // 檢查檔案類型
      const allowedTypes = ['audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/ogg', 'audio/mpeg'];
      if (!allowedTypes.includes(file.type) && !file.type.startsWith('audio/')) {
        alert('不支援的檔案格式！請選擇音訊檔案。');
        return;
      }
      
      setRecordingStatus(`正在處理檔案: ${file.name}...`);
      
      // 將 File 轉換為 Blob
      const fileBlob = new Blob([file], { type: file.type });
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
          
          // 更新作業狀態
          updateJob(jobId, { status: status.status, progress: status.progress || 0 });
          
          // 更新錄音狀態顯示
          const statusMap = {
            queued: '排隊中...',
            stt: '語音轉文字中...',
            summarize: '生成摘要中...',
            done: '轉錄完成！',
            failed: '轉錄失敗'
          };
          
          setRecordingStatus(`${statusMap[status.status]} (${status.progress || 0}%)`);
        },
        2000, // 每2秒輪詢一次
        150   // 最多5分鐘
      );
      
      // 處理完成後獲取結果
      const result = await api.getMeetingResult(meetingId);
      console.log('轉錄結果:', result);
      
      // 更新作業結果
      updateJob(jobId, {
        transcript: result.transcript?.segments?.map(s => s.text).join('\n') || '',
        transcriptSegments: result.transcript?.segments || [],
        summary: result.summary?.minutesMd || ''
      });
      
      setRecordingStatus('轉錄完成！可到「任務」或「結果」頁面查看');
      
    } catch (error) {
      console.error('狀態輪詢失敗:', error);
      updateJob(jobId, { status: 'failed' });
      setRecordingStatus('轉錄處理失敗: ' + (error as Error).message);
    }
  };

  const renderCurrentPage = () => {
    switch (currentPage) {
      case 'record':
        return (
          <div style={{ textAlign: 'center', minWidth: '500px' }}>
            <h2 style={{ color: '#111827', marginBottom: '1rem' }}>錄音頁面</h2>
            
            {/* Status Display */}
            <div style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              backgroundColor: hasAudioPermission === false ? '#fef2f2' : hasAudioPermission === true ? '#f0f9ff' : '#fffbeb',
              borderRadius: '8px',
              border: `1px solid ${hasAudioPermission === false ? '#fecaca' : hasAudioPermission === true ? '#bae6fd' : '#fed7aa'}`
            }}>
              <div style={{ 
                color: hasAudioPermission === false ? '#dc2626' : hasAudioPermission === true ? '#0369a1' : '#d97706',
                fontWeight: 'bold',
                marginBottom: '0.5rem'
              }}>
                {hasAudioPermission === false ? '⚠️ 權限問題' : 
                 hasAudioPermission === true ? '✅ 準備就緒' : 
                 '🔍 檢查中'}
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                {recordingStatus}
              </div>
            </div>

            {/* Recording Interface */}
            {isRecording ? (
              <>
                <div style={{ 
                  marginBottom: '1rem',
                  padding: '1rem',
                  backgroundColor: '#fef2f2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      backgroundColor: '#dc2626',
                      borderRadius: '50%',
                      marginRight: '8px',
                      animation: 'pulse 1.5s ease-in-out infinite'
                    }}></div>
                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>錄音中...</span>
                  </div>
                  <div style={{ 
                    fontSize: '24px', 
                    fontWeight: 'bold', 
                    color: '#111827',
                    fontFamily: 'monospace'
                  }}>
                    {formatTime(recordingTime)}
                  </div>
                </div>
                
                <button 
                  onClick={stopRecording}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: '#6b7280',
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                >
                  ⏹️ 停止錄音
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                {/* 錄音模式選擇 */}
                <div style={{
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  width: '100%',
                  maxWidth: '500px'
                }}>
                  <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '16px', textAlign: 'center' }}>
                    🎯 會議錄音模式
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      backgroundColor: recordingMode === 'both' ? '#dbeafe' : 'white',
                      border: recordingMode === 'both' ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      <input
                        type="radio"
                        name="recordingMode"
                        value="both"
                        checked={recordingMode === 'both'}
                        onChange={(e) => setRecordingMode(e.target.value as any)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', color: '#111827' }}>
                          🔥 混合模式 (推薦)
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          同時錄製系統聲音和麥克風，適合大部分會議場景
                        </div>
                      </div>
                    </label>
                    
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      backgroundColor: recordingMode === 'system' ? '#dbeafe' : 'white',
                      border: recordingMode === 'system' ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      <input
                        type="radio"
                        name="recordingMode"
                        value="system"
                        checked={recordingMode === 'system'}
                        onChange={(e) => setRecordingMode(e.target.value as any)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', color: '#111827' }}>
                          🔊 系統聲音
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          只錄製系統播放的聲音，適合線上會議錄製
                        </div>
                      </div>
                    </label>
                    
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0.75rem',
                      backgroundColor: recordingMode === 'microphone' ? '#dbeafe' : 'white',
                      border: recordingMode === 'microphone' ? '2px solid #3b82f6' : '1px solid #d1d5db',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}>
                      <input
                        type="radio"
                        name="recordingMode"
                        value="microphone"
                        checked={recordingMode === 'microphone'}
                        onChange={(e) => setRecordingMode(e.target.value as any)}
                        style={{ marginRight: '0.75rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', color: '#111827' }}>
                          🎤 麥克風
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          只錄製麥克風輸入，適合單人錄音或訪談
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {hasAudioPermission !== true && (
                    <button 
                      onClick={testAudioAccess}
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      🎤 測試麥克風權限
                    </button>
                  )}
                  
                  <button 
                    onClick={testSystemAudioAccess}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#16a34a',
                      color: 'white',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    🔊 測試系統聲音權限
                  </button>
                </div>
                
                <button 
                  onClick={startRecording}
                  disabled={hasAudioPermission === false}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: hasAudioPermission === false ? '#9ca3af' : '#dc2626',
                    color: 'white',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: hasAudioPermission === false ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}
                >
                  🔴 開始會議錄音
                </button>
                
                <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', maxWidth: '400px' }}>
                  <strong>提示：</strong>
                  {recordingMode === 'both' && '混合模式會要求螢幕分享權限來錄製系統聲音，並要求麥克風權限'}
                  {recordingMode === 'system' && '系統聲音模式會要求螢幕分享權限來錄製應用程式音訊'}
                  {recordingMode === 'microphone' && '麥克風模式只需要麥克風權限，適合個人錄音'}
                </div>
              </div>
            )}

            {/* 檔案上傳區 */}
            <div style={{ 
              marginTop: '2rem', 
              padding: '1.5rem',
              border: '2px dashed #d1d5db',
              borderRadius: '8px',
              backgroundColor: '#fafafa',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#111827', marginBottom: '1rem', fontSize: '16px' }}>
                📁 上傳音訊檔案進行轉錄
              </h3>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file);
                  }
                }}
                style={{
                  marginBottom: '1rem',
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              />
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                支援格式：MP3, WAV, M4A, WebM 等音訊格式
              </div>
            </div>

            {/* 錄音列表 */}
            {recordings.length > 0 && (
              <div style={{ marginTop: '2rem', textAlign: 'left' }}>
                <h3 style={{ color: '#111827', marginBottom: '1rem', textAlign: 'center' }}>
                  錄音檔案 ({recordings.length})
                </h3>
                
                <div style={{ 
                  maxHeight: '300px', 
                  overflowY: 'auto',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  backgroundColor: '#fafafa'
                }}>
                  {recordings.map((recording, index) => (
                    <div key={recording.id} style={{
                      padding: '1rem',
                      borderBottom: index < recordings.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', color: '#111827', marginBottom: '0.25rem' }}>
                          {recording.filename}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {recording.timestamp} · {formatTime(recording.duration)} · {(recording.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: '1rem' }}>
                        <button
                          onClick={() => {
                            // 啟動轉錄流程
                            startTranscriptionJob(recording.blob, recording.filename, recording.chunks || [], recording.duration);
                          }}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: '500'
                          }}
                          title="開始轉錄這個錄音檔案"
                        >
                          🎯 開始轉錄
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case 'jobs':
        return (
          <div style={{ textAlign: 'left', minWidth: '600px' }}>
            <h2 style={{ color: '#111827', marginBottom: '1rem', textAlign: 'center' }}>轉錄任務</h2>
            
            {jobs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                目前沒有轉錄任務
              </div>
            ) : (
              <div style={{ 
                maxHeight: '400px', 
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                backgroundColor: '#fafafa'
              }}>
                {jobs.map((job, index) => {
                  const statusColors = {
                    queued: { bg: '#fef3c7', border: '#fed7aa', text: '#92400e' },
                    stt: { bg: '#dbeafe', border: '#bae6fd', text: '#1e40af' },
                    summarize: { bg: '#e9d5ff', border: '#d8b4fe', text: '#7c3aed' },
                    done: { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46' },
                    failed: { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' }
                  };
                  
                  const statusLabels = {
                    queued: '📋 排隊中',
                    stt: '🎤 語音轉文字中',
                    summarize: '📝 生成摘要中',
                    done: '✅ 完成',
                    failed: '❌ 失敗'
                  };
                  
                  const statusColor = statusColors[job.status];
                  
                  return (
                    <div key={job.id} style={{
                      padding: '1rem',
                      borderBottom: index < jobs.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}>
                      {/* 任務標題和狀態 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 'bold', color: '#111827' }}>
                          {job.filename}
                        </div>
                        <div style={{
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: statusColor.bg,
                          color: statusColor.text,
                          border: `1px solid ${statusColor.border}`
                        }}>
                          {statusLabels[job.status]}
                        </div>
                      </div>
                      
                      {/* 進度條 */}
                      {job.status !== 'done' && job.status !== 'failed' && (
                        <div style={{ 
                          width: '100%',
                          height: '8px',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '4px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${job.progress}%`,
                            backgroundColor: '#3b82f6',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease'
                          }}></div>
                        </div>
                      )}
                      
                      {/* 時間和進度百分比 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                        <span>創建時間: {job.createdAt}</span>
                        <span>進度: {job.progress}%</span>
                      </div>
                      
                      {/* 完成後的操作按鈕 */}
                      {job.status === 'done' && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                          <button
                            onClick={() => setCurrentPage('result')}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            📄 查看結果
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'result':
        const completedJobs = jobs.filter(job => job.status === 'done' && (job.transcript || job.summary));
        
        if (completedJobs.length === 0) {
          return (
            <div style={{ 
              textAlign: 'center', 
              padding: '4rem', 
              color: '#6b7280', 
              minWidth: '800px',
              maxWidth: '1200px',
              margin: '0 auto'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
              <h2 style={{ color: '#111827', marginBottom: '1rem' }}>暫無完成的轉錄結果</h2>
              <p>完成轉錄後結果會顯示在這裡</p>
            </div>
          );
        }

        const currentJob = completedJobs[currentJobIndex];
        const totalPages = completedJobs.length;

        return (
          <div style={{ 
            padding: '1rem',
            width: '100%',
            height: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* 頂部控制行 */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '1rem',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1 style={{ color: '#111827', fontSize: '1.25rem', margin: 0 }}>
                  📄 會議轉錄結果
                </h1>
                
                {/* 顯示模式切換按鈕 */}
                <div style={{ display: 'flex', border: '1px solid #d1d5db', borderRadius: '6px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setResultViewMode('summary')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: resultViewMode === 'summary' ? '#3b82f6' : 'white',
                      color: resultViewMode === 'summary' ? 'white' : '#374151',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    📊 會議總結
                  </button>
                  <button
                    onClick={() => setResultViewMode('transcript')}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: resultViewMode === 'transcript' ? '#3b82f6' : 'white',
                      color: resultViewMode === 'transcript' ? 'white' : '#374151',
                      border: 'none',
                      borderLeft: '1px solid #d1d5db',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}
                  >
                    📝 完整逐字稿
                  </button>
                </div>
              </div>
              
              {/* 分頁導航 */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => setCurrentJobIndex(Math.max(0, currentJobIndex - 1))}
                  disabled={currentJobIndex === 0}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: currentJobIndex === 0 ? '#f3f4f6' : '#e5e7eb',
                    color: currentJobIndex === 0 ? '#9ca3af' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentJobIndex === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ◀
                </button>
                
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentJobIndex(i)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      backgroundColor: i === currentJobIndex ? '#3b82f6' : 'white',
                      color: i === currentJobIndex ? 'white' : '#374151',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      minWidth: '40px'
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                
                <button
                  onClick={() => setCurrentJobIndex(Math.min(totalPages - 1, currentJobIndex + 1))}
                  disabled={currentJobIndex === totalPages - 1}
                  style={{
                    padding: '0.5rem',
                    backgroundColor: currentJobIndex === totalPages - 1 ? '#f3f4f6' : '#e5e7eb',
                    color: currentJobIndex === totalPages - 1 ? '#9ca3af' : '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentJobIndex === totalPages - 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ▶
                </button>
              </div>
            </div>

            {/* 檔案信息條 - 更緊湊 */}
            <div style={{
              marginBottom: '0.75rem',
              padding: '0.4rem 0.8rem',
              backgroundColor: '#f8fafc',
              borderRadius: '4px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
              flexShrink: 0
            }}>
              <span style={{ fontWeight: '500', color: '#1f2937' }}>
                📁 {currentJob.filename}
              </span>
              <span style={{ color: '#6b7280' }}>
                {currentJob.createdAt}
              </span>
            </div>

            {/* 主要內容區域 - 全屏單項顯示 */}
            <div style={{
              flex: 1,
              overflow: 'hidden',
              minHeight: 0,
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* 內容區域 */}
              <div style={{
                flex: 1,
                overflow: 'auto',
                backgroundColor: '#fefefe',
                padding: '1.5rem',
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}>
                {resultViewMode === 'summary' ? (
                  // 會議總結模式
                  currentJob.summary ? (
                    <div style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      lineHeight: '1.8',
                      fontSize: '1rem',
                      color: '#374151'
                    }}>
                      {currentJob.summary}
                    </div>
                  ) : (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '4rem', 
                      color: '#9ca3af',
                      fontStyle: 'italic',
                      fontSize: '1.1rem'
                    }}>
                      暫無會議總結內容
                    </div>
                  )
                ) : (
                  // 完整逐字稿模式
                  currentJob.transcript ? (
                    currentJob.transcriptSegments && currentJob.transcriptSegments.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {currentJob.transcriptSegments.map((segment, index) => {
                          const startLabel = typeof segment.start === 'number'
                            ? formatSecondsToTimestamp(segment.start)
                            : segment.start ?? '--:--';
                          const endLabel = typeof segment.end === 'number'
                            ? formatSecondsToTimestamp(segment.end)
                            : segment.end ?? '--:--';
                          return (
                          <div
                            key={`${segment.start}-${segment.end}-${index}`}
                            style={{
                              backgroundColor: '#fff',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              padding: '1rem',
                              display: 'flex',
                              gap: '1rem',
                              alignItems: 'flex-start',
                              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)'
                            }}
                          >
                            <div style={{
                              minWidth: '100px',
                              fontWeight: 600,
                              color: '#1f2937'
                            }}>
                              {segment.speaker}
                              <div style={{
                                fontSize: '0.75rem',
                                color: '#6b7280',
                                marginTop: '0.25rem'
                              }}>
                                {startLabel} - {endLabel}
                              </div>
                            </div>
                            <div style={{
                              flex: 1,
                              fontSize: '0.95rem',
                              lineHeight: 1.7,
                              color: '#111827'
                            }}>
                              {segment.text}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        lineHeight: '1.8',
                        fontSize: '1rem',
                        color: '#111827'
                      }}>
                        {currentJob.transcript}
                      </div>
                    )
                  ) : (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '4rem', 
                      color: '#9ca3af',
                      fontStyle: 'italic',
                      fontSize: '1.1rem'
                    }}>
                      暫無完整逐字稿內容
                    </div>
                  )
                )}
              </div>
            </div>

            {/* 底部操作按鈕 */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '1rem',
              marginTop: '0.75rem',
              paddingTop: '0.5rem',
              borderTop: '1px solid #e5e7eb',
              flexShrink: 0
            }}>
              <button
                onClick={() => {
                  const content = `檔案：${currentJob.filename}\n完成時間：${currentJob.createdAt}\n\n${currentJob.summary ? '會議摘要：\n' + currentJob.summary + '\n\n' : ''}${currentJob.transcript ? '完整轉錄：\n' + currentJob.transcript : ''}`;
                  navigator.clipboard.writeText(content);
                  alert('已複製到剪貼板！');
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                📋 複製文本
              </button>
              
              <button
                onClick={() => {
                  const element = document.createElement('a');
                  const content = `檔案：${currentJob.filename}\n完成時間：${currentJob.createdAt}\n\n${currentJob.summary ? '會議摘要：\n' + currentJob.summary + '\n\n' : ''}${currentJob.transcript ? '完整轉錄：\n' + currentJob.transcript : ''}`;
                  const file = new Blob([content], { type: 'text/plain; charset=utf-8' });
                  element.href = URL.createObjectURL(file);
                  element.download = `${currentJob.filename}_轉錄結果.txt`;
                  document.body.appendChild(element);
                  element.click();
                  document.body.removeChild(element);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                💾 下載文字檔 (TXT)
              </button>
              
              <button
                onClick={() => {
                  if (confirm('確定要重新處理這個檔案嗎？')) {
                    alert('重新處理功能開發中...');
                  }
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                🔄 重新處理
              </button>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto', textAlign: 'left' }}><SettingsPage /></div>
        );
      case 'prompts':
        return <PromptsPage />;
      default:
        return <div>Unknown page</div>;
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      backgroundColor: '#f9fafb',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Navigation Sidebar */}
      <SimpleNavigation 
        currentPage={currentPage} 
        onPageChange={setCurrentPage}
        jobCount={jobs.length}
        activeJobCount={jobs.filter(job => job.status !== 'done' && job.status !== 'failed').length}
        completedJobCount={jobs.filter(job => job.status === 'done').length}
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

      {/* Main Content */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ 
          padding: '2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100%'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '2rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            minWidth: '400px'
          }}>
            {renderCurrentPage()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
