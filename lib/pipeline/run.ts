/**
 * In-process pipeline runner. Each step returns a patch merged into the context.
 * Swap for a durable job runner (Inngest / Trigger.dev) later: one step == one job step.
 */
import { collect } from "./steps/collect";
import { discover } from "./steps/discover";
import { extract } from "./steps/extract";
import { filter } from "./steps/filter";
import { gate } from "./steps/gate";
import { posture } from "./steps/posture";
import { profile } from "./steps/profile";
import { brief } from "./steps/brief";
import { enrich } from "./steps/enrich";
import { resolve } from "./steps/resolve";
import { people } from "./steps/people";
import { score } from "./steps/score";
import { social } from "./steps/social";
import { thesis } from "./steps/thesis";
import { triggers } from "./steps/triggers";
import { emptyContext, type AnalysisContext, type StageName, type Step, type StepDeps } from "./types";

export const PIPELINE: Step[] = [
  resolve, discover, collect, extract, enrich, profile, filter,
  social, people, posture, triggers, score, thesis, gate, brief,
];

export async function runPipeline(
  raw: string,
  deps: StepDeps,
  onStage?: (stage: StageName, ctx: AnalysisContext) => void | Promise<void>,
  hints?: AnalysisContext["hints"],
): Promise<AnalysisContext> {
  let ctx = emptyContext(raw, hints);
  for (const step of PIPELINE) {
    await onStage?.(step.name, ctx);
    try {
      ctx = { ...ctx, ...(await step.run(ctx, deps)) };
    } catch (err) {
      // Details stay in the server log; raw errors can contain local paths or internals.
      console.error(`[pipeline] step "${step.name}" failed:`, err);
      ctx = { ...ctx, halted: { stage: step.name, reason: `Internal error in step "${step.name}" — see server log.` } };
    }
    if (ctx.halted) break;
  }
  return ctx;
}
