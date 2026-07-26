const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const {
  createSafeRemoteImageFetcher,
  SafeRemoteImageFetchError
} = require('../safeRemoteImageFetch.service');

const PUBLIC_IPV4 = '93.184.216.34';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const publicDnsLookup = jest.fn(async () => [{ address: PUBLIC_IPV4, family: 4 }]);

const createHttpsHarness = (getPlan) => {
  const calls = [];

  const httpsRequest = jest.fn((target, options, onResponse) => {
    const request = new EventEmitter();
    const call = {
      target: new URL(target.toString()),
      options,
      pinnedAddress: null,
      pinnedFamily: null,
      request
    };
    calls.push(call);

    request.destroy = jest.fn(() => {
      call.response?.destroy();
    });
    request.end = jest.fn(() => {
      queueMicrotask(() => {
        const plan = getPlan(call, calls.length - 1) || {};
        const socket = new EventEmitter();
        request.emit('socket', socket);

        options.lookup(target.hostname, { all: false }, (lookupError, address, family) => {
          if (lookupError) {
            request.emit('error', lookupError);
            return;
          }

          call.pinnedAddress = address;
          call.pinnedFamily = family;
          if (plan.stallConnecting) return;
          socket.emit('secureConnect');

          const response = new PassThrough();
          call.response = response;
          response.statusCode = plan.statusCode ?? 200;
          response.headers = plan.headers ?? { 'content-type': 'image/png' };
          onResponse(response);

          if (plan.stallBody) {
            response.write(plan.partialBody || PNG_SIGNATURE.subarray(0, 4));
            return;
          }
          if (Array.isArray(plan.chunks)) {
            plan.chunks.forEach((chunk) => response.write(chunk));
            response.end();
            return;
          }
          response.end(plan.body ?? VALID_PNG);
        });
      });
    });

    return request;
  });

  return { calls, httpsRequest };
};

const expectFetchError = async (promise, code) => {
  try {
    await promise;
    throw new Error('Expected remote image fetch to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(SafeRemoteImageFetchError);
    expect(error.code).toBe(code);
  }
};

describe('safe Social Studio remote image fetcher', () => {
  beforeEach(() => {
    publicDnsLookup.mockClear();
  });

  test.each([
    ['HTTP', 'http://images.example.com/image.png', 'UNSAFE_IMAGE_URL'],
    ['credentials', 'https://user:password@images.example.com/image.png', 'UNSAFE_IMAGE_URL'],
    ['localhost', 'https://localhost/image.png', 'UNSAFE_IMAGE_HOST'],
    ['localhost subdomain', 'https://cdn.localhost/image.png', 'UNSAFE_IMAGE_HOST'],
    ['IPv4 loopback', 'https://127.0.0.1/image.png', 'UNSAFE_IMAGE_HOST'],
    ['short-form IPv4 loopback', 'https://127.1/image.png', 'UNSAFE_IMAGE_HOST'],
    ['integer IPv4 loopback', 'https://2130706433/image.png', 'UNSAFE_IMAGE_HOST'],
    ['IPv6 loopback', 'https://[::1]/image.png', 'UNSAFE_IMAGE_HOST'],
    ['IPv4-mapped IPv6 loopback', 'https://[::ffff:127.0.0.1]/image.png', 'UNSAFE_IMAGE_HOST'],
    ['RFC1918 10/8', 'https://10.0.0.8/image.png', 'UNSAFE_IMAGE_HOST'],
    ['RFC1918 172.16/12', 'https://172.31.255.1/image.png', 'UNSAFE_IMAGE_HOST'],
    ['RFC1918 192.168/16', 'https://192.168.1.1/image.png', 'UNSAFE_IMAGE_HOST'],
    ['link-local metadata IP', 'https://169.254.169.254/latest/meta-data', 'UNSAFE_IMAGE_HOST'],
    ['public IP literal', 'https://8.8.8.8/image.png', 'UNSAFE_IMAGE_HOST'],
    ['metadata hostname', 'https://metadata.google.internal/computeMetadata/v1', 'UNSAFE_IMAGE_HOST'],
    ['single-label internal name', 'https://instance-data/latest', 'UNSAFE_IMAGE_HOST'],
    ['reserved HTTPS port', 'https://images.example.com:8443/image.png', 'UNSAFE_IMAGE_URL']
  ])('rejects a %s target before DNS or transport', async (_label, url, code) => {
    const httpsRequest = jest.fn();
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest
    });

    await expectFetchError(fetchImage(url), code);
    expect(publicDnsLookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test.each([
    ['loopback IPv4', '127.0.0.1', 4],
    ['RFC1918 IPv4', '10.23.4.5', 4],
    ['link-local IPv4', '169.254.169.254', 4],
    ['loopback IPv6', '::1', 6],
    ['unique-local IPv6', 'fd00:ec2::254', 6],
    ['link-local IPv6', 'fe80::1', 6]
  ])('rejects DNS resolution to %s', async (_label, address, family) => {
    const dnsLookup = jest.fn(async () => [{ address, family }]);
    const httpsRequest = jest.fn();
    const fetchImage = createSafeRemoteImageFetcher({ dnsLookup, httpsRequest });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'UNSAFE_IMAGE_ADDRESS'
    );
    expect(dnsLookup).toHaveBeenCalledWith(
      'images.example.com',
      { all: true, verbatim: true }
    );
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('rejects the entire DNS answer set when any answer is private', async () => {
    const dnsLookup = jest.fn(async () => [
      { address: PUBLIC_IPV4, family: 4 },
      { address: '10.0.0.4', family: 4 }
    ]);
    const httpsRequest = jest.fn();
    const fetchImage = createSafeRemoteImageFetcher({ dnsLookup, httpsRequest });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'UNSAFE_IMAGE_ADDRESS'
    );
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('fails closed when DNS resolution stalls', async () => {
    const dnsLookup = jest.fn(() => new Promise(() => {}));
    const httpsRequest = jest.fn();
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup,
      httpsRequest,
      dnsTimeoutMs: 10,
      overallTimeoutMs: 100
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_DNS_TIMEOUT'
    );
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  test('validates and pins a public DNS address for a fresh credential-free HTTPS connection', async () => {
    const dnsLookup = jest.fn(async () => [
      { address: PUBLIC_IPV4, family: 4 },
      { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }
    ]);
    const { calls, httpsRequest } = createHttpsHarness(() => ({
      headers: {
        'content-type': 'image/png',
        'content-length': String(VALID_PNG.length)
      }
    }));
    const fetchImage = createSafeRemoteImageFetcher({ dnsLookup, httpsRequest });

    await expect(fetchImage('https://images.example.com/assets/hero.png?version=1'))
      .resolves.toEqual(VALID_PNG);

    expect(calls).toHaveLength(1);
    expect(calls[0].pinnedAddress).toBe(PUBLIC_IPV4);
    expect(calls[0].pinnedFamily).toBe(4);
    expect(calls[0].target.hostname).toBe('images.example.com');
    expect(calls[0].options).toMatchObject({
      method: 'GET',
      agent: false,
      family: 4,
      servername: 'images.example.com',
      rejectUnauthorized: true
    });
    expect(calls[0].options.headers).not.toHaveProperty('Authorization');
    expect(calls[0].options.headers).not.toHaveProperty('Cookie');
    expect(calls[0].options.headers['Accept-Encoding']).toBe('identity');
  });

  test('resolves, validates, and repins every redirect target', async () => {
    const dnsLookup = jest.fn(async (hostname) => {
      if (hostname === 'private.example.com') {
        return [{ address: '192.168.10.12', family: 4 }];
      }
      return [{ address: PUBLIC_IPV4, family: 4 }];
    });
    const { calls, httpsRequest } = createHttpsHarness(() => ({
      statusCode: 302,
      headers: { location: 'https://private.example.com/private.png' },
      body: Buffer.alloc(0)
    }));
    const fetchImage = createSafeRemoteImageFetcher({ dnsLookup, httpsRequest });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'UNSAFE_IMAGE_ADDRESS'
    );
    expect(dnsLookup).toHaveBeenNthCalledWith(
      1,
      'images.example.com',
      { all: true, verbatim: true }
    );
    expect(dnsLookup).toHaveBeenNthCalledWith(
      2,
      'private.example.com',
      { all: true, verbatim: true }
    );
    expect(calls).toHaveLength(1);
  });

  test('enforces a strict redirect cap without automatic transport redirects', async () => {
    const { calls, httpsRequest } = createHttpsHarness((_call, index) => ({
      statusCode: 302,
      headers: { location: `/redirect-${index + 1}.png` },
      body: Buffer.alloc(0)
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest,
      maxRedirects: 2
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_REDIRECT_LIMIT'
    );
    expect(calls).toHaveLength(3);
  });

  test('rejects a redirect that downgrades to HTTP before another request is made', async () => {
    const { calls, httpsRequest } = createHttpsHarness(() => ({
      statusCode: 302,
      headers: { location: 'http://images.example.com/insecure.png' },
      body: Buffer.alloc(0)
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'UNSAFE_IMAGE_URL'
    );
    expect(calls).toHaveLength(1);
  });

  test('rejects an oversized streamed image even without Content-Length', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({
      headers: { 'content-type': 'image/png' },
      chunks: [PNG_SIGNATURE, Buffer.from([0x00])]
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest,
      maxBytes: PNG_SIGNATURE.length
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_TOO_LARGE'
    );
  });

  test('rejects an oversized declared Content-Length before reading the body', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({
      headers: {
        'content-type': 'image/png',
        'content-length': '999'
      }
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest,
      maxBytes: 32
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_TOO_LARGE'
    );
  });

  test('times out a slow response body under one overall deadline', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({
      headers: { 'content-type': 'image/png' },
      stallBody: true
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest,
      connectTimeoutMs: 100,
      overallTimeoutMs: 25
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_FETCH_TIMEOUT'
    );
  });

  test('enforces a separate connection timeout', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({ stallConnecting: true }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest,
      connectTimeoutMs: 10,
      overallTimeoutMs: 100
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_CONNECT_TIMEOUT'
    );
  });

  test('rejects a non-image response content type', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: Buffer.from('<html>not an image</html>')
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_CONTENT_TYPE_INVALID'
    );
  });

  test('rejects a forged image content type when the bytes do not match', async () => {
    const { httpsRequest } = createHttpsHarness(() => ({
      headers: { 'content-type': 'image/png' },
      body: Buffer.from('<html>not a png</html>')
    }));
    const fetchImage = createSafeRemoteImageFetcher({
      dnsLookup: publicDnsLookup,
      httpsRequest
    });

    await expectFetchError(
      fetchImage('https://images.example.com/image.png'),
      'IMAGE_CONTENT_INVALID'
    );
  });
});
