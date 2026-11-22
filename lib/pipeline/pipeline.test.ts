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

  it("picks the project name over a tagline title", async () => {
    const { pickProjectName } = await import("./util");
    const { extractSiteName } = await import("@/lib/connectors/web");
    // og:site_name wins, whatever the attribute order
    expect(extractSiteName(`<meta content="Vanta" property="og:site_name">`)).toBe("Vanta");
    expect(pickProjectName("SOC 2, HIPAA, ISO 27001, PCI, and GDPR Compliance", "Vanta", "vanta.com")).toBe("Vanta");
    // tagline title, no site name → domain brand
    expect(pickProjectName("SOC 2, HIPAA, ISO 27001, PCI, and GDPR Compliance", undefined, "vanta.com")).toBe("Vanta");
    // the title part matching the domain, wherever it sits
    expect(pickProjectName("The lending network | Morpho", undefined, "morpho.org")).toBe("Morpho");
    // a short, non-generic first part is still trusted (brand differs from domain)
    expect(pickProjectName("Uniswap Interface", undefined, "app.uniswap.org")).toBe("Uniswap Interface");
    expect(pickProjectName("Home", undefined, "ethena.fi")).toBe("Ethena");
  });
});

describe("footer / nav text is not a trigger", () => {
  const src = (text: string): Source => ({ id: "s", url: "https://proj.xyz/", kind: "page", fetchedAt: NOW.toISOString(), text });
  const triggers = (text: string) =>
    heuristicExtract([src(text)]).filter((f) => f.key === FK.trigger).map((f) => (f.value as { type: string }).type);

  it("ignores negated partnerships and nav-menu 'HIRING'", () => {
    expect(triggers("We don't partner with anyone else. We've gone all in on Vanta.")).not.toContain("partnership");
    expect(triggers("Company About Careers HIRING Press Security System status")).not.toContain("security_hiring");
  });

  it("still catches real ones, even after a negated mention", () => {
    expect(triggers("Proj partners with Chainlink for price feeds.")).toContain("partnership");
    expect(triggers("We never partner with scams. In March, Proj announced a strategic partnership with Circle.")).toContain("partnership");
    expect(triggers("We're hiring a senior security engineer.")).toContain("security_hiring");
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

describe("GitHub org website", () => {
  it("rejects shared hosting and profile sites as the project's website", async () => {
    const { isProjectSite } = await import("./steps/resolve");
    for (const u of ["https://medium.com/", "https://linktr.ee/", "https://github.io/", "https://github.com/",
      "https://proj.substack.com/", "https://mirror.xyz/", "https://www.x.com/"]) {
      expect(isProjectSite(u), u).toBe(false);
    }
    for (const u of ["https://proj.xyz/", "https://app.proj.fi/", "https://proj.github.io/", "https://proj.vercel.app/"]) {
      expect(isProjectSite(u), u).toBe(true);
    }
  });
});

describe("roles held elsewhere", () => {
  it("spots a role tied to another organisation", async () => {
    const { roleNamesOtherOrg } = await import("@/lib/signals/people");
    expect(roleNamesOtherOrg("CTO @OtherCo", "CTO")).toBe(true);
    expect(roleNamesOtherOrg("Co-founder of OtherCo · builder", "Co-founder")).toBe(true);
    expect(roleNamesOtherOrg("CTO at OtherCo", "CTO")).toBe(true);
    expect(roleNamesOtherOrg("CTO. Building cool things", "CTO")).toBe(false);
    expect(roleNamesOtherOrg("Smart contract engineer, Solidity", "Smart contract engineer")).toBe(false);
  });
});

describe("trigger clean-up", () => {
  const fact = (id: string, over: Partial<Fact> = {}): Fact => ({
    id, key: FK.trigger, value: { type: "funding" }, kind: "fact", confidence: 0.7,
    sourceUrl: `https://news.example/${id}`, quote: id, observedAt: "2026-06-09T00:00:00Z", ...over,
  });

  it("merges many reports of one event into one trigger, keeping all evidence", async () => {
    const { triggers } = await import("./steps/triggers");
    const facts = [
      fact("a", { kind: "inference" }),
      fact("b"),
      fact("c", { observedAt: "2026-06-10T00:00:00Z" }),
      fact("d", { observedAt: "2026-02-01T00:00:00Z" }),        // an earlier, separate round
      fact("e", { value: { type: "partnership" } }),
    ];
    const out = await triggers.run({ ...emptyContext("x"), facts }, deps);
    const funding = out.triggers!.filter((t) => t.type === "funding");
    expect(funding).toHaveLength(2);
    const june = funding.find((t) => t.occurredAt.startsWith("2026-06"))!;
    expect(june.occurredAt).toBe("2026-06-09T00:00:00Z");       // earliest report
    expect(june.factIds[0]).toBe("b");                           // verified fact leads (note + link)
    expect(new Set(june.factIds)).toEqual(new Set(["a", "b", "c"]));
    expect(out.triggers!.filter((t) => t.type === "partnership")).toHaveLength(1);
  });

  it("ignores triggers found on partner, customer and integration pages", async () => {
    const { triggers, isEvergreenPage } = await import("./steps/triggers");
    expect(isEvergreenPage("https://www.vanta.com/partners/partner-program")).toBe(true);
    expect(isEvergreenPage("https://proj.xyz/customers")).toBe(true);
    expect(isEvergreenPage("https://proj.xyz/blog/partnering-with-circle")).toBe(false);
    expect(isEvergreenPage("https://proj.xyz/")).toBe(false);
    const facts = [fact("p", { value: { type: "partnership" }, sourceUrl: "https://www.vanta.com/partners/partner-program" })];
    const out = await triggers.run({ ...emptyContext("x"), facts }, deps);
    expect(out.triggers).toEqual([]);
  });
});
