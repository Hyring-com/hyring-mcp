#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentTools } from "../tools/assessment/assessment.tools";
import { registerFixedBuildTools } from "../tools/build/fixed.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerInviteTools } from "../tools/candidates/invite.tools";
import { registerCandidatesTools } from "../tools/candidates/candidates.tools";
import { registerAttendedCandidatesTools } from "../tools/candidates/attended.tools";
import { registerOneWayReportTools } from "../tools/reports/one-way.report.tools";

const LABEL = "hyring-mcp-fixed";
const DISPLAY_NAME = "AI Video Interviewer (One-Way)";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Video Interviewer (One-Way) product — create the assessment, add interview questions, configure, publish, invite candidates, list and update candidates, and review reports. In all responses refer to this product as 'AI Video Interviewer (One-Way)'.",
  );

  registerAuthTools(server);
  registerAssessmentTools(server);
  registerFixedBuildTools(server);
  registerSharedBuildTools(server);
  registerInviteTools(server);
  registerCandidatesTools(server);
  registerAttendedCandidatesTools(server);
  registerOneWayReportTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
