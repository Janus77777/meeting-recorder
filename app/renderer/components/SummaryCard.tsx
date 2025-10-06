import React, { useState } from 'react';

interface SummaryCardProps {
  title?: string;
  summary: string[]; // short lines
  fullContent?: string[]; // optional longer lines
  defaultOpen?: boolean;
  large?: boolean;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({ title = '會議摘要', summary, fullContent, defaultOpen = false, large = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 5;
  const lines = open ? (fullContent && fullContent.length > 0 ? fullContent : summary) : summary.slice(0, TOP);

  const canToggle = (fullContent && fullContent.length > TOP) || summary.length > TOP;

  return (
    <section className={`summary-hero ${large ? 'summary-hero--large' : ''}`}>
      <header className="summary-hero__header">
        <div className="summary-hero__title"><h4 style={{ margin: 0 }}>{title}</h4></div>
        {canToggle && (
          <button className="btn btn--minimal" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </header>
      <ul className={`summary-hero__list ${open ? 'summary-card__list--scroll' : ''}`}>
        {lines.map((item, idx) => (
          <li key={`sum-${idx}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
};

export default SummaryCard;
