import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Fact, Posture, Profile, Trigger } from "@/lib/domain/types";
import { parseRubrik } from "@/lib/rubrik/load";
import {
  estimateValueBand, filterServices, gapScore, payScore, recency, scoreAll, timingScore,
} from "./score";

const rubrik = parseRubrik(
  readFileSync(path.join(process.cwd(), "rubrik/presets/web3-security.yaml"), "utf8"),
);
const NOW = new Date("2026-11-19T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const dexProfile: Profile = {
  name: "ExampleSwap",
  segments: ["dex", "defi"],
  stage: "pre_mainnet",
  isB2B: false,
  hasToken: true,
  fundingUsd: 4_000_000,
  codeLoc: 2400,
  languages: ["solidity"],
  contacts: [{ role: "CTO", handle: "@cto_example", channel: "telegram" }],
};

const facts: Fact[] = Array.from({ length: 10 }, (_, i) => ({
  id: `f${i}`, key: "k", value: i, kind: "fact" as const,
  sourceUrl: "https://example.org", confidence: 0.9,
}));

const triggers: Trigger[] = [
  { type: "funding", occurredAt: daysAgo(32), factIds: ["f1"] },
  { type: "mainnet_launch", occurredAt: daysAgo(-21), factIds: ["f2"] }, // 3 weeks out
];

describe("filterServices", () => {
  it("keeps only ICP-matching services and drops B2B-only ones for B2C", () => {
    const keys = filterServices(dexProfile, rubrik).map((s) => s.key);
    expect(keys).toContain("smart_contract_audit");
    expect(keys).toContain("pentest");
    expect(keys).not.toContain("protocol_audit");
    expect(keys).not.toContain("soc2");
  });
});

describe("sub-scores", () => {
  it("recency decays linearly and treats near-future events as urgent", () => {
    expect(recency(daysAgo(0), 60, NOW)).toBeCloseTo(1);
    expect(recency(daysAgo(30), 60, NOW)).toBeCloseTo(0.5);
    expect(recency(daysAgo(90), 60, NOW)).toBe(0);
    expect(recency(daysAgo(-6), 60, NOW)).toBeGreaterThan(0.9);
  });

  it("timing picks the strongest applicable trigger", () => {
    const { score, best } = timingScore(triggers, rubrik, "smart_contract_audit", NOW);
    expect(best?.type).toBe("mainnet_launch");
    expect(score).toBeGreaterThan(8);
  });

  it("gap maps posture status", () => {
    expect(gapScore("none")).toBe(10);
    expect(gapScore("covered")).toBe(1);
  });

  it("pay is neutral-low when unknown", () => {
    expect(payScore({ ...dexProfile, fundingUsd: undefined }, "mid")).toBe(4);
  });
});

describe("scoreAll", () => {
  it("ranks an unaudited pre-mainnet DEX high for smart contract audit", () => {
    const posture: Posture[] = [{ service: "smart_contract_audit", status: "none", factIds: [] }];
    const scores = scoreAll({ profile: dexProfile, facts, triggers, posture, rubrik, now: NOW });
    expect(scores[0].service).toBe("smart_contract_audit");
    expect(scores[0].final).toBeGreaterThanOrEqual(8);
    expect(scores[0].confidence).toBe("high");
  });

  it("caps services that are already covered", () => {
    const posture: Posture[] = [{ service: "smart_contract_audit", status: "covered", factIds: [] }];
    const s = scoreAll({ profile: dexProfile, facts, triggers, posture, rubrik, now: NOW })
      .find((x) => x.service === "smart_contract_audit")!;
    expect(s.final).toBeLessThanOrEqual(3);
    expect(s.capApplied).toBe("covered_recent");
  });

  it("caps at 6 without a verified trigger", () => {
    const s = scoreAll({ profile: dexProfile, facts, triggers: [], posture: [], rubrik, now: NOW })[0];
    expect(s.final).toBeLessThanOrEqual(6);
    expect(s.capApplied).toBe("no_verified_trigger");
  });
});

describe("estimateValueBand", () => {
  it("uses the effort formula from LOC", () => {
    const svc = rubrik.services.find((s) => s.key === "smart_contract_audit")!;
    expect(estimateValueBand(svc, dexProfile, rubrik)).toMatch(/effort-days/);
  });
});

describe("reach", () => {
  it("credits verified team members even without a persona title", async () => {
    const { reachScore } = await import("./score");
    const svc = rubrik.services.find((s) => s.key === "pentest")!;
    const base = { ...dexProfile, contacts: [] };
    expect(reachScore(base, svc)).toBe(2);
    expect(reachScore({ ...base, contacts: [{ role: "Team member", affiliation: "strong" as const }] }, svc)).toBe(5);
    expect(reachScore({ ...base, contacts: [{ role: "CTO", handle: "@x", affiliation: "strong" as const }] }, svc)).toBe(10);
  });
});

describe("pay with investor backing", () => {
  it("scores backed-but-unknown-amount above unknown", () => {
    expect(payScore({ ...dexProfile, fundingUsd: undefined, backed: true }, "mid")).toBe(6);
  });
});
