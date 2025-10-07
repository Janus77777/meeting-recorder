import React, { useMemo, useState } from 'react';
import { MeetingJob, TranscriptSegment } from '@shared/types';
import { generateMarkdown, formatDate, formatDuration } from '../utils/format';

interface Props {
  job: MeetingJob;
  onBack: () => void;
}

const ts = (n?: number | string) => {
  if (typeof n === 'number') {
    const m = Math.floor(n / 60), s = Math.floor(n % 60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  return n || '--:--';
};

const ExportCleaned = (job: MeetingJob): string => {
  const segs = job.transcriptSegments || [];
  return segs.map(s => `${ts(s.start)} ${s.speaker}: ${s.text}`).join('\n');
};

const STTDebugPage: React.FC<Props> = ({ job, onBack }) => {
  const [mode, setMode] = useState<'cleaned'|'raw'|'split'>('split');
  const [q, setQ] = useState('');
  const raw = job.debugRaw?.sttFullText || job.debugRaw?.sttFirstHalfText || '';
  const cleanedSegs = job.transcriptSegments || [];
  const cleanedFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cleanedSegs;
    return cleanedSegs.filter(s => (s.text||'').toLowerCase().includes(needle));
  }, [q, cleanedSegs]);

  const RawPane = (
    <div style={{ whiteSpace:'pre-wrap', lineHeight:1.7, fontFamily:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace', fontSize:13, color:'#334155' }}>
      {raw || '（無原始 STT 資料；請重新執行轉錄）'}
    </div>
  );

  const CleanedPane = (
    <div style={{ maxHeight: 560, overflow:'auto' }}>
      {cleanedFiltered.map((segment, idx) => (
        <div key={`${segment.start}-${segment.end}-${idx}`} className="transcript-item">
          <div>
            <div className="transcript-item__speaker">{segment.speaker}</div>
            <div className="transcript-item__time">{ts(segment.start)} - {ts(segment.end)}</div>
          </div>
          <div style={{ flex:1 }}>{segment.text}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-main">
        <header className="app-main__header">
          <div className="page-heading" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%' }}>
            <div className="flex items-center gap-2">
              <button className="btn btn--surface" onClick={onBack}>← 返回結果</button>
              <h1 className="page-heading__title">STT 偵錯對照</h1>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn btn--surface" onClick={() => window.electronAPI?.clipboard?.writeText?.(raw || '')}>複製原始</button>
              <button className="btn btn--surface" onClick={() => {
                const b = new Blob([raw || ''], { type:'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(b), a = document.createElement('a');
                a.href = url; a.download = `${job.filename.replace(/\.[^/.]+$/, '')}-stt-raw.txt`; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
              }}>下載原始</button>
              <button className="btn btn--surface" onClick={() => window.electronAPI?.clipboard?.writeText?.(ExportCleaned(job))}>複製修正後</button>
              <button className="btn btn--surface" onClick={() => {
                const b = new Blob([ExportCleaned(job)], { type:'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(b), a = document.createElement('a');
                a.href = url; a.download = `${job.filename.replace(/\.[^/.]+$/, '')}-transcript-cleaned.txt`; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
              }}>下載修正後</button>
            </div>
          </div>
        </header>

        <div className="app-main__content app-main__content--fluid" style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div className="flex items-center gap-3">
            <div className="flex bg-[#F1F5F9] rounded-xl p-1 shadow-inner">
              <button onClick={() => setMode('cleaned')} className={`px-4 py-1.5 rounded-lg text-sm ${mode==='cleaned'?'bg-white text-[#0F172A] shadow':'text-[#64748B]'}`}>修正後</button>
              <button onClick={() => setMode('raw')} className={`px-4 py-1.5 rounded-lg text-sm ${mode==='raw'?'bg-white text-[#0F172A] shadow':'text-[#64748B]'}`}>原始</button>
              <button onClick={() => setMode('split')} className={`px-4 py-1.5 rounded-lg text-sm ${mode==='split'?'bg-white text-[#0F172A] shadow':'text-[#64748B]'}`}>對照</button>
            </div>
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="搜尋修正後逐字稿" className="rounded-lg border border-[#E2E8F0] px-3 py-1.5 text-sm" style={{ minWidth: 220 }} />
          </div>

          {mode==='cleaned' && CleanedPane}
          {mode==='raw' && (
            <div style={{ maxHeight: 560, overflow:'auto' }}>{RawPane}</div>
          )}
          {mode==='split' && (
            <div className="grid grid-cols-2 gap-4">
              <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.18)]">
                <h5 className="text-[#334155] font-semibold mb-2">原始 STT（完整）</h5>
                <div style={{ maxHeight: 560, overflow:'auto' }}>{RawPane}</div>
              </section>
              <section className="rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_28px_-20px_rgba(15,23,42,0.18)]">
                <h5 className="text-[#334155] font-semibold mb-2">Gemini 修正後</h5>
                {CleanedPane}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default STTDebugPage;
