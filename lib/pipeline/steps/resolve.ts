/** Step 1 — Resolve: URL or X handle → canonical project with linked handles. */
import { FORUM_HOST_RE, forumBase } from "@/lib/connectors/discourse";
import { blogCandidates, feedLinksInHtml } from "@/lib/connectors/feeds";
import { extractLinks, extractSiteName, extractTitle, extractXHandles, isLocalTarget, pageText } from "@/lib/connectors/web";
import { brandName, coreHandle, findProtocolByDomain, findProtocolByHandleFuzzy, findProtocolByTwitter, siteOrigin } from "@/lib/connectors/defillama";
import { githubOrgForHandle } from "@/lib/connectors/github";
import { parseXHandle, websiteOf } from "@/lib/connectors/x";
import type { Step } from "../types";
import { newId, pickProjectName, rootDomain } from "../util";

/** DefiLlama often lists the dApp (app.x.xyz); the marketing site at the root has the team, docs and socials. */
function rootFirst(site: string): string[] {
  try {
    const host = new URL(site).hostname.replace(/^www\./, "");
    const root = rootDomain(host);
    return root && root !== host ? [`https://${root}/`, site] : [site];
  } catch {
    return [site];
  }
}

/** Shared hosts where a profile lives at a path (medium.com/@proj) — their bare origin is not the project. */
const PROFILE_HOSTS = new Set([
  "medium.com", "mirror.xyz", "paragraph.xyz", "linktr.ee", "linktree.com", "bio.link", "beacons.ai", "carrd.co",
  "github.com", "github.io", "gitlab.com", "x.com", "twitter.com", "t.me", "telegram.me", "discord.gg", "discord.com",
  "youtube.com", "linkedin.com", "facebook.com", "instagram.com", "notion.so", "warpcast.com", "farcaster.xyz",
  "bsky.app", "hey.xyz", "gitbook.com", "google.com", "sites.google.com", "docs.google.com",
]);
/** Blog/newsletter platforms whose subdomains are a blog, not the project's site (proj.substack.com). */
const BLOG_PLATFORMS = ["medium.com", "substack.com", "mirror.xyz", "paragraph.xyz", "hashnode.dev", "blogspot.com", "wordpress.com", "notion.site", "linktr.ee"];

/** Is this origin plausibly the project's own website (not a shared host it merely has a profile on)? */
export function isProjectSite(origin: string): boolean {
  let host: string;
  try { host = new URL(origin).hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
  if (PROFILE_HOSTS.has(host)) return false;
  return !BLOG_PLATFORMS.some((p) => host.endsWith(`.${p}`));
}

function classifyLinks(links: string[]) {
  const pick = (re: RegExp) => links.find((l) => re.test(l));
  const x = pick(/^https?:\/\/(www\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/?$/i);
  return {
    xHandle: x ? parseXHandle(x) ?? undefined : undefined,
    github: pick(/^https?:\/\/(www\.)?github\.com\/[^/]+\/?$/i) ?? pick(/github\.com\//i),
    telegram: pick(/^https?:\/\/(t\.me|telegram\.me)\//i),
    docs: pick(/^https?:\/\/docs\.|gitbook\.io|\/docs\/?$/i),
    forum: forumBase(pick(FORUM_HOST_RE) ?? "") ?? undefined,
  };
}

export const resolve: Step = {
  name: "resolve",
  async run(ctx, { fetcher, now, x }) {
    const raw = ctx.input.raw.trim();
    const handle = parseXHandle(raw);
    let website: string | undefined;
    let xHandle: string | undefined;
    let confidence = 0.6;
    let xUserId: string | undefined;
    let githubFromOrg: string | undefined;

    if (!raw.startsWith("@") && isLocalTarget(raw)) {
      return {
        input: { raw },
        halted: { stage: "resolve", reason: "Local and private network addresses aren't allowed — enter a public project website or X handle." },
      };
    }

    if (!handle && (raw.startsWith("@") || !raw.includes("."))) {
      return {
        input: { raw },
        halted: { stage: "resolve", reason: `"${raw}" is neither a valid X handle (1–15 letters, digits, _) nor a website.` },
      };
    }

    // "@foo", "foo" (no dot → can't be a domain) or an x.com/twitter.com profile URL
    if (handle) {
      // Resolution chain: DefiLlama exact (free) → X API bio link → GitHub org profile (free)
      // → DefiLlama fuzzy (free) → ask the user.
      xHandle = handle;
      const tried: string[] = [];
      const llama = await findProtocolByTwitter(handle);
      tried.push("DefiLlama");
      if (llama?.url) {
        website = siteOrigin(llama.url);
        confidence = 0.9;
      }
      if (!website && x) {
        tried.push("X API");
        const u = await x.userByUsername(handle);
        website = u ? websiteOf(u) : undefined;
        xUserId = u?.id;
        confidence = 0.85;
      }
      if (!website) {
        tried.push("GitHub");
        const org = await githubOrgForHandle(handle, [coreHandle(handle)]);
        const site = org?.blog ? siteOrigin(/^https?:\/\//i.test(org.blog) ? org.blog : `https://${org.blog}`) : undefined;
        if (org && site && !isProjectSite(site)) {
          ctx = { ...ctx, notes: [...ctx.notes, `GitHub org ${org.login} lists ${org.blog} — a shared hosting/profile site, not the project's website, so it wasn't used.`] };
        } else if (org && site) {
          website = site;
          githubFromOrg = org.html_url;
          confidence = 0.85; // the org's own profile names this X handle
          ctx = { ...ctx, notes: [...ctx.notes, `Found the website via the GitHub org ${org.login}, whose profile lists @${handle}.`] };
        }
      }
      if (!website) {
        tried.push("DefiLlama fuzzy");
        const fuzzy = await findProtocolByHandleFuzzy(handle);
        if (fuzzy?.url) {
          website = siteOrigin(fuzzy.url);
          confidence = 0.7;
          ctx = { ...ctx, warnings: [...ctx.warnings, `@${handle} matched "${await brandName(fuzzy)}" on DefiLlama by name similarity (listed handle: @${fuzzy.twitter}) — verify it's the right project.`] };
        }
      }
      if (!website) {
        return {
          input: { raw, type: "x" },
          project: { xHandle },
          halted: {
            stage: "resolve",
            reason: `Couldn't map @${handle} to a website (tried: ${tried.join(", ")}${x ? "" : "; X API not configured"}). Paste the project website instead.`,
          },
        };
      }
    } else {
      website = raw.startsWith("http") ? raw : `https://${raw}`;
    }

    let home = null;
    for (const candidate of xHandle ? rootFirst(website) : [website]) {
      home = await fetcher.get(candidate);
      if (home) break;
    }
    if (!home) {
      // Many sites block bots. If structured data knows the project, continue without the homepage.
      let domain: string | undefined;
      try { domain = new URL(website).hostname.replace(/^www\./, ""); } catch { /* invalid */ }
      const known = domain ? await findProtocolByDomain(domain) : null;
      if (domain && known) {
        return {
          input: { raw, type: xHandle ? "x" : "url" },
          project: {
            name: await brandName(known), domain, website, xHandle: xHandle ?? known.twitter ?? undefined,
            github: githubFromOrg ?? (known.github?.[0] ? `https://github.com/${known.github[0]}` : undefined),
            blogPages: blogCandidates([], rootDomain(domain) ?? domain).pages,
            resolutionConfidence: 0.8,
          },
          warnings: [...ctx.warnings, `Website ${website} could not be fetched — continuing with structured data only.`],
          notes: ctx.notes,
        };
      }
      return {
        input: { raw, type: xHandle ? "x" : "url" },
        project: { website, xHandle },
        halted: { stage: "resolve", reason: `Could not fetch ${website}` },
      };
    }

    const links = extractLinks(home.html, home.url);
    const found = classifyLinks(links);
    if (xHandle && found.xHandle?.toLowerCase() === xHandle.toLowerCase()) confidence = 0.95; // bidirectional link
    else if (!xHandle && found.xHandle) confidence = 0.85;
    const domain = new URL(home.url).hostname.replace(/^www\./, "");
    const name = pickProjectName(extractTitle(home.html), extractSiteName(home.html), domain);
    const blog = blogCandidates(links, rootDomain(domain) ?? domain);

    return {
      input: { raw, type: xHandle ? "x" : "url" },
      project: {
        name, domain, website: home.url, xHandle: xHandle ?? found.xHandle, xUserId,
        github: githubFromOrg ?? found.github, telegram: found.telegram, docs: found.docs, forum: found.forum,
        feeds: [...new Set([...feedLinksInHtml(home.html, home.url), ...blog.feeds])],
        blogPages: blog.pages,
        resolutionConfidence: confidence,
      },
      links,
      warnings: ctx.warnings,
      notes: ctx.notes,
      sources: [{
        id: newId("src"), url: home.url, kind: "page", fetchedAt: now.toISOString(),
        text: pageText(home.html),
        xLinks: extractXHandles(links),
      }],
    };
  },
};
