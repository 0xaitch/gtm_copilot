import { z } from "zod";
import { getLLM } from "@/lib/ai/client";
import { createFetcher } from "@/lib/connectors/web";
import { createXClient } from "@/lib/connectors/x";
import { parseHints } from "@/lib/pipeline/hints";
import { runPipeline } from "@/lib/pipeline/run";
import { defaultPreset, loadPreset } from "@/lib/rubrik/load";

export const maxDuration = 120;

const Body = z.object({
  input: z.string().trim().min(1).max(300),
  preset: z.string().optional(),
  hints: z.string().max(2000).optional(),   // team X handles / links the user spotted
});

// TODO: auth (Clerk) + tenant rubrik from DB + persist analysis to Supabase
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Provide { input: website or X handle }" }, { status: 400 });

  const rubrik = await loadPreset(parsed.data.preset ?? defaultPreset());
  const result = await runPipeline(parsed.data.input, {
    rubrik, fetcher: createFetcher(), llm: getLLM(), x: createXClient(), now: new Date(),
  }, undefined, parseHints(parsed.data.hints));

  // don't ship raw page text to the client
  const { sources, ...rest } = result;
  return Response.json({
    ...rest,
    sources: sources.map(({ id, url, kind, fetchedAt }) => ({ id, url, kind, fetchedAt })),
    // display names for service keys, and the score a service needs before it gets a brief
    rubrik: {
      name: rubrik.name,
      thesisMinScore: rubrik.scoring.thesisMinScore,
      services: rubrik.services.map(({ key, name }) => ({ key, name })),
    },
  });
}
