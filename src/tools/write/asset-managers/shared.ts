// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatResult(result: Record<string, any>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}
