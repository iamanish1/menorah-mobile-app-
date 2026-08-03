const fs = require('fs');
const path = require('path');

const caddyfilePath = path.resolve(
  __dirname,
  '../../../../../deploy/caddy/Caddyfile.production'
);

const readSiteBlock = (source, siteLabel) => {
  const start = source.indexOf(siteLabel);
  if (start < 0) throw new Error(`Missing Caddy site block: ${siteLabel}`);
  const openingBrace = source.indexOf('{', start + siteLabel.length);
  let depth = 0;

  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }

  throw new Error(`Unclosed Caddy site block: ${siteLabel}`);
};

describe('payment ingress proxy configuration', () => {
  const caddyfile = fs.readFileSync(caddyfilePath, 'utf8');

  test('does not intercept payment or payout paths with a blanket 503', () => {
    expect(caddyfile).not.toMatch(/\(payment_disabled\)/);
    expect(caddyfile).not.toMatch(/@payment\s+path\s+\/api\/payments/);
    expect(caddyfile).not.toMatch(/Payments are temporarily disabled/);
  });

  test('forwards canonical booking and payout webhook hosts to their app profiles', () => {
    expect(readSiteBlock(caddyfile, 'http://{$API_WEB_DOMAIN}'))
      .toContain('import upstream_proxy api-web:8080');
    expect(readSiteBlock(caddyfile, 'http://{$API_ADMIN_DOMAIN}'))
      .toContain('import upstream_proxy api-admin:8080');
  });

  test.each([
    ['http://{$API_IOS_DOMAIN}', 'import upstream_proxy api-ios:8080'],
    ['http://{$API_ANDROID_DOMAIN}', 'import upstream_proxy api-android:8080'],
    ['http://{$API_WEB_DOMAIN}', 'import upstream_proxy api-web:8080'],
  ])('routes other payment paths to the %s application profile', (siteLabel, proxy) => {
    const siteBlock = readSiteBlock(caddyfile, siteLabel);

    expect(siteBlock).toContain(proxy);
    expect(siteBlock).not.toMatch(/@payment\s+path/);
  });
});
