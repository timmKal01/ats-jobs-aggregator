# Pricing proposal: ats-jobs-aggregator

Not set on Apify yet. For review.

## Proposal

| Event | Price | Charged when |
|---|---|---|
| `job-listing` | **$0.002** ($2 per 1,000 jobs) | Once per job row pushed (in monitor mode, per new or closed job) |

Company summary rows and `ats_not_found` rows are free. No start fee.

## Reasoning

**The market is crowded and cheap.** Apify Store search on 2026-09-26 for "ats jobs", "greenhouse jobs" and "lever jobs" returned 20+ actors, priced per job (Free tier / Gold tier):

| Actor | Users | Per job |
|---|---|---|
| fantastic-jobs/greenhouse-jobs-api | 874 | $0.002 / $0.0012 |
| jobo.world/ats-jobs-api | 743 | $0.004 / $0.0013 |
| bovi/greenhouse-lever-ashby-job-scraper | 438 | $0.0015 |
| automation-lab/multi-ats-jobs-scraper | 160 | $0.00115 / $0.0006 |
| enosgb/ats-job-scraper | 129 | $0.0015 |
| benthepythondev/ats-jobs-aggregator | 31 | $0.005 / $0.004 |

The middle of the market is $0.0015 to $0.004 per job. The portfolio's usual $0.007 per event would make this the most expensive option on the list, for a row type buyers pull by the thousand (one run over Palantir alone is 321 jobs; OpenAI is 829).

**Why not undercut to $0.001:** the differentiators are real and cost nothing to run: automatic board detection from a plain domain with a confidence rating, Workable support (most competitors cover only Greenhouse, Lever and Ashby), normalized salary ranges across all four systems, and a monitor mode that reports closed roles, not just new ones. $0.002 matches the most-used competitor's Free-tier price.

**Cost to run:** negligible. Pure JSON APIs, no proxy, no browser. A 5-company default run finishes in about 20 seconds on 256 MB.

**Monitor mode pricing is fair by design:** only changed jobs are returned and charged, so a daily monitor over 50 stable companies costs cents.

**Empty-input run:** returns 88 job rows (20 per company, capped), so a first click costs a user about $0.18.

## If you prefer the portfolio convention

$0.007 would only make sense billed per company (one event per board fetched, however many jobs it has). That is cheap for huge boards, expensive for small ones, and unusual in this niche, so buyers comparing prices would find it hard to read. Recommend staying per job at $0.002.
