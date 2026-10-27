// Agent session: discover the integration surface through MCP tools only
// (no direct API calls, no database access), then print what the agent
// learned for the soko-store update.
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const transport = new StdioClientTransport({ command: "node", args: [serverPath], env: { ...process.env } });
const client = new Client({ name: "mailmaan-agent-session", version: "0.1.0" });
await client.connect(transport);

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  return result.content?.[0]?.text ?? "";
};

const templates = JSON.parse(await call("list_templates", {}));
const welcome = templates.templates.find((t) => t.slug === "welcome");
console.log("LEARNED welcome template:", JSON.stringify(welcome));

const diagnosis = JSON.parse(
  await call("diagnose_message", { id: "f0ea75d5-6eaf-4b8d-80bf-8ab228d73127" }),
);
console.log("LEARNED accepted shape:", diagnosis.summary);

await client.close();
console.log("AGENT_SESSION_DONE");
