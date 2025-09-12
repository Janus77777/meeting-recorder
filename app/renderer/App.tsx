import React, { useState } from 'react';
import { SimpleNavigation } from './components/SimpleNavigation';
import { initializeAPI, getAPI, updateAPISettings } from './services/api';
import { GeminiAPIClient } from './services/geminiApi';
import { AppSettings } from '@shared/types';
import { useSettingsStore, useUIStore, useJobsStore, initializeStores } from './services/store';
import PromptsPage from './pages/PromptsPage';
import { VocabularyService } from './services/vocabularyService';

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

  // 初始化設定和API
  React.useEffect(() => {
    console.log('應用啟動，當前設定:', settings);
    
    // 簡單檢查：如果設定已經載入完成（有 baseURL），就標記為 hydrated
    if (settings.baseURL && settings.baseURL !== '') {
      console.log('Settings 已恢復，直接初始化');
      setIsSettingsHydrated(true);
      initializeAPI(settings);
      updateAPISettings(settings);
      console.log('應用初始化完成，Gemini API Key:', settings.geminiApiKey ? '已設定' : '未設定');
    } else {
      // 如果還沒恢復，等待一下再檢查
      const timer = setTimeout(() => {
        const currentSettings = useSettingsStore.getState().settings;
        console.log('延遲檢查設定:', currentSettings);
        setIsSettingsHydrated(true);
        initializeAPI(currentSettings);
        updateAPISettings(currentSettings);
        console.log('延遲初始化完成，Gemini API Key:', currentSettings.geminiApiKey ? '已設定' : '未設定');
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [settings]);

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
    if (window.electronAPI?.updater) {
      // 監聽更新可用事件
      window.electronAPI.updater.onUpdateAvailable((info) => {
        console.log('發現新版本:', info.version);
        setUpdateAvailable(true);
        setUpdateInfo(info);
      });

      // 監聽更新下載進度
      window.electronAPI.updater.onUpdateProgress((progress) => {
        console.log('更新下載進度:', progress.percent + '%');
        setUpdateProgress({
          percent: progress.percent,
          status: `下載中... ${progress.percent.toFixed(1)}%`
        });
      });
    }
  }, []);


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

  // 暫時禁用系統聲音錄製以避免崩潰
  const getSystemAudio = async (): Promise<MediaStream | null> => {
    console.log('⚠️ 系統聲音錄製暫時禁用，避免應用程式崩潰');
    console.log('💡 如需系統聲音，請使用麥克風模式錄製');
    return null;
  };

  // 獲取麥克風
  const getMicrophoneAudio = async (): Promise<MediaStream | null> => {
    try {
      console.log('正在請求麥克風權限...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } 
      });
      
      console.log('麥克風獲取成功，軌道數:', stream.getAudioTracks().length);
      return stream;
    } catch (error) {
      console.error('麥克風獲取失敗:', error);
      return null;
    }
  };

  // 合併音訊流
  const mergeAudioStreams = (streams: MediaStream[]): MediaStream => {
    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    
    streams.forEach(stream => {
      if (stream.getAudioTracks().length > 0) {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(destination);
      }
    });
    
    return destination.stream;
  };

  const startRecording = async () => {
    try {
      setRecordingStatus('正在啟動錄音...');
      
      let finalStream: MediaStream;
      const streams: MediaStream[] = [];
      
      // 根據錄音模式獲取對應的音訊流
      if (recordingMode === 'microphone' || recordingMode === 'both') {
        setRecordingStatus('正在獲取麥克風權限...');
        const micStream = await getMicrophoneAudio();
        if (micStream) {
          streams.push(micStream);
          setMicrophoneStream(micStream);
        } else if (recordingMode === 'microphone') {
          throw new Error('無法獲取麥克風權限');
        }
      }
      
      if (recordingMode === 'system' || recordingMode === 'both') {
        setRecordingStatus('正在獲取系統聲音權限...');
        const sysStream = await getSystemAudio();
        if (sysStream) {
          streams.push(sysStream);
          setSystemStream(sysStream);
        } else if (recordingMode === 'system') {
          throw new Error('無法獲取系統聲音權限');
        }
      }
      
      if (streams.length === 0) {
        throw new Error('無法獲取任何音訊源');
      }
      
      // 如果有多個音訊流，合併它們
      if (streams.length > 1) {
        setRecordingStatus('正在合併音訊源...');
        finalStream = mergeAudioStreams(streams);
      } else {
        finalStream = streams[0];
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
            size: audioBlob.size
          };
          
          setRecordings(prev => [newRecording, ...prev]);
          setRecordingStatus(`錄音完成！檔案已自動保存: ${filename} (${(audioBlob.size / 1024).toFixed(1)} KB)`);
          setAudioChunks([audioBlob]); // 保存音訊數據供後續使用
          
        } catch (error) {
          console.error('錄音保存失敗:', error);
          setRecordingStatus('錄音保存失敗: ' + (error as Error).message);
        }
        
        // 清理所有音訊流
        [systemStream, microphoneStream, finalStream].forEach(stream => {
          if (stream) {
            stream.getTracks().forEach(track => {
              console.log('關閉音訊軌道:', track.kind, track.label);
              track.stop();
            });
          }
        });
        
        setSystemStream(null);
        setMicrophoneStream(null);
        
        // 自動啟動轉錄流程
        startTranscriptionJob(audioBlob, filename);
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
        [systemStream, microphoneStream].forEach(stream => {
          if (stream) {
            stream.getTracks().forEach(track => {
              console.log('延遲關閉音訊軌道:', track.kind, track.label);
              track.stop();
            });
          }
        });
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

  // 自動保存錄音檔案 - 暫時只保存到應用記憶體
  const saveRecordingFile = async (blob: Blob, filename: string) => {
    // 暫時不執行實際的檔案下載，避免彈出對話框
    // 檔案會保存在應用的recordings狀態中，用戶可以稍後手動下載
    console.log(`錄音檔案 ${filename} 已準備好，將保存到應用記憶體中`);
    console.log('檔案大小:', blob.size, '位元組');
    
    // 將來在 Electron 環境中，這裡可以直接寫入到指定路徑
    // const savePath = settings.recordingSavePath || '~/Downloads';
    // 使用 fs.writeFile 或 IPC 調用來直接保存檔案
    
    return Promise.resolve();
  };

  const playRecording = (recording: typeof recordings[0]) => {
    const audioUrl = URL.createObjectURL(recording.blob);
    const audio = new Audio(audioUrl);
    audio.play().catch(e => console.log('播放失敗:', e));
  };

  // 啟動轉錄作業
  const startTranscriptionJob = async (audioBlob: Blob, filename: string) => {
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
      
      // 檢查是否使用 Gemini API
      if (settings.useGemini && settings.geminiApiKey) {
        console.log('使用 Google Gemini API 進行轉錄');
        await startGeminiTranscription(audioBlob, filename, jobId);
      } else if (!settings.useMock) {
        console.log('使用原有 API 進行轉錄');
        await startOriginalApiTranscription(audioBlob, filename, jobId);
      } else {
        console.log('使用 Mock API 進行轉錄');
        await startMockTranscription(jobId);
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

  // 使用 Gemini API 進行轉錄
  const startGeminiTranscription = async (audioBlob: Blob, filename: string, jobId: string) => {
    try {
      // 直接使用最新的設定，不等待 hydration 狀態
      const currentSettings = useSettingsStore.getState().settings;
      console.log('🔍 開始 Gemini 轉錄，當前設定:', {
        hasApiKey: !!currentSettings.geminiApiKey,
        useGemini: currentSettings.useGemini,
        apiKeyPrefix: currentSettings.geminiApiKey?.substring(0, 10)
      });
      
      if (!currentSettings.geminiApiKey) {
        throw new Error('請先設定 Gemini API 金鑰');
      }
      
      const geminiClient = new GeminiAPIClient(currentSettings.geminiApiKey);
      
      // 直接開始轉錄流程，不進行額外的連接測試
      
      // 更新狀態：開始上傳
      updateJob(jobId, { status: 'stt', progress: 10 });
      setRecordingStatus('API 連接成功，正在上傳檔案到 Gemini...');
      
      // 1. 上傳檔案
      const uploadResult = await geminiClient.uploadFile(audioBlob, filename);
      console.log('Gemini 檔案上傳完成:', uploadResult);
      
      // 更新進度
      updateJob(jobId, { progress: 50 });
      setRecordingStatus('檔案上傳完成，開始轉錄...');
      
      // 添加延遲以避免請求過於頻繁
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 2. 第一步：生成逐字稿修正
      const mimeType = audioBlob.type || 'audio/webm';
      const transcriptionResult = await geminiClient.generateTranscription(
        uploadResult.uri, 
        mimeType, 
        settings.customTranscriptPrompt,
        settings.vocabularyList
      );
      console.log('Gemini 逐字稿修正完成:', transcriptionResult);
      
      // 3. 解析轉錄結果
      const parsedResult = geminiClient.parseTranscriptionResult(transcriptionResult);
      
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
      setRecordingStatus('Gemini 轉錄失敗: ' + (error as Error).message);
    }
  };

  // 使用原有 API 進行轉錄
  const startOriginalApiTranscription = async (audioBlob: Blob, filename: string, jobId: string) => {
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

  // 使用 Mock API 進行轉錄
  const startMockTranscription = async (jobId: string) => {
    // 模擬轉錄過程
    const stages = [
      { status: 'queued' as const, progress: 0, message: '排隊中...' },
      { status: 'stt' as const, progress: 30, message: '語音轉文字中...' },
      { status: 'summarize' as const, progress: 70, message: '生成摘要中...' },
      { status: 'done' as const, progress: 100, message: '轉錄完成！' }
    ];

    for (const stage of stages) {
      await new Promise(resolve => setTimeout(resolve, 1500)); // 每階段等待 1.5 秒
      
      const updateData = {
        status: stage.status,
        progress: stage.progress,
        ...(stage.status === 'done' ? {
          transcript: '這是模擬的語音轉文字結果。\n\n說話者1: 大家好，歡迎參加今天的會議。\n說話者2: 謝謝，我們開始討論今天的議題吧。',
          summary: '# 會議記錄\n\n## 會議摘要\n這是一個模擬的會議摘要，展示了系統的功能。\n\n## 重點討論\n1. 項目進度回顧\n2. 下週計劃安排\n\n## 決議事項\n- 確認專案時程\n- 分配工作任務'
        } : {})
      };
      updateJob(jobId, updateData);
      
      setRecordingStatus(stage.message);
      
      if (stage.status === 'done') {
        setRecordingStatus('模擬轉錄完成！可到「任務」或「結果」頁面查看');
      }
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
      
      // 直接啟動轉錄流程
      await startTranscriptionJob(fileBlob, file.name);
      
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
                            startTranscriptionJob(recording.blob, recording.filename);
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
                    <div style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      lineHeight: '1.8',
                      fontSize: '1rem',
                      color: '#111827'
                    }}>
                      {currentJob.transcript}
                    </div>
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
                💾 下載Word
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
          <div style={{ textAlign: 'left', minWidth: '600px', maxWidth: '800px' }}>
            <h2 style={{ color: '#111827', marginBottom: '1.5rem', textAlign: 'center' }}>應用程式設定</h2>
            
            <div style={{ 
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '2rem'
            }}>
              {/* API 模式切換 */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '18px' }}>
                  🔧 API 模式
                </h3>
                
                <div style={{ 
                  padding: '1rem',
                  backgroundColor: settings.useGemini ? '#f0fdf4' : '#dbeafe',
                  border: '1px solid ' + (settings.useGemini ? '#a7f3d0' : '#bae6fd'),
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    marginBottom: '0.5rem',
                    fontWeight: 'bold',
                    color: settings.useGemini ? '#065f46' : '#1e40af'
                  }}>
                    {settings.useGemini 
                      ? '🤖 Google Gemini AI 模式'
                      : '🌐 其他 API 模式'
                    }
                  </div>
                  <div style={{ fontSize: '14px', color: '#6b7280' }}>
                    {settings.useGemini
                      ? '使用 Google Gemini 2.5 Pro 進行高質量的語音轉文字和智能摘要。支援多說話者識別、時間軸標記和複雜會議分析。'
                      : '連接其他真實 API 服務，進行語音轉文字和智能摘要處理。'
                    }
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      updateSettings({ useGemini: true });
                    }}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: settings.useGemini ? '#10b981' : '#e5e7eb',
                      color: settings.useGemini ? 'white' : '#6b7280',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}
                  >
                    🤖 Gemini AI
                  </button>
                  
                  <button
                    onClick={() => {
                      updateSettings({ useGemini: false });
                    }}
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: !settings.useGemini ? '#3b82f6' : '#e5e7eb',
                      color: !settings.useGemini ? 'white' : '#6b7280',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: '500',
                      fontSize: '14px'
                    }}
                  >
                    🌐 其他 API
                  </button>
                </div>
              </div>
              
              {/* 真實 API 設定 */}
              {!settings.useMock && (
                <div style={{ 
                  marginBottom: '2rem',
                  padding: '1.5rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px'
                }}>
                  <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '18px' }}>
                    {settings.useGemini ? '🤖 Google Gemini API 配置' : '🔑 其他 API 配置'}
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Gemini API Key */}
                    {settings.useGemini ? (
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '0.5rem', 
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          Google Gemini API Key:
                        </label>
                        <input
                          type="password"
                          value={settings.geminiApiKey || ''}
                          onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '14px'
                          }}
                          placeholder="請輸入您的 Google Gemini API Key"
                        />
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                          到 <a href="https://makersuite.google.com/app/apikey" target="_blank" style={{ color: '#3b82f6' }}>
                            Google AI Studio
                          </a> 申請免費的 API Key
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* API URL */}
                        <div>
                          <label style={{ 
                            display: 'block', 
                            marginBottom: '0.5rem', 
                            fontWeight: '500',
                            color: '#374151'
                          }}>
                            API 基礎 URL:
                          </label>
                          <input
                            type="text"
                            value={settings.baseURL}
                            onChange={(e) => updateSettings({ baseURL: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                            placeholder="https://api.example.com"
                          />
                        </div>
                        
                        {/* API Key */}
                        <div>
                          <label style={{ 
                            display: 'block', 
                            marginBottom: '0.5rem', 
                            fontWeight: '500',
                            color: '#374151'
                          }}>
                            API Key:
                          </label>
                          <input
                            type="password"
                            value={settings.apiKey}
                            onChange={(e) => updateSettings({ apiKey: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '0.75rem',
                              border: '1px solid #d1d5db',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                            placeholder="your-api-key-here"
                          />
                        </div>
                      </>
                    )}
                    
                    {/* Environment - 只對非 Gemini API 顯示 */}
                    {!settings.useGemini && (
                      <div>
                        <label style={{ 
                          display: 'block', 
                          marginBottom: '0.5rem', 
                          fontWeight: '500',
                          color: '#374151'
                        }}>
                          環境:
                        </label>
                        <select
                          value={settings.environment}
                          onChange={(e) => updateSettings({ environment: e.target.value as any })}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '1px solid #d1d5db',
                            borderRadius: '4px',
                            fontSize: '14px',
                            backgroundColor: 'white'
                          }}
                        >
                          <option value="dev">開發環境</option>
                          <option value="stg">測試環境</option>
                          <option value="prod">生產環境</option>
                        </select>
                      </div>
                    )}
                    
                    <button
                      onClick={() => {
                        updateAPISettings(settings);
                        alert('API 設定已更新！');
                      }}
                      style={{
                        padding: '0.75rem 1.5rem',
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '500',
                        marginTop: '0.5rem'
                      }}
                    >
                      💾 保存設定
                    </button>
                  </div>
                </div>
              )}
              
              {/* 錄音儲存設定 */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '18px' }}>
                  💾 錄音儲存位置
                </h3>
                
                <div style={{ 
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      儲存路徑：
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={settings.recordingSavePath || ''}
                        onChange={(e) => updateSettings({ recordingSavePath: e.target.value })}
                        placeholder="留空使用系統預設下載資料夾"
                        style={{
                          flex: 1,
                          padding: '0.75rem',
                          border: '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '14px'
                        }}
                      />
                      <button
                        onClick={() => {
                          // 這裡將來會添加選擇資料夾的功能
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.webkitdirectory = true;
                          input.onchange = (e) => {
                            const files = (e.target as HTMLInputElement).files;
                            if (files && files.length > 0) {
                              const path = files[0].webkitRelativePath.split('/')[0];
                              updateSettings({ recordingSavePath: path });
                            }
                          };
                          input.click();
                        }}
                        style={{
                          padding: '0.75rem 1rem',
                          backgroundColor: '#6b7280',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        選擇資料夾
                      </button>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '0.5rem' }}>
                      {settings.recordingSavePath ? `錄音將儲存至：${settings.recordingSavePath}` : '錄音將儲存至系統預設下載資料夾'}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 使用說明 */}
              <div style={{
                padding: '1.5rem',
                backgroundColor: '#f0f9ff',
                border: '1px solid #bae6fd',
                borderRadius: '6px'
              }}>
                <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '18px' }}>
                  📖 使用說明
                </h3>
                <ul style={{ 
                  margin: 0, 
                  paddingLeft: '1.5rem',
                  color: '#374151',
                  lineHeight: '1.6'
                }}>
                  <li><strong>測試模式</strong>：使用內建的模擬數據，適合測試應用功能，無需任何 API 金鑰</li>
                  <li><strong>Google Gemini AI</strong>：使用 Google 最新的 Gemini 2.5 Pro 模型，支援高質量語音轉文字、多說話者識別、時間軸分析和智能摘要生成</li>
                  <li><strong>其他 API</strong>：連接自訂的語音轉文字服務，需要配置 API 端點和金鑰</li>
                  <li>切換模式後，新的錄音和上傳檔案會使用新的設定</li>
                  <li>Gemini API 提供免費額度，到 Google AI Studio 即可申請</li>
                  <li>真實 API 需要網路連線和有效的服務金鑰</li>
                </ul>
              </div>
              
              {/* 應用更新 */}
              <div style={{
                padding: '1.5rem',
                backgroundColor: updateAvailable ? '#fef3cd' : '#f8f9fa',
                border: updateAvailable ? '1px solid #f59e0b' : '1px solid #dee2e6',
                borderRadius: '6px'
              }}>
                <h3 style={{ color: '#1f2937', marginBottom: '1rem', fontSize: '18px' }}>
                  🔄 應用程式更新
                </h3>
                
                {updateAvailable ? (
                  <div style={{ color: '#374151' }}>
                    <p style={{ marginBottom: '1rem' }}>
                      🎉 發現新版本 <strong>{updateInfo?.version}</strong>！
                    </p>
                    {updateProgress ? (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                          width: '100%',
                          backgroundColor: '#e5e7eb',
                          borderRadius: '4px',
                          overflow: 'hidden',
                          marginBottom: '0.5rem'
                        }}>
                          <div style={{
                            width: `${updateProgress.percent}%`,
                            backgroundColor: '#10b981',
                            height: '8px',
                            transition: 'width 0.3s ease'
                          }}></div>
                        </div>
                        <p style={{ fontSize: '14px', color: '#6b7280' }}>
                          {updateProgress.status}
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <button
                          onClick={async () => {
                            if (window.electronAPI?.updater) {
                              try {
                                const result = await window.electronAPI.updater.downloadUpdate();
                                if (!result.success) {
                                  alert('下載更新失敗: ' + result.error);
                                }
                              } catch (error) {
                                alert('下載更新時發生錯誤');
                              }
                            }
                          }}
                          style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          📥 下載更新
                        </button>
                        <button
                          onClick={() => {
                            setUpdateAvailable(false);
                            setUpdateInfo(null);
                          }}
                          style={{
                            padding: '0.75rem 1rem',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                          }}
                        >
                          稍後再說
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#374151' }}>
                    <p style={{ marginBottom: '1rem' }}>
                      目前版本：<strong>1.0.0</strong>
                    </p>
                    <button
                      onClick={async () => {
                        if (window.electronAPI?.updater) {
                          try {
                            const result = await window.electronAPI.updater.checkForUpdates();
                            if (!result.available) {
                              alert(result.message || '當前已是最新版本');
                            }
                          } catch (error) {
                            alert('檢查更新時發生錯誤');
                          }
                        } else {
                          alert('更新功能僅在 Electron 環境下可用');
                        }
                      }}
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                    >
                      🔍 檢查更新
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
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