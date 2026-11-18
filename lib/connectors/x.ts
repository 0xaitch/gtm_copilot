/**
 * X (Twitter) API v2 — pay-per-use, app-only Bearer token (X_BEARER_TOKEN).
 * Billing is per resource returned (≈ $0.010 per user, ≈ $0.005 per post at time of writing —
 * check the X Developer Console). Every analysis tracks its own usage + estimated cost.
 */
import type { DatedPost } from "@/lib/signals/posts";

export interface XUser {
  id: string;
  username: string;
  name?: string;
  description?: string;
  url?: string;
  verified_type?: string;
  public_metrics?: { followers_count?: number };
  entities?: { url?: { urls?: { expanded_url?: string }[] }; description?: { mentions?: { username: string }[] } };
}

export interface XUsage { userReads: number; postReads: number; estUsd: number }

export const X_HANDLE_RE = /^@?([A-Za-z0-9_]{1,15})$/;

export function parseXHandle(input: string): string | null {
  const s = input.trim();
  const m = s.match(X_HANDLE_RE);
  if (m) return m[1];
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (/^(www\.)?(x|twitter)\.com$/i.test(u.hostname)) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg && X_HANDLE_RE.test(seg) && !RESERVED.has(seg.toLowerCase())) return seg.replace(/^@/, "");
    }
  } catch { /* not a URL */ }
  return null;
}
const RESERVED = new Set(["home", "intent", "share", "search", "i", "explore", "hashtag", "settings", "login", "signup", "tos", "privacy"]);

export const xConfigured = () => Boolean(process.env.X_BEARER_TOKEN);

const API = "https://api.x.com/2";
const USER_FIELDS = "description,url,entities,verified_type,public_metrics,created_at";
const PRICE = { user: 0.01, post: 0.005 }; // USD per resource returned (estimate)

export interface XClient {
  usage: XUsage;
  userByUsername(username: string): Promise<XUser | null>;
  usersByUsernames(usernames: string[]): Promise<XUser[]>;
  affiliates(userId: string, max?: number): Promise<XUser[]>;
  searchUsers(query: string, max?: number): Promise<XUser[]>;
  recentPosts(userId: string, username: string, max?: number): Promise<DatedPost[]>;
}

export function createXClient(): XClient | null {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;
  const usage: XUsage = { userReads: 0, postReads: 0, estUsd: 0 };
  const bill = (users: number, posts: number) => {
    usage.userReads += users;
    usage.postReads += posts;
    usage.estUsd = Math.round((usage.userReads * PRICE.user + usage.postReads * PRICE.post) * 1000) / 1000;
  };

  async function get<T>(path: string): Promise<T | null> {
    try {
      const res = await fetch(`${API}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
  type List<T> = { data?: T[] };

  return {
    usage,
    async userByUsername(username) {
      const r = await get<{ data?: XUser }>(`/users/by/username/${encodeURIComponent(username)}?user.fields=${USER_FIELDS}`);
      if (r?.data) bill(1, 0);
      return r?.data ?? null;
    },
    async usersByUsernames(usernames) {
      const uniq = [...new Set(usernames.filter((u) => X_HANDLE_RE.test(u)))].slice(0, 100);
      if (!uniq.length) return [];
      const r = await get<List<XUser>>(`/users/by?usernames=${uniq.join(",")}&user.fields=${USER_FIELDS}`);
      bill(r?.data?.length ?? 0, 0);
      return r?.data ?? [];
    },
    async affiliates(userId, max = 50) {
      const r = await get<List<XUser>>(`/users/${userId}/affiliates?max_results=${max}&user.fields=${USER_FIELDS}`);
      bill(r?.data?.length ?? 0, 0);
      return r?.data ?? [];
    },
    async searchUsers(query, max = 20) {
      const q = query.replace(/[^A-Za-z0-9_ '.\-@&"]/g, " ").slice(0, 50).trim();
      if (!q) return [];
      const r = await get<List<XUser>>(`/users/search?query=${encodeURIComponent(q)}&max_results=${max}&user.fields=${USER_FIELDS}`);
      bill(r?.data?.length ?? 0, 0);
      return r?.data ?? [];
    },
    async recentPosts(userId, username, max = 30) {
      type Post = { id: string; text: string; created_at?: string };
      const base = `/users/${userId}/tweets?max_results=${Math.min(100, Math.max(5, max))}&exclude=replies,retweets`;
      // docs name the param post.fields; older deployments use tweet.fields
      const r = (await get<List<Post>>(`${base}&post.fields=created_at`)) ?? (await get<List<Post>>(`${base}&tweet.fields=created_at`));
      const posts = r?.data ?? [];
      bill(0, posts.length);
      return posts
        .filter((p) => p.created_at)
        .map((p) => ({ text: p.text, at: p.created_at!, url: `https://x.com/${username}/status/${p.id}`, origin: "x" as const }));
    },
  };
}

/** Website from an X profile (bio link). */
export const websiteOf = (u: XUser) => u.entities?.url?.urls?.[0]?.expanded_url ?? u.url;
