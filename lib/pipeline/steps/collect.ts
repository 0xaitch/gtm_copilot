/** Step 3 — Collect: fetch discovered pages; every source keeps URL + timestamp. */
import { extractLinks, extractXHandles, pageText } from "@/lib/connectors/web";
import type { Source } from "@/lib/domain/types";
import type { Step } from "../types";
import { newId } from "../util";

const CONCURRENCY = 4;

export const collect: Step = {
  name: "collect",
  async run(ctx, { fetcher, now }) {
    const queue = [...ctx.links];
    const out: Source[] = [];
    // JS apps serve the same shell for every path (/about, /team…) — drop pages we've already seen
    const seenText = new Set(ctx.sources.map((s) => s.text));
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        const res = await fetcher.get(url);
        if (!res || res.status >= 400) continue;
        const text = pageText(res.html);
        if (seenText.has(text)) continue;
        seenText.add(text);
        out.push({
          id: newId("src"), url: res.url, kind: "page", fetchedAt: now.toISOString(),
          text, xLinks: extractXHandles(extractLinks(res.html, res.url)),
        });
      }
    }));
    return { sources: [...ctx.sources, ...out] };
  },
};
