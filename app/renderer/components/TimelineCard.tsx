import React, { useState } from 'react';

export interface TimelineItem {
  id: string;
  time?: string; // e.g., 00:48-01:36
  title: string;
  description?: string;
}

interface TimelineCardProps {
  title?: string;
  timeline: TimelineItem[];
  defaultOpen?: boolean;
  large?: boolean;
  onJump?: (item: TimelineItem) => void;
}

export const TimelineCard: React.FC<TimelineCardProps> = ({ title = '時間軸', timeline, defaultOpen = false, large = false, onJump }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 5;
  const items = open ? timeline : timeline.slice(0, TOP);

  return (
    <section className={`summary-card ${large ? 'summary-card--large' : ''}`}>
      <div className="summary-card__header summary-card__header--justify">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
          <h4 className="summary-card__title">{title}</h4>
        </div>
        {timeline.length > TOP && (
          <button className="btn btn--minimal" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </div>

      <ul className={`summary-card__list ${open ? 'summary-card__list--scroll' : ''}`}>
        {items.map(item => (
          <li key={item.id}>
            {item.time && <span className="chip chip--neutral" style={{ marginRight: 8 }}>{item.time}</span>}
            <strong>{item.title}</strong>
            {item.description && <span style={{ marginLeft: 6, color: 'var(--color-text-muted)' }}>{item.description}</span>}
            {onJump && item.time && (
              <button
                type="button"
                className="btn btn--minimal"
                style={{ marginLeft: 10, padding: '4px 8px' }}
                onClick={() => onJump(item)}
              >跳到逐字稿</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TimelineCard;
