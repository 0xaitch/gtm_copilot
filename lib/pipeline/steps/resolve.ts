/** Step 1 — Resolve: URL or X handle → canonical project with linked handles. */
import { FORUM_HOST_RE, forumBase } from "@/lib/connectors/discourse";
import { extractLinks, extractTitle, extractXHandles, isLocalTarget, pageText } from "@/lib/connectors/web";
import { findProtocolByDomain, findProtocolByHandleFuzzy, findProtocolByTwitter, siteOrigin } from "@/lib/connectors/defillama";
import { parseXHandle, websiteOf } from "@/lib/connectors/x";
import type { Step } from "../types";
import { brandFromDomain, isGenericName, newId, titleCase } from "../util";

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
      // Resolution chain: DefiLlama exact (free) → X API bio link → DefiLlama fuzzy (free) → ask the user.
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
        tried.push("DefiLlama fuzzy");
        const fuzzy = await findProtocolByHandleFuzzy(handle);
        if (fuzzy?.url) {
          website = siteOrigin(fuzzy.url);
          confidence = 0.7;
          ctx = { ...ctx, warnings: [...ctx.warnings, `@${handle} matched "${fuzzy.name}" on DefiLlama by name similarity (listed handle: @${fuzzy.twitter}) — verify it's the right project.`] };
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

    const home = await fetcher.get(website);
    if (!home) {
      // Many sites block bots. If structured data knows the project, continue without the homepage.
      let domain: string | undefined;
      try { domain = new URL(website).hostname.replace(/^www\./, ""); } catch { /* invalid */ }
      const known = domain ? await findProtocolByDomain(domain) : null;
      if (domain && known) {
        return {
          input: { raw, type: xHandle ? "x" : "url" },
          project: {
            name: known.name, domain, website, xHandle: xHandle ?? known.twitter ?? undefined,
            github: known.github?.[0] ? `https://github.com/${known.github[0]}` : undefined,
            resolutionConfidence: 0.8,
          },
          warnings: [...ctx.warnings, `Website ${website} could not be fetched — continuing with structured data only.`],
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
    const titleName = extractTitle(home.html)?.split(/\s+[|\-–—:]\s+/)[0]?.trim() || undefined;
    const brand = brandFromDomain(domain);
    const name = !isGenericName(titleName) ? titleName : brand ? titleCase(brand) : titleName;

    return {
      input: { raw, type: xHandle ? "x" : "url" },
      project: {
        name, domain, website: home.url, xHandle: xHandle ?? found.xHandle, xUserId,
        github: found.github, telegram: found.telegram, docs: found.docs, forum: found.forum,
        resolutionConfidence: confidence,
      },
      links,
      warnings: ctx.warnings,
      sources: [{
        id: newId("src"), url: home.url, kind: "page", fetchedAt: now.toISOString(),
        text: pageText(home.html),
        xLinks: extractXHandles(links),
      }],
    };
  },
};
