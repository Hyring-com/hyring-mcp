#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerDynamicBuildTools } from "../tools/build/dynamic.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-dynamic";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship Two-Way AI interviews. Create assessment, set skill context, configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerDynamicBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
