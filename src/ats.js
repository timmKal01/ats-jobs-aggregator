// One adapter per applicant tracking system. Each has the public API URL for a board token,
// the human board URL, and a pure `normalize(body, token)` that maps the ATS's own JSON to the
// shared job shape. Field names below were read off live responses on 2026-09-26.
import {
    mentionsRemote, normalizeEmploymentType, normalizeInterval, normalizeWorkplace, toIso, unescapeHtml,
} from './normalize.js';

const enc = encodeURIComponent;

function remoteFrom(workplaceType, locations) {
    return workplaceType === 'remote' || locations.some(mentionsRemote);
}

const greenhouse = {
    name: 'greenhouse',
    // Tokens are lowercase slugs. Greenhouse's EU boards host (boards-api.eu.greenhouse.io) does not resolve publicly.
    canonicalToken: (t) => t.toLowerCase(),
    apiUrl: (t) => `https://boards-api.greenhouse.io/v1/boards/${enc(t)}/jobs?content=true&pay_transparency=true`,
    boardUrl: (t) => `https://job-boards.greenhouse.io/${enc(t)}`,
    companyName: (body) => body?.jobs?.find((j) => j.company_name)?.company_name ?? null,
    list: (body) => body?.jobs,
    normalize(job, token) {
        const location = job.location?.name?.trim() || null;
        // Multi-office roles come as one string: "San Francisco, CA • New York, NY • United States".
        const allLocations = location ? location.split(/\s*[•|;]\s+/).map((s) => s.trim()).filter(Boolean) : [];
        const workplaceType = mentionsRemote(location) ? 'remote' : null;
        // Several pay ranges are common (one per US pay zone): report the overall span in the first range's currency.
        const ranges = (job.pay_input_ranges ?? []).filter((r) => Number.isFinite(r.min_cents) || Number.isFinite(r.max_cents));
        const currency = ranges[0]?.currency_type ?? null;
        const same = ranges.filter((r) => r.currency_type === currency);
        const mins = same.map((r) => r.min_cents).filter(Number.isFinite);
        const maxs = same.map((r) => r.max_cents).filter(Number.isFinite);
        const employmentMeta = (job.metadata ?? []).find((m) => /employment|job type|time type/i.test(m?.name ?? ''));
        return {
            jobId: String(job.id),
            title: job.title?.trim(),
            department: job.departments?.[0]?.name ?? null,
            team: null,
            location,
            allLocations,
            isRemote: remoteFrom(workplaceType, allLocations),
            workplaceType,
            employmentType: normalizeEmploymentType(Array.isArray(employmentMeta?.value) ? employmentMeta.value[0] : employmentMeta?.value),
            salaryMin: mins.length ? Math.min(...mins) / 100 : null,
            salaryMax: maxs.length ? Math.max(...maxs) / 100 : null,
            salaryCurrency: currency,
            salaryInterval: normalizeInterval(same[0]?.title),
            postedAt: toIso(job.first_published),
            updatedAt: toIso(job.updated_at),
            applyUrl: job.absolute_url ?? null,
            sourceUrl: job.absolute_url ?? `${greenhouse.boardUrl(token)}/jobs/${job.id}`,
            descriptionHtml: unescapeHtml(job.content) ?? null,
        };
    },
};

function makeLever(region) {
    const apiHost = region === 'eu' ? 'api.eu.lever.co' : 'api.lever.co';
    const boardHost = region === 'eu' ? 'jobs.eu.lever.co' : 'jobs.lever.co';
    return {
        name: 'lever',
        region,
        canonicalToken: (t) => t.toLowerCase(),
        apiUrl: (t) => `https://${apiHost}/v0/postings/${enc(t)}?mode=json`,
        boardUrl: (t) => `https://${boardHost}/${enc(t)}`,
        companyName: () => null,
        list: (body) => (Array.isArray(body) ? body : null),
        normalize(job) {
            const cat = job.categories ?? {};
            const location = cat.location?.trim() || null;
            const allLocations = cat.allLocations?.length ? cat.allLocations : location ? [location] : [];
            const workplaceType = normalizeWorkplace(job.workplaceType);
            const sections = (job.lists ?? []).map((l) => `<h3>${l.text ?? ''}</h3><ul>${l.content ?? ''}</ul>`).join('');
            const salary = job.salaryRange;
            return {
                jobId: String(job.id),
                title: job.text?.trim(),
                department: cat.department ?? cat.team ?? null,
                team: cat.team ?? null,
                location,
                allLocations,
                isRemote: remoteFrom(workplaceType, allLocations),
                workplaceType,
                employmentType: normalizeEmploymentType(cat.commitment),
                salaryMin: Number.isFinite(salary?.min) ? salary.min : null,
                salaryMax: Number.isFinite(salary?.max) ? salary.max : null,
                salaryCurrency: salary?.currency ?? null,
                salaryInterval: normalizeInterval(salary?.interval),
                postedAt: toIso(job.createdAt),
                updatedAt: null,
                applyUrl: job.applyUrl ?? job.hostedUrl ?? null,
                sourceUrl: job.hostedUrl ?? null,
                descriptionHtml: [job.description, sections, job.additional].filter(Boolean).join('\n') || null,
            };
        },
    };
}

const ashby = {
    name: 'ashby',
    // Ashby tokens are case-insensitive on the API but shown with their original case in links.
    canonicalToken: (t) => t,
    apiUrl: (t) => `https://api.ashbyhq.com/posting-api/job-board/${enc(t)}?includeCompensation=true`,
    boardUrl: (t) => `https://jobs.ashbyhq.com/${enc(t)}`,
    companyName: () => null,
    list: (body) => body?.jobs?.filter((j) => j.isListed !== false),
    normalize(job) {
        const location = job.location?.trim() || null;
        const allLocations = [location, ...(job.secondaryLocations ?? []).map((l) => l.location)].filter(Boolean);
        const workplaceType = normalizeWorkplace(job.workplaceType);
        // `isRemote` is also true on many Hybrid roles, so it only decides when workplaceType is unset.
        const isRemote = workplaceType ? workplaceType === 'remote' || allLocations.some(mentionsRemote) : job.isRemote === true || allLocations.some(mentionsRemote);
        const salary = job.compensation?.summaryComponents?.find((c) => c.compensationType === 'Salary');
        return {
            jobId: String(job.id),
            title: job.title?.trim(),
            department: job.department ?? null,
            team: job.team ?? null,
            location,
            allLocations,
            isRemote,
            workplaceType,
            employmentType: normalizeEmploymentType(job.employmentType),
            salaryMin: Number.isFinite(salary?.minValue) ? salary.minValue : null,
            salaryMax: Number.isFinite(salary?.maxValue) ? salary.maxValue : null,
            salaryCurrency: salary ? salary.currencyCode ?? null : null,
            salaryInterval: normalizeInterval(salary?.interval),
            postedAt: toIso(job.publishedAt),
            updatedAt: null,
            applyUrl: job.applyUrl ?? job.jobUrl ?? null,
            sourceUrl: job.jobUrl ?? null,
            descriptionHtml: job.descriptionHtml ?? null,
        };
    },
};

const workable = {
    name: 'workable',
    // Workable account slugs are case-sensitive and lowercase: "HuggingFace" 404s, "huggingface" works.
    canonicalToken: (t) => t.toLowerCase(),
    apiUrl: (t) => `https://apply.workable.com/api/v1/widget/accounts/${enc(t)}?details=true`,
    boardUrl: (t) => `https://apply.workable.com/${enc(t)}/`,
    companyName: (body) => body?.name ?? null,
    list: (body) => body?.jobs,
    normalize(job) {
        const place = (l) => [l.city, l.region ?? l.state, l.country].filter(Boolean).join(', ');
        const location = place(job) || null;
        const allLocations = job.locations?.length ? [...new Set(job.locations.map(place).filter(Boolean))] : location ? [location] : [];
        const workplaceType = job.telecommuting ? 'remote' : null;
        return {
            jobId: String(job.shortcode),
            title: job.title?.trim(),
            department: job.department || null,
            team: null,
            location,
            allLocations,
            isRemote: remoteFrom(workplaceType, allLocations),
            workplaceType,
            employmentType: normalizeEmploymentType(job.employment_type),
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            salaryInterval: null,
            postedAt: toIso(job.published_on ?? job.created_at),
            updatedAt: null,
            applyUrl: job.application_url ?? job.url ?? null,
            sourceUrl: job.url ?? job.shortlink ?? null,
            descriptionHtml: job.description ?? null,
        };
    },
};

export const ADAPTERS = { greenhouse, lever: makeLever('global'), 'lever-eu': makeLever('eu'), ashby, workable };
/** Order tried when guessing a board from a company name. */
export const GUESS_ORDER = ['greenhouse', 'lever', 'ashby', 'workable'];
