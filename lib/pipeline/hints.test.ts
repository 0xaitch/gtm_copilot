import { describe, expect, it } from "vitest";
import { parseHints } from "./hints";
import { heuristicExtract, ownSiteChecker } from "./steps/extract";
import { FK } from "@/lib/domain/fact-keys";
import type { Contact } from "@/lib/domain/types";

describe("hints", () => {
  it("accepts @handles, X profile URLs and links; ignores bare words, X posts and local addresses", () => {
    const h = parseHints("@janedoe, https://x.com/cto_handle  jane  example.fi/team https://x.com/someone/status/1 http://localhost:3000 http://192.168.1.1/admin https://x.com/home");
    expect(h.handles).toEqual(["janedoe", "cto_handle"]);
    expect(h.urls).toEqual(["https://example.fi/team"]);
  });

  it("doesn't read dotted words as links", () => {
    const h = parseHints("CTO is jane.doe, see e.g. node.js repo; team at proj.xyz/team and docs.proj.finance");
    expect(h.urls).toEqual(["https://proj.xyz/team", "https://docs.proj.finance/"]);
  });

  it("caps how many hints are used", () => {
    const many = Array.from({ length: 20 }, (_, i) => `@user${i}`).join(" ");
    expect(parseHints(many).handles).toHaveLength(10);
    expect(parseHints(undefined)).toEqual({ handles: [], urls: [] });
  });

  it("treats people on pages from other sites as medium, and ignores those pages for segments", () => {
    const at = "2026-11-21T00:00:00Z";
    const facts = heuristicExtract([
      { id: "1", url: "https://news.example.org/story", kind: "page", fetchedAt: at, fromHint: true, text: "Jane Doe, CEO of OtherCo, said lending is booming. Lending lending lending." },
      { id: "2", url: "https://docs.example.fi/team", kind: "page", fetchedAt: at, text: "John Roe, CTO" },
    ], ownSiteChecker("example.fi"));
    const contacts = facts.filter((f) => f.key === FK.contact).map((f) => f.value as Contact);
    expect(contacts.find((c) => c.name === "Jane Doe")?.affiliation).toBe("medium");
    expect(contacts.find((c) => c.name === "John Roe")?.affiliation).toBe("strong");
    expect(facts.some((f) => f.key === FK.segment && f.sourceUrl?.includes("news.example.org"))).toBe(false);
  });

  it("reads people from pages you added even when an LLM is configured", async () => {
    const { extract } = await import("./steps/extract");
    const { emptyContext } = await import("./types");
    const at = "2026-11-21T00:00:00Z";
    const llm = { generateObject: async () => ({ facts: [] }) } as unknown as Parameters<typeof extract.run>[1]["llm"];
    const ctx = {
      ...emptyContext("example.fi"), project: { domain: "example.fi" },
      sources: [
        { id: "1", url: "https://medium.com/@ex/meet-the-team", kind: "page" as const, fetchedAt: at, fromHint: true, text: "Jane Doe, CEO" },
        { id: "2", url: "https://example.fi/", kind: "page" as const, fetchedAt: at, text: "Lending protocol" },
      ],
    };
    const out = await extract.run(ctx, { llm } as Parameters<typeof extract.run>[1]);
    const jane = out.facts?.find((f) => f.key === FK.contact && (f.value as Contact).name === "Jane Doe");
    expect((jane?.value as Contact | undefined)?.affiliation).toBe("medium");
  });

  it("keeps own-site pages that redirected to another host (docs on gitbook.io) as own", () => {
    const at = "2026-11-21T00:00:00Z";
    const isOwn = ownSiteChecker("example.fi");
    const crawled = { id: "1", url: "https://example-fi.gitbook.io/docs", kind: "page" as const, fetchedAt: at, text: "Audited by Some Auditor. Bug bounty on Immunefi." };
    expect(isOwn(crawled)).toBe(true);
    expect(isOwn({ ...crawled, fromHint: true })).toBe(false);
    expect(isOwn({ ...crawled, url: "https://example.fi/team", fromHint: true })).toBe(true); // a hint on the project's own site
    const keys = heuristicExtract([crawled], isOwn).map((f) => f.key);
    expect(keys).toContain(FK.audit);
    expect(keys).toContain(FK.bugBounty);
  });
});
