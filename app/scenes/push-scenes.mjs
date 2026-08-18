// Pushes locally built scene media to the dub-off-scenes R2 bucket, so
// git-CI deploys of the app (which have no media — it's gitignored) can
// serve scenes through the worker's R2 fallback.
//
//   npm run scene:push            # push every built scene
//   npm run scene:push -- <id>    # push one scene
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BUCKET = "dub-off-scenes";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const scenesDir = join(root, "public/scenes");

const only = process.argv[2];
const ids = readdirSync(scenesDir).filter((f) => {
  if (!statSync(join(scenesDir, f)).isDirectory()) return false;
  return only ? f === only : true;
});
if (ids.length === 0) {
  console.error(only ? `✗ No built scene named "${only}" in ${scenesDir}` : `✗ No built scenes in ${scenesDir}`);
  process.exit(1);
}

for (const id of ids) {
  const dir = join(scenesDir, id);
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  console.log(`\n${id} — ${files.length} files`);
  for (const file of files) {
    const path = join(dir, file);
    const kb = Math.round(statSync(path).size / 1024);
    process.stdout.write(`  ${file} (${kb} KB)… `);
    execFileSync("npx", [
      "wrangler", "r2", "object", "put", `${BUCKET}/${id}/${file}`,
      "--file", path, "--remote",
    ], { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
    console.log("✓");
  }
}
console.log(`\n✓ Pushed ${ids.length} scene(s) to R2 (${BUCKET}).`);
if (!existsSync(join(scenesDir, "index.json"))) {
  console.warn("⚠ No index.json — remember it's served from git, not R2: commit it.");
}
