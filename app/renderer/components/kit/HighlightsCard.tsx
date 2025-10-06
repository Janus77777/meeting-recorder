import React, { useState } from 'react';

export type Priority = 'high' | 'medium' | 'low';

export interface HighlightItem {
  id: string;
  content: string;
  priority?: Priority;
}

interface Props {
  title?: string;
  items: HighlightItem[];
  defaultOpen?: boolean;
}

const badge = (p?: Priority) => {
  if (!p) return null;
  const map: Record<Priority, string> = { high: 'bg-[#F59E0B] text-white', medium: 'bg-[#16A34A] text-white', low: 'bg-[#CBD5E1] text-[#64748B]' };
  return <span className={`rounded-full px-2 py-0.5 text-xs mr-2 ${map[p]}`}>{p === 'high' ? '高' : p === 'medium' ? '中' : '低'}</span>;
};

const dotClass = (p?: Priority) => {
  if (p === 'high') return 'bg-[#F59E0B]';
  if (p === 'medium') return 'bg-[#16A34A]';
  return 'bg-[#2563EB]'; // 低或未標記
};

export const HighlightsCardKit: React.FC<Props> = ({ title = '主要重點', items, defaultOpen = true }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 8;
  const sortWeight = (p?: Priority) => (p === 'high' ? 3 : p === 'medium' ? 2 : 1);
  const sorted = [...items].sort((a, b) => sortWeight(b.priority) - sortWeight(a.priority));
  const list = open ? sorted : sorted.slice(0, TOP);
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]">
      <header className="flex items-center justify-between mb-3">
        <h4 className="text-[#0F172A] font-semibold">{title}</h4>
        {items.length > TOP && (
          <button className="px-3 py-1.5 text-sm rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0]" onClick={() => setOpen(v => !v)}>{open ? '收合 ˄' : '展開全部 ˅'}</button>
        )}
      </header>
      <ul className={`${open ? 'max-h-[380px] overflow-auto pr-1' : ''} pl-1 space-y-3 text-[16px] text-[#0F172A] leading-8`}>
        {list.map(item => (
          <li key={item.id} className="relative">
            <span className={`inline-block w-2 h-2 rounded-full mr-3 align-middle ${dotClass(item.priority)}`} />
            {badge(item.priority)}
            <span className="align-middle">{item.content}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default HighlightsCardKit;
