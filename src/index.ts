import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAuthTools } from "./tools/auth.tools";
import { registerAssessmentViewTools } from "./tools/assessment.view.tools";
import { registerAssessmentBuildTools } from "./tools/assessment.build.tools";
import { registerCandidateManageTools } from "./tools/candidate.manage.tools";
import { registerCandidateResultsTools } from "./tools/candidate.results.tools";

async function main() {
  const server = new McpServer({
    name: "hyring-mcp",
    version: "1.0.0",
    description: "MCP server for Hyring AI Screener — manage assessments, candidates, and invites",
  });

  registerAuthTools(server);

  // Assessment — view (list, get, stats)
  registerAssessmentViewTools(server);

  // Assessment — build (create, questions, context, configure, publish)
  registerAssessmentBuildTools(server);

  // Candidates — manage (list, invite, bulk invite, hiring stage, reminder)
  registerCandidateManageTools(server);

  // Candidates — results (result details, AI report)
  registerCandidateResultsTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr only (stdout is reserved for MCP protocol)
  process.stderr.write("[hyring-mcp] Server started on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`[hyring-mcp] Fatal error: ${err}\n`);
  process.exit(1);
});
