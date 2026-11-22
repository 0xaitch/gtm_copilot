import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubOrgForHandle, githubOrgMembers, githubRateLimited, githubSummary, resetGithubLimit } from "./github";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("GitHub quota handling", () => {
  const token = process.env.GITHUB_TOKEN;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetGithubLimit();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (token === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = token;
  });

  it("remembers a rate limit across calls until GitHub's reset time", async () => {
    process.env.GITHUB_TOKEN = "t";
    const reset = String(Math.floor(Date.now() / 1000) + 600);
    fetchMock.mockResolvedValue(json({ message: "rate limited" }, 403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset }));

    expect(await githubOrgForHandle("proj")).toBeNull();
    expect(githubRateLimited()).toBe(true);
    const calls = fetchMock.mock.calls.length;

    // a later step's call is reported as rate-limited without spending requests
    const summary = await githubSummary("proj");
    expect(summary?.rateLimited).toBe(true);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("without a token: no org-member lookups and no search, at most 2 org guesses", async () => {
    delete process.env.GITHUB_TOKEN;
    fetchMock.mockResolvedValue(json({ login: "x", twitter_username: "someone-else", html_url: "https://github.com/x" }));

    expect(await githubOrgMembers("proj")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await githubOrgForHandle("proj", ["proj-labs", "projhq", "proj-xyz"])).toBeNull();
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/search/"))).toBe(false);
  });

  it("caches the org lookup so resolve and enrich don't repeat it", async () => {
    process.env.GITHUB_TOKEN = "t";
    fetchMock.mockResolvedValue(json({ login: "proj", twitter_username: "proj", blog: "https://proj.xyz", html_url: "https://github.com/proj" }));

    const first = await githubOrgForHandle("proj", ["proj"]);
    const calls = fetchMock.mock.calls.length;
    const second = await githubOrgForHandle("proj", ["proj"]);
    expect(second).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
