import { AnalyzeForm } from "./analyze-form";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-16 font-sans">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Security GTM Copilot</h1>
        <p className="text-sm text-zinc-500">
          Paste a project website or X handle → per-service likelihood (1–10), thesis and evidence.
        </p>
      </header>
      <AnalyzeForm />
    </main>
  );
}
