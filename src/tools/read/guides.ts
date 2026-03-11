import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GuideOutput } from "../output-schemas.js";

const TOPICS = {
  overview: {
    file: "SKILL.md",
    summary:
      "Tool catalog, token/contract/lending pool addresses, asset manager addresses, account versions",
  },
  automation: {
    file: "automation.md",
    summary:
      "Rebalancer, compounder, yield claimer, merkl operator, CoW swapper setup and addresses",
  },
  strategies: {
    file: "strategies.md",
    summary:
      "Step-by-step strategy templates: delta neutral leveraged LP, protocol owned liquidity, closing sequences",
  },
  selection: {
    file: "selection.md",
    summary:
      "Strategy evaluation framework: pool selection, range width, leverage sizing, automation combos, exit signals",
  },
} as const;

type Topic = keyof typeof TOPICS;
const TOPIC_KEYS = Object.keys(TOPICS) as [Topic, ...Topic[]];

export function registerGuideTools(server: McpServer) {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const skillsDir = resolve(thisDir, "..", "..", "..", "skills", "clamm-liquidity");

  const guides = new Map<string, string>();
  for (const [topic, { file }] of Object.entries(TOPICS)) {
    try {
      guides.set(topic, readFileSync(resolve(skillsDir, file), "utf-8"));
    } catch {
      guides.set(topic, `Guide "${topic}" is not available in this installation.`);
    }
  }

  server.registerTool(
    "read.guides",
    {
      annotations: {
        title: "Get Guide",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      description:
        "Get Arcadia workflow guides and reference documentation. Call this before multi-step workflows (opening LP positions, enabling automation, closing positions) or when you need contract addresses, asset manager addresses, or strategy parameters. Topics: overview (addresses + tool catalog), automation (rebalancer/compounder setup), strategies (step-by-step templates), selection (how to evaluate and parameterize strategies).",
      inputSchema: {
        topic: z
          .enum(TOPIC_KEYS)
          .optional()
          .describe(
            "overview = addresses + tool catalog, automation = rebalancer/compounder/claimer setup, strategies = step-by-step LP templates, selection = pool evaluation + leverage sizing",
          ),
      },
      outputSchema: GuideOutput,
    },
    async ({ topic }) => {
      if (!topic) {
        const topicList = Object.entries(TOPICS)
          .map(([key, { summary }]) => `  ${key}: ${summary}`)
          .join("\n");
        const result = {
          topic: "",
          content: `topic is required. Valid topics:\n${topicList}`,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
          isError: true,
        };
      }
      const result = { topic, content: guides.get(topic)! };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    },
  );
}
