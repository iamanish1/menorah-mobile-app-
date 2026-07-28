const {
  buildArticleCanonicalUrl,
  getArticleCanonicalBaseUrl,
  normalizeBaseUrl
} = require('../articleCanonicalUrl');

describe('article canonical URL contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production'
    };
    delete process.env.ARTICLE_CANONICAL_BASE_URL;
    delete process.env.PUBLIC_LANDING_BASE_URL;
    delete process.env.FRONTEND_WWW_URL;
    delete process.env.PUBLIC_WEB_BASE_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('uses the dedicated landing origin instead of the API media origin', () => {
    process.env.ARTICLE_CANONICAL_BASE_URL = 'https://www.example.com/';
    process.env.PUBLIC_WEB_BASE_URL = 'https://api.example.com';

    expect(getArticleCanonicalBaseUrl()).toBe('https://www.example.com');
    expect(buildArticleCanonicalUrl('sleep-and-burnout')).toBe(
      'https://www.example.com/articles/sleep-and-burnout'
    );
  });

  test('falls back to the public landing domain in production instead of an API URL', () => {
    process.env.PUBLIC_WEB_BASE_URL = 'https://api.example.com';

    expect(buildArticleCanonicalUrl('stress / support')).toBe(
      'https://menorah.me/articles/stress%20%2F%20support'
    );
  });

  test('allows a local public URL outside production', () => {
    process.env.NODE_ENV = 'development';
    process.env.PUBLIC_WEB_BASE_URL = 'http://localhost:3002/';

    expect(getArticleCanonicalBaseUrl()).toBe('http://localhost:3002');
  });

  test('accepts a host value and rejects unsupported protocols', () => {
    expect(normalizeBaseUrl('www.example.com')).toBe('https://www.example.com');
    expect(normalizeBaseUrl('ftp://www.example.com')).toBe('');
  });
});
