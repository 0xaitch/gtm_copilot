-- Security GTM Copilot — initial schema (multi-tenant)

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table rubriks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  config jsonb not null,
  created_at timestamptz not null default now()
);
create unique index rubriks_one_active on rubriks(tenant_id) where status = 'active';

create table analyses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  rubrik_id uuid references rubriks(id),
  input_raw text not null,
  input_type text check (input_type in ('url', 'x')),
  project jsonb not null default '{}',
  profile jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'halted', 'failed')),
  stage text,
  halted_reason text,
  warnings text[] not null default '{}',
  created_by text,                       -- Clerk user id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on analyses(tenant_id, created_at desc);

create table sources (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  url text not null,
  kind text not null,
  fetched_at timestamptz not null,
  content_hash text,
  raw_ref text                           -- storage path to raw text
);

create table facts (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  source_id uuid references sources(id) on delete set null,
  key text not null,
  value jsonb,
  kind text not null check (kind in ('fact', 'inference')),
  quote text,
  observed_at timestamptz,
  confidence real not null
);
create index on facts(analysis_id, key);

create table triggers (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  type text not null,
  occurred_at timestamptz not null,
  fact_ids uuid[] not null default '{}',
  note text
);

create table posture (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  service_key text not null,
  status text not null check (status in ('covered', 'stale', 'partial', 'none', 'unknown')),
  last_covered_at timestamptz,
  fact_ids uuid[] not null default '{}'
);

create table service_scores (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  service_key text not null,
  need real, gap real, timing real, pay real, reach real,
  raw real not null,
  cap_applied text,
  final smallint not null check (final between 1 and 10),
  confidence text not null check (confidence in ('high', 'med', 'low'))
);

create table theses (
  id uuid primary key default gen_random_uuid(),
  service_score_id uuid not null references service_scores(id) on delete cascade,
  summary text not null,
  evidence_fact_ids uuid[] not null default '{}',
  inferences jsonb not null default '[]',
  counter_signals jsonb not null default '[]',
  unknowns jsonb not null default '[]',
  gate_passed boolean,
  gate_reasons jsonb not null default '[]'
);

create table prospect_briefs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references analyses(id) on delete cascade,
  service_key text not null,
  priority char(1) not null check (priority in ('A', 'B', 'C')),
  entry_angle text not null,
  why_now jsonb not null default '[]',
  decision_makers jsonb not null default '[]',
  engage_points jsonb not null default '[]',
  qualification_questions jsonb not null default '[]',
  research_next jsonb not null default '[]',
  est_value_band text,
  status text not null default 'new' check (status in ('new', 'researching', 'qualified', 'disqualified')),
  owner text,                            -- Clerk user id
  updated_at timestamptz not null default now()
);

-- Row-level security: every table is tenant-scoped.
-- TODO: policies once Clerk ↔ Supabase JWT integration is wired.
alter table tenants enable row level security;
alter table rubriks enable row level security;
alter table analyses enable row level security;
alter table sources enable row level security;
alter table facts enable row level security;
alter table triggers enable row level security;
alter table posture enable row level security;
alter table service_scores enable row level security;
alter table theses enable row level security;
alter table prospect_briefs enable row level security;
