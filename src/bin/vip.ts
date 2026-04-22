#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerVipBuildTools } from "../tools/build/vip.tools";

const LABEL = "hyring-mcp-vip";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build VIP Live Interview roles. Create and publish job roles for live human interviews.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerVipBuildTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
