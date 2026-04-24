#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerVerbalBuildTools } from "../tools/build/verbal.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";

const LABEL = "hyring-mcp-verbal";
const DISPLAY_NAME = "English Proficiency Test";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the English Proficiency Test product — create the assessment, set conversation topics, configure, publish, and invite candidates. In all responses refer to this product as 'English Proficiency Test'.",
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
