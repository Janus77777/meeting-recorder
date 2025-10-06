import React, { useState, useEffect } from 'react';
import { TranscriptView } from '../components/TranscriptView';
import { SummaryView } from '../components/SummaryView';
import { FlagGuard } from '../components/FlagGuard';
import { useJobsStore, useToastActions, useUIStore } from '../services/store';
import { getAPI } from '../services/api';
import { generateMarkdown, formatDate, formatDuration } from '../utils/format';
import { FLAGS } from '@shared/flags';

export const ResultPage: React.FC = () => {
  // Store hooks
  const { currentJob, updateJob } = useJobsStore();
  const { showError, showSuccess, showInfo } = useToastActions();
  const { setCurrentPage } = useUIStore();

  // Local state
  const [activeView, setActiveView] = useState<'transcript' | 'summary'>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [speakerNameMap, setSpeakerNameMap] = useState<Map<string, string>>(new Map());

  // Redirect if no current job
  useEffect(() => {
    if (!currentJob) {
      setCurrentPage('record');
    }
  }, [currentJob, setCurrentPage]);

  // Load result if not available
  useEffect(() => {
    if (currentJob && !currentJob.result && currentJob.status === 'done') {
      loadResult();
    }
  }, [currentJob]);

  const loadResult = async () => {
    if (!currentJob) return;

    setIsLoading(true);
    try {
      const api = getAPI();
      const result = await api.getMeetingResult(currentJob.id);
      updateJob(currentJob.id, { result });
    } catch (error) {
      console.error('Failed to load result:', error);
      showError('載入結果失敗：' + (error instanceof Error ? error.message : '未知錯誤'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle copy markdown
  const handleCopyMarkdown = () => {
    if (!currentJob?.result) return;

    const markdown = generateMarkdown(
      currentJob.result.meta.title,
      currentJob.result.meta.participants,
      currentJob.result.meta.createdAt,
      currentJob.result.transcript.segments,
      currentJob.result.summary
    );

    showSuccess('Markdown 已複製到剪貼板');
  };

  // Handle export (placeholder for future features)
  const handleExport = (format: 'pdf' | 'docx') => {
    showInfo(`${format.toUpperCase()} 匯出功能即將推出`);
  };

  // Handle speaker name change
  const handleSpeakerNameChange = (oldName: string, newName: string) => {
    if (!currentJob?.result) return;

    // Update local state
    const newMap = new Map(speakerNameMap);
    newMap.set(oldName, newName);
    setSpeakerNameMap(newMap);

    // Update the segments in the result
    const updatedSegments = currentJob.result.transcript.segments.map(segment => ({
      ...segment,
      speaker: segment.speaker === oldName ? newName : segment.speaker
    }));

    // Update the job with modified result
    const updatedResult = {
      ...currentJob.result,
      transcript: {
        ...currentJob.result.transcript,
        segments: updatedSegments
      }
    };

    updateJob(currentJob.id, { result: updatedResult });
    showSuccess(`說話者名稱已更新：${oldName} → ${newName}`);
  };

  // If no job selected
  if (!currentJob) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>請先選擇一個會議任務</p>
          <button
            onClick={() => setCurrentPage('record')}
            className="mt-2 text-blue-600 hover:text-blue-800"
          >
            返回任務列表
          </button>
        </div>
      </div>
    );
  }

  // If job is not done yet
  if (currentJob.status !== 'done') {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">處理中...</h3>
          <p className="text-gray-500 mb-4">會議「{currentJob.title}」正在處理中</p>
          <div className="text-sm text-gray-400">
            狀態：{currentJob.status === 'queued' ? '排隊中' :
                   currentJob.status === 'stt' ? '語音轉錄中' :
                   currentJob.status === 'summarize' ? '生成摘要中' : '處理中'}
          </div>
          <button
            onClick={() => setCurrentPage('record')}
            className="mt-4 px-4 py-2 text-blue-600 border border-blue-200 rounded hover:bg-blue-50"
          >
            返回任務列表
          </button>
        </div>
      </div>
    );
  }

  // Loading result
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-500">載入結果中...</p>
        </div>
      </div>
    );
  }

  // No result available
  if (!currentJob.result) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center text-gray-500">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.98-.833-2.75 0L4.064 12.5C3.294 14.333 4.256 16 5.794 16z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-600 mb-2">載入失敗</h3>
          <p className="text-gray-500 mb-4">無法載入會議結果</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={loadResult}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              重試
            </button>
            <button
              onClick={() => setCurrentPage('record')}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  const result = currentJob.result;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">{result.meta.title}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-2">
              <span>📅 {formatDate(result.meta.createdAt)}</span>
              <span>👥 {result.meta.participants.join('、')}</span>
              <span>⏱️ {result.transcript.segments.length > 0 ?
                formatDuration(Math.max(...result.transcript.segments.map(s =>
                  typeof s.end === 'string' ?
                    parseInt(s.end.split(':')[0]) * 60 + parseInt(s.end.split(':')[1]) :
                    s.end
                ))) : '無'}</span>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage('record')}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              返回列表
            </button>
          </div>
        </div>

        {/* Participants Tags */}
        {result.meta.participants.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {result.meta.participants.map((participant, index) => (
              <span
                key={index}
                className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full"
              >
                {participant}
              </span>
            ))}
          </div>
        )}

        {/* Quality Gate Info */}
        <FlagGuard flag="QUALITY_GATE">
          {result.quality && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">品質分析</h3>
              <div className="text-sm text-yellow-700">
                <p>詞錯率 (WER): {(result.quality.wer * 100).toFixed(1)}%</p>
                {result.quality.notes.length > 0 && (
                  <ul className="mt-2 list-disc list-inside">
                    {result.quality.notes.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                )}
              </div>
              
              {result.nameSuggestions && result.nameSuggestions.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-sm font-medium text-yellow-800 mb-1">人名校正建議</h4>
                  <div className="text-sm text-yellow-700">
                    {result.nameSuggestions.map((suggestion, index) => (
                      <div key={index}>{suggestion}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </FlagGuard>
      </div>

      {/* View Toggle and Search */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="flex items-center justify-between p-4 border-b">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setActiveView('summary')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeView === 'summary'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📋 摘要
            </button>
            <button
              onClick={() => setActiveView('transcript')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeView === 'transcript'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              📝 逐字稿
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {activeView === 'transcript' && (
              <input
                type="text"
                placeholder="搜尋內容..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            <FlagGuard flag="ADV_EXPORT" fallback={null}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleExport(e.target.value as 'pdf' | 'docx');
                    e.target.value = '';
                  }
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">匯出為...</option>
                <option value="pdf">PDF</option>
                <option value="docx">Word (功能開發中)</option>
              </select>
            </FlagGuard>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="xl:col-span-2">
          {activeView === 'summary' ? (
            <SummaryView
              summaryMarkdown={result.summary?.minutesMd}
              summaryData={result.summary}
              onCopyMarkdown={handleCopyMarkdown}
            />
          ) : (
            <TranscriptView
              segments={result.transcript.segments}
              fullText={result.transcript.fullText}
              searchQuery={searchQuery}
              showTimestamps={true}
              onSpeakerNameChange={handleSpeakerNameChange}
            />
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">統計資訊</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">轉錄段數</span>
                <span className="font-medium">{result.transcript.segments.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">重點數量</span>
                <span className="font-medium">{result.summary.highlights.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">待辦事項</span>
                <span className="font-medium">{result.summary.todos.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">發言人數</span>
                <span className="font-medium">{result.summary.by_speaker.length}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          {activeView === 'summary' && (
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">快速操作</h3>
              <div className="space-y-2">
                <button
                  onClick={() => setActiveView('transcript')}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded border"
                >
                  📝 查看完整逐字稿
                </button>
                
                <FlagGuard flag="MARKDOWN_COPY" fallback={
                  <div className="text-xs text-gray-400 p-2 text-center">
                    Markdown 複製功能即將推出
                  </div>
                }>
                  <button
                    onClick={handleCopyMarkdown}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 rounded border"
                  >
                    📋 複製 Markdown
                  </button>
                </FlagGuard>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
