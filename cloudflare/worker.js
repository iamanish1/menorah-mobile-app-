/**
 * Menorah Health — Cloudflare Worker
 *
 * Responsibilities:
 *   1. Route every incoming request to VPS (cheap, always on) or GCP Cloud Run (burst)
 *   2. Run a cron health-check every minute and store the result in KV
 *   3. Automatically fail over to GCP when VPS is unhealthy or slow
 *   4. Fail back to VPS automatically once it recovers
 *
 * Environment bindings (set in wrangler.toml or Cloudflare dashboard):
 *   VPS_URL   — https://api.menorahhealth.app  (your VPS behind nginx)
 *   GCP_URL   — https://menorah-api-xxxx.run.app (Cloud Run service URL)
 *   HEALTH_KV — KV namespace for storing health state across cron + fetch
 */

// ── Constants ────────────────────────────────────────────────────────────────
const HEALTH_KEY        = 'vps:health';
const HEALTH_TTL_S      = 120;       // KV entry expires after 2 min (safety net if cron stops)
const HEALTH_TIMEOUT_MS = 5000;      // VPS must respond within 5s to be considered healthy
const SLOW_THRESHOLD_MS = 2000;      // responses >2s trigger partial GCP offload
const GCP_SPLIT_PERCENT = 50;        // % of requests sent to GCP when VPS is slow

// ── Main export ──────────────────────────────────────────────────────────────
export default {

  /**
   * Handle every HTTP request coming through Cloudflare.
   * Reads the cached health state (written by the cron) and routes accordingly.
   */
  async fetch(request, env, ctx) {
    // Socket.IO long-polling and WebSocket upgrades must always go to the same
    // backend instance during a session — we always route them to VPS.
    // GCP Cloud Run supports WebSockets but requires sticky sessions config.
    const url = new URL(request.url);
    if (url.pathname.startsWith('/socket.io/')) {
      return proxyTo(request, env.VPS_URL, 'vps-socket');
    }

    // Read latest health state written by the cron trigger
    const health = await getHealthState(env);

    // Routing decision
    if (!health.healthy) {
      // VPS is down — all traffic to GCP
      return proxyTo(request, env.GCP_URL, 'gcp-failover');
    }

    if (health.slow) {
      // VPS is slow — split traffic probabilistically
      const sendToGCP = Math.random() * 100 < GCP_SPLIT_PERCENT;
      return proxyTo(request, sendToGCP ? env.GCP_URL : env.VPS_URL,
        sendToGCP ? 'gcp-load-split' : 'vps-load-split');
    }

    // Normal — all traffic to VPS
    return proxyTo(request, env.VPS_URL, 'vps-primary');
  },

  /**
   * Cron trigger — runs every minute (free tier minimum).
   * Pings /health on VPS, stores result in KV so the fetch handler can read it.
   *
   * Free plan: 1-min intervals  → VPS can be down up to ~60s before all traffic fails over.
   * Workers Paid plan: set cron to * * * * * / 30 for 30s intervals.
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHealthCheck(env));
  },
};

// ── Health check ─────────────────────────────────────────────────────────────
async function runHealthCheck(env) {
  const start = Date.now();
  let healthy = false;
  let slow    = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const res = await fetch(`${env.VPS_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Menorah-HealthCheck/1.0' },
    });
    clearTimeout(timer);

    const responseTimeMs = Date.now() - start;
    const body = await res.json().catch(() => ({}));

    healthy = res.ok && body.status === 'OK';
    slow    = healthy && responseTimeMs > SLOW_THRESHOLD_MS;

    await storeHealthState(env, { healthy, slow, responseTimeMs, checkedAt: Date.now() });

    console.log(`[health-check] VPS ${healthy ? 'OK' : 'DOWN'} (${responseTimeMs}ms)${slow ? ' SLOW' : ''}`);
  } catch (err) {
    // Timeout or network error → VPS is down
    await storeHealthState(env, {
      healthy: false,
      slow: false,
      responseTimeMs: Date.now() - start,
      checkedAt: Date.now(),
      error: err.message,
    });
    console.error('[health-check] VPS unreachable:', err.message);
  }
}

// ── KV helpers ───────────────────────────────────────────────────────────────
async function getHealthState(env) {
  try {
    const raw = await env.HEALTH_KV.get(HEALTH_KEY, 'json');
    if (raw) return raw;
  } catch { /* KV miss or error — assume healthy on first boot */ }
  return { healthy: true, slow: false };
}

async function storeHealthState(env, state) {
  await env.HEALTH_KV.put(HEALTH_KEY, JSON.stringify(state), {
    expirationTtl: HEALTH_TTL_S,
  });
}

// ── Proxy helper ─────────────────────────────────────────────────────────────
async function proxyTo(request, targetBase, routingLabel) {
  const origin = new URL(request.url);
  const target = new URL(targetBase);

  // Rewrite host to the target, keep path + query intact
  origin.host     = target.host;
  origin.protocol = target.protocol;

  const proxied = new Request(origin.toString(), {
    method:  request.method,
    headers: addForwardedHeaders(request),
    body:    ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    redirect: 'follow',
  });

  try {
    const res = await fetch(proxied);
    // Add a debug header so you can see routing decisions in browser DevTools
    const response = new Response(res.body, res);
    response.headers.set('X-Menorah-Route', routingLabel);
    return response;
  } catch (err) {
    // Upstream completely unreachable — return a clean 503
    return new Response(
      JSON.stringify({ success: false, message: 'Service temporarily unavailable. Please try again.' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'X-Menorah-Route': `${routingLabel}-error`,
          'Retry-After': '30',
        },
      }
    );
  }
}

function addForwardedHeaders(request) {
  const headers = new Headers(request.headers);
  // Pass real client IP to Express (used by rate limiter)
  headers.set('X-Forwarded-For',   request.headers.get('CF-Connecting-IP') || '');
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Real-IP',         request.headers.get('CF-Connecting-IP') || '');
  return headers;
}
