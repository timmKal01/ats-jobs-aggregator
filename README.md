# ATS Jobs Scraper: Greenhouse, Lever, Ashby & Workable

Get every open job from a company's own job board in one clean format, whether the company hires through **Greenhouse, Lever, Ashby or Workable**. You don't need to know which one they use: give it a domain like `figma.com` and it finds the job board for you.

Each job comes with title, department, team, location, remote flag, employment type, **salary range where the company publishes one**, posting date, apply link and the full description as plain text. Filter by keyword, location, department, remote or posting date, or switch to monitor mode to get only the jobs that opened or closed since your last run.

## Who it's for

- **Job boards and aggregators** pulling fresh listings straight from the source, not from reposts.
- **Recruiters and sales teams** watching which companies are hiring for what (hiring is a buying signal).
- **Job seekers and career tools** tracking a list of target companies in one place.
- **Analysts** comparing headcount plans, salary bands and remote policies across companies.

## How the job board is found

For each company you enter, the actor tries, in order:

1. **A board you name directly**: a job board URL (`https://jobs.lever.co/palantir`) or `ats:token` (`greenhouse:stripe`).
2. **Links on the company's own site**: the homepage, its careers links, `/careers` and `/jobs` are checked for links or embeds pointing at a Greenhouse, Lever, Ashby or Workable board. robots.txt is respected.
3. **The company name as a board token** on each ATS. A guessed board is only accepted when it plausibly belongs to that company: Greenhouse and Workable boards must carry the company's name, and a mismatch is rejected (the Greenhouse token `example` belongs to "Democorp", so `example.com` does not get Democorp's jobs).

Every company gets a summary row saying what was found, how (`detectionMethod`) and how sure it is (`detectionConfidence`):

| Confidence | Meaning |
|---|---|
| `high` | Linked from the company's own site, or you gave the board directly |
| `medium` | Guessed from the name, and the board names the company or its jobs mention it |
| `low` | Guessed from the name, but ownership couldn't be confirmed (or the board is empty). Check `boardUrl`. |

If nothing is found, the company row says `"status": "ats_not_found"` instead of being skipped silently.

## Input examples

The default: five companies on four different systems, found from a domain or a name.

```json
{
  "companies": ["figma.com", "palantir.com", "linear.app", "huggingface.co", "notion"],
  "maxJobsPerCompany": 20
}
```

Remote engineering roles posted in the last two weeks:

```json
{
  "companies": ["stripe.com", "airbnb.com", "openai.com", "greenhouse:dropbox"],
  "keywords": ["engineer", "developer"],
  "remoteOnly": true,
  "postedWithinDays": 14
}
```

Daily hiring monitor for a target list (schedule it; each run returns only new and closed roles):

```json
{
  "companies": ["https://jobs.lever.co/palantir", "ashby:ramp", "figma.com"],
  "departments": ["Sales", "Marketing"],
  "mode": "monitor",
  "monitorStoreName": "gtm-hiring-watch"
}
```

## Input fields

| Field | What it does |
|---|---|
| `companies` | Domains, careers or board URLs, `ats:token`, or company names. One per line. |
| `keywords` | Keep jobs whose title contains any of these. Case-insensitive. |
| `locations` | Keep jobs whose location contains any of these. `Remote` also matches jobs flagged remote. |
| `remoteOnly` | Only remote jobs. |
| `departments` | Keep jobs whose department or team contains any of these. |
| `postedWithinDays` | Only jobs first posted in the last N days. Jobs with no posting date are left out when this is set. |
| `maxJobsPerCompany` | Newest first. Empty means no limit. |
| `maxItems` | Cap on job rows across all companies. Default 1,000. |
| `includeDescriptionHtml` | Also return the original HTML description. |
| `includeCompanyRows` | One free summary row per company. On by default. |
| `mode` | `snapshot` (every open job) or `monitor` (only jobs opened or closed since the last run). |
| `monitorStoreName` | Where monitor mode remembers previous job lists. Use one name per monitor. |

## Output

A job row (real, from the default run on 2026-09-26; description shortened):

```json
{
  "rowType": "job",
  "company": "Figma",
  "companyInput": "figma.com",
  "ats": "greenhouse",
  "atsToken": "figma",
  "jobId": "6204556004",
  "title": "Video Strategist",
  "department": "Marketing",
  "team": null,
  "location": "San Francisco, CA • New York, NY • United States",
  "allLocations": ["San Francisco, CA", "New York, NY", "United States"],
  "isRemote": false,
  "workplaceType": null,
  "employmentType": null,
  "salaryMin": 153000,
  "salaryMax": 269000,
  "salaryCurrency": "USD",
  "salaryInterval": "year",
  "postedAt": "2026-09-24T17:46:07.000Z",
  "updatedAt": "2026-09-24T17:46:07.000Z",
  "applyUrl": "https://boards.greenhouse.io/figma/jobs/6204556004?gh_jid=6204556004",
  "descriptionText": "Figma is growing our team of passionate creatives and builders on a mission to make design accessible to all...",
  "sourceUrl": "https://boards.greenhouse.io/figma/jobs/6204556004?gh_jid=6204556004",
  "scrapedAt": "2026-09-25T23:58:08.620Z"
}
```

A company summary row (department list shortened):

```json
{
  "rowType": "company",
  "company": "Figma",
  "companyInput": "figma.com",
  "status": "ok",
  "detectedAts": "greenhouse",
  "atsToken": "figma",
  "detectionMethod": "careers_page_link",
  "detectionConfidence": "high",
  "openRoles": 163,
  "matchingRoles": 163,
  "returnedRoles": 20,
  "departments": { "Sales": 56, "Engineering": 29, "Business Operations": 15, "Design": 13 },
  "remoteRoles": 0,
  "rolesWithSalary": 108,
  "boardUrl": "https://job-boards.greenhouse.io/figma",
  "pagesChecked": [
    { "url": "https://figma.com/", "result": "ok (0 ATS links)" },
    { "url": "https://figma.com/careers", "result": "ok (1 ATS link)" }
  ],
  "note": null,
  "sourceUrl": "https://boards-api.greenhouse.io/v1/boards/figma/jobs?content=true&pay_transparency=true",
  "scrapedAt": "2026-09-25T23:58:08.620Z"
}
```

`openRoles` counts every open job; `matchingRoles` counts those passing your filters; `returnedRoles` is what this run returned after the caps.

In monitor mode, job rows also carry `changeType`: `new` or `closed`. Closed rows keep the title, location and links remembered from the previous run. Company rows add `newRoles`, `closedRoles` and `isFirstRun`. The first run for a board saves a baseline and reports every job as `new`.

### What each ATS provides

| Field | Greenhouse | Lever | Ashby | Workable |
|---|---|---|---|---|
| Salary range | When the company enables pay transparency | When the company publishes one | When the company shows compensation | Not published |
| Employment type | Rarely | Yes | Yes | Yes |
| Workplace type (remote / hybrid / onsite) | Only when the location says "Remote" | Yes | Yes | Remote flag only |
| Team | No | Yes | Yes | No |
| Last updated date | Yes | No | No | No |
| Company name | Yes | No (board token is used) | No (board token is used) | Yes |

Fields a board doesn't publish are `null`, never guessed. When a company lists several pay zones (Greenhouse often has one range per US zone), `salaryMin` and `salaryMax` span all ranges in the first range's currency.

## FAQ

**Which companies work?** Any company whose public job board is on Greenhouse, Lever (including the EU instance), Ashby or Workable. Companies using Workday, iCIMS, SmartRecruiters, Taleo or a fully custom system come back as `ats_not_found`. SmartRecruiters is left out on purpose: its robots.txt blocks automated access.

**Does it use proxies or log in anywhere?** No. It reads the public job board APIs these systems provide for career pages, plus the company's public homepage and careers page for detection. If a company's website blocks automated visitors (openai.com does), detection falls back to trying the company name, which still works for most companies.

**How fresh is the data?** Live. Every run reads the boards directly.

**Why does `company` sometimes look like a slug?** Lever and Ashby boards don't include the company's name, so the board token is used, tidied up (`palantir` becomes "Palantir"). If you entered a company name, that name is used instead.

**Can I get jobs from hundreds of companies?** Yes. Companies are processed three at a time, with polite spacing per host (Lever asks for one request per second, which the actor honours).

## Pricing

Pay per job row returned. Company summary rows are free, and so are companies where no board was found.

## Disclaimer

This actor is unofficial and is not affiliated with, endorsed by, or connected to Greenhouse, Lever, Ashby, Workable or any company whose jobs it returns. It reads only publicly posted job listings through the public job board endpoints these services provide for career pages. Job content belongs to the companies that posted it.
