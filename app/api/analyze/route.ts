import { z } from "zod";
import { getLLM } from "@/lib/ai/client";
import { createFetcher } from "@/lib/connectors/web";
import { createXClient } from "@/lib/connectors/x";
import { parseHints } from "@/lib/pipeline/hints";
import { runPipeline } from "@/lib/pipeline/run";
import { STAGES, type AnalysisContext, type StageName } from "@/lib/pipeline/types";
import { defaultPreset, loadPreset } from "@/lib/rubrik/load";
import type { Rubrik } from "@/lib/rubrik/schema";
import type { ProgressEvent } from "@/app/_components/types";

export const maxDuration = 120;

const Body = z.object({
  input: z.string().trim().min(1).max(300),
  // No playbook choice from the client: the server decides (RUBRIK_YAML_B64 / RUBRIK_PRESET), so a
  // visitor can't ask for other playbook files by name.
  hints: z.string().max(2000).optional(),   // team X handles / links the user spotted
  /** Stream progress as NDJSON: one {type:"progress"} line per stage, then {type:"result"}. */
  stream: z.boolean().optional(),
});

class Cancelled extends Error {}

// TODO: auth (Clerk) + tenant rubrik from DB + persist analysis to Supabase
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Provide { input: website or X handle }" }, { status: 400 });

  const rubrik = await loadPreset(defaultPreset());
  const deps = { rubrik, fetcher: createFetcher(), llm: getLLM(), x: createXClient(), now: new Date() };
  const hints = parseHints(parsed.data.hints);
  // Stop spending requests/quota once the client has gone (closed tab, Cancel).
  let gone = false;
  const stopIfGone = () => { if (gone || request.signal.aborted) throw new Cancelled(); };

  if (!parsed.data.stream) {
    try {
      const result = await runPipeline(parsed.data.input, deps, stopIfGone, hints);
      return Response.json(toClient(result, rubrik));
    } catch (err) {
      if (err instanceof Cancelled) return new Response(null, { status: 499 }); // nobody is listening
      throw err;
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const result = await runPipeline(parsed.data.input, deps, (stage, ctx) => {
          stopIfGone();
          send(progress(stage, ctx));
        }, hints);
        send({ type: "result", result: toClient(result, rubrik) });
      } catch (err) {
        if (!(err instanceof Cancelled)) {
          console.error("[analyze] stream failed:", err);
          send({ type: "result", result: { error: "Analysis failed — see server log." } });
        }
      } finally {
        try { controller.close(); } catch { /* client already gone */ }
      }
    },
    cancel() { gone = true; }, // reader cancelled (Cancel button, closed tab)
  });
  return new Response(body, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

function progress(stage: StageName, ctx: AnalysisContext): ProgressEvent {
  return {
    type: "progress",
    stage,
    index: STAGES.indexOf(stage),
    total: STAGES.length,
    project: ctx.project.domain ? { name: ctx.profile?.name ?? ctx.project.name, domain: ctx.project.domain } : undefined,
    counts: {
      pages: ctx.sources.filter((s) => s.kind === "page").length,
      facts: ctx.facts.length,
      people: ctx.profile?.contacts.length ?? 0,
    },
  };
}

/**
 * The analysis as the page needs it, and no more of the playbook than that: no raw page text, no
 * service definitions (personas, ICP, channels), and only the outreach templates for services that
 * got a brief — the page can't draft for any other. A visitor can't pull the whole playbook out.
 */
function toClient(result: AnalysisContext, rubrik: Rubrik) {
  const { sources, candidates: _candidates, ...rest } = result;
  void _candidates;
  const briefed = new Set(result.briefs.map((b) => b.service));
  return {
    ...rest,
    sources: sources.map(({ id, url, kind, fetchedAt }) => ({ id, url, kind, fetchedAt })),
    rubrik: {
      // display names for service keys, and the score a service needs before it gets a brief
      thesisMinScore: rubrik.scoring.thesisMinScore,
      services: rubrik.services.map(({ key, name }) => ({ key, name })),
      templates: rubrik.templates
        .filter((t) => briefed.has(t.service))
        .map(({ id, service, channel, subject, body }) => ({ id, service, channel, subject, body })),
    },
  };
}
