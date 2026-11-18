/** Step 6 — Posture: what security coverage the project already has, per service. */
import type { Fact, Posture, PostureStatus } from "@/lib/domain/types";
import type { ServiceDef } from "@/lib/rubrik/schema";
import type { Step } from "../types";
import { FK } from "@/lib/domain/fact-keys";

const MONTH = 30 * 86_400_000;
const CODE_DRIFT_DAYS = 90;

function evidenceFor(service: ServiceDef, facts: Fact[]): Fact[] {
  switch (service.category) {
    case "web3_code": return facts.filter((f) => f.key === FK.audit);
    case "offensive": return facts.filter((f) => f.key === FK.pentest || f.key === FK.bugBounty);
    case "compliance": return facts.filter((f) => f.key === FK.compliance && String(f.value) === service.key);
    default: return [];
  }
}

export const posture: Step = {
  name: "posture",
  async run(ctx, { rubrik, now }) {
    // absence of evidence only counts if we actually looked (site pages or structured data)
    const lookedEnough = ctx.sources.length >= 3 || ctx.facts.some((f) => f.confidence >= 0.9);
    const staleMs = rubrik.scoring.staleAfterMonths * MONTH;
    const activity = ctx.facts.find((f) => f.key === FK.codeActivity);
    const lastPushAt = (activity?.value as { lastPushAt?: string } | undefined)?.lastPushAt;

    const out: Posture[] = rubrik.services.map((svc) => {
      const ev = evidenceFor(svc, ctx.facts);
      let status: PostureStatus;
      let lastCoveredAt: string | undefined;
      const extraIds: string[] = [];

      // advisory/managed needs aren't observable on a website → absence proves nothing
      const observable = ["web3_code", "offensive", "compliance"].includes(svc.category);
      if (!ev.length) status = observable && lookedEnough ? "none" : "unknown";
      else {
        const dated = ev.map((f) => f.observedAt).filter(Boolean).sort().reverse() as string[];
        lastCoveredAt = dated[0];
        const onlyWeak = ev.every((f) => f.key === FK.bugBounty);
        if (onlyWeak) status = "partial";
        else if (!lastCoveredAt) status = "partial";            // mentioned, but undated
        else status = now.getTime() - new Date(lastCoveredAt).getTime() > staleMs ? "stale" : "covered";

        // Code shipped well after the last audit → the new code is unaudited.
        if (status === "covered" && svc.category === "web3_code" && lastPushAt && lastCoveredAt &&
            new Date(lastPushAt).getTime() - new Date(lastCoveredAt).getTime() > CODE_DRIFT_DAYS * 86_400_000) {
          status = "stale";
          extraIds.push(activity!.id);
        }
      }
      return { service: svc.key, status, lastCoveredAt, factIds: [...ev.map((f) => f.id), ...extraIds] };
    });
    return { posture: out };
  },
};
