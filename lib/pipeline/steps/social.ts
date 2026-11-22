/**
 * Social & news: dated, sourced updates → funding + why-now facts.
 *  - Google News RSS (free): funding rounds, launches, partnerships, incidents
 *  - Telegram public channel preview (free)
 *  - Project blog via RSS/Atom: site feed, Medium, Substack, Mirror, Paragraph (free)
 *  - Project's own recent X posts (X API, pay-per-use)
 */
import { forumLatest, isDiscourse } from "@/lib/connectors/discourse";
import { blogPosts } from "@/lib/connectors/feeds";
import { newsFor } from "@/lib/connectors/news";
import { parseTelegramChannel, telegramPosts } from "@/lib/connectors/telegram";
import { factsFromPosts } from "@/lib/signals/posts";
import type { Step } from "../types";
import { coreHandle } from "@/lib/connectors/defillama";
import { brandFromDomain, isGenericName, rootDomain } from "../util";
import { buildProfile } from "./profile";

const X_POSTS = Number(process.env.X_MAX_PROJECT_POSTS ?? 30);

export const social: Step = {
  name: "social",
  async run(ctx, { now, x, fetcher }) {
    const project = { ...ctx.project };
    const warnings = [...ctx.warnings];
    const notes = [...ctx.notes];
    // Brand tokens for news matching: domain brand ("ethena") > handle core > page name.
    // Generic words ("App") are never used — they attribute other companies' news to this project.
    const names = [...new Set([
      brandFromDomain(project.domain),
      project.xHandle ? coreHandle(project.xHandle) : undefined,
      project.name,
    ].filter((n): n is string => !!n && n.length >= 4 && !isGenericName(n)).map((n) => n.toLowerCase()))];

    const domain = rootDomain(project.domain) ?? project.domain;
    const [news, tg, forum, blog] = await Promise.all([
      newsFor(names, now),
      (async () => {
        const ch = parseTelegramChannel(project.telegram);
        return ch ? telegramPosts(ch, 20) : [];
      })(),
      (async () => {
        if (!project.forum || !(await isDiscourse(fetcher, project.forum))) return [];
        return forumLatest(fetcher, project.forum, 20);
      })(),
      blogPosts(fetcher, {
        feeds: project.feeds ?? [],
        pages: project.blogPages ?? (domain ? [`https://blog.${domain}`] : []),
        now,
      }),
    ]);
    if (blog.feeds.length) notes.push(`Blog: ${blog.posts.length} dated posts from ${blog.feeds.length} feed${blog.feeds.length > 1 ? "s" : ""}.`);

    let xPosts: Awaited<ReturnType<NonNullable<typeof x>["recentPosts"]>> = [];
    if (x && project.xHandle) {
      if (!project.xUserId) project.xUserId = (await x.userByUsername(project.xHandle))?.id;
      if (project.xUserId) xPosts = await x.recentPosts(project.xUserId, project.xHandle, X_POSTS);
    } else if (!x) {
      notes.push("X API off — using free sources (news, Telegram, governance forum, GitHub, Farcaster, Bluesky).");
    }

    const facts = [
      ...ctx.facts,
      ...factsFromPosts([...xPosts, ...tg, ...forum, ...blog.posts], { ownChannel: true }),
      ...factsFromPosts(news, { ownChannel: false, names }),
    ];
    const next = { ...ctx, facts, project };
    return {
      facts, project, warnings, notes,
      profile: buildProfile(next),
      usage: { ...ctx.usage, ...(x ? { x: { ...x.usage } } : {}) },
      sources: [
        ...ctx.sources,
        ...[...xPosts, ...tg, ...forum, ...blog.posts, ...news].map((p, i) => ({
          id: `post_${i}`, url: p.url,
          kind: ({ news: "news", x: "x_post", telegram: "telegram", forum: "forum", blog: "blog" } as const)[p.origin],
          fetchedAt: now.toISOString(), text: p.text,
        })),
      ],
    };
  },
};
