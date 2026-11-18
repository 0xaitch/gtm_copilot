import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Rubrik } from "./schema";

export function parseRubrik(yamlText: string): Rubrik {
  return Rubrik.parse(YAML.parse(yamlText));
}

const PRESET_DIR = path.join(process.cwd(), "rubrik", "presets");

export async function loadPreset(name: string): Promise<Rubrik> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid preset name: ${name}`);
  const text = await readFile(path.join(PRESET_DIR, `${name}.yaml`), "utf8");
  return parseRubrik(text);
}
