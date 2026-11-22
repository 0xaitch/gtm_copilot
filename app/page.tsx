import { Suspense } from "react";
import { defaultPreset, loadPreset } from "@/lib/rubrik/load";
import type { PlaybookInfo } from "./_components/types";
import { AnalyzeForm } from "./analyze-form";

export default async function Home({ searchParams }: PageProps<"/">) {
  const playbook = await playbookInfo();
  return (
    // the URL is read inside Suspense so the rest of the page stays a static shell
    <Suspense fallback={<AnalyzeForm playbook={playbook} />}>
      <SearchFromUrl searchParams={searchParams} playbook={playbook} />
    </Suspense>
  );
}

/** ?q=morpho.org runs that analysis on load, so a result can be shared or bookmarked. */
async function SearchFromUrl({ searchParams, playbook }: { searchParams: PageProps<"/">["searchParams"]; playbook?: PlaybookInfo }) {
  const q = (await searchParams).q;
  const initialQuery = typeof q === "string" && q.trim() ? q.trim().slice(0, 300) : undefined;
  return <AnalyzeForm initialQuery={initialQuery} playbook={playbook} />;
}

/** How many services the playbook covers, for the header pill (never its name or content). */
async function playbookInfo(): Promise<PlaybookInfo | undefined> {
  "use cache"; // read once and reused; the playbook file rarely changes
  try {
    const r = await loadPreset(defaultPreset());
    return { services: r.services.length };
  } catch {
    return undefined;
  }
}
