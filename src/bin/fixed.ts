#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerFixedBuildTools } from "../tools/build/fixed.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-fixed";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship One-Way (Fixed) interviews. Create assessment, add questions, configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerFixedBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
