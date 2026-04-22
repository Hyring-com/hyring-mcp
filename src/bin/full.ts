#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerAssessmentViewTools } from "../tools/assessment.view.tools";
import { registerFixedBuildTools } from "../tools/build/fixed.tools";
import { registerDynamicBuildTools } from "../tools/build/dynamic.tools";
import { registerCodingBuildTools } from "../tools/build/coding.tools";
import { registerVerbalBuildTools } from "../tools/build/verbal.tools";
import { registerPhoneBuildTools } from "../tools/build/phone.tools";
import { registerResumeBuildTools } from "../tools/build/resume.tools";
import { registerVipBuildTools } from "../tools/build/vip.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";
import { registerCandidateReviewTools } from "../tools/candidate.review.tools";
import { registerCandidateResultsTools } from "../tools/candidate.results.tools";
import { registerPhoneViewTools } from "../tools/phone.view.tools";
import { registerResumeViewTools } from "../tools/resume.view.tools";
import { registerVipViewTools } from "../tools/vip.view.tools";

const LABEL = "hyring-mcp";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring AI Screener — full MCP server. Build any interview type, invite candidates, review results.",
  );

  registerAuthTools(server);
  registerAssessmentViewTools(server);

  registerFixedBuildTools(server);
  registerDynamicBuildTools(server);
  registerCodingBuildTools(server);
  registerVerbalBuildTools(server);
  registerPhoneBuildTools(server);
  registerResumeBuildTools(server);
  registerVipBuildTools(server);
  registerSharedBuildTools(server);

  registerCandidateInviteTools(server);
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
