#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerResumeBuildTools } from "../tools/build/resume.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-resume";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship AI Resume Screener assessments. Create assessment, set screening criteria, configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerResumeBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
