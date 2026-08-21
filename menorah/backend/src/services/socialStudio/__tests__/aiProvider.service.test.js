const { buildPremiumSocialImagePrompt } = require('../aiProvider.service');

describe('Social Studio image generation prompt', () => {
  test('reserves the logo area for the app-applied Menorah watermark', () => {
    const prompt = buildPremiumSocialImagePrompt({
      topic: 'Practical ways to feel less alone',
      concept: {
        hookText: 'You do not have to carry it alone',
        bodyText: 'One honest conversation can be a meaningful next step.'
      },
      audience: 'men looking for practical mental health support'
    });

    expect(prompt).toContain('clean, uncluttered upper-right safe area');
    expect(prompt).toContain('official Menorah watermark will be added by the app after generation');
    expect(prompt).toContain('Never draw, invent, simulate, or place a logo, badge, emblem, monogram, lettermark, seal, or watermark anywhere in the image.');
    expect(prompt).not.toContain('logo top-right');
  });
});
