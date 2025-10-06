import React, { useState } from 'react';

export type Priority = 'high' | 'medium' | 'low';

export interface HighlightItem {
  id: string;
  content: string;
  priority?: Priority;
}

interface HighlightsCardProps {
  title?: string;
  highlights: HighlightItem[];
  defaultOpen?: boolean;
  large?: boolean;
}

export const HighlightsCard: React.FC<HighlightsCardProps> = ({ title = '主要重點', highlights, defaultOpen = false, large = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 8;
  const items = open ? highlights : highlights.slice(0, TOP);

  const badge = (p?: Priority) => {
    const map: Record<Priority, { label: string; className: string }> = {
      high: { label: '高', className: 'chip chip--danger' },
      medium: { label: '中', className: 'chip chip--warning' },
      low: { label: '低', className: 'chip chip--neutral' as any }
    };
    if (!p) return null;
    const data = map[p];
    return <span className={data.className} style={{ marginRight: 8 }}>{data.label}</span>;
  };

  return (
    <section className={`summary-card ${large ? 'summary-card--large' : ''}`}>
      <div className="summary-card__header summary-card__header--justify">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
          <h4 className="summary-card__title">{title}</h4>
        </div>
        {highlights.length > TOP && (
          <button className="btn btn--minimal" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </div>
      <ul className={`summary-card__list ${open ? 'summary-card__list--scroll' : ''}`}>
        {items.map(item => (
          <li key={item.id}>
            {badge(item.priority)}
            {item.content}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default HighlightsCard;
