#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerVipBuildTools } from "../tools/build/vip.tools";
import { registerVipViewTools } from "../tools/vip.view.tools";

const LABEL = "hyring-mcp-vip";

async function main() {
  const server = createServer(
    LABEL,
    "Hyring MCP — build VIP Live Interview roles. Create and publish job roles for live human interviews.",
  );

  registerAuthTools(server);
  registerVipViewTools(server);
  registerVipBuildTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
