import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

interface ResultHeaderProps {
  fileName: string;
  completedTime?: string;
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  actions?: React.ReactNode;
  onBack?: () => void;
  jobOptions?: Array<{ value: string; label: string }>;
  selectedJob?: string;
  onSelectJob?: (value: string) => void;
  // 新增：右上模式切換（摘要｜逐字稿）
  mode?: 'summary' | 'transcript';
  onModeChange?: (mode: 'summary' | 'transcript') => void;
}

export const ResultHeader: React.FC<ResultHeaderProps> = ({ fileName, completedTime, tabs, activeTab, onTabChange, actions, onBack, jobOptions, selectedJob, onSelectJob, mode, onModeChange }) => {
  return (
    <div className="result-header">
      <div className="result-header__row">
        <div className="result-header__left">
          {onBack && (
            <button type="button" className="result-header__back" onClick={onBack}>返回清單</button>
          )}
        </div>

        <div className="result-fileinfo">
          <div className="result-fileinfo__title">{fileName}</div>
          {completedTime && <div className="result-fileinfo__meta">完成時間：{completedTime}</div>}
        </div>

        <div className="result-header__actions">
          {jobOptions && onSelectJob && (
            <select
              value={selectedJob}
              onChange={(e) => onSelectJob(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--color-border)', maxWidth: '220px', textOverflow: 'ellipsis', overflow: 'hidden' }}
            >
              {jobOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {onModeChange && (
            <div className="segmented" role="tablist" aria-label="檢視模式切換" style={{ marginLeft: 8 }}>
              <button
                type="button"
                className={`segmented__btn ${mode === 'summary' ? 'is-active' : ''}`}
                onClick={() => onModeChange('summary')}
              >摘要</button>
              <button
                type="button"
                className={`segmented__btn ${mode === 'transcript' ? 'is-active' : ''}`}
                onClick={() => onModeChange('transcript')}
              >逐字稿</button>
            </div>
          )}
          {actions}
        </div>
      </div>

      {!!tabs && tabs.length > 0 && onTabChange && (
        <div className="pill-group">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`pill ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResultHeader;
