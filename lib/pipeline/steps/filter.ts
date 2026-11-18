/**
 * Filter: scope check (e.g. Web3-only) + ICP match. Runs before any paid lookups
 * (X API) so out-of-scope projects cost nothing beyond free sources.
 */
import { filterServices, isWeb3 } from "@/lib/scoring/score";
import type { Step } from "../types";

export const filter: Step = {
  name: "filter",
  async run(ctx, { rubrik }) {
    if (!ctx.profile) return { halted: { stage: "filter", reason: "No profile built." } };
    const web3 = isWeb3(ctx.profile);
    if (rubrik.scope === "web3" && !web3) {
      return { halted: { stage: "filter", reason: `Not a Web3 project (segments: ${ctx.profile.segments.join(", ")}) — out of scope for this rubrik.` } };
    }
    if (rubrik.scope === "web2" && web3) {
      return { halted: { stage: "filter", reason: "Web3 project — out of scope for this rubrik." } };
    }
    const candidates = filterServices(ctx.profile, rubrik);
    if (!candidates.length) {
      return {
        candidates,
        halted: { stage: "filter", reason: `Out of ICP — segments [${ctx.profile.segments.join(", ")}] match no service in the rubrik.` },
      };
    }
    return { candidates };
  },
};
