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
  origin: "x" | "telegram" | "news" | "forum";
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

export function factsFromPosts(posts: DatedPost[], opts: { ownChannel: boolean }): Fact[] {
  const out: Fact[] = [];
  const conf = opts.ownChannel ? 0.85 : 0.7;
  const push = (f: Omit<Fact, "id">) => out.push({ ...f, id: newId("fact") });
  const quote = (p: DatedPost) => p.text.replace(/\s+/g, " ").slice(0, 220);

  for (const p of posts) {
    const fm = NOT_A_RAISE.test(p.text) ? null : p.text.match(FUNDING_RE);
    if (fm) {
      const amountUsd = parseUsdAmount(fm[0]);
      const round = p.text.match(ROUND_RE)?.[0];
      if (amountUsd && amountUsd <= MAX_PLAUSIBLE_RAISE_USD) {
        push({ key: FK.funding, value: { amountUsd, round }, kind: "fact", confidence: conf, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
        push({ key: FK.trigger, value: { type: "funding" }, kind: "fact", confidence: conf, sourceUrl: p.url, quote: quote(p), observedAt: p.at });
      }
    }
    for (const [re, type] of TRIGGER_RULES) {
      if (re.test(p.text)) {
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
