/**
 * Fills a playbook outreach template with what the analysis found. Pure, so it can be tested.
 * Anything we can't fill honestly stays as a [bracket] for the rep to complete — never guessed.
 */
import type { TriggerType } from "@/lib/domain/types";

export interface FillInput {
  project: string;
  firstName?: string;
  trigger?: TriggerType;
}

/** A filled-in message as segments, so the page can highlight what was personalised. */
export type Segment = { text: string; kind: "plain" | "filled" | "todo" };

/**
 * Trigger wording in the three shapes templates use:
 * "saw X just [ ]" (past), "saw X is [ ]" (progressive), "given [ ], …" (noun phrase).
 */
const TRIGGER_WORDS: Partial<Record<TriggerType, { past: string; ing: string; noun: string }>> = {
  funding: { past: "raised", ing: "raising", noun: "your recent raise" },
  testnet_launch: { past: "went live on testnet", ing: "live on testnet", noun: "your testnet launch" },
  mainnet_launch: { past: "announced mainnet", ing: "approaching mainnet", noun: "your upcoming mainnet launch" },
  token_launch: { past: "announced a token launch", ing: "preparing a token launch", noun: "your upcoming token launch" },
  product_launch: { past: "shipped something new", ing: "shipping new contracts", noun: "your recent launch" },
  partnership: { past: "announced a new partnership", ing: "scaling its partnerships", noun: "your new partnership" },
  new_security_leader: { past: "brought on a new security lead", ing: "building out security", noun: "your new security leadership" },
  security_hiring: { past: "started hiring for security", ing: "hiring for security", noun: "your security hiring" },
  growth_spike: { past: "took off", ing: "growing fast", noun: "how fast you're growing" },
  own_incident: { past: "dealt with a security incident", ing: "recovering from an incident", noun: "the recent incident" },
  ecosystem_incident: { past: "saw an exploit hit its ecosystem", ing: "building in an ecosystem that just saw an exploit", noun: "the recent exploit in your ecosystem" },
  regulation: { past: "came under new regulation", ing: "facing new regulation", noun: "the new regulation in your sector" },
};

const PROJECT_SLOT = /^(?:project|company|chain\/project|project \/ platform|chain|platform)$/i;
const NAME_SLOT = /^name$/i;
const TRIGGER_SLOT = /launched|raised|raising|testnet|mainnet|building|approaching|trigger|recent launch|recent exploit/i;

export function fillTemplate(body: string, f: FillInput): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of body.matchAll(/\[([^\]]+)\]/g)) {
    const at = m.index!;
    if (at > last) out.push({ text: body.slice(last, at), kind: "plain" });
    out.push(slot(m[1].trim(), body.slice(Math.max(0, at - 12), at), f));
    last = at + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), kind: "plain" });
  return out;
}

function slot(s: string, before: string, f: FillInput): Segment {
  const todo: Segment = { text: `[${s}]`, kind: "todo" };
  if (PROJECT_SLOT.test(s)) return { text: f.project, kind: "filled" };
  if (NAME_SLOT.test(s)) return f.firstName ? { text: f.firstName, kind: "filled" } : todo;
  const words = f.trigger && TRIGGER_WORDS[f.trigger];
  if (TRIGGER_SLOT.test(s) && words) {
    const form = /\bjust\s*$/i.test(before) ? words.past : /\bis\s*$/i.test(before) ? words.ing : words.noun;
    return { text: form, kind: "filled" };
  }
  return todo;
}

export const segmentsToText = (segs: Segment[]) => segs.map((s) => s.text).join("");

/** "Paul Frambot 🦋" → "Paul"; a bare @handle stays a handle. */
export function firstName(name?: string): string | undefined {
  if (!name) return undefined;
  if (name.startsWith("@")) return name;
  const w = name.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim().split(/\s+/)[0];
  return w && /\p{L}/u.test(w) ? w : undefined;
}
