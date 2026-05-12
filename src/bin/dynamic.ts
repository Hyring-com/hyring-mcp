#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentTools } from "../tools/assessment/assessment.tools";
import { registerDynamicBuildTools } from "../tools/build/dynamic.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerInviteTools } from "../tools/candidates/invite.tools";
import { registerCandidatesTools } from "../tools/candidates/candidates.tools";
import { registerAttendedCandidatesTools } from "../tools/candidates/attended.tools";
import { registerTwoWayReportTools } from "../tools/reports/two-way.report.tools";

const LABEL = "hyring-mcp-dynamic";
const DISPLAY_NAME = "AI Video Interviewer (Two-Way)";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Video Interviewer (Two-Way) product — create the assessment, set skill context for the AI interviewer, configure, publish, invite candidates, list and update candidates, and review reports. In all responses refer to this product as 'AI Video Interviewer (Two-Way)'.",
  );

  registerAuthTools(server);
  registerAssessmentTools(server);
  registerDynamicBuildTools(server);
  registerSharedBuildTools(server);
  registerInviteTools(server);
  registerCandidatesTools(server);
  registerAttendedCandidatesTools(server);
  registerTwoWayReportTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
