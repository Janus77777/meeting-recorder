import React, { useState } from 'react';

export interface DecisionItem {
  id: string;
  content: string;
}

interface DecisionsCardProps {
  title?: string;
  decisions: DecisionItem[];
  defaultOpen?: boolean;
  large?: boolean;
}

export const DecisionsCard: React.FC<DecisionsCardProps> = ({ title = '決議與結論', decisions, defaultOpen = false, large = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 3;
  const items = open ? decisions : decisions.slice(0, TOP);

  return (
    <section className={`summary-card ${large ? 'summary-card--large' : ''}`}>
      <div className="summary-card__header summary-card__header--justify">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
          <h4 className="summary-card__title">{title}</h4>
        </div>
        {decisions.length > TOP && (
          <button className="btn btn--minimal" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </div>
      <ul className={`summary-card__list ${open ? 'summary-card__list--scroll' : ''}`}>
        {items.map(item => (
          <li key={item.id}>{item.content}</li>
        ))}
      </ul>
    </section>
  );
};

export default DecisionsCard;
