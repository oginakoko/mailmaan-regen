import { MailmaanClient } from "mailmaan-sdk";
import { SokoStore } from "./store";

/**
 * Live demo: signup + checkout through the real Mailmaan API.
 * Requires MAILMAAN_API_KEY (events+send scopes) and MAILMAAN_API_URL.
 * Sends real emails to the event addresses — use the test inbox.
 */
const store = new SokoStore(
  new MailmaanClient({ apiKey: process.env.MAILMAAN_API_KEY ?? "", baseUrl: process.env.MAILMAAN_API_URL }),
);

const email = process.argv[2] ?? "philipstar98@gmail.com";
const stamp = Date.now();

const signup = await store.signup({ userId: `demo-${stamp}`, email, firstName: "Demo" });
console.log("signup:", signup.id, signup.dispatch_status, signup.runs.map((r) => `${r.status}:${r.message_id ?? "-"}`).join(","));

const order = await store.checkout({
  orderId: `DEMO-${stamp}`,
  customerEmail: email,
  total: "19.99",
  currency: "USD",
});
console.log("checkout:", order.id, order.dispatch_status, order.runs.map((r) => `${r.status}:${r.message_id ?? "-"}`).join(","));
