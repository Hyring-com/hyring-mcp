<p align="center">
  <img src="https://raw.githubusercontent.com/Hyring-com/hyring-mcp/main/icon.png" alt="Hyring" width="128" height="128" />
</p>

<h1 align="center">Hyring MCP</h1>

<p align="center">
  <strong>Run your entire hiring funnel from a chat with Claude.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/hyring-mcp"><img src="https://img.shields.io/npm/v/hyring-mcp.svg" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
</p>

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude full access to the [Hyring](https://hyring.com) AI hiring platform. Build assessments, invite candidates, and review reports — all from a chat with Claude.

## What you can do

Hyring MCP exposes Hyring's full hiring suite as MCP tools. Once connected, you can ask Claude things like:

- "List my active assessments."
- "Show me the top candidates for the Senior Backend role."
- "Invite jane@acme.com to the React assessment."
- "Pull the report for the candidate who scored highest yesterday."
- "Move candidate #3 to Shortlisted."

Supported Hyring products:

| Product | What it does |
|---|---|
| AI Video Interviewer (One-Way) | Async video questions with AI scoring |
| AI Video Interviewer (Two-Way) | Conversational AI interviewer |
| AI Coding Interviewer | Live coding rounds with AI evaluation |
| English Proficiency Test (EPT) | CEFR-graded English assessment |
| AI Phone Screener | Outbound AI phone interviews |
| AI Resume Screener | AI-graded resume matching |
| Virtual Interview Platform (VIP) | Human + AI live interview rounds |

## Install & connect

Hyring MCP runs via `npx` — no manual install needed.

### Claude Desktop

Open `claude_desktop_config.json` ([how to find it](https://modelcontextprotocol.io/quickstart/user)) and add:

```json
{
  "mcpServers": {
    "hyring": {
      "command": "npx",
      "args": ["-y", "hyring-mcp"]
    }
  }
}
```

Restart Claude Desktop. You'll see a "hyring" entry under available tools.

### Claude Code

```bash
claude mcp add hyring -- npx -y hyring-mcp
```

### Cursor, Windsurf, and other MCP clients

Add an `mcpServers` entry pointing to `npx -y hyring-mcp`.

## Sign in

The first time Claude calls a Hyring tool, it'll prompt you to sign in:

1. Claude asks for your Hyring employer email.
2. You receive a one-time code in your inbox.
3. Share the code with Claude.
4. Done — Claude is signed in. The session is saved at `~/.hyring/credentials.json` (mode `600`).

Sign out anytime by asking Claude to "log me out of Hyring."

## Product-specific entry points

If you only use one Hyring product, you can run a slimmer server with just those tools. Replace `hyring-mcp` in the config above with one of:

| Command | Product |
|---|---|
| `hyring-mcp` | All products (default) |
| `hyring-mcp-fixed` | AI Video Interviewer (One-Way) |
| `hyring-mcp-dynamic` | AI Video Interviewer (Two-Way) |
| `hyring-mcp-coding` | AI Coding Interviewer |
| `hyring-mcp-verbal` | English Proficiency Test |
| `hyring-mcp-phone` | AI Phone Screener |
| `hyring-mcp-resume` | AI Resume Screener |
| `hyring-mcp-vip` | Virtual Interview Platform |
| `hyring-mcp-results` | All reports/results, no build tools |

Example for phone-only — note the `-p hyring-mcp` flag tells `npx` to install the `hyring-mcp` package and run the named binary inside it:

```json
{
  "mcpServers": {
    "hyring": {
      "command": "npx",
      "args": ["-y", "-p", "hyring-mcp", "hyring-mcp-phone"]
    }
  }
}
```

## What's exposed

Across all products, Hyring MCP provides tools for:

- **Auth** — `request_otp`, `verify_otp`, `whoami`, `logout`, `token_status`
- **Assessments** — list, view, get stats, build new ones, publish
- **Candidates** — list by status, invite (single or bulk), send reminders, update hiring stage
- **Reports** — full candidate reports with scores, transcripts, AI summaries, and media links for every product

Tool names follow `<verb>_<noun>` (e.g., `list_candidates`, `get_coding_report`, `update_hiring_stage`). Claude picks the right tool based on your request — you don't need to memorize them.

## Requirements

- Node.js **18+**
- A Hyring employer account ([sign up](https://hyring.com))

## Security

- Credentials are stored locally at `~/.hyring/credentials.json` with `chmod 600`.
- Tokens are JWTs scoped to your employer account. Expired sessions prompt re-authentication.
- All API calls go over HTTPS to `*.hyring.com`.
- No telemetry, no analytics, no data leaves your machine except direct calls to the Hyring API.

## Support

- Issues: [github.com/Hyring-com/hyring-mcp/issues](https://github.com/Hyring-com/hyring-mcp/issues)
- Hyring product: [hyring.com](https://hyring.com)
- MCP docs: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## Privacy

This MCP server is a client to the [Hyring](https://hyring.com) platform. The same data and privacy practices apply.

Read the full policy: **[hyring.com/privacy-policy](https://hyring.com/privacy-policy)**.

The MCP server itself stores nothing beyond a JWT session token at `~/.hyring/credentials.json` (mode `600`) on the user's machine. No telemetry, no analytics — see the [Security](#security) section above.

## License

MIT — see [LICENSE](./LICENSE).
