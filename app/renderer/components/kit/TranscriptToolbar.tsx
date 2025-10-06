import React from 'react';
import { Button } from './ui/button';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  speakers: string[];
  speaker: string;
  onSpeakerChange: (s: string) => void;
  onCopy?: () => void;
  onDownload?: () => void;
}

export const TranscriptToolbarKit: React.FC<Props> = ({ query, onQueryChange, speakers, speaker, onSpeakerChange, onCopy, onDownload }) => {
  return (
    <div className="flex items-center gap-3 mb-3">
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="搜尋逐字稿…"
        className="h-10 px-3 rounded-lg border border-[#E2E8F0] flex-1"
      />
      <select value={speaker} onChange={(e) => onSpeakerChange(e.target.value)} className="h-10 px-3 rounded-lg border border-[#E2E8F0]">
        <option value="">全部說話者</option>
        {speakers.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <Button variant="outline" onClick={onCopy}>複製全文</Button>
      <Button variant="outline" onClick={onDownload}>下載 TXT</Button>
    </div>
  );
};

export default TranscriptToolbarKit;

