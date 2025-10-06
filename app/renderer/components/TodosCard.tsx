import React, { useState } from 'react';

export type TodoStatus = 'pending' | 'in-progress' | 'completed';

export interface TodoItem {
  id: string;
  task: string;
  assignee?: string;
  dueDate?: string;
  status?: TodoStatus;
}

interface TodosCardProps {
  title?: string;
  todos: TodoItem[];
  defaultOpen?: boolean;
  large?: boolean;
}

export const TodosCard: React.FC<TodosCardProps> = ({ title = '待辦事項', todos, defaultOpen = false, large = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const TOP = 5;
  const items = open ? todos : todos.slice(0, TOP);

  const statusChip = (s?: TodoStatus) => {
    if (!s) return null;
    const map: Record<TodoStatus, { label: string; className: string }> = {
      'pending': { label: '待處理', className: 'chip chip--warning' },
      'in-progress': { label: '進行中', className: 'chip chip--info' },
      'completed': { label: '完成', className: 'chip chip--success' }
    };
    const d = map[s];
    return <span className={d.className} style={{ marginLeft: 8 }}>{d.label}</span>;
  };

  return (
    <section className={`summary-card ${large ? 'summary-card--large' : ''}`}>
      <div className="summary-card__header summary-card__header--justify">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
          <h4 className="summary-card__title">{title}</h4>
        </div>
        {todos.length > TOP && (
          <button className="btn btn--minimal" onClick={() => setOpen(v => !v)}>{open ? '收合' : '展開全部'}</button>
        )}
      </div>

      <ul className={`summary-card__list ${open ? 'summary-card__list--scroll' : ''}`}>
        {items.map(item => (
          <li key={item.id}>
            <span>{item.task}</span>
            <span style={{ marginLeft: 8 }} className="chip chip--neutral">{item.assignee ?? '未指派'}</span>
            {item.dueDate && <span style={{ marginLeft: 8 }} className="chip chip--neutral">{item.dueDate}</span>}
            {statusChip(item.status)}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default TodosCard;
