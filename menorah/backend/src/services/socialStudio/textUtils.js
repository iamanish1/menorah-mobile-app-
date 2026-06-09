const toPlainText = (value) => String(value || '')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/(^|\s)#{1,6}\s+/g, '$1')
  .replace(/[*_`~]+/g, '')
  .replace(/[\u2022\u00b7\u25aa\u25cf]/g, '')
  .replace(/^\s*(?:[-+]|\d+[.)])\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeHashtag = (value) => toPlainText(value)
  .replace(/^#+/, '')
  .replace(/[^A-Za-z0-9_]/g, '')
  .trim();

const normalizeHashtags = (values = []) => {
  const seen = new Set();
  return (Array.isArray(values) ? values : String(values || '').split(','))
    .map(normalizeHashtag)
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
};

const parseList = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // Fall back to comma parsing below.
  }

  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
};

const buildInstagramCaption = (caption, hashtags = [], maxLength = 2200) => {
  const tags = normalizeHashtags(hashtags).map((tag) => `#${tag}`);
  const pieces = [toPlainText(caption), tags.join(' ')].filter(Boolean);
  const full = pieces.join('\n\n');
  return full.length > maxLength ? full.slice(0, Math.max(0, maxLength - 1)).trim() : full;
};

module.exports = {
  buildInstagramCaption,
  normalizeHashtag,
  normalizeHashtags,
  parseList,
  toPlainText
};
