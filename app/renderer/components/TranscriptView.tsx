import React, { useState, useEffect } from 'react';
import { TranscriptSegment } from '@shared/types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  fullText?: string;
  className?: string;
  showTimestamps?: boolean;
  searchQuery?: string;
  onSpeakerNameChange?: (oldName: string, newName: string) => void;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  segments,
  fullText,
  className = '',
  showTimestamps = true,
  searchQuery = '',
  onSpeakerNameChange
}) => {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [editedName, setEditedName] = useState<string>('');
  const [speakerMap, setSpeakerMap] = useState<Map<string, string>>(new Map());

  // Format time for display - handle both number and string formats
  const formatTime = (time: number | string): string => {
    // If it's already a string in MM:SS format, return it
    if (typeof time === 'string') {
      return time;
    }

    // If it's a number, convert to MM:SS format
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get display name for speaker
  const getDisplayName = (speaker: string): string => {
    return speakerMap.get(speaker) || speaker;
  };

  // Handle speaker name edit
  const handleSpeakerEdit = (speaker: string) => {
    setEditingSpeaker(speaker);
    setEditedName(getDisplayName(speaker));
  };

  // Save edited speaker name
  const saveSpeakerName = () => {
    if (editingSpeaker && editedName && editedName !== editingSpeaker) {
      const newMap = new Map(speakerMap);
      newMap.set(editingSpeaker, editedName);
      setSpeakerMap(newMap);

      // Notify parent component
      if (onSpeakerNameChange) {
        onSpeakerNameChange(editingSpeaker, editedName);
      }
    }
    setEditingSpeaker(null);
    setEditedName('');
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingSpeaker(null);
    setEditedName('');
  };

  // Get unique speakers
  const speakers = Array.from(new Set(segments.map(seg => seg.speaker)));

  // Filter segments based on selected speaker and search query
  const filteredSegments = segments.filter(segment => {
    const matchesSpeaker = !selectedSpeaker || segment.speaker === selectedSpeaker;
    const matchesSearch = !searchQuery || 
      segment.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      segment.speaker.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesSpeaker && matchesSearch;
  });

  // Highlight search terms
  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 px-1 rounded">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // Get speaker color
  const getSpeakerColor = (speaker: string): string => {
    const colors = [
      'text-blue-600',
      'text-green-600', 
      'text-purple-600',
      'text-orange-600',
      'text-red-600',
      'text-indigo-600'
    ];
    
    const index = speakers.indexOf(speaker) % colors.length;
    return colors[index];
  };

  // 如果沒有 segments 但有 fullText，顯示純文字內容
  if (segments.length === 0 && fullText) {
    return (
      <div className={`bg-white rounded-lg shadow-sm ${className}`}>
        <div className="p-4">
          <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
            {fullText}
          </div>
        </div>
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          純文字格式轉錄
        </div>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>暫無轉錄內容</p>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Speaker Filter */}
      {speakers.length > 1 && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedSpeaker(null)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                !selectedSpeaker
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {speakers.map((speaker) => (
              <button
                key={speaker}
                onClick={() => setSelectedSpeaker(speaker)}
                className={`px-3 py-1 rounded-full text-sm transition-colors ${
                  selectedSpeaker === speaker
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {getDisplayName(speaker)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transcript Content */}
      <div className="p-4">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-4 text-gray-500">
            <p>找不到符合條件的內容</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSegments.map((segment, index) => (
              <div
                key={index}
                className="flex gap-3 group hover:bg-gray-50 p-2 rounded transition-colors"
              >
                {/* Timestamp */}
                {showTimestamps && (
                  <div className="flex-shrink-0 text-xs text-gray-400 font-mono pt-1 w-12">
                    {formatTime(segment.start)}
                  </div>
                )}

                {/* Speaker */}
                <div className={`flex-shrink-0 font-semibold text-sm pt-1 min-w-[120px] flex items-center gap-1 ${getSpeakerColor(segment.speaker)}`}>
                  {editingSpeaker === segment.speaker ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveSpeakerName();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="w-24 px-1 py-0 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={saveSpeakerName}
                        className="text-green-600 hover:text-green-700"
                        title="儲存"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-red-600 hover:text-red-700"
                        title="取消"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 group">
                      <span>{getDisplayName(segment.speaker)}</span>
                      <button
                        onClick={() => handleSpeakerEdit(segment.speaker)}
                        className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                        title="編輯名稱"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1">
                  <p className="text-gray-800 leading-relaxed">
                    {highlightText(segment.text, searchQuery)}
                  </p>
                  
                  {/* Timestamp range on hover */}
                  {showTimestamps && (
                    <div className="text-xs text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {formatTime(segment.start)} - {formatTime(segment.end)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Statistics */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        顯示 {filteredSegments.length} / {segments.length} 條記錄
        {searchQuery && (
          <span> • 搜尋："{searchQuery}"</span>
        )}
        {selectedSpeaker && (
          <span> • 發言人：{getDisplayName(selectedSpeaker)}</span>
        )}
      </div>
    </div>
  );
};