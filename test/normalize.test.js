import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    cleanLocation, decodeEntities, departmentBreakdown, finalizeJob, inferInterval, workplaceFromText, makeJobFilter, normalizeEmploymentType, normalizeInterval, relativePostedDate, stripHtml, toIso,
} from '../src/normalize.js';
import { diffJobs, snapshot, stateKey } from '../src/monitor.js';

test('html to text keeps structure and decodes entities', () => {
    assert.equal(stripHtml('<h2>About</h2><p>We&rsquo;re <b>hiring</b>&nbsp;now</p><ul><li>Go</li><li>Rust</li></ul>'), 'About\nWe’re hiring now\n\n- Go\n- Rust');
    assert.equal(decodeEntities('&#8364;80,000 &amp; &#x1F600;'), '€80,000 & 😀');
    assert.equal(stripHtml(''), null);
});

test('employment type and pay interval wording', () => {
    assert.equal(normalizeEmploymentType('FullTime'), 'Full-time');
    assert.equal(normalizeEmploymentType('Fixed-Term'), 'Temporary');
    assert.equal(normalizeEmploymentType('Intern'), 'Internship');
    assert.equal(normalizeEmploymentType('Seasonal'), 'Seasonal');
    assert.equal(normalizeInterval('per-hour-wage'), 'hour');
    assert.equal(normalizeInterval('1 YEAR'), 'year');
    assert.equal(normalizeInterval('Annual Base Salary Range:'), 'year');
    assert.equal(normalizeInterval('US Zone 2'), null);
    assert.equal(toIso(1786469891368), '2026-08-11T17:38:11.368Z');
    assert.equal(toIso('not a date'), null);
});

const JOBS = [
    { jobId: '1', title: 'Senior Software Engineer', department: 'Engineering', location: 'London, UK', isRemote: false, postedAt: '2026-09-20T00:00:00.000Z' },
    { jobId: '2', title: 'Account Executive', department: 'Sales', team: 'EMEA', location: 'Remote - Europe', isRemote: true, postedAt: '2026-08-01T00:00:00.000Z' },
    { jobId: '3', title: 'Data Engineer', department: null, location: 'New York', allLocations: ['New York', 'San Francisco'], isRemote: false, postedAt: null },
];
const NOW = Date.parse('2026-09-26T00:00:00Z');
const ids = (f) => JOBS.filter(makeJobFilter(f, NOW)).map((j) => j.jobId);

test('filters: keywords, locations, remote, departments, posted within', () => {
    assert.deepEqual(ids({}), ['1', '2', '3']);
    assert.deepEqual(ids({ keywords: ['ENGINEER'] }), ['1', '3']);
    assert.deepEqual(ids({ locations: ['san francisco'] }), ['3']);
    assert.deepEqual(ids({ locations: ['remote'] }), ['2']);
    assert.deepEqual(ids({ remoteOnly: true }), ['2']);
    assert.deepEqual(ids({ departments: ['emea'] }), ['2']);
    assert.deepEqual(ids({ postedWithinDays: 14 }), ['1']);
    assert.deepEqual(ids({ keywords: ['engineer'], locations: ['london'] }), ['1']);
});

test('department breakdown counts, largest first', () => {
    assert.deepEqual(departmentBreakdown([...JOBS, { department: 'Sales' }]), [
        { name: 'Sales', count: 2 }, { name: 'Engineering', count: 1 }, { name: 'Unspecified', count: 1 },
    ]);
    assert.equal(departmentBreakdown([...JOBS, { department: 'Sales' }], 1).length, 1);
});

test('monitor: new and closed jobs against the last snapshot', () => {
    const previous = snapshot([JOBS[0], JOBS[1]]);
    const { opened, closed } = diffJobs([JOBS[0], JOBS[2]], previous);
    assert.deepEqual(opened.map((j) => j.jobId), ['3']);
    assert.deepEqual(closed.map((j) => [j.jobId, j.title]), [['2', 'Account Executive']]);
    assert.equal(diffJobs(JOBS, null).opened.length, 3);
    assert.equal(stateKey('lever', 'Pal/antir'), 'board-lever-Pal_antir');
});

test('finalizeJob: placeholder locations, workplace from text, inferred pay interval', () => {
    assert.equal(cleanLocation('na'), null);
    assert.equal(cleanLocation(' N/A '), null);
    assert.equal(cleanLocation('Nairobi'), 'Nairobi');
    assert.equal(workplaceFromText('Hybrid - San Francisco, New York City, Austin'), 'hybrid');
    assert.equal(workplaceFromText('Remote - United States'), 'remote');
    assert.equal(workplaceFromText('On-site, Berlin'), 'onsite');
    assert.equal(workplaceFromText('Hybrid - SF | Remote - US'), null);
    assert.equal(workplaceFromText('London'), null);
    assert.equal(inferInterval(74, 74), 'hour');
    assert.equal(inferInterval(196000, 245000), 'year');
    assert.equal(inferInterval(4000, 6000), null);

    const stripe = finalizeJob({ location: 'na', allLocations: ['na'], workplaceType: null, isRemote: false, salaryMin: null, salaryMax: null, salaryInterval: null });
    assert.equal(stripe.location, null);
    assert.deepEqual(stripe.allLocations, []);
    assert.equal(stripe.salaryInterval, null);

    const vercel = finalizeJob({ location: 'Hybrid - San Francisco', allLocations: ['Hybrid - San Francisco'], workplaceType: null, isRemote: false });
    assert.equal(vercel.workplaceType, 'hybrid');
    assert.equal(vercel.isRemote, false);

    const intern = finalizeJob({ location: 'SF', allLocations: ['SF'], workplaceType: null, salaryMin: 74, salaryMax: 74, salaryInterval: null });
    assert.equal(intern.salaryInterval, 'hour');

    const kept = finalizeJob({ location: 'Paris', allLocations: ['Paris'], workplaceType: 'remote', isRemote: true, salaryMin: 50, salaryMax: 60, salaryInterval: 'day' });
    assert.equal(kept.salaryInterval, 'day');
    assert.equal(kept.workplaceType, 'remote');
});

test('workday relative dates become that day at 00:00 UTC; "30+ days" stays unknown', () => {
    const now = Date.parse('2026-10-25T09:00:00Z');
    assert.equal(relativePostedDate('Posted Today', now), '2026-10-25T00:00:00.000Z');
    assert.equal(relativePostedDate('Posted Yesterday', now), '2026-10-24T00:00:00.000Z');
    assert.equal(relativePostedDate('Posted 12 Days Ago', now), '2026-10-13T00:00:00.000Z');
    assert.equal(relativePostedDate('Posted 1 Day Ago', now), '2026-10-24T00:00:00.000Z');
    assert.equal(relativePostedDate('Posted 30+ Days Ago', now), null);
    assert.equal(relativePostedDate(undefined, now), null);
});
