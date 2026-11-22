import { readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { Rubrik } from "./schema";

export function parseRubrik(yamlText: string): Rubrik {
  return Rubrik.parse(YAML.parse(yamlText));
}

const PRIVATE_DIR = path.join(process.cwd(), "rubrik", "private");
const PRESET_DIR = path.join(process.cwd(), "rubrik", "presets");

/**
 * Hosted deployments (e.g. Vercel) can't see rubrik/private/, which is git-ignored and must stay out
 * of the public repo. They pass the playbook instead as RUBRIK_YAML_B64: the YAML file, base64-encoded
 * so it fits in one environment variable. `npm run playbook:encode` produces the value.
 */
export const ENV_PRESET = "env";

/** Which playbook to use: the env-var one if set, else RUBRIK_PRESET, else the public preset. */
export const defaultPreset = () =>
  process.env.RUBRIK_YAML_B64 ? ENV_PRESET : process.env.RUBRIK_PRESET || "web3-security";

let envCache: { raw: string; rubrik: Rubrik } | null = null;

/** Loads a rubrik by name, preferring the git-ignored private folder over public presets. */
export async function loadPreset(name: string): Promise<Rubrik> {
  if (name === ENV_PRESET) return fromEnv();
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid preset name: ${name}`);
  for (const dir of [PRIVATE_DIR, PRESET_DIR]) {
    const text = await readFile(path.join(dir, `${name}.yaml`), "utf8").catch(() => null);
    if (text !== null) return parseRubrik(text);
  }
  throw new Error(`rubrik not found: ${name}`);
}

function fromEnv(): Rubrik {
  const raw = process.env.RUBRIK_YAML_B64?.trim();
  if (!raw) throw new Error("RUBRIK_YAML_B64 is not set");
  if (envCache?.raw === raw) return envCache.rubrik;
  let rubrik: Rubrik;
  try {
    rubrik = parseRubrik(Buffer.from(raw, "base64").toString("utf8"));
  } catch (err) {
    // Say where it's wrong, never echo the playbook's content into logs.
    const where = err instanceof Error && "issues" in err
      ? (err as { issues: { path: PropertyKey[] }[] }).issues.map((i) => i.path.join(".")).slice(0, 5).join(", ")
      : "not valid base64-encoded YAML";
    throw new Error(`RUBRIK_YAML_B64 is not a valid playbook (${where}). Re-run npm run playbook:encode and paste the output.`);
  }
  envCache = { raw, rubrik };
  return rubrik;
}
