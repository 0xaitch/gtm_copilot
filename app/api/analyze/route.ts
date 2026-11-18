import { z } from "zod";
import { getLLM } from "@/lib/ai/client";
import { createFetcher } from "@/lib/connectors/web";
import { createXClient } from "@/lib/connectors/x";
import { runPipeline } from "@/lib/pipeline/run";
import { loadPreset } from "@/lib/rubrik/load";

export const maxDuration = 120;

const Body = z.object({
  input: z.string().trim().min(1).max(300),
  preset: z.string().default("web3-security"),
});

// TODO: auth (Clerk) + tenant rubrik from DB + persist analysis to Supabase
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Provide { input: website or X handle }" }, { status: 400 });

  const rubrik = await loadPreset(parsed.data.preset);
  const result = await runPipeline(parsed.data.input, {
    rubrik, fetcher: createFetcher(), llm: getLLM(), x: createXClient(), now: new Date(),
  });

  // don't ship raw page text to the client
  const { sources, ...rest } = result;
  return Response.json({
    ...rest,
    sources: sources.map(({ id, url, kind, fetchedAt }) => ({ id, url, kind, fetchedAt })),
  });
}
