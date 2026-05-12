#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentTools } from "../tools/assessment/assessment.tools";
import { registerVerbalBuildTools } from "../tools/build/verbal.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerInviteTools } from "../tools/candidates/invite.tools";
import { registerCandidatesTools } from "../tools/candidates/candidates.tools";
import { registerAttendedCandidatesTools } from "../tools/candidates/attended.tools";
import { registerEptReportTools } from "../tools/reports/ept.report.tools";

const LABEL = "hyring-mcp-verbal";
const DISPLAY_NAME = "English Proficiency Test";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the English Proficiency Test product — create the assessment, set conversation topics, configure, publish, invite candidates, list candidates, and review CEFR reports. In all responses refer to this product as 'English Proficiency Test'.",
  );

  registerAuthTools(server);
  registerAssessmentTools(server);
  registerVerbalBuildTools(server);
  registerSharedBuildTools(server);
  registerInviteTools(server);
  registerCandidatesTools(server);
  registerAttendedCandidatesTools(server);
  registerEptReportTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
