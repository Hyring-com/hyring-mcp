#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerCodingBuildTools } from "../tools/build/coding.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-coding";
const DISPLAY_NAME = "AI Coding Interviewer";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Coding Interviewer product — create the assessment, set language, add coding problems, configure, publish, and invite candidates. In all responses refer to this product as 'AI Coding Interviewer'.",
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
