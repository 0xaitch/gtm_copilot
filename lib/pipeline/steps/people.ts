/**
 * People: find decision makers and check they're really affiliated with the project.
 *
 * Free sources (default):
 *  1. X profiles linked from the project's own website pages (team/about/footer)
 *  0. Handles you add as hints (checked like any other lead, never trusted blindly)
 *  2. GitHub top contributors and public org members (name, bio, company, X handle) — optional GITHUB_TOKEN
 *  3. Governance forum (Discourse) team groups (name, title, bio)
 *  4. Farcaster (Neynar free tier, NEYNAR_API_KEY): bios for X handles found above
 *     (users who verified that X account) + search on the project name
 *  5. Bluesky public search on the project name
 * Optional paid: X API affiliates, user search, bios and a skim of key people's posts.
 *
 * Affiliation:
 *  strong — X affiliate badge / bio names project AND states a role / listed on project site
 *           with role or mention / member of a forum group named after the project
 *  medium — bio names the project (no role) / GitHub contributor with role or matching company /
 *           member of a generic team group on the project's forum
 *  weak   — dropped
 */
import { blueskySearch } from "@/lib/connectors/bluesky";
import { forumTeam, isDiscourse } from "@/lib/connectors/discourse";
import { coreHandle } from "@/lib/connectors/defillama";
import {
  farcasterByX, farcasterChannelLead, farcasterFollowing, farcasterSearch, findProjectAccount, neynarConfigured,
} from "@/lib/connectors/farcaster";
import { githubOrgMembers, githubPeople, githubRateLimited, parseGithubOwner } from "@/lib/connectors/github";
import type { XUser } from "@/lib/connectors/x";
import { FK } from "@/lib/domain/fact-keys";
import type { Contact, Fact } from "@/lib/domain/types";
import { bioMentionsProject, isFormer, roleFromBio, roleNamesOtherOrg } from "@/lib/signals/people";
import type { Step } from "../types";
import { brandFromDomain, isGenericName, newId } from "../util";
import { ownSiteChecker } from "./extract";
import { buildProfile } from "./profile";

const MAX_LOOKUPS = Number(process.env.X_MAX_PEOPLE_LOOKUPS ?? 30);
const MAX_AFFILIATES = Number(process.env.X_MAX_AFFILIATES ?? 40);
const MAX_SEARCH = Number(process.env.X_MAX_SEARCH_USERS ?? 15);
const SKIM_PEOPLE = Number(process.env.X_SKIM_PEOPLE ?? 3);
const MAX_FARCASTER_LOOKUPS = Number(process.env.NEYNAR_MAX_LOOKUPS ?? 15);
const MAX_CONTACTS = 15;
const DECISION_ROLES = /founder|ceo|cto|ciso|chief|head of|vp |lead/i;
const SECURITY_TALK = /\b(audit|security|exploit|vulnerab|bug bounty|pentest|mainnet|testnet|launch)\w*/i;

type Via = "hint" | "hint-page" | "site" | "site-name" | "github" | "github-org" | "forum" | "forum-brand" | "fc-following" | "farcaster" | "bluesky" | "affiliate" | "search";

interface Candidate {
  handle?: string;          // X handle (no @)
  name?: string;
  bio?: string;
  bioSource?: string;       // where the bio text came from
  company?: string;
  title?: string;           // forum title
  followers?: number;
  links: Set<string>;       // profile URLs across platforms
  via: Set<Via>;
  notes: string[];
}

const X_LINK = /(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\b/i;

export const people: Step = {
  name: "people",
  async run(ctx, { x, fetcher }) {
    const project = ctx.project;
    const projectHandle = project.xHandle?.toLowerCase();
    const brand = brandFromDomain(project.domain);
    const brands = [...new Set([brand, project.xHandle ? coreHandle(project.xHandle) : undefined, project.name?.toLowerCase()]
      .filter((b): b is string => !!b && b.length >= 4 && !isGenericName(b)))];
    const searchName = project.name && !isGenericName(project.name) ? project.name : brand;
    const warnings = [...ctx.warnings];
    const notes = [...ctx.notes];

    const cands = new Map<string, Candidate>();
    const add = (key: string, c: Partial<Omit<Candidate, "links" | "via" | "notes">> & { link?: string; note?: string }, via: Via) => {
      if (c.handle && c.handle.toLowerCase() === projectHandle) return;
      const k = c.handle ? `x:${c.handle.toLowerCase()}` : key;
      const cur = cands.get(k) ?? { links: new Set<string>(), via: new Set<Via>(), notes: [] };
      for (const [f, v] of Object.entries(c)) {
        if (v == null || ["link", "note"].includes(f)) continue;
        // first value wins (sources are added most-authoritative first)
        (cur as unknown as Record<string, unknown>)[f] ??= v;
      }
      if (c.link) cur.links.add(c.link);
      if (c.note) cur.notes.push(c.note);
      cur.via.add(via);
      cands.set(k, cur);
    };

    // 0. your hints — added first so they get bio lookups before anything else
    for (const h of ctx.hints?.handles ?? []) add(`x:${h}`, { handle: h, link: `https://x.com/${h}`, note: "added by you" }, "hint");

    // 1. website-linked X profiles (skip pages linking dozens — partner/ecosystem lists)
    // Pages you added from other sites are hints, not the project's own website.
    const ownSite = ownSiteChecker(project.domain);
    for (const s of ctx.sources) {
      if (s.kind !== "page" || !s.xLinks?.length || s.xLinks.length > 25) continue;
      const own = ownSite(s);
      for (const h of s.xLinks) add(`x:${h}`, { handle: h, link: `https://x.com/${h}`, note: `linked from ${s.url}${own ? "" : " (a page you added)"}` }, own ? "site" : "hint-page");
    }

    // 2. GitHub contributors
    const owner = parseGithubOwner(project.github);
    if (owner) {
      for (const g of await githubPeople(owner)) {
        add(`gh:${g.login}`, {
          handle: g.twitter_username ?? undefined, name: g.name ?? g.login, company: g.company ?? undefined,
          bio: g.bio ?? undefined, bioSource: g.bio ? "GitHub bio" : undefined, link: g.html_url,
        }, "github");
      }
      for (const g of await githubOrgMembers(owner)) {
        add(`gh:${g.login}`, {
          handle: g.twitter_username ?? undefined, name: g.name ?? g.login, company: g.company ?? undefined,
          bio: g.bio ?? undefined, bioSource: g.bio ? "GitHub bio" : undefined, link: g.html_url,
          note: `public member of the ${owner} GitHub org`,
        }, "github-org");
      }
      if (githubRateLimited()) {
        const w = "GitHub rate limit hit — some contributors may be missing. Set GITHUB_TOKEN for complete data.";
        if (!warnings.includes(w)) warnings.push(w);
      }
    }

    // 3. Governance forum team groups
    if (project.forum && (await isDiscourse(fetcher, project.forum))) {
      for (const m of await forumTeam(fetcher, project.forum, brands)) {
        const handle = (m.website ?? m.bio ?? "").match(X_LINK)?.[1];
        const branded = brands.some((b) => m.group.toLowerCase().includes(b));
        add(`forum:${m.username}`, {
          handle, name: m.name, title: m.title, bio: m.bio, bioSource: m.bio ? "forum bio" : undefined,
          link: m.profileUrl, note: `member of forum group "${m.group}"`,
        }, branded ? "forum-brand" : "forum");
      }
    }

    // 4. Farcaster (free Neynar key)
    if (neynarConfigured()) {
      // 4a. the project's own account → people it follows whose bio names the project
      const usernames = [project.xHandle, brand, project.xHandle ? coreHandle(project.xHandle) : undefined, searchName?.replace(/\s+/g, "")]
        .filter((u): u is string => !!u);
      const fcProject = await findProjectAccount(usernames, { xHandle: project.xHandle, brands });
      if (fcProject) {
        const following = await farcasterFollowing(fcProject.fid, 100);
        const lead = brand ? await farcasterChannelLead(brand) : null;
        const pool = [...following, ...(lead && lead.username !== fcProject.username ? [lead] : [])];
        for (const u of pool) {
          if (!bioMentionsProject(u.bio, { handle: project.xHandle, name: searchName, domain: project.domain })) continue;
          const isLead = u === lead;
          add(`fc:${u.username}`, {
            handle: u.xHandles[0], name: u.displayName, bio: u.bio, bioSource: "Farcaster bio", followers: u.followers, link: u.url,
            note: isLead ? `lead of the /${brand} Farcaster channel` : `followed by the project's Farcaster account @${fcProject.username}`,
          }, "fc-following");
        }
      }

      // 4a'. people named on the site/docs without a handle → exact display-name match on Farcaster
      const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const named = ctx.facts.filter((f) => f.key === FK.contact)
        .map((f) => f.value as Contact).filter((c) => c.name && !c.handle).slice(0, 5);
      for (const person of named) {
        const hit = (await farcasterSearch(person.name!, 5)).find((u) => norm(u.displayName) === norm(person.name));
        if (!hit) continue;
        add(`fc:${hit.username}`, {
          handle: hit.xHandles[0], name: person.name, bio: hit.bio, bioSource: "Farcaster bio",
          followers: hit.followers, link: hit.url, note: `same name as "${person.name}" (${person.role}) on the project site`,
        }, "site-name");
      }

      // 4b. bios for X handles found elsewhere (people who verified that X account on Farcaster)
      const handles = [...cands.values()].filter((c) => c.handle && !c.bio).map((c) => c.handle!).slice(0, MAX_FARCASTER_LOOKUPS);
      const results = await Promise.all(handles.map(async (h) => [h, (await farcasterByX(h))[0]] as const));
      for (const [h, fc] of results) {
        if (fc) add(`x:${h}`, { handle: h, name: fc.displayName, bio: fc.bio, bioSource: `Farcaster bio (verified X @${h})`, followers: fc.followers, link: fc.url }, "farcaster");
      }
      if (searchName) {
        for (const fc of await farcasterSearch(searchName, 10)) {
          add(`fc:${fc.username}`, { handle: fc.xHandles[0], name: fc.displayName, bio: fc.bio, bioSource: "Farcaster bio", followers: fc.followers, link: fc.url }, "farcaster");
        }
      }
    }

    // 5. Bluesky search
    if (searchName) {
      for (const a of await blueskySearch(searchName, 25)) {
        if (!bioMentionsProject(a.description, { handle: project.xHandle, name: searchName, domain: project.domain })) continue;
        add(`bsky:${a.handle}`, { name: a.displayName, bio: a.description, bioSource: "Bluesky bio", link: a.url }, "bluesky");
      }
    }

    // Optional paid: X API
    if (x && project.xHandle) {
      const projectUserId = project.xUserId ?? (await x.userByUsername(project.xHandle))?.id;
      if (projectUserId) for (const u of await x.affiliates(projectUserId, MAX_AFFILIATES)) addX(u, "affiliate");
      if (searchName) for (const u of await x.searchUsers(searchName, MAX_SEARCH)) addX(u, "search");
      const need = [...cands.values()].filter((c) => c.handle && !c.bio).map((c) => c.handle!).slice(0, MAX_LOOKUPS);
      for (const u of await x.usersByUsernames(need)) addX(u, [...(cands.get(`x:${u.username.toLowerCase()}`)?.via ?? ["search"])][0] as Via);
    }
    function addX(u: XUser, via: Via) {
      add(`x:${u.username}`, { handle: u.username, name: u.name, bio: u.description, bioSource: "X bio", followers: u.public_metrics?.followers_count, link: `https://x.com/${u.username}` }, via);
    }

    // Classify
    const ref = { handle: project.xHandle, name: searchName, domain: project.domain };
    const scored: { contact: Contact; score: number }[] = [];
    const norm = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const brandNames = new Set([...brands, searchName].map(norm).filter(Boolean));
    for (const c of cands.values()) {
      // An account named after the project is the project (or an impersonator), not a person.
      if (c.name && brandNames.has(norm(c.name))) continue;
      const text = [c.bio, c.title].filter(Boolean).join(" · ");
      const hit = roleFromBio(text);
      const mention = bioMentionsProject(text, ref) ?? (c.company ? bioMentionsProject(c.company, ref) : null);
      // "CTO @OtherCo" with no mention of this project: the role is held elsewhere, not here
      const roleElsewhere = !!hit && !mention && roleNamesOtherOrg(text, hit.phrase);
      const role = hit && !isFormer(text, hit.phrase) && !roleElsewhere ? hit : null;
      const why: string[] = [];
      let affiliation: Contact["affiliation"] | undefined;

      if (c.via.has("affiliate")) { affiliation = "strong"; why.push("X affiliate badge of the project"); }
      if (c.via.has("forum-brand")) { affiliation = "strong"; why.push(c.notes.find((n) => n.startsWith("member of")) ?? "project forum team"); }
      if (mention && role) { affiliation = "strong"; why.push(`${c.bioSource ?? "bio"}: "${role.phrase}" + "${mention}"`); }
      if (c.via.has("site") && (role || mention)) { affiliation = "strong"; why.push("linked from project website"); }
      if (c.via.has("site-name") && mention) { affiliation = "strong"; why.push(c.notes.find((n) => n.startsWith("same name")) ?? "named on project site"); }
      if (!affiliation && mention) { affiliation = "medium"; why.push(`${c.bioSource ?? "bio"} mentions "${mention}"`); }
      if (!affiliation && c.via.has("site-name")) { affiliation = "medium"; why.push(`${c.notes.find((n) => n.startsWith("same name")) ?? "name match"} — verify it's the same person`); }
      if (c.via.has("github-org") && (role || mention)) { affiliation = "strong"; why.push(c.notes.find((n) => n.startsWith("public member")) ?? "public GitHub org member"); }
      if (!affiliation && c.via.has("github-org")) { affiliation = "medium"; why.push(c.notes.find((n) => n.startsWith("public member")) ?? "public GitHub org member"); }
      if (!affiliation && c.via.has("github") && (role || mention)) { affiliation = "medium"; why.push("top GitHub contributor"); }
      if (!affiliation && c.via.has("forum")) { affiliation = "medium"; why.push(c.notes.find((n) => n.startsWith("member of")) ?? "forum team group"); }
      if (!affiliation && c.via.has("site") && c.bio) { affiliation = "medium"; why.push("linked from project website"); }
      if (!affiliation && c.via.has("hint")) { affiliation = "medium"; why.push("added by you — not yet confirmed in public sources"); }
      else if (c.via.has("hint")) why.push("added by you");
      if (!affiliation) continue;
      // Open-network search hits without a stated role are usually project/fan accounts, not people
      const onlySearch = [...c.via].every((v) => v === "bluesky" || v === "farcaster" || v === "search");
      // (a hint is never "only search": you put it there)
      if (onlySearch && !role) continue;
      if (c.via.has("fc-following")) why.push(c.notes.find((n) => /Farcaster/.test(n)) ?? "followed by the project's Farcaster account");
      if (c.via.has("github") && !why.includes("top GitHub contributor")) why.push("top GitHub contributor");
      if (c.handle && !c.bio) why.push("open the X profile to confirm role");

      const roleName = role?.role ?? (c.via.has("github") ? "Engineer (GitHub contributor)" : "Team member");
      scored.push({
        score: (affiliation === "strong" ? 10 : 5) + (DECISION_ROLES.test(roleName) ? 5 : 0) + (c.bio ? 1 : 0),
        contact: {
          name: c.name, handle: c.handle ? `@${c.handle}` : undefined, role: roleName, bio: c.bio,
          affiliation, evidence: why.join("; "), channel: c.handle ? "x" : undefined, followers: c.followers,
          fromHint: c.via.has("hint") || undefined,
          sourceUrl: c.handle ? `https://x.com/${c.handle}` : [...c.links][0],
        },
      });
    }
    const contacts = scored.sort((a, b) => b.score - a.score).slice(0, MAX_CONTACTS).map((s) => s.contact);

    // Optional paid skim of key people's recent posts
    if (x) {
      const toSkim = contacts.filter((c) => c.handle && DECISION_ROLES.test(c.role)).slice(0, SKIM_PEOPLE);
      const ids = await x.usersByUsernames(toSkim.map((c) => c.handle!.slice(1)));
      await Promise.all(toSkim.map(async (c) => {
        const u = ids.find((i) => `@${i.username}`.toLowerCase() === c.handle!.toLowerCase());
        if (!u) return;
        const posts = await x.recentPosts(u.id, u.username, 10);
        if (!posts.length) { c.evidence += "; no recent posts"; return; }
        const last = posts.map((p) => p.at).sort().reverse()[0].slice(0, 10);
        const topical = posts.filter((p) => SECURITY_TALK.test(p.text)).length;
        c.evidence += `; last posted ${last}${topical ? `; ${topical}/${posts.length} recent posts on security/launches` : ""}`;
      }));
    }

    if (!neynarConfigured() && !x) {
      notes.push("Tip: a free NEYNAR_API_KEY lets the copilot read Farcaster bios for team members (no X API needed).");
    }

    const facts: Fact[] = contacts.map((c) => ({
      id: newId("fact"), key: FK.contact, value: c, kind: c.affiliation === "strong" ? "fact" : "inference",
      confidence: c.affiliation === "strong" ? 0.85 : 0.6, sourceUrl: c.sourceUrl,
      quote: c.bio ? c.bio.slice(0, 200) : c.evidence,
    }));

    const next = { ...ctx, facts: [...ctx.facts, ...facts] };
    return {
      facts: next.facts,
      warnings,
      notes,
      profile: buildProfile(next),
      usage: { ...ctx.usage, ...(x ? { x: { ...x.usage } } : {}) },
    };
  },
};
