/**
 * News headlines via Google News RSS search (free, no key). Used for funding rounds
 * and other dated events. Headlines are filtered to ones that actually name the project.
 */
import type { DatedPost } from "@/lib/signals/posts";
import { mentionsProject } from "@/lib/signals/posts";

const MAX_AGE_DAYS = 365;

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

export function parseRss(xml: string): { title: string; link: string; pubDate: string }[] {
  const items: { title: string; link: string; pubDate: string }[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag: string) => decode(m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "").trim();
    items.push({ title: get("title"), link: get("link"), pubDate: get("pubDate") });
  }
  return items;
}

/** Search recent crypto headlines about a project; returns only headlines naming it. */
export async function newsFor(names: string[], now: Date): Promise<DatedPost[]> {
  const primary = names.find((n) => n.length >= 3);
  if (!primary) return [];
  const q = `"${primary}" (raises OR raised OR funding OR seed OR "series A" OR mainnet OR testnet OR launch OR exploit OR hack OR partnership) crypto`;
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const cutoff = now.getTime() - MAX_AGE_DAYS * 86_400_000;
    return parseRss(await res.text())
      .map((i) => ({ text: i.title, at: new Date(i.pubDate).toISOString(), url: i.link, origin: "news" as const }))
      .filter((p) => !Number.isNaN(new Date(p.at).getTime()) && new Date(p.at).getTime() >= cutoff)
      .filter((p) => mentionsProject(p.text, names))
      .slice(0, 25);
  } catch {
    return [];
  }
}
