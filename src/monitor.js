// Monitor mode: remember each board's open job IDs in a named key-value store (the default
// store is fresh on every run) and report only jobs that opened or closed since last time.
import { Actor } from 'apify';

const KEPT_FIELDS = ['title', 'department', 'team', 'location', 'isRemote', 'employmentType', 'postedAt', 'applyUrl', 'sourceUrl'];

/** Store keys allow [a-zA-Z0-9!-_.'()] only. */
export const stateKey = (ats, token) => `board-${ats}-${token}`.replace(/[^a-zA-Z0-9!\-_.'()]/g, '_').slice(0, 250);

export function snapshot(jobs) {
    return Object.fromEntries(jobs.map((j) => [j.jobId, Object.fromEntries(KEPT_FIELDS.map((k) => [k, j[k] ?? null]))]));
}

/**
 * @param jobs current (already filtered) job rows for one board
 * @param previous snapshot from the last run, or null on the first run
 * @returns {{opened: object[], closed: object[]}} closed entries carry the fields remembered from last time
 */
export function diffJobs(jobs, previous) {
    if (!previous) return { opened: jobs, closed: [] };
    const current = new Set(jobs.map((j) => j.jobId));
    const opened = jobs.filter((j) => !previous[j.jobId]);
    const closed = Object.entries(previous).filter(([id]) => !current.has(id)).map(([jobId, fields]) => ({ jobId, ...fields }));
    return { opened, closed };
}

export async function openMonitorStore(name) {
    return Actor.openKeyValueStore(name);
}
