/**
 * Social & news: dated, sourced updates → funding + why-now facts.
 *  - Google News RSS (free): funding rounds, launches, partnerships, incidents
 *  - Telegram public channel preview (free)
 *  - Project's own recent X posts (X API, pay-per-use)
 */
import { forumLatest, isDiscourse } from "@/lib/connectors/discourse";
import { newsFor } from "@/lib/connectors/news";
import { parseTelegramChannel, telegramPosts } from "@/lib/connectors/telegram";
import { factsFromPosts } from "@/lib/signals/posts";
import type { Step } from "../types";
import { coreHandle } from "@/lib/connectors/defillama";
import { brandFromDomain, isGenericName } from "../util";
import { buildProfile } from "./profile";

const X_POSTS = Number(process.env.X_MAX_PROJECT_POSTS ?? 30);

export const social: Step = {
  name: "social",
  async run(ctx, { now, x, fetcher }) {
    const project = { ...ctx.project };
    const warnings = [...ctx.warnings];
    // Brand tokens for news matching: domain brand ("ethena") > handle core > page name.
    // Generic words ("App") are never used — they attribute other companies' news to this project.
    const names = [...new Set([
      brandFromDomain(project.domain),
      project.xHandle ? coreHandle(project.xHandle) : undefined,
      project.name,
    ].filter((n): n is string => !!n && n.length >= 4 && !isGenericName(n)).map((n) => n.toLowerCase()))];

    const [news, tg, forum] = await Promise.all([
      newsFor(names, now),
      (async () => {
        const ch = parseTelegramChannel(project.telegram);
        return ch ? telegramPosts(ch, 20) : [];
      })(),
      (async () => {
        if (!project.forum || !(await isDiscourse(fetcher, project.forum))) return [];
        return forumLatest(fetcher, project.forum, 20);
      })(),
    ]);

    let xPosts: Awaited<ReturnType<NonNullable<typeof x>["recentPosts"]>> = [];
    if (x && project.xHandle) {
      if (!project.xUserId) project.xUserId = (await x.userByUsername(project.xHandle))?.id;
      if (project.xUserId) xPosts = await x.recentPosts(project.xUserId, project.xHandle, X_POSTS);
    } else if (!x) {
      warnings.push("X API not configured — using free sources (news, Telegram, governance forum, GitHub, Farcaster/Bluesky) instead of X posts.");
    }

    const facts = [
      ...ctx.facts,
      ...factsFromPosts([...xPosts, ...tg, ...forum], { ownChannel: true }),
      ...factsFromPosts(news, { ownChannel: false }),
    ];
    const next = { ...ctx, facts, project };
    return {
      facts, project, warnings,
      profile: buildProfile(next),
      usage: { ...ctx.usage, ...(x ? { x: { ...x.usage } } : {}) },
      sources: [
        ...ctx.sources,
        ...[...xPosts, ...tg, ...forum, ...news].map((p, i) => ({
          id: `post_${i}`, url: p.url,
          kind: ({ news: "news", x: "x_post", telegram: "telegram", forum: "forum" } as const)[p.origin],
          fetchedAt: now.toISOString(), text: p.text,
        })),
      ],
    };
  },
};
