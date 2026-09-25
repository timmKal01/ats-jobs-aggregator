import { Actor, log } from 'apify';
import { ADAPTERS } from './ats.js';
import { parseCompanyInput } from './detect.js';
import { resolveCompany } from './resolve.js';
import { byNewest, departmentBreakdown, makeJobFilter, stripHtml } from './normalize.js';
import { diffJobs, openMonitorStore, snapshot, stateKey } from './monitor.js';

await Actor.init();

/** Must match the event name in this Actor's pay-per-event pricing. Company summary rows are free. */
const JOB_EVENT = 'job-listing';
// Verified 2026-09-26: Greenhouse (careers page link), Lever (careers page link), Ashby (careers
// page link), Workable (homepage link), and a bare name resolved by trying each ATS.
const DEFAULT_COMPANIES = ['figma.com', 'palantir.com', 'linear.app', 'huggingface.co', 'notion'];
const CONCURRENCY = 3;
const prettyToken = (t) => t.replace(/[-_]+/g, ' ').replace(/[a-z]/g, (c) => c.toUpperCase());

const input = (await Actor.getInput()) ?? {};
const emptyForm = !input.companies?.length;
const {
    companies = DEFAULT_COMPANIES,
    keywords,
    locations,
    remoteOnly = false,
    departments,
    postedWithinDays,
    maxItems = 1000,
    maxJobsPerCompany,
    includeDescriptionHtml = false,
    includeCompanyRows = true,
    mode = 'snapshot',
    monitorStoreName = 'ats-jobs-aggregator-monitor',
} = input;
// An empty form (first click, Apify's daily health check) gets a small sample, not every job.
const perCompanyLimit = maxJobsPerCompany > 0 ? maxJobsPerCompany : emptyForm ? 20 : Infinity;
const companyList = (emptyForm ? DEFAULT_COMPANIES : companies).map((c) => String(c).trim()).filter(Boolean);
if (emptyForm) log.info(`No companies given, using the example list: ${companyList.join(', ')}`);

const scrapedAt = new Date().toISOString();
const keep = makeJobFilter({ keywords, locations, remoteOnly, departments, postedWithinDays });
const monitorStore = mode === 'monitor' ? await openMonitorStore(monitorStoreName) : null;

async function processCompany(raw) {
    const parsed = parseCompanyInput(raw);
    if (!parsed) return null;
    const resolved = await resolveCompany(parsed).catch((err) => ({ status: 'error', pagesChecked: [], note: err.message }));
    const board = resolved.board;
    const base = {
        // Greenhouse and Workable report the company name; for Lever and Ashby the board token is the best available label.
        company: board?.companyName ?? (parsed.kind === 'name' ? parsed.name : board?.token ? prettyToken(board.token) : parsed.host ?? parsed.input),
        companyInput: parsed.input,
    };
    if (resolved.status !== 'ok') return { base, resolved, jobs: [], allJobs: [] };

    const adapter = ADAPTERS[board.ats];
    const allJobs = [];
    for (const raw of board.jobs) {
        try {
            const j = adapter.normalize(raw, board.token);
            if (!j.jobId || !j.title) throw new Error('missing id or title');
            allJobs.push(j);
        } catch (err) {
            log.warning(`Skipping a malformed ${board.ats} job for ${parsed.input}`, { error: err.message, id: raw?.id ?? raw?.shortcode });
        }
    }
    return { base, resolved, allJobs, jobs: allJobs.filter(keep).sort(byNewest) };
}

// Small worker pool; the HTTP layer already spaces requests per host.
const results = new Array(companyList.length);
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, companyList.length) }, async () => {
    while (cursor < companyList.length) {
        const i = cursor++;
        results[i] = await processCompany(companyList[i]);
        const r = results[i];
        if (r) log.info(`${companyList[i]}: ${r.resolved.status === 'ok' ? `${r.resolved.board.ats}/${r.resolved.board.token} via ${r.resolved.method}, ${r.allJobs.length} open, ${r.jobs.length} match filters` : r.resolved.status}`);
    }
}));

let jobRowsLeft = Math.max(0, maxItems);
let charged = 0;
const atsLabel = (ats) => (ats === 'lever-eu' ? 'lever' : ats);

for (const r of results) {
    if (!r) continue;
    const { base, resolved } = r;
    const board = resolved.board;
    let jobs = r.jobs;
    let closed = [];
    let isFirstRun = false;

    if (monitorStore && resolved.status === 'ok') {
        const key = stateKey(board.ats, board.token);
        const previous = await monitorStore.getValue(key);
        isFirstRun = !previous;
        ({ opened: jobs, closed } = diffJobs(r.jobs, previous?.jobs ?? null));
        await monitorStore.setValue(key, { savedAt: scrapedAt, jobs: snapshot(r.jobs) });
    }

    const toRow = (j, changeType) => ({
        rowType: 'job',
        ...(monitorStore ? { changeType } : {}),
        company: base.company,
        companyInput: base.companyInput,
        ats: atsLabel(board.ats),
        atsToken: board.token,
        jobId: j.jobId,
        title: j.title ?? null,
        department: j.department ?? null,
        team: j.team ?? null,
        location: j.location ?? null,
        allLocations: j.allLocations ?? (j.location ? [j.location] : []),
        isRemote: j.isRemote ?? false,
        workplaceType: j.workplaceType ?? null,
        employmentType: j.employmentType ?? null,
        salaryMin: j.salaryMin ?? null,
        salaryMax: j.salaryMax ?? null,
        salaryCurrency: j.salaryCurrency ?? null,
        salaryInterval: j.salaryInterval ?? null,
        postedAt: j.postedAt ?? null,
        updatedAt: j.updatedAt ?? null,
        applyUrl: j.applyUrl ?? null,
        descriptionText: stripHtml(j.descriptionHtml) ?? null,
        ...(includeDescriptionHtml ? { descriptionHtml: j.descriptionHtml ?? null } : {}),
        sourceUrl: j.sourceUrl ?? ADAPTERS[board.ats].boardUrl(board.token),
        scrapedAt,
    });
    const jobRows = [
        ...jobs.map((j) => toRow(j, 'new')),
        ...closed.map((j) => ({ ...toRow(j, 'closed'), descriptionText: null })),
    ].slice(0, Math.min(perCompanyLimit, jobRowsLeft));
    jobRowsLeft -= jobRows.length;

    if (includeCompanyRows) {
        await Actor.pushData({
            rowType: 'company',
            company: base.company,
            companyInput: base.companyInput,
            status: resolved.status,
            detectedAts: board && resolved.status === 'ok' ? atsLabel(board.ats) : null,
            atsToken: resolved.status === 'ok' ? board.token : null,
            detectionMethod: resolved.status === 'ok' ? resolved.method : null,
            // high: linked from the company's own site or given directly; medium: guessed and the board names the company; low: guessed, owner not confirmable.
            detectionConfidence: resolved.status === 'ok' ? resolved.confidence : null,
            openRoles: r.allJobs.length,
            matchingRoles: r.jobs.length,
            ...(monitorStore ? { newRoles: isFirstRun ? null : jobs.length, closedRoles: isFirstRun ? null : closed.length, isFirstRun } : {}),
            returnedRoles: jobRows.length,
            departments: departmentBreakdown(r.allJobs),
            remoteRoles: r.allJobs.filter((j) => j.isRemote).length,
            rolesWithSalary: r.allJobs.filter((j) => j.salaryMin !== null || j.salaryMax !== null).length,
            boardUrl: resolved.status === 'ok' ? ADAPTERS[board.ats].boardUrl(board.token) : null,
            pagesChecked: resolved.pagesChecked,
            note: resolved.note ?? (resolved.status === 'ats_not_found' ? 'No Greenhouse, Lever, Ashby or Workable board found on the site or under its name. Try passing the board URL directly.' : null),
            sourceUrl: resolved.status === 'ok' ? board.apiUrl : parseCompanyInput(base.companyInput)?.url ?? null,
            scrapedAt,
        });
    }
    if (jobRows.length) {
        await Actor.pushData(jobRows);
        await Actor.charge({ eventName: JOB_EVENT, count: jobRows.length });
        charged += jobRows.length;
    }
    if (monitorStore && resolved.status === 'ok') {
        log.info(isFirstRun
            ? `Monitor: first run for ${board.ats}/${board.token}, saved ${r.jobs.length} job(s) as the baseline; all are reported as new this time.`
            : `Monitor: ${board.ats}/${board.token} has ${jobs.length} new and ${closed.length} closed job(s).`);
    }
}

const failed = results.filter((r) => r && r.resolved.status !== 'ok').length;
log.info(`Done: ${charged} job row(s) from ${results.filter(Boolean).length - failed} board(s). ${failed} company(ies) without a usable board.`);
if (jobRowsLeft === 0 && maxItems > 0) log.info(`Stopped at maxItems (${maxItems}).`);

await Actor.exit();
