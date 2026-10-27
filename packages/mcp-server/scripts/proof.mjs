// Machine proof: drives the BUILT MCP server over stdio with a real MCP
// client and calls all six tools against the live API. Manual script —
// NOT part of the vitest suite (send/track dispatch real emails).
// Requires MAILMAAN_API_KEY (read+send+events) and MAILMAAN_API_URL.
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const transport = new StdioClientTransport({
  command: "node",
  args: [serverPath],
  env: { ...process.env },
});
const client = new Client({ name: "mailmaan-proof", version: "0.1.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(","));

const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.[0]?.text ?? "";
  console.log(`--- ${name} ${JSON.stringify(args)} ---`);
  console.log(text.slice(0, 800));
  if (result.isError) {
    console.error(`TOOL_ERROR: ${name}`);
    process.exitCode = 1;
  }
  return text;
};

await call("connection_check", {});
await call("list_templates", {});
await call("send_test_email", {
  to: "philipstar98@gmail.com",
  template: "welcome",
  variables: { firstName: "MCP", product: "Soko" },
  idempotencyKey: "mcp-proof-1",
});
await call("track_event", {
  id: "mcp-proof-event-1",
  name: "user.signed_up",
  data: { email: "philipstar98@gmail.com", firstName: "MCP" },
});
await call("get_message", { id: "f0ea75d5-6eaf-4b8d-80bf-8ab228d73127" });
await call("diagnose_message", { id: "8c70f41b-256a-4358-b635-e82a4b997ee8" });

await client.close();
console.log("PROOF_DONE");
