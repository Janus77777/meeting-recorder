import React, { useState } from 'react';
import { MeetingSummary } from '@shared/types';
import { FLAGS } from '@shared/flags';

interface SummaryViewProps {
  summary: MeetingSummary;
  onCopyMarkdown?: (markdown: string) => void;
  className?: string;
}

export const SummaryView: React.FC<SummaryViewProps> = ({
  summary,
  onCopyMarkdown,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'todos' | 'speakers'>('overview');
  const [copied, setCopied] = useState(false);

  const tabs = [
    { key: 'overview' as const, label: '概要', icon: '📋' },
    { key: 'timeline' as const, label: '時間軸', icon: '⏰' },
    { key: 'todos' as const, label: '待辦事項', icon: '✅' },
    { key: 'speakers' as const, label: '發言人', icon: '🗣️' }
  ];

  const handleCopyMarkdown = async () => {
    if (!FLAGS.MARKDOWN_COPY) return;

    try {
      await navigator.clipboard.writeText(summary.minutesMd);
      setCopied(true);
      onCopyMarkdown?.(summary.minutesMd);
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy markdown:', error);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header with Copy Button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">會議摘要</h3>
        
        {FLAGS.MARKDOWN_COPY && (
          <button
            onClick={handleCopyMarkdown}
            className={`
              flex items-center gap-2 px-3 py-2 rounded transition-colors
              ${copied 
                ? 'bg-green-100 text-green-700' 
                : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }
            `}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {copied ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a1 1 0 011 1v3M9 12l2 2 4-4" />
              )}
            </svg>
            {copied ? '已複製' : '複製 Markdown'}
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
              }
            `}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Highlights */}
            {summary.highlights.length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-gray-800 mb-3">重點摘要</h4>
                <div className="space-y-2">
                  {summary.highlights.map((highlight, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                      <p className="text-gray-700 leading-relaxed">{highlight}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Markdown Preview */}
            {summary.minutesMd && (
              <div>
                <h4 className="text-md font-semibold text-gray-800 mb-3">會議紀錄</h4>
                <div className="prose prose-sm max-w-none bg-gray-50 p-4 rounded border">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700">
                    {summary.minutesMd}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">時間軸</h4>
            {summary.timeline.length > 0 ? (
              <div className="space-y-3">
                {summary.timeline.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                    <div className="flex-1">
                      <p className="text-gray-700">{item.item}</p>
                      <div className="flex gap-4 mt-1 text-xs text-gray-500">
                        {item.date && (
                          <span>📅 {formatDate(item.date)}</span>
                        )}
                        {item.owner && (
                          <span>👤 {item.owner}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">暫無時間軸資料</p>
            )}
          </div>
        )}

        {activeTab === 'todos' && (
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">待辦事項</h4>
            {summary.todos.length > 0 ? (
              <div className="space-y-3">
                {summary.todos.map((todo, index) => (
                  <div key={index} className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-gray-800 font-medium">{todo.task}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-600">
                      {todo.owner && (
                        <span className="flex items-center gap-1">
                          <span>👤</span> {todo.owner}
                        </span>
                      )}
                      {todo.due && (
                        <span className="flex items-center gap-1">
                          <span>📅</span> {formatDate(todo.due)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">暫無待辦事項</p>
            )}
          </div>
        )}

        {activeTab === 'speakers' && (
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-3">發言人分析</h4>
            {summary.by_speaker.length > 0 ? (
              <div className="space-y-4">
                {summary.by_speaker.map((speaker, index) => (
                  <div key={index} className="border border-gray-200 rounded p-4">
                    <h5 className="font-semibold text-gray-800 mb-2">{speaker.speaker}</h5>
                    <div className="space-y-1">
                      {speaker.items.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
                          <p className="text-sm text-gray-700">{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">暫無發言人分析資料</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};