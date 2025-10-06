import React, { useMemo, useState } from 'react';
import { MeetingSummary } from '@shared/types';
import { FLAGS } from '@shared/flags';

type SectionKey = '概要' | '主要重點' | '決議與結論' | '待辦事項' | '其他備註' | string;

type ParsedSections = Record<SectionKey, string[]>;

const SECTION_META: Array<{ key: SectionKey; icon: string; title: string }> = [
  { key: '概要', icon: '📝', title: '概要' },
  { key: '主要重點', icon: '⭐', title: '主要重點' },
  { key: '決議與結論', icon: '✅', title: '決議與結論' },
  { key: '待辦事項', icon: '📌', title: '待辦事項' },
  { key: '其他備註', icon: '💡', title: '其他備註' }
];

interface SummaryViewProps {
  /**
   * 以 Markdown 形式呈現的會議摘要內容
   */
  summaryMarkdown?: string;
  /**
   * 具結構化資訊的會議摘要 (若同時提供，優先使用其中的 Markdown 文字)
   */
  summaryData?: MeetingSummary;
  /**
   * 點擊複製後的回呼
   */
  onCopyMarkdown?: (markdown: string) => void;
  className?: string;
}

const parseMarkdownSections = (markdown: string): ParsedSections => {
  if (!markdown.trim()) {
    return {};
  }

  const lines = markdown.split(/\r?\n/);
  const sections: ParsedSections = {};
  let currentKey: SectionKey | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingMatch = line.match(/^##\s+(.+)$/i);
    if (headingMatch) {
      currentKey = headingMatch[1].trim() as SectionKey;
      if (!sections[currentKey]) {
        sections[currentKey] = [];
      }
      continue;
    }

    if (line.startsWith('-')) {
      const normalized = line.replace(/^[-•]\s*/, '').trim();
      if (currentKey) {
        sections[currentKey] = sections[currentKey] || [];
        sections[currentKey].push(normalized);
      }
      continue;
    }

    if (currentKey) {
      sections[currentKey] = sections[currentKey] || [];
      sections[currentKey].push(line);
    }
  }

  return sections;
};

const formatDate = (dateString?: string) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    return dateString;
  }
};

export const SummaryView: React.FC<SummaryViewProps> = ({
  summaryMarkdown,
  summaryData,
  onCopyMarkdown,
  className = ''
}) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const markdown = summaryMarkdown ?? summaryData?.minutesMd ?? '';

  const sections = useMemo(() => parseMarkdownSections(markdown), [markdown]);

  const orderedSections = SECTION_META
    .map(meta => ({
      ...meta,
      items: sections[meta.key]?.filter(Boolean) ?? []
    }))
    .filter(section => section.items.length > 0);

  const extraSections = Object.entries(sections)
    .filter(([key]) => !SECTION_META.some(meta => meta.key === key))
    .map(([key, items]) => ({ key, title: key, icon: '', items }))
    .filter(section => section.items.length > 0);

  const timelineItems = summaryData?.timeline ?? [];
  const todoItems = summaryData?.todos ?? [];
  const speakerItems = summaryData?.by_speaker ?? [];

  const handleCopyMarkdown = async () => {
    if (!FLAGS.MARKDOWN_COPY || !markdown.trim()) {
      return;
    }

    try {
      const result = await window.electronAPI.clipboard.writeText(markdown);
      if (result.success) {
        setCopied(true);
        onCopyMarkdown?.(markdown);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error('複製會議摘要失敗:', error);
    }
  };

  const hasAnyContent = Boolean(
    markdown.trim() ||
    timelineItems.length ||
    todoItems.length ||
    speakerItems.length
  );

  // 顯示限制：未展開時僅顯示 Top N
  const TOP_OVERVIEW = 5;
  const TOP_HIGHLIGHT = 8;
  const TOP_GENERIC = 5;
  const TOP_TIMELINE = 5;
  const TOP_TODOS = 5;

  const isOpen = (key: string) => Boolean(expanded[key]);
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className={`summary-panel summary-panel--reading ${className}`}>
      <div className="summary-panel__header">
        <div>
          <p className="summary-panel__eyebrow">Smart Minutes</p>
          <h3 className="summary-panel__title">會議摘要</h3>
          <p className="summary-panel__hint">根據當前提示詞與詞彙表產生，建議於分享前稍作審閱</p>
        </div>

        {FLAGS.MARKDOWN_COPY && (
          <button
            type="button"
            className={`btn btn--secondary summary-panel__copy ${copied ? 'is-copied' : ''}`}
            onClick={handleCopyMarkdown}
            disabled={!markdown.trim()}
          >
            {copied ? '已複製' : '複製 Markdown'}
          </button>
        )}
      </div>

      {!hasAnyContent ? (
        <div className="summary-panel__empty">
          <div className="empty-state__icon">📝</div>
          <p className="empty-state__title">尚未產出會議摘要</p>
          <p className="empty-state__text">完成轉錄後，系統會自動生成摘要與重點</p>
        </div>
      ) : (
        <div className="summary-panel__body">
          {/* 英雄卡（總覽） */}
          {(() => {
            const overview = orderedSections.find(s => s.key === '概要');
            if (!overview) return null;
            const TOP = TOP_OVERVIEW;
            return (
              <section className="summary-hero">
                <header className="summary-hero__header">
                  <div className="summary-hero__title">
                    <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
                    <h4>總覽</h4>
                  </div>
                  {overview.items.length > TOP && (
                    <button className="btn btn--minimal" onClick={() => toggle('overview')}>
                      {isOpen('overview') ? '收合' : '展開全部'}
                    </button>
                  )}
                </header>
                <ul className={`summary-hero__list ${isOpen('overview') ? 'summary-card__list--scroll' : ''}`}>
                  {(isOpen('overview') ? overview.items : overview.items.slice(0, TOP)).map((item, idx) => (
                    <li key={`ov-${idx}`}>{item}</li>
                  ))}
                </ul>
              </section>
            );
          })()}

          {(orderedSections.length > 0 || extraSections.length > 0) && (
            <div className="summary-grid">
              {[...orderedSections.filter(s => s.key !== '概要'), ...extraSections].map(section => {
                const top = section.key === '主要重點' ? TOP_HIGHLIGHT : TOP_GENERIC;
                const key = String(section.title || section.key);
                const open = isOpen(key);
                const items = open ? section.items : section.items.slice(0, top);
                return (
                  <div key={section.key} className="summary-card">
                    <div className="summary-card__header summary-card__header--justify">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="summary-card__icon" aria-hidden><span className="dot" /></span>
                        <h4 className="summary-card__title">{section.title}</h4>
                      </div>
                      {section.items.length > top && (
                        <button className="btn btn--minimal" onClick={() => toggle(key)}>{open ? '收合' : '展開全部'}</button>
                      )}
                    </div>
                    <ul className={`summary-card__list ${open ? 'summary-card__list--scroll' : ''}`}>
                      {items.map((item, index) => (
                        <li key={`${section.key}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {(timelineItems.length > 0 || todoItems.length > 0 || speakerItems.length > 0) && (
            <div className="summary-detail-grid">
              {timelineItems.length > 0 && (
                <section className="summary-detail">
                  <header className="summary-detail__header">
                    <span className="summary-detail__icon" aria-hidden>•</span>
                    <h4 className="summary-detail__title">會議時間軸</h4>
                  </header>
                  <ul className={`summary-detail__list ${isOpen('timeline') ? 'summary-card__list--scroll' : ''}`}>
                    {(isOpen('timeline') ? timelineItems : timelineItems.slice(0, TOP_TIMELINE)).map((item, index) => (
                      <li key={`timeline-${index}`}>
                        <div className="summary-detail__item-title">{item.item}</div>
                        <div className="summary-detail__meta">
                          {item.date && <span>📅 {formatDate(item.date)}</span>}
                          {item.owner && <span>👤 {item.owner}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {timelineItems.length > TOP_TIMELINE && (
                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                      <button className="btn btn--minimal" onClick={() => toggle('timeline')}>{isOpen('timeline') ? '收合' : '展開全部'}</button>
                    </div>
                  )}
                </section>
              )}

              {todoItems.length > 0 && (
                <section className="summary-detail">
                  <header className="summary-detail__header">
                    <span className="summary-detail__icon" aria-hidden>•</span>
                    <h4 className="summary-detail__title">待辦與責任人</h4>
                  </header>
                  <ul className={`summary-detail__list ${isOpen('todos') ? 'summary-card__list--scroll' : ''}`}>
                    {(isOpen('todos') ? todoItems : todoItems.slice(0, TOP_TODOS)).map((todo, index) => (
                      <li key={`todo-${index}`}>
                        <div className="summary-detail__item-title">{todo.task}</div>
                        <div className="summary-detail__meta">
                          {todo.owner && <span>👤 {todo.owner}</span>}
                          {todo.due && <span>📅 {formatDate(todo.due)}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {todoItems.length > TOP_TODOS && (
                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                      <button className="btn btn--minimal" onClick={() => toggle('todos')}>{isOpen('todos') ? '收合' : '展開全部'}</button>
                    </div>
                  )}
                </section>
              )}

              {speakerItems.length > 0 && (
                <section className="summary-detail">
                  <header className="summary-detail__header">
                    <span className="summary-detail__icon" aria-hidden>•</span>
                    <h4 className="summary-detail__title">主要發言人</h4>
                  </header>
                  <ul className="summary-detail__list">
                    {speakerItems.map((speaker, index) => (
                      <li key={`speaker-${index}`}>
                        <div className="summary-detail__item-title">{speaker.speaker}</div>
                        <ul className="summary-detail__sublist">
                          {speaker.items.map((item, subIndex) => (
                            <li key={`speaker-${index}-${subIndex}`}>{item}</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {markdown && (orderedSections.length === 0 && extraSections.length === 0) && (
            <div className="summary-raw">
              <pre>{markdown}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SummaryView;
