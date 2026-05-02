#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentTools } from "../tools/assessment/assessment.tools";
import { registerFixedBuildTools } from "../tools/build/fixed.tools";
import { registerDynamicBuildTools } from "../tools/build/dynamic.tools";
import { registerCodingBuildTools } from "../tools/build/coding.tools";
import { registerVerbalBuildTools } from "../tools/build/verbal.tools";
import { registerPhoneBuildTools } from "../tools/build/phone.tools";
import { registerResumeBuildTools } from "../tools/build/resume.tools";
import { registerVipBuildTools } from "../tools/build/vip.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerInviteTools } from "../tools/candidates/invite.tools";
import { registerCandidatesTools } from "../tools/candidates/candidates.tools";
import { registerAttendedCandidatesTools } from "../tools/candidates/attended.tools";
import { registerOneWayReportTools } from "../tools/reports/one-way.report.tools";
import { registerTwoWayReportTools } from "../tools/reports/two-way.report.tools";
import { registerCodingReportTools } from "../tools/reports/coding.report.tools";
import { registerEptReportTools } from "../tools/reports/ept.report.tools";
import { registerPhoneTools } from "../tools/phone-screener/phone.tools";
import { registerResumeTools } from "../tools/resume-screener/resume.tools";
import { registerVipTools } from "../tools/vip/vip.tools";

const LABEL = "hyring-mcp";
const DISPLAY_NAME = "Hyring";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring — full MCP server across the entire product suite: AI Video Interviewer (One-Way), AI Video Interviewer (Two-Way), AI Coding Interviewer, English Proficiency Test, AI Phone Screener, AI Resume Screener, and Virtual Interview Platform. Build assessments, invite candidates, and review results. Always refer to products by these product-page names in responses.",
  );

  registerAuthTools(server);
  registerAssessmentTools(server);

  registerFixedBuildTools(server);
  registerDynamicBuildTools(server);
  registerCodingBuildTools(server);
  registerVerbalBuildTools(server);
  registerPhoneBuildTools(server);
  registerResumeBuildTools(server);
  registerVipBuildTools(server);
  registerSharedBuildTools(server);

  registerInviteTools(server);
  registerCandidatesTools(server);
  registerAttendedCandidatesTools(server);
  registerOneWayReportTools(server);
  registerTwoWayReportTools(server);
  registerCodingReportTools(server);
  registerEptReportTools(server);
  registerPhoneTools(server);
  registerResumeTools(server);
  registerVipTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
