import { describe, expect, it } from "vitest";
import { parseRss } from "@/lib/connectors/news";
import { parseTelegramChannel, parseTelegramHtml } from "@/lib/connectors/telegram";
import { FK } from "@/lib/domain/fact-keys";
import { bioMentionsProject, isFormer, roleFromBio } from "./people";
import { factsFromPosts, mentionsProject, type DatedPost } from "./posts";

const post = (text: string, origin: DatedPost["origin"] = "x"): DatedPost =>
  ({ text, at: "2026-11-10T12:00:00.000Z", url: "https://example.org/p/1", origin });

describe("factsFromPosts", () => {
  it("extracts a dated funding round with amount and round", () => {
    const f = factsFromPosts([post("ExampleFi raises $12M seed round led by Some Ventures")], { ownChannel: false });
    const funding = f.find((x) => x.key === FK.funding)!;
    expect(funding.value).toEqual({ amountUsd: 12_000_000, round: "seed" });
    expect(funding.observedAt).toBe("2026-11-10T12:00:00.000Z");
    expect(f.some((x) => x.key === FK.trigger && (x.value as { type: string }).type === "funding")).toBe(true);
  });

  it("detects launch triggers and audit announcements", () => {
    const f = factsFromPosts([
      post("Our testnet is now live! Come break things."),
      post("Mainnet launch date: Dec 10"),
      post("We completed our security audit — report linked below"),
    ], { ownChannel: true });
    const types = f.filter((x) => x.key === FK.trigger).map((x) => (x.value as { type: string }).type);
    expect(types).toContain("testnet_launch");
    expect(types).toContain("mainnet_launch");
    expect(f.some((x) => x.key === FK.audit)).toBe(true);
  });

  it("ignores amounts without funding context, proposals and hacks", () => {
    const f = factsFromPosts([
      post("We just crossed $500M in volume"),
      post("ExampleFi Labs Proposes $50M Funding Deal for the DAO"),
      post("Attacker drained $20M after raising concerns"),
      post("ExampleFi awarded $2M grant"),
      post("ExampleFi Lands $480 Billion Wall Street Giant, Will Price Rally?"),
      post("ExampleFi raises the bar with $5B in deposits"),
    ], { ownChannel: false });
    expect(f.some((x) => x.key === FK.funding)).toBe(false);
  });

  it("only credits third-party news to the project when it is the subject", () => {
    const names = ["examplefi"];
    const facts = (t: string) => factsFromPosts([post(t, "news")], { ownChannel: false, names });
    expect(facts("ExampleFi Competitor Raises $110 Million at a $1.5 Billion Valuation").some((x) => x.key === FK.funding)).toBe(false);
    expect(facts("OtherCo Raises $110 Million to Take On ExampleFi").some((x) => x.key === FK.funding)).toBe(false);
    expect(facts("OtherCo raises $14M in Series A funding for ExampleFi staking").some((x) => x.key === FK.funding)).toBe(false);
    expect(facts("ExampleFi raises $14M Series A led by Some Ventures").some((x) => x.key === FK.funding)).toBe(true);
    expect(facts("OtherCo partners with ExampleFi").some((x) => x.key === FK.trigger)).toBe(false);
    expect(facts("ExampleFi partners with OtherCo").some((x) => x.key === FK.trigger)).toBe(true);
  });

  it("doesn't credit news where the project only describes someone else's product", () => {
    const names = ["morpho"];
    const types = (t: string, own = false) => factsFromPosts([post(t, own ? "x" : "news")], { ownChannel: own, names })
      .filter((x) => x.key === FK.trigger).map((x) => (x.value as { type: string }).type);
    expect(types("Uniswap Rolls Out Morpho-Powered Crypto Lending Vaults and Token Launch Discovery Hub")).toEqual([]);
    expect(types("OtherCo vaults built on Morpho are now live")).toEqual([]);
    expect(types("Morpho launched Morpho-powered vaults for institutions")).toContain("product_launch");
  });

  it("treats 'Token Launch <Name>' and 'token launch platform' as product names, not a TGE", () => {
    const types = (t: string) => factsFromPosts([post(t)], { ownChannel: true })
      .filter((x) => x.key === FK.trigger).map((x) => (x.value as { type: string }).type);
    expect(types("Check out the new Token Launch Discovery Hub")).not.toContain("token_launch");
    expect(types("Our token launch platform is getting an upgrade")).not.toContain("token_launch");
    expect(types("Token launch on Dec 3 — details soon")).toContain("token_launch");
    expect(types("TGE is set for next week")).toContain("token_launch");
    expect(types("The $EX Token Launch Is Scheduled For Friday")).toContain("token_launch");
  });

  it("accepts '<amount> series A round' phrasing", () => {
    const f = factsFromPosts([post("ExampleFi announces $30M Series A round")], { ownChannel: false });
    expect(f.find((x) => x.key === FK.funding)?.value).toEqual({ amountUsd: 30_000_000, round: "Series A" });
  });
});

describe("project matching", () => {
  it("requires the name as a whole word", () => {
    expect(mentionsProject("Ethena unveils new app", ["Ethena"])).toBe(true);
    expect(mentionsProject("Methenamine prices rise", ["Ethena"])).toBe(false);
  });
});

describe("people classification", () => {
  it("reads roles from bios", () => {
    expect(roleFromBio("Co-founder & CTO @examplefi | prev eng at BigCo")?.role).toBe("Co-founder & CTO");
    expect(roleFromBio("Head of Security at ExampleFi")?.role).toBe("Head of Security");
    expect(roleFromBio("Senior Solidity Engineer")?.role).toBe("Solidity Lead");
    expect(roleFromBio("gm. dog dad. on-chain enjoyer")).toBeNull();
  });

  it("detects project mentions and former roles", () => {
    const ref = { handle: "examplefi", name: "ExampleFi", domain: "example.fi" };
    expect(bioMentionsProject("CTO @examplefi", ref)).toBe("@examplefi");
    expect(bioMentionsProject("building at ExampleFi", ref)).toMatch(/ExampleFi/);
    expect(bioMentionsProject("CTO @otherproject", ref)).toBeNull();
    expect(isFormer("ex-CTO @examplefi", "CTO")).toBe(true);
    expect(isFormer("CTO @examplefi", "CTO")).toBe(false);
  });
});

describe("connectors: parsers", () => {
  it("parses RSS items", () => {
    const xml = `<rss><channel><item><title><![CDATA[ExampleFi raises $5M]]></title><link>https://n.example/a</link><pubDate>Mon, 10 Nov 2026 07:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseRss(xml)).toEqual([{ title: "ExampleFi raises $5M", link: "https://n.example/a", pubDate: "Mon, 10 Nov 2026 07:00:00 GMT" }]);
  });

  it("parses Telegram channel preview blocks", () => {
    const html = `<div class="tgme_widget_message_wrap"><div data-post="examplefi/42"><div class="tgme_widget_message_text js-message_text">Testnet is <b>live</b></div><time datetime="2026-11-10T12:00:00+00:00"></time></div></div>`;
    const posts = parseTelegramHtml(html);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ text: "Testnet is live", url: "https://t.me/examplefi/42" });
  });

  it("parses Telegram channel URLs, rejecting invite links", () => {
    expect(parseTelegramChannel("https://t.me/examplefi")).toBe("examplefi");
    expect(parseTelegramChannel("https://t.me/joinchat/abcdef")).toBeNull();
  });
});

describe("funding phrasing variants", () => {
  it("accepts 'lands $X in seed funding' but not 'lands $X partner'", () => {
    const yes = factsFromPosts([post("ExampleFi lands $8M in seed funding")], { ownChannel: false });
    expect(yes.find((x) => x.key === FK.funding)?.value).toMatchObject({ amountUsd: 8_000_000 });
  });
});
