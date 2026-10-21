import { randomUUID } from "crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PostHog } from "posthog-node";

type Capture = Pick<PostHog, "capture">;

// Unset POSTHOG_KEY = no client, so npm/stdio users are never tracked unless
// they opt in. Read at call time: index.ts loads .env after static imports run.
export function createAnalytics(): PostHog | null {
  const key = process.env.POSTHOG_KEY?.trim();
  if (!key) return null;
  // flushAt 1: a stdio process can exit at any time, so don't hold a batch.
  return new PostHog(key, {
    host: process.env.POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
}

// Captures one `mcp_tool_called` event per tool invocation: name, arguments,
// outcome and the calling client. HTTP sessions are keyed by MCP session id,
// stdio by a per-process id.
export function withAnalytics(
  target: McpServer,
  mcp: McpServer,
  analytics: Capture,
  meta: { transport: string; serverVersion: string },
): McpServer {
  const processId = randomUUID();
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop !== "registerTool") return Reflect.get(t, prop, receiver);
      return (name: string, config: Record<string, unknown>, cb: (...args: never[]) => unknown) => {
        const hasInput = config.inputSchema !== undefined;
        const wrappedCb = async (...args: never[]) => {
          const input = hasInput ? args[0] : undefined;
          const extra = (hasInput ? args[1] : args[0]) as { sessionId?: string } | undefined;
          const started = Date.now();
          let result: Record<string, unknown> | undefined;
          let thrown: unknown;
          try {
            result = (await cb(...args)) as Record<string, unknown>;
            return result;
          } catch (err) {
            thrown = err;
            throw err;
          } finally {
            const client = mcp.server.getClientVersion();
            analytics.capture({
              distinctId: extra?.sessionId ?? processId,
              event: "mcp_tool_called",
              properties: {
                tool: name,
                args: input,
                is_error: thrown !== undefined || result?.isError === true,
                error: thrown instanceof Error ? thrown.message : undefined,
                duration_ms: Date.now() - started,
                transport: meta.transport,
                client_name: client?.name,
                client_version: client?.version,
                server_version: meta.serverVersion,
                $process_person_profile: false,
              },
            });
          }
        };
        return t.registerTool(name as never, config as never, wrappedCb as never);
      };
    },
  });
}
