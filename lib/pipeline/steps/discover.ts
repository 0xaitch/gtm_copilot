/** Step 2 — Discover: pick the pages worth reading from the link graph. */
import type { Step } from "../types";

const INTERESTING = /(docs|security|audit|team|about|careers|jobs|blog|news|roadmap|tokenomics|token|whitepaper|litepaper|trust|compliance|partners|bug-?bounty)/i;
const MAX_PAGES = 12;

export const discover: Step = {
  name: "discover",
  async run(ctx) {
    const domain = ctx.project.domain;
    if (!domain) return {};
    const sameSite = (u: string) => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, "");
        return h === domain || h.endsWith(`.${domain}`);
      } catch { return false; }
    };
    const seen = new Set(ctx.sources.map((s) => s.url));
    const picks = ctx.links
      .filter((l) => sameSite(l) && INTERESTING.test(l) && !seen.has(l))
      .filter((l) => !/\.(pdf|png|jpe?g|svg|zip)$/i.test(l));
    if (ctx.project.docs && !seen.has(ctx.project.docs)) picks.unshift(ctx.project.docs);
    // TODO: GitHub, funding DBs, launch calendars, TVL trackers → lib/connectors/*
    return { links: [...new Set(picks)].slice(0, MAX_PAGES) };
  },
};
