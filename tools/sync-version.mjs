#!/usr/bin/env node
// Keeps server.json aligned with package.json.version.
// Writes the same version to server.json.version AND server.json.packages[0].version.
// Run via `yarn sync-version` or automatically via `prepublishOnly`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const serverJsonPath = resolve(repoRoot, "server.json");

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = pkg.version;
if (typeof version !== "string" || version.length === 0) {
  console.error("package.json has no version field — cannot sync.");
  process.exit(1);
}

const serverJsonText = readFileSync(serverJsonPath, "utf8");
const server = JSON.parse(serverJsonText);

let changed = false;
if (server.version !== version) {
  server.version = version;
  changed = true;
}
if (Array.isArray(server.packages) && server.packages.length > 0) {
  if (server.packages[0].version !== version) {
    server.packages[0].version = version;
    changed = true;
  }
}

if (!changed) {
  console.log(`server.json already at ${version}, no change.`);
  process.exit(0);
}

writeFileSync(serverJsonPath, `${JSON.stringify(server, null, 2)}\n`);
console.log(`server.json synced to ${version}.`);
