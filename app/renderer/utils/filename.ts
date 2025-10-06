// Filename normalization and universal truncation utilities

// Strip extension
export function stripExt(name: string): string {
  const m = name.match(/^(.*?)(\.[A-Za-z0-9]{1,6})$/);
  return m ? m[1] : name;
}

// Remove common noisy suffixes like "Recording", "錄音", Zoom's suffix, trailing dates/times
export function cleanNoise(raw: string): string {
  let s = raw.trim();
  // Replace underscores with spaces for readability
  s = s.replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

  // Remove typical trailing date/time patterns
  const dateTimePatterns = [
    /[\s_-]*\b20\d{2}[-\/_.](0?[1-9]|1[0-2])[-\/_.](0?[1-9]|[12]\d|3[01])\b/gi, // 2025-10-07 / 2025/10/07 / 2025.10.07
    /[\s_-]*\b(0?\d|1\d|2[0-3])[-:](0?\d|[1-5]\d)(?:[-:](0?\d|[1-5]\d))?\b/gi, // 12-02-11 / 12:02 / 12:02:11
    /[\s_-]*[上下]午?\s?\d{1,2}[:：]\d{2}(?::\d{2})?/g, // 上午/下午 12:02:11
  ];
  for (const re of dateTimePatterns) s = s.replace(re, '');

  // Remove common recorder words
  const noiseWords = [
    /\b(Recording|recording)\b/gi,
    /\bZoom\b/gi,
    /錄音/gi,
  ];
  for (const re of noiseWords) s = s.replace(re, '');

  // Cleanup brackets that became empty
  s = s.replace(/[\[\(【（]\s*[\]\)】）]/g, '');

  // Collapse spaces and trim punctuation at ends
  s = s.replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^[\s·,;:、。．…]+|[\s·,;:、。．…]+$/g, '');
  return s || raw.trim();
}

function cpLen(s: string): number {
  return Array.from(s).length;
}

export function truncateSmart(input: string, max = 7, head = 4, tail = 2): string {
  const chars = Array.from(input);
  if (chars.length <= max) return input;
  const h = chars.slice(0, Math.min(head, max - 1));
  const t = chars.slice(-Math.min(tail, Math.max(1, max - h.length - 1)));
  return `${h.join('')}…${t.join('')}`;
}

// Prefix-only truncation: keep the first N characters, append ellipsis
export function truncatePrefix(input: string, max = 12): string {
  const chars = Array.from(input);
  if (chars.length <= max) return input;
  const take = Math.max(1, max - 1);
  return `${chars.slice(0, take).join('')}…`;
}

export type DisplayVariant = 'short' | 'medium' | 'full';

export function normalizeName(original: string): string {
  return cleanNoise(stripExt(original || ''));
}

export function getDisplayName(original: string, variant: DisplayVariant): string {
  const base = normalizeName(original);
  if (variant === 'full') return base;
  // Per user request: show front-only, ignore tail
  if (variant === 'short') return truncatePrefix(base, 12);
  // medium
  return truncatePrefix(base, 20);
}
