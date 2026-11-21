# Security GTM Copilot

**Which Web3 projects are likely to buy a security service right now — and who do I talk to?**

Selling audits, pentests or SOC 2 to crypto projects usually means hours of manual research per lead:
checking the website, GitHub, past audits, funding news, launch dates, and hunting for the right person.
Most of that time goes to projects that just finished an audit or aren't ready to buy.

This copilot does that research in about 10 seconds. Paste a project's **website** or **X handle**, and
it returns, for each security service that fits the project:

- a **1–10 likelihood score**, with the reasoning broken down
- **why now**: dated, sourced events (a raise, a mainnet launch, a new product, an incident)
- **decision makers** found in public sources, with how sure it is they work there
- **where to engage**, questions to qualify the lead, and what to research next

It's vendor-agnostic: the services, ideal customer profile, buying signals and pricing come from a config
file, so any security firm can plug in its own.

---

## Example

Input: `pendle.finance` (run on 21 Nov 2026)

| Service | Score | Why |
|---|---|---|
| **Pentest** | **8/10**, priority A | Three dated partnership / product announcements since mid-October (Ethena, Janus Henderson, tokenized stocks); no pentest found |
| Tokenomics review | 5/10 | Has a token, but no recent token event |
| Smart contract audit | **3/10** | Recent audit coverage found, so the score is capped on purpose — not worth pitching now |

Also found: ~$918M TVL, ~42K lines of Solidity, active Telegram, 2 team members (one named with a role on
the website, one top GitHub contributor whose bio names the project).

The low audit score is the point. A naive tool would say "big DeFi protocol → pitch an audit." This one
sees the recent audit coverage and points to the service with an actual gap.

<!-- Add a screenshot here: ![Analysis of pendle.finance](docs/screenshot.png) -->

---

## How it decides

Every score is calculated in plain code, not by an LLM, so the same input always gives the same score and
every number can be explained.

| Factor | Weight | Question it answers |
|---|---|---|
| **Need** | 30% | Does this kind of project need this service? (a lending protocol needs audits; an exchange needs SOC 2) |
| **Gap** | 25% | Do they already have it? Covered recently → low. Old audit but code has shipped since → stale → high |
| **Timing** | 25% | Is something happening now? Funding, launches, incidents — each fades over time (a raise matters for ~90 days) |
| **Pay** | 10% | Can they afford it? TVL, funding, investor backing |
| **Reach** | 10% | Did we find someone to talk to? A CTO with an X handle beats "no team found" |

Two guardrails stop over-confident scores:

- **Recently covered → capped at 3.** Don't pitch an audit to a team that just had one.
- **No verified, dated trigger → capped at 6.** A high score needs a real "why now", not just a good fit.

Confidence (high / medium / low) is reported **separately** from the score: a 7/10 built on thin data is
labelled as such rather than quietly inflated or deflated.

---

## Design decisions

**Every fact has a source and a date.** Each finding stores the URL, the exact quote, when it was observed,
and whether it's a fact or an inference. Undated claims ("we've raised from top VCs") are never treated as
recent events.

**Wrong data is worse than missing data.** Most of the work went into *not* attributing things to the wrong
project. Examples of bugs found by running it on real projects, and fixed:

- *"Variational raises $110M to take on Hyperliquid"* was being counted as Hyperliquid's raise. News now
  only counts when the project is the subject of the headline.
- A site behind bot protection was named "Vercel Security Checkpoint". Challenge pages are now detected and
  the copilot falls back to structured data.
- `@berachain` resolved to a small lending app that shares the handle. Listings are now matched by project
  family and name, not by size.

**Free by default.** The X API costs money, so the default stack uses only free sources: DefiLlama, GitHub,
Google News, public Telegram channels, governance forums and Farcaster. The X API is optional. No scraping
of X or LinkedIn.

**Filter before spending.** Projects outside the target market (e.g. Web2 sites when targeting Web3) stop
early, before any paid lookups.

**People are hard to find, so say how sure we are.** Each decision maker is marked *strong* (e.g. named
with a role on the project's own site, or bio states a role + the project) or *medium* (e.g. bio mentions
the project, no role), with the evidence shown.

---

## Known limits

- Sites behind aggressive bot protection give thin results — usually no team found.
- Projects that rebranded and changed X handle (e.g. EigenLayer → EigenCloud) can't be resolved from the
  old handle without the paid X API; paste the website instead.
- Funding amounts come from news headlines only — the good funding databases are paid.
- Extraction from websites is keyword-based for now; an LLM step is planned.

---

## Technical reference

Built with Next.js 16, React 19, TypeScript, Zod and Vitest.

### Pipeline

```
resolve → discover → collect → extract → enrich → profile → filter (scope + ICP)
        → social → people → posture → triggers → score → thesis → gate → brief
```

| Step | File (`lib/pipeline/steps/`) | What it does |
|---|---|---|
| resolve | `resolve.ts` | Website or X handle → canonical project. Handle lookup: DefiLlama exact → X API (optional) → DefiLlama fuzzy |
| discover | `discover.ts` | Finds docs, security, team and blog pages (with fallbacks for JavaScript-only sites) |
| collect | `collect.ts` | Fetches pages through the SSRF guard |
| extract | `extract.ts` | Segments, stage, claims, contacts from page text |
| enrich | `enrich.ts` | DefiLlama (category, TVL, chains, audits, incidents) + GitHub (activity, languages, code size, audit repos) |
| profile | `profile.ts` | Merges everything; structured data beats keyword guesses |
| filter | `filter.ts` | Target market + ICP — runs before any paid lookups |
| social | `social.ts` | News, Telegram, governance forum, X (optional) → dated events |
| people | `people.ts` | Team from website links, GitHub, forum team groups, Farcaster, Bluesky → role + affiliation |
| posture | `posture.ts` | Per service: covered / stale / partial / none / unknown |
| triggers | `triggers.ts` | Dated "why now" events; undated → unverified |
| score | `lib/scoring/score.ts` | Weighted score with caps (see above) |
| thesis, gate | `thesis.ts`, `gate.ts` | Written reasoning for scores ≥ 5, checked against the evidence |
| brief | `brief.ts` | Priority A/B/C, why now, decision makers, where to engage, questions, next research |

### Data sources

| Source | Key needed | Used for |
|---|---|---|
| Project website | — | Segments, stage, claims, team, links |
| DefiLlama `/protocols`, `/hacks` | — | X handle → website, category, TVL, chains, audit links, incidents |
| GitHub | optional `GITHUB_TOKEN` (raises rate limit) | Code activity, contract size, audit repos, contributors |
| Google News RSS | — | Funding, launches, partnerships (project must be the subject) |
| Telegram public channel preview | — | Dated announcements |
| Governance forums (Discourse) | — | Team groups, latest proposals |
| Farcaster via Neynar | free `NEYNAR_API_KEY` | Project account → people it follows; bios for X handles |
| Bluesky public API | — | People search (bio must name the project and a role) |
| X API v2 | optional, paid `X_BEARER_TOKEN` | Posts, affiliates, bios |

### Configuration (the "rubrik")

Everything vendor-specific lives in `rubrik/presets/*.yaml`, validated by `lib/rubrik/schema.ts`:
services offered, target segments per service, buying triggers (with weight and how fast they fade),
buyer personas, pricing, scoring weights and caps. The included `web3-security.yaml` uses illustrative
placeholder numbers. Keep real configs in `rubrik/private/` (git-ignored).

### Run locally

Requires Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # optional: add NEYNAR_API_KEY, GITHUB_TOKEN
npm run dev                  # http://127.0.0.1:3000
npm test
```

On Windows PowerShell, use `npm.cmd run dev` if script execution is blocked.

### Security

- The app listens on 127.0.0.1 only — not reachable from other machines.
- Every URL it fetches goes through an SSRF guard: http(s) and standard ports only, every resolved IP must
  be public, redirects are re-checked before following (`lib/connectors/web.ts`).
- Passive reads of public data only — no scanning or probing of prospects' infrastructure.
- API errors return a generic message; details stay in the server log.
- API keys are read only from `.env.local` (git-ignored) and sent only to their own API.

### Roadmap

- [ ] LLM extraction step (better segments, people and dates from messy pages)
- [ ] Save analyses and briefs (Supabase schema in `supabase/migrations/`) with auth
- [ ] Prospect list view and CRM export
- [ ] Upload a sales playbook → generate the rubrik config
- [ ] Outreach drafting (the config schema already supports claims and templates)
