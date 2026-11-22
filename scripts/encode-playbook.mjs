// Prints your private playbook as one base64 line, for the RUBRIK_YAML_B64 environment variable
// on a host like Vercel (which can't see the git-ignored rubrik/private/ folder).
//
//   npm run playbook:encode                       → encodes rubrik/private/playbook.yaml
//   npm run playbook:encode -- path/to/other.yaml → encodes another file
//
// The output IS your playbook (base64 is an encoding, not encryption). Paste it only into your
// host's environment-variable settings — never into the repo, an issue, or a chat.
import { readFileSync } from "node:fs";
import YAML from "yaml";

const file = process.argv[2] ?? "rubrik/private/playbook.yaml";
let text;
try {
  text = readFileSync(file, "utf8");
} catch {
  console.error(`Can't read ${file}. Pass the path: npm run playbook:encode -- path/to/playbook.yaml`);
  process.exit(1);
}
try {
  const doc = YAML.parse(text);
  if (!doc?.name || !Array.isArray(doc.services)) throw new Error("missing name or services");
} catch (err) {
  console.error(`${file} doesn't look like a playbook: ${err.message}`);
  process.exit(1);
}
const b64 = Buffer.from(text, "utf8").toString("base64");
process.stdout.write(b64 + "\n");
console.error(`\n✓ ${file} → ${b64.length.toLocaleString()} characters. Paste the line above as RUBRIK_YAML_B64.`);
