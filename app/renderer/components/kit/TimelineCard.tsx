import React, { useState } from 'react';

export interface TimelineItem { id: string; time?: string; title: string; description?: string }
interface Props { title?: string; items: TimelineItem[]; defaultOpen?: boolean; onJump?: (item: TimelineItem) => void }

export const TimelineCardKit: React.FC<Props> = ({ title = '時間軸', items, defaultOpen = true, onJump }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 5;
  const list = open ? items : items.slice(0, TOP);
  return (
    <section className="rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]">
      <header className="flex items-center justify-between mb-3">
        <h4 className="text-[#0F172A] font-semibold">{title}</h4>
        {items.length > TOP && (
          <button className="px-3 py-1.5 text-sm rounded-lg bg-[#F1F5F9] hover:bg-[#E2E8F0]" onClick={() => setOpen(v => !v)}>{open ? '收合 ˄' : '展開全部 ˅'}</button>
        )}
      </header>
      <ul className={`pl-1 space-y-3 text-[16px] text-[#0F172A] leading-8 ${open ? 'max-h-[380px] overflow-auto pr-1' : ''}`}>
        {list.map(it => (
          <li key={it.id} className="flex items-start gap-3 p-4 rounded-2xl border border-[#E2E8F0] bg-[#FBFDFF]">
            {it.time && <span className="font-mono rounded-xl border border-[#D7E3F5] bg-[#EFF4FB] text-[#0F172A] px-3 py-1 text-[15px]">{it.time}</span>}
            <div>
              <div className="font-semibold text-[#0F172A]">{it.title}</div>
              {it.description && <div className="text-[#64748B] text-[15px]">{it.description}</div>}
            </div>
            {onJump && it.time && (
              <button className="ml-auto text-[#2563EB] hover:underline text-[15px]" onClick={() => onJump(it)}>跳到逐字稿 →</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TimelineCardKit;
