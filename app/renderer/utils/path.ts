export const normalizePath = (segment: string): string => {
  if (!segment) {
    return '';
  }
  return segment.replace(/\\+/g, '/');
};

export const joinPath = (...segments: Array<string | undefined | null>): string => {
  if (!segments.length) {
    return '';
  }

  const filtered = segments.filter((segment): segment is string => Boolean(segment && segment.trim().length));

  if (!filtered.length) {
    return '';
  }

  const [first, ...rest] = filtered;

  const normalizedFirst = normalizePath(first).replace(/\/+$/, '');
  const normalizedRest = rest.map(segment => normalizePath(segment).replace(/^\/+/, '').replace(/\/+$/, ''));

  return [normalizedFirst, ...normalizedRest]
    .filter(Boolean)
    .join('/')
    .replace(/\/+$/, '');
};
