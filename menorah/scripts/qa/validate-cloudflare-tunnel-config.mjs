#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { parseDocument } from 'yaml';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MANIFEST_PATH = path.resolve(
  SCRIPT_DIR,
  '../../deploy/cloudflare/ingress-manifest.json',
);
export const DEFAULT_CADDY_PATH = path.resolve(
  SCRIPT_DIR,
  '../../deploy/caddy/Caddyfile.production',
);
export const DEFAULT_PRODUCTION_COMPOSE_PATH = path.resolve(
  SCRIPT_DIR,
  '../../deploy/docker-compose.production.yml',
);
export const DEFAULT_TUNNEL_COMPOSE_PATH = path.resolve(
  SCRIPT_DIR,
  '../../deploy/docker-compose.tunnel.yml',
);
const MAX_CONFIG_BYTES = 1024 * 1024;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SENSITIVE_TOP_LEVEL_KEYS = new Set([
  'token',
  'tunnel-token',
  'tunnel_token',
  'credentials',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasValue(value) {
  return typeof value === 'string' ? value.trim().length > 0 : value != null;
}

function parseYamlOrJson(source, label) {
  if (Buffer.byteLength(source, 'utf8') > MAX_CONFIG_BYTES) {
    throw new Error(`${label} exceeds the 1 MiB offline validation limit`);
  }

  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    const firstError = document.errors[0];
    const position = firstError.linePos?.[0];
    const suffix = position
      ? ` at line ${position.line}, column ${position.col}`
      : '';
    throw new Error(`${label} is not valid YAML or JSON${suffix}`);
  }

  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch {
    throw new Error(`${label} contains unsupported YAML aliases`);
  }
}

function parseRepositoryCompose(source, label) {
  if (Buffer.byteLength(source, 'utf8') > MAX_CONFIG_BYTES) {
    throw new Error(`${label} exceeds the 1 MiB offline validation limit`);
  }

  const document = parseDocument(source, {
    prettyErrors: false,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(`${label} is not valid YAML`);
  }
  return document.toJS({ maxAliasCount: 10000 });
}

function normalizeHostname(value, label, errors) {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a string`);
    return null;
  }

  const hostname = value.trim().toLowerCase().replace(/\.$/, '');
  if (!HOSTNAME_PATTERN.test(hostname)) {
    errors.push(`${label} is not a valid exact DNS hostname`);
    return null;
  }
  return hostname;
}

function normalizeOriginService(value, label, errors) {
  if (typeof value !== 'string') {
    errors.push(`${label} must be a string`);
    return null;
  }

  let target;
  try {
    target = new URL(value.trim());
  } catch {
    errors.push(`${label} must be an absolute HTTP origin URL`);
    return null;
  }

  if (target.protocol !== 'http:') {
    errors.push(
      `${label} must use HTTP for the private cloudflared-to-Caddy Docker hop`,
    );
    return null;
  }
  if (target.username || target.password) {
    errors.push(`${label} must not embed credentials`);
    return null;
  }
  if (
    (target.pathname && target.pathname !== '/')
    || target.search
    || target.hash
  ) {
    errors.push(`${label} must not contain a path, query, or fragment`);
    return null;
  }

  const hostname = target.hostname.toLowerCase();
  const port = target.port || '80';
  return `http://${hostname}:${port}`;
}

function extractConfig(document, errors) {
  if (!isObject(document)) {
    errors.push('configuration root must be a mapping/object');
    return null;
  }

  for (const key of Object.keys(document)) {
    if (SENSITIVE_TOP_LEVEL_KEYS.has(key.toLowerCase())) {
      errors.push(
        `configuration must not embed sensitive field "${key}"; use an external token or credentials file`,
      );
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(document, 'success')
    && document.success !== true
  ) {
    errors.push('remote Cloudflare API export does not report success: true');
  }

  if (isObject(document.result) && isObject(document.result.config)) {
    return document.result.config;
  }
  if (isObject(document.config) && Array.isArray(document.config.ingress)) {
    return document.config;
  }
  if (Array.isArray(document.ingress)) {
    return document;
  }

  errors.push(
    'configuration must contain ingress, config.ingress, or result.config.ingress',
  );
  return null;
}

function validateOriginRequest(originRequest, label, errors) {
  if (originRequest == null) {
    return;
  }
  if (!isObject(originRequest)) {
    errors.push(`${label} must be a mapping/object when present`);
    return;
  }
  if (originRequest.noTLSVerify === true) {
    errors.push(`${label}.noTLSVerify must not disable TLS verification`);
  }
  if (hasValue(originRequest.httpHostHeader)) {
    errors.push(
      `${label}.httpHostHeader must not override the public hostname Caddy uses for routing`,
    );
  }
}

export function validateManifest(manifest) {
  const errors = [];
  if (!isObject(manifest)) {
    return ['manifest root must be an object'];
  }
  if (manifest.schemaVersion !== 1) {
    errors.push('manifest schemaVersion must be 1');
  }

  const expectedService = normalizeOriginService(
    manifest.service,
    'manifest service',
    errors,
  );
  if (expectedService !== 'http://reverse-proxy:80') {
    errors.push(
      'manifest service must target the private Docker origin http://reverse-proxy:80',
    );
  }
  if (manifest.terminalService !== 'http_status:404') {
    errors.push('manifest terminalService must be http_status:404');
  }
  if (!Array.isArray(manifest.routes) || manifest.routes.length === 0) {
    errors.push('manifest routes must be a non-empty array');
    return errors;
  }

  const hostnames = new Set();
  const caddySites = new Set();
  manifest.routes.forEach((route, index) => {
    const label = `manifest route #${index + 1}`;
    if (!isObject(route)) {
      errors.push(`${label} must be an object`);
      return;
    }

    const hostname = normalizeHostname(
      route.hostname,
      `${label} hostname`,
      errors,
    );
    if (hostname) {
      if (hostnames.has(hostname)) {
        errors.push(`${label} duplicates hostname ${hostname}`);
      }
      hostnames.add(hostname);
    }

    if (typeof route.caddySite !== 'string' || !route.caddySite.trim()) {
      errors.push(`${label} caddySite must be a non-empty string`);
      return;
    }
    const caddySite = route.caddySite.trim();
    if (caddySites.has(caddySite)) {
      errors.push(`${label} duplicates Caddy site ${caddySite}`);
    }
    caddySites.add(caddySite);
  });

  return errors;
}

export function validateTunnelDocument(document, manifest) {
  const errors = [];
  const config = extractConfig(document, errors);
  if (!config) {
    return errors;
  }

  validateOriginRequest(config.originRequest, 'top-level originRequest', errors);

  if (!Array.isArray(config.ingress) || config.ingress.length === 0) {
    errors.push('ingress must be a non-empty array');
    return errors;
  }

  const expectedService = normalizeOriginService(
    manifest.service,
    'manifest service',
    errors,
  );
  const expectedHostnames = new Set(
    manifest.routes.map((route) => route.hostname),
  );
  const actualHostnames = new Set();
  const finalIndex = config.ingress.length - 1;

  config.ingress.forEach((rule, index) => {
    const label = `ingress rule #${index + 1}`;
    if (!isObject(rule)) {
      errors.push(`${label} must be a mapping/object`);
      return;
    }

    validateOriginRequest(rule.originRequest, `${label} originRequest`, errors);

    const hasHostname = hasValue(rule.hostname);
    const hasPath = hasValue(rule.path);
    if (index === finalIndex) {
      if (hasHostname || hasPath || rule.service !== manifest.terminalService) {
        errors.push(
          `${label} must be the hostname-free, path-free final ${manifest.terminalService} catch-all`,
        );
      }
      return;
    }

    if (!hasHostname) {
      errors.push(
        `${label} is a catch-all or path-only rule; catch-all rule must be final`,
      );
      return;
    }
    if (hasPath) {
      errors.push(
        `${label} must not restrict an expected public hostname with a path matcher`,
      );
    }

    const hostname = normalizeHostname(
      rule.hostname,
      `${label} hostname`,
      errors,
    );
    if (!hostname) {
      return;
    }
    if (actualHostnames.has(hostname)) {
      errors.push(`${label} duplicates normalized hostname ${hostname}`);
    }
    actualHostnames.add(hostname);

    if (!expectedHostnames.has(hostname)) {
      errors.push(`${label} contains unexpected hostname ${hostname}`);
    }

    const service = normalizeOriginService(
      rule.service,
      `${label} service`,
      errors,
    );
    if (service && service !== expectedService) {
      errors.push(
        `${label} service for ${hostname} must target ${manifest.service}`,
      );
    }
  });

  for (const hostname of expectedHostnames) {
    if (!actualHostnames.has(hostname)) {
      errors.push(`configuration is missing expected hostname ${hostname}`);
    }
  }

  return errors;
}

function extractCaddySites(caddySource) {
  const sites = [];
  for (const sourceLine of caddySource.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line.startsWith('http://') || !line.endsWith('{')) {
      continue;
    }

    const declaration = line.slice(0, -1).trim();
    for (const address of declaration.split(',')) {
      const trimmedAddress = address.trim();
      if (trimmedAddress.startsWith('http://')) {
        sites.push(trimmedAddress.slice('http://'.length));
      }
    }
  }
  return sites;
}

export function validateCaddySource(caddySource, manifest) {
  const errors = [];
  const expectedSites = new Set(
    manifest.routes.map((route) => route.caddySite),
  );
  const actualSites = new Set();

  for (const site of extractCaddySites(caddySource)) {
    if (actualSites.has(site)) {
      errors.push(`Caddy production config duplicates site ${site}`);
    }
    actualSites.add(site);
    if (!expectedSites.has(site)) {
      errors.push(`Caddy production config contains unexpected site ${site}`);
    }
  }

  for (const site of expectedSites) {
    if (!actualSites.has(site)) {
      errors.push(`Caddy production config is missing manifest site ${site}`);
    }
  }

  const lines = caddySource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const trustedProxyLines = lines.filter((line) => line.startsWith('trusted_proxies '));
  const expectedTrustedProxy =
    'trusted_proxies static {$CLOUDFLARED_TUNNEL_IP}';
  if (
    trustedProxyLines.length !== 1
    || trustedProxyLines[0] !== expectedTrustedProxy
  ) {
    errors.push(
      'Caddy must trust only the exact cloudflared address from CLOUDFLARED_TUNNEL_IP',
    );
  }
  if (lines.filter((line) => line === 'trusted_proxies_strict').length !== 1) {
    errors.push('Caddy must enable trusted_proxies_strict exactly once');
  }
  const clientIpHeaderLines = lines.filter((line) => line.startsWith('client_ip_headers '));
  if (
    clientIpHeaderLines.length !== 1
    || clientIpHeaderLines[0] !== 'client_ip_headers CF-Connecting-IP'
  ) {
    errors.push('Caddy must derive client IP only from CF-Connecting-IP');
  }

  const requiredSanitization = [
    'request_header -Forwarded',
    'request_header -X-Forwarded-For',
    'request_header -X-Forwarded-Proto',
    'request_header -X-Forwarded-Host',
    'request_header -X-Real-IP',
    'request_header -True-Client-IP',
    'request_header -CF-Connecting-IP',
    'request_header -CF-IPCountry',
    'request_header -X-Menorah-Client-Country',
    'header_up X-Forwarded-For {client_ip}',
    'header_up X-Real-IP {client_ip}',
    'header_up CF-Connecting-IP {client_ip}',
    'header_up X-Forwarded-Proto https',
  ];
  requiredSanitization.forEach((directive) => {
    if (!lines.includes(directive)) {
      errors.push(`Caddy proxy provenance is missing "${directive}"`);
    }
  });

  if (!lines.includes(
    'request_header @trusted_tunnel_country X-Menorah-Client-Country {header.CF-IPCountry}',
  )) {
    errors.push(
      'Caddy must promote CF-IPCountry only into the private validated country header',
    );
  }
  if (!lines.includes(
    'remote_ip {$CLOUDFLARED_TUNNEL_IP}',
  )) {
    errors.push('Caddy country provenance must require the exact cloudflared peer');
  }
  if (!lines.includes('client_ip {$CLOUDFLARED_TUNNEL_IP}')) {
    errors.push(
      'Caddy must detect a trusted connector request missing client IP provenance',
    );
  }
  if (!lines.includes('respond @missing_tunnel_client_ip 400')) {
    errors.push(
      'Caddy must fail closed when trusted client IP provenance is missing',
    );
  }

  const reverseProxyLines = lines.filter((line) => line.startsWith('reverse_proxy '));
  if (
    reverseProxyLines.length !== 1
    || reverseProxyLines[0] !== 'reverse_proxy {args[0]} {'
  ) {
    errors.push(
      'all Caddy upstreams must use the sanitized_reverse_proxy snippet',
    );
  }
  const siteBlockCount = caddySource
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('http://') && line.trim().endsWith('{'))
    .length;
  const sanitizedProxyImports = lines.filter(
    (line) => line.startsWith('import sanitized_reverse_proxy '),
  ).length;
  if (sanitizedProxyImports !== siteBlockCount) {
    errors.push(
      'every Caddy production site must import sanitized_reverse_proxy exactly once',
    );
  }

  return errors;
}

function serviceNetworkNames(service) {
  if (!isObject(service)) return [];
  if (Array.isArray(service.networks)) return service.networks;
  return isObject(service.networks) ? Object.keys(service.networks) : [];
}

function serviceNetworkConfig(service, networkName) {
  if (!isObject(service) || !isObject(service.networks)) return null;
  const config = service.networks[networkName];
  return isObject(config) ? config : null;
}

function attachedServices(compose, networkName) {
  if (!isObject(compose?.services)) return [];
  return Object.entries(compose.services)
    .filter(([, service]) => serviceNetworkNames(service).includes(networkName))
    .map(([name]) => name)
    .sort();
}

export function validateIngressBoundary(productionCompose, tunnelCompose) {
  const errors = [];
  const productionServices = productionCompose?.services;
  const tunnelServices = tunnelCompose?.services;
  if (!isObject(productionServices)) {
    return ['production Compose must define services'];
  }
  if (!isObject(tunnelServices)) {
    return ['tunnel Compose must define services'];
  }

  const ingressNetwork = productionCompose?.networks?.tunnel_ingress_net;
  if (!isObject(ingressNetwork) || ingressNetwork.internal !== true) {
    errors.push('tunnel_ingress_net must be an internal production network');
  }
  const ingressSubnet = ingressNetwork?.ipam?.config?.[0]?.subnet;
  if (ingressSubnet !== '${TUNNEL_INGRESS_SUBNET:?TUNNEL_INGRESS_SUBNET is required}') {
    errors.push('tunnel_ingress_net must require an operator-verified subnet');
  }

  const productionMembers = attachedServices(productionCompose, 'tunnel_ingress_net');
  if (productionMembers.join(',') !== 'reverse-proxy') {
    errors.push('only reverse-proxy may join tunnel_ingress_net in production Compose');
  }
  const tunnelMembers = attachedServices(tunnelCompose, 'tunnel_ingress_net');
  if (tunnelMembers.join(',') !== 'cloudflared') {
    errors.push('only cloudflared may join tunnel_ingress_net in tunnel Compose');
  }

  const reverseProxy = productionServices['reverse-proxy'];
  const cloudflared = tunnelServices.cloudflared;
  const loopbackPorts = new Map([
    ['reverse-proxy', '${CADDY_HTTP_PORT:-127.0.0.1:8080}:80'],
    ['landing-page', '${LANDING_LOCAL_PORT:-127.0.0.1:18085}:3002'],
    ['user-web-app', '${USER_WEB_APP_LOCAL_PORT:-127.0.0.1:18087}:3002'],
    ['web-app', '${WEB_APP_LOCAL_PORT:-127.0.0.1:18086}:3001'],
    ['admin-panel', '${ADMIN_PANEL_LOCAL_PORT:-127.0.0.1:18088}:3003'],
    ['api-ios', '${API_IOS_LOCAL_PORT:-127.0.0.1:18080}:8080'],
    ['api-android', '${API_ANDROID_LOCAL_PORT:-127.0.0.1:18084}:8080'],
    ['api-web', '${API_WEB_LOCAL_PORT:-127.0.0.1:18082}:8080'],
    ['api-admin', '${API_ADMIN_LOCAL_PORT:-127.0.0.1:18083}:8080'],
    ['worker', '${WORKER_LOCAL_PORT:-127.0.0.1:18090}:8080'],
    ['alertmanager', '${ALERTMANAGER_LOCAL_PORT:-127.0.0.1:18102}:9093'],
    ['grafana', '${GRAFANA_LOCAL_PORT:-127.0.0.1:18100}:3000'],
    ['uptime-kuma', '${UPTIME_KUMA_LOCAL_PORT:-127.0.0.1:18101}:3001'],
  ]);
  for (const [serviceName, expectedPort] of loopbackPorts) {
    const ports = productionServices[serviceName]?.ports;
    if (!Array.isArray(ports) || ports.length !== 1 || ports[0] !== expectedPort) {
      errors.push(`${serviceName} production port publishing must remain loopback-only`);
    }
  }
  if (serviceNetworkNames(reverseProxy).includes('public_net')) {
    errors.push('reverse-proxy must not join public_net');
  }
  if (!serviceNetworkNames(cloudflared).includes('public_net')) {
    errors.push('cloudflared must retain public_net for outbound tunnel connectivity');
  }

  if (
    serviceNetworkConfig(reverseProxy, 'tunnel_ingress_net')?.ipv4_address
    !== '${CADDY_TUNNEL_IP:?CADDY_TUNNEL_IP is required}'
  ) {
    errors.push('reverse-proxy must have the reviewed fixed tunnel ingress address');
  }
  if (
    serviceNetworkConfig(cloudflared, 'tunnel_ingress_net')?.ipv4_address
    !== '${CLOUDFLARED_TUNNEL_IP:?CLOUDFLARED_TUNNEL_IP is required}'
  ) {
    errors.push('cloudflared must have the exact address trusted by Caddy');
  }
  if (
    reverseProxy?.environment?.CLOUDFLARED_TUNNEL_IP
    !== '${CLOUDFLARED_TUNNEL_IP:?CLOUDFLARED_TUNNEL_IP is required}'
  ) {
    errors.push('Caddy must receive the same cloudflared address used by Compose');
  }

  const appNetwork = productionCompose?.networks?.app_net;
  if (!isObject(appNetwork) || appNetwork.internal !== true) {
    errors.push('app_net must remain internal');
  }
  if (
    appNetwork?.ipam?.config?.[0]?.subnet
    !== '${APP_NETWORK_SUBNET:?APP_NETWORK_SUBNET is required}'
  ) {
    errors.push('app_net must use the reviewed APP_NETWORK_SUBNET default');
  }
  if (
    serviceNetworkConfig(reverseProxy, 'app_net')?.ipv4_address
    !== '${CADDY_APP_IP:?CADDY_APP_IP is required}'
  ) {
    errors.push('reverse-proxy must have the fixed CADDY_APP_IP on app_net');
  }
  if (
    productionCompose?.['x-backend-env']?.TRUST_PROXY
    !== '${CADDY_APP_IP:?CADDY_APP_IP is required}'
  ) {
    errors.push('Express TRUST_PROXY must be wired only to CADDY_APP_IP');
  }

  return errors;
}

export async function validateConfigSource(
  configSource,
  {
    manifestPath = DEFAULT_MANIFEST_PATH,
    caddyPath = DEFAULT_CADDY_PATH,
    configLabel = 'tunnel configuration',
  } = {},
) {
  const [
    manifestSource,
    caddySource,
    productionComposeSource,
    tunnelComposeSource,
  ] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(caddyPath, 'utf8'),
    readFile(DEFAULT_PRODUCTION_COMPOSE_PATH, 'utf8'),
    readFile(DEFAULT_TUNNEL_COMPOSE_PATH, 'utf8'),
  ]);
  const manifest = parseYamlOrJson(manifestSource, 'ingress manifest');
  const manifestErrors = validateManifest(manifest);
  if (manifestErrors.length > 0) {
    return {
      errors: manifestErrors.map((error) => `repository manifest: ${error}`),
      routeCount: 0,
    };
  }

  const caddyErrors = validateCaddySource(caddySource, manifest);
  if (caddyErrors.length > 0) {
    return {
      errors: caddyErrors.map((error) => `repository drift: ${error}`),
      routeCount: manifest.routes.length,
    };
  }

  let productionCompose;
  let tunnelCompose;
  try {
    productionCompose = parseRepositoryCompose(
      productionComposeSource,
      'production Compose',
    );
    tunnelCompose = parseRepositoryCompose(tunnelComposeSource, 'tunnel Compose');
  } catch (error) {
    return {
      errors: [`repository drift: ${error.message}`],
      routeCount: manifest.routes.length,
    };
  }
  const boundaryErrors = validateIngressBoundary(
    productionCompose,
    tunnelCompose,
  );
  if (boundaryErrors.length > 0) {
    return {
      errors: boundaryErrors.map((error) => `repository drift: ${error}`),
      routeCount: manifest.routes.length,
    };
  }

  let configDocument;
  try {
    configDocument = parseYamlOrJson(configSource, configLabel);
  } catch (error) {
    return {
      errors: [error.message],
      routeCount: manifest.routes.length,
    };
  }

  return {
    errors: validateTunnelDocument(configDocument, manifest),
    routeCount: manifest.routes.length,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function usage() {
  return [
    'Usage:',
    '  node validate-cloudflare-tunnel-config.mjs --config <path|->',
    '',
    'Accepts a locally managed cloudflared YAML file or a sanitized remote',
    'Cloudflare configuration API JSON export. Use "-" to read from stdin.',
  ].join('\n');
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }
  if (argv.length !== 2 || argv[0] !== '--config' || !argv[1]) {
    throw new Error(usage());
  }
  return { configPath: argv[1] };
}

export async function runCli(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    return 2;
  }

  if (args.help) {
    console.log(usage());
    return 0;
  }

  let configSource;
  try {
    configSource = args.configPath === '-'
      ? await readStdin()
      : await readFile(path.resolve(args.configPath), 'utf8');
  } catch (error) {
    console.error(`Unable to read tunnel configuration: ${error.message}`);
    return 2;
  }

  const result = await validateConfigSource(configSource, {
    configLabel: args.configPath === '-'
      ? 'stdin tunnel configuration'
      : `tunnel configuration ${args.configPath}`,
  });

  if (result.errors.length > 0) {
    console.error('Cloudflare Tunnel ingress validation failed:');
    result.errors.forEach((error) => console.error(`- ${error}`));
    return 1;
  }

  console.log(
    `Cloudflare Tunnel ingress matches all ${result.routeCount} manifest routes, the terminal 404 rule, Caddy proxy provenance, and the isolated Compose ingress boundary.`,
  );
  return 0;
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isDirectExecution) {
  process.exitCode = await runCli(process.argv.slice(2));
}
