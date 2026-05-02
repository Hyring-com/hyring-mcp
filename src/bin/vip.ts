#!/usr/bin/env node
import { createServer, startStdio } from "../server";
import { registerAuthTools } from "../tools/auth.tools";
import { registerVipBuildTools } from "../tools/build/vip.tools";
import { registerVipTools } from "../tools/vip/vip.tools";

const LABEL = "hyring-mcp-vip";
const DISPLAY_NAME = "Virtual Interview Platform";

async function main() {
  const server = createServer(
    DISPLAY_NAME,
    "Hyring MCP for the Virtual Interview Platform product — create and publish job roles for live human interviews powered by an AI copilot. In all responses refer to this product as 'Virtual Interview Platform'.",
  );

  registerAuthTools(server);
  registerVipTools(server);
  registerVipBuildTools(server);

  await startStdio(server, LABEL);
}

main().catch((err) => {
  process.stderr.write(`[${LABEL}] Fatal error: ${err}\n`);
  process.exit(1);
});
