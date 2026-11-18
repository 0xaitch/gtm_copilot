/**
 * Farcaster via Neynar (free tier, NEYNAR_API_KEY). Many Web3 builders are on Farcaster and
 * verify their X account there — so an X handle we found elsewhere can be turned into a
 * real bio + role without the paid X API.
 */

export interface FcUser {
  username: string;
  displayName?: string;
  bio?: string;
  followers?: number;
  xHandles: string[];
  url: string;
}

const API = "https://api.neynar.com/v2/farcaster";
export const neynarConfigured = () => Boolean(process.env.NEYNAR_API_KEY);

type RawUser = {
  username: string;
  display_name?: string;
  follower_count?: number;
  profile?: { bio?: { text?: string } };
  verified_accounts?: { platform?: string; username?: string }[];
};

const toUser = (u: RawUser): FcUser => ({
  username: u.username,
  displayName: u.display_name,
  bio: u.profile?.bio?.text,
  followers: u.follower_count,
  xHandles: (u.verified_accounts ?? []).filter((a) => a.platform === "x" && a.username).map((a) => a.username!),
  url: `https://farcaster.xyz/${u.username}`,
});

async function get<T>(path: string): Promise<T | null> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`${API}${path}`, { headers: { "x-api-key": key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Farcaster users who verified this X handle. */
export async function farcasterByX(xHandle: string): Promise<FcUser[]> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(xHandle)) return [];
  const r = await get<{ users?: RawUser[] }>(`/user/by_x_username/?x_username=${encodeURIComponent(xHandle)}`);
  return (r?.users ?? []).map(toUser);
}

type RawFull = RawUser & { fid: number; following_count?: number };

export interface FcAccount extends FcUser { fid: number; followingCount?: number }
const toAccount = (u: RawFull): FcAccount => ({ ...toUser(u), fid: u.fid, followingCount: u.following_count });

export async function farcasterUser(username: string): Promise<FcAccount | null> {
  if (!/^[a-z0-9][a-z0-9-.]{0,30}$/i.test(username)) return null;
  const r = await get<{ user?: RawFull }>(`/user/by_username/?username=${encodeURIComponent(username.toLowerCase())}`);
  return r?.user ? toAccount(r.user) : null;
}

/** Accounts this fid follows (with bios). One call, up to 100 users. */
export async function farcasterFollowing(fid: number, limit = 100): Promise<FcUser[]> {
  const r = await get<{ users?: { user?: RawUser }[] }>(`/following/?fid=${fid}&limit=${Math.min(100, limit)}`);
  return (r?.users ?? []).map((x) => x.user).filter((u): u is RawUser => !!u).map(toUser);
}

/** Channel lead (often a team member or the project account). */
export async function farcasterChannelLead(channelId: string): Promise<FcUser | null> {
  if (!/^[a-z0-9-]{2,32}$/i.test(channelId)) return null;
  const r = await get<{ channel?: { lead?: RawUser } }>(`/channel/?id=${encodeURIComponent(channelId.toLowerCase())}&type=id`);
  return r?.channel?.lead ? toUser(r.channel.lead) : null;
}

/**
 * Find the project's own Farcaster account by likely usernames, rejecting squatters:
 * accept only if it isn't verified to a *different* X account and its name/bio names the brand
 * (or it is verified to the project's X handle).
 */
export async function findProjectAccount(
  usernames: string[], ref: { xHandle?: string; brands: string[] },
): Promise<FcAccount | null> {
  for (const name of [...new Set(usernames.map((u) => u.toLowerCase()))].slice(0, 4)) {
    const acc = await farcasterUser(name);
    if (!acc) continue;
    const x = ref.xHandle?.toLowerCase();
    const verifiedToProject = !!x && acc.xHandles.some((h) => h.toLowerCase() === x);
    const verifiedElsewhere = acc.xHandles.length > 0 && !verifiedToProject;
    const text = `${acc.displayName ?? ""} ${acc.bio ?? ""}`.toLowerCase();
    const namesBrand = ref.brands.some((b) => text.includes(b));
    if (verifiedToProject || (!verifiedElsewhere && namesBrand)) return acc;
  }
  return null;
}

export async function farcasterSearch(q: string, limit = 10): Promise<FcUser[]> {
  const r = await get<{ result?: { users?: RawUser[] } }>(`/user/search/?q=${encodeURIComponent(q.slice(0, 50))}&limit=${limit}`);
  return (r?.result?.users ?? []).map(toUser);
}
