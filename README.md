# ATS Jobs Scraper: Workday, Greenhouse, Lever, Ashby

For recruiters, sales teams, job boards and analysts: paste company domains or career site links and get every open job from their Workday, Greenhouse, Lever, Ashby or Workable job board in one clean format, or schedule it and get only the jobs that opened or closed since the last run.

## What you get

- **Every open job:** title, department, team, location, remote / hybrid / onsite, employment type, salary range where the company publishes one, posting date, apply link and the full description as plain text
- **No board hunting:** give it `figma.com`, a careers page, a board URL or even a bare name like `notion`, and it finds the job board and says how sure it is (`detectionConfidence`)
- **Workday career sites too:** paste a `myworkdayjobs.com` link and get every job it lists, each with its full description, all locations, employment type and posting date
- **Monitor mode:** each run returns only the roles that opened or closed since the last one, so a daily schedule costs only what changed
- **A free summary row per company:** open roles, the department breakdown, how many roles show a salary and how many are remote, or `"status": "ats_not_found"` when no board was found

## Example output

Real output from a test run on 2026-10-24 with the default input (Figma, Palantir, Linear, Hugging Face and Notion, 20 jobs each). It returned 86 jobs and 5 company rows in 13 seconds: all five boards were found, 13 jobs had a salary and 24 were remote.

A job row (description shortened):

```json
{
  "rowType": "job",
  "company": "Figma",
  "companyInput": "figma.com",
  "ats": "greenhouse",
  "atsToken": "figma",
  "jobId": "6230952004",
  "title": "Account Executive, Federal - State & Local",
  "department": "Sales",
  "team": null,
  "location": "San Francisco, CA",
  "allLocations": ["San Francisco, CA"],
  "isRemote": false,
  "workplaceType": null,
  "employmentType": null,
  "salaryMin": 165000,
  "salaryMax": 190000,
  "salaryCurrency": "USD",
  "salaryInterval": "year",
  "postedAt": "2026-10-22T15:23:31.000Z",
  "updatedAt": "2026-10-22T15:23:31.000Z",
  "applyUrl": "https://boards.greenhouse.io/figma/jobs/6230952004?gh_jid=6230952004",
  "descriptionText": "Figma is growing our team of passionate creatives and builders on a mission to make design accessible to all...",
  "sourceUrl": "https://boards.greenhouse.io/figma/jobs/6230952004?gh_jid=6230952004",
  "scrapedAt": "2026-10-24T15:28:01.399Z"
}
```

The company row for the same run (some fields and the department list shortened):

```json
{
  "rowType": "company",
  "company": "Figma",
  "status": "ok",
  "detectedAts": "greenhouse",
  "detectionMethod": "careers_page_link",
  "detectionConfidence": "high",
  "openRoles": 138,
  "matchingRoles": 138,
  "returnedRoles": 20,
  "departmentCount": 12,
  "departments": [
    { "name": "Sales", "count": 46 },
    { "name": "Engineering", "count": 25 },
    { "name": "Design", "count": 11 },
    { "name": "Early Career", "count": 10 }
  ],
  "remoteRoles": 0,
  "rolesWithSalary": 88,
  "boardUrl": "https://job-boards.greenhouse.io/figma"
}
```

A Workday job row from a test run on 2026-10-25 (Adobe's career site, which listed 297 jobs; description shortened):

```json
{
  "rowType": "job",
  "company": "Adobe",
  "companyInput": "https://adobe.wd5.myworkdayjobs.com/external_experienced",
  "ats": "workday",
  "atsToken": "adobe.wd5/external_experienced",
  "jobId": "Enterprise-Technical-Account-Manager_R171928",
  "title": "Senior Enterprise Technical Account Manager",
  "department": null,
  "location": "Austin",
  "allLocations": ["Austin"],
  "isRemote": false,
  "employmentType": "Full-time",
  "salaryMin": null,
  "postedAt": "2026-10-23T00:00:00.000Z",
  "applyUrl": "https://adobe.wd5.myworkdayjobs.com/external_experienced/job/Austin/Enterprise-Technical-Account-Manager_R171928",
  "descriptionText": "The Enterprise Technical Account Manager (eTAM) is a senior business-critical role responsible for overall solution health..."
}
```

In monitor mode, job rows also carry `changeType`: `new` or `closed`, and company rows add `newRoles`, `closedRoles` and `isFirstRun`.

## What it costs

$0.002 per job row on the Free plan, and less on paid Apify plans ($0.00186 Bronze, $0.00171 Silver, $0.00157 Gold and above). Company summary rows are free, and so are companies where no board is found. No start fee.

| Run | Job rows | Cost on the Free plan |
|---|---|---|
| The default example (5 companies, 20 jobs each) | 86 | $0.17 |
| Every open job at Palantir (309 open on 2026-10-24) | 309 | $0.62 |
| Every job on Adobe's Workday career site (297 listed on 2026-10-25) | 297 | $0.59 |
| 1,000 jobs from any mix of companies | 1,000 | $2.00 |
| A monitor run where 30 roles opened or closed | 30 | $0.06 |

Set `maxJobsPerCompany` or `maxItems` to cap what a run can cost.

## Use cases

- **Sales and recruiting teams:** watch which companies are hiring for what (hiring is a buying signal).
- **Job boards and aggregators:** pull fresh listings straight from the source, not from reposts.
- **Job seekers and career tools:** track a list of target companies in one place, and get only the new roles each day.
- **Analysts:** compare hiring plans, salary bands and remote policies across companies, and see roles closing as well as opening.

## Input

| Field | What it does |
|---|---|
| `companies` | Domains, careers or board URLs (including Workday career sites on `myworkdayjobs.com`), `ats:token` (for example `greenhouse:stripe` or `workday:adobe.wd5/external_experienced`), or company names. One per line. Leave it empty to try the five-company example. |
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

Remote engineering roles posted in the last two weeks:

```json
{
  "companies": ["stripe.com", "airbnb.com", "openai.com", "greenhouse:dropbox"],
  "keywords": ["engineer", "developer"],
  "remoteOnly": true,
  "postedWithinDays": 14
}
```

Engineering roles in Oregon from a Workday career site:

```json
{
  "companies": ["https://intel.wd1.myworkdayjobs.com/External"],
  "keywords": ["engineer"],
  "locations": ["Oregon"],
  "maxJobsPerCompany": 20
}
```

A daily hiring monitor for a target list (schedule it; each run returns only new and closed roles):

```json
{
  "companies": ["https://jobs.lever.co/palantir", "ashby:ramp", "figma.com"],
  "departments": ["Sales", "Marketing"],
  "mode": "monitor",
  "monitorStoreName": "gtm-hiring-watch"
}
```

## Related tools

- [Salary Data by Occupation](https://apify.com/m_ctim/bls-occupation-wage-lookup): official US wages by job and state, to compare a posted salary with the market
- [HN Who's Hiring Scraper](https://apify.com/m_ctim/hn-whos-hiring-parser): Hacker News "Who is hiring?" threads as clean job rows, with salary, remote and visa details

## Notes

**How the job board is found.** For each company, the actor tries, in order:

1. **A board you name directly:** a job board URL (`https://jobs.lever.co/palantir`, `https://adobe.wd5.myworkdayjobs.com/external_experienced`) or `ats:token` (`greenhouse:stripe`, `workday:adobe.wd5/external_experienced`).
2. **Links on the company's own site:** the homepage, its careers links, `/careers` and `/jobs` are checked for links or embeds pointing at a Greenhouse, Lever, Ashby, Workable or Workday board. robots.txt is respected.
3. **The company name as a board token** on each ATS. A guessed board is only accepted when it plausibly belongs to that company: Greenhouse and Workable boards must carry the company's name, and a mismatch is rejected (the Greenhouse token `example` belongs to "Democorp", so `example.com` doesn't get Democorp's jobs). Workday can't be guessed this way, because its addresses carry a server number and a site name: give the career site link instead.

| Confidence | Meaning |
|---|---|
| `high` | Linked from the company's own site, or you gave the board directly |
| `medium` | Guessed from the name, and the board names the company or its jobs mention it |
| `low` | Guessed from the name, but ownership couldn't be confirmed (or the board is empty). Check `boardUrl`. |

**What each ATS provides.**

| Field | Greenhouse | Lever | Ashby | Workable | Workday |
|---|---|---|---|---|---|
| Salary range | When the company enables pay transparency | When the company publishes one | When the company shows compensation | Not published | Not published (some companies put pay in the description) |
| Department | Yes | Yes | Yes | Yes | No |
| Employment type | Rarely | Yes | Yes | Yes | Yes |
| Workplace type (remote / hybrid / onsite) | From the location text ("Hybrid - San Francisco", "Remote - US") | Yes | Yes | Remote flag, or from the location text | From the location text |
| Team | No | Yes | Yes | No | No |
| Last updated date | Yes | No | No | No | No |
| Company name | Yes | No (board token is used) | No (board token is used) | Yes | From the site address (`adobe` becomes "Adobe") |

Fields a board doesn't publish are `null`. Two things are worked out rather than read directly:
- **Workplace type** comes from the location text when the board has no field for it.
- **The pay interval** is inferred when a board posts a range without saying per what: under 1,000 is treated as hourly, 10,000 and up as yearly, and anything between stays `null`.

Placeholder locations such as `na` or `TBD` come back as `null`. When a company lists several pay zones, `salaryMin` and `salaryMax` span all of them in the first range's currency.

**Monitor mode.** The first run for a board saves a baseline and reports every job as `new`. Later runs return only jobs that opened or closed since the previous run. Closed rows keep the title, location and links remembered from the previous run. On Workday, the baseline holds every listed job, but only the full postings within the run's limits are read and returned; later runs read the postings of new jobs only.

**Which companies work.** Any company whose public job board is on Greenhouse, Lever (including the EU instance), Ashby, Workable, or a Workday career site on `myworkdayjobs.com`. A company domain finds its Workday site only when the company's careers page links to it (intel.com does, adobe.com doesn't), so for Workday companies paste the career site link. Workday shows at most 2,000 jobs per career site. Companies using iCIMS, SmartRecruiters, Taleo or a fully custom system come back as `ats_not_found`. SmartRecruiters is left out on purpose, because its robots.txt blocks automated access.

**No proxies, no logins.** It reads the public job board APIs these systems provide for career pages (for Workday, the same job data the career site loads in your browser, after checking that site's robots.txt), plus the company's public homepage and careers page for detection. If a company's website blocks automated visitors (openai.com does), detection falls back to trying the company name, which still works for most companies. Lever and Ashby boards don't include the company's name, so the board token is used, tidied up (`palantir` becomes "Palantir").

**Scale and freshness.** Companies are processed three at a time, with polite spacing per host (Lever asks for one request per second, which the actor honours, and Workday sites get the same). Workday lists jobs 20 at a time without descriptions, so each full posting is one more request: 100 Workday jobs take about two minutes. Every run reads the boards live.

**Feedback.** Open an issue in the Issues tab if a company's board isn't found, or you need another ATS. I read every issue.

**Disclaimer.** This actor is unofficial and is not affiliated with, endorsed by, or connected to Greenhouse, Lever, Ashby, Workable, Workday or any company whose jobs it returns. It reads only publicly posted job listings through the public job board endpoints these services provide for career pages. Job content belongs to the companies that posted it.
