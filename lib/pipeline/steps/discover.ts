/**
 * Discover: pick the pages worth reading.
 *
 * Many Web3 sites are JavaScript apps whose homepage HTML is an empty shell (no text, no links).
 * So besides links on the homepage we also try the usual places teams publish real content —
 * docs./blog. subdomains, common paths and the sitemap — and follow one level of links from
 * the docs/blog hubs. All fetches go through the SSRF-guarded fetcher.
 */
import { extractLinks, extractXHandles, pageText } from "@/lib/connectors/web";
import type { Source } from "@/lib/domain/types";
import type { Step } from "../types";
import { newId, rootDomain } from "../util";

const INTERESTING = /(docs|security|audit|team|about|careers|jobs|blog|news|roadmap|tokenomics|token|whitepaper|litepaper|trust|compliance|partners|bug-?bounty|faq|overview|introduction|risk|fees|governance)/i;
const SKIP = /\.(pdf|png|jpe?g|svg|gif|webp|zip|mp4|css|js|ico|webmanifest|xml)(\?|$)|\/(login|signup|register|trade|app)(\/|$)/i;
const MAX_PAGES = 16;
const HUB_LINKS = 6;   // links followed from each docs/blog hub
const MIN_LINKS = 5;   // fewer interesting homepage links than this → treat homepage as a JS shell

export const discover: Step = {
  name: "discover",
  async run(ctx, { fetcher, now }) {
    const domain = ctx.project.domain;
    if (!domain) return {};
    const root = rootDomain(domain) ?? domain;
    const sameSite = (u: string) => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, "");
        return h === root || h.endsWith(`.${root}`);
      } catch { return false; }
    };
    const clean = (u: string) => u.replace(/#.*$/, "");
    const seen = new Set(ctx.sources.map((s) => clean(s.url)));
    const picks: string[] = [];
    const pick = (u: string) => {
      const c = clean(u);
      if (!seen.has(c) && sameSite(c) && !SKIP.test(c) && !picks.includes(c)) picks.push(c);
    };

    // 1. homepage links
    for (const l of ctx.links) if (INTERESTING.test(l)) pick(l);
    if (ctx.project.docs) pick(ctx.project.docs);

    const sources: Source[] = [];
    const warnings = [...ctx.warnings];
    if (picks.length < MIN_LINKS) {
      // 2. sitemap
      const sm = await fetcher.get(`https://${domain}/sitemap.xml`);
      if (sm && sm.status < 400) {
        for (const m of sm.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
          if (!/\.xml(\?|$)/i.test(m[1]) && INTERESTING.test(m[1])) pick(m[1]);
        }
      }
      // 3. well-known hubs: fetch them now and follow one level of links
      const hubs = [`https://docs.${root}`, `https://blog.${root}`, `https://${domain}/docs`, `https://${domain}/blog`];
      for (const hub of hubs) {
        if (seen.has(hub)) continue;
        const res = await fetcher.get(hub);
        if (!res || res.status >= 400) continue;
        const text = pageText(res.html);
        if (text.length < 300) continue; // another JS shell
        seen.add(clean(res.url));
        const links = extractLinks(res.html, res.url);
        sources.push({ id: newId("src"), url: res.url, kind: "page", fetchedAt: now.toISOString(), text, xLinks: extractXHandles(links) });
        links.filter((l) => sameSite(l) && !SKIP.test(l)).slice(0, 60)
          .sort((a, b) => Number(INTERESTING.test(b)) - Number(INTERESTING.test(a)))
          .slice(0, HUB_LINKS).forEach(pick);
      }
      // 4. common paths as a last resort
      for (const p of ["about", "team", "careers", "security"]) pick(`https://${domain}/${p}`);
      if (!sources.length && picks.length < MIN_LINKS) {
        warnings.push("Homepage is a JavaScript app with little readable content and no docs/blog found — results will be thin.");
      }
    }

    return { links: picks.slice(0, MAX_PAGES), sources: [...ctx.sources, ...sources], warnings };
  },
};
