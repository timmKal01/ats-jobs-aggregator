// Pure ATS detection helpers: parse what the user typed, pull board tokens out of URLs and
// careers-page HTML, guess tokens from a domain, and read robots.txt.

const ATS_NAMES = new Set(['greenhouse', 'lever', 'ashby', 'workable']);
// Path segments and subdomains on ATS hosts that are never a company's board token.
const GREENHOUSE_RESERVED = new Set(['embed', 'v1', 'jobs', 'static', 'assets', 'api']);
const WORKABLE_PATH_RESERVED = new Set(['j', 'api', 'static', 'assets', 'careers', 'resources']);
const WORKABLE_SUB_RESERVED = new Set(['www', 'apply', 'jobs', 'help', 'resources', 'api', 'static', 'careers-page', 'marketing', 'blog']);

const cleanToken = (t) => {
    if (!t) return null;
    const s = decodeURIComponent(t).trim();
    return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(s) ? s.replace(/\.+$/, '') : null;
};

/** @returns {{ats: string, token: string} | null} */
export function extractAtsFromUrl(raw) {
    let url;
    try { url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
    const host = url.hostname.toLowerCase();
    const seg = url.pathname.split('/').filter(Boolean);

    if (host.endsWith('greenhouse.io')) {
        if (host.startsWith('boards-api.')) {
            const i = seg.indexOf('boards');
            const token = cleanToken(i >= 0 ? seg[i + 1] : null);
            return token ? { ats: 'greenhouse', token: token.toLowerCase() } : null;
        }
        if (!/^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(host) && !/^(app|api)\.greenhouse\.io$/.test(host)) return null;
        const forParam = cleanToken(url.searchParams.get('for'));
        if (forParam) return { ats: 'greenhouse', token: forParam.toLowerCase() };
        if (host === 'app.greenhouse.io' || host === 'api.greenhouse.io') return null;
        const token = cleanToken(seg[0]);
        return token && !GREENHOUSE_RESERVED.has(token.toLowerCase()) ? { ats: 'greenhouse', token: token.toLowerCase() } : null;
    }
    if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
        const token = cleanToken(seg[0]);
        return token ? { ats: host === 'jobs.eu.lever.co' ? 'lever-eu' : 'lever', token: token.toLowerCase() } : null;
    }
    if (host === 'api.lever.co' || host === 'api.eu.lever.co') {
        const i = seg.indexOf('postings');
        const token = cleanToken(i >= 0 ? seg[i + 1] : null);
        return token ? { ats: host === 'api.eu.lever.co' ? 'lever-eu' : 'lever', token: token.toLowerCase() } : null;
    }
    if (host === 'jobs.ashbyhq.com') {
        const token = cleanToken(seg[0]);
        return token && token.toLowerCase() !== 'api' ? { ats: 'ashby', token } : null;
    }
    if (host === 'api.ashbyhq.com') {
        const i = seg.indexOf('job-board');
        const token = cleanToken(i >= 0 ? seg[i + 1] : null);
        return token ? { ats: 'ashby', token } : null;
    }
    if (host === 'apply.workable.com') {
        if (seg[0] === 'api') {
            const i = seg.indexOf('accounts');
            const token = cleanToken(i >= 0 ? seg[i + 1] : null);
            return token ? { ats: 'workable', token: token.toLowerCase() } : null;
        }
        const token = cleanToken(seg[0]);
        return token && !WORKABLE_PATH_RESERVED.has(token.toLowerCase()) ? { ats: 'workable', token: token.toLowerCase() } : null;
    }
    const wk = host.match(/^([a-z0-9-]+)\.workable\.com$/);
    if (wk && !WORKABLE_SUB_RESERVED.has(wk[1])) return { ats: 'workable', token: wk[1] };
    return null;
}

const ATS_URL_RE = /(?:https?:)?\/\/(?:[a-z0-9-]+\.)*(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)(?:\/[^\s"'<>)\\`]*)?/gi;

/**
 * Every ATS board referenced in a page (links, iframes, embed scripts, JSON blobs), most-referenced first.
 * @returns {{ats: string, token: string, count: number}[]}
 */
export function findAtsInHtml(html) {
    if (!html) return [];
    const text = html.replace(/\\\//g, '/').replace(/&amp;/g, '&');
    const counts = new Map();
    for (const m of text.matchAll(ATS_URL_RE)) {
        const hit = extractAtsFromUrl(m[0].startsWith('//') ? `https:${m[0]}` : m[0]);
        if (!hit) continue;
        const key = `${hit.ats}:${hit.token.toLowerCase()}`;
        const prev = counts.get(key);
        counts.set(key, { ...hit, token: prev?.token ?? hit.token, count: (prev?.count ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
}

/** Stripe-style custom careers pages link jobs as ?gh_jid=123 with no board token. */
export const hasGreenhouseJobIds = (html) => /[?&](?:amp;)?gh_jid=\d+/.test(html ?? '');

const TWO_PART_SUFFIXES = new Set(['co.uk', 'org.uk', 'ac.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'com.br', 'co.in', 'co.za', 'com.mx', 'com.sg', 'co.ke', 'com.tr', 'co.il']);

/** "careers.example.co.uk" -> "example.co.uk" */
export function registrableDomain(host) {
    const labels = host.toLowerCase().replace(/\.$/, '').split('.');
    if (labels.length <= 2) return labels.join('.');
    const lastTwo = labels.slice(-2).join('.');
    return labels.slice(TWO_PART_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

/** Likely board tokens for a company: the brand label of its domain, or a slugged name. */
export function slugCandidates({ host, name }) {
    const out = [];
    if (host) {
        const brand = registrableDomain(host).split('.')[0];
        out.push(brand, brand.replace(/-/g, ''));
    }
    if (name) {
        const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and');
        out.push(base.replace(/[^a-z0-9]+/g, ''), base.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
    return [...new Set(out.filter((s) => s && /^[a-z0-9][a-z0-9-]*$/.test(s)))];
}

const squash = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

/**
 * Does a board found by guessing a token really belong to that company?
 * - Boards that name their company (Greenhouse, Workable): the name must match the token.
 * - Boards that don't (Lever, Ashby): the company must be mentioned in its own job text, URLs excluded
 *   (every Ashby job URL contains the token, which proves nothing).
 * @returns {'confirmed' | 'unverified' | 'mismatch'}
 */
export function verifyGuess(board, slug) {
    const want = squash(slug);
    if (!want) return 'unverified';
    if (board.companyName) {
        const have = squash(board.companyName);
        return have && (have.includes(want) || want.includes(have)) ? 'confirmed' : 'mismatch';
    }
    const text = squash(JSON.stringify((board.jobs ?? []).slice(0, 10)).replace(/https?:\\?\/\\?\/[^"\s]+/g, ' '));
    return text.includes(want) ? 'confirmed' : 'unverified';
}

/**
 * Classifies one entry of the `companies` input.
 * - "greenhouse:stripe" -> explicit board
 * - an ATS URL          -> that board
 * - a domain or URL     -> website to inspect
 * - anything else       -> a company name to try as a board token
 */
export function parseCompanyInput(raw) {
    const input = String(raw ?? '').trim();
    if (!input) return null;
    const explicit = input.match(/^(greenhouse|lever|lever-eu|ashby|workable)\s*:\s*(.+)$/i);
    if (explicit && !explicit[2].startsWith('//')) {
        const ats = explicit[1].toLowerCase();
        const token = cleanToken(explicit[2]);
        if (token) return { input, kind: 'board', ats, token: ats === 'ashby' ? token : token.toLowerCase(), method: 'input_token' };
    }
    const fromUrl = extractAtsFromUrl(input);
    if (fromUrl && /[./]/.test(input)) return { input, kind: 'board', ...fromUrl, method: 'input_url' };
    if (/^https?:\/\//i.test(input) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/i.test(input)) {
        let url;
        try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { return { input, kind: 'invalid' }; }
        return { input, kind: 'site', url: url.href, host: url.hostname.toLowerCase(), origin: url.origin };
    }
    return { input, kind: 'name', name: input };
}

export const isAtsName = (s) => ATS_NAMES.has(s);

/**
 * Minimal robots.txt reader for the `*` group (this actor has no named group anywhere).
 * Longest matching rule wins; Allow wins ties. Supports `*` and `$` in paths.
 */
export function parseRobots(txt) {
    const groups = [];
    let current = null;
    let lastWasAgent = false;
    for (const rawLine of String(txt ?? '').split(/\r?\n/)) {
        const line = rawLine.replace(/#.*/, '').trim();
        const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
        if (!m) continue;
        const key = m[1].toLowerCase();
        const value = m[2].trim();
        if (key === 'user-agent') {
            if (!lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
            current.agents.push(value.toLowerCase());
            lastWasAgent = true;
            continue;
        }
        lastWasAgent = false;
        if (!current) continue;
        if (key === 'allow' || key === 'disallow') current.rules.push({ allow: key === 'allow', path: value });
    }
    return groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
}

function ruleRegex(p) {
    const anchored = p.endsWith('$');
    const body = (anchored ? p.slice(0, -1) : p).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export function isAllowed(rules, path) {
    let best = null;
    for (const r of rules) {
        if (!r.path) continue; // "Disallow:" with no path allows everything
        if (!ruleRegex(r.path).test(path)) continue;
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
    }
    return best ? best.allow : true;
}

/** Up to `limit` same-site links that look like a careers page (e.g. careers.example.com). */
export function careerLinks(html, baseUrl, limit = 2) {
    const base = new URL(baseUrl);
    const site = registrableDomain(base.hostname);
    const out = [];
    for (const m of String(html ?? '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
        const href = m[1].replace(/&amp;/g, '&');
        const label = m[2].replace(/<[^>]+>/g, ' ');
        if (!/career|jobs|join[\s-]*us|hiring|open[\s-]*(roles|positions)|work[\s-]*with[\s-]*us/i.test(`${href} ${label}`)) continue;
        let u;
        try { u = new URL(href, base); } catch { continue; }
        if (!/^https?:$/.test(u.protocol) || registrableDomain(u.hostname) !== site) continue;
        u.hash = '';
        if (u.href === base.href || out.includes(u.href)) continue;
        out.push(u.href);
        if (out.length >= limit) break;
    }
    return out;
}
