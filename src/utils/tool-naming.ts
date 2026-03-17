import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const TOOL_NAME_RE = /\b(read|write|dev)\.[a-z_]+(?:\.[a-z_]+)*/g;

export function convertToolNames(text: string): string {
  return text.replace(TOOL_NAME_RE, (match) => match.replace(/\./g, "_"));
}

function deepConvertToolNames(value: unknown): unknown {
  if (typeof value === "string") return convertToolNames(value);
  if (Array.isArray(value)) return value.map(deepConvertToolNames);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepConvertToolNames(v);
    }
    return result;
  }
  return value;
}

export function wrapServerForHttp(server: McpServer): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop === "registerTool") {
        return (
          name: string,
          config: Record<string, unknown>,
          cb: (...args: never[]) => unknown,
        ) => {
          const newName = convertToolNames(name);
          const newConfig = { ...config };
          if (typeof newConfig.description === "string") {
            newConfig.description = convertToolNames(newConfig.description);
          }
          const wrappedCb = async (...args: never[]) => {
            const result = (await cb(...args)) as Record<string, unknown>;
            const content = result.content as Array<Record<string, unknown>> | undefined;
            const structuredContent = result.structuredContent;
            return {
              ...result,
              ...(content && {
                content: content.map((c) => ({
                  ...c,
                  ...(typeof c.text === "string" && { text: convertToolNames(c.text) }),
                })),
              }),
              ...(structuredContent !== undefined && {
                structuredContent: deepConvertToolNames(structuredContent),
              }),
            };
          };
          return target.registerTool(newName as never, newConfig as never, wrappedCb as never);
        };
      }

      if (prop === "registerResource") {
        return (
          name: string,
          uriOrTemplate: unknown,
          config: unknown,
          readCallback: (...args: never[]) => unknown,
        ) => {
          const wrappedCallback = async (...args: never[]) => {
            const result = (await readCallback(...args)) as Record<string, unknown>;
            const contents = result.contents as Array<Record<string, unknown>> | undefined;
            return {
              ...result,
              ...(contents && {
                contents: contents.map((c) => ({
                  ...c,
                  ...(typeof c.text === "string" && { text: convertToolNames(c.text) }),
                })),
              }),
            };
          };
          return target.registerResource(
            name as never,
            uriOrTemplate as never,
            config as never,
            wrappedCallback as never,
          );
        };
      }

      if (prop === "registerPrompt") {
        return (name: string, config: unknown, cb: (...args: never[]) => unknown) => {
          const wrappedCb = async (...args: never[]) => {
            const result = (await cb(...args)) as Record<string, unknown>;
            const messages = result.messages as Array<Record<string, unknown>> | undefined;
            return {
              ...result,
              ...(messages && {
                messages: messages.map((m) => {
                  const content = m.content as Record<string, unknown> | undefined;
                  if (content && typeof content.text === "string") {
                    return { ...m, content: { ...content, text: convertToolNames(content.text) } };
                  }
                  return m;
                }),
              }),
            };
          };
          return target.registerPrompt(name as never, config as never, wrappedCb as never);
        };
      }

      return Reflect.get(target, prop, receiver);
    },
  });
}
