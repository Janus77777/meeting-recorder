import React, { useState, useEffect } from 'react';
import { JobCard } from '../components/JobCard';
import { useJobsStore, useToastActions, useUIStore } from '../services/store';
import { getAPI } from '../services/api';
import { MeetingJob, MeetingStatus } from '@shared/types';

export const JobsPage: React.FC = () => {
  // Store hooks
  const { jobs, updateJob, removeJob, setCurrentJob } = useJobsStore();
  const { showError, showSuccess, showInfo } = useToastActions();
  const { setCurrentPage } = useUIStore();

  // Local state
  const [filter, setFilter] = useState<MeetingStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'status'>('date');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort jobs
  const filteredJobs = jobs
    .filter(job => {
      const matchesFilter = filter === 'all' || job.status === filter;
      const matchesSearch = !searchQuery || 
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.participants.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'title':
          return a.title.localeCompare(b.title, 'zh-TW');
        case 'status':
          const statusOrder = { 'done': 0, 'failed': 1, 'summarize': 2, 'stt': 3, 'queued': 4 };
          return statusOrder[a.status] - statusOrder[b.status];
        default:
          return 0;
      }
    });

  // Status filter options
  const statusOptions = [
    { value: 'all' as const, label: '全部', count: jobs.length },
    { value: 'done' as const, label: '完成', count: jobs.filter(j => j.status === 'done').length },
    { value: 'failed' as const, label: '失敗', count: jobs.filter(j => j.status === 'failed').length },
    { value: 'summarize' as const, label: '摘要中', count: jobs.filter(j => j.status === 'summarize').length },
    { value: 'stt' as const, label: '轉錄中', count: jobs.filter(j => j.status === 'stt').length },
    { value: 'queued' as const, label: '排隊中', count: jobs.filter(j => j.status === 'queued').length }
  ];

  // Refresh job statuses
  const refreshJobs = async () => {
    setIsRefreshing(true);
    const api = getAPI();

    try {
      const activeJobs = jobs.filter(job => 
        job.status !== 'done' && job.status !== 'failed'
      );

      for (const job of activeJobs) {
        try {
          const statusResponse = await api.getMeetingStatus(job.id);
          
          if (statusResponse.status !== job.status) {
            updateJob(job.id, { status: statusResponse.status });
            
            if (statusResponse.status === 'done') {
              showSuccess(`會議「${job.title}」處理完成！`);
            } else if (statusResponse.status === 'failed') {
              showError(`會議「${job.title}」處理失敗`);
            }
          }
        } catch (error) {
          console.error(`Failed to refresh job ${job.id}:`, error);
        }
      }

    } catch (error) {
      console.error('Failed to refresh jobs:', error);
      showError('刷新任務狀態失敗');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-refresh active jobs every 30 seconds
  useEffect(() => {
    const activeJobCount = jobs.filter(job => 
      job.status !== 'done' && job.status !== 'failed'
    ).length;

    if (activeJobCount > 0) {
      const interval = setInterval(refreshJobs, 30000);
      return () => clearInterval(interval);
    }
  }, [jobs]);

  // Handle view job result
  const handleViewJob = async (job: MeetingJob) => {
    try {
      // Fetch latest result if not cached
      if (!job.result && job.status === 'done') {
        const api = getAPI();
        const result = await api.getMeetingResult(job.id);
        updateJob(job.id, { result });
      }

      setCurrentJob(job);
      setCurrentPage('result');
    } catch (error) {
      console.error('Failed to fetch job result:', error);
      showError('無法載入會議結果');
    }
  };

  // Handle retry job
  const handleRetryJob = (job: MeetingJob) => {
    showInfo('請重新錄音並上傳，暫不支援自動重試');
    setCurrentPage('record');
  };

  // Handle delete job
  const handleDeleteJob = (job: MeetingJob) => {
    if (confirm(`確定要刪除會議「${job.title}」嗎？此操作無法復原。`)) {
      removeJob(job.id);
      showSuccess('任務已刪除');
    }
  };

  // Handle clear completed jobs
  const handleClearCompleted = () => {
    const completedJobs = jobs.filter(job => job.status === 'done' || job.status === 'failed');
    
    if (completedJobs.length === 0) {
      showInfo('沒有已完成的任務需要清理');
      return;
    }

    if (confirm(`確定要清理 ${completedJobs.length} 個已完成的任務嗎？`)) {
      completedJobs.forEach(job => removeJob(job.id));
      showSuccess(`已清理 ${completedJobs.length} 個任務`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">任務列表</h1>
          <p className="text-gray-600 mt-1">管理您的會議錄音任務</p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={refreshJobs}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            <svg 
              className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            刷新狀態
          </button>

          <button
            onClick={() => setCurrentPage('record')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            新增錄音
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {statusOptions.map(option => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`
                  px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${filter === option.value
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>

          {/* Search and Sort */}
          <div className="flex gap-3 ml-auto">
            <input
              type="text"
              placeholder="搜尋會議標題或參與者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'title' | 'status')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="date">按時間排序</option>
              <option value="title">按標題排序</option>
              <option value="status">按狀態排序</option>
            </select>

            <button
              onClick={handleClearCompleted}
              className="px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              清理已完成
            </button>
          </div>
        </div>
      </div>

      {/* Job List */}
      {filteredJobs.length === 0 ? (
        <div className="text-center py-12">
          {jobs.length === 0 ? (
            <div className="text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a1 1 0 011-1h12a1 1 0 011 1v2M7 7h10" />
              </svg>
              <h3 className="text-lg font-medium text-gray-600 mb-2">暫無任務</h3>
              <p className="text-gray-500 mb-4">開始您的第一次會議錄音</p>
              <button
                onClick={() => setCurrentPage('record')}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                開始錄音
              </button>
            </div>
          ) : (
            <div className="text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p>找不到符合條件的任務</p>
              <button
                onClick={() => {
                  setFilter('all');
                  setSearchQuery('');
                }}
                className="mt-2 text-blue-600 hover:text-blue-800"
              >
                清除篩選條件
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onView={handleViewJob}
              onRetry={handleRetryJob}
              onDelete={handleDeleteJob}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      {jobs.length > 0 && (
        <div className="mt-8 text-center text-sm text-gray-500">
          顯示 {filteredJobs.length} / {jobs.length} 個任務
          {searchQuery && ` • 搜尋："${searchQuery}"`}
          {filter !== 'all' && ` • 篩選：${statusOptions.find(opt => opt.value === filter)?.label}`}
        </div>
      )}
    </div>
  );
};