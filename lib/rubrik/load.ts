import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Rubrik } from "./schema";

export function parseRubrik(yamlText: string): Rubrik {
  return Rubrik.parse(YAML.parse(yamlText));
}

const PRIVATE_DIR = path.join(process.cwd(), "rubrik", "private");
const PRESET_DIR = path.join(process.cwd(), "rubrik", "presets");

/** Default rubrik when the request names none: RUBRIK_PRESET env, else the public preset. */
export const defaultPreset = () => process.env.RUBRIK_PRESET || "web3-security";

/** Loads a rubrik by name, preferring the git-ignored private folder over public presets. */
export async function loadPreset(name: string): Promise<Rubrik> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid preset name: ${name}`);
  for (const dir of [PRIVATE_DIR, PRESET_DIR]) {
    const text = await readFile(path.join(dir, `${name}.yaml`), "utf8").catch(() => null);
    if (text !== null) return parseRubrik(text);
  }
  throw new Error(`rubrik not found: ${name}`);
}
