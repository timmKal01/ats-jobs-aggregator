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

/**
 * Top departments by open roles, largest first, as a list so dataset tables and CSV exports get a
 * fixed set of columns (a {name: count} object made one column per department name).
 */
export const TOP_DEPARTMENTS = 15;
export function departmentBreakdown(jobs, limit = TOP_DEPARTMENTS) {
    const counts = {};
    for (const j of jobs) {
        const d = j.department || 'Unspecified';
        counts[d] = (counts[d] ?? 0) + 1;
    }
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([name, count]) => ({ name, count }));
}

/** Placeholder locations some boards publish ("na", "TBD") are treated as missing. */
export function cleanLocation(s) {
    const t = s == null ? '' : String(s).trim();
    return !t || /^(n\/?a|tbd|tba|none|unknown|-+)$/i.test(t) ? null : t;
}

/** Workplace type from free-text locations like "Hybrid - San Francisco" or "Remote - US". Mixed lists stay null. */
export function workplaceFromText(text) {
    const s = text ?? '';
    const remote = /\bremote\b/i.test(s);
    const hybrid = /\bhybrid\b/i.test(s);
    const onsite = /\b(on[\s-]?site|in[\s-]office)\b/i.test(s);
    if ([remote, hybrid, onsite].filter(Boolean).length !== 1) return null;
    return remote ? 'remote' : hybrid ? 'hybrid' : 'onsite';
}

/**
 * When a board posts a pay range without saying per what, the size makes it clear:
 * under 1,000 is hourly, 10,000 and up is yearly. Anything in between stays unknown.
 */
export function inferInterval(min, max) {
    const v = Number.isFinite(max) ? max : min;
    if (!Number.isFinite(v) || v <= 0) return null;
    if (v < 1000) return 'hour';
    if (v >= 10000) return 'year';
    return null;
}

/** Shared clean-up applied to every normalized job, whatever ATS it came from. */
export function finalizeJob(j) {
    const allLocations = [...new Set((j.allLocations ?? []).map(cleanLocation).filter(Boolean))];
    const location = cleanLocation(j.location) ?? allLocations[0] ?? null;
    if (location && !allLocations.length) allLocations.push(location);
    const workplaceType = j.workplaceType ?? workplaceFromText([location, ...allLocations].join(' | '));
    const hasSalary = Number.isFinite(j.salaryMin) || Number.isFinite(j.salaryMax);
    return {
        ...j,
        location,
        allLocations,
        workplaceType,
        isRemote: Boolean(j.isRemote) || workplaceType === 'remote',
        salaryInterval: j.salaryInterval ?? (hasSalary ? inferInterval(j.salaryMin, j.salaryMax) : null),
    };
}

export const byNewest = (a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? '') || String(a.jobId).localeCompare(String(b.jobId));
