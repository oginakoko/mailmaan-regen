# Mailmaan MCP server

Email infrastructure tools for AI coding agents, over stdio.

## Tools

| Tool | Purpose |
| ---- | ------- |
| `connection_check` | Verify API reachability + key authentication |
| `list_templates` | Published templates with required variables |
| `send_test_email` | Send via a template (test allowlist enforced server-side) |
| `track_event` | Ingest an app event; workflows send |
| `get_message` | Message + sanitized timeline |
| `diagnose_message` | Evidence-based diagnosis: timeline walk, error, likely cause, next checks |

## Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

Configure your agent (Claude Code, Cursor, and others read `.mcp.json`
from the repo root):

```json
{
  "mcpServers": {
    "mailmaan": {
      "command": "node",
      "args": ["packages/mcp-server/dist/index.js"],
      "env": {
        "MAILMAAN_API_URL": "https://mailmaan-regen.vercel.app",
        "MAILMAAN_API_KEY": "mk_live_..."
      }
    }
  }
}
```

The key needs `read` for checks/lists/reads/diagnosis, plus `send` for
test emails and `events` for event tracking. Keep it server-side.

## Machine proof

`scripts/proof.mjs` drives the built server with a real MCP client over
stdio and calls all six tools against the live API (it sends two real
test emails — manual script, never part of automated suites):

```bash
MAILMAAN_API_KEY=mk_live_... MAILMAAN_API_URL=https://mailmaan-regen.vercel.app node ./scripts/proof.mjs
```
