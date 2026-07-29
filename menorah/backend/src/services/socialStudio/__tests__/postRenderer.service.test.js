const path = require('path');
const sharp = require('sharp');
const {
  buildSvg,
  loadCanonicalLogoWatermark
} = require('../postRenderer.service');

const CANONICAL_LOGO_PATH = path.resolve(
  __dirname,
  '../../../assets/brand/menorah-logo-no-bg.png'
);

const socialPost = {
  _id: 'social-post-watermark-test',
  aspectRatio: '4:5',
  topic: 'Building steadier mental health',
  hookText: 'A calmer next step',
  bodyText: 'Start with one honest conversation and one practical routine.',
  ctaText: 'Reach out when you are ready.'
};

const brandGuideline = {
  brandName: 'Menorah Health',
  primaryColors: ['#2B4F32', '#706E43'],
  secondaryColors: ['#F8EADA', '#FFFFFF', '#321533'],
  logoRules: {
    minWidth: 120,
    clearSpace: 48
  }
};

describe('Social Studio official Menorah watermark', () => {
  test('embeds the approved canonical logo asset in the upper-right watermark', async () => {
    const watermark = await loadCanonicalLogoWatermark({
      width: 1080,
      brandGuideline
    });
    const encodedLogo = Buffer.from(
      watermark.dataUri.replace(/^data:image\/png;base64,/, ''),
      'base64'
    );
    const [renderedLogo, canonicalLogo] = await Promise.all([
      sharp(encodedLogo).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(CANONICAL_LOGO_PATH)
        .resize({ width: 120, height: 120, fit: 'contain' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
    ]);
    const svg = buildSvg({
      socialPost,
      brandGuideline,
      assets: [],
      heroImageDataUri: '',
      logoWatermark: watermark
    });

    expect(watermark).toMatchObject({ size: 120, clearSpace: 48 });
    expect(renderedLogo.info).toMatchObject({ width: 120, height: 120, channels: 4 });
    expect(renderedLogo.data.equals(canonicalLogo.data)).toBe(true);
    expect(svg).toContain(`href="${watermark.dataUri}"`);
    expect(svg).toContain('x="912" y="48" width="120" height="120"');
    expect(svg).not.toContain('M36 70 L50 32');
  });

  test('does not render a social post without the canonical logo watermark', () => {
    expect(() => buildSvg({
      socialPost,
      brandGuideline,
      assets: [],
      heroImageDataUri: '',
      logoWatermark: null
    })).toThrow('The canonical Menorah logo watermark is required to render a social post');
  });
});
