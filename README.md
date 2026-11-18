# Security GTM Copilot

Paste a project **website** or **X handle** → the copilot researches it from public sources and returns,
for every security service that fits the project, a **1–10 likelihood score**, a grounded **thesis**
with sourced evidence, and a **prospect brief**: priority, why now, decision makers to reach,
where to engage, qualification questions and what to research next.

Prospecting only — no outreach drafts in the MVP.

Initial batch is **Web3-only** (`scope: web3` in the rubrik) — Web2 sites stop before any paid lookups.

Vendor-agnostic: all services, ICPs, triggers and pricing live in a per-tenant
**rubrik** (`rubrik/presets/*.yaml`, schema in `lib/rubrik/schema.ts`).

## Pipeline

```
resolve → discover → collect → extract → enrich → profile → filter (scope + ICP)
        → social → people → posture → triggers → score (deterministic) → thesis → gate → brief
```

| Step | File (`lib/pipeline/steps/`) | Notes |
|---|---|---|
| resolve | `resolve.ts` | URL, or X handle → website via DefiLlama exact → X API bio → DefiLlama fuzzy → ask user |
| discover | `discover.ts` | picks docs/security/team/blog pages |
| collect | `collect.ts` | fetches pages (SSRF-guarded, passive only) |
| extract | `extract.ts` | LLM (schema-validated, quote-checked) or keyword heuristic |
| enrich | `enrich.ts` | DefiLlama (category, TVL, chains, audits, growth, incidents) + GitHub (activity, languages, LOC, audits) |
| profile | `profile.ts` | segments (structured data wins), stage, TVL, funding, code size, contacts |
| filter | `filter.ts` | scope (Web3-only) + ICP — runs before paid lookups |
| social | `social.ts` | news headlines, Telegram channel, governance-forum topics (+ project X posts if X API set) → dated funding + why-now facts |
| people | `people.ts` | team from website X links, GitHub contributors, governance-forum team groups, Farcaster (bios via verified X handles), Bluesky → role + affiliation (strong/medium). Optional paid X API adds affiliates, bios and a skim of key people's posts |
| posture | `posture.ts` | per service: covered / stale / partial / none / unknown; audit older than shipped code → stale |
| triggers | `triggers.ts` | dated why-now events; undated → unverified |
| score | `lib/scoring/score.ts` | Need 30 · Gap 25 · Timing 25 · Pay 10 · Reach 10, with caps |
| thesis | `thesis.ts` | only for score ≥ `thesisMinScore` |
| gate | `gate.ts` | grounded evidence + confidence checks |
| brief | `brief.ts` | priority A/B/C, why now, decision makers, engage points, qualify, research next |

Scores are computed in plain code (no LLM) so they are reproducible and explainable.
Confidence is reported separately from the score.

## Data sources

| Source | Key needed | Used for |
|---|---|---|
| Project website | — | segments, stage, claims, contacts, links |
| DefiLlama `/protocols`, `/hacks` | — | X→website, category, TVL, chains, audit links, growth, own & peer incidents |
| GitHub REST | optional `GITHUB_TOKEN` | code activity, contract languages, LOC estimate, audit folders/repos, contributor profiles (bio, company, X handle) |
| Google News RSS | — | funding rounds, launches, partnerships, incidents (headlines must name the project) |
| Telegram channel preview (`t.me/s/…`) | — | dated announcements (public channels only) |
| Governance forum (Discourse JSON) | — | team groups (names, titles, bios), latest proposals/announcements |
| Farcaster via Neynar | free `NEYNAR_API_KEY` | the project's own account (squatters rejected) → people it follows whose bio names the project; channel lead; bios for X handles found elsewhere |
| Bluesky public API | — | people search (bio must name the project and state a role) |
| X API v2 (optional, pay-per-use) | `X_BEARER_TOKEN` | handle→website, project posts, affiliates, user search, bios, people's recent posts |

Not used: CryptoRank / RootData funding APIs (paid tiers only) and DefiLlama `/raises` (paid).

## Run

Requires Node ≥ 22.

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
npm test
npm run typecheck
```

## Roadmap

- [ ] LLM provider adapters (`lib/ai/providers/*`) — better extraction of segments, contacts, dates
- [ ] More connectors: funding rounds, launch/TGE calendars, L2 trackers, security news
- [ ] Persist analyses + briefs to Supabase (`supabase/migrations/0001_init.sql`) + Clerk auth + RLS
- [ ] Durable job runner (Inngest / Trigger.dev), live stage progress
- [ ] Prospect list view + CRM sync (Google Sheets → HubSpot/Salesforce)
- [ ] Playbook upload → rubrik extraction
- [ ] Outreach phase (claims + templates already supported by the rubrik schema)

## Security

- The app listens on **127.0.0.1 only** (`npm run dev` / `npm start`) — not reachable from the network.
- Prospect URLs are fetched through an SSRF guard: http(s) only, standard ports, no credentials,
  every resolved IP must be public, redirects re-checked before following (`lib/connectors/web.ts`).
- Internal errors are logged server-side; the API returns a generic message (no local paths).
- API keys are only sent to their own API hosts and only read from `.env.local` (git-ignored).

## Data & privacy

- Public, passive data only — no scanning or probing of prospect infrastructure.
- Tenant playbooks are confidential: keep real rubriks out of git (`rubrik/private/` is ignored).
- No LinkedIn scraping, no X scraping — X data only via the official API.
- People data is limited to public professional info (name, role, public bio, public posts).
