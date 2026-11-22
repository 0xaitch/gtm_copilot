/** Step 7 — Triggers: why now. Undated triggers are downgraded to inferences. */
import type { Fact, Trigger } from "@/lib/domain/types";
import { TriggerType } from "@/lib/domain/types";
import type { Step } from "../types";
import { FK } from "@/lib/domain/fact-keys";

const ASSUMED_AGE_DAYS = 45; // conservative guess for undated mentions
const DAY = 86_400_000;
/** Same-type triggers this close together are one event reported several times (e.g. 8 articles on one raise). */
const SAME_EVENT_DAYS = 14;

/**
 * Pages that permanently list partners, customers or integrations. Their text ("we're excited to
 * partner with X", "X raised…" in a case study) describes others or is evergreen — not a why-now.
 */
const EVERGREEN_PAGE = /\/(?:partners?|partner-program|partnerships|integrations?|ecosystem|customers?|case-stud(?:y|ies)|testimonials?|clients?|showcase)(?:[/?#.-]|$)/i;
export function isEvergreenPage(url?: string): boolean {
  if (!url) return false;
  try { return EVERGREEN_PAGE.test(new URL(url).pathname); } catch { return false; }
}

/**
 * Merges same-type triggers within SAME_EVENT_DAYS of each other into one, keeping every fact id.
 * The merged trigger takes the earliest date and the note of its best fact (verified first).
 */
export function mergeSameEvent(triggers: Trigger[], facts: Fact[]): Trigger[] {
  const verified = (t: Trigger) => t.factIds.some((id) => facts.find((f) => f.id === id)?.kind === "fact");
  const sorted = [...triggers].sort((a, b) => a.type.localeCompare(b.type) || Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const out: { t: Trigger; last: number; best: Trigger }[] = [];
  for (const t of sorted) {
    const at = Date.parse(t.occurredAt);
    const cur = out[out.length - 1];
    if (cur && cur.t.type === t.type && at - cur.last <= SAME_EVENT_DAYS * DAY) {
      cur.t = { ...cur.t, factIds: [...new Set([...cur.t.factIds, ...t.factIds])] };
      cur.last = at;
      if (!verified(cur.best) && verified(t)) cur.best = t;
    } else {
      out.push({ t, last: at, best: t });
    }
  }
  // best fact first: briefs link the trigger to factIds[0], so note and link stay the same article
  return out.map(({ t, best }) => ({
    ...t, note: best.note ?? t.note, factIds: [...new Set([...best.factIds, ...t.factIds])],
  }));
}

export const triggers: Step = {
  name: "triggers",
  async run(ctx, { now }) {
    const facts: Fact[] = [...ctx.facts];
    const out: Trigger[] = [];

    for (const f of ctx.facts) {
      if (f.key !== FK.trigger) continue;
      if (isEvergreenPage(f.sourceUrl)) continue;
      const type = TriggerType.safeParse((f.value as { type?: string })?.type);
      if (!type.success) continue;

      let occurredAt = f.observedAt;
      // an undated "has raised" on a website is evergreen — it says nothing about timing
      if (!occurredAt && type.data === "funding") continue;
      if (!occurredAt) {
        occurredAt = new Date(now.getTime() - ASSUMED_AGE_DAYS * DAY).toISOString();
        // an undated trigger can't count as verified timing evidence
        const i = facts.findIndex((x) => x.id === f.id);
        facts[i] = { ...f, kind: "inference" };
      }
      out.push({ type: type.data, occurredAt, factIds: [f.id], note: f.quote });
    }

    // funding facts double as triggers
    for (const f of ctx.facts.filter((x) => x.key === FK.funding && x.observedAt && !isEvergreenPage(x.sourceUrl))) {
      out.push({ type: "funding", occurredAt: f.observedAt!, factIds: [f.id], note: f.quote });
    }
    return { triggers: mergeSameEvent(out, facts), facts };
  },
};
