#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerResumeBuildTools } from "../tools/build/resume.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";
import { registerResumeViewTools } from "../tools/resume.view.tools";

const LABEL = "hyring-mcp-resume";
const DISPLAY_NAME = "AI Resume Screener";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Resume Screener product — create the assessment, set screening criteria, configure, publish, and invite candidates. In all responses refer to this product as 'AI Resume Screener'.",
  );

  registerAuthTools(server);
  registerResumeViewTools(server);
  registerResumeBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
