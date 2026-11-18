/** Step 11 — Gate: code checks that every thesis is grounded before anything is drafted. */
import type { Step } from "../types";

export const gate: Step = {
  name: "gate",
  async run(ctx) {
    const byId = new Map(ctx.facts.map((f) => [f.id, f]));
    const theses = ctx.theses.map((t) => {
      const reasons: string[] = [];
      const missing = t.evidenceFactIds.filter((id) => !byId.has(id));
      if (missing.length) reasons.push(`cites unknown fact ids: ${missing.join(", ")}`);
      const verified = t.evidenceFactIds.map((id) => byId.get(id)).filter((f) => f?.kind === "fact" && f.sourceUrl);
      if (!verified.length) reasons.push("no verified (sourced) evidence");
      const score = ctx.scores.find((s) => s.service === t.service);
      if (score?.confidence === "low") reasons.push("overall confidence low — insufficient data");
      // TODO: second LLM pass to flag sentences in `summary` not supported by cited facts
      return { ...t, gatePassed: reasons.length === 0, gateReasons: reasons };
    });
    return { theses };
  },
};
