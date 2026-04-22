#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerPhoneBuildTools } from "../tools/build/phone.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";
import { registerPhoneViewTools } from "../tools/phone.view.tools";

const LABEL = "hyring-mcp-phone";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build and ship AI Phone Screener assessments. Create assessment, add screening questions (YES/NO, Rating, Numeric), configure, publish, invite candidates.",
  );

  registerAuthTools(server);
  registerPhoneViewTools(server);
  registerPhoneBuildTools(server);
  registerSharedBuildTools(server);
  registerCandidateInviteTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
