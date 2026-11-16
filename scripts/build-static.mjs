import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
await fs.cp(path.join(root, "public"), dist, { recursive: true });
await fs.cp(path.join(root, "docs"), path.join(dist, "docs"), {
  recursive: true
});
await fs.writeFile(path.join(dist, ".nojekyll"), "");

console.log("Static GitHub Pages bundle created in dist/");
