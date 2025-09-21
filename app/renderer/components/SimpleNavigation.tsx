import React from 'react';
import { AppSettings } from '@shared/types';

interface SimpleNavigationProps {
  currentPage: 'record' | 'jobs' | 'result' | 'prompts' | 'settings';
  onPageChange: (page: 'record' | 'jobs' | 'result' | 'prompts' | 'settings') => void;
  jobCount?: number;
  activeJobCount?: number;
  completedJobCount?: number;
  settings?: AppSettings;
  appVersion?: string;
  updateStatus?: string;
  updateAvailable?: boolean;
  updateDownloaded?: boolean;
  updateProgress?: { percent: number; status: string } | null;
  updateInfo?: { version?: string; releaseNotes?: string } | null;
  onCheckUpdates?: () => void;
  onDownloadUpdate?: () => void;
  onInstallUpdate?: () => void;
}

export const SimpleNavigation: React.FC<SimpleNavigationProps> = ({ 
  currentPage, 
  onPageChange, 
  jobCount = 0, 
  activeJobCount = 0, 
  completedJobCount = 0,
  settings,
  appVersion,
  updateStatus,
  updateAvailable,
  updateDownloaded,
  updateProgress,
  updateInfo,
  onCheckUpdates,
  onDownloadUpdate,
  onInstallUpdate
}) => {
  const navItems = [
    {
      key: 'record' as const,
      label: '錄音',
      icon: '🎤'
    },
    {
      key: 'jobs' as const, 
      label: '任務',
      icon: '📋'
    },
    {
      key: 'result' as const,
      label: '結果', 
      icon: '📄'
    },
    {
      key: 'prompts' as const,
      label: '提示詞',
      icon: '🤖'
    },
    {
      key: 'settings' as const,
      label: '設定',
      icon: '⚙️'
    }
  ];

  return (
    <nav style={{
      backgroundColor: 'white',
      borderRight: '1px solid #e5e7eb',
      width: '200px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Header */}
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: '32px',
            height: '32px', 
            backgroundColor: '#2563eb',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '12px'
          }}>
            🎤
          </div>
          <div>
            <h1 style={{ 
              fontSize: '18px', 
              fontWeight: 'bold', 
              color: '#111827', 
              margin: 0,
              marginBottom: '4px'
            }}>
              會議錄音
            </h1>
            <p style={{ 
              fontSize: '12px', 
              color: '#6b7280', 
              margin: 0 
            }}>
              會議轉錄工具
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Items */}
      <div style={{ padding: '0 1rem', flex: 1 }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navItems.map((item) => {
            const isActive = currentPage === item.key;
            
            return (
              <li key={item.key} style={{ marginBottom: '4px' }}>
                <button
                  onClick={() => onPageChange(item.key)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    fontSize: '14px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: isActive ? '#dbeafe' : 'transparent',
                    color: isActive ? '#1e40af' : '#6b7280',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                      e.currentTarget.style.color = '#111827';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                    }
                  }}
                >
                  <span style={{ marginRight: '12px', fontSize: '16px' }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                  
                  {/* 顯示任務數量角標 */}
                  {item.key === 'jobs' && activeJobCount > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      minWidth: '18px',
                      textAlign: 'center'
                    }}>
                      {activeJobCount}
                    </span>
                  )}
                  
                  {/* 顯示完成數量角標 */}
                  {item.key === 'result' && completedJobCount > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: '#10b981',
                      color: 'white',
                      minWidth: '18px',
                      textAlign: 'center'
                    }}>
                      {completedJobCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Status Footer */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid #e5e7eb',
        fontSize: '11px',
        color: '#6b7280'
      }}>
        {/* 版本號 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span>版本</span>
          <span style={{ fontWeight: '500', color: '#374151' }}>v{appVersion || '未知'}</span>
        </div>

        {/* AI 模型 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span>轉錄模式</span>
          {(() => {
            const mode = settings?.transcriptionMode ?? 'gemini_direct';
            const label = mode === 'hybrid_stt' ? 'Google STT + Gemini' : 'Gemini 2.5 Pro';
            const style = mode === 'hybrid_stt'
              ? { backgroundColor: '#fef3c7', color: '#92400e' }
              : { backgroundColor: '#dbeafe', color: '#1e40af' };
            return (
              <span style={{
                padding: '2px 6px',
                borderRadius: '8px',
                fontSize: '10px',
                fontWeight: '500',
                ...style
              }}>
                {label}
              </span>
            );
          })()}
        </div>

        {/* 更新狀態 */}
        <div style={{ marginTop: '10px' }}>
          <div style={{ color: '#6b7280', marginBottom: '4px' }}>更新狀態</div>
          <div style={{ color: '#374151', fontSize: '10px', marginBottom: '6px' }}>
            {updateStatus || '尚未檢查更新'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <button
              type="button"
              onClick={onCheckUpdates}
              style={{
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #3b82f6',
                backgroundColor: 'white',
                color: '#1d4ed8',
                fontSize: '10px',
                fontWeight: 600,
                cursor: onCheckUpdates ? 'pointer' : 'not-allowed',
                opacity: onCheckUpdates ? 1 : 0.5
              }}
              disabled={!onCheckUpdates}
            >
              檢查更新
            </button>

            {updateAvailable && !updateDownloaded && (
              <button
                type="button"
                onClick={onDownloadUpdate}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #f59e0b',
                  backgroundColor: '#fef3c7',
                  color: '#b45309',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: onDownloadUpdate ? 'pointer' : 'not-allowed',
                  opacity: onDownloadUpdate ? 1 : 0.5
                }}
                disabled={!onDownloadUpdate}
              >
                下載更新{updateInfo?.version ? ` (v${updateInfo.version})` : ''}
              </button>
            )}

            {updateDownloaded && (
              <button
                type="button"
                onClick={onInstallUpdate}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid #10b981',
                  backgroundColor: '#d1fae5',
                  color: '#047857',
                  fontSize: '10px',
                  fontWeight: 600,
                  cursor: onInstallUpdate ? 'pointer' : 'not-allowed',
                  opacity: onInstallUpdate ? 1 : 0.5
                }}
                disabled={!onInstallUpdate}
              >
                立即安裝更新
              </button>
            )}
          </div>

          {updateProgress && updateProgress.percent > 0 && updateProgress.percent < 100 && (
            <div style={{ marginTop: '6px' }}>
              <div style={{
                width: '100%',
                height: '6px',
                borderRadius: '999px',
                backgroundColor: '#e5e7eb'
              }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, updateProgress.percent))}%`,
                    height: '6px',
                    borderRadius: '999px',
                    backgroundColor: '#2563eb',
                    transition: 'width 0.2s ease'
                  }}
                />
              </div>
              <div style={{ color: '#4b5563', fontSize: '10px', marginTop: '4px' }}>
                {updateProgress.status}
              </div>
            </div>
          )}
        </div>

        {/* 開發者信息 */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '12px',
          paddingTop: '6px',
          borderTop: '1px solid #f3f4f6',
          fontSize: '10px',
          color: '#9ca3af'
        }}>
          Develop & Maintain by Janus
        </div>
      </div>
    </nav>
  );
};
