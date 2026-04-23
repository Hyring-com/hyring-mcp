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

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — review candidate results across all products. Supports One-Way, Two-Way, Coding, Verbal, Phone Screener, Resume Screener, and VIP Live Interview reports.",
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
