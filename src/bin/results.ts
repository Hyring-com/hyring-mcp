#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentTools } from "../tools/assessment/assessment.tools";
import { registerCandidatesTools } from "../tools/candidates/candidates.tools";
import { registerAttendedCandidatesTools } from "../tools/candidates/attended.tools";
import { registerOneWayReportTools } from "../tools/reports/one-way.report.tools";
import { registerTwoWayReportTools } from "../tools/reports/two-way.report.tools";
import { registerCodingReportTools } from "../tools/reports/coding.report.tools";
import { registerEptReportTools } from "../tools/reports/ept.report.tools";
import { registerPhoneTools } from "../tools/phone-screener/phone.tools";
import { registerResumeTools } from "../tools/resume-screener/resume.tools";
import { registerVipTools } from "../tools/vip/vip.tools";

const LABEL = "hyring-mcp-results";
const DISPLAY_NAME = "Hyring Results";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP — review candidate results across all Hyring products. Supports reports for: AI Video Interviewer (One-Way), AI Video Interviewer (Two-Way), AI Coding Interviewer, English Proficiency Test, AI Phone Screener, AI Resume Screener, and Virtual Interview Platform. Always refer to products by these product-page names in responses.",
  );

  registerAuthTools(server);
  registerAssessmentTools(server);
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
