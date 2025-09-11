import { MeetingSummary, TranscriptSegment } from '@shared/types';

// Format duration in seconds to readable string
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// Format file size in bytes to readable string
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Format date to readable string
export const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  return d.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return '剛才';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} 分鐘前`;
  } else if (diffHours < 24) {
    return `${diffHours} 小時前`;
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else {
    return formatDate(d);
  }
};

// Generate Markdown from meeting summary
export const generateMarkdown = (
  title: string,
  participants: string[],
  createdAt: string,
  transcript: TranscriptSegment[],
  summary: MeetingSummary
): string => {
  let markdown = `# ${title}\n\n`;
  
  // Meeting metadata
  markdown += `**會議時間**: ${formatDate(createdAt)}\n`;
  markdown += `**參與人員**: ${participants.join('、')}\n\n`;

  // Summary highlights
  if (summary.highlights.length > 0) {
    markdown += `## 重點摘要\n\n`;
    summary.highlights.forEach(highlight => {
      markdown += `- ${highlight}\n`;
    });
    markdown += `\n`;
  }

  // Timeline
  if (summary.timeline.length > 0) {
    markdown += `## 時間軸\n\n`;
    summary.timeline.forEach(item => {
      markdown += `- **${item.item}**`;
      if (item.date) markdown += ` (${formatDate(item.date)})`;
      if (item.owner) markdown += ` - ${item.owner}`;
      markdown += `\n`;
    });
    markdown += `\n`;
  }

  // TODOs
  if (summary.todos.length > 0) {
    markdown += `## 待辦事項\n\n`;
    summary.todos.forEach(todo => {
      markdown += `- [ ] **${todo.task}**`;
      if (todo.owner) markdown += ` - 負責人：${todo.owner}`;
      if (todo.due) markdown += ` - 截止：${formatDate(todo.due)}`;
      markdown += `\n`;
    });
    markdown += `\n`;
  }

  // Speaker analysis
  if (summary.by_speaker.length > 0) {
    markdown += `## 發言人分析\n\n`;
    summary.by_speaker.forEach(speaker => {
      markdown += `### ${speaker.speaker}\n\n`;
      speaker.items.forEach(item => {
        markdown += `- ${item}\n`;
      });
      markdown += `\n`;
    });
  }

  // Full transcript
  if (transcript.length > 0) {
    markdown += `## 完整轉錄\n\n`;
    transcript.forEach(segment => {
      markdown += `**${segment.speaker}** (${formatDuration(segment.start)}): ${segment.text}\n\n`;
    });
  }

  return markdown;
};

// Generate plain text summary for copying
export const generatePlainTextSummary = (
  title: string,
  participants: string[],
  createdAt: string,
  summary: MeetingSummary
): string => {
  let text = `${title}\n`;
  text += `會議時間: ${formatDate(createdAt)}\n`;
  text += `參與人員: ${participants.join('、')}\n\n`;

  if (summary.highlights.length > 0) {
    text += `重點摘要:\n`;
    summary.highlights.forEach((highlight, index) => {
      text += `${index + 1}. ${highlight}\n`;
    });
    text += `\n`;
  }

  if (summary.todos.length > 0) {
    text += `待辦事項:\n`;
    summary.todos.forEach((todo, index) => {
      text += `${index + 1}. ${todo.task}`;
      if (todo.owner) text += ` (${todo.owner})`;
      text += `\n`;
    });
  }

  return text;
};

// Truncate text with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

// Parse participants string to array
export const parseParticipants = (input: string): string[] => {
  return input
    .split(/[,，、]/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
};

// Validate meeting title
export const validateMeetingTitle = (title: string): string | null => {
  if (!title || title.trim().length === 0) {
    return '會議標題不能為空';
  }
  
  if (title.trim().length > 100) {
    return '會議標題不能超過 100 字元';
  }
  
  return null;
};

// Validate participants
export const validateParticipants = (participants: string[]): string | null => {
  if (participants.length === 0) {
    return '至少需要一位參與者';
  }
  
  if (participants.length > 20) {
    return '參與者數量不能超過 20 人';
  }
  
  const invalidNames = participants.filter(p => p.length > 50);
  if (invalidNames.length > 0) {
    return '參與者姓名不能超過 50 字元';
  }
  
  return null;
};

// Clean filename for Windows
export const sanitizeFilename = (filename: string): string => {
  // Remove invalid characters for Windows filenames
  return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
};