import React, { useState } from 'react';
import { TranscriptSegment } from '@shared/types';

interface TranscriptViewProps {
  segments: TranscriptSegment[];
  className?: string;
  showTimestamps?: boolean;
  searchQuery?: string;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  segments,
  className = '',
  showTimestamps = true,
  searchQuery = ''
}) => {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
                {speaker}
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
                <div className={`flex-shrink-0 font-semibold text-sm pt-1 w-20 ${getSpeakerColor(segment.speaker)}`}>
                  {segment.speaker}
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
          <span> • 發言人：{selectedSpeaker}</span>
        )}
      </div>
    </div>
  );
};