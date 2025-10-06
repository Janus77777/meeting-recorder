import React, { useState } from 'react';

export interface TodoItem {
  id: string;
  task: string;
  assignee?: string;
  dueDate?: string;
  status?: 'pending' | 'in-progress' | 'completed' | 'done';
}

interface Props { title?: string; items: TodoItem[]; defaultOpen?: boolean }

const statusChip = (s?: TodoItem['status']) => {
  const map: Record<string, string> = {
    pending: 'bg-slate-200 text-slate-700',
    'in-progress': 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    done: 'bg-emerald-100 text-emerald-700',
  };
  const label = s === 'pending' ? '待處理' : s === 'in-progress' ? '進行中' : '完成';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${map[s || 'pending']}`}>{label}</span>;
};

export const TodosCardKit: React.FC<Props> = ({ title = '待辦事項', items, defaultOpen = true }) => {
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
          <li key={i.id} className="flex flex-col gap-1">
            <div className="font-medium">{i.task}</div>
            <div className="flex items-center gap-2 text-sm text-[#64748B]">
              {i.assignee && <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">{i.assignee}</span>}
              {i.dueDate && <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5">{i.dueDate}</span>}
              {statusChip(i.status)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TodosCardKit;

