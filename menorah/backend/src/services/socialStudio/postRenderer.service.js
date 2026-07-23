const sharp = require('sharp');
const { storeMediaBuffer } = require('../mediaStorage');
const { toPlainText } = require('./textUtils');
const { fetchRemoteImageBuffer } = require('./safeRemoteImageFetch.service');

const SIZE_BY_RATIO = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 }
};

const TEXT_FONT_FAMILY = 'DejaVu Sans, Liberation Sans, Arial, sans-serif';
const DISPLAY_FONT_FAMILY = 'DejaVu Serif Condensed, Liberation Serif, serif';
const MENORAH_GREEN = '#2B4F32';
const MENORAH_OLIVE = '#706E43';
const WARM_CREAM = '#F8EADA';
const DEEP_PLUM = '#321533';

const escapeXml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

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

const renderTextLines = ({
  lines,
  x,
  y,
  fontSize,
  fill,
  weight = 700,
  lineHeight,
  anchor = 'start',
  fontFamily = TEXT_FONT_FAMILY,
  opacity = 1
}) => [
  `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" opacity="${opacity}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${weight}">`,
  ...lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`),
  '</text>'
].join('');

const renderText = ({
  text,
  x,
  y,
  fontSize,
  fill,
  weight = 700,
  maxChars,
  lineHeight,
  maxLines,
  anchor = 'start',
  fontFamily = TEXT_FONT_FAMILY,
  opacity = 1
}) => {
  const lines = wrapText(text, maxChars, maxLines);
  return renderTextLines({ lines, x, y, fontSize, fill, weight, lineHeight, anchor, fontFamily, opacity });
};

const getPalette = (brandGuideline = {}) => {
  const primary = MENORAH_GREEN;
  const accent = brandGuideline.primaryColors?.[1] || MENORAH_OLIVE;
  const olive = MENORAH_OLIVE;
  const cream = brandGuideline.secondaryColors?.[0] || WARM_CREAM;
  const ink = brandGuideline.secondaryColors?.[2] || '#1F2933';
  return { primary, accent, olive, cream, ink, plum: DEEP_PLUM, white: '#FFFFFF' };
};

const hashSeed = (value = '') => String(value)
  .split('')
  .reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) >>> 0, 2166136261);

const seededRandom = (seed) => {
  let state = seed || 123456789;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const joinAsWarmSentence = (parts = []) => {
  const cleaned = parts
    .map((part) => toPlainText(part).replace(/[.,;:!?]+$/g, '').trim())
    .filter(Boolean);

  if (cleaned.length === 0) return '';
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}.`;
  return `${cleaned.slice(0, -1).join(', ')}, and ${cleaned[cleaned.length - 1]}.`;
};

const getDeckText = (socialPost) => {
  const body = toPlainText(socialPost.bodyText || '');
  const parts = body.split('|').map((item) => item.trim()).filter(Boolean);
  if (parts.length > 1) return joinAsWarmSentence(parts.slice(0, 3));
  return body || toPlainText(socialPost.ctaText || 'Start with one honest step.');
};

const getLayout = (aspectRatio, width, height) => {
  if (aspectRatio === '1:1') {
    return {
      heroHeight: 480,
      copyX: 96,
      headlineY: 600,
      headlineSize: 67,
      headlineLineHeight: 76,
      headlineChars: 22,
      headlineLines: 4,
      deckSize: 34,
      deckLineHeight: 47,
      deckChars: 42,
      ctaY: height - 88
    };
  }

  if (aspectRatio === '9:16') {
    return {
      heroHeight: 760,
      copyX: 90,
      headlineY: 930,
      headlineSize: 84,
      headlineLineHeight: 96,
      headlineChars: 19,
      headlineLines: 5,
      deckSize: 39,
      deckLineHeight: 54,
      deckChars: 38,
      ctaY: height - 120
    };
  }

  return {
    heroHeight: 560,
    copyX: 96,
    headlineY: 720,
    headlineSize: 78,
    headlineLineHeight: 88,
    headlineChars: 22,
    headlineLines: 5,
    deckSize: 38,
    deckLineHeight: 52,
    deckChars: 42,
    ctaY: height - 104
  };
};

const renderLogoMark = ({ width, palette }) => {
  const size = 104;
  const x = width - size - 58;
  const y = 56;

  return [
    `<g transform="translate(${x} ${y})">`,
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${palette.cream}" opacity="0.93" />`,
    `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 10}" fill="${palette.primary}" />`,
    `<path d="M36 70 L50 32 L61 70 L72 32 L83 70" fill="none" stroke="${palette.white}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="0.96" />`,
    `<path d="M42 72 L57 44 L68 72" fill="none" stroke="${palette.olive}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity="0.78" />`,
    '</g>'
  ].join('');
};

const renderSpeckles = ({ width, heroHeight, palette, seedValue }) => {
  const random = seededRandom(hashSeed(seedValue));
  const circles = [];
  const count = width > 1080 ? 260 : 220;

  for (let index = 0; index < count; index += 1) {
    const x = Math.round(random() * width);
    const y = Math.round(heroHeight - 142 + random() * 178);
    const radius = (random() * 2.4 + 0.7).toFixed(2);
    const opacity = (0.2 + random() * 0.36).toFixed(2);
    circles.push(`<circle cx="${x}" cy="${y}" r="${radius}" fill="${palette.cream}" opacity="${opacity}" />`);
  }

  return [
    `<rect x="0" y="${heroHeight - 190}" width="${width}" height="330" fill="url(#imageCreamFade)" />`,
    `<path d="M-80 ${heroHeight - 68} C ${width * 0.18} ${heroHeight + 26}, ${width * 0.54} ${heroHeight - 12}, ${width + 80} ${heroHeight + 48} L ${width + 80} ${heroHeight + 148} L -80 ${heroHeight + 148} Z" fill="${palette.cream}" opacity="0.52" filter="url(#transitionSoftBlur)" />`,
    `<path d="M-80 ${heroHeight - 24} C ${width * 0.28} ${heroHeight + 28}, ${width * 0.62} ${heroHeight + 10}, ${width + 80} ${heroHeight + 68} L ${width + 80} ${heroHeight + 158} L -80 ${heroHeight + 158} Z" fill="${palette.cream}" opacity="0.34" filter="url(#transitionSoftBlur)" />`,
    ...circles
  ].join('');
};

const renderEditorialIllustration = ({ width, heroHeight, palette }) => {
  const windowX = Math.round(width * 0.58);
  const figureX = Math.round(width * 0.37);
  const deskY = heroHeight - 118;

  return [
    `<g clip-path="url(#heroClip)">`,
    `<rect width="${width}" height="${heroHeight + 60}" fill="url(#heroGradient)" />`,
    `<rect x="${windowX}" y="0" width="${Math.round(width * 0.32)}" height="${heroHeight}" fill="url(#windowGlow)" opacity="0.78" />`,
    `<rect x="${windowX + 42}" y="34" width="34" height="${heroHeight - 138}" fill="${palette.white}" opacity="0.58" />`,
    `<rect x="${windowX + 152}" y="-20" width="28" height="${heroHeight - 92}" fill="${palette.white}" opacity="0.72" />`,
    `<path d="M${windowX + 220} 96 L${windowX + 310} 40 L${windowX + 405} 96 L${windowX + 405} ${heroHeight} L${windowX + 220} ${heroHeight} Z" fill="#EFA276" opacity="0.42" />`,
    `<rect x="52" y="54" width="230" height="210" rx="8" fill="#241C33" opacity="0.52" />`,
    `<rect x="76" y="78" width="182" height="156" rx="4" fill="#31265A" opacity="0.55" />`,
    `<path d="M0 ${heroHeight - 150} C 220 ${heroHeight - 205}, 390 ${heroHeight - 82}, ${width} ${heroHeight - 160} L ${width} ${heroHeight + 70} L 0 ${heroHeight + 70} Z" fill="${palette.primary}" opacity="0.14" />`,
    `<ellipse cx="${figureX - 120}" cy="${deskY + 4}" rx="178" ry="48" fill="#332333" opacity="0.23" />`,
    `<path d="M${figureX - 245} ${deskY + 18} C ${figureX - 210} ${deskY - 92}, ${figureX - 58} ${deskY - 86}, ${figureX + 6} ${deskY + 20} L ${figureX - 22} ${deskY + 74} L ${figureX - 250} ${deskY + 74} Z" fill="#4A3336" opacity="0.82" />`,
    `<path d="M${figureX - 78} ${deskY - 248} C ${figureX + 16} ${deskY - 230}, ${figureX + 74} ${deskY - 116}, ${figureX + 44} ${deskY + 46} L ${figureX - 86} ${deskY + 56} C ${figureX - 134} ${deskY - 92}, ${figureX - 148} ${deskY - 204}, ${figureX - 78} ${deskY - 248} Z" fill="${palette.white}" opacity="0.95" />`,
    `<path d="M${figureX - 42} ${deskY - 248} C ${figureX + 18} ${deskY - 244}, ${figureX + 58} ${deskY - 182}, ${figureX + 72} ${deskY - 94}" fill="none" stroke="#C95F55" stroke-width="20" stroke-linecap="round" opacity="0.55" />`,
    `<circle cx="${figureX - 86}" cy="${deskY - 288}" r="56" fill="#BE5B4F" />`,
    `<path d="M${figureX - 144} ${deskY - 314} C ${figureX - 108} ${deskY - 386}, ${figureX + 6} ${deskY - 338}, ${figureX - 22} ${deskY - 276} C ${figureX - 48} ${deskY - 296}, ${figureX - 86} ${deskY - 278}, ${figureX - 118} ${deskY - 286} Z" fill="#211A23" />`,
    `<path d="M${figureX - 218} ${deskY + 68} L${figureX + 412} ${deskY + 68}" stroke="#35252E" stroke-width="28" stroke-linecap="round" opacity="0.8" />`,
    `<rect x="${figureX + 230}" y="${deskY - 118}" width="34" height="160" rx="5" fill="#283C52" opacity="0.82" />`,
    `<rect x="${figureX + 278}" y="${deskY - 160}" width="38" height="202" rx="5" fill="#A66B5C" opacity="0.9" />`,
    `<rect x="${figureX + 326}" y="${deskY - 110}" width="42" height="152" rx="5" fill="${palette.olive}" opacity="0.86" />`,
    `<rect x="${figureX + 120}" y="${deskY - 95}" width="82" height="82" rx="16" fill="#BE6F4B" opacity="0.88" />`,
    `<path d="M${figureX + 160} ${deskY - 98} C ${figureX + 120} ${deskY - 176}, ${figureX + 72} ${deskY - 142}, ${figureX + 120} ${deskY - 102}" fill="#315C39" />`,
    `<path d="M${figureX + 164} ${deskY - 102} C ${figureX + 238} ${deskY - 188}, ${figureX + 248} ${deskY - 110}, ${figureX + 176} ${deskY - 98}" fill="#315C39" opacity="0.86" />`,
    `<rect width="${width}" height="${heroHeight + 60}" fill="url(#grain)" opacity="0.19" />`,
    renderLogoMark({ width, palette }),
    '</g>'
  ].join('');
};

const renderHeroImage = ({ width, heroHeight, palette, heroImageDataUri }) => {
  if (!heroImageDataUri) {
    return renderEditorialIllustration({ width, heroHeight, palette });
  }

  return [
    '<g clip-path="url(#heroClip)">',
    `<image href="${heroImageDataUri}" x="0" y="0" width="${width}" height="${heroHeight + 74}" preserveAspectRatio="xMidYMid slice" />`,
    `<rect x="0" y="0" width="${width}" height="${heroHeight + 74}" fill="${palette.primary}" opacity="0.08" />`,
    `<rect x="0" y="0" width="${width}" height="${heroHeight + 74}" fill="url(#heroVignette)" opacity="0.72" />`,
    `<rect width="${width}" height="${heroHeight + 74}" fill="url(#grain)" opacity="0.13" />`,
    renderLogoMark({ width, palette }),
    '</g>'
  ].join('');
};

const bufferToJpegDataUri = async ({ buffer, width, heroHeight }) => {
  if (!buffer) return '';

  const normalized = await sharp(buffer)
    .resize({
      width,
      height: heroHeight + 74,
      fit: 'cover',
      position: 'attention'
    })
    .modulate({ saturation: 0.92, brightness: 1.03 })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();

  return `data:image/jpeg;base64,${normalized.toString('base64')}`;
};

const renderHeadline = ({ lines, x, y, fontSize, lineHeight, palette }) => lines
  .map((line, index) => {
    const fill = index === lines.length - 1 && lines.length > 1 ? palette.olive : palette.primary;
    return `<text x="${x}" y="${y + index * lineHeight}" fill="${fill}" font-family="${DISPLAY_FONT_FAMILY}" font-size="${fontSize}" font-weight="900">${escapeXml(line)}</text>`;
  })
  .join('');

const buildSvg = ({ socialPost, brandGuideline, assets, heroImageDataUri }) => {
  const { width, height } = SIZE_BY_RATIO[socialPost.aspectRatio] || SIZE_BY_RATIO['4:5'];
  const palette = getPalette(brandGuideline);
  const layout = getLayout(socialPost.aspectRatio, width, height);
  const brandName = brandGuideline.brandName || 'Menorah Health';
  const headline = toPlainText(socialPost.hookText || socialPost.topic || brandName);
  const deck = getDeckText(socialPost);
  const headlineLines = wrapText(headline, layout.headlineChars, layout.headlineLines);
  const deckY = layout.headlineY + headlineLines.length * layout.headlineLineHeight + 56;
  const cta = toPlainText(socialPost.ctaText || '').slice(0, 74);

  const shared = [
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    `<clipPath id="heroClip"><rect x="0" y="0" width="${width}" height="${layout.heroHeight + 74}" /></clipPath>`,
    '<linearGradient id="heroGradient" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#574A72" />',
    '<stop offset="34%" stop-color="#A9D4C4" />',
    '<stop offset="68%" stop-color="#F2B07D" />',
    '<stop offset="100%" stop-color="#C9C5F2" />',
    '</linearGradient>',
    '<linearGradient id="windowGlow" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#EAF9EE" stop-opacity="0.2" />',
    '<stop offset="56%" stop-color="#FDF2D7" stop-opacity="0.92" />',
    '<stop offset="100%" stop-color="#BBBCFF" stop-opacity="0.38" />',
    '</linearGradient>',
    '<filter id="grain">',
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />',
    '<feColorMatrix type="saturate" values="0" />',
    '<feComponentTransfer><feFuncA type="table" tableValues="0 0.34" /></feComponentTransfer>',
    '</filter>',
    `<filter id="transitionSoftBlur" x="-120" y="${layout.heroHeight - 190}" width="${width + 240}" height="380" filterUnits="userSpaceOnUse">`,
    '<feGaussianBlur stdDeviation="30" />',
    '</filter>',
    `<linearGradient id="imageCreamFade" gradientUnits="userSpaceOnUse" x1="0" y1="${layout.heroHeight - 190}" x2="0" y2="${layout.heroHeight + 114}">`,
    `<stop offset="0%" stop-color="${palette.cream}" stop-opacity="0" />`,
    `<stop offset="34%" stop-color="${palette.cream}" stop-opacity="0.24" />`,
    `<stop offset="58%" stop-color="${palette.cream}" stop-opacity="0.68" />`,
    `<stop offset="82%" stop-color="${palette.cream}" stop-opacity="0.96" />`,
    `<stop offset="100%" stop-color="${palette.cream}" stop-opacity="1" />`,
    '</linearGradient>',
    '<linearGradient id="heroVignette" x1="0%" y1="0%" x2="100%" y2="100%">',
    '<stop offset="0%" stop-color="#241C33" stop-opacity="0.18" />',
    '<stop offset="52%" stop-color="#F8EADA" stop-opacity="0.02" />',
    '<stop offset="100%" stop-color="#321533" stop-opacity="0.1" />',
    '</linearGradient>',
    '</defs>',
    `<rect width="${width}" height="${height}" fill="${palette.cream}" />`,
    renderHeroImage({ width, heroHeight: layout.heroHeight, palette, heroImageDataUri }),
    renderSpeckles({ width, heroHeight: layout.heroHeight, palette, seedValue: `${socialPost._id || ''}${headline}` }),
    renderHeadline({
      lines: headlineLines,
      x: layout.copyX,
      y: layout.headlineY,
      fontSize: layout.headlineSize,
      lineHeight: layout.headlineLineHeight,
      palette
    }),
    renderText({
      text: deck,
      x: layout.copyX,
      y: deckY,
      fontSize: layout.deckSize,
      fill: palette.plum,
      weight: 500,
      maxChars: layout.deckChars,
      lineHeight: layout.deckLineHeight,
      maxLines: socialPost.aspectRatio === '1:1' ? 3 : 4,
      fontFamily: TEXT_FONT_FAMILY
    }),
    cta ? `<text x="${layout.copyX}" y="${layout.ctaY}" fill="${palette.primary}" font-family="${TEXT_FONT_FAMILY}" font-size="${socialPost.aspectRatio === '9:16' ? 30 : 27}" font-weight="800" opacity="0.9">${escapeXml(cta)}</text>` : '',
    `<text x="${width - layout.copyX}" y="${layout.ctaY}" text-anchor="end" fill="${palette.primary}" font-family="${TEXT_FONT_FAMILY}" font-size="${socialPost.aspectRatio === '9:16' ? 24 : 22}" font-weight="700" opacity="0.58">@menorahhealth</text>`,
    '</svg>'
  ];

  return shared.join('');
};

const saveImage = async (buffer, category, folder) => {
  const stored = await storeMediaBuffer(buffer, {
    service: 'social-studio',
    category,
    extension: '.jpg',
    contentType: 'image/jpeg',
    cloudinaryFolder: folder,
    cloudinaryResourceType: 'image',
  });
  return {
    url: stored.url,
    publicId: stored.metadata.publicId || '',
    metadata: stored.metadata,
  };
};

const renderStaticPost = async (
  { socialPost, brandGuideline, assets = [], backgroundImageBuffer = null },
  { remoteImageFetcher = fetchRemoteImageBuffer } = {}
) => {
  const size = SIZE_BY_RATIO[socialPost.aspectRatio] || SIZE_BY_RATIO['4:5'];
  const folder = process.env.CLOUDINARY_SOCIAL_STUDIO_FOLDER || 'menorah/social-studio';
  const sourceBuffer = backgroundImageBuffer ||
    (socialPost.imageUrl ? await remoteImageFetcher(socialPost.imageUrl).catch(() => null) : null);
  const heroImageDataUri = await bufferToJpegDataUri({
    buffer: sourceBuffer,
    width: size.width,
    heroHeight: getLayout(socialPost.aspectRatio, size.width, size.height).heroHeight
  });
  const svg = buildSvg({ socialPost, brandGuideline, assets, heroImageDataUri });
  const imageBuffer = await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  const thumbBuffer = await sharp(imageBuffer)
    .resize({ width: 420, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const saveTasks = [
    saveImage(imageBuffer, 'rendered-posts', folder),
    saveImage(thumbBuffer, 'thumbnails', `${folder}/thumbs`)
  ];

  if (backgroundImageBuffer) {
    const sourceJpeg = await sharp(backgroundImageBuffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    saveTasks.push(saveImage(sourceJpeg, 'generated-sources', `${folder}/sources`));
  }

  const [image, thumbnail, source] = await Promise.all(saveTasks);

  return {
    finalImageUrl: image.url,
    finalImagePublicId: image.publicId,
    finalImageStorage: image.metadata,
    imageUrl: source?.url || socialPost.imageUrl || '',
    thumbnailUrl: thumbnail.url,
    thumbnailStorage: thumbnail.metadata,
    sourceImageStorage: source?.metadata || null,
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
