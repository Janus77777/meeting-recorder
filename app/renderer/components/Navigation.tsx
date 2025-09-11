import React from 'react';
import { useUIStore, useJobsStore, useSettingsStore } from '../services/store';

export const Navigation: React.FC = () => {
  const { currentPage, setCurrentPage } = useUIStore();
  const { jobs } = useJobsStore();
  const { settings } = useSettingsStore();

  // Count active jobs
  const activeJobCount = jobs.filter(job => 
    job.status !== 'done' && job.status !== 'failed'
  ).length;

  const completedJobCount = jobs.filter(job => job.status === 'done').length;

  const navItems = [
    {
      key: 'record' as const,
      label: '錄音',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      ),
      badge: null
    },
    {
      key: 'jobs' as const,
      label: '任務',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      badge: activeJobCount > 0 ? activeJobCount : null
    },
    {
      key: 'result' as const,
      label: '結果',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      badge: completedJobCount > 0 ? completedJobCount : null
    },
    {
      key: 'settings' as const,
      label: '設定',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      badge: null
    }
  ];

  return (
    <nav className="bg-white shadow-sm border-r border-gray-200 w-64 flex-shrink-0">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">會議錄音</h1>
            <p className="text-xs text-gray-500">Meeting Recorder</p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <div className="px-3 pb-6">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = currentPage === item.key;
            
            return (
              <li key={item.key}>
                <button
                  onClick={() => setCurrentPage(item.key)}
                  className={`
                    w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                    ${isActive
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <span className={`mr-3 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 text-left">{item.label}</span>
                  
                  {/* Badge */}
                  {item.badge !== null && (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-600">
                      {item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Status Footer */}
      <div className="px-6 py-4 border-t border-gray-200 mt-auto">
        <div className="text-xs text-gray-500">
          <div className="flex items-center justify-between mb-1">
            <span>模式</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              settings.useMock
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {settings.useMock ? 'Mock' : 'Live'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>環境</span>
            <span className="uppercase">{settings.environment}</span>
          </div>
        </div>
      </div>
    </nav>
  );
};