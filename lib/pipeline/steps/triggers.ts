/** Step 7 — Triggers: why now. Undated triggers are downgraded to inferences. */
import type { Fact, Trigger } from "@/lib/domain/types";
import { TriggerType } from "@/lib/domain/types";
import type { Step } from "../types";
import { FK } from "@/lib/domain/fact-keys";

const ASSUMED_AGE_DAYS = 45; // conservative guess for undated mentions

export const triggers: Step = {
  name: "triggers",
  async run(ctx, { now }) {
    const facts: Fact[] = [...ctx.facts];
    const out: Trigger[] = [];

    for (const f of ctx.facts) {
      if (f.key !== FK.trigger) continue;
      const type = TriggerType.safeParse((f.value as { type?: string })?.type);
      if (!type.success) continue;

      let occurredAt = f.observedAt;
      if (!occurredAt) {
        occurredAt = new Date(now.getTime() - ASSUMED_AGE_DAYS * 86_400_000).toISOString();
        // an undated trigger can't count as verified timing evidence
        const i = facts.findIndex((x) => x.id === f.id);
        facts[i] = { ...f, kind: "inference" };
      }
      out.push({ type: type.data, occurredAt, factIds: [f.id], note: f.quote });
    }

    // funding facts double as triggers
    for (const f of ctx.facts.filter((x) => x.key === FK.funding && x.observedAt)) {
      if (!out.some((t) => t.type === "funding" && t.occurredAt === f.observedAt)) {
        out.push({ type: "funding", occurredAt: f.observedAt!, factIds: [f.id], note: f.quote });
      }
    }
    return { triggers: out, facts };
  },
};
