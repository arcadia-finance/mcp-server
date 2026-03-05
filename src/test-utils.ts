import { vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ChainId, ChainConfig } from "./config/chains.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolHandler = (params: Record<string, any>) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

interface RegisteredTool {
  name: string;
  handler: ToolHandler;
}

export function createMockServer() {
  const tools: RegisteredTool[] = [];

  const server = {
    registerTool: vi.fn(
      (
        name: string,
        _config: { description: string; inputSchema: unknown },
        handler: ToolHandler,
      ) => {
        tools.push({ name, handler });
      },
    ),
  };

  return {
    server: server as unknown as McpServer,
    tools,
    getHandler(name: string): ToolHandler {
      const tool = tools.find((t) => t.name === name);
      if (!tool) throw new Error(`Tool "${name}" not registered`);
      return tool.handler;
    },
  };
}

export function createMockChains(): Record<ChainId, ChainConfig> {
  return {
    8453: {
      name: "base",
      chainId: 8453,
      rpcUrl: "https://mainnet.base.org",
      stateViewer: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
    },
    10: {
      name: "optimism",
      chainId: 10,
      rpcUrl: "https://mainnet.optimism.io",
      stateViewer: null,
    },
    130: {
      name: "unichain",
      chainId: 130,
      rpcUrl: "https://mainnet.unichain.org",
      stateViewer: "0x86e8631A016F9068C3f085fAF484Ee3F5fDee8f2",
    },
  };
}

export function parseToolResponse(result: { content: Array<{ type: string; text: string }> }) {
  return JSON.parse(result.content[0].text);
}

export const TEST_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as `0x${string}`;
export const TEST_ACCOUNT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
export const TEST_SPOT_ACCOUNT = "0x00000000000000000000000000000000000000aa" as `0x${string}`;
export const TEST_POOL = "0x803ea69c7e87D1d6C86adeB40CB636cC0E6B98E2" as `0x${string}`;
export const TEST_CHAIN_ID = 8453;

export function createMockApi(overrides?: Record<string, unknown>) {
  return {
    getAccountOverview: vi.fn(async (_chainId: number, account: string) => {
      if (account.toLowerCase() === TEST_SPOT_ACCOUNT.toLowerCase()) {
        return { creditor: "0x0000000000000000000000000000000000000000", assets: [], ...overrides };
      }
      return {
        creditor: TEST_POOL,
        collateral_value: 1000,
        used_margin: 100,
        assets: [],
        ...overrides,
      };
    }),
  } as Record<string, unknown>;
}
