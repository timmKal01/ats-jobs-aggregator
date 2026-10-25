// Turns one `companies` entry into a verified job board: explicit board, a link found on the
// company's own site (homepage, careers links, /careers, /jobs), or a token guessed from its name.
import { log } from 'apify';
import { ADAPTERS, GUESS_ORDER, workdayParts } from './ats.js';
import { request } from './fetch.js';
import { careerLinks, findAtsInHtml, hasGreenhouseJobIds, isAllowed, parseRobots, slugCandidates, verifyGuess } from './detect.js';

const MAX_SITE_PAGES = 5;
const MAX_CANDIDATES_PER_PAGE = 3;
const WORKDAY_PAGE_SIZE = 20;
// Workday reports at most 2,000 jobs for one search, however many a site has.
const WORKDAY_MAX_JOBS = 2000;

/** @returns {Promise<{found: boolean, ats: string, token: string, jobs?: object[], companyName?: string|null, apiUrl: string, category?: string}>} */
export async function fetchBoard(atsKey, rawToken) {
    const adapter = ADAPTERS[atsKey];
    const token = adapter.canonicalToken(rawToken);
    if (atsKey === 'workday') return fetchWorkdayBoard(token);
    const apiUrl = adapter.apiUrl(token);
    const res = await request(apiUrl);
    if (!res.ok) return { found: false, ats: atsKey, token, apiUrl, category: res.category, status: res.status, error: res.error };
    const jobs = adapter.list(res.body);
    if (!Array.isArray(jobs)) return { found: false, ats: atsKey, token, apiUrl, category: 'unexpected_shape' };
    return { found: true, ats: atsKey, token, apiUrl, jobs, companyName: adapter.companyName(res.body, token) };
}

/**
 * Every job a Workday career site lists, 20 a page, without descriptions. These are career pages rather than a
 * published API, so the site's robots.txt is checked first.
 */
async function fetchWorkdayBoard(token) {
    const adapter = ADAPTERS.workday;
    if (!workdayParts(token)) return { found: false, ats: 'workday', token, apiUrl: null, category: 'invalid_token' };
    const apiUrl = adapter.apiUrl(token);
    const { origin, pathname } = new URL(apiUrl);
    const robots = await request(`${origin}/robots.txt`, { json: false, accept: 'text/plain' });
    if (!isAllowed(robots.ok ? parseRobots(robots.body) : [], pathname)) {
        return { found: false, ats: 'workday', token, apiUrl, category: 'robots_disallowed' };
    }
    const jobs = [];
    const seen = new Set();
    let total = null;
    for (let offset = 0; total === null || offset < Math.min(total, WORKDAY_MAX_JOBS); offset += WORKDAY_PAGE_SIZE) {
        const res = await request(apiUrl, { post: { appliedFacets: {}, limit: WORKDAY_PAGE_SIZE, offset, searchText: '' } });
        if (!res.ok) {
            // An unknown site name answers 4xx rather than 404.
            if (offset === 0) return { found: false, ats: 'workday', token, apiUrl, category: res.category === 'client_error' ? 'not_found' : res.category, status: res.status, error: res.error };
            log.warning(`Workday list for ${token} stopped after ${jobs.length} of ${total} jobs: ${res.status || res.category}`);
            break;
        }
        // Only the first page carries the total, and a page past the end comes back as the first page again,
        // so the loop stops at the total rather than at an empty page.
        if (total === null) total = Number(res.body?.total) || 0;
        const page = adapter.list(res.body) ?? [];
        for (const j of page) if (j?.externalPath && !seen.has(j.externalPath)) { seen.add(j.externalPath); jobs.push(j); }
        if (!page.length) break;
    }
    return { found: true, ats: 'workday', token, apiUrl, jobs, companyName: adapter.companyName(null, token) };
}

/** The full posting behind a Workday list item, or null if it can't be read. */
export async function fetchJobDetail(board, job) {
    const adapter = ADAPTERS[board.ats];
    if (!adapter.detailUrl || !job.detailPath) return null;
    const res = await request(adapter.detailUrl(board.token, job.detailPath));
    return res.ok && res.body?.jobPostingInfo ? res.body : null;
}

async function guessFromSlugs(slugs, hints = []) {
    const order = [...new Set([...hints, ...GUESS_ORDER])];
    for (const slug of slugs.slice(0, 2)) {
        const found = [];
        for (const ats of order) {
            const board = await fetchBoard(ats, slug);
            if (!board.found) continue;
            // A guessed token can belong to a different company ("example" on Greenhouse is "Democorp").
            const check = verifyGuess(board, slug);
            if (check === 'mismatch') {
                log.info(`Ignoring ${ats} board "${slug}": it belongs to "${board.companyName}"`);
                continue;
            }
            // An empty board is weak evidence even when the name matches.
            found.push({ ...board, confidence: check === 'confirmed' && board.jobs.length ? 'medium' : 'low' });
        }
        // Prefer a board whose owner is confirmed, then the one with more jobs (a stale empty board
        // on one ATS shouldn't beat the live board on another).
        found.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'medium' ? -1 : 1) || b.jobs.length - a.jobs.length);
        if (found.length) return { ...found[0], alsoFoundOn: found.slice(1).map((b) => b.ats) };
    }
    return null;
}

/**
 * @param parsed output of parseCompanyInput
 * @returns {Promise<{status: string, board?: object, method?: string, confidence?: string, pagesChecked: object[], note?: string}>}
 */
export async function resolveCompany(parsed) {
    const pagesChecked = [];
    if (parsed.kind === 'board') {
        const board = await fetchBoard(parsed.ats, parsed.token);
        if (board.found) return { status: 'ok', board, method: parsed.method, confidence: 'high', pagesChecked };
        return { status: board.category === 'not_found' ? 'board_not_found' : 'error', board, method: parsed.method, pagesChecked, note: `${parsed.ats} board "${parsed.token}" returned ${board.status || board.category}` };
    }
    if (parsed.kind === 'name') {
        const guess = await guessFromSlugs(slugCandidates({ name: parsed.name }));
        return guess ? { status: 'ok', board: guess, method: 'token_lookup', confidence: guess.confidence, pagesChecked } : { status: 'ats_not_found', pagesChecked };
    }
    if (parsed.kind !== 'site') return { status: 'invalid_input', pagesChecked, note: 'Not a domain, URL, board token or company name' };

    const robots = new Map();
    const rulesFor = async (origin) => {
        if (!robots.has(origin)) {
            const res = await request(`${origin}/robots.txt`, { json: false, accept: 'text/plain' });
            robots.set(origin, res.ok ? parseRobots(res.body) : []);
        }
        return robots.get(origin);
    };

    const queue = [];
    const seen = new Set();
    const enqueue = (url, kind) => {
        const key = url.replace(/\/$/, '');
        if (seen.has(key) || queue.length >= MAX_SITE_PAGES) return;
        seen.add(key);
        queue.push({ url, kind });
    };
    if (new URL(parsed.url).pathname !== '/') enqueue(parsed.url, 'input_page_link');
    enqueue(`${parsed.origin}/`, 'homepage_link');
    enqueue(`${parsed.origin}/careers`, 'careers_page_link');
    enqueue(`${parsed.origin}/jobs`, 'careers_page_link');

    let greenhouseHint = false;
    for (let i = 0; i < queue.length; i++) {
        const { url, kind } = queue[i];
        const { origin, pathname, search } = new URL(url);
        if (!isAllowed(await rulesFor(origin), pathname + search)) {
            pagesChecked.push({ url, result: 'robots_disallowed' });
            continue;
        }
        const res = await request(url, { json: false, maxBytes: 8_000_000 });
        // A redirect straight to an ATS board is itself the answer (e.g. huggingface.co/careers).
        const candidates = [...findAtsInHtml(res.finalUrl ?? ''), ...(res.ok ? findAtsInHtml(res.body) : [])];
        pagesChecked.push({ url, result: res.ok ? `ok (${candidates.length} ATS link${candidates.length === 1 ? '' : 's'})` : res.category });
        if (res.ok) {
            greenhouseHint ||= hasGreenhouseJobIds(res.body);
            for (const c of candidates.slice(0, MAX_CANDIDATES_PER_PAGE)) {
                const board = await fetchBoard(c.ats, c.token);
                if (board.found) return { status: 'ok', board, method: kind, confidence: 'high', pagesChecked };
                log.debug(`Linked ${c.ats} board "${c.token}" did not resolve`, { category: board.category });
            }
            // Careers often live on a subdomain (careers.example.com) that only the homepage links to.
            if (kind === 'homepage_link') for (const link of careerLinks(res.body, res.finalUrl ?? url)) enqueue(link, 'careers_page_link');
        }
    }

    const guess = await guessFromSlugs(slugCandidates({ host: parsed.host }), greenhouseHint ? ['greenhouse'] : []);
    if (guess) return { status: 'ok', board: guess, method: 'slug_guess', confidence: guess.confidence, pagesChecked };
    return { status: 'ats_not_found', pagesChecked };
}
