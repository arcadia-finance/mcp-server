#!/usr/bin/env node
// Keeps server.json and .claude-plugin/plugin.json aligned with package.json.version.
// Writes the same version to server.json.version, server.json.packages[0].version and plugin.json.version.
// Run via `yarn sync-version` or automatically via `prepublishOnly`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const packageJsonPath = resolve(repoRoot, "package.json");
const serverJsonPath = resolve(repoRoot, "server.json");
const pluginJsonPath = resolve(repoRoot, ".claude-plugin", "plugin.json");

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = pkg.version;
if (typeof version !== "string" || version.length === 0) {
  console.error("package.json has no version field — cannot sync.");
  process.exit(1);
}

const server = JSON.parse(readFileSync(serverJsonPath, "utf8"));
let serverChanged = false;
if (server.version !== version) {
  server.version = version;
  serverChanged = true;
}
if (Array.isArray(server.packages) && server.packages.length > 0) {
  if (server.packages[0].version !== version) {
    server.packages[0].version = version;
    serverChanged = true;
  }
}
if (serverChanged) {
  writeFileSync(serverJsonPath, `${JSON.stringify(server, null, 2)}\n`);
  console.log(`server.json synced to ${version}.`);
} else {
  console.log(`server.json already at ${version}, no change.`);
}

const plugin = JSON.parse(readFileSync(pluginJsonPath, "utf8"));
if (plugin.version !== version) {
  plugin.version = version;
  writeFileSync(pluginJsonPath, `${JSON.stringify(plugin, null, 2)}\n`);
  console.log(`plugin.json synced to ${version}.`);
} else {
  console.log(`plugin.json already at ${version}, no change.`);
}
