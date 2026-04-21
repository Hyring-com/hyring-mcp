import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthTools } from "./tools/auth.tools";
import { registerAssessmentTools } from "./tools/assessment.tools";
import { registerCandidateTools } from "./tools/candidate.tools";

async function main() {
  const server = new McpServer({
    name: "hyring-mcp",
    version: "1.0.0",
    description: "MCP server for Hyring AI Screener — manage assessments, candidates, and invites",
  });

  registerAuthTools(server);
  registerAssessmentTools(server);
  registerCandidateTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only (stdout is reserved for MCP protocol)
  process.stderr.write("[hyring-mcp] Server started on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[hyring-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
