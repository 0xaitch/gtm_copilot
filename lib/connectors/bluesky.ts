/** Bluesky public AppView (free, no key): actor search for people whose bio names the project. */

export interface BskyActor { handle: string; displayName?: string; description?: string; url: string }

export async function blueskySearch(q: string, limit = 25): Promise<BskyActor[]> {
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(q.slice(0, 60))}&limit=${limit}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return [];
    const j = (await res.json()) as { actors?: { handle: string; displayName?: string; description?: string }[] };
    return (j.actors ?? []).map((a) => ({ ...a, url: `https://bsky.app/profile/${a.handle}` }));
  } catch {
    return [];
  }
}
