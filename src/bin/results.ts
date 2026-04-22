#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerCandidateReviewTools } from "../tools/candidate.review.tools";
import { registerCandidateResultsTools } from "../tools/candidate.results.tools";

const LABEL = "hyring-mcp-results";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — review candidate interview results. List attended candidates, get full reports (fixed/dynamic/coding/verbal), update hiring stage, send reminders.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);
  registerCandidateReviewTools(server);
  registerCandidateResultsTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
