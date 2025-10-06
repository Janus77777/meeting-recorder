import React, { useState } from 'react';

export interface DecisionItem { id: string; content: string }

interface Props { title?: string; items: DecisionItem[]; defaultOpen?: boolean }

export const DecisionsCardKit: React.FC<Props> = ({ title = '決議與結論', items, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 5;
  const list = open ? items : items.slice(0, TOP);
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]">
      <header className="flex items-center justify-between mb-2">
        <h4 className="text-[#0F172A] font-semibold">{title}</h4>
        {items.length > TOP && (
          <button className="px-3 py-1.5 text-sm rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0]" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </header>
      <ul className={`pl-1 space-y-2 text-[15px] text-[#334155] ${open ? 'max-h-[380px] overflow-auto pr-1' : ''}`}>
        {list.map(i => (
          <li key={i.id} className="flex items-start gap-2"><span className="text-green-600">✔</span><span>{i.content}</span></li>
        ))}
      </ul>
    </section>
  );
};

export default DecisionsCardKit;

