/**
 * GitHub REST API — public org/user metadata only.
 * Unauthenticated: 60 req/hour. Set GITHUB_TOKEN (no scopes needed) for 5,000/hour.
 * One analysis uses ~10 requests.
 */

export interface GhRepo {
  name: string;
  full_name: string;
  html_url: string;
  fork: boolean;
  archived: boolean;
  pushed_at: string;
  created_at: string;
  stargazers_count: number;
  default_branch: string;
}

export interface GithubSummary {
  owner: string;
  ownerUrl: string;
  repos: GhRepo[];                     // non-fork, non-archived, most recently pushed first
  lastPushAt?: string;
  lastPushRepo?: string;
  languages: Record<string, number>;   // bytes, summed over top repos
  contractLocEstimate?: number;
  audits: { url: string; lastCommitAt?: string; where: string }[];
  rateLimited: boolean;
}

const API = "https://api.github.com";
const CONTRACT_LANGS = ["Solidity", "Vyper", "Move", "Cairo"];
const BYTES_PER_LINE = 40;
const TOP_REPOS = 5;

export function parseGithubOwner(url?: string): string | null {
  if (!url) return null;
  if (!/^https?:\/\//.test(url) && /^[A-Za-z0-9-]+$/.test(url)) return url; // bare org name
  const m = url.match(/github\.com\/([A-Za-z0-9-]+)/i);
  return m && !["orgs", "features", "about", "sponsors", "topics"].includes(m[1].toLowerCase()) ? m[1] : null;
}

async function gh<T>(path: string, state: { rateLimited: boolean }): Promise<T | null> {
  if (state.rateLimited) return null;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "user-agent": "security-gtm-copilot",
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const res = await fetch(`${API}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (res.status === 403 || res.status === 429) {
      if (res.headers.get("x-ratelimit-remaining") === "0" || res.status === 429) state.rateLimited = true;
      return null;
    }
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function githubSummary(owner: string): Promise<GithubSummary | null> {
  const state = { rateLimited: false };
  let repos = await gh<GhRepo[]>(`/orgs/${owner}/repos?sort=pushed&per_page=50`, state);
  if (!repos) repos = await gh<GhRepo[]>(`/users/${owner}/repos?sort=pushed&per_page=50`, state);
  if (!repos) return state.rateLimited ? { ...empty(owner), rateLimited: true } : null;

  const active = repos.filter((r) => !r.fork && !r.archived)
    .sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
  const summary: GithubSummary = {
    ...empty(owner),
    repos: active,
    lastPushAt: active[0]?.pushed_at,
    lastPushRepo: active[0]?.full_name,
  };

  // Audits: a dedicated repo (e.g. "audits", "security-audits")…
  for (const r of active.filter((x) => /audit/i.test(x.name))) {
    summary.audits.push({ url: r.html_url, lastCommitAt: r.pushed_at, where: `repo ${r.full_name}` });
  }

  // …and languages + an audits/ folder inside the most-starred recent repos.
  const top = [...active].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, TOP_REPOS);
  await Promise.all(top.map(async (r) => {
    const langs = await gh<Record<string, number>>(`/repos/${r.full_name}/languages`, state);
    for (const [k, v] of Object.entries(langs ?? {})) summary.languages[k] = (summary.languages[k] ?? 0) + v;

    const root = await gh<{ name: string; type: string; html_url: string }[]>(`/repos/${r.full_name}/contents`, state);
    const dir = root?.find((e) => e.type === "dir" && /^audits?$/i.test(e.name));
    if (dir) {
      const commits = await gh<{ commit: { committer: { date: string } } }[]>(
        `/repos/${r.full_name}/commits?path=${encodeURIComponent(dir.name)}&per_page=1`, state);
      summary.audits.push({ url: dir.html_url, lastCommitAt: commits?.[0]?.commit.committer.date, where: `${r.full_name}/${dir.name}` });
    }
  }));

  const contractBytes = CONTRACT_LANGS.reduce((n, l) => n + (summary.languages[l] ?? 0), 0);
  if (contractBytes) summary.contractLocEstimate = Math.round(contractBytes / BYTES_PER_LINE);
  summary.rateLimited = state.rateLimited;
  return summary;
}

function empty(owner: string): GithubSummary {
  return { owner, ownerUrl: `https://github.com/${owner}`, repos: [], languages: {}, audits: [], rateLimited: false };
}

export interface GhPerson {
  login: string;
  name?: string | null;
  bio?: string | null;
  company?: string | null;
  twitter_username?: string | null;
  html_url: string;
  contributions: number;
}

/**
 * Top human contributors across the org's most active repos, with public profile fields
 * (name, bio, company, X handle). ~1 + N requests.
 */
export async function githubPeople(owner: string, maxPeople = 8): Promise<GhPerson[]> {
  const state = { rateLimited: false };
  const repos = ((await gh<GhRepo[]>(`/orgs/${owner}/repos?sort=pushed&per_page=30`, state))
    ?? (await gh<GhRepo[]>(`/users/${owner}/repos?sort=pushed&per_page=30`, state)) ?? [])
    .filter((r) => !r.fork && !r.archived);
  const tally = new Map<string, number>();
  const top = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 3);
  for (const r of top) {
    const list = await gh<{ login: string; type: string; contributions: number }[]>(
      `/repos/${r.full_name}/contributors?per_page=10`, state);
    for (const c of list ?? []) {
      if (c.type !== "User" || /\[bot\]$|^dependabot|^github-actions/i.test(c.login)) continue;
      tally.set(c.login, (tally.get(c.login) ?? 0) + c.contributions);
    }
  }
  const logins = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxPeople);
  const people = await Promise.all(logins.map(async ([login, contributions]) => {
    const u = await gh<Omit<GhPerson, "contributions">>(`/users/${login}`, state);
    return u ? { ...u, contributions } : null;
  }));
  return people.filter((p): p is GhPerson => !!p);
}
