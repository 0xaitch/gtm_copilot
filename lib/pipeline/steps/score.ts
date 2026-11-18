/** Step 9 — Score: deterministic 1–10 per candidate service (see lib/scoring). */
import { scoreService } from "@/lib/scoring/score";
import type { Step } from "../types";

export const score: Step = {
  name: "score",
  async run(ctx, { rubrik, now }) {
    const input = { profile: ctx.profile!, facts: ctx.facts, triggers: ctx.triggers, posture: ctx.posture, rubrik, now };
    const scores = ctx.candidates
      .map((s) => scoreService(s, input))
      .sort((a, b) => b.final - a.final || b.raw - a.raw);
    return { scores };
  },
};
