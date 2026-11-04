# Mailmaan MCP server

Email infrastructure tools for AI coding agents, over stdio.

## Tools

| Tool | Purpose |
| ---- | ------- |
| `connection_check` | Verify API reachability + key authentication |
| `list_templates` | Published templates with required variables |
| `generate_template` | AI-draft a template from a brief (saved as draft, needs `templates` scope) |
| `send_test_email` | Send via a template |
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
test emails, `events` for event tracking, and `templates` for draft
generation (`templates` alone cannot read). Keep it server-side.

## Machine proof

`scripts/proof.mjs` drives the built server with a real MCP client over
stdio and calls six of the seven tools against the live API (it sends two real
test emails — manual script, never part of automated suites).
`generate_template` is covered by the SDK test suite instead:

```bash
MAILMAAN_API_KEY=mk_live_... MAILMAAN_API_URL=https://mailmaan-regen.vercel.app node ./scripts/proof.mjs
```
