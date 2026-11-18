/**
 * Public-web fetcher with SSRF guards. Passive reads only — never probe or scan.
 *
 * User-supplied URLs (and links found on prospect sites) must never make this machine
 * fetch from itself or the local network. Every hop is checked:
 *  - http(s) only, default ports only, no credentials in the URL
 *  - hostname is resolved and EVERY resolved address must be public
 *  - redirects are followed manually (max 5) and each target is re-checked before fetching
 * Residual risk: DNS rebinding between our lookup and fetch's own lookup. The server only
 * listens on 127.0.0.1, so only the local user can trigger fetches at all.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface FetchResult { url: string; status: number; html: string }
export interface Fetcher { get(url: string): Promise<FetchResult | null> }

const BLOCKED_NAMES = /(^localhost$|\.localhost$|\.local$|\.internal$|\.lan$|\.home$|\.corp$|\.intranet$)/i;

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
}
const V4_PRIVATE: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return V4_PRIVATE.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return s === "::" || s === "::1" || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith("64:ff9b:") || s.startsWith("2001:db8:");
  }
  return true; // not an IP → caller must resolve first
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("only http(s) URLs allowed");
  if (url.username || url.password) throw new Error("credentials in URL not allowed");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("non-standard ports not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_NAMES.test(host)) throw new Error("local hostnames not allowed");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("private addresses not allowed");
    return url;
  }
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("host resolves to a private address");
  return url;
}

const MAX_REDIRECTS = 5;

export function createFetcher(opts: { timeoutMs?: number; maxBytes?: number } = {}): Fetcher {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxBytes = opts.maxBytes ?? 2_000_000;
  return {
    async get(raw) {
      try {
        let url = await assertPublicUrl(raw);
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          const res = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(timeoutMs),
            headers: { "user-agent": "Mozilla/5.0 (compatible; GTMCopilotBot/0.1)" },
          });
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (!loc) return null;
            url = await assertPublicUrl(new URL(loc, url).toString()); // check BEFORE following
            continue;
          }
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("json") && !ct.includes("xml")) return null;
          const html = (await res.text()).slice(0, maxBytes);
          return { url: url.toString(), status: res.status, html };
        }
        return null; // too many redirects
      } catch {
        return null;
      }
    },
  };
}

/* ---------------- HTML helpers (no DOM dependency) ---------------- */

export function extractLinks(html: string, base: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    try { out.add(new URL(m[1], base).toString()); } catch { /* ignore */ }
  }
  return [...out];
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined;
}

/** X/Twitter profile handles linked from a page (team pages, footers, author bylines). */
export function extractXHandles(links: string[]): string[] {
  const out = new Set<string>();
  for (const l of links) {
    const m = l.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:\?.*)?$/i);
    if (m && !["home", "intent", "share", "search", "i", "explore", "hashtag"].includes(m[1].toLowerCase())) out.add(m[1]);
  }
  return [...out];
}
