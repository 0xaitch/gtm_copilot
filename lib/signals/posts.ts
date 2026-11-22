/**
 * Turn dated, sourced short texts (X posts, Telegram channel posts, news headlines)
 * into facts. Because every item has a timestamp and URL, these are VERIFIED triggers —
 * much stronger than undated website mentions.
 */
import { FK } from "@/lib/domain/fact-keys";
import type { Fact, TriggerType } from "@/lib/domain/types";
import { newId, parseUsdAmount } from "@/lib/pipeline/util";

export interface DatedPost {
  text: string;
  at: string;          // ISO
  url: string;
  origin: "x" | "telegram" | "news" | "forum" | "blog";
}

const AMOUNT = String.raw`\$\s?\d+(?:\.\d+)?\s?(?:k|m|mm|million|b|billion)\b`;
// A raise needs a raise verb (or "<amount> seed/series/funding round"); proposals, grants, hacks etc. are not raises.
const FUNDING_WORD = String.raw`(funding|investment|seed|series [a-d]|round|raise)`;
const FUNDING_RE = new RegExp(
  String.raw`\b(raise[sd]?|raising|secure[sd]?|close[sd]?)\b[^.\n]{0,80}?${AMOUNT}` +
  String.raw`|\b(lands?|bags?|nabs?)\b[^.\n]{0,20}?${AMOUNT}[^.\n]{0,25}?\b${FUNDING_WORD}` +
  String.raw`|${AMOUNT}[^.\n]{0,40}?\b((pre-?)?seed|series [a-d]|strategic|funding|private) round\b`, "i");
const NOT_A_RAISE = /\b(propos\w*|proposal|grant|treasury|buyback|hack\w*|exploit\w*|stolen|drain\w*|liquidat\w*|lawsuit|fine[sd]?|tvl|volume|inflows?|outflows?|airdrop|price|rally|prediction|market cap|etf)\b/i;
/** Crypto raises above this are almost certainly mis-parsed (valuations, AUM, partner size). */
const MAX_PLAUSIBLE_RAISE_USD = 1.5e9;
const ROUND_RE = /\b(pre-?seed|seed|series [a-d]|strategic|private|public sale)\b/i;

const TRIGGER_RULES: [RegExp, TriggerType][] = [
  [/\btestnet\b[^.\n]{0,40}\b(live|launch(ed|es|ing)?|is here|now open)\b|\blaunch(ed|ing)?\b[^.\n]{0,30}\btestnet\b/i, "testnet_launch"],
  [/\bmainnet\b[^.\n]{0,40}\b(live|launch(ed|es|ing)?|is here|coming|date)\b|\blaunch(ed|ing)?\b[^.\n]{0,30}\bmainnet\b/i, "mainnet_launch"],
  [/\b(TGE|token generation event|token launch|airdrop (is )?live|listing on)\b/i, "token_launch"],
  [/\b(introducing|launch(ed|ing)|now live|v[2-9]\b[^.\n]{0,20}\blive|is live)\b/i, "product_launch"],
  [/\b(partner(s|ed|ing|ship) with|strategic partnership|integrat(es|ed|ion) with)\b/i, "partnership"],
  [/\b(hiring|we're hiring|join (our|the) team)\b[^.\n]{0,60}\b(security|compliance|CISO|auditor)\b/i, "security_hiring"],
];
const INCIDENT_RE = /\b(exploit(ed)?|hack(ed)?|drained|attack(ed)?|vulnerability|post[- ]mortem|incident)\b/i;
const AUDIT_DONE_RE = /\b(audit(ed)? (by|completed|report|is complete)|completed (an |a |its |our )?(security )?audit|passed (an |a )?audit)\b/i;

/** For news: the headline must be about this project, not merely mention a similar word. */
export function mentionsProject(text: string, names: string[]): boolean {
  return names.some((n) => n.length >= 3 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

/** Headlines about someone else ("X competitor raises…", "Y raises $10M to take on X"). */
const OTHER_SUBJECT = /\b(competitor|rival|challenger|clone|fork|former|alumni|ex)\b/i;

/**
 * For third-party news: is the project the one DOING the action? The brand must appear before
 * the matched verb, and that leading part must not describe a different company.
 * "Infrared raises $14M for Berachain…" → not Berachain's raise.
 */
export function isSubject(text: string, matchIndex: number, names: string[]): boolean {
  const lead = withoutModifierUses(text.slice(0, matchIndex), names);
  return mentionsProject(lead, names) && !OTHER_SUBJECT.test(lead);
}

const MODIFIER = String.raw`(?:powered|based|backed|built|native|enabled|integrated|compatible|style|like|curated)`;
/**
 * Drops uses of the brand that only describe something else: "Uniswap Rolls Out Morpho-Powered
 * Vaults" or "vaults built on Morpho" are about Uniswap, not Morpho.
 */
function withoutModifierUses(lead: string, names: string[]): string {
  let out = lead;
  for (const n of names.filter((x) => x.length >= 3)) {
    const e = escapeRe(n);
    out = out
      .replace(new RegExp(String.raw`\b${e}[- ]${MODIFIER}\b`, "gi"), " ")
      // "DoorDash, Vanta backer Pear VC closes $333M fund" — the brand describes someone else
      .replace(new RegExp(String.raw`\b${e}(?:'s)?\s+(?:backers?|investors?|partners?|customers?|clients?|users?|alums?|alumni|co-?founders?|founders?|ex-employees?)\b`, "gi"), " ")
      .replace(new RegExp(String.raw`\b(?:powered by|built on|on top of|integrat\w* with|using)\s+${e}\b`, "gi"), " ");
  }
  return out;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "Token Launch Discovery Hub", "token launch platform" — part of a product's name, not this
 * project's TGE: a Title Case phrase followed by another capitalised word, or a tool noun.
 */
const TOOL_NOUN = /^(?:platforms?|pads?|launchpads?|hubs?|discovery|tools?|trackers?|calendars?|services?|programs?|pages?|portals?|features?)\b/i;
function tokenLaunchIsAName(m: RegExpMatchArray): boolean {
  const next = (m.input ?? "").slice((m.index ?? 0) + m[0].length).match(/^\s+(\S+)/)?.[1] ?? "";
  const titleCase = m[0] !== "TGE" && m[0].split(/\s+/).every((w) => /^[A-Z]/.test(w));
  return TOOL_NOUN.test(next) || (titleCase && /^[A-Z][a-z]/.test(next) && !HEADLINE_GLUE.test(next));
}
/** Title Case headlines capitalise every word: "Token Launch Is Scheduled For Friday" is still a launch. */
const HEADLINE_GLUE = /^(?:is|are|was|were|will|set|sets|goes|going|begins?|starts?|kicks|date|dates|scheduled|confirmed|announced|details|delayed|postponed|live|coming|soon|today|tomorrow|this|next|on|in|at|for|from|to|with|and|of|by|after|before|sees|draws|raises|nets|hits)\b/i;

export function factsFromPosts(posts: DatedPost[], opts: { ownChannel: boolean; names?: string[] }): Fact[] {
  const out: Fact[] = [];
  const conf = opts.ownChannel ? 0.85 : 0.7;
  const push = (f: Omit<Fact, "id">) => out.push({ ...f, id: newId("fact") });
  const quote = (p: DatedPost) => p.text.replace(/\s+/g, " ").slice(0, 220);

  // Own channels speak for the project; third-party news must name it as the subject.
  const about = (m: RegExpMatchArray | null) =>
    !!m && (opts.ownChannel || !opts.names?.length || isSubject(m.input ?? "", m.index ?? 0, opts.names));

  for (const p of posts) {
    const fm = NOT_A_RAISE.test(p.text) ? null : p.text.match(FUNDING_RE);
    if (fm && about(fm)) {
      const amountUsd = parseUsdAmount(fm[0]);
      const round = p.text.match(ROUND_RE)?.[0];
      if (amountUsd && amountUsd <= MAX_PLAUSIBLE_RAISE_USD) {
        push({ key: FK.funding, value: { amountUsd, round }, kind: "fact", confidence: conf, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
        push({ key: FK.trigger, value: { type: "funding" }, kind: "fact", confidence: conf, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
      }
    }
    for (const [re, type] of TRIGGER_RULES) {
      const m = p.text.match(re);
      if (m && type === "token_launch" && tokenLaunchIsAName(m)) continue;
      if (m && about(m)) {
        push({ key: FK.trigger, value: { type }, kind: "fact", confidence: conf * 0.9, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
        break; // one trigger per post keeps noise down
      }
    }
    if (AUDIT_DONE_RE.test(p.text)) {
      push({ key: FK.audit, value: { announced: true }, kind: "fact", confidence: conf, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
    }
    // Own channel talking about an incident, or a news headline about it
    if (INCIDENT_RE.test(p.text) && !AUDIT_DONE_RE.test(p.text)) {
      push({ key: FK.incident, value: { origin: p.origin }, kind: opts.ownChannel ? "fact" : "inference", confidence: 0.6, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
    }
  }
  return out;
}
