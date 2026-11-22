/**
 * Project blogs via RSS/Atom (free, no key). Teams usually post the same announcements here as on X
 * (launches, audits, partnerships, raises) — with dates — so this is the main free substitute for
 * reading the project's X timeline.
 *
 * Feeds are found from:
 *  - <link rel="alternate" type="application/rss+xml|atom+xml"> on the homepage and blog pages
 *  - blog links on the site: Medium, Substack, Mirror, Paragraph, blog.<domain>, /blog
 * All fetches go through the SSRF-guarded fetcher.
 */
import type { DatedPost } from "@/lib/signals/posts";
import { htmlToText, type Fetcher } from "./web";

const MAX_AGE_DAYS = 365;
const MAX_FEEDS = 3;
const MAX_PAGE_FETCHES = 4;

/** Feed URLs advertised in a page's <head>. */
export function feedLinksInHtml(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    try {
      const u = new URL(href.replace(/&amp;/g, "&"), base).toString();
      if (!/comments\/feed|\/comments\b/i.test(u)) out.add(u); // skip WordPress comment feeds
    } catch { /* ignore */ }
  }
  return [...out];
}

/**
 * From links on the project's site: direct feed URLs for platforms with a known pattern, and
 * blog pages to open and look for <link rel="alternate">.
 */
export function blogCandidates(links: string[], domain?: string): { feeds: string[]; pages: string[] } {
  const feeds = new Set<string>();
  const pages = new Set<string>();
  for (const l of links) {
    let u: URL;
    try { u = new URL(l); } catch { continue; }
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const seg = u.pathname.split("/").filter(Boolean);
    if (host === "medium.com" && seg[0]) feeds.add(`https://medium.com/feed/${seg[0]}`);          // @user or publication
    else if (host.endsWith(".medium.com")) feeds.add(`https://${host}/feed`);
    else if (host.endsWith(".substack.com")) feeds.add(`https://${host}/feed`);
    else if ((host === "mirror.xyz" && seg[0]) || host.endsWith(".mirror.xyz")) pages.add(host === "mirror.xyz" ? `https://mirror.xyz/${seg[0]}` : `https://${host}`);
    else if ((host === "paragraph.xyz" || host === "paragraph.com") && seg[0]?.startsWith("@")) pages.add(`https://${host}/${seg[0]}`);
    else if (domain && (host === `blog.${domain}` || ((host === domain || host.endsWith(`.${domain}`)) && /^\/(blog|news|updates)\/?$/i.test(u.pathname)))) pages.add(`${u.origin}${u.pathname}`);
  }
  if (domain) pages.add(`https://blog.${domain}`);
  return { feeds: [...feeds], pages: [...pages] };
}

function decode(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

/** RSS <item>s and Atom <entry>s → title, link, date, summary. */
export function parseFeed(xml: string): { title: string; link: string; date: string; summary: string }[] {
  const out: { title: string; link: string; date: string; summary: string }[] = [];
  const get = (block: string, tag: string) =>
    decode(block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? "");
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const b = m[1];
    out.push({
      title: htmlToText(get(b, "title")), link: get(b, "link"),
      date: get(b, "pubDate") || get(b, "dc:date"),
      summary: htmlToText(get(b, "description") || get(b, "content:encoded")),
    });
  }
  for (const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
    const b = m[1];
    const link = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1]
      ?? b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? "";
    out.push({
      title: htmlToText(get(b, "title")), link,
      date: get(b, "published") || get(b, "updated"),
      summary: htmlToText(get(b, "summary") || get(b, "content")),
    });
  }
  return out;
}

const looksLikeFeed = (body: string) => /<(rss|feed)\b/i.test(body.slice(0, 2000));

/**
 * Recent dated posts from the project's blog(s): `feeds` are known feed URLs, `pages` are blog
 * pages to open and look for feed links (see blogCandidates / feedLinksInHtml).
 */
export async function blogPosts(
  fetcher: Fetcher, opts: { feeds: string[]; pages: string[]; now: Date; max?: number },
): Promise<{ posts: DatedPost[]; feeds: string[] }> {
  const queue = [...new Set(opts.feeds)];
  for (const page of opts.pages.slice(0, MAX_PAGE_FETCHES)) {
    if (queue.length >= MAX_FEEDS * 2) break;
    const res = await fetcher.get(page);
    if (!res) continue;
    if (looksLikeFeed(res.html)) queue.push(res.url);
    else queue.push(...feedLinksInHtml(res.html, res.url));
  }

  const cutoff = opts.now.getTime() - MAX_AGE_DAYS * 86_400_000;
  const used: string[] = [];
  const seen = new Set<string>();
  const posts: DatedPost[] = [];
  for (const feed of [...new Set(queue)]) {
    if (used.length >= MAX_FEEDS) break;
    const res = await fetcher.get(feed);
    if (!res || !looksLikeFeed(res.html)) continue;
    used.push(feed);
    for (const item of parseFeed(res.html)) {
      const at = new Date(item.date);
      if (Number.isNaN(at.getTime()) || at.getTime() < cutoff || at.getTime() > opts.now.getTime() + 86_400_000) continue;
      const key = item.link || item.title;
      if (!item.title || seen.has(key)) continue;
      seen.add(key);
      // Titles only: announcement titles are precise, while long bodies mention "launch", "audit" etc. in passing.
      posts.push({ text: item.title, at: at.toISOString(), url: item.link || feed, origin: "blog" });
    }
  }
  posts.sort((a, b) => b.at.localeCompare(a.at));
  return { posts: posts.slice(0, opts.max ?? 20), feeds: used };
}
