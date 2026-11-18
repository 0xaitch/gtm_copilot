import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapCategory } from "@/lib/connectors/defillama";
import { parseGithubOwner } from "@/lib/connectors/github";
import { parseXHandle } from "@/lib/connectors/x";
import { FK } from "@/lib/domain/fact-keys";
import type { Fact, Source } from "@/lib/domain/types";
import { parseRubrik } from "@/lib/rubrik/load";
import { heuristicExtract } from "./steps/extract";
import { posture } from "./steps/posture";
import { emptyContext, type StepDeps } from "./types";

const rubrik = parseRubrik(readFileSync(path.join(process.cwd(), "rubrik/presets/web3-security.yaml"), "utf8"));
const NOW = new Date("2026-11-19T00:00:00Z");
const deps = { rubrik, now: NOW, llm: null, x: null, fetcher: { get: async () => null } } satisfies StepDeps;

describe("input parsing", () => {
  it("recognises X handles and profile URLs, not domains", () => {
    expect(parseXHandle("@ExampleFi")).toBe("ExampleFi");
    expect(parseXHandle("examplefi")).toBe("examplefi");
    expect(parseXHandle("https://x.com/examplefi")).toBe("examplefi");
    expect(parseXHandle("twitter.com/examplefi/status/1")).toBe("examplefi");
    expect(parseXHandle("example.fi")).toBeNull();
    expect(parseXHandle("https://example.fi")).toBeNull();
  });

  it("parses GitHub owners", () => {
    expect(parseGithubOwner("https://github.com/example-org")).toBe("example-org");
    expect(parseGithubOwner("https://github.com/example-org/repo")).toBe("example-org");
    expect(parseGithubOwner("example-org")).toBe("example-org");
    expect(parseGithubOwner("https://github.com/orgs/foo")).toBeNull();
  });
});

describe("DefiLlama category mapping", () => {
  it("maps known categories and defaults to defi", () => {
    expect(mapCategory("Dexs")).toContain("dex");
    expect(mapCategory("Liquid Staking")).toContain("staking");
    expect(mapCategory("CEX")).toEqual(["cex"]);
    expect(mapCategory("Something New")).toEqual(["defi"]);
  });
});

describe("heuristic segment pruning", () => {
  it("keeps dominant segments and drops passing mentions", () => {
    const text = "A decentralized exchange. Our DEX has the best AMM. Trade on the DEX. We also support NFTs once.";
    const src: Source = { id: "s1", url: "https://example.org", kind: "page", fetchedAt: NOW.toISOString(), text };
    const segs = heuristicExtract([src]).filter((f) => f.key === FK.segment).map((f) => f.value);
    expect(segs).toContain("dex");
    expect(segs).not.toContain("nft");
  });
});

describe("posture", () => {
  const mk = (over: Partial<Fact>): Fact => ({
    id: Math.random().toString(36), key: FK.audit, value: {}, kind: "fact", confidence: 0.9,
    sourceUrl: "https://example.org", ...over,
  });

  it("marks a recent audit stale when code shipped long after it", async () => {
    const ctx = emptyContext("x");
    ctx.facts = [
      mk({ key: FK.audit, observedAt: "2026-06-01T00:00:00Z" }),
      mk({ key: FK.codeActivity, value: { lastPushAt: "2026-11-10T00:00:00Z" }, observedAt: "2026-11-10T00:00:00Z" }),
    ];
    const { posture: p } = await posture.run(ctx, deps);
    expect(p!.find((x) => x.service === "smart_contract_audit")!.status).toBe("stale");
  });

  it("keeps a recent audit covered when code hasn't moved", async () => {
    const ctx = emptyContext("x");
    ctx.facts = [
      mk({ key: FK.audit, observedAt: "2026-10-01T00:00:00Z" }),
      mk({ key: FK.codeActivity, value: { lastPushAt: "2026-10-15T00:00:00Z" } }),
    ];
    const { posture: p } = await posture.run(ctx, deps);
    expect(p!.find((x) => x.service === "smart_contract_audit")!.status).toBe("covered");
  });

  it("treats unobservable services as unknown, not none", async () => {
    const ctx = emptyContext("x");
    ctx.facts = [mk({ key: FK.tvl, value: 1e6 })];
    const { posture: p } = await posture.run(ctx, deps);
    expect(p!.find((x) => x.service === "tokenomics_review")!.status).toBe("unknown");
    expect(p!.find((x) => x.service === "smart_contract_audit")!.status).toBe("none");
  });
});

describe("handle normalisation", () => {
  it("strips common handle suffixes for fuzzy matching", async () => {
    const { coreHandle, siteOrigin } = await import("@/lib/connectors/defillama");
    expect(coreHandle("ethena_labs")).toBe("ethena");
    expect(coreHandle("@ExampleFi_HQ")).toBe("example");
    expect(coreHandle("uniswapfdn")).toBe("uniswap");
    expect(siteOrigin("https://www.app.example.fi/join/3y20d?ref=1")).toBe("https://www.app.example.fi/");
  });
});

describe("naming", () => {
  it("derives brands from domains and rejects generic titles", async () => {
    const { brandFromDomain, isGenericName } = await import("./util");
    expect(brandFromDomain("app.ethena.fi")).toBe("ethena");
    expect(brandFromDomain("www.example.co.uk")).toBe("example");
    expect(isGenericName("App")).toBe(true);
    expect(isGenericName("Ethena")).toBe(false);
  });
});

describe("forum detection", () => {
  it("recognises governance forum hosts", async () => {
    const { forumBase } = await import("@/lib/connectors/discourse");
    expect(forumBase("https://governance.example.org/t/some-topic/1")).toBe("https://governance.example.org");
    expect(forumBase("https://research.example.org/")).toBe("https://research.example.org");
    expect(forumBase("https://example.org/forum")).toBeNull();
  });
});

describe("root domain", () => {
  it("strips subdomains but keeps two-part suffixes", async () => {
    const { rootDomain } = await import("./util");
    expect(rootDomain("app.example.fi")).toBe("example.fi");
    expect(rootDomain("www.example.co.uk")).toBe("example.co.uk");
    expect(rootDomain("example.com")).toBe("example.com");
  });
});

describe("founder extraction", () => {
  it("pulls founder names from 'founded by' sentences, skipping orgs", async () => {
    const { foundersIn } = await import("./steps/extract");
    const t = "ExampleX was founded by Cambridge mathematicians Jane Doe and John Smith. Jane was at Flow Traders.";
    expect(foundersIn(t).map((x) => x.name)).toEqual(["Jane Doe", "John Smith"]);
    expect(foundersIn("Backed by Y Combinator and General Catalyst.")).toEqual([]);
    expect(foundersIn("Co-founded in 2021 by Alice Martin.").map((x) => x.name)).toEqual(["Alice Martin"]);
  });
});
