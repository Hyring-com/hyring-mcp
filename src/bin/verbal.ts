#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerVerbalBuildTools } from "../tools/build/verbal.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-verbal";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship English Proficiency Tests. Create assessment, set conversation topics, configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerVerbalBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
