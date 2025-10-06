import React, { useState, useEffect } from 'react';
import { RecorderPanel } from '../components/RecorderPanel';
import { useJobsStore, useToastActions, useUIStore } from '../services/store';
import { uploader, UploadProgress } from '../services/uploader';
import { validateMeetingData, validateRecordingDuration } from '../utils/validators';
import { parseParticipants } from '../utils/format';

export const RecordPage: React.FC = () => {
  // Store hooks
  const { addJob, setCurrentJob } = useJobsStore();
  const { showError, showSuccess, showInfo } = useToastActions();
  const { setCurrentPage } = useUIStore();

  // Local state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [participantsInput, setParticipantsInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<{ blob: Blob; duration: number } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Clear validation errors when inputs change
  useEffect(() => {
    if (validationErrors.title && meetingTitle.trim()) {
      setValidationErrors(prev => ({ ...prev, title: '' }));
    }
  }, [meetingTitle, validationErrors.title]);

  useEffect(() => {
    if (validationErrors.participants && participantsInput.trim()) {
      setValidationErrors(prev => ({ ...prev, participants: '' }));
    }
  }, [participantsInput, validationErrors.participants]);

  // Handle recording completion
  const handleRecordingComplete = (audioBlob: Blob, duration: number) => {
    setRecordedAudio({ blob: audioBlob, duration });
    showSuccess('錄音完成！請填寫會議資訊後上傳。');
  };

  // Validate form data
  const validateForm = (): boolean => {
    const participants = parseParticipants(participantsInput);
    const titleValidation = validateMeetingData(meetingTitle, participants);
    
    let errors: Record<string, string> = {};
    
    if (!titleValidation.isValid) {
      errors = { ...errors, ...titleValidation.errors };
    }

    if (!recordedAudio) {
      errors.recording = '請先完成錄音';
    } else {
      const durationValidation = validateRecordingDuration(recordedAudio.duration);
      if (!durationValidation.isValid) {
        errors = { ...errors, ...durationValidation.errors };
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle upload
  const handleUpload = async () => {
    if (!validateForm() || !recordedAudio) {
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);

    try {
      const participants = parseParticipants(participantsInput);
      
      // Convert blob to file
      const audioFile = new File([recordedAudio.blob], `recording-${Date.now()}.webm`, {
        type: 'audio/webm'
      });

      // Start upload
      const job = await uploader.uploadMeeting(
        meetingTitle.trim(),
        participants,
        audioFile,
        {
          onProgress: (progress) => {
            setUploadProgress(progress);
          }
        }
      );

      // Add job to store
      addJob(job);
      setCurrentJob(job);

      // Clear form
      setMeetingTitle('');
      setParticipantsInput('');
      setRecordedAudio(null);
      setUploadProgress(null);

      showSuccess('上傳完成！正在處理中...');
      
      // Navigate to jobs page
      setCurrentPage('record');

    } catch (error) {
      console.error('Upload failed:', error);
      showError('上傳失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
      setUploadProgress(null);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle clear recording
  const handleClearRecording = () => {
    setRecordedAudio(null);
    showInfo('已清除錄音，可以重新錄製');
  };

  // Handle retry upload
  const handleRetryUpload = () => {
    if (uploadProgress?.stage === 'error') {
      handleUpload();
    }
  };

  // Parse current participants for display
  const currentParticipants = parseParticipants(participantsInput);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">會議錄音</h1>
        <p className="text-gray-600">錄製會議音檔並自動生成轉錄與摘要</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Meeting Info */}
        <div className="space-y-6">
          {/* Meeting Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              會議標題 *
            </label>
            <input
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="請輸入會議標題"
              disabled={isUploading}
              className={`
                w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2
                ${validationErrors.title 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
                }
                disabled:bg-gray-100 disabled:cursor-not-allowed
              `}
            />
            {validationErrors.title && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.title}</p>
            )}
          </div>

          {/* Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              參與者 *
            </label>
            <textarea
              value={participantsInput}
              onChange={(e) => setParticipantsInput(e.target.value)}
              placeholder="請輸入參與者姓名，用逗號分隔&#10;例如：張三, 李四, 王五"
              rows={3}
              disabled={isUploading}
              className={`
                w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 resize-none
                ${validationErrors.participants 
                  ? 'border-red-300 focus:ring-red-500' 
                  : 'border-gray-300 focus:ring-blue-500'
                }
                disabled:bg-gray-100 disabled:cursor-not-allowed
              `}
            />
            {validationErrors.participants && (
              <p className="mt-1 text-sm text-red-600">{validationErrors.participants}</p>
            )}
            
            {/* Participants Preview */}
            {currentParticipants.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">參與者預覽：</p>
                <div className="flex flex-wrap gap-1">
                  {currentParticipants.map((participant, index) => (
                    <span
                      key={index}
                      className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
                    >
                      {participant}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recording Status */}
          {recordedAudio && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-green-800">錄音已完成</h3>
                  <p className="text-sm text-green-600">
                    時長：{Math.floor(recordedAudio.duration / 60)}:{String(recordedAudio.duration % 60).padStart(2, '0')}
                  </p>
                </div>
                <button
                  onClick={handleClearRecording}
                  disabled={isUploading}
                  className="text-green-600 hover:text-green-800 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Validation Errors */}
          {validationErrors.recording && (
            <div className="text-sm text-red-600">
              {validationErrors.recording}
            </div>
          )}
          {validationErrors.duration && (
            <div className="text-sm text-red-600">
              {validationErrors.duration}
            </div>
          )}
        </div>

        {/* Right Column: Recorder */}
        <div>
          <RecorderPanel
            onRecordingComplete={handleRecordingComplete}
            disabled={isUploading}
            className="h-fit"
          />
        </div>
      </div>

      {/* Upload Progress */}
      {uploadProgress && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {uploadProgress.stage === 'error' ? '上傳失敗' : '上傳進度'}
          </h3>
          
          {uploadProgress.stage !== 'error' && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>{uploadProgress.message}</span>
                <span>{uploadProgress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    uploadProgress.stage === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${uploadProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {uploadProgress.stage === 'error' && (
            <div className="text-red-600 mb-4">
              {uploadProgress.message}
            </div>
          )}

          {uploadProgress.stage === 'error' && (
            <button
              onClick={handleRetryUpload}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            >
              重試上傳
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        <button
          onClick={handleUpload}
          disabled={isUploading || !recordedAudio || !meetingTitle.trim() || !participantsInput.trim()}
          className="px-8 py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isUploading ? '上傳中...' : '開始處理'}
        </button>

        <button
          onClick={() => setCurrentPage('record')}
          className="px-8 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
        >
          查看狀態
        </button>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <h3 className="font-medium mb-2">使用說明：</h3>
        <ol className="space-y-1 list-decimal list-inside">
          <li>填寫會議標題和參與者資訊</li>
          <li>點擊錄音按鈕開始錄製</li>
          <li>錄音完成後點擊「開始處理」上傳音檔</li>
          <li>系統將自動進行語音轉錄和摘要生成</li>
          <li>透過上方狀態欄確認處理進度，完成後前往「查看結果」頁</li>
        </ol>
      </div>
    </div>
  );
};
