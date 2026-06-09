const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { uploadBuffer } = require('../../utils/cloudinary');
const { toPlainText } = require('./textUtils');

const SIZE_BY_RATIO = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 }
};

const templateNames = {
  thought_leadership: 'Quote/Thought Leadership',
  educational_tip: 'Educational Tip',
  announcement: 'Promotional/Announcement'
};

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const shouldUseCloudinaryForSocialStudio = () =>
  process.env.SOCIAL_STUDIO_STORAGE === 'cloudinary' &&
  Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const getPublicBaseUrl = () => {
  const base =
    process.env.PUBLIC_WEB_BASE_URL ||
    process.env.API_BASE_URL ||
    `http://localhost:${process.env.PORT || 3000}`;
  return String(base).replace(/\/+$/, '');
};

const getUploadDir = () => path.resolve(process.cwd(), process.env.UPLOAD_PATH || './uploads', 'social-studio');

const wrapText = (text, maxChars, maxLines = 5) => {
  const words = toPlainText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);

  const clipped = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    clipped[clipped.length - 1] = `${clipped[clipped.length - 1].replace(/[.,;:!?]+$/, '')}...`;
  }
  return clipped;
};

const renderText = ({ text, x, y, fontSize, fill, weight = 700, maxChars, lineHeight, maxLines, anchor = 'start' }) => {
  const lines = wrapText(text, maxChars, maxLines);
  return [
    `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}">`,
    ...lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`),
    '</text>'
  ].join('');
};

const renderBulletLines = ({ items, x, y, fontSize, fill, maxChars }) => {
  let currentY = y;
  return (items || []).slice(0, 3).map((item) => {
    const lines = wrapText(item, maxChars, 2);
    const block = [
      `<circle cx="${x}" cy="${currentY - 8}" r="7" fill="${fill}" opacity="0.9" />`,
      `<text x="${x + 26}" y="${currentY}" fill="${fill}" font-family="Inter, Arial, sans-serif" font-size="${fontSize}" font-weight="650">`,
      ...lines.map((line, index) => `<tspan x="${x + 26}" dy="${index === 0 ? 0 : fontSize + 10}">${escapeXml(line)}</tspan>`),
      '</text>'
    ].join('');
    currentY += 86 + Math.max(0, lines.length - 1) * 28;
    return block;
  }).join('');
};

const getPalette = (brandGuideline = {}) => {
  const primary = brandGuideline.primaryColors?.[0] || '#27533A';
  const accent = brandGuideline.primaryColors?.[1] || '#2F8A63';
  const cream = brandGuideline.secondaryColors?.[0] || '#F7F0DF';
  const ink = brandGuideline.secondaryColors?.[2] || '#1F2933';
  return { primary, accent, cream, ink, white: '#FFFFFF' };
};

const buildSvg = ({ socialPost, brandGuideline, assets }) => {
  const { width, height } = SIZE_BY_RATIO[socialPost.aspectRatio] || SIZE_BY_RATIO['4:5'];
  const palette = getPalette(brandGuideline);
  const templateKey = socialPost.templateKey || 'thought_leadership';
  const padding = socialPost.aspectRatio === '9:16' ? 92 : 76;
  const hookSize = socialPost.aspectRatio === '9:16' ? 78 : 68;
  const bodySize = socialPost.aspectRatio === '9:16' ? 38 : 34;
  const ctaY = height - padding - 18;
  const logoAsset = (assets || []).find((asset) => asset.type === 'logo');
  const brandName = brandGuideline.brandName || 'Menorah Health';
  const hookY = socialPost.aspectRatio === '1:1' ? 310 : 390;
  const bodyY = socialPost.aspectRatio === '1:1' ? 560 : 710;
  const maxChars = socialPost.aspectRatio === '9:16' ? 20 : 24;

  const shared = [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<rect width="${width}" height="${height}" fill="${palette.cream}" />`,
    `<circle cx="${width - 160}" cy="170" r="260" fill="${palette.accent}" opacity="0.15" />`,
    `<circle cx="90" cy="${height - 120}" r="300" fill="${palette.primary}" opacity="0.08" />`,
    `<path d="M0 ${height * 0.72} C ${width * 0.28} ${height * 0.62}, ${width * 0.63} ${height * 0.87}, ${width} ${height * 0.66} L ${width} ${height} L 0 ${height} Z" fill="${palette.white}" opacity="0.62" />`,
    `<rect x="${padding}" y="${padding}" width="${width - padding * 2}" height="${height - padding * 2}" rx="44" fill="${palette.white}" opacity="0.54" />`,
    `<text x="${padding + 16}" y="${padding + 54}" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="32" font-weight="800">${escapeXml(brandName)}</text>`,
    logoAsset?.url ? `<text x="${padding + 16}" y="${padding + 90}" fill="${palette.ink}" opacity="0.48" font-family="Inter, Arial, sans-serif" font-size="18">Brand asset selected</text>` : '',
    `<text x="${width - padding - 16}" y="${padding + 54}" text-anchor="end" fill="${palette.ink}" opacity="0.45" font-family="Inter, Arial, sans-serif" font-size="20">${escapeXml(templateNames[templateKey] || 'Instagram Post')}</text>`
  ];

  if (templateKey === 'educational_tip') {
    const bodyItems = toPlainText(socialPost.bodyText)
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    shared.push(
      renderText({
        text: socialPost.hookText,
        x: padding + 48,
        y: hookY,
        fontSize: hookSize,
        fill: palette.primary,
        weight: 850,
        maxChars,
        lineHeight: hookSize + 12,
        maxLines: 3
      }),
      renderBulletLines({
        items: bodyItems.length > 0 ? bodyItems : [socialPost.bodyText, socialPost.ctaText].filter(Boolean),
        x: padding + 56,
        y: bodyY,
        fontSize: bodySize,
        fill: palette.ink,
        maxChars: socialPost.aspectRatio === '9:16' ? 33 : 40
      })
    );
  } else if (templateKey === 'announcement') {
    shared.push(
      `<rect x="${padding + 44}" y="${hookY - 112}" width="${width - padding * 2 - 88}" height="${socialPost.aspectRatio === '1:1' ? 430 : 560}" rx="34" fill="${palette.primary}" />`,
      renderText({
        text: socialPost.hookText,
        x: padding + 88,
        y: hookY,
        fontSize: hookSize,
        fill: palette.white,
        weight: 850,
        maxChars,
        lineHeight: hookSize + 10,
        maxLines: 3
      }),
      renderText({
        text: socialPost.bodyText,
        x: padding + 88,
        y: bodyY,
        fontSize: bodySize,
        fill: '#E9F3EC',
        weight: 500,
        maxChars: socialPost.aspectRatio === '9:16' ? 31 : 38,
        lineHeight: bodySize + 14,
        maxLines: 4
      })
    );
  } else {
    shared.push(
      `<text x="${padding + 48}" y="${hookY - 52}" fill="${palette.accent}" font-family="Inter, Arial, sans-serif" font-size="94" font-weight="800" opacity="0.35">"</text>`,
      renderText({
        text: socialPost.hookText,
        x: padding + 48,
        y: hookY,
        fontSize: hookSize,
        fill: palette.primary,
        weight: 850,
        maxChars,
        lineHeight: hookSize + 12,
        maxLines: 4
      }),
      renderText({
        text: socialPost.bodyText,
        x: padding + 52,
        y: bodyY,
        fontSize: bodySize,
        fill: palette.ink,
        weight: 500,
        maxChars: socialPost.aspectRatio === '9:16' ? 34 : 42,
        lineHeight: bodySize + 15,
        maxLines: socialPost.aspectRatio === '1:1' ? 4 : 5
      })
    );
  }

  shared.push(
    `<rect x="${padding + 44}" y="${ctaY - 54}" width="${Math.min(width - padding * 2 - 88, 620)}" height="82" rx="41" fill="${palette.primary}" opacity="0.96" />`,
    `<text x="${padding + 82}" y="${ctaY}" fill="${palette.white}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${escapeXml(toPlainText(socialPost.ctaText || 'Start with one honest step.').slice(0, 52))}</text>`,
    `<text x="${width - padding - 18}" y="${height - padding - 10}" text-anchor="end" fill="${palette.ink}" opacity="0.46" font-family="Inter, Arial, sans-serif" font-size="21">@menorahhealth</text>`,
    '</svg>'
  );

  return shared.join('');
};

const saveLocalImage = async (buffer, filename) => {
  const uploadDir = getUploadDir();
  await fs.mkdir(uploadDir, { recursive: true });
  const fullPath = path.join(uploadDir, filename);
  await fs.writeFile(fullPath, buffer);
  return `${getPublicBaseUrl()}/uploads/social-studio/${filename}`;
};

const saveImage = async (buffer, filename, folder) => {
  if (shouldUseCloudinaryForSocialStudio()) {
    const result = await uploadBuffer(buffer, {
      folder,
      resource_type: 'image',
      format: 'jpg',
      public_id: filename.replace(/\.jpe?g$/i, ''),
      overwrite: true
    });
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  }

  return {
    url: await saveLocalImage(buffer, filename),
    publicId: ''
  };
};

const renderStaticPost = async ({ socialPost, brandGuideline, assets = [] }) => {
  const size = SIZE_BY_RATIO[socialPost.aspectRatio] || SIZE_BY_RATIO['4:5'];
  const svg = buildSvg({ socialPost, brandGuideline, assets });
  const imageBuffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const thumbBuffer = await sharp(imageBuffer)
    .resize({ width: 420, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const id = socialPost._id?.toString() || `social-${Date.now()}`;
  const folder = process.env.CLOUDINARY_SOCIAL_STUDIO_FOLDER || 'menorah/social-studio';
  const [image, thumbnail] = await Promise.all([
    saveImage(imageBuffer, `${id}-final.jpg`, folder),
    saveImage(thumbBuffer, `${id}-thumb.jpg`, `${folder}/thumbs`)
  ]);

  return {
    finalImageUrl: image.url,
    finalImagePublicId: image.publicId,
    thumbnailUrl: thumbnail.url,
    width: size.width,
    height: size.height
  };
};

const generateThumbnail = async (finalImageUrl) => ({
  thumbnailUrl: finalImageUrl
});

module.exports = {
  generateThumbnail,
  renderStaticPost,
  SIZE_BY_RATIO
};
