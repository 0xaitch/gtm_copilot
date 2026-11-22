import { Suspense } from "react";
import { AnalyzeForm } from "./analyze-form";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex w-full max-w-6xl items-baseline gap-3 px-6 py-3">
          <h1 className="text-sm font-semibold tracking-tight">Security GTM Copilot</h1>
          <p className="text-xs text-zinc-500">Which service to pitch, why now, and to whom</p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-5">
        {/* the URL is read inside Suspense so the rest of the page stays a static shell */}
        <Suspense fallback={<AnalyzeForm />}>
          <SearchFromUrl searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

/** ?q=morpho.org runs that analysis on load, so a result can be shared or bookmarked. */
async function SearchFromUrl({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const q = (await searchParams).q;
  const initialQuery = typeof q === "string" && q.trim() ? q.trim().slice(0, 300) : undefined;
  return <AnalyzeForm initialQuery={initialQuery} />;
}
