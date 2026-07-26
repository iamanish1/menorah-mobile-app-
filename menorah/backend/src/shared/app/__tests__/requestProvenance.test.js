const express = require('express');
const request = require('supertest');
const {
  attachValidatedRequestProvenance,
  normalizeTrustedCountry,
} = require('../requestProvenance');
const { getTrustProxySetting } = require('../createExpressApp');

const createProbeApp = (trustProxy) => {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(attachValidatedRequestProvenance);
  app.get('/probe', (req, res) => {
    res.json({
      clientIp: req.validatedClientIp,
      country: req.clientCountry,
    });
  });
  return app;
};

describe('validated request provenance', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = originalTrustProxy;
  });

  test('direct requests cannot choose an IP or country with forwarded headers', async () => {
    const response = await request(createProbeApp(false))
      .get('/probe')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('CF-Connecting-IP', '203.0.113.11')
      .set('CF-IPCountry', 'AE')
      .set('X-Menorah-Client-Country', 'AE')
      .expect(200);

    expect(response.body.clientIp).not.toBe('203.0.113.10');
    expect(response.body.clientIp).not.toBe('203.0.113.11');
    expect(response.body.country).toBe('');
  });

  test('the explicitly trusted reverse-proxy path supplies client provenance', async () => {
    const response = await request(createProbeApp('loopback'))
      .get('/probe')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('CF-IPCountry', 'AE')
      .set('X-Menorah-Client-Country', 'IN')
      .expect(200);

    expect(response.body).toEqual({
      clientIp: '203.0.113.10',
      country: 'IN',
    });
  });

  test('rejects ambiguous or malformed trusted country values', () => {
    expect(normalizeTrustedCountry('AE,IN')).toBe('');
    expect(normalizeTrustedCountry(['AE', 'IN'])).toBe('');
    expect(normalizeTrustedCountry('United Arab Emirates')).toBe('');
    expect(normalizeTrustedCountry('ae')).toBe('AE');
    expect(normalizeTrustedCountry('T1')).toBe('T1');
  });

  test('production refuses broad or hop-count proxy trust', () => {
    process.env.NODE_ENV = 'production';
    for (const unsafeValue of ['true', '1', 'private_ranges', '172.16.0.0/12']) {
      process.env.TRUST_PROXY = unsafeValue;
      expect(() => getTrustProxySetting()).toThrow(
        /exact immediate reverse-proxy IP/,
      );
    }

    process.env.TRUST_PROXY = '172.30.251.2';
    expect(getTrustProxySetting()).toBe('172.30.251.2');
  });
});
