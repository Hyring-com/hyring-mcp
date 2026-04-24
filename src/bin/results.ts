#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerCandidateReviewTools } from "../tools/candidate.review.tools";
import { registerCandidateResultsTools } from "../tools/candidate.results.tools";
import { registerPhoneViewTools } from "../tools/phone.view.tools";
import { registerResumeViewTools } from "../tools/resume.view.tools";
import { registerVipViewTools } from "../tools/vip.view.tools";

const LABEL = "hyring-mcp-results";
const DISPLAY_NAME = "Hyring Results";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP — review candidate results across all Hyring products. Supports reports for: AI Video Interviewer (One-Way), AI Video Interviewer (Two-Way), AI Coding Interviewer, English Proficiency Test, AI Phone Screener, AI Resume Screener, and Virtual Interview Platform. Always refer to products by these product-page names in responses.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerCandidateReviewTools(server);
  registerCandidateResultsTools(server);
  registerPhoneViewTools(server);
  registerResumeViewTools(server);
  registerVipViewTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
