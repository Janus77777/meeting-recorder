import React from 'react';

interface ProgressBarProps {
  progress: number; // 0-100
  remainingTime?: string; // mm:ss
  isVisible?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, remainingTime, isVisible = true }) => {
  if (!isVisible) return null;
  const pct = Math.max(0, Math.min(100, progress || 0));
  return (
    <div className="status-bar status-bar--info" style={{ marginTop: 12 }}>
      <div className="status-bar__icon" aria-hidden>ℹ️</div>
      <div className="status-bar__content">
        <h1 className="status-bar__title">處理中</h1>
        <p className="status-bar__subtitle">{pct}%{remainingTime ? `（預估剩餘 ${remainingTime}）` : ''}</p>
        <div className="status-progress">
          <div className="status-progress__bar" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
};

export default ProgressBar;

