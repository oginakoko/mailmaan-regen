import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MailmaanClient } from "mailmaan-sdk";
import { createMailmaanServer } from "./server.js";

/** stdio entrypoint. Configuration comes from the environment only. */
const client = new MailmaanClient({
  apiKey: process.env.MAILMAAN_API_KEY ?? "",
  baseUrl: process.env.MAILMAAN_API_URL,
});

const server = createMailmaanServer(client);
const transport = new StdioServerTransport();
await server.connect(transport);
