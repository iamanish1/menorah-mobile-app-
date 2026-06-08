const slugify = (value) => {
  const source = String(value || '').trim();

  const slug = source
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .toLowerCase();

  return slug || `article-${Date.now()}`;
};

module.exports = slugify;
