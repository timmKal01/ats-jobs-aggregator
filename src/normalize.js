// Pure helpers shared by the ATS normalizers, plus the job filters and the company summary.

const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
    rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
    eacute: 'é', egrave: 'è', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß', ccedil: 'ç', ntilde: 'ñ', euro: '€', pound: '£',
};

export function decodeEntities(s) {
    if (!s) return s;
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
        if (code[0] === '#') {
            const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? m;
    });
}

/** HTML to readable plain text: block elements become line breaks, tags go, entities decode. */
export function stripHtml(html) {
    if (!html) return null;
    const text = decodeEntities(
        html
            .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n- ')
            .replace(/<\/(p|div|h[1-6]|ul|ol|tr|section)>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
    );
    return text.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim() || null;
}

/** Greenhouse double-escapes its `content` field (`&lt;p&gt;`); decode once to get real HTML. */
export function unescapeHtml(s) {
    return s && /&lt;[a-z/]/i.test(s) ? decodeEntities(s) : s;
}

const EMPLOYMENT_TYPES = [
    [/^(full[\s_-]?time|fulltime|permanent|regular)$/i, 'Full-time'],
    [/^(part[\s_-]?time|parttime)$/i, 'Part-time'],
    [/^(contract|contractor|freelance)$/i, 'Contract'],
    [/^(intern|internship)$/i, 'Internship'],
    [/^(temporary|temp|fixed[\s_-]?term)$/i, 'Temporary'],
];

export function normalizeEmploymentType(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    for (const [re, label] of EMPLOYMENT_TYPES) if (re.test(s)) return label;
    return s;
}

/** Map each ATS's workplace wording to remote | hybrid | onsite, or null when unstated. */
export function normalizeWorkplace(raw) {
    if (!raw) return null;
    const s = String(raw).toLowerCase().replace(/[\s_-]/g, '');
    if (s === 'remote') return 'remote';
    if (s === 'hybrid') return 'hybrid';
    if (s === 'onsite' || s === 'inoffice' || s === 'office') return 'onsite';
    return null;
}

export const mentionsRemote = (s) => /\bremote\b/i.test(s ?? '');

export function toIso(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const INTERVALS = [
    [/hour/i, 'hour'], [/day|daily/i, 'day'], [/week/i, 'week'], [/month/i, 'month'], [/year|annual|salary/i, 'year'],
];
export function normalizeInterval(raw) {
    if (!raw) return null;
    for (const [re, label] of INTERVALS) if (re.test(raw)) return label;
    return null;
}

const lower = (arr) => (arr ?? []).map((s) => String(s).trim().toLowerCase()).filter(Boolean);

/**
 * Filters apply to each job row. Text filters are case-insensitive "contains any".
 * postedWithinDays drops jobs with no posting date, since they can't be shown to qualify.
 */
export function makeJobFilter({ keywords, locations, remoteOnly, departments, postedWithinDays } = {}, now = Date.now()) {
    const kw = lower(keywords);
    const locs = lower(locations);
    const deps = lower(departments);
    const cutoff = postedWithinDays > 0 ? now - postedWithinDays * 86400e3 : null;
    return (job) => {
        if (kw.length && !kw.some((k) => job.title?.toLowerCase().includes(k))) return false;
        if (locs.length) {
            const hay = [job.location, ...(job.allLocations ?? [])].filter(Boolean).join(' | ').toLowerCase();
            const remoteWanted = locs.includes('remote') && job.isRemote;
            if (!remoteWanted && !locs.some((l) => hay.includes(l))) return false;
        }
        if (remoteOnly && !job.isRemote) return false;
        if (deps.length && !deps.some((d) => job.department?.toLowerCase().includes(d) || job.team?.toLowerCase().includes(d))) return false;
        if (cutoff !== null) {
            const t = Date.parse(job.postedAt ?? '');
            if (!Number.isFinite(t) || t < cutoff) return false;
        }
        return true;
    };
}

/** Department -> open role count, largest first. Jobs with no department count as "Unspecified". */
export function departmentBreakdown(jobs) {
    const counts = {};
    for (const j of jobs) {
        const d = j.department || 'Unspecified';
        counts[d] = (counts[d] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export const byNewest = (a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') || String(a.jobId).localeCompare(String(b.jobId));
