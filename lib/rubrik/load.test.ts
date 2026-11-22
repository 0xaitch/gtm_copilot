import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENV_PRESET, defaultPreset, loadPreset } from "./load";

const preset = readFileSync(path.join(process.cwd(), "rubrik/presets/web3-security.yaml"), "utf8");
const saved = { b64: process.env.RUBRIK_YAML_B64, name: process.env.RUBRIK_PRESET };

describe("playbook from an environment variable (hosted deployments)", () => {
  afterEach(() => {
    if (saved.b64 === undefined) delete process.env.RUBRIK_YAML_B64; else process.env.RUBRIK_YAML_B64 = saved.b64;
    if (saved.name === undefined) delete process.env.RUBRIK_PRESET; else process.env.RUBRIK_PRESET = saved.name;
  });

  it("uses RUBRIK_YAML_B64 when set, over RUBRIK_PRESET", async () => {
    process.env.RUBRIK_PRESET = "web3-security";
    process.env.RUBRIK_YAML_B64 = Buffer.from(preset.replace(/^name: .*$/m, "name: From Env"), "utf8").toString("base64");
    expect(defaultPreset()).toBe(ENV_PRESET);
    expect((await loadPreset(defaultPreset())).name).toBe("From Env");
  });

  it("falls back to RUBRIK_PRESET / the public preset when unset", async () => {
    delete process.env.RUBRIK_YAML_B64;
    delete process.env.RUBRIK_PRESET;
    expect(defaultPreset()).toBe("web3-security");
    expect((await loadPreset(defaultPreset())).services.length).toBeGreaterThan(0);
  });

  it("explains a bad value without echoing the playbook", async () => {
    process.env.RUBRIK_YAML_B64 = Buffer.from("name: Secret Co\nservices: []\ntriggers: []\n", "utf8").toString("base64");
    const err = await loadPreset(ENV_PRESET).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/RUBRIK_YAML_B64 is not a valid playbook/);
    expect((err as Error).message).not.toMatch(/Secret Co/);
  });

  it("rejects preset names that could escape the folder", async () => {
    await expect(loadPreset("../../.env")).rejects.toThrow(/invalid preset name/);
  });
});
