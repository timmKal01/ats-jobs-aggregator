// Each ATS normalizer against real API responses captured 2026-09-26 (trimmed to a few jobs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADAPTERS } from '../src/ats.js';
import { stripHtml } from '../src/normalize.js';

const fixture = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const run = (ats, body, token) => ADAPTERS[ats].list(body).map((j) => ADAPTERS[ats].normalize(j, token));

const REQUIRED = ['jobId', 'title', 'location', 'isRemote', 'postedAt', 'applyUrl', 'sourceUrl', 'descriptionHtml'];
const hasShape = (j) => REQUIRED.every((k) => k in j) && typeof j.jobId === 'string' && j.title.length > 0;

test('greenhouse: departments, pay ranges across zones, unescaped HTML', () => {
    const body = fixture('greenhouse-figma.json');
    const jobs = run('greenhouse', body, 'figma');
    assert.ok(jobs.every(hasShape));
    assert.equal(ADAPTERS.greenhouse.companyName(body), 'Figma');
    const paid = jobs.find((j) => j.salaryMin !== null);
    const raw = body.jobs.find((j) => String(j.id) === paid.jobId);
    assert.equal(paid.salaryMin, Math.min(...raw.pay_input_ranges.map((r) => r.min_cents)) / 100);
    assert.equal(paid.salaryMax, Math.max(...raw.pay_input_ranges.map((r) => r.max_cents)) / 100);
    assert.equal(paid.salaryCurrency, 'USD');
    assert.ok(paid.salaryMin > 10000, 'cents are converted to whole currency units');
    const unpaid = jobs.find((j) => j.salaryMin === null);
    assert.equal(unpaid.salaryCurrency, null);
    // content arrives as &lt;p&gt;...; the output must be real HTML.
    assert.match(paid.descriptionHtml, /^<|<p>|<div>/);
    assert.doesNotMatch(paid.descriptionHtml, /&lt;p&gt;/);
    assert.ok(stripHtml(paid.descriptionHtml).length > 200);
    assert.ok(jobs.every((j) => j.department));
});

test('greenhouse: multi-office location strings split into allLocations', () => {
    const norm = (name) => ADAPTERS.greenhouse.normalize({ id: 1, title: 'X', location: { name } }, 't');
    // Real shapes from Stripe and Figma boards.
    assert.deepEqual(norm('US-NYC; US-SF; US-Remote').allLocations, ['US-NYC', 'US-SF', 'US-Remote']);
    assert.equal(norm('US-NYC; US-SF; US-Remote').isRemote, true);
    assert.deepEqual(norm('San Francisco, CA • New York, NY • United States').allLocations, ['San Francisco, CA', 'New York, NY', 'United States']);
    assert.deepEqual(norm('San Francisco, Seattle, New York').allLocations, ['San Francisco, Seattle, New York']);
});

test('lever: team, commitment, workplace and full description sections', () => {
    const jobs = run('lever', fixture('lever-palantir.json'), 'palantir');
    assert.ok(jobs.every(hasShape));
    const j = jobs[0];
    assert.equal(j.team, 'Administrative');
    assert.equal(j.employmentType, 'Full-time');
    assert.equal(j.workplaceType, 'hybrid');
    assert.equal(j.isRemote, false);
    assert.match(j.sourceUrl, /^https:\/\/jobs\.lever\.co\/palantir\//);
    assert.match(j.applyUrl, /\/apply$/);
    assert.match(stripHtml(j.descriptionHtml), /What We Require/, 'list sections are included');
    assert.equal(j.salaryMin, null);
});

test('lever: salaryRange when the company publishes one', () => {
    const [j] = run('lever', fixture('lever-leverdemo-salary.json'), 'leverdemo');
    assert.ok(Number.isFinite(j.salaryMin) && j.salaryMax >= j.salaryMin);
    assert.equal(j.salaryCurrency, 'USD');
    assert.equal(j.salaryInterval, 'year');
});

test('ashby: salary component, workplace type decides remote over isRemote', () => {
    const body = fixture('ashby-openai.json');
    const jobs = run('ashby', body, 'openai');
    assert.ok(jobs.every(hasShape));
    const [remote, hybrid, unset] = jobs;
    assert.equal(remote.workplaceType, 'remote');
    assert.equal(remote.isRemote, true);
    assert.equal(hybrid.workplaceType, 'hybrid');
    // Ashby sends isRemote: true on hybrid roles too; hybrid is not reported as remote.
    assert.equal(body.jobs[1].isRemote, true);
    assert.equal(hybrid.isRemote, hybrid.allLocations.some((l) => /remote/i.test(l)));
    assert.ok(hybrid.salaryMin > 0 && hybrid.salaryMax >= hybrid.salaryMin);
    assert.equal(hybrid.salaryInterval, 'year');
    assert.equal(unset.workplaceType, null);
    assert.equal(unset.isRemote, body.jobs[2].isRemote === true || unset.allLocations.some((l) => /remote/i.test(l)));
    assert.equal(jobs[0].employmentType, 'Full-time');
});

test('workable: shortcode ids, telecommuting, location parts', () => {
    const body = fixture('workable-huggingface.json');
    const jobs = run('workable', body, 'huggingface');
    assert.ok(jobs.every(hasShape));
    assert.equal(ADAPTERS.workable.companyName(body), 'Hugging Face');
    const j = jobs[0];
    assert.equal(j.jobId, 'F4C096B22E');
    assert.equal(j.isRemote, true);
    assert.equal(j.location, 'Paris, Île-de-France, France');
    assert.equal(j.employmentType, 'Full-time');
    assert.equal(j.applyUrl, 'https://apply.workable.com/j/F4C096B22E/apply');
});

test('token casing: workable and greenhouse lowercase, ashby keeps case', () => {
    assert.match(ADAPTERS.workable.apiUrl(ADAPTERS.workable.canonicalToken('HuggingFace')), /accounts\/huggingface\?/);
    assert.match(ADAPTERS.ashby.apiUrl(ADAPTERS.ashby.canonicalToken('Linear')), /job-board\/Linear\?/);
});
