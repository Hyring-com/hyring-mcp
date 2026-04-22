#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerCodingBuildTools } from "../tools/build/coding.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-coding";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship Coding interviews. Create assessment, set language, add coding problems, configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerCodingBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
