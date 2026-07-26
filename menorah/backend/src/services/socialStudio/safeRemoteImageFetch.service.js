const dns = require('dns');
const https = require('https');
const net = require('net');
const { performance } = require('perf_hooks');

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_CONNECT_TIMEOUT_MS = 4000;
const DEFAULT_DNS_TIMEOUT_MS = 3000;
const DEFAULT_OVERALL_TIMEOUT_MS = 15000;
const MAX_URL_LENGTH = 2048;

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const RESERVED_HOST_SUFFIXES = [
  'arpa',
  'cluster',
  'corp',
  'example',
  'home',
  'internal',
  'invalid',
  'lan',
  'local',
  'localdomain',
  'localhost',
  'onion',
  'svc',
  'test'
];
const RESERVED_HOSTNAMES = new Set([
  'instance-data',
  'metadata',
  'metadata.google',
  'metadata.google.internal'
]);

const publicIpv6Range = new net.BlockList();
publicIpv6Range.addSubnet('2000::', 3, 'ipv6');

const reservedIpv6Ranges = new net.BlockList();
[
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20]
].forEach(([address, prefix]) => reservedIpv6Ranges.addSubnet(address, prefix, 'ipv6'));

class SafeRemoteImageFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SafeRemoteImageFetchError';
    this.code = code;
  }
}

const fail = (code, message) => new SafeRemoteImageFetchError(code, message);

const normalizeHostname = (value) => String(value || '')
  .toLowerCase()
  .replace(/^\[|\]$/g, '')
  .replace(/\.+$/, '');

const isReservedHostname = (hostname) => {
  if (RESERVED_HOSTNAMES.has(hostname)) return true;
  if (!hostname.includes('.')) return true;

  return RESERVED_HOST_SUFFIXES.some((suffix) =>
    hostname === suffix || hostname.endsWith(`.${suffix}`));
};

const validateHostnameSyntax = (hostname) => {
  if (!hostname || hostname.length > 253 || isReservedHostname(hostname)) return false;

  return hostname
    .split('.')
    .every((label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
};

const parseAndValidateTarget = (input) => {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_URL_LENGTH) {
    throw fail('UNSAFE_IMAGE_URL', 'Remote image URL is invalid');
  }

  let target;
  try {
    target = new URL(input);
  } catch {
    throw fail('UNSAFE_IMAGE_URL', 'Remote image URL is invalid');
  }

  if (target.protocol !== 'https:') {
    throw fail('UNSAFE_IMAGE_URL', 'Remote images must use HTTPS');
  }
  if (target.username || target.password) {
    throw fail('UNSAFE_IMAGE_URL', 'Remote image URLs must not contain credentials');
  }
  if (target.port && target.port !== '443') {
    throw fail('UNSAFE_IMAGE_URL', 'Remote images must use the standard HTTPS port');
  }

  const hostname = normalizeHostname(target.hostname);
  if (net.isIP(hostname) !== 0) {
    throw fail('UNSAFE_IMAGE_HOST', 'Remote image IP literals are not allowed');
  }
  if (!validateHostnameSyntax(hostname)) {
    throw fail('UNSAFE_IMAGE_HOST', 'Remote image hostname is not allowed');
  }

  target.hostname = hostname;
  target.hash = '';
  return { target, hostname };
};

const isPublicIpv4Address = (address) => {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 192 && second === 88 && third === 99) return false;
  if (first === 192 && second === 168) return false;
  if (first === 198 && (second === 18 || second === 19)) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
};

const isPublicIpAddress = (address) => {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4Address(address);
  if (family !== 6) return false;

  return (
    publicIpv6Range.check(address, 'ipv6') &&
    !reservedIpv6Ranges.check(address, 'ipv6')
  );
};

const getRemainingTime = (deadline, now) => Math.max(0, deadline - now());

const withTimeout = (operation, timeoutMs, timeoutError) => new Promise((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    settled = true;
    reject(timeoutError);
  }, timeoutMs);
  timer.unref?.();

  Promise.resolve(operation).then(
    (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    },
    (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }
  );
});

const resolveAndValidateHostname = async ({
  hostname,
  dnsLookup,
  dnsTimeoutMs,
  deadline,
  now
}) => {
  const remainingMs = getRemainingTime(deadline, now);
  if (remainingMs === 0) {
    throw fail('IMAGE_FETCH_TIMEOUT', 'Remote image fetch timed out');
  }

  let answers;
  try {
    answers = await withTimeout(
      dnsLookup(hostname, { all: true, verbatim: true }),
      Math.max(1, Math.min(dnsTimeoutMs, remainingMs)),
      fail('IMAGE_DNS_TIMEOUT', 'Remote image DNS resolution timed out')
    );
  } catch (error) {
    if (error instanceof SafeRemoteImageFetchError) throw error;
    throw fail('IMAGE_DNS_RESOLUTION_FAILED', 'Remote image hostname could not be resolved');
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw fail('IMAGE_DNS_RESOLUTION_FAILED', 'Remote image hostname could not be resolved');
  }

  const validatedAnswers = answers.map((answer) => {
    const address = String(answer?.address || '');
    const actualFamily = net.isIP(address);
    const reportedFamily = Number(answer?.family);
    if (
      (actualFamily !== 4 && actualFamily !== 6) ||
      (reportedFamily !== 4 && reportedFamily !== 6) ||
      actualFamily !== reportedFamily
    ) {
      throw fail('IMAGE_DNS_RESOLUTION_FAILED', 'Remote image hostname returned an invalid address');
    }
    if (!isPublicIpAddress(address)) {
      throw fail('UNSAFE_IMAGE_ADDRESS', 'Remote image hostname resolved to a non-public address');
    }
    return { address, family: actualFamily };
  });

  return validatedAnswers[0];
};

const getContentType = (headers) => {
  const rawContentType = headers?.['content-type'];
  if (typeof rawContentType !== 'string' || rawContentType.includes(',')) return '';
  return rawContentType.split(';', 1)[0].trim().toLowerCase();
};

const hasExpectedImageSignature = (buffer, contentType) => {
  if (!Buffer.isBuffer(buffer)) return false;

  if (contentType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (contentType === 'image/png') {
    return buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === 'image/gif') {
    return buffer.length >= 6 && ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'));
  }
  if (contentType === 'image/webp') {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (contentType === 'image/avif') {
    return buffer.length >= 12 &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
      ['avif', 'avis'].includes(buffer.subarray(8, 12).toString('ascii'));
  }
  return false;
};

const parseContentLength = (headers, maxBytes) => {
  const rawContentLength = headers?.['content-length'];
  if (rawContentLength === undefined) return;
  if (
    typeof rawContentLength !== 'string' ||
    !/^(?:0|[1-9]\d*)$/.test(rawContentLength)
  ) {
    throw fail('IMAGE_RESPONSE_INVALID', 'Remote image response has an invalid content length');
  }

  const contentLength = Number(rawContentLength);
  if (!Number.isSafeInteger(contentLength)) {
    throw fail('IMAGE_RESPONSE_INVALID', 'Remote image response has an invalid content length');
  }
  if (contentLength > maxBytes) {
    throw fail('IMAGE_TOO_LARGE', 'Remote image exceeds the allowed size');
  }
};

const createPinnedLookup = ({ hostname, pinnedAddress }) =>
  (requestedHostname, options, callback) => {
    const normalizedRequestedHostname = normalizeHostname(requestedHostname);
    if (normalizedRequestedHostname !== hostname) {
      callback(fail('UNSAFE_IMAGE_HOST', 'HTTPS connection requested an unexpected hostname'));
      return;
    }

    if (options?.all) {
      callback(null, [pinnedAddress]);
      return;
    }
    callback(null, pinnedAddress.address, pinnedAddress.family);
  };

const readPinnedHttpsResponse = ({
  target,
  hostname,
  pinnedAddress,
  httpsRequest,
  connectTimeoutMs,
  maxBytes,
  timeoutMs
}) => new Promise((resolve, reject) => {
  let request;
  let connectTimer;
  let overallTimer;
  let settled = false;

  const clearTimers = () => {
    clearTimeout(connectTimer);
    clearTimeout(overallTimer);
  };

  const settle = (handler, value) => {
    if (settled) return;
    settled = true;
    clearTimers();
    handler(value);
  };

  const rejectAndDestroy = (error, response) => {
    settle(reject, error);
    response?.destroy?.();
    request?.destroy?.();
  };

  const handleResponse = (response) => {
    clearTimeout(connectTimer);
    const statusCode = Number(response.statusCode);
    if (REDIRECT_STATUS_CODES.has(statusCode)) {
      const location = response.headers?.location;
      if (typeof location !== 'string' || location.length === 0) {
        rejectAndDestroy(
          fail('IMAGE_REDIRECT_INVALID', 'Remote image redirect is invalid'),
          response
        );
        return;
      }

      settle(resolve, { redirectLocation: location });
      response.destroy?.();
      return;
    }

    if (statusCode !== 200) {
      rejectAndDestroy(
        fail('IMAGE_RESPONSE_INVALID', 'Remote image server returned an invalid response'),
        response
      );
      return;
    }

    const contentType = getContentType(response.headers);
    if (!ALLOWED_IMAGE_CONTENT_TYPES.has(contentType)) {
      rejectAndDestroy(
        fail('IMAGE_CONTENT_TYPE_INVALID', 'Remote image response is not an allowed image type'),
        response
      );
      return;
    }

    try {
      parseContentLength(response.headers, maxBytes);
    } catch (error) {
      rejectAndDestroy(error, response);
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let responseEnded = false;
    response.on('data', (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        rejectAndDestroy(
          fail('IMAGE_TOO_LARGE', 'Remote image exceeds the allowed size'),
          response
        );
        return;
      }
      chunks.push(buffer);
    });
    response.once('aborted', () => {
      settle(
        reject,
        fail('IMAGE_RESPONSE_INVALID', 'Remote image response ended unexpectedly')
      );
    });
    response.once('error', () => {
      settle(
        reject,
        fail('IMAGE_RESPONSE_INVALID', 'Remote image response could not be read')
      );
    });
    response.once('end', () => {
      if (settled) return;
      responseEnded = true;
      const buffer = Buffer.concat(chunks, totalBytes);
      if (!hasExpectedImageSignature(buffer, contentType)) {
        settle(
          reject,
          fail('IMAGE_CONTENT_INVALID', 'Remote image content is invalid')
        );
        return;
      }
      settle(resolve, { buffer });
    });
    response.once('close', () => {
      if (responseEnded || settled) return;
      settle(
        reject,
        fail('IMAGE_RESPONSE_INVALID', 'Remote image response ended unexpectedly')
      );
    });
  };

  overallTimer = setTimeout(() => {
    rejectAndDestroy(fail('IMAGE_FETCH_TIMEOUT', 'Remote image fetch timed out'));
  }, timeoutMs);
  overallTimer.unref?.();
  connectTimer = setTimeout(() => {
    rejectAndDestroy(fail('IMAGE_CONNECT_TIMEOUT', 'Remote image connection timed out'));
  }, Math.min(connectTimeoutMs, timeoutMs));
  connectTimer.unref?.();

  try {
    request = httpsRequest(target, {
      method: 'GET',
      agent: false,
      autoSelectFamily: false,
      family: pinnedAddress.family,
      lookup: createPinnedLookup({ hostname, pinnedAddress }),
      servername: hostname,
      rejectUnauthorized: true,
      maxHeaderSize: 16 * 1024,
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'Accept-Encoding': 'identity',
        Connection: 'close',
        'User-Agent': 'Menorah-Social-Studio-Image-Fetcher/1.0'
      }
    }, handleResponse);
  } catch {
    settle(reject, fail('IMAGE_FETCH_FAILED', 'Remote image request could not be created'));
    return;
  }

  request.once('error', (error) => {
    settle(
      reject,
      error instanceof SafeRemoteImageFetchError
        ? error
        : fail('IMAGE_FETCH_FAILED', 'Remote image request failed')
    );
  });
  request.once('socket', (socket) => {
    const clearConnectTimer = () => clearTimeout(connectTimer);
    socket.once('secureConnect', clearConnectTimer);
    socket.once('error', clearConnectTimer);
    socket.once('close', clearConnectTimer);
  });

  request.end();
});

const assertPositiveInteger = (value, name) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
};

const createSafeRemoteImageFetcher = ({
  dnsLookup = (hostname, options) => dns.promises.lookup(hostname, options),
  httpsRequest = https.request,
  maxBytes = DEFAULT_MAX_BYTES,
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  dnsTimeoutMs = DEFAULT_DNS_TIMEOUT_MS,
  overallTimeoutMs = DEFAULT_OVERALL_TIMEOUT_MS,
  now = () => performance.now()
} = {}) => {
  assertPositiveInteger(maxBytes, 'maxBytes');
  assertPositiveInteger(connectTimeoutMs, 'connectTimeoutMs');
  assertPositiveInteger(dnsTimeoutMs, 'dnsTimeoutMs');
  assertPositiveInteger(overallTimeoutMs, 'overallTimeoutMs');
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) {
    throw new TypeError('maxRedirects must be a non-negative integer');
  }
  if (typeof dnsLookup !== 'function' || typeof httpsRequest !== 'function' || typeof now !== 'function') {
    throw new TypeError('Remote image fetch dependencies are invalid');
  }

  return async (imageUrl) => {
    const deadline = now() + overallTimeoutMs;
    let { target, hostname } = parseAndValidateTarget(imageUrl);

    for (let redirectCount = 0; ; redirectCount += 1) {
      const pinnedAddress = await resolveAndValidateHostname({
        hostname,
        dnsLookup,
        dnsTimeoutMs,
        deadline,
        now
      });
      const remainingMs = getRemainingTime(deadline, now);
      if (remainingMs === 0) {
        throw fail('IMAGE_FETCH_TIMEOUT', 'Remote image fetch timed out');
      }

      const result = await readPinnedHttpsResponse({
        target,
        hostname,
        pinnedAddress,
        httpsRequest,
        connectTimeoutMs,
        maxBytes,
        timeoutMs: remainingMs
      });
      if (result.buffer) return result.buffer;
      if (redirectCount >= maxRedirects) {
        throw fail('IMAGE_REDIRECT_LIMIT', 'Remote image exceeded the redirect limit');
      }

      let redirectUrl;
      try {
        redirectUrl = new URL(result.redirectLocation, target).toString();
      } catch {
        throw fail('IMAGE_REDIRECT_INVALID', 'Remote image redirect is invalid');
      }
      ({ target, hostname } = parseAndValidateTarget(redirectUrl));
    }
  };
};

const fetchRemoteImageBuffer = createSafeRemoteImageFetcher();

module.exports = {
  createSafeRemoteImageFetcher,
  fetchRemoteImageBuffer,
  SafeRemoteImageFetchError
};
