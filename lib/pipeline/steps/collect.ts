/** Step 3 — Collect: fetch discovered pages; every source keeps URL + timestamp. */
import { extractLinks, extractTitle, extractXHandles, htmlToText } from "@/lib/connectors/web";
import type { Source } from "@/lib/domain/types";
import type { Step } from "../types";
import { newId } from "../util";

const CONCURRENCY = 4;

export const collect: Step = {
  name: "collect",
  async run(ctx, { fetcher, now }) {
    const queue = [...ctx.links];
    const out: Source[] = [];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        const res = await fetcher.get(url);
        if (!res || res.status >= 400) continue;
        out.push({
          id: newId("src"), url: res.url, kind: "page", fetchedAt: now.toISOString(),
          text: `${extractTitle(res.html) ?? ""} ${htmlToText(res.html)}`.trim(),
          xLinks: extractXHandles(extractLinks(res.html, res.url)),
        });
      }
    }));
    // TODO: recent X posts, GitHub metadata (languages, LOC, audits/ folder), news.
    return { sources: [...ctx.sources, ...out] };
  },
};
