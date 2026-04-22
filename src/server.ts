import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireAuth } from "./api/screener.client";

export const TONE_INSTRUCTIONS = `
When presenting results from hyring-mcp tools to the user, follow this style:

- Friendly, concise, action-oriented. Confirm what happened, then ask what's next in one short line.
- Lead success messages with a single fitting emoji: 🎉 for milestones (assessment published, campaign launched), ✅ for completed actions (invite sent, stage updated), ⚠️ for warnings, ❌ for errors. One emoji per message unless listing multiple results.
- Return structured facts as a fenced JSON block instead of bullets. Include all relevant fields (ids, counts, settings, durations) with their original keys.
- Keep UUIDs and IDs verbatim. Never truncate or abbreviate them.
- After a successful action, offer the most logical next step as a single question ("Ready to invite candidates, or anything else?"). Don't present menus.
- For errors, state the problem plainly in one sentence and propose the fix. Don't apologize at length or repeat the raw error.
- Never dump raw JSON, payloads, or tool arguments. Translate into human-readable summaries.
- Use plain words over jargon: "published" not "persisted", "invite sent" not "dispatched payload", "live" not "activated".
- Keep the overall response short — a header line, 3–6 bullets, and a one-line follow-up question is the target shape.
`.trim();

export function createServer(name: string, description: string): McpServer {
  return new McpServer(
    {
      name,
      version: "1.0.0",
      description,
    },
    {
      instructions: TONE_INSTRUCTIONS,
    },
  );
}

/**
 * Registers a tool that refuses to run unless the employer is authenticated.
 * Use this for every tool except the auth tools themselves (request_otp, verify_otp, etc).
 *
 * The auth failure message is returned verbatim (no "Error:" prefix) so the AI
 * can act on the instruction — "Ask the user for their email, then call request_otp".
 */
export function authedTool(
  server: McpServer,
  name: string,
  description: string,
  schema: any,
  handler: (args: any, extra: any) => Promise<any>,
): void {
  server.tool(name, description, schema, async (args: any, extra: any) => {
    try {
      requireAuth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text" as const, text: msg }] };
    }
    return handler(args, extra);
  });
}

export async function startStdio(server: McpServer, label: string): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[${label}] Server started on stdio\n`);
}
