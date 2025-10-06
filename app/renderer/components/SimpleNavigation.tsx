import React from 'react';
import { AppSettings } from '@shared/types';

interface SimpleNavigationProps {
  currentPage: 'record' | 'result' | 'prompts' | 'settings';
  onPageChange: (page: 'record' | 'result' | 'prompts' | 'settings') => void;
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

const NAV_ITEMS: Array<{ key: SimpleNavigationProps['currentPage']; label: string }> = [
  { key: 'record', label: '錄音工作室' },
  { key: 'result', label: '查看結果' },
  { key: 'prompts', label: '提示詞管理' },
  { key: 'settings', label: '系統設定' }
];

const resolveModeLabel = (settings?: AppSettings): string => {
  const mode = settings?.transcriptionMode ?? 'gemini_direct';
  return mode === 'hybrid_stt' ? 'Google STT + Gemini' : 'Gemini 2.5 Pro';
};

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
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__header">
        <div className="app-sidebar__logo" />
        <div>
          <p className="app-sidebar__title">會議錄音助手</p>
        </div>
      </div>

      <div className="app-sidebar__insight">
        <div className="insight-metric">
          <div className="insight-metric__badge">🕒</div>
          <div>
            <div className="insight-metric__label">進行中的任務</div>
            <div className="insight-metric__value">{activeJobCount}</div>
          </div>
        </div>
        <div className="insight-metric">
          <div className="insight-metric__badge">✅</div>
          <div>
            <div className="insight-metric__label">完成轉錄</div>
            <div className="insight-metric__value">{completedJobCount}</div>
          </div>
        </div>
        <div className="insight-metric">
          <div className="insight-metric__badge">📊</div>
          <div>
            <div className="insight-metric__label">總處理紀錄</div>
            <div className="insight-metric__value">{jobCount}</div>
          </div>
        </div>
      </div>

      <nav className="app-sidebar__nav">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPage === item.key;
          const counter = item.key === 'result' ? completedJobCount : 0;

          return (
            <button
              key={item.key}
              type="button"
              className={`app-sidebar__nav-button${isActive ? ' is-active' : ''}`}
              onClick={() => onPageChange(item.key)}
            >
              <span className="app-sidebar__nav-icon" aria-hidden />
              <span>{item.label}</span>
              {counter > 0 && <span className="app-sidebar__nav-counter">{counter}</span>}
            </button>
          );
        })}
      </nav>

      <div className="app-sidebar__footer">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span>版本</span>
            <strong>v{appVersion || '未知'}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>轉錄模式</span>
            <span className="chip chip--neutral">{resolveModeLabel(settings)}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>更新狀態</div>
          <div style={{ fontSize: '0.75rem', marginTop: 4, color: 'rgba(255,255,255,0.72)' }}>
            {updateStatus || '尚未檢查更新'}
          </div>

          <div className="sidebar-update-actions">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onCheckUpdates}
              disabled={!onCheckUpdates}
            >
              檢查更新
            </button>

            {updateAvailable && !updateDownloaded && (
              <button
                type="button"
                className="btn btn--primary"
                onClick={onDownloadUpdate}
                disabled={!onDownloadUpdate}
              >
                下載更新{updateInfo?.version ? ` (v${updateInfo.version})` : ''}
              </button>
            )}

            {updateDownloaded && (
              <button
                type="button"
                className="btn btn--success"
                onClick={onInstallUpdate}
                disabled={!onInstallUpdate}
              >
                🚀 立即安裝
              </button>
            )}
          </div>

          {updateProgress && updateProgress.percent > 0 && updateProgress.percent < 100 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.12)' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, updateProgress.percent))}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.9), rgba(56,189,248,0.95))',
                    transition: 'width 0.2s ease'
                  }}
                />
              </div>
              <div style={{ fontSize: '0.7rem', marginTop: 4, color: 'rgba(255,255,255,0.6)' }}>
                {updateProgress.status}
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'rgba(255,255,255,0.38)' }}>
          © {new Date().getFullYear()} · Develop &amp; Maintain by Janus
        </div>
      </div>
    </aside>
  );
};

export default SimpleNavigation;
