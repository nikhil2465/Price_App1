// Fails when the vendored PriceWise contract drifts from the app's copy.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// In the monorepo the app's contract sits at ../shared/types.ts; override with PRICEWISE_CONTRACT_PATH.
const repoContract = fileURLToPath(new URL("../../shared/types.ts", import.meta.url));
const upstreamPath =
  process.env.PRICEWISE_CONTRACT_PATH ?? (existsSync(repoContract) ? repoContract : "/mnt/project-files/pricewise/shared/types.ts");
const HEADER_LINES = 3;
const vendored = readFileSync(new URL("../src/domain/pricewise-types.ts", import.meta.url), "utf8")
  .split("\n").slice(HEADER_LINES).join("\n");
let upstream;
try {
  upstream = readFileSync(upstreamPath, "utf8");
} catch (err) {
  console.error(`Cannot read upstream contract at ${upstreamPath}: ${err.message}`);
  process.exit(2);
}
if (vendored.trim() !== upstream.trim()) {
  console.error(`Contract drift: src/domain/pricewise-types.ts differs from ${upstreamPath}. Re-copy it and re-run tests.`);
  process.exit(1);
}
console.log("Contract in sync.");
