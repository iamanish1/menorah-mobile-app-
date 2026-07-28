const CONTENT_BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'quote',
  'bullet_list',
  'image',
  'callout'
]);

const MAX_CONTENT_BLOCKS = 100;
const MAX_BLOCK_TEXT_LENGTH = 12000;
const MAX_BULLET_ITEMS = 50;
const MAX_BULLET_ITEM_LENGTH = 2000;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_IMAGE_ALT_LENGTH = 500;
const MAX_IMAGE_CAPTION_LENGTH = 1000;

const toPlainBlock = (block) => {
  if (block && typeof block.toObject === 'function') {
    return block.toObject();
  }

  return block;
};

const normalizeString = (value) => String(value || '').trim();

const normalizeContentBlocks = (blocks) => {
  if (!Array.isArray(blocks)) {
    return [];
  }

  return blocks.map((rawBlock) => {
    const block = toPlainBlock(rawBlock) || {};

    return {
      type: normalizeString(block.type),
      text: normalizeString(block.text),
      level: Number.isInteger(block.level) ? block.level : null,
      items: Array.isArray(block.items)
        ? block.items.map(normalizeString).filter(Boolean)
        : [],
      url: normalizeString(block.url) || null,
      alt: normalizeString(block.alt),
      caption: normalizeString(block.caption)
    };
  });
};

const isSafeImageUrl = (value) => {
  const url = normalizeString(value);
  if (!url || url.length > MAX_IMAGE_URL_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

/**
 * Validate the single structured-content contract used by all article
 * producers and readers. Keeping this outside an HTTP route means AI drafts,
 * editor updates, and direct model saves cannot create a published article
 * that one of the web/mobile renderers cannot safely render.
 */
const validateContentBlocks = (blocks) => {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > MAX_CONTENT_BLOCKS) {
    throw new Error(`Article content must include between 1 and ${MAX_CONTENT_BLOCKS} blocks`);
  }

  for (const rawBlock of blocks) {
    const block = toPlainBlock(rawBlock);
    if (!block || typeof block !== 'object' || !CONTENT_BLOCK_TYPES.has(block.type)) {
      throw new Error('Each article content block must use a supported type');
    }

    const text = normalizeString(block.text);
    const items = Array.isArray(block.items)
      ? block.items.map(normalizeString).filter(Boolean)
      : [];
    const alt = normalizeString(block.alt);
    const caption = normalizeString(block.caption);

    if (
      block.level !== undefined
      && block.level !== null
      && (!Number.isInteger(block.level) || block.level < 1 || block.level > 6)
    ) {
      throw new Error('Article heading levels must be whole numbers between 1 and 6');
    }

    if (text.length > MAX_BLOCK_TEXT_LENGTH) {
      throw new Error(`Article content blocks cannot exceed ${MAX_BLOCK_TEXT_LENGTH} characters`);
    }

    if (items.length > MAX_BULLET_ITEMS || items.some((item) => item.length > MAX_BULLET_ITEM_LENGTH)) {
      throw new Error(`Article bullet lists can contain at most ${MAX_BULLET_ITEMS} items of ${MAX_BULLET_ITEM_LENGTH} characters each`);
    }

    if (alt.length > MAX_IMAGE_ALT_LENGTH || caption.length > MAX_IMAGE_CAPTION_LENGTH) {
      throw new Error('Article image alt text or captions are too long');
    }

    if (block.type === 'bullet_list') {
      if (!items.length) {
        throw new Error('Article bullet lists need at least one item');
      }
      continue;
    }

    if (block.type === 'image') {
      if (!isSafeImageUrl(block.url)) {
        throw new Error('Article images need a valid HTTP(S) URL');
      }
      continue;
    }

    if (!text) {
      throw new Error('Article headings, paragraphs, quotes, and callouts need text');
    }
  }

  return true;
};

module.exports = {
  CONTENT_BLOCK_TYPES,
  MAX_CONTENT_BLOCKS,
  normalizeContentBlocks,
  validateContentBlocks,
  isSafeImageUrl
};
