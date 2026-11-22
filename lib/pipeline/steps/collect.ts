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
    const failed = new Set<string>();
    // discover queues hint URLs without their #fragment; compare in the same form
    const unfrag = (u: string) => u.replace(/#.*$/, "");
    const hinted = new Set((ctx.hints?.urls ?? []).map(unfrag));
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const url = queue.shift()!;
        const res = await fetcher.get(url);
        if (!res || res.status >= 400) { failed.add(url); continue; }
        const text = pageText(res.html);
        if (seenText.has(text)) continue;
        seenText.add(text);
        out.push({
          id: newId("src"), url: res.url, kind: "page", fetchedAt: now.toISOString(),
          text, xLinks: extractXHandles(extractLinks(res.html, res.url)),
          // mark by the URL we queued, not res.url: an own page may redirect to another host (docs on gitbook.io)
          fromHint: hinted.has(url) || undefined,
        });
      }
    }));
    // Tell the user which of their links couldn't be read (bot protection, login wall, not a web page).
    const missed = (ctx.hints?.urls ?? []).filter((u) => failed.has(unfrag(u)));
    const warnings = missed.length
      ? [...ctx.warnings, `Couldn't read ${missed.length === 1 ? "this link you added" : "these links you added"} (blocked, login-only or not a web page): ${missed.join(", ")}`]
      : ctx.warnings;
    return { sources: [...ctx.sources, ...out], warnings };
  },
};
