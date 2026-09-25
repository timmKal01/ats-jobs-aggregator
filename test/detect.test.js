// Token extraction from URLs and from real careers-page HTML (excerpts captured 2026-09-26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    careerLinks, extractAtsFromUrl, findAtsInHtml, hasGreenhouseJobIds, isAllowed, parseCompanyInput, parseRobots, registrableDomain, slugCandidates, verifyGuess,
} from '../src/detect.js';

const page = (n) => readFileSync(new URL(`./fixtures/page-${n}.html`, import.meta.url), 'utf8');

test('extracts board tokens from every ATS URL shape', () => {
    const cases = [
        ['https://boards.greenhouse.io/figma', { ats: 'greenhouse', token: 'figma' }],
        ['https://job-boards.greenhouse.io/Figma/jobs/5551234', { ats: 'greenhouse', token: 'figma' }],
        ['https://boards.greenhouse.io/embed/job_board?for=airbnb&b=https://careers.airbnb.com', { ats: 'greenhouse', token: 'airbnb' }],
        ['https://boards.greenhouse.io/embed/job_board/js?for=dropbox', { ats: 'greenhouse', token: 'dropbox' }],
        ['https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true', { ats: 'greenhouse', token: 'stripe' }],
        ['https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd', { ats: 'lever', token: 'palantir' }],
        ['https://jobs.eu.lever.co/someco', { ats: 'lever-eu', token: 'someco' }],
        ['https://api.lever.co/v0/postings/leverdemo?mode=json', { ats: 'lever', token: 'leverdemo' }],
        ['https://jobs.ashbyhq.com/Linear/abc-123', { ats: 'ashby', token: 'Linear' }],
        ['https://api.ashbyhq.com/posting-api/job-board/openai?includeCompensation=true', { ats: 'ashby', token: 'openai' }],
        ['https://apply.workable.com/huggingface/', { ats: 'workable', token: 'huggingface' }],
        ['https://apply.workable.com/HuggingFace/j/F4C096B22E', { ats: 'workable', token: 'huggingface' }],
        ['https://acme.workable.com/', { ats: 'workable', token: 'acme' }],
    ];
    for (const [url, want] of cases) assert.deepEqual(extractAtsFromUrl(url), want, url);
});

test('ignores ATS links that are not a company board', () => {
    for (const url of [
        'https://www.workable.com/static/logo.svg',
        'https://apply.workable.com/j/F4C096B22E',
        'https://www.greenhouse.io/',
        'https://app.greenhouse.io/ai_opt_out_request/job_post/1/ai_opt_out',
        'https://boards.greenhouse.io/embed/job_board/js',
        'https://www.lever.co/',
        'https://example.com/careers',
    ]) assert.equal(extractAtsFromUrl(url), null, url);
});

test('finds the board on real careers pages', () => {
    assert.deepEqual(findAtsInHtml(page('figma.com'))[0], { ats: 'greenhouse', token: 'figma', count: findAtsInHtml(page('figma.com'))[0].count });
    assert.equal(findAtsInHtml(page('palantir.com'))[0].ats, 'lever');
    assert.equal(findAtsInHtml(page('palantir.com'))[0].token, 'palantir');
    const linear = findAtsInHtml(page('linear.app'))[0];
    assert.equal(linear.ats, 'ashby');
    assert.equal(linear.token.toLowerCase(), 'linear');
    // Hugging Face's homepage links apply.workable.com/huggingface and also loads www.workable.com assets.
    const hf = findAtsInHtml(page('huggingface.co'));
    assert.deepEqual(hf.map((h) => `${h.ats}:${h.token}`), ['workable:huggingface']);
});

test('handles JSON-escaped and protocol-relative links, most referenced first', () => {
    const html = `<script>{"u":"https:\\/\\/jobs.lever.co\\/acme\\/1"}</script>
        <iframe src="//boards.greenhouse.io/embed/job_board?for=beta&amp;b=x"></iframe>
        <a href="https://boards.greenhouse.io/beta">a</a>`;
    assert.deepEqual(findAtsInHtml(html).map((h) => [h.ats, h.token, h.count]), [['greenhouse', 'beta', 2], ['lever', 'acme', 1]]);
});

test('spots Greenhouse job IDs on custom careers pages', () => {
    assert.ok(hasGreenhouseJobIds('<a href="/jobs/search?gh_jid=8172487">'));
    assert.ok(!hasGreenhouseJobIds('<a href="/jobs/search?id=8172487">'));
});

test('classifies company inputs', () => {
    assert.deepEqual(parseCompanyInput('greenhouse:Stripe'), { input: 'greenhouse:Stripe', kind: 'board', ats: 'greenhouse', token: 'stripe', method: 'input_token' });
    assert.equal(parseCompanyInput('ashby:Linear').token, 'Linear');
    assert.equal(parseCompanyInput('https://jobs.lever.co/palantir').method, 'input_url');
    const site = parseCompanyInput('figma.com');
    assert.equal(site.kind, 'site');
    assert.equal(site.origin, 'https://figma.com');
    assert.equal(parseCompanyInput('https://www.notion.com/careers').host, 'www.notion.com');
    assert.equal(parseCompanyInput('Hugging Face').kind, 'name');
    assert.equal(parseCompanyInput('  '), null);
});

test('guesses tokens from domains and names', () => {
    assert.equal(registrableDomain('careers.example.co.uk'), 'example.co.uk');
    assert.equal(registrableDomain('www.figma.com'), 'figma.com');
    assert.deepEqual(slugCandidates({ host: 'www.figma.com' }), ['figma']);
    assert.deepEqual(slugCandidates({ host: 'jobs.hugging-face.co.uk' }), ['hugging-face', 'huggingface']);
    assert.deepEqual(slugCandidates({ name: 'Hugging Face' }), ['huggingface', 'hugging-face']);
    assert.deepEqual(slugCandidates({ name: 'Ben & Jerry’s' }), ['benandjerrys', 'ben-and-jerry-s']);
});

test('guessed boards must belong to the company', () => {
    // Real case: the Greenhouse token "example" belongs to "Democorp".
    assert.equal(verifyGuess({ companyName: 'Democorp', jobs: [] }, 'example'), 'mismatch');
    assert.equal(verifyGuess({ companyName: 'Hugging Face', jobs: [] }, 'huggingface'), 'confirmed');
    assert.equal(verifyGuess({ companyName: 'Stripe', jobs: [] }, 'stripe'), 'confirmed');
    // No company name (Lever, Ashby): look for the company in the job text, never in URLs.
    const ashby = { companyName: null, jobs: [{ jobUrl: 'https://jobs.ashbyhq.com/notion/1', descriptionPlain: 'Join our team.' }] };
    assert.equal(verifyGuess(ashby, 'notion'), 'unverified');
    ashby.jobs[0].descriptionPlain = 'At Notion, we build tools.';
    assert.equal(verifyGuess(ashby, 'notion'), 'confirmed');
});

test('robots.txt: only the * group applies, longest rule wins', () => {
    const rules = parseRobots(`User-Agent: Nutch
Disallow: /

User-agent: *
Disallow: /embed/
Disallow: /*/invite/
Allow: /embed/public
Disallow: /private$
`);
    assert.ok(isAllowed(rules, '/careers'));
    assert.ok(!isAllowed(rules, '/embed/x'));
    assert.ok(isAllowed(rules, '/embed/public/jobs'));
    assert.ok(!isAllowed(rules, '/en/invite/abc'));
    assert.ok(!isAllowed(rules, '/private'));
    assert.ok(isAllowed(rules, '/private/ok'));
    assert.ok(isAllowed(parseRobots('User-agent: *\nDisallow:\n'), '/anything'));
    assert.ok(!isAllowed(parseRobots('User-agent: a\nUser-agent: *\nDisallow: /\n'), '/careers'));
});

test('finds same-site careers links on a homepage', () => {
    const html = `<a href="/about">About</a><a href="https://careers.acme.com/">Careers</a>
        <a href="/company/jobs">Open roles</a><a href="https://other.com/careers">Partner careers</a>`;
    assert.deepEqual(careerLinks(html, 'https://www.acme.com/'), ['https://careers.acme.com/', 'https://www.acme.com/company/jobs']);
});
