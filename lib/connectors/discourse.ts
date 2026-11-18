/**
 * Discourse governance/community forums (free, public JSON). Many DAOs run one
 * (gov.*, governance.*, forum.*, research.*). Gives:
 *  - team groups (e.g. "<Project>-Labs") → members with names/titles
 *  - latest topics → dated announcements/proposals (why-now signals)
 * Forum URLs come from prospect websites, so every request goes through the SSRF-guarded fetcher.
 */
import type { Fetcher } from "@/lib/connectors/web";
import type { DatedPost } from "@/lib/signals/posts";

export const FORUM_HOST_RE = /^https?:\/\/(gov|governance|forum|forums|research|community|discuss|discourse)\.[a-z0-9.-]+\/?/i;

export interface ForumMember { username: string; name?: string; title?: string; group: string; profileUrl: string; bio?: string; website?: string }

async function json<T>(fetcher: Fetcher, url: string): Promise<T | null> {
  const r = await fetcher.get(url);
  if (!r || r.status >= 400) return null;
  try { return JSON.parse(r.html) as T; } catch { return null; }
}

export function forumBase(url: string): string | null {
  const m = url.match(FORUM_HOST_RE);
  return m ? m[0].replace(/\/$/, "") : null;
}

export async function isDiscourse(fetcher: Fetcher, base: string): Promise<boolean> {
  const about = await json<{ about?: unknown }>(fetcher, `${base}/about.json`);
  return !!about?.about;
}

const TEAM_GROUP = /(team|labs|core|staff|contributors?|foundation|devs?|engineering)/i;
const NOT_TEAM = /(delegate|ambassador|trust_level|moderators|admins|staff$)/i;

export async function forumTeam(fetcher: Fetcher, base: string, brands: string[], maxMembers = 30, maxProfiles = 10): Promise<ForumMember[]> {
  const groups = await json<{ groups?: { name: string; user_count?: number; automatic?: boolean }[] }>(fetcher, `${base}/groups.json`);
  const wanted = (groups?.groups ?? [])
    .filter((g) => !g.automatic && !NOT_TEAM.test(g.name))
    .filter((g) => brands.some((b) => g.name.toLowerCase().includes(b)) || TEAM_GROUP.test(g.name))
    .sort((a, b) => Number(brands.some((x) => b.name.toLowerCase().includes(x))) - Number(brands.some((x) => a.name.toLowerCase().includes(x))))
    .slice(0, 2);

  const members: ForumMember[] = [];
  for (const g of wanted) {
    const r = await json<{ members?: { username: string; name?: string; title?: string }[] }>(
      fetcher, `${base}/groups/${encodeURIComponent(g.name)}/members.json?limit=${maxMembers}`);
    for (const m of r?.members ?? []) {
      if (members.some((x) => x.username === m.username)) continue;
      members.push({ username: m.username, name: m.name || m.username, title: m.title || undefined, group: g.name, profileUrl: `${base}/u/${m.username}` });
    }
  }
  // profiles are often hidden from the public; best effort
  await Promise.all(members.slice(0, maxProfiles).map(async (m) => {
    const u = await json<{ user?: { bio_raw?: string; website?: string; name?: string; title?: string } }>(fetcher, `${base}/u/${encodeURIComponent(m.username)}.json`);
    if (!u?.user) return;
    m.bio = u.user.bio_raw || undefined;
    m.website = u.user.website || undefined;
    m.name ??= u.user.name || undefined;
    m.title ??= u.user.title || undefined;
  }));
  return members;
}

export async function forumLatest(fetcher: Fetcher, base: string, limit = 20): Promise<DatedPost[]> {
  const r = await json<{ topic_list?: { topics?: { id: number; slug: string; title: string; created_at: string }[] } }>(fetcher, `${base}/latest.json`);
  return (r?.topic_list?.topics ?? []).slice(0, limit).map((t) => ({
    text: t.title, at: new Date(t.created_at).toISOString(), url: `${base}/t/${t.slug}/${t.id}`, origin: "forum" as const,
  }));
}
