import { describe, expect, it } from "vitest";
import { blogCandidates, blogPosts, feedLinksInHtml, parseFeed } from "./feeds";
import type { Fetcher } from "./web";

describe("blog feeds", () => {
  it("finds advertised feeds and skips comment feeds", () => {
    const html = `<head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">
      <link type="application/atom+xml" rel="alternate" href="https://blog.example.fi/atom">
      <link rel="alternate" type="application/rss+xml" href="/comments/feed/">
      <link rel="stylesheet" href="/x.css"></head>`;
    expect(feedLinksInHtml(html, "https://example.fi/")).toEqual(["https://example.fi/feed.xml", "https://blog.example.fi/atom"]);
  });

  it("maps blog platforms to feeds or pages", () => {
    const c = blogCandidates([
      "https://medium.com/@examplefi", "https://medium.com/examplefi-pub/some-post-123",
      "https://examplefi.substack.com/p/hello", "https://mirror.xyz/examplefi.eth",
      "https://paragraph.xyz/@examplefi", "https://example.fi/blog", "https://other.org/blog", "https://otherexample.fi/blog",
    ], "example.fi");
    expect(c.feeds).toEqual(["https://medium.com/feed/@examplefi", "https://medium.com/feed/examplefi-pub", "https://examplefi.substack.com/feed"]);
    expect(c.pages).toEqual(["https://mirror.xyz/examplefi.eth", "https://paragraph.xyz/@examplefi", "https://example.fi/blog", "https://blog.example.fi"]);
  });

  it("parses RSS and Atom", () => {
    const rss = `<rss><channel><item><title><![CDATA[ExampleFi v2 is live]]></title><link>https://example.fi/b/v2</link>
      <pubDate>Mon, 10 Nov 2026 07:00:00 GMT</pubDate><description><![CDATA[<p>Hello</p>]]></description></item></channel></rss>`;
    const atom = `<feed><entry><title>Audit complete</title><link rel="alternate" href="https://example.fi/b/audit"/>
      <published>2026-11-01T00:00:00Z</published><summary>Report inside</summary></entry></feed>`;
    expect(parseFeed(rss)).toEqual([{ title: "ExampleFi v2 is live", link: "https://example.fi/b/v2", date: "Mon, 10 Nov 2026 07:00:00 GMT", summary: "Hello" }]);
    expect(parseFeed(atom)[0]).toMatchObject({ title: "Audit complete", link: "https://example.fi/b/audit", date: "2026-11-01T00:00:00Z" });
  });

  it("returns recent dated posts, newest first, titles only", async () => {
    const feed = `<rss><channel>
      <item><title>Mainnet launch date: Dec 10</title><link>https://example.fi/b/1</link><pubDate>Mon, 10 Nov 2026 07:00:00 GMT</pubDate><description>long body that mentions an exploit</description></item>
      <item><title>Old news</title><link>https://example.fi/b/0</link><pubDate>Mon, 10 Nov 2024 07:00:00 GMT</pubDate></item>
      <item><title>Undated</title><link>https://example.fi/b/x</link></item></channel></rss>`;
    const fetcher: Fetcher = { get: async (url) => (url.endsWith("/feed") ? { url, status: 200, html: feed } : null) };
    const r = await blogPosts(fetcher, { feeds: ["https://example.fi/feed"], pages: [], now: new Date("2026-11-21T00:00:00Z") });
    expect(r.feeds).toEqual(["https://example.fi/feed"]);
    expect(r.posts).toEqual([{ text: "Mainnet launch date: Dec 10", at: "2026-11-10T07:00:00.000Z", url: "https://example.fi/b/1", origin: "blog" }]);
  });
});
