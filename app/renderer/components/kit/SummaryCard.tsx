import React, { useMemo, useState } from 'react';

interface SummaryCardProps {
  title?: string;
  summary: string[];
  fullContent?: string[];
  defaultOpen?: boolean;
}

type Priority = 'high' | 'medium' | 'low';

const dotClass = (p?: Priority) => {
  if (p === 'high') return 'bg-[#F59E0B]';
  if (p === 'medium') return 'bg-[#16A34A]';
  return 'bg-[#2563EB]'; // 低或未標記
};

const badge = (p?: Priority) => {
  if (!p) return null;
  const map: Record<Priority, string> = {
    high: 'bg-[#F59E0B] text-white',
    medium: 'bg-[#16A34A] text-white',
    low: 'bg-[#CBD5E1] text-[#64748B]'
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs mr-2 ${map[p]}`}>
      {p === 'high' ? '高' : p === 'medium' ? '中' : '低'}
    </span>
  );
};

const parsePriority = (line: string): { text: string; p?: Priority } => {
  const m = line.match(/^\s*\[(高|中|低)\]\s+(.+)$/);
  if (!m) return { text: line };
  const lvl = m[1];
  const p: Priority = lvl === '高' ? 'high' : lvl === '中' ? 'medium' : 'low';
  return { text: m[2].trim(), p };
};

export const SummaryCardKit: React.FC<SummaryCardProps> = ({ title = '摘要全文', summary, fullContent, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 6;
  const rawLines = open ? (fullContent && fullContent.length > 0 ? fullContent : summary) : (summary.length ? summary.slice(0, TOP) : []);
  const lines = useMemo(() => rawLines.map(l => parsePriority(l)), [rawLines]);
  const canToggle = (fullContent && fullContent.length > TOP) || summary.length > TOP;

  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)] p-6">
      <header className="flex items-center mb-3">
        <h4 className="text-[#0F172A] font-semibold text-[18px] mr-auto">{title}</h4>
        {canToggle && (
          <button className="px-3 py-1.5 text-sm rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[#0F172A]" onClick={() => setOpen(v => !v)}>
            {open ? '收合' : '展開全部'}
          </button>
        )}
      </header>
      <div className={open ? 'max-h-[460px] overflow-auto pr-1' : ''}>
        <ul className="pl-5 space-y-3 text-[15px] leading-8 text-[#0F172A]">
          {lines.map((item, i) => (
            <li key={i} className="relative">
              <span className={`inline-block w-2 h-2 rounded-full mr-3 align-middle ${dotClass(item.p)}`} />
              {badge(item.p)}
              <span className="align-middle">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default SummaryCardKit;
