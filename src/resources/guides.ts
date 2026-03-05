import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GUIDES = {
  overview: {
    file: "SKILL.md",
    description:
      "Tool catalog, token/contract/lending pool addresses, asset manager addresses, account versions",
  },
  automation: {
    file: "automation.md",
    description:
      "Rebalancer, compounder, yield claimer, merkl operator, CoW swapper setup and addresses",
  },
  strategies: {
    file: "strategies.md",
    description:
      "Step-by-step strategy templates: delta neutral leveraged LP, protocol owned liquidity, closing sequences",
  },
  selection: {
    file: "selection.md",
    description:
      "Strategy evaluation framework: pool selection, range width, leverage sizing, automation combos, exit signals",
  },
} as const;

export function registerGuideResources(server: McpServer) {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const skillsDir = resolve(thisDir, "..", "..", "skills", "clamm-liquidity");

  for (const [topic, { file, description }] of Object.entries(GUIDES)) {
    const uri = `arcadia://guides/${topic}`;
    let content: string;
    try {
      content = readFileSync(resolve(skillsDir, file), "utf-8");
    } catch {
      content = `Guide "${topic}" is not available in this installation.`;
    }

    server.registerResource(
      `guide-${topic}`,
      uri,
      { description, mimeType: "text/markdown" },
      async () => ({
        contents: [{ uri, text: content }],
      }),
    );
  }
}
