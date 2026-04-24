#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerDynamicBuildTools } from "../tools/build/dynamic.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-dynamic";
const DISPLAY_NAME = "AI Video Interviewer (Two-Way)";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Video Interviewer (Two-Way) product — create the assessment, set skill context for the AI interviewer, configure, publish, and invite candidates. In all responses refer to this product as 'AI Video Interviewer (Two-Way)'.",
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
