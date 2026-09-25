// HTTP helper: timeout, polite per-host spacing, retry with exponential backoff on 429/5xx,
// and a result categorized by status instead of a throw, so callers can treat 404 as
// "no such board" rather than a failure.
import { log } from 'apify';

export const USER_AGENT = 'ats-jobs-aggregator/0.1 (+https://apify.com/m_ctim/ats-jobs-aggregator)';

const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
// api.lever.co/robots.txt asks for Crawl-delay: 1. Everything else gets a small courtesy gap.
const HOST_GAP_MS = { 'api.lever.co': 1000, 'api.eu.lever.co': 1000 };
const DEFAULT_GAP_MS = 250;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostQueues = new Map();

/** Serializes requests per host and spaces them out, while different hosts run in parallel. */
function waitForHost(host) {
    const gap = HOST_GAP_MS[host] ?? DEFAULT_GAP_MS;
    const prev = hostQueues.get(host) ?? Promise.resolve();
    const next = prev.then(() => sleep(gap));
    hostQueues.set(host, next.catch(() => {}));
    return prev;
}

export function categorize(status) {
    if (status >= 200 && status < 300) return 'ok';
    if (status === 404 || status === 410) return 'not_found';
    if (status === 401 || status === 403) return 'blocked';
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    return 'client_error';
}

/**
 * @returns {Promise<{ok: boolean, status: number, category: string, url: string, finalUrl?: string, body?: any, error?: string}>}
 * `body` is parsed JSON when `json` is true, otherwise text. Never throws.
 */
export async function request(url, { json = true, accept, maxBytes = 25_000_000 } = {}) {
    const host = new URL(url).host;
    let last = { ok: false, status: 0, category: 'network_error', url };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await waitForHost(host);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: accept ?? (json ? 'application/json' : 'text/html,application/xhtml+xml') },
                redirect: 'follow',
                signal: controller.signal,
            });
            const category = categorize(res.status);
            if (category === 'ok') {
                const text = await res.text();
                if (text.length > maxBytes) return { ok: false, status: res.status, category: 'too_large', url, finalUrl: res.url };
                let body = text;
                if (json) {
                    try { body = JSON.parse(text); } catch {
                        return { ok: false, status: res.status, category: 'bad_json', url, finalUrl: res.url, error: 'Response was not valid JSON' };
                    }
                }
                return { ok: true, status: res.status, category, url, finalUrl: res.url, body };
            }
            await res.body?.cancel().catch(() => {});
            last = { ok: false, status: res.status, category, url, finalUrl: res.url };
            if (category !== 'rate_limited' && category !== 'server_error') return last;
            const retryAfter = Number(res.headers.get('retry-after'));
            if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt);
        } catch (err) {
            last = { ok: false, status: 0, category: 'network_error', url, error: err.name === 'AbortError' ? `Timed out after ${TIMEOUT_MS / 1000}s` : err.message };
            if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** attempt);
        } finally {
            clearTimeout(timer);
        }
    }
    log.debug(`Giving up on ${url}`, last);
    return last;
}
