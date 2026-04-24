#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerPhoneBuildTools } from "../tools/build/phone.tools";
import { registerSharedBuildTools } from "../tools/build/shared.tools";
import { registerCandidateInviteTools } from "../tools/candidate.invite.tools";
import { registerPhoneViewTools } from "../tools/phone.view.tools";

const LABEL = "hyring-mcp-phone";
const DISPLAY_NAME = "AI Phone Screener";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the AI Phone Screener product — create the assessment, add screening questions (YES/NO, Rating, Numeric), configure, publish, and invite candidates. In all responses refer to this product as 'AI Phone Screener'.",
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
