import { describe, expect, it } from "vitest";
import { assertPublicUrl, isBotChallenge, isPrivateIp } from "./web";
import { coreHandle, pickForHandle } from "./defillama";

describe("SSRF guard", () => {
  it("classifies private and public addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("rejects local, private, credentialed and odd-port URLs", async () => {
    for (const u of [
      "http://localhost/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.0.0.1/",
      "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "http://router.lan/",
      "file:///etc/passwd", "http://user:pass@example.com/", "http://example.com:8080/",
    ]) {
      await expect(assertPublicUrl(u), u).rejects.toThrow();
    }
  });

  it("accepts public literal IPs", async () => {
    await expect(assertPublicUrl("https://1.1.1.1/")).resolves.toBeInstanceOf(URL);
  });
});

describe("page text", () => {
  it("keeps meta descriptions from JS-app shells", async () => {
    const { pageText } = await import("./web");
    const html = `<html><head><title>ExampleX - 24/7 exchange</title><meta name="description" content="ExampleX is a perpetuals exchange."><meta property="og:description" content="ExampleX is a perpetuals exchange."></head><body><div id="root"></div><script>var a=1</script></body></html>`;
    expect(pageText(html)).toBe("ExampleX - 24/7 exchange \nExampleX is a perpetuals exchange.");
  });
});

describe("local target pre-check", () => {
  it("flags local/private inputs and passes public ones", async () => {
    const { isLocalTarget } = await import("./web");
    for (const s of ["http://localhost:3000", "localhost", "127.0.0.1", "http://169.254.169.254/latest/meta-data/", "192.168.1.1:8080", "http://[::1]/", "router.lan", "http://2130706433/"]) {
      expect(isLocalTarget(s), s).toBe(true);
    }
    for (const s of ["example.org", "https://www.example.org", "1.1.1.1"]) {
      expect(isLocalTarget(s), s).toBe(false);
    }
  });
});

describe("bot challenges and DefiLlama handle picking", () => {
  it("recognises bot-protection interstitials", () => {
    expect(isBotChallenge("<html><head><title>Just a moment...</title></head></html>")).toBe(true);
    expect(isBotChallenge("<title>Vercel Security Checkpoint</title>")).toBe(true);
    expect(isBotChallenge("<title>ExampleFi — lending</title><body>Hello</body>")).toBe(false);
  });

  it("prefers the listing named after the handle, then the largest non-bridge one", () => {
    const p = (name: string, category: string, tvl: number) => ({ id: name, name, category, tvl });
    expect(pickForHandle([p("Lendy", "Lending", 9e6), p("ExampleChain", "Chain", 1e6)], "examplechain")?.name).toBe("ExampleChain");
    expect(pickForHandle([p("ExampleX Bridge", "Bridge", 5e9), p("ExampleX Perps", "Derivatives", 1e9)], "examplexyz")?.name).toBe("ExampleX Perps");
    expect(coreHandle("example_sol")).toBe("example");
  });
});
