import React from 'react';
import { MeetingJob, MeetingStatus } from '@shared/types';

interface JobCardProps {
  job: MeetingJob;
  onView?: (job: MeetingJob) => void;
  onRetry?: (job: MeetingJob) => void;
  onDelete?: (job: MeetingJob) => void;
  className?: string;
}

const STATUS_CONFIG: Record<MeetingStatus, { label: string; color: string; bgColor: string }> = {
  queued: { label: '排隊中', color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  stt: { label: '轉錄中', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  summarize: { label: '摘要中', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  done: { label: '完成', color: 'text-green-700', bgColor: 'bg-green-100' },
  failed: { label: '失敗', color: 'text-red-700', bgColor: 'bg-red-100' }
};

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onView,
  onRetry,
  onDelete,
  className = ''
}) => {
  const statusConfig = STATUS_CONFIG[job.status];
  const canView = job.status === 'done' && job.result;
  const canRetry = job.status === 'failed';

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 mb-1 truncate">
            {job.title}
          </h3>
          <p className="text-sm text-gray-500">
            {formatDate(job.createdAt)}
          </p>
        </div>
        
        {/* Status Badge */}
        <span className={`
          px-2 py-1 text-xs font-medium rounded-full
          ${statusConfig.color} ${statusConfig.bgColor}
        `}>
          {statusConfig.label}
        </span>
      </div>

      {/* Participants */}
      {job.participants.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 mb-1">參與者</div>
          <div className="flex flex-wrap gap-1">
            {job.participants.slice(0, 3).map((participant, index) => (
              <span
                key={index}
                className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
              >
                {participant}
              </span>
            ))}
            {job.participants.length > 3 && (
              <span className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                +{job.participants.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 不顯示本機檔案路徑（避免洩露與版面干擾） */}

      {/* Progress Bar for Processing */}
      {(job.status === 'queued' || job.status === 'stt' || job.status === 'summarize') && (
        <div className="mb-3">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{ 
                width: job.status === 'queued' ? '20%' : 
                       job.status === 'stt' ? '60%' : 
                       job.status === 'summarize' ? '85%' : '0%'
              }}
            ></div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {canView && (
          <button
            onClick={() => onView?.(job)}
            className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
          >
            查看結果
          </button>
        )}
        
        {canRetry && (
          <button
            onClick={() => onRetry?.(job)}
            className="flex-1 px-3 py-2 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors"
          >
            重試
          </button>
        )}
        
        {!canView && !canRetry && job.status !== 'queued' && job.status !== 'stt' && job.status !== 'summarize' && (
          <div className="flex-1 px-3 py-2 text-center text-sm text-gray-500">
            處理中...
          </div>
        )}

        {/* Delete Button */}
        <button
          onClick={() => onDelete?.(job)}
          className="px-3 py-2 text-gray-400 hover:text-red-500 transition-colors"
          title="刪除"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};
